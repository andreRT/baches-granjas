import {ESTADOS} from '../shared/domain.js';

// Contrato público explícito: no incluye el motor, errores internos ni información de usuarios.
export function publicarConcentraciones(estado) {
  return {
    grupos: estado.grupos.map(grupo => ({
      id: grupo.id, cantidad: grupo.cantidad, latitud: grupo.latitud, longitud: grupo.longitud,
      radio_visual_metros: grupo.radio_visual_metros, nombre_zona: grupo.nombre_zona || 'Concentración en el mapa'
    })),
    cantidad_puntos: estado.cantidad_puntos, cantidad_aislados: estado.cantidad_aislados,
    radio_metros: estado.radio_metros, minimo_puntos: estado.minimo_puntos,
    fecha_actualizacion: estado.fecha_actualizacion || null,
    actualizacion_en_curso: !!estado.actualizacion_en_curso,
    desactualizado: !!estado.desactualizado,
    error: estado.error ? 'La detección de concentraciones no se pudo actualizar.' : null
  };
}

export async function consultarPanelPublico(baseDatos, concentraciones) {
  const columnas = 'id,folio,tipo,calle,colonia,latitud,longitud,estado,fecha_creacion';
  const [indicadores, puntos, recientes, estado] = await Promise.all([
    baseDatos.obtener(`SELECT COUNT(*) AS registrados,
      COALESCE(SUM(CASE WHEN estado = ? THEN 1 ELSE 0 END),0) AS pendientes,
      COALESCE(SUM(CASE WHEN estado = ? THEN 1 ELSE 0 END),0) AS en_proceso,
      COALESCE(SUM(CASE WHEN estado IN (?,?) THEN 1 ELSE 0 END),0) AS atendidos
      FROM reportes`, [ESTADOS.PENDIENTE, ESTADOS.EN_PROCESO, ESTADOS.RESUELTO, ESTADOS.FINALIZADO]),
    baseDatos.consultar(`SELECT ${columnas} FROM reportes WHERE estado <> ? ORDER BY fecha_creacion DESC,id`, [ESTADOS.FINALIZADO]),
    baseDatos.consultar(`SELECT ${columnas} FROM reportes ORDER BY fecha_creacion DESC,id LIMIT 4`),
    concentraciones.obtenerEstado()
  ]);
  return {
    indicadores: Object.fromEntries(Object.entries(indicadores).map(([clave, valor]) => [clave, Number(valor)])),
    puntos, recientes, concentraciones: publicarConcentraciones(estado)
  };
}
