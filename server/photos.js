import procesadorImagenes from 'sharp';
import { mkdir as crearDirectorio, unlink as eliminarArchivo } from 'node:fs/promises';
import rutas from 'node:path';
import { randomUUID as generarIdentificador } from 'node:crypto';
import { configuracion } from './config.js';
import { ErrorHttp } from './security.js';
async function guardarFotografia(archivo) {
  if (!archivo) throw new ErrorHttp(400, "Adjunta una fotografía en formato JPG, PNG o WebP (máximo 5 MB).");
  try {
    const entrada = procesadorImagenes(archivo.buffer, {
      limitInputPixels: 40_000_000,
      failOn: 'error'
    });
    const metadatos = await entrada.metadata();
    if (!["jpeg", "png", "webp"].includes(metadatos.format) || (metadatos.pages || 1) > 1) throw new Error("Formato no permitido");
    const nombreArchivo = `${generarIdentificador()}.webp`;
    await crearDirectorio(configuracion.carpetaFotografias, {
      recursive: true
    });
    // Decodifica y vuelve a codificar la imagen para retirar metadatos y el nombre original.
    await entrada.rotate().resize(1800, 1800, {
      fit: "inside",
      withoutEnlargement: true
    }).webp({
      quality: 85
    }).toFile(rutas.join(configuracion.carpetaFotografias, nombreArchivo));
    return nombreArchivo;
  } catch {
    throw new ErrorHttp(400, "No se pudo leer la fotografía. Utiliza un archivo JPG, PNG o WebP válido.");
  }
}
export { guardarFotografia };
async function descartarFotografia(nombreArchivo) {
  if (nombreArchivo) await eliminarArchivo(rutas.join(configuracion.carpetaFotografias, nombreArchivo)).catch(() => {});
}
export { descartarFotografia };
