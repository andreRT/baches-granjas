import { abrirBaseDatos } from './db.js';
import { configuracion } from './config.js';
const baseDatos = await abrirBaseDatos();
try {
  console.log(`Estructura preparada en ${configuracion.motor}.`);
} finally {
  await baseDatos.cerrar();
}
