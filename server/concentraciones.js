import {randomUUID as generarIdentificador} from 'node:crypto';
import {calcularHuella, crearAnalizador} from './agrupamiento.js';
import {crearNotificacion} from './notifications.js';
import {configuracion} from './config.js';
import {ESTADOS, puntoDentroZona} from '../shared/domain.js';

const RADIO_METROS = 150, MINIMO_PUNTOS = 3;
const CONSULTA_PUNTOS = 'SELECT id,latitud,longitud,calle,colonia FROM reportes WHERE estado IN (?,?) ORDER BY id';
export async function consultarPuntosPorAtender(conexion) {
  return (await conexion.consultar(CONSULTA_PUNTOS, [ESTADOS.PENDIENTE, ESTADOS.EN_PROCESO]))
    .filter(punto => puntoDentroZona(punto.latitud, punto.longitud));
}
function nombreZona(puntos) {
  const frecuencias = new Map();
  for (const punto of puntos) {
    const nombre = `${punto.calle} · ${punto.colonia}`;
    frecuencias.set(nombre, (frecuencias.get(nombre) || 0) + 1);
  }
  return [...frecuencias].sort((primero, segundo) => segundo[1] - primero[1] || primero[0].localeCompare(segundo[0], 'es'))[0][0];
}

export function crearServicioConcentraciones(baseDatos, {analizar = crearAnalizador(), intervaloMilisegundos = 30000} = {}) {
  let enCurso = null, pendiente = false, detenido = false, temporizador = null, ultimoError = null;
  async function asegurarEstado() {
    const insercion = configuracion.motor === 'mysql' ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
    await baseDatos.ejecutar(`${insercion} INTO estado_concentraciones (id,huella,resultado) VALUES (?,?,?)`, ['principal', '', '{}']);
  }
  async function enviarAvisos(transaccion, fecha) {
    const grupos = await transaccion.consultar('SELECT * FROM concentraciones WHERE activa = 1 ORDER BY id');
    const destinatarios = await transaccion.consultar("SELECT id FROM usuarios WHERE rol = 'administracion'");
    for (const grupo of grupos) for (const destinatario of destinatarios) {
      const existente = await transaccion.obtener('SELECT id_notificacion FROM notificaciones_concentracion WHERE id_usuario = ? AND id_concentracion = ? AND umbral = ?', [destinatario.id, grupo.id, grupo.cantidad_ultimo_aviso]);
      if (existente) continue;
      const anterior = await transaccion.obtener('SELECT id_notificacion FROM notificaciones_concentracion WHERE id_usuario = ? AND id_concentracion = ? LIMIT 1', [destinatario.id, grupo.id]);
      const mensaje = `${anterior ? 'Aumentó la concentración' : 'Nueva zona con concentración'}: ${grupo.cantidad} reportes por atender cerca de ${grupo.nombre_zona}. Revisa la zona en el mapa.`;
      const idNotificacion = await crearNotificacion(transaccion, destinatario.id, {id: JSON.parse(grupo.ids_reportes)[0]}, mensaje, fecha, {asunto: 'Alerta de concentración de reportes · Granjas México'});
      await transaccion.ejecutar('INSERT INTO notificaciones_concentracion (id_notificacion,id_concentracion,id_usuario,umbral) VALUES (?,?,?,?)', [idNotificacion, grupo.id, destinatario.id, grupo.cantidad_ultimo_aviso]);
    }
  }
  async function guardarGrupos(transaccion, resultado, puntos, fecha) {
    const anteriores = (await transaccion.consultar('SELECT * FROM concentraciones WHERE activa = 1 ORDER BY id'))
      .map(grupo => ({...grupo, integrantes: new Set(JSON.parse(grupo.ids_reportes))}));
    const usados = new Set(), porIdentificador = new Map(puntos.map(punto => [punto.id, punto]));
    const grupos = [];
    for (const grupo of [...resultado.grupos].sort((primero, segundo) => segundo.cantidad - primero.cantidad || primero.id - segundo.id)) {
      const coincidencias = anteriores.filter(anterior => !usados.has(anterior.id)).map(anterior => ({
        anterior, compartidos: grupo.ids_reportes.filter(id => anterior.integrantes.has(id)).length
      })).filter(coincidencia => coincidencia.compartidos > 0).sort((primera, segunda) => segunda.compartidos - primera.compartidos || primera.anterior.id.localeCompare(segunda.anterior.id));
      const anterior = coincidencias[0]?.anterior;
      const id = anterior?.id || generarIdentificador();
      usados.add(id);
      const nombre = nombreZona(grupo.ids_reportes.map(identificador => porIdentificador.get(identificador)));
      const umbral = !anterior || grupo.cantidad >= anterior.cantidad_ultimo_aviso * 2 ? grupo.cantidad : anterior.cantidad_ultimo_aviso;
      const parametros = [nombre, JSON.stringify(grupo.ids_reportes), grupo.cantidad, grupo.latitud, grupo.longitud, grupo.radio_visual_metros, umbral, 1, fecha];
      if (anterior) {
        await transaccion.ejecutar('UPDATE concentraciones SET nombre_zona = ?, ids_reportes = ?, cantidad = ?, latitud = ?, longitud = ?, radio_visual_metros = ?, cantidad_ultimo_aviso = ?, activa = ?, fecha_actualizacion = ? WHERE id = ?', [...parametros, id]);
      } else {
        await transaccion.ejecutar('INSERT INTO concentraciones (nombre_zona,ids_reportes,cantidad,latitud,longitud,radio_visual_metros,cantidad_ultimo_aviso,activa,fecha_actualizacion,id,fecha_deteccion) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [...parametros, id, fecha]);
      }
      grupos.push({...grupo, id, nombre_zona: nombre});
    }
    for (const anterior of anteriores) if (!usados.has(anterior.id)) await transaccion.ejecutar('UPDATE concentraciones SET activa = 0, fecha_actualizacion = ? WHERE id = ?', [fecha, anterior.id]);
    return {...resultado, grupos};
  }
  async function comprobar() {
    await asegurarEstado();
    const puntos = await consultarPuntosPorAtender(baseDatos);
    if (puntos.length > 2000) throw new Error('El análisis automático admite hasta 2000 reportes por atender.');
    const huella = calcularHuella(['dbscan-v1', process.env.MOTOR_DBSCAN || 'python', puntos]);
    const anterior = await baseDatos.obtener('SELECT * FROM estado_concentraciones WHERE id = ?', ['principal']);
    const resultado = anterior.huella === huella ? null : await analizar(puntos, RADIO_METROS, MINIMO_PUNTOS);
    await baseDatos.transaccion(async transaccion => {
      const estado = await transaccion.obtener(`SELECT * FROM estado_concentraciones WHERE id = ?${configuracion.motor === 'mysql' ? ' FOR UPDATE' : ''}`, ['principal']);
      const actuales = await consultarPuntosPorAtender(transaccion);
      if (calcularHuella(['dbscan-v1', process.env.MOTOR_DBSCAN || 'python', actuales]) !== huella) {pendiente = true; return;}
      const fecha = new Date().toISOString();
      if (estado.huella !== huella) {
        if (!resultado) {pendiente = true; return;}
        const guardado = await guardarGrupos(transaccion, resultado, actuales, fecha);
        await transaccion.ejecutar('UPDATE estado_concentraciones SET huella = ?, resultado = ?, fecha_actualizacion = ? WHERE id = ?', [huella, JSON.stringify(guardado), fecha, 'principal']);
      }
      // La misma comprobación entrega un aviso a nuevas cuentas de alcaldía sin repetir los existentes.
      await enviarAvisos(transaccion, fecha);
    });
    ultimoError = null;
  }
  function solicitarActualizacion() {
    if (detenido) return Promise.resolve();
    pendiente = true;
    if (!enCurso) {
      enCurso = (async () => {
        do {
          pendiente = false;
          try {await comprobar();}
          catch (error) {ultimoError = error.message || 'No se pudo actualizar el análisis automático.';}
        } while (pendiente && !detenido);
      })().finally(() => {
        enCurso = null;
        if (pendiente && !detenido) void solicitarActualizacion();
      });
    }
    return enCurso;
  }
  return {
    analizar,
    solicitarActualizacion,
    async obtenerEstado() {
      const estado = await baseDatos.obtener('SELECT * FROM estado_concentraciones WHERE id = ?', ['principal']);
      return {
        grupos: [], cantidad_puntos: 0, cantidad_aislados: 0, radio_metros: RADIO_METROS, minimo_puntos: MINIMO_PUNTOS,
        ...(estado ? JSON.parse(estado.resultado) : {}), fecha_actualizacion: estado?.fecha_actualizacion || null,
        actualizacion_en_curso: !!enCurso, error: ultimoError, desactualizado: !!ultimoError
      };
    },
    iniciar() {
      if (temporizador) return;
      detenido = false;
      void solicitarActualizacion();
      temporizador = setInterval(() => void solicitarActualizacion(), intervaloMilisegundos);
      temporizador.unref();
    },
    async detener() {
      detenido = true;
      clearInterval(temporizador);
      temporizador = null;
      await enCurso;
    }
  };
}
