import { spawn as crearProceso } from 'node:child_process';
import { RAIZ } from '../server/config.js';
import { vigilarCodigoFuente } from './watch-source.js';
let procesoHijo,
  monitor,
  deteniendo = false;
function iniciar() {
  const actual = crearProceso(process.execPath, ['--env-file-if-exists=.env', 'server/index.js'], {
    cwd: RAIZ,
    stdio: 'inherit',
    windowsHide: true
  });
  procesoHijo = actual;
  actual.on('error', error => {
    console.error(error.message);
    detener(1);
  });
  actual.on('exit', codigo => {
    if (!deteniendo && procesoHijo === actual) {
      console.log("La API terminó. Corrige el código y guarda para volver a iniciarla.");
      procesoHijo = null;
    }
  });
}
async function reiniciar() {
  if (deteniendo) return;
  console.log("Código de server/ o shared/ actualizado. Reiniciando la API…");
  const anterior = procesoHijo;
  procesoHijo = null;
  if (anterior && anterior.exitCode === null && anterior.signalCode === null) {
    await new Promise(resolver => {
      anterior.once('exit', resolver);
      if (!anterior.kill()) resolver();
    });
  }
  if (!deteniendo) iniciar();
}
function detener(codigo = 0) {
  if (deteniendo) return;
  deteniendo = true;
  monitor?.detener();
  if (procesoHijo && procesoHijo.exitCode === null) procesoHijo.kill();
  process.exit(codigo);
}
process.on('SIGINT', () => detener());
process.on('SIGTERM', () => detener());
monitor = await vigilarCodigoFuente({
  raiz: RAIZ,
  alCambiar: reiniciar,
  alError: error => console.error("No se pudo revisar el código:", error.code || error.message)
});
console.log("Recarga de API: solo cambios de código en server/ y shared/.");
iniciar();
