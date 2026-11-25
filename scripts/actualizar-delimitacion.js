import {mkdir as crearDirectorio, writeFile as escribirArchivo} from 'node:fs/promises';
import {createHash as crearResumen} from 'node:crypto';
import rutas from 'node:path';
import {RAIZ} from '../server/config.js';

// Consulta de solo lectura utilizada por el propio visor público del IECM.
const DIRECCION_CONSULTA = 'https://scmgpc.iecm.mx/paginas/controlador.php';
const DIRECCION_VISOR = 'https://scmgpc.iecm.mx/Cartografia_SCMGPC.php';
const UNIDADES = [
  {clave: '06-050', nombre: 'Granjas México I'},
  {clave: '06-051', nombre: 'Granjas México II'},
];

async function consultar(parametros) {
  const respuesta = await fetch(DIRECCION_CONSULTA, {
    method: 'POST', body: new URLSearchParams(parametros), signal: AbortSignal.timeout(20000),
  });
  if (!respuesta.ok) throw new Error(`IECM no disponible (${respuesta.status}). No se actualizó la delimitación.`);
  return (await respuesta.text()).trim();
}

function convertirCoordenadas(contenido) {
  const coordenadas = contenido.split('*').map(parte => parte.trim()).filter(Boolean).map(parte => {
    if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(parte)) throw new Error('El formato de coordenadas del IECM cambió. Revisa la fuente antes de actualizar.');
    const [longitud, latitud] = parte.split(',').map(Number);
    if (longitud < -99.2 || longitud > -99 || latitud < 19.3 || latitud > 19.5) throw new Error('La geometría recibida está fuera de Iztacalco.');
    return [longitud, latitud];
  });
  if (coordenadas.length < 4) throw new Error('El polígono recibido está incompleto.');
  const primera = coordenadas[0], ultima = coordenadas.at(-1);
  if (primera[0] !== ultima[0] || primera[1] !== ultima[1]) throw new Error('El contorno recibido no está cerrado.');
  return coordenadas;
}

const poligonos = [];
for (const unidad of UNIDADES) {
  const [contenido, ficha] = await Promise.all([
    consultar({opcion: 'obtenerPoligono', dato: unidad.clave, bd: 'ut_2024'}),
    consultar({opcion: 'obtenerDatosUT', claveUT: unidad.clave}),
  ]);
  const atributos = Object.fromEntries([...ficha.matchAll(/(\w+)=(['"])([\s\S]*?)\2/g)].map(coincidencia => [coincidencia[1], coincidencia[3]]));
  if (atributos.claveUT !== unidad.clave || atributos.nombreDT !== 'IZTACALCO'
      || atributos.nombreUT !== unidad.nombre.toLocaleUpperCase('es-MX')
      || atributos.poligono?.trim() !== contenido) throw new Error(`La ficha y la geometría de ${unidad.clave} no coinciden.`);
  const coordenadas = convertirCoordenadas(contenido);
  poligonos.push({
    type: 'Feature',
    properties: {clave: unidad.clave, nombre: unidad.nombre, alcaldia: 'Iztacalco', fuente: 'IECM'},
    geometry: {type: 'Polygon', coordinates: [coordenadas]},
  });
}

const posiciones = poligonos.flatMap(poligono => poligono.geometry.coordinates[0]);
const limites = [
  Math.min(...posiciones.map(posicion => posicion[0])), Math.min(...posiciones.map(posicion => posicion[1])),
  Math.max(...posiciones.map(posicion => posicion[0])), Math.max(...posiciones.map(posicion => posicion[1])),
];
const geometria = {type: 'FeatureCollection', bbox: limites, features: poligonos};
const contenidoGeometria = JSON.stringify(geometria, null, 2) + '\n';
const procedencia = {
  institucion: 'Instituto Electoral de la Ciudad de México', visor: DIRECCION_VISOR,
  consulta: DIRECCION_CONSULTA, fecha_descarga: new Date().toISOString(),
  marco_publicado: 'SCMGPC 2025', identificador_tecnico_origen: 'ut_2024',
  criterio: 'Unión de las unidades territoriales 06-050 y 06-051. Límites de participación ciudadana, no deslinde catastral.',
  transformaciones: 'Conversión del formato de coordenadas del visor a GeoJSON. Sin redibujar, simplificar ni añadir una tolerancia en metros.',
  formato_coordenadas: 'Longitud, latitud en grados; compatible con GeoJSON y Leaflet.',
  unidades: poligonos.map(poligono => ({clave: poligono.properties.clave, nombre: poligono.properties.nombre, vertices: poligono.geometry.coordinates[0].length})),
  sha256_geojson: crearResumen('sha256').update(contenidoGeometria).digest('hex'),
};
const marcas = poligonos.map(poligono => `<Placemark><name>${poligono.properties.nombre}</name><description>IECM · ${poligono.properties.clave} · Unidad territorial de participación ciudadana</description><Polygon><outerBoundaryIs><LinearRing><coordinates>${poligono.geometry.coordinates[0].map(posicion => posicion.join(',') + ',0').join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`).join('\n');
const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Granjas México I y II · IECM</name>${marcas}</Document></kml>\n`;
await crearDirectorio(rutas.join(RAIZ, 'shared/geografia'), {recursive: true});
await crearDirectorio(rutas.join(RAIZ, 'public/geografia'), {recursive: true});
await escribirArchivo(rutas.join(RAIZ, 'shared/geografia/granjas-mexico.json'), contenidoGeometria);
await escribirArchivo(rutas.join(RAIZ, 'shared/geografia/procedencia.json'), JSON.stringify(procedencia, null, 2) + '\n');
await escribirArchivo(rutas.join(RAIZ, 'public/geografia/granjas-mexico-i-ii.kml'), kml);
console.log('Polígonos descargados y contrastados con las dos fichas del IECM.');
for (const unidad of procedencia.unidades) console.log(`${unidad.clave} · ${unidad.nombre} · ${unidad.vertices} vértices`);
console.log('Después de actualizar, reinicia la aplicación para usar la misma geometría en la API y la interfaz.');
