import {spawn as crearProceso} from 'node:child_process';
import {createHash as crearResumen} from 'node:crypto';
import rutas from 'node:path';
import {RAIZ} from './config.js';
import {ErrorHttp} from './security.js';
import {obtenerEjecutablePython} from './python.js';

export function calcularHuella(contenido) {
  return crearResumen('sha256').update(JSON.stringify(contenido)).digest('hex');
}

export function ejecutarAnalisis(contenido) {
  return new Promise((resolver, rechazar) => {
    const procesoHijo = crearProceso(obtenerEjecutablePython(), [rutas.join(RAIZ, 'analysis/cluster.py')], {
      cwd: RAIZ, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    let salida = '', salidaErrores = '', terminado = false;
    function terminar(error, resultado) {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      if (error) rechazar(error); else resolver(resultado);
    }
    const temporizador = setTimeout(() => {
      terminar(new ErrorHttp(503, 'No se pudo actualizar el análisis dentro del tiempo disponible.'));
      procesoHijo.kill();
    }, 15000);
    procesoHijo.stdout.on('data', datos => {
      salida += datos;
      if (salida.length > 1000000) {
        terminar(new ErrorHttp(503, 'El resultado del análisis excedió el tamaño permitido.'));
        procesoHijo.kill();
      }
    });
    procesoHijo.stderr.on('data', datos => {salidaErrores = (salidaErrores + datos).slice(-2000);});
    procesoHijo.stdin.on('error', () => {});
    procesoHijo.on('error', () => terminar(new ErrorHttp(503, 'No se pudo ejecutar el análisis. Revisa PYTHON_EJECUTABLE.')));
    procesoHijo.on('close', codigo => {
      if (codigo !== 0) return terminar(new ErrorHttp(503, salidaErrores.includes('DLL load failed')
        ? 'No se pudo cargar una biblioteca de Python. Revisa el motor de agrupamiento configurado.'
        : 'No se pudo actualizar el análisis geográfico. Revisa Python y su configuración.'));
      try {
        const resultado = JSON.parse(salida);
        if (!Array.isArray(resultado.grupos) || resultado.cantidad_puntos !== contenido.puntos.length) throw new Error('Resultado incompleto');
        terminar(null, resultado);
      } catch {terminar(new ErrorHttp(503, 'El análisis no devolvió un resultado válido.'));}
    });
    procesoHijo.stdin.end(JSON.stringify(contenido));
  });
}

export function crearAnalizador() {
  const resultados = new Map();
  let cola = Promise.resolve();
  return function analizar(puntos, radioMetros = 150, minimoPuntos = 3) {
    const contenido = {puntos: puntos.map(({id, latitud, longitud}) => ({id, latitud, longitud})), radio_metros: radioMetros, minimo_puntos: minimoPuntos, motor: process.env.MOTOR_DBSCAN || 'python'};
    const huella = calcularHuella([obtenerEjecutablePython(), contenido]);
    if (resultados.has(huella)) return resultados.get(huella);
    const operacion = cola.then(() => ejecutarAnalisis(contenido));
    cola = operacion.catch(() => {});
    resultados.set(huella, operacion);
    operacion.catch(() => resultados.delete(huella));
    if (resultados.size > 20) resultados.delete(resultados.keys().next().value);
    return operacion;
  };
}
