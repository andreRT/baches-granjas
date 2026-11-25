import { mkdir as crearDirectorio, writeFile as escribirArchivo, readFile as leerArchivo, copyFile as copiarArchivo, readdir as leerDirectorio, rm as eliminarRuta } from 'node:fs/promises';
import rutas from 'node:path';
import { configuracion, RAIZ } from './config.js';
const TABLAS_RESPALDO = ["usuarios", "reportes", "concentraciones", "estado_concentraciones", "fotografias", "historial_reportes", "notificaciones", "notificaciones_concentracion", "correos_pendientes"];
export { TABLAS_RESPALDO };
const base = rutas.join(RAIZ, "backups");
async function crearRespaldo(baseDatos, carpetaRespaldos = base) {
  const id = `respaldo-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const directorio = rutas.join(carpetaRespaldos, id);
  await crearDirectorio(rutas.join(directorio, "fotografias"), {
    recursive: true
  });
  const tablas = await baseDatos.transaccion(async transaccion => {
    const resultado = {};
    for (const tabla of TABLAS_RESPALDO) resultado[tabla] = await transaccion.consultar(`SELECT * FROM ${tabla}`);
    // Las imágenes guardadas son inmutables. Solo se copian los archivos relacionados con la instantánea.
    for (const nombreArchivo of new Set(resultado.fotografias.map(fotografia => fotografia.nombre_archivo))) {
      if (!/^[a-zA-Z0-9-]+\.webp$/.test(nombreArchivo)) throw new Error("Nombre de fotografía no válido en el respaldo.");
      await copiarArchivo(rutas.join(configuracion.carpetaFotografias, nombreArchivo), rutas.join(directorio, "fotografias", nombreArchivo));
    }
    return resultado;
  });
  await escribirArchivo(rutas.join(directorio, "snapshot.json"), JSON.stringify({
    version: 2,
    fecha_creacion: new Date().toISOString(),
    base_datos: configuracion.motor,
    tablas: tablas
  }, null, 2), {
    flag: "wx"
  });
  const anterior = (await leerDirectorio(carpetaRespaldos)).filter(nombre => /^respaldo-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/.test(nombre)).sort().reverse();
  for (const nombre of anterior.slice(3)) {
    const destino = rutas.resolve(carpetaRespaldos, nombre);
    if (rutas.dirname(destino) !== rutas.resolve(carpetaRespaldos)) throw new Error("Ruta de respaldo fuera del directorio previsto.");
    await eliminarRuta(destino, {
      recursive: true
    });
  }
  return directorio;
}
export { crearRespaldo };
async function restaurarRespaldo(baseDatos, origen) {
  const directorio = rutas.resolve(origen);
  const instantanea = JSON.parse(await leerArchivo(rutas.join(directorio, "snapshot.json"), "utf8"));
  if (![1,2].includes(instantanea.version) || !instantanea.tablas) throw new Error("Formato de respaldo no válido.");
  for (const tabla of TABLAS_RESPALDO) {
    if (instantanea.version === 1 && ['concentraciones','estado_concentraciones','notificaciones_concentracion'].includes(tabla) && !instantanea.tablas[tabla]) instantanea.tablas[tabla] = [];
    if (!Array.isArray(instantanea.tablas[tabla])) throw new Error(`Falta la tabla ${tabla}.`);
    if ((await baseDatos.obtener(`SELECT COUNT(*) AS total FROM ${tabla}`)).total > 0) throw new Error("La restauración requiere una base vacía. No se sobrescribieron registros.");
  }
  const columnasPermitidas = {};
  for (const tabla of TABLAS_RESPALDO) {
    const informacion = configuracion.motor === "mysql" ? await baseDatos.consultar(`SHOW COLUMNS FROM ${tabla}`) : await baseDatos.consultar(`PRAGMA table_info(${tabla})`);
    columnasPermitidas[tabla] = new Set(informacion.map(fila => fila.Field || fila.name));
  }
  await crearDirectorio(configuracion.carpetaFotografias, {
    recursive: true
  });
  for (const nombreArchivo of new Set(instantanea.tablas.fotografias.map(fotografia => fotografia.nombre_archivo))) {
    if (!/^[a-zA-Z0-9-]+\.webp$/.test(nombreArchivo)) throw new Error("Ruta de fotografía no válida.");
    await copiarArchivo(rutas.join(directorio, "fotografias", nombreArchivo), rutas.join(configuracion.carpetaFotografias, nombreArchivo));
  }
  await baseDatos.transaccion(async transaccion => {
    for (const tabla of TABLAS_RESPALDO) for (const fila of instantanea.tablas[tabla]) {
      const columnas = Object.keys(fila);
      if (!columnas.length || columnas.some(columna => !columnasPermitidas[tabla].has(columna))) throw new Error("El respaldo contiene columnas no válidas.");
      await transaccion.ejecutar(`INSERT INTO ${tabla} (${columnas.join(",")}) VALUES (${columnas.map(() => "?").join(",")})`, columnas.map(columna => fila[columna]));
    }
  });
}
export { restaurarRespaldo };
