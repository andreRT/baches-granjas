import {Bell as Campana, LoaderCircle as IndicadorCarga} from 'lucide-react';
import './Concentraciones.css';

export default function Concentraciones({estado, alVerZona, limite}) {
  const grupos = estado?.grupos || [];
  const preparando = !estado || !estado.fecha_actualizacion && !estado.cantidad_puntos && !estado.error;
  return <section className="concentrations-panel" aria-label="Concentraciones de reportes">
    <div className="concentrations-heading"><div className="concentrations-symbol"><Campana size={21} /></div><h2>Zonas con concentración</h2></div>
    {estado?.error && <p className="concentrations-warning" role="status">{estado.fecha_actualizacion ? 'Concentraciones sin actualizar.' : 'No se pudieron cargar las concentraciones.'}</p>}
    {preparando ? <p className="concentrations-empty"><IndicadorCarga size={15} className="spin" />Cargando…</p> : grupos.length ? <div className="concentration-cards">{grupos.slice(0, limite ?? grupos.length).map(grupo => <article className="concentration-card" key={grupo.id}><span className="concentration-total">{grupo.cantidad}<small>reportes</small></span><h3>{grupo.nombre_zona || 'Zona de concentración'}</h3><button className="text-button" onClick={() => alVerZona(grupo)} aria-label={`Ver zona ${grupo.nombre_zona || grupo.cantidad + ' reportes'}`}>Ver zona</button></article>)}</div> : !estado?.error && <p className="concentrations-empty">Sin concentraciones.</p>}
  </section>;
}
