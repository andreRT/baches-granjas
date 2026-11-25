import {existsSync as existeRuta} from 'node:fs';
import rutas from 'node:path';
import {RAIZ} from './config.js';

export function obtenerEjecutablePython() {
  const ejecutableConfigurado = process.env.PYTHON_EJECUTABLE?.trim();
  if (ejecutableConfigurado) {
    return /[/\\]/.test(ejecutableConfigurado)
      ? rutas.resolve(RAIZ, ejecutableConfigurado)
      : ejecutableConfigurado;
  }
  const interpreteLocal = rutas.join(RAIZ, '.python', 'python.exe');
  if (process.platform === 'win32' && existeRuta(interpreteLocal)) return interpreteLocal;
  const entorno = rutas.join(RAIZ, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  return existeRuta(entorno) ? entorno : process.platform === 'win32' ? 'python' : 'python3';
}
