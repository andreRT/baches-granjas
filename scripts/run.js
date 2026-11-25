import { spawn as crearProceso } from 'node:child_process';
import { configuracion, RAIZ } from '../server/config.js';
import { iniciarMysqlLocal, detenerMysqlLocal, esperarMysql } from './local-mysql.js';
const hijos = [];
let mysqlIniciadoAqui = false,
  deteniendo = false;
function ejecutarComando(argumentos) {
  const procesoHijo = crearProceso(process.execPath, argumentos, {
    cwd: RAIZ,
    stdio: 'inherit',
    windowsHide: true
  });
  hijos.push(procesoHijo);
  procesoHijo.on('error', error => {
    console.error(error.message);
    void detener(1);
  });
  procesoHijo.on('exit', codigo => {
    if (!deteniendo) void detener(codigo || 0);
  });
  return procesoHijo;
}
async function detener(codigo = 0) {
  if (deteniendo) return;
  deteniendo = true;
  for (const procesoHijo of hijos) if (procesoHijo.exitCode === null) procesoHijo.kill();
  if (mysqlIniciadoAqui) await detenerMysqlLocal(Number(process.env.MYSQL_PUERTO || 3307)).catch(error => console.error("Cierre de MySQL:", error.code || error.message));
  process.exit(codigo);
}
process.on('SIGINT', () => void detener());
process.on('SIGTERM', () => void detener());
if (process.env.MYSQL_LOCAL === "true" && configuracion.motor === "mysql") {
  const opciones = {
    host: "127.0.0.1",
    port: Number(process.env.MYSQL_PUERTO || 3307),
    user: process.env.MYSQL_USUARIO,
    password: process.env.MYSQL_CONTRASENA,
    database: process.env.MYSQL_BASE_DATOS
  };
  try {
    const conexion = await esperarMysql(opciones, null, 1600);
    await conexion.end();
    console.log("Usando la instancia MySQL local ya iniciada.");
  } catch {
    const procesoMysql = iniciarMysqlLocal(opciones.port);
    mysqlIniciadoAqui = true;
    procesoMysql.stderr.on('data', datos => {
      const mensaje = datos.toString();
      if (mensaje.includes("[ERROR]")) console.error(mensaje);
    });
    procesoMysql.on('error', error => {
      console.error(error.message);
      void detener(1);
    });
    procesoMysql.on('exit', codigo => {
      if (!deteniendo) {
        console.error(`MySQL terminó (${codigo}).`);
        void detener(1);
      }
    });
    try {
      const conexion = await esperarMysql(opciones, procesoMysql);
      await conexion.end();
    } catch (error) {
      console.error(error.message);
      await detener(1);
    }
    console.log(`MySQL local listo en el puerto ${opciones.port}.`);
  }
}
ejecutarComando(["--env-file-if-exists=.env", process.argv[2] === "dev" ? "scripts/dev-api.js" : "server/index.js"]);
if (process.argv[2] === "dev") ejecutarComando(["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"]);
