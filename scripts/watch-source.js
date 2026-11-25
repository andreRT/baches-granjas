import { createHash as crearResumen } from 'node:crypto';
import { readdir as leerDirectorio, readFile as leerArchivo } from 'node:fs/promises';
import rutas from 'node:path';

// Se compara el contenido del código en lugar de las notificaciones de directorio. En Windows,
// la sincronización puede producir notificaciones de archivos ajenos al código.
// El monitor no lee archivos de la base de datos ni de node_modules.
async function calcularHuellaCodigo(raiz) {
  const resumen = crearResumen("sha256");
  async function recorrerDirectorio(directorio) {
    const entradas = await leerDirectorio(directorio, {
      withFileTypes: true
    });
    entradas.sort((primero, segundo) => primero.name.localeCompare(segundo.name));
    for (const entradaArchivo of entradas) {
      const nombreArchivo = rutas.join(directorio, entradaArchivo.name);
      if (entradaArchivo.isDirectory()) await recorrerDirectorio(nombreArchivo);else if (entradaArchivo.isFile() && /\.(js|json)$/.test(entradaArchivo.name)) {
        resumen.update(rutas.relative(raiz, nombreArchivo));
        resumen.update("\0");
        resumen.update(await leerArchivo(nombreArchivo));
        resumen.update("\0");
      }
    }
  }
  for (const directorio of ["server", "shared"]) await recorrerDirectorio(rutas.join(raiz, directorio));
  return resumen.digest("hex");
}
async function vigilarCodigoFuente({
  raiz: raiz,
  alCambiar: alCambiar,
  alError = () => {},
  intervaloMilisegundos = 1000
}) {
  let anterior = await calcularHuellaCodigo(raiz),
    detenido = false,
    comprobando = false;
  async function comprobar() {
    if (detenido || comprobando) return;
    comprobando = true;
    try {
      const actual = await calcularHuellaCodigo(raiz);
      if (!detenido && actual !== anterior) {
        anterior = actual;
        await alCambiar();
      }
    } catch (error) {
      if (!detenido) alError(error);
    } finally {
      comprobando = false;
    }
  }
  const temporizador = setInterval(() => void comprobar(), intervaloMilisegundos);
  return {
    comprobar: comprobar,
    detener: () => {
      detenido = true;
      clearInterval(temporizador);
    }
  };
}
export { vigilarCodigoFuente };
