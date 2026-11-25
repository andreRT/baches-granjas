import rutas from 'node:path';
import { fileURLToPath as convertirUrlARuta } from 'node:url';
const RAIZ = rutas.resolve(rutas.dirname(convertirUrlARuta(import.meta.url)), "..");
export { RAIZ };
const produccion = process.env.NODE_ENV === "production";
const configuracion = {
  produccion: produccion,
  servidor: process.env.SERVIDOR || "127.0.0.1",
  puerto: Number(process.env.PUERTO || 3001),
  origen: process.env.ORIGEN_APLICACION || (produccion ? "http://127.0.0.1:3001" : "http://127.0.0.1:5173"),
  motor: process.env.MOTOR_BASE_DATOS || "mysql",
  rutaSqlite: rutas.resolve(RAIZ, process.env.RUTA_SQLITE || "data/baches.sqlite"),
  carpetaFotografias: rutas.resolve(RAIZ, process.env.CARPETA_FOTOGRAFIAS || "data/fotografias")
};
export { configuracion };
