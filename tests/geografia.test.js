import prueba from 'node:test';
import verificar from 'node:assert/strict';
import {ZONA_COBERTURA, puntoDentroZona, obtenerUnidadTerritorial} from '../shared/domain.js';

prueba('la cobertura distingue las dos unidades del IECM y sus extensiones al norte y al este', () => {
  verificar.deepEqual(ZONA_COBERTURA.features.map(unidad => unidad.properties.clave), ['06-050', '06-051']);
  verificar.equal(obtenerUnidadTerritorial(19.400, -99.100)?.nombre, 'Granjas México I');
  verificar.equal(obtenerUnidadTerritorial(19.401, -99.084)?.nombre, 'Granjas México II');
  verificar.equal(obtenerUnidadTerritorial(19.408, -99.098)?.clave, '06-050');
  verificar.equal(obtenerUnidadTerritorial(19.397, -99.089)?.clave, '06-051');
  // El rectángulo anterior permitía puntos al sur que no pertenecen a estas unidades.
  verificar.equal(puntoDentroZona(19.389, -99.105), false);
  // Estar dentro del rectángulo envolvente de los polígonos tampoco basta.
  verificar.equal(puntoDentroZona(19.394, -99.112), false);
  verificar.equal(obtenerUnidadTerritorial(19.4095, -99.097), null);
});

prueba('admite los bordes, incluida la división compartida, sin añadir una franja exterior', () => {
  const [primera, segunda] = ZONA_COBERTURA.features;
  const [longitudCompartida, latitudCompartida] = primera.geometry.coordinates[0][0];
  verificar.equal(puntoDentroZona(latitudCompartida, longitudCompartida, primera), true);
  verificar.equal(puntoDentroZona(latitudCompartida, longitudCompartida, segunda), true);
  verificar.equal(obtenerUnidadTerritorial(latitudCompartida, longitudCompartida)?.clave, '06-050');
  const contorno = primera.geometry.coordinates[0];
  const [primero, siguiente] = [contorno[3], contorno[4]];
  verificar.equal(puntoDentroZona((primero[1] + siguiente[1]) / 2, (primero[0] + siguiente[0]) / 2, primera), true);
  const extremoOeste = contorno.reduce((menor, posicion) => posicion[0] < menor[0] ? posicion : menor);
  verificar.equal(puntoDentroZona(extremoOeste[1], extremoOeste[0] - 0.000001), false);
});

prueba('la validación respeta huecos y varios polígonos independientemente del sentido del contorno', () => {
  const exterior = [[0,0], [4,0], [4,4], [0,4], [0,0]];
  const hueco = [[1,1], [3,1], [3,3], [1,3], [1,1]];
  const geometria = {type: 'Polygon', coordinates: [exterior, hueco]};
  verificar.equal(puntoDentroZona(0.5, 0.5, geometria), true);
  verificar.equal(puntoDentroZona(2, 2, geometria), false);
  verificar.equal(puntoDentroZona(1, 2, geometria), true);
  verificar.equal(puntoDentroZona(5, 2, geometria), false);
  const varias = {type: 'MultiPolygon', coordinates: [[exterior.slice().reverse(), hueco], [[[10,10], [14,10], [14,14], [10,14], [10,10]]]]};
  verificar.equal(puntoDentroZona(0.5, 0.5, varias), true);
  verificar.equal(puntoDentroZona(2, 2, varias), false);
  verificar.equal(puntoDentroZona(12, 12, varias), true);
  verificar.equal(puntoDentroZona(7, 7, varias), false);
});

prueba('rechaza coordenadas no numéricas y geometrías sin cobertura', () => {
  for (const [latitud, longitud] of [[NaN,-99.1], [19.4,Infinity], ['19.4',-99.1], [91,-99.1], [19.4,-181]]) {
    verificar.equal(puntoDentroZona(latitud, longitud), false);
  }
  verificar.equal(puntoDentroZona(19.4, -99.1, {type: 'FeatureCollection', features: []}), false);
  verificar.equal(puntoDentroZona(19.4, -99.1, {type: 'Feature', geometry: null}), false);
});
