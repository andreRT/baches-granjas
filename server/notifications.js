import { randomUUID as generarIdentificador } from 'node:crypto';
import correoElectronico from 'nodemailer';
async function crearNotificacion(transaccion, idUsuario, reporte, mensaje, fechaActual = new Date().toISOString(), opciones = {}) {
  const usuario = await transaccion.obtener("SELECT correo FROM usuarios WHERE id = ?", [idUsuario]);
  if (!usuario) return;
  const id = generarIdentificador();
  await transaccion.ejecutar("INSERT INTO notificaciones (id,id_usuario,id_reporte,mensaje,fecha_creacion) VALUES (?,?,?,?,?)", [id, idUsuario, reporte.id, mensaje, fechaActual]);
  await transaccion.ejecutar("INSERT INTO correos_pendientes (id,id_notificacion,destinatario,asunto,contenido,fecha_creacion) VALUES (?,?,?,?,?,?)", [generarIdentificador(), id, usuario.correo, opciones.asunto || `Actualización del reporte ${reporte.folio}`, mensaje, fechaActual]);
  return id;
}
export { crearNotificacion };
function iniciarEnvioCorreos(baseDatos) {
  if (!process.env.SMTP_SERVIDOR || !process.env.SMTP_REMITENTE) return () => {};
  const transporte = correoElectronico.createTransport({
    host: process.env.SMTP_SERVIDOR,
    port: Number(process.env.SMTP_PUERTO || 587),
    secure: process.env.SMTP_SEGURO === 'true',
    auth: process.env.SMTP_USUARIO ? {
      user: process.env.SMTP_USUARIO,
      pass: process.env.SMTP_CONTRASENA
    } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000
  });
  let ejecutando = false;
  async function enviarPendientes() {
    if (ejecutando) return;
    ejecutando = true;
    try {
      const filas = await baseDatos.consultar("SELECT * FROM correos_pendientes WHERE fecha_envio IS NULL AND intentos < 5 ORDER BY fecha_creacion LIMIT 10");
      for (const fila of filas) {
        try {
          await transporte.sendMail({
            from: process.env.SMTP_REMITENTE,
            to: fila.destinatario,
            subject: fila.asunto,
            text: fila.contenido
          });
          await baseDatos.ejecutar("UPDATE correos_pendientes SET fecha_envio = ?, intentos = intentos + 1, ultimo_error = NULL WHERE id = ?", [new Date().toISOString(), fila.id]);
        } catch {
          await baseDatos.ejecutar("UPDATE correos_pendientes SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?", ["No se pudo entregar el correo; revisa la configuración SMTP.", fila.id]);
        }
      }
    } catch (error) {
      console.error("Error en la bandeja de salida:", error.code || error.name);
    } finally {
      ejecutando = false;
    }
  }
  const temporizador = setInterval(enviarPendientes, 60000);
  temporizador.unref();
  void enviarPendientes();
  return () => {
    clearInterval(temporizador);
    transporte.close();
  };
}
export { iniciarEnvioCorreos };
