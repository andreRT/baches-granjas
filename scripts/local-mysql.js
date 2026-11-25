import { spawn as crearProceso } from 'node:child_process';
import { readFile as leerArchivo } from 'node:fs/promises';
import rutas from 'node:path';
import clienteMysql from 'mysql2/promise';
import { RAIZ } from '../server/config.js';
const directorioMysqlLocal = rutas.join(RAIZ, "data/local-mysql");
export { directorioMysqlLocal };
const rutaAdministrador = rutas.join(RAIZ, "data/local-mysql-admin.json");
export { rutaAdministrador };
const ejecutableMysql = () => process.env.MYSQL_EJECUTABLE || "C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe";
export { ejecutableMysql };
function iniciarMysqlLocal(puerto) {
  return crearProceso(ejecutableMysql(), ['--no-defaults', `--datadir=${directorioMysqlLocal}`, `--port=${puerto}`, '--bind-address=127.0.0.1', '--mysqlx=OFF', '--console'], {
    cwd: RAIZ,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });
}
export { iniciarMysqlLocal };
async function esperarMysql(opciones, procesoHijo, tiempoLimiteMilisegundos = 40000) {
  let ultimoError;
  const iniciar = Date.now();
  while (Date.now() - iniciar < tiempoLimiteMilisegundos) {
    if (procesoHijo?.exitCode !== null && procesoHijo?.exitCode !== undefined) throw new Error("MySQL terminó antes de estar disponible. Revisa data/local-mysql/*.err.");
    try {
      return await clienteMysql.createConnection({
        ...opciones,
        connectTimeout: 1500
      });
    } catch (error) {
      ultimoError = error;
      await new Promise(resolver => setTimeout(resolver, 400));
    }
  }
  throw new Error(`MySQL no respondió: ${ultimoError?.code || "tiempo agotado"}.`);
}
export { esperarMysql };
async function detenerMysqlLocal(puerto) {
  const administrador = JSON.parse(await leerArchivo(rutaAdministrador, "utf8"));
  const conexion = await clienteMysql.createConnection({
    host: '127.0.0.1',
    port: puerto,
    user: 'root',
    password: administrador.contrasena,
    connectTimeout: 2000
  });
  try {
    await conexion.query("SHUTDOWN");
  } finally {
    await conexion.end().catch(() => {});
  }
}
export { detenerMysqlLocal };
