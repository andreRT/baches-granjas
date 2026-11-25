import { randomUUID as generarIdentificador } from 'node:crypto';
import { abrirBaseDatos } from '../server/db.js';
import { resumirContrasena, validarCorreo, validarContrasena, exigirTexto } from '../server/security.js';
const [rol, direccionCorreo, ...partesNombre] = process.argv.slice(2);
if (!["administracion", "ingeniero"].includes(rol) || !direccionCorreo || !partesNombre.length || !process.env.NUEVA_CONTRASENA_USUARIO) {
  console.error("Uso: npm run personal:crear -- administracion|ingeniero correo@example.com Nombre Completo");
  console.error("Define primero NUEVA_CONTRASENA_USUARIO como variable temporal de entorno (10 a 128 caracteres).");
  process.exit(1);
}
const datos = {
  id: generarIdentificador(),
  nombre: exigirTexto(partesNombre.join(" "), "Nombre", 2, 100),
  correo: validarCorreo(direccionCorreo),
  resumen: await resumirContrasena(validarContrasena(process.env.NUEVA_CONTRASENA_USUARIO))
};
const baseDatos = await abrirBaseDatos();
try {
  await baseDatos.ejecutar("INSERT INTO usuarios (id,nombre,correo,resumen_contrasena,rol,fecha_creacion) VALUES (?,?,?,?,?,?)", [datos.id, datos.nombre, datos.correo, datos.resumen, rol, new Date().toISOString()]);
  console.log("Cuenta de personal creada.");
} finally {
  delete process.env.NUEVA_CONTRASENA_USUARIO;
  await baseDatos.cerrar();
}
