import unittest as pruebas_unitarias
from cluster import analizar_puntos


class PruebasAgrupamiento(pruebas_unitarias.TestCase):
    def test_distancias_en_metros_y_puntos_aislados(prueba):
        resultado = analizar_puntos({"radio_metros": 150, "minimo_puntos": 3, "puntos": [
            {"id": "uno", "latitud": 19.4000, "longitud": -99.1000},
            {"id": "dos", "latitud": 19.4001, "longitud": -99.1001},
            {"id": "tres", "latitud": 19.4002, "longitud": -99.1002},
            {"id": "lejano", "latitud": 19.3900, "longitud": -99.1100},
        ]})
        prueba.assertEqual(len(resultado["grupos"]), 1)
        prueba.assertEqual(resultado["grupos"][0]["cantidad"], 3)
        prueba.assertEqual(resultado["cantidad_aislados"], 1)

    def test_seleccion_vacia(prueba):
        prueba.assertEqual(analizar_puntos({"puntos": []})["grupos"], [])

    def test_radio_invalido(prueba):
        with prueba.assertRaises(ValueError):
            analizar_puntos({"puntos": [], "radio_metros": 10000})

    def test_borde_aislado_inicial_se_incorpora_a_un_nucleo(prueba):
        # El primer punto tiene solo un vecino, pero es borde de un núcleo posterior.
        puntos = [{"id": str(indice), "latitud": 19.4, "longitud": longitud}
                  for indice, longitud in enumerate([-99.1013, -99.1000, -99.0999, -99.0998])]
        resultado = analizar_puntos({"puntos": puntos, "radio_metros": 150, "minimo_puntos": 4})
        prueba.assertEqual(resultado["grupos"][0]["cantidad"], 4)
        prueba.assertEqual(resultado["cantidad_aislados"], 0)

    def test_cadena_de_nucleos_supera_el_radio_sin_dividir_el_grupo(prueba):
        puntos = [{"id": str(indice), "latitud": 19.4, "longitud": -99.105 + indice * .001}
                  for indice in range(6)]
        resultado = analizar_puntos({"puntos": puntos})
        prueba.assertEqual(len(resultado["grupos"]), 1)
        prueba.assertEqual(resultado["grupos"][0]["cantidad"], 6)
        prueba.assertGreater(resultado["grupos"][0]["radio_visual_metros"], 150)

    def test_dos_grupos_y_un_aislado(prueba):
        puntos = [{"id": str(indice), "latitud": 19.4 + desplazamiento, "longitud": -99.1}
                  for indice, desplazamiento in enumerate([0, .0001, .0002, .01, .0101, .0102, .03])]
        resultado = analizar_puntos({"puntos": puntos})
        prueba.assertEqual(sorted(grupo["cantidad"] for grupo in resultado["grupos"]), [3, 3])
        prueba.assertEqual(resultado["cantidad_aislados"], 1)

    def test_el_umbral_incluye_el_propio_punto_y_no_basta_con_dos(prueba):
        puntos = [{"id": str(indice), "latitud": 19.4, "longitud": -99.1} for indice in range(2)]
        resultado = analizar_puntos({"puntos": puntos})
        prueba.assertEqual(resultado["grupos"], [])
        prueba.assertEqual(resultado["cantidad_aislados"], 2)

    def test_coordenadas_y_ids_invalidos(prueba):
        for latitud in [float("nan"), float("inf"), 91]:
            with prueba.assertRaises(ValueError):
                analizar_puntos({"puntos": [{"id": "uno", "latitud": latitud, "longitud": -99.1}]})
        with prueba.assertRaises(ValueError):
            analizar_puntos({"puntos": [{"id": "uno", "latitud": 19.4, "longitud": -99.1}] * 3})

    def test_limite_operativo_de_dos_mil_reportes(prueba):
        resultado = analizar_puntos({"puntos": [{"id": str(indice), "latitud": 19.4, "longitud": -99.1} for indice in range(2000)]})
        prueba.assertEqual(resultado["grupos"][0]["cantidad"], 2000)
        with prueba.assertRaises(ValueError):
            analizar_puntos({"puntos": [{"id": str(indice), "latitud": 19.4, "longitud": -99.1} for indice in range(2001)]})


if __name__ == "__main__":
    pruebas_unitarias.main()
