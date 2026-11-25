import { randomBytes as generarBytesAleatorios, scrypt as derivarClaveOriginal, timingSafeEqual as compararSinFiltrarTiempo, createHash as crearResumen } from 'node:crypto';
import { promisify as convertirAPromesa } from 'node:util';
const derivarClave = convertirAPromesa(derivarClaveOriginal);
const resumirToken = tokenSesion => crearResumen("sha256").update(tokenSesion).digest("hex");
export { resumirToken };
async function resumirContrasena(contrasena) {
  const salAleatoria = generarBytesAleatorios(16).toString("hex");
  const claveDerivada = await derivarClave(contrasena, salAleatoria, 64);
  return `scrypt:${salAleatoria}:${claveDerivada.toString("hex")}`;
}
export { resumirContrasena };
async function verificarContrasena(contrasena, resumen) {
  const [algoritmo, salAleatoria, clave] = resumen.split(":");
  if (algoritmo !== "scrypt" || !salAleatoria || !clave) return false;
  const claveDerivada = await derivarClave(contrasena, salAleatoria, 64);
  const valorEsperado = Buffer.from(clave, "hex");
  return valorEsperado.length === claveDerivada.length && compararSinFiltrarTiempo(valorEsperado, claveDerivada);
}
export { verificarContrasena };
class ErrorHttp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.status = estado;
  }
}
export { ErrorHttp };
function exigirTexto(valor, etiqueta, minimo = 1, maximo = 200) {
  if (typeof valor !== "string" || valor.trim().length < minimo || valor.trim().length > maximo) {
    throw new ErrorHttp(400, `${etiqueta}: escribe entre ${minimo} y ${maximo} caracteres.`);
  }
  return valor.trim();
}
export { exigirTexto };
function validarCorreo(valor) {
  const normalizado = exigirTexto(valor, "Correo electrónico", 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) throw new ErrorHttp(400, "Escribe un correo electrónico válido.");
  return normalizado;
}
export { validarCorreo };
function validarContrasena(valor) {
  if (typeof valor !== "string" || valor.length < 10 || valor.length > 128) {
    throw new ErrorHttp(400, "La contraseña debe tener entre 10 y 128 caracteres.");
  }
  return valor;
}
export { validarContrasena };
function limitarSolicitudes(limite, ventanaMilisegundos) {
  const registrosLimite = new Map();
  const limpieza = setInterval(() => {
    const fechaActual = Date.now();
    for (const [clave, valor] of registrosLimite) if (valor.vencimiento < fechaActual) registrosLimite.delete(clave);
  }, ventanaMilisegundos);
  limpieza.unref();
  return (solicitud, respuesta, siguiente) => {
    const clave = solicitud.ip;
    const fechaActual = Date.now();
    let registroLimite = registrosLimite.get(clave);
    if (!registroLimite || registroLimite.vencimiento < fechaActual) {
      registroLimite = {
        cantidad: 0,
        vencimiento: fechaActual + ventanaMilisegundos
      };
      registrosLimite.set(clave, registroLimite);
    }
    if (++registroLimite.cantidad > limite) return respuesta.status(429).json({
      error: "Demasiados intentos. Espera unos minutos antes de volver a intentar."
    });
    siguiente();
  };
}
export { limitarSolicitudes };
