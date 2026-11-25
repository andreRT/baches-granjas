import {existsSync as existeRuta} from 'node:fs';
import {mkdir as crearCarpeta, readFile as leerArchivo, writeFile as escribirArchivo} from 'node:fs/promises';
import {createHash as crearResumen} from 'node:crypto';
import {execFileSync as ejecutarPrograma} from 'node:child_process';
import rutas from 'node:path';
import {RAIZ} from '../server/config.js';

// Distribucion oficial integrada en el proyecto, independiente de Codex y de PATH.
const versionPython = '3.14.10';
const resumenEsperado = '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159';
const origenDescarga = `https://www.python.org/ftp/python/${versionPython}/python-${versionPython}-embed-amd64.zip`;
const carpetaPython = rutas.join(RAIZ, '.python');
const ejecutablePython = rutas.join(carpetaPython, 'python.exe');

try {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Este instalador local requiere Windows de 64 bits (x64). Configura PYTHON_EJECUTABLE para otra plataforma.');
  }
  if (!existeRuta(ejecutablePython)) {
    if (existeRuta(carpetaPython)) throw new Error('La carpeta .python ya existe sin un interprete completo. Revisala antes de volver a preparar Python.');
    const carpetaDescargas = rutas.join(RAIZ, 'data/descargas-python');
    await crearCarpeta(carpetaDescargas, {recursive: true});
    const archivoDescargado = rutas.join(carpetaDescargas, `python-${versionPython}-embed-amd64.zip`);
    let contenido;
    if (existeRuta(archivoDescargado)) contenido = await leerArchivo(archivoDescargado);
    else {
      console.log(`Descargando Python ${versionPython} desde python.org...`);
      const respuesta = await fetch(origenDescarga, {signal: AbortSignal.timeout(60000)});
      if (!respuesta.ok) throw new Error(`La descarga de Python fallo (HTTP ${respuesta.status}).`);
      contenido = Buffer.from(await respuesta.arrayBuffer());
    }
    if (crearResumen('sha256').update(contenido).digest('hex') !== resumenEsperado) {
      throw new Error('El SHA-256 no coincide con el publicado por Python. No se extraera ni ejecutara el archivo.');
    }
    await escribirArchivo(archivoDescargado, contenido);
    await crearCarpeta(carpetaPython);
    ejecutarPrograma(rutas.join(process.env.SystemRoot || 'C:/Windows', 'System32/tar.exe'), ['-xf', archivoDescargado, '-C', carpetaPython], {
      windowsHide: true, timeout: 30000, stdio: 'pipe'
    });
  }
  const versionObtenida = ejecutarPrograma(ejecutablePython, ['-c', 'import json, math, collections, unittest, sys; print(sys.version.split()[0])'], {
    windowsHide: true, timeout: 10000, encoding: 'utf8'
  }).trim();
  if (versionObtenida !== versionPython) throw new Error('La version del interprete local no coincide con la prevista.');
  console.log(`Python ${versionObtenida} listo en .python/python.exe.`);
} catch (error) {
  console.error(`No se pudo preparar Python: ${error.message}`);
  process.exitCode = 1;
}
