import {spawnSync as ejecutarProceso} from 'node:child_process';
import {obtenerEjecutablePython} from '../server/python.js';
import {RAIZ} from '../server/config.js';

const resultado = ejecutarProceso(obtenerEjecutablePython(), ['-m', 'unittest', 'discover', '-s', 'analysis', '-p', 'test_*.py'], {
  cwd: RAIZ, windowsHide: true, stdio: 'inherit'
});
if (resultado.error) console.error('No se pudo ejecutar Python. Revisa PYTHON_EJECUTABLE.');
process.exitCode = resultado.status ?? 1;
