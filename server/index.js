import { abrirBaseDatos } from './db.js';
import { crearAplicacion } from './app.js';
import { configuracion } from './config.js';
import { iniciarEnvioCorreos } from './notifications.js';
const baseDatos = await abrirBaseDatos();
const detenerEnvioCorreos = iniciarEnvioCorreos(baseDatos);
const aplicacion = crearAplicacion(baseDatos);
aplicacion.locals.concentraciones.iniciar();
const servidor = aplicacion.listen(configuracion.puerto, configuracion.servidor, () => {
  console.log(`API y aplicación: http://${configuracion.servidor}:${configuracion.puerto}`);
  console.log(`Base de datos: ${configuracion.motor}`);
});
servidor.on('error', async error => {
  console.error(error.message);
  detenerEnvioCorreos();
  await aplicacion.locals.concentraciones.detener();
  await baseDatos.cerrar();
  process.exitCode = 1;
});
let cerrando = false;
async function cerrarServicios() {
  if (cerrando) return;
  cerrando = true;
  detenerEnvioCorreos();
  await aplicacion.locals.concentraciones.detener();
  servidor.close(async () => {
    await baseDatos.cerrar();
    process.exit(0);
  });
}
process.on('SIGINT', cerrarServicios);
process.on('SIGTERM', cerrarServicios);
