import {useEffect as usarEfecto, useState as usarEstado} from 'react';
import {consultarApi} from './api.js';
import {ESTADOS, LISTA_ESTADOS} from '../shared/domain.js';
import MapaReportes from './MapView.jsx';
import Concentraciones from './Concentraciones.jsx';

export default function PaginaMapa({puntos, abrirReporte, concentraciones, alVerZona, foco, publico = false}) {
  const [mostrarCalor, establecerMostrarCalor] = usarEstado(true);
  const [estado, establecerEstado] = usarEstado(''), [tipo, establecerTipo] = usarEstado('');
  const [fechaDesde, establecerFechaDesde] = usarEstado(''), [fechaHasta, establecerFechaHasta] = usarEstado('');
  const [analisis, establecerAnalisis] = usarEstado(null), [errorAnalisis, establecerErrorAnalisis] = usarEstado('');
  const tieneFiltros = !!(estado || tipo || fechaDesde || fechaHasta);
  const revisionPuntos = puntos.map(punto => `${punto.id}:${punto.estado}:${punto.latitud}:${punto.longitud}`).join('|');
  const filtrados = puntos.filter(punto => (!estado || punto.estado === estado) && (!tipo || punto.tipo === tipo)
    && (!fechaDesde || punto.fecha_creacion >= `${fechaDesde}T06:00:00.000Z`)
    && (!fechaHasta || new Date(punto.fecha_creacion).getTime() < Date.parse(`${fechaHasta}T00:00:00-06:00`) + 86400000));
  usarEfecto(() => {
    establecerAnalisis(null);
    establecerErrorAnalisis('');
    if (!tieneFiltros) return;
    const controlador = new AbortController();
    const temporizador = setTimeout(async () => {
      try {
        const parametros = new URLSearchParams({...estado && {estado}, ...tipo && {tipo}, ...fechaDesde && {desde: fechaDesde}, ...fechaHasta && {hasta: fechaHasta}});
        const resultado = await consultarApi(`${publico ? '/publico' : ''}/analisis?${parametros}`, {signal: controlador.signal});
        if (!controlador.signal.aborted) establecerAnalisis({...resultado, fecha_actualizacion: new Date().toISOString()});
      } catch (error) {
        if (!controlador.signal.aborted) establecerErrorAnalisis(error.message);
      }
    }, 250);
    return () => {clearTimeout(temporizador); controlador.abort();};
  }, [estado, tipo, fechaDesde, fechaHasta, revisionPuntos, tieneFiltros, publico]);
  const resultado = tieneFiltros ? analisis : concentraciones;
  const grupos = resultado?.grupos || [];
  return <>
    <Concentraciones estado={tieneFiltros ? {...analisis, error: errorAnalisis} : concentraciones} alVerZona={alVerZona} />
    <section className="panel full-map-panel"><div className="map-tools"><div><h2>Incidencias activas</h2><p>{filtrados.length} reportes</p></div><div className="segmented"><button className={!mostrarCalor ? 'selected' : ''} onClick={() => establecerMostrarCalor(false)}>Puntos</button><button className={mostrarCalor ? 'selected' : ''} onClick={() => establecerMostrarCalor(true)}>Calor</button></div></div>
      <div className="map-filters"><label>Estado<select value={estado} onChange={evento => establecerEstado(evento.target.value)}><option value="">Todos los activos</option>{LISTA_ESTADOS.filter(segmento => segmento !== ESTADOS.FINALIZADO).map(segmento => <option key={segmento}>{segmento}</option>)}</select></label><label>Incidencia<select value={tipo} onChange={evento => establecerTipo(evento.target.value)}><option value="">Todos los tipos</option><option>Bache</option><option>Socavón</option></select></label><label>Desde<input type="date" value={fechaDesde} max={fechaHasta || undefined} onChange={evento => establecerFechaDesde(evento.target.value)} /></label><label>Hasta<input type="date" value={fechaHasta} min={fechaDesde || undefined} onChange={evento => establecerFechaHasta(evento.target.value)} /></label></div>
      <MapaReportes ampliado puntos={filtrados} mostrarCalor={mostrarCalor} grupos={grupos} alAbrirReporte={abrirReporte} foco={foco} />
    </section>
  </>;
}
