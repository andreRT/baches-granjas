import delimitacion from './geografia/granjas-mexico.json' with { type: 'json' };

const ESTADOS = Object.freeze({
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso de resolución",
  RESUELTO: "Resuelto",
  FINALIZADO: "Finalizado"
});
export { ESTADOS };
const LISTA_ESTADOS = Object.values(ESTADOS);
export { LISTA_ESTADOS };
const NOMBRES_ROLES = {
  ciudadano: "Ciudadano",
  administracion: "Administración",
  ingeniero: "Ingeniería"
};
export { NOMBRES_ROLES };
function puedeConsultarReporte(usuario, reporte) {
  return usuario.rol === "administracion" || usuario.rol === "ciudadano" && reporte.id_ciudadano === usuario.id || usuario.rol === "ingeniero" && reporte.id_ingeniero === usuario.id;
}
export { puedeConsultarReporte };
function transicionPermitida(usuario, reporte, siguiente) {
  return usuario.rol === "administracion" && reporte.estado === ESTADOS.PENDIENTE && siguiente === ESTADOS.EN_PROCESO || usuario.rol === "ingeniero" && reporte.id_ingeniero === usuario.id && reporte.estado === ESTADOS.EN_PROCESO && siguiente === ESTADOS.RESUELTO || usuario.rol === "administracion" && reporte.estado === ESTADOS.RESUELTO && siguiente === ESTADOS.FINALIZADO;
}

export { transicionPermitida };
// Unidades territoriales IECM 06-050 y 06-051. Procedencia y actualización:
// docs/DELIMITACION.md. GeoJSON utiliza el orden [longitud, latitud].
const ZONA_COBERTURA = delimitacion;
export { ZONA_COBERTURA };
const CENTRO_MAPA = [
  (delimitacion.bbox[1] + delimitacion.bbox[3]) / 2,
  (delimitacion.bbox[0] + delimitacion.bbox[2]) / 2
];
export { CENTRO_MAPA };

// Solo absorbe redondeo de coma flotante; no amplía la cobertura en metros.
const TOLERANCIA_NUMERICA = 1e-10;
function clasificarEnContorno(latitud, longitud, contorno) {
  let dentro = false;
  for (let indice = 0, indiceAnterior = contorno.length - 1; indice < contorno.length; indiceAnterior = indice++) {
    const [longitudActual, latitudActual] = contorno[indice],
      [longitudAnterior, latitudAnterior] = contorno[indiceAnterior];
    const diferenciaLongitud = longitudAnterior - longitudActual;
    const diferenciaLatitud = latitudAnterior - latitudActual;
    const longitudSegmento = Math.hypot(diferenciaLongitud, diferenciaLatitud);
    if (longitudSegmento === 0) {
      if (Math.hypot(longitud - longitudActual, latitud - latitudActual) <= TOLERANCIA_NUMERICA) return 0;
      continue;
    }
    const productoCruzado = (longitud - longitudActual) * diferenciaLatitud - (latitud - latitudActual) * diferenciaLongitud;
    if (Math.abs(productoCruzado) <= TOLERANCIA_NUMERICA * longitudSegmento
        && longitud >= Math.min(longitudActual, longitudAnterior) - TOLERANCIA_NUMERICA
        && longitud <= Math.max(longitudActual, longitudAnterior) + TOLERANCIA_NUMERICA
        && latitud >= Math.min(latitudActual, latitudAnterior) - TOLERANCIA_NUMERICA
        && latitud <= Math.max(latitudActual, latitudAnterior) + TOLERANCIA_NUMERICA) return 0;
    if ((latitudActual > latitud) !== (latitudAnterior > latitud)
        && longitud < diferenciaLongitud * (latitud - latitudActual) / diferenciaLatitud + longitudActual) dentro = !dentro;
  }
  return dentro ? 1 : -1;
}

function puntoDentroPoligono(latitud, longitud, contornos) {
  if (!contornos.length) return false;
  const exterior = clasificarEnContorno(latitud, longitud, contornos[0]);
  if (exterior <= 0) return exterior === 0;
  for (const hueco of contornos.slice(1)) {
    const interior = clasificarEnContorno(latitud, longitud, hueco);
    if (interior >= 0) return interior === 0;
  }
  return true;
}

function puntoDentroZona(latitud, longitud, zona = ZONA_COBERTURA) {
  if (!Number.isFinite(latitud) || !Number.isFinite(longitud) || Math.abs(latitud) > 90 || Math.abs(longitud) > 180 || !zona) return false;
  if (zona.type === 'FeatureCollection') return zona.features.some(unidad => puntoDentroZona(latitud, longitud, unidad));
  const geometria = zona.type === 'Feature' ? zona.geometry : zona;
  if (geometria?.type === 'Polygon') return puntoDentroPoligono(latitud, longitud, geometria.coordinates);
  if (geometria?.type === 'MultiPolygon') return geometria.coordinates.some(contornos => puntoDentroPoligono(latitud, longitud, contornos));
  return false;
}
export { puntoDentroZona };

// En la división compartida se asigna la primera unidad (06-050); el punto es válido.
function obtenerUnidadTerritorial(latitud, longitud) {
  return ZONA_COBERTURA.features.find(unidad => puntoDentroZona(latitud, longitud, unidad))?.properties ?? null;
}
export { obtenerUnidadTerritorial };
