import { readFile as leerArchivo } from 'node:fs/promises';
import { spawn as crearProceso } from 'node:child_process';
import clienteMysql from 'mysql2/promise';
import { rutaAdministrador } from './local-mysql.js';
import { RAIZ } from '../server/config.js';

// Ejecuta las pruebas en una base temporal y conserva la base de operación.
if (process.env.MYSQL_LOCAL !== "true") throw new Error("Este comando requiere la instancia aislada creada con db:local:init y que esté iniciada.");
const nombre = `granjas_test_${process.pid}_${Date.now()}`;
if (!/^granjas_test_\d+_\d+$/.test(nombre)) throw new Error("Nombre de base de prueba inválido.");
const administrador = JSON.parse(await leerArchivo(rutaAdministrador, "utf8"));
const conexion = await clienteMysql.createConnection({
  host: '127.0.0.1',
  port: Number(process.env.MYSQL_PUERTO || 3307),
  user: 'root',
  password: administrador.contrasena
});
try {
  await conexion.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4`);
  await conexion.query(`GRANT ALL PRIVILEGES ON \`${nombre}\`.* TO 'baches_local'@'localhost'`);
  const codigo = await new Promise((resolver, rechazar) => {
    const procesoHijo = crearProceso(process.execPath, ['--test', '--test-concurrency=1', 'tests/workflow.test.js'], {
      cwd: RAIZ,
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        MOTOR_BASE_DATOS_PRUEBAS: 'mysql',
        MYSQL_BASE_DATOS: nombre
      }
    });
    procesoHijo.on('error', rechazar);
    procesoHijo.on('exit', resolver);
  });
  process.exitCode = codigo || 0;
} finally {
  await conexion.query(`REVOKE ALL PRIVILEGES ON \`${nombre}\`.* FROM 'baches_local'@'localhost'`);
  await conexion.query(`DROP DATABASE \`${nombre}\``);
  await conexion.end();
}
