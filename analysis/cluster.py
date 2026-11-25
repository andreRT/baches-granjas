"""DBSCAN geográfico. Solo recibe coordenadas e identificadores, sin contactos."""
import json as formato_json
import math as matematicas
import sys as sistema
from collections import deque as Cola

RADIO_TERRESTRE_METROS = 6_371_008.8


def distancia_metros(primero, segundo):
    latitud_primera, longitud_primera = map(matematicas.radians, primero)
    latitud_segunda, longitud_segunda = map(matematicas.radians, segundo)
    valor = (matematicas.sin((latitud_segunda - latitud_primera) / 2) ** 2
             + matematicas.cos(latitud_primera) * matematicas.cos(latitud_segunda)
             * matematicas.sin((longitud_segunda - longitud_primera) / 2) ** 2)
    return 2 * RADIO_TERRESTRE_METROS * matematicas.asin(matematicas.sqrt(min(1, max(0, valor))))


def agrupar_dbscan(coordenadas, radio_metros, minimo_puntos):
    """Expande núcleos densos; los puntos de borde no unen dos grupos."""
    cantidad = len(coordenadas)
    radianes = [(matematicas.radians(latitud), matematicas.radians(longitud))
                for latitud, longitud in coordenadas]
    cosenos = [matematicas.cos(posicion[0]) for posicion in radianes]
    umbral = matematicas.sin(radio_metros / RADIO_TERRESTRE_METROS / 2) ** 2
    separacion_maxima = radio_metros / RADIO_TERRESTRE_METROS
    vecindarios = [[indice] for indice in range(cantidad)]
    for primero in range(cantidad):
        for segundo in range(primero + 1, cantidad):
            diferencia_latitud = radianes[segundo][0] - radianes[primero][0]
            if abs(diferencia_latitud) > separacion_maxima:
                continue
            valor = (matematicas.sin(diferencia_latitud / 2) ** 2
                     + cosenos[primero] * cosenos[segundo]
                     * matematicas.sin((radianes[segundo][1] - radianes[primero][1]) / 2) ** 2)
            if valor <= umbral + 1e-18:
                vecindarios[primero].append(segundo)
                vecindarios[segundo].append(primero)
    etiquetas = [-2] * cantidad  # -2: sin visitar; -1: aislado.
    numero_grupo = 0
    for indice in range(cantidad):
        if etiquetas[indice] != -2:
            continue
        if len(vecindarios[indice]) < minimo_puntos:
            etiquetas[indice] = -1
            continue
        etiquetas[indice] = numero_grupo
        pendientes = Cola(vecindarios[indice])
        encolados = set(vecindarios[indice])
        while pendientes:
            vecino = pendientes.popleft()
            if etiquetas[vecino] == -1:
                etiquetas[vecino] = numero_grupo
            if etiquetas[vecino] != -2:
                continue
            etiquetas[vecino] = numero_grupo
            if len(vecindarios[vecino]) >= minimo_puntos:
                for candidato in vecindarios[vecino]:
                    if candidato not in encolados:
                        pendientes.append(candidato)
                        encolados.add(candidato)
        numero_grupo += 1
    return etiquetas


def analizar_puntos(contenido):
    puntos = contenido.get("puntos", [])
    radio_metros = float(contenido.get("radio_metros", 150))
    minimo_original = float(contenido.get("minimo_puntos", 3))
    motor = contenido.get("motor", "python")
    if (not 20 <= radio_metros <= 500 or not minimo_original.is_integer()
            or not 2 <= minimo_original <= 20 or len(puntos) > 2000
            or motor not in ("python", "scikit-learn")):
        raise ValueError("Parámetros fuera del alcance del sistema")
    minimo_puntos = int(minimo_original)
    coordenadas = [(float(punto["latitud"]), float(punto["longitud"])) for punto in puntos]
    if any(not matematicas.isfinite(latitud) or not matematicas.isfinite(longitud)
           or abs(latitud) > 90 or abs(longitud) > 180 for latitud, longitud in coordenadas):
        raise ValueError("Coordenadas inválidas")
    identificadores = [punto["id"] for punto in puntos]
    if len(set(identificadores)) != len(puntos):
        raise ValueError("Identificadores repetidos")
    if not puntos:
        etiquetas = []
    elif motor == "scikit-learn":
        # Opción explícita para entornos que tengan autorizadas estas dependencias.
        import numpy as arreglos
        from sklearn.cluster import DBSCAN as AgrupamientoDBSCAN
        etiquetas = AgrupamientoDBSCAN(eps=radio_metros / RADIO_TERRESTRE_METROS,
                                      min_samples=minimo_puntos, metric="haversine",
                                      algorithm="ball_tree").fit_predict(arreglos.radians(coordenadas)).tolist()
    else:
        etiquetas = agrupar_dbscan(coordenadas, radio_metros, minimo_puntos)
    grupos = []
    for etiqueta in sorted(set(etiquetas) - {-1}):
        indices = [indice for indice, valor in enumerate(etiquetas) if valor == etiqueta]
        centro = [sum(coordenadas[indice][eje] for indice in indices) / len(indices) for eje in (0, 1)]
        grupos.append({"id": int(etiqueta), "cantidad": len(indices),
                       "latitud": centro[0], "longitud": centro[1],
                       "radio_visual_metros": max(60, max(distancia_metros(centro, coordenadas[indice]) for indice in indices) + 30),
                       "ids_reportes": [puntos[indice]["id"] for indice in indices]})
    return {"grupos": grupos, "cantidad_aislados": etiquetas.count(-1),
            "cantidad_puntos": len(puntos), "radio_metros": radio_metros,
            "minimo_puntos": minimo_puntos, "motor": motor}


if __name__ == "__main__":
    print(formato_json.dumps(analizar_puntos(formato_json.load(sistema.stdin)), ensure_ascii=False, allow_nan=False))
