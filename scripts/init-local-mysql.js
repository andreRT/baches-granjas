// Prepara una instancia nueva y aislada. Nunca usa el servicio ni los datos
// de otra instalación. No sobrescribe .env o un directorio ya inicializado.
import { mkdir as crearDirectorio, writeFile as escribirArchivo, access as comprobarAcceso } from 'node:fs/promises';
import { spawn as crearProceso } from 'node:child_process';
import { randomBytes as generarBytesAleatorios } from 'node:crypto';
import red from 'node:net';
import rutas from 'node:path';
import { RAIZ } from '../server/config.js';
import { ejecutableMysql, directorioMysqlLocal, rutaAdministrador, iniciarMysqlLocal, esperarMysql, detenerMysqlLocal } from './local-mysql.js';
const rutaConfiguracion = rutas.join(RAIZ, ".env");
for (const destino of [rutaConfiguracion, directorioMysqlLocal]) {
  try {
    await comprobarAcceso(destino);
    throw new Error(`Ya existe ${rutas.relative(RAIZ, destino)}. Conserva su configuración; no se sobrescribió.`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
const puerto = 3307;
await new Promise((resolver, rechazar) => {
  const comprobadorPuerto = red.createServer();
  comprobadorPuerto.once('error', () => rechazar(new Error("El puerto 3307 está ocupado. No se modificó ningún servidor.")));
  comprobadorPuerto.listen(puerto, "127.0.0.1", () => comprobadorPuerto.close(resolver));
});
await comprobarAcceso(ejecutableMysql());
await crearDirectorio(directorioMysqlLocal, {
  recursive: true
});
console.log("Inicializando una instancia MySQL exclusiva para el proyecto…");
await new Promise((resolver, rechazar) => {
  const inicializacion = crearProceso(ejecutableMysql(), ['--no-defaults', '--initialize-insecure', `--datadir=${directorioMysqlLocal}`, '--mysqlx=OFF'], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  let salida = "";
  inicializacion.stderr.on('data', datos => {
    salida += datos;
  });
  inicializacion.on('error', rechazar);
  inicializacion.on('close', codigo => codigo === 0 ? resolver() : rechazar(new Error(`No se pudo inicializar MySQL: ${salida.slice(-1500)}`)));
});
const procesoHijo = iniciarMysqlLocal(puerto);
let registroServidor = "";
procesoHijo.stderr.on('data', datos => {
  registroServidor = (registroServidor + datos).slice(-4000);
});
procesoHijo.on('error', error => {
  console.error(error.message);
});
let inicializado = false;
try {
  const raiz = await esperarMysql({
    host: "127.0.0.1",
    port: puerto,
    user: "root",
    password: ""
  }, procesoHijo);
  const contrasenaAplicacion = generarBytesAleatorios(24).toString("hex"),
    contrasenaAdministrador = generarBytesAleatorios(32).toString("hex");
  await escribirArchivo(rutaAdministrador, JSON.stringify({
    contrasena: contrasenaAdministrador
  }), {
    flag: "wx",
    mode: 0o600
  });
  await raiz.query("CREATE DATABASE reportes_granjas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await raiz.query("CREATE USER 'baches_local'@'localhost' IDENTIFIED BY ?", [contrasenaAplicacion]);
  await raiz.query("GRANT ALL PRIVILEGES ON reportes_granjas.* TO 'baches_local'@'localhost'");
  await raiz.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [contrasenaAdministrador]);
  await raiz.end();
  inicializado = true;
  const entorno = `# Configuración local privada. No compartir.\nSERVIDOR=127.0.0.1\nPUERTO=3001\nORIGEN_APLICACION=http://127.0.0.1:5173\nMOTOR_BASE_DATOS=mysql\nMYSQL_SERVIDOR=127.0.0.1\nMYSQL_PUERTO=${puerto}\nMYSQL_BASE_DATOS=reportes_granjas\nMYSQL_USUARIO=baches_local\nMYSQL_CONTRASENA=${contrasenaAplicacion}\nMYSQL_LOCAL=true\nCARPETA_FOTOGRAFIAS=./data/fotografias\nPYTHON_EJECUTABLE=./.venv/Scripts/python.exe\n`;
  await escribirArchivo(rutaConfiguracion, entorno, {
    flag: "wx",
    mode: 0o600
  });
  console.log("MySQL preparado en el puerto 3307. Ejecuta npm run dev para iniciar el proyecto.");
} catch (error) {
  console.error(registroServidor);
  throw error;
} finally {
  if (inicializado) await detenerMysqlLocal(puerto).catch(() => procesoHijo.kill());else procesoHijo.kill();
}
