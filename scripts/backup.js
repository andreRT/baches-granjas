import { abrirBaseDatos } from '../server/db.js';
import { crearRespaldo } from '../server/backups.js';
const baseDatos = await abrirBaseDatos();
try {
  console.log(`Respaldo creado: ${await crearRespaldo(baseDatos)}`);
} finally {
  await baseDatos.cerrar();
}
