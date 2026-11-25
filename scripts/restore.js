import { abrirBaseDatos } from '../server/db.js';
import { restaurarRespaldo } from '../server/backups.js';
if (!process.argv[2]) throw new Error("Uso: npm run restore -- ruta-al-respaldo");
const baseDatos = await abrirBaseDatos();
try {
  await restaurarRespaldo(baseDatos, process.argv[2]);
  console.log("Datos y fotografías recuperados. Las sesiones anteriores no se restauran.");
} finally {
  await baseDatos.cerrar();
}
