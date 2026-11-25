import { useCallback as usarFuncionMemorizada, useEffect as usarEfecto, useRef as usarReferencia, useState as usarEstado } from 'react';
import { ArrowLeft as FlechaIzquierda, ArrowRight as FlechaDerecha, Bell as Campana, Check as MarcaVerificacion, CheckCheck as DobleVerificacion, CheckCircle2 as CirculoVerificado, ChevronRight as IndicadorDerecho, Clock3 as Reloj, ClipboardList as Portapapeles, FileText as DocumentoTexto, LayoutDashboard as IconoPanel, LoaderCircle as IndicadorCarga, LogOut as IconoSalir, Map as IconoMapa, MapPin as MarcadorUbicacion, Menu as IconoMenu, Plus as IconoAgregar, RefreshCw as IconoActualizar, Search as IconoBuscar, TrafficCone as ConoVial, Upload as IconoSubir, Wrench as LlaveHerramienta, X as IconoCerrar } from 'lucide-react';
import { consultarApi, formatearFecha, formatearFechaHora } from './api.js';
import { NOMBRES_ROLES, ESTADOS, LISTA_ESTADOS, puntoDentroZona, obtenerUnidadTerritorial } from '../shared/domain.js';
import MapaReportes from './MapView.jsx';
import PaginaMapa from './PaginaMapa.jsx';
import Concentraciones from './Concentraciones.jsx';
import './AccesoPublico.css';
import './Acceso.css';
const claseEstado = estado => ["pending", "progress", "resolved", "closed"][LISTA_ESTADOS.indexOf(estado)] || "pending";
const abreviarEstado = estado => estado === ESTADOS.EN_PROCESO ? "En proceso" : estado;
function EtiquetaEstado({
  estado: estado
}) {
  return <span className={`badge ${claseEstado(estado)}`}><i />{abreviarEstado(estado)}</span>;
}
const paginas = {
  inicio: 'Inicio',
  reportes: 'Reportes',
  mapa: 'Mapa de incidencias',
  nuevo: 'Nuevo reporte',
  notificaciones: 'Notificaciones'
};
function Aplicacion() {
  const [usuario, establecerUsuario] = usarEstado(null), [iniciando, establecerIniciando] = usarEstado(true), [errorInicio, establecerErrorInicio] = usarEstado('');
  const [pagina, establecerPagina] = usarEstado('inicio'), [destinoAcceso, establecerDestinoAcceso] = usarEstado('inicio');
  const [reportes, establecerReportes] = usarEstado([]), [puntos, establecerPuntos] = usarEstado([]), [notificaciones, establecerNotificaciones] = usarEstado([]), [ingenieros, establecerIngenieros] = usarEstado([]);
  const [panelPublico, establecerPanelPublico] = usarEstado(null), [concentraciones, establecerConcentraciones] = usarEstado(null), [focoZona, establecerFocoZona] = usarEstado(null);
  const [cargando, establecerCargando] = usarEstado(false), [error, establecerError] = usarEstado(''), [aviso, establecerAviso] = usarEstado('');
  const [idSeleccionado, establecerIdSeleccionado] = usarEstado(null), [menuMovilAbierto, establecerMenuMovilAbierto] = usarEstado(false);
  const identidadSesion = usarReferencia('publico'), cargaPendiente = usarReferencia(null), temporizadorAviso = usarReferencia(null);
  identidadSesion.current = usuario?.id || 'publico';
  const mostrarAviso = usarFuncionMemorizada(mensaje => {
    establecerAviso(mensaje);
    clearTimeout(temporizadorAviso.current);
    temporizadorAviso.current = setTimeout(() => establecerAviso(''), 6000);
  }, []);
  const volverAVistaPublica = usarFuncionMemorizada(() => {
    identidadSesion.current = 'publico';
    cargaPendiente.current?.controlador.abort();
    cargaPendiente.current = null;
    establecerUsuario(null);
    establecerReportes([]);
    establecerNotificaciones([]);
    establecerIngenieros([]);
    establecerPuntos([]);
    establecerConcentraciones(null);
    establecerPanelPublico(null);
    establecerFocoZona(null);
    establecerIdSeleccionado(null);
    establecerMenuMovilAbierto(false);
    establecerPagina('inicio');
    establecerError('');
  }, []);
  const inicializar = usarFuncionMemorizada(async () => {
    establecerErrorInicio('');
    establecerIniciando(true);
    try {
      await consultarApi('/salud');
      await consultarApi('/autenticacion/sesion').then(datos => establecerUsuario(datos.usuario)).catch(() => establecerUsuario(null));
    } catch {establecerErrorInicio('No pudimos conectar con el servicio. Intenta de nuevo en unos momentos.');}
    finally {establecerIniciando(false);}
  }, []);
  usarEfecto(() => {
    void inicializar();
    return () => clearTimeout(temporizadorAviso.current);
  }, [inicializar]);
  usarEfecto(() => {
    const sesionVencida = () => {volverAVistaPublica(); mostrarAviso('Tu sesión terminó.');};
    window.addEventListener('session-expired', sesionVencida);
    return () => window.removeEventListener('session-expired', sesionVencida);
  }, [volverAVistaPublica, mostrarAviso]);
  const cargarDatos = usarFuncionMemorizada(async ({silencioso = false} = {}) => {
    const identidad = usuario?.id || 'publico';
    if (cargaPendiente.current?.idUsuario === identidad) return;
    const carga = {idUsuario: identidad, controlador: new AbortController()};
    cargaPendiente.current = carga;
    if (!silencioso) establecerCargando(true);
    const opciones = {signal: carga.controlador.signal};
    try {
      if (!usuario) {
        const datos = await consultarApi('/publico/panel', opciones);
        if (identidadSesion.current !== identidad || opciones.signal.aborted) return;
        establecerPanelPublico(datos);
        establecerPuntos(datos.puntos);
        establecerConcentraciones(datos.concentraciones);
        establecerReportes([]);
        establecerNotificaciones([]);
        establecerIngenieros([]);
      } else {
        const [reportesRecibidos, puntosRecibidos, notificacionesRecibidas, ingenierosRecibidos, concentracionesRecibidas] = await Promise.all([
          consultarApi('/reportes', opciones), consultarApi('/mapa', opciones), consultarApi('/notificaciones', opciones), usuario.rol === 'administracion' ? consultarApi('/ingenieros', opciones) : Promise.resolve([]), consultarApi('/concentraciones', opciones)
        ]);
        if (identidadSesion.current !== identidad || opciones.signal.aborted) return;
        establecerReportes(reportesRecibidos);
        establecerPuntos(puntosRecibidos);
        establecerNotificaciones(notificacionesRecibidas);
        establecerIngenieros(ingenierosRecibidos);
        establecerConcentraciones(concentracionesRecibidas);
      }
      establecerError('');
    } catch (error) {if (identidadSesion.current === identidad && !opciones.signal.aborted) establecerError(error.message);}
    finally {if (cargaPendiente.current === carga) {cargaPendiente.current = null; establecerCargando(false);}}
  }, [usuario]);
  usarEfecto(() => {
    void cargarDatos();
    const identidad = usuario?.id || 'publico';
    const actualizarAlVolver = () => {if (document.visibilityState === 'visible') void cargarDatos({silencioso: true});};
    const temporizador = setInterval(actualizarAlVolver, 15000);
    document.addEventListener('visibilitychange', actualizarAlVolver);
    return () => {
      clearInterval(temporizador);
      document.removeEventListener('visibilitychange', actualizarAlVolver);
      if (cargaPendiente.current?.idUsuario === identidad) {cargaPendiente.current.controlador.abort(); cargaPendiente.current = null;}
    };
  }, [cargarDatos]);
  usarEfecto(() => {window.scrollTo(0, 0);}, [pagina, usuario]);
  function navegar(siguiente) {
    if (!usuario && ['nuevo','reportes','notificaciones'].includes(siguiente)) {establecerDestinoAcceso(siguiente); siguiente = 'acceso';}
    establecerPagina(siguiente);
    establecerFocoZona(null);
    establecerMenuMovilAbierto(false);
    establecerError('');
  }
  function abrirAcceso() {establecerDestinoAcceso(pagina === 'mapa' ? 'mapa' : 'inicio'); navegar('acceso');}
  async function cerrarSesion() {
    try {await consultarApi('/autenticacion/salir', {method: 'POST'}); volverAVistaPublica();}
    catch (error) {mostrarAviso(error.message);}
  }
  function abrirReporte(id) {
    if (!usuario) return;
    if (reportes.some(reporte => reporte.id === id)) establecerIdSeleccionado(id);
    else mostrarAviso('No tienes acceso al detalle de este reporte.');
  }
  function verZona(zona) {
    navegar('mapa'); establecerFocoZona({...zona, id: zona.id_concentracion || zona.id});
    if (zona.concentracion_activa === 0) mostrarAviso('Esta concentración ya no está activa.');
  }
  async function notificarCambio(mensaje) {
    mostrarAviso(mensaje);
    // Una lectura anterior al cambio no debe sustituir los datos recién guardados.
    cargaPendiente.current?.controlador.abort();
    cargaPendiente.current = null;
    await cargarDatos();
  }
  if (iniciando) return <main className="boot"><IndicadorCarga className="spin" /><p>Cargando…</p></main>;
  if (errorInicio) return <main className="boot"><ConoVial size={40} /><h1>Servicio no disponible</h1><p>{errorInicio}</p><button className="button primary" onClick={inicializar}><IconoActualizar size={16} />Reintentar</button></main>;
  if (!usuario && pagina === 'acceso') return <><InicioSesion alVolver={() => navegar('inicio')} alIniciarSesion={cuenta => {
    identidadSesion.current = cuenta.id;
    establecerUsuario(cuenta);
    establecerPagina(destinoAcceso === 'nuevo' && cuenta.rol !== 'ciudadano' ? 'inicio' : destinoAcceso);
  }} />{aviso && <div className="toast" role="status">{aviso}</div>}</>;
  const sinLeer = notificaciones.filter(notificacion => !notificacion.fecha_lectura).length;
  const titulo = paginas[pagina] || paginas.inicio;
  return <div className={`app-layout ${!usuario ? 'public-dashboard' : ''}`}>
    {menuMovilAbierto && <div className="nav-backdrop" onClick={() => establecerMenuMovilAbierto(false)} />}
    <aside className={`sidebar ${menuMovilAbierto ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={evento => {evento.preventDefault(); navegar('inicio');}}><span className="brand-mark"><ConoVial size={27} strokeWidth={1.7} /></span><span>Granjas México<small>REPORTE CIUDADANO</small></span></a>
      <nav aria-label="Navegación principal">
        <BotonNavegacion icono={IconoPanel} activo={pagina === 'inicio'} alPulsar={() => navegar('inicio')}>Inicio</BotonNavegacion>
        {usuario && <BotonNavegacion icono={Portapapeles} activo={pagina === 'reportes'} alPulsar={() => navegar('reportes')}>{usuario.rol === 'ciudadano' ? 'Mis reportes' : usuario.rol === 'administracion' ? 'Gestión de reportes' : 'Mis asignaciones'}</BotonNavegacion>}
        <BotonNavegacion icono={IconoMapa} activo={pagina === 'mapa'} alPulsar={() => navegar('mapa')}>Mapa de incidencias</BotonNavegacion>
        {usuario && <BotonNavegacion icono={Campana} activo={pagina === 'notificaciones'} alPulsar={() => navegar('notificaciones')} cantidad={sinLeer}>Notificaciones</BotonNavegacion>}
      </nav>
      <div className="sidebar-bottom"><div className="local-badge"><span />Granjas México, Iztacalco</div>{usuario && <div className="profile"><div className="avatar">{usuario.nombre.slice(0, 1).toUpperCase()}</div><div><b>{usuario.nombre.split(' ·')[0]}</b><small>{NOMBRES_ROLES[usuario.rol]}</small></div><button onClick={cerrarSesion} aria-label="Cerrar sesión" title="Cerrar sesión"><IconoSalir size={17} /></button></div>}</div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label="Abrir menú" onClick={() => establecerMenuMovilAbierto(true)}><IconoMenu /></button><span>Comunidad</span><IndicadorDerecho size={13} /><strong>{pagina === 'inicio' ? 'Inicio' : pagina === 'reportes' ? 'Reportes' : pagina === 'mapa' ? 'Mapa' : pagina === 'nuevo' ? 'Nuevo reporte' : 'Notificaciones'}</strong></div><div className="topbar-actions">{usuario ? <button className="icon-button notification-button" onClick={() => navegar('notificaciones')} aria-label={`Notificaciones: ${sinLeer} sin leer`}><Campana size={20} />{sinLeer > 0 && <i />}</button> : <button className="button secondary public-login" onClick={abrirAcceso}>Iniciar sesión</button>}</div></header>
      <main className="main-content">
        <div className="page-heading"><h1>{titulo}</h1>{(!usuario || usuario.rol === 'ciudadano') && pagina !== 'nuevo' && <div className="heading-actions"><button className="button primary" onClick={() => navegar('nuevo')}><IconoAgregar size={17} />Crear reporte</button></div>}</div>
        {error && <div className="error-banner" role="alert">{error}<button onClick={cargarDatos}>Reintentar</button></div>}
        {pagina === 'inicio' && <><Concentraciones estado={concentraciones} alVerZona={verZona} limite={3} /><PanelInicio usuario={usuario} panelPublico={panelPublico} reportes={reportes} puntos={puntos} grupos={concentraciones?.grupos} abrirReporte={abrirReporte} navegar={navegar} /></>}
        {pagina === 'reportes' && usuario && <ListaReportes reportes={reportes} abrirReporte={abrirReporte} cargando={cargando} />}
        {pagina === 'mapa' && <PaginaMapa puntos={puntos} abrirReporte={abrirReporte} concentraciones={concentraciones} alVerZona={verZona} foco={focoZona} publico={!usuario} />}
        {pagina === 'nuevo' && usuario?.rol === 'ciudadano' && <FormularioReporte usuario={usuario} alCancelar={() => navegar('inicio')} alCrear={async resultado => {await notificarCambio(`Reporte ${resultado.folio} registrado correctamente.`); navegar('reportes'); establecerIdSeleccionado(resultado.id);}} />}
        {pagina === 'notificaciones' && usuario && <ListaNotificaciones notificaciones={notificaciones} abrirReporte={establecerIdSeleccionado} verZona={verZona} alMarcarLeida={async id => {
          try {await consultarApi(`/notificaciones/${id}/leer`, {method: 'POST'}); await cargarDatos();} catch (error) {mostrarAviso(error.message);}
        }} />}
      </main>
    </div>
    {idSeleccionado && usuario && <DetalleReporte id={idSeleccionado} usuario={usuario} ingenieros={ingenieros} alCerrar={() => establecerIdSeleccionado(null)} alActualizar={notificarCambio} />}
    {aviso && <div className="toast" role="status"><CirculoVerificado size={18} />{aviso}<button aria-label="Cerrar aviso" onClick={() => establecerAviso('')}><IconoCerrar size={15} /></button></div>}
  </div>;
}
export {Aplicacion as default};
function BotonNavegacion({
  icono: Icono,
  activo: activo,
  alPulsar: alPulsar,
  children: hijos,
  cantidad: cantidad
}) {
  return <button className={`nav-item ${activo ? 'active' : ''}`} onClick={alPulsar} aria-current={activo ? "page" : undefined}><Icono size={18} strokeWidth={1.7} /><span>{hijos}</span>{cantidad > 0 && <b className="nav-count">{cantidad}</b>}</button>;
}
function InicioSesion({alIniciarSesion, alVolver}) {
  const [registrando, establecerRegistrando] = usarEstado(false);
  const [formulario, establecerFormulario] = usarEstado({nombre: '', correo: '', contrasena: ''});
  const [procesando, establecerProcesando] = usarEstado(false), [error, establecerError] = usarEstado('');
  async function enviarFormulario(evento) {
    evento.preventDefault();
    establecerProcesando(true);
    establecerError('');
    try {
      const datos = await consultarApi(`/autenticacion/${registrando ? 'registro' : 'ingresar'}`, {method: 'POST', body: JSON.stringify(formulario)});
      alIniciarSesion(datos.usuario);
    } catch (error) {establecerError(error.message);}
    finally {establecerProcesando(false);}
  }
  return <main className="access-page"><section className="access-form" aria-labelledby="titulo-acceso">
    <button type="button" className="back-public-dashboard" onClick={alVolver}>Volver al inicio</button>
    <h1 id="titulo-acceso">{registrando ? 'Registro ciudadano' : 'Iniciar sesión'}</h1>
    <form onSubmit={enviarFormulario}>
      {registrando && <Campo etiqueta="Nombre completo"><input autoComplete="name" required minLength={2} maxLength={100} value={formulario.nombre} onChange={evento => establecerFormulario({...formulario, nombre: evento.target.value})} /></Campo>}
      <Campo etiqueta="Correo electrónico"><input type="email" autoComplete="email" required value={formulario.correo} onChange={evento => establecerFormulario({...formulario, correo: evento.target.value})} /></Campo>
      <Campo etiqueta="Contraseña"><input type="password" autoComplete={registrando ? 'new-password' : 'current-password'} required minLength={registrando ? 10 : 1} maxLength={128} value={formulario.contrasena} onChange={evento => establecerFormulario({...formulario, contrasena: evento.target.value})} /></Campo>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button disabled={procesando} className="button primary full">{procesando ? <IndicadorCarga className="spin" size={17} aria-label="Procesando" /> : registrando ? 'Registrarse' : 'Iniciar sesión'}</button>
    </form>
    <button type="button" className="auth-switch" disabled={procesando} onClick={() => {establecerRegistrando(!registrando); establecerError('');}}>{registrando ? 'Iniciar sesión' : 'Registrarse'}</button>
  </section></main>;
}
function PanelInicio({usuario, panelPublico, reportes, puntos, grupos, abrirReporte, navegar}) {
  const publico = !usuario, resumen = panelPublico?.indicadores;
  const indicadores = [
    {titulo: publico ? 'Reportes de la comunidad' : usuario.rol === 'ciudadano' ? 'Tus reportes' : usuario.rol === 'ingeniero' ? 'Reportes asignados' : 'Reportes registrados', cantidad: publico ? resumen?.registrados ?? null : reportes.length, icono: DocumentoTexto, clase: 'neutral'},
    {titulo: 'Pendientes', cantidad: publico ? resumen?.pendientes ?? null : reportes.filter(reporte => reporte.estado === ESTADOS.PENDIENTE).length, icono: Reloj, clase: 'pending'},
    {titulo: 'En proceso', cantidad: publico ? resumen?.en_proceso ?? null : reportes.filter(reporte => reporte.estado === ESTADOS.EN_PROCESO).length, icono: LlaveHerramienta, clase: 'progress'},
    {titulo: 'Atendidos', cantidad: publico ? resumen?.atendidos ?? null : reportes.filter(reporte => [ESTADOS.RESUELTO, ESTADOS.FINALIZADO].includes(reporte.estado)).length, icono: DobleVerificacion, clase: 'resolved'}
  ];
  return <>
    <section className="metrics">{indicadores.map(({titulo, cantidad, icono: Icono, clase}) => <article className="metric" key={titulo}><div><span>{titulo}</span><div className={`metric-icon ${clase}`}><Icono size={19} /></div></div><strong>{cantidad === null ? '—' : cantidad.toString().padStart(2, '0')}</strong></article>)}</section>
    <section className="panel overview-map simple-overview"><div className="panel-heading"><h2>{publico ? 'Mapa de calor' : 'Mapa de incidencias'}</h2><button className="text-button" onClick={() => navegar('mapa')}>Explorar mapa</button></div>
      <MapaReportes mostrarCalor={publico} puntos={puntos} grupos={grupos} alAbrirReporte={abrirReporte} />
      <div className="map-bottom"><div className="legend"><span><i className="dot pending" />Pendiente</span><span><i className="dot progress" />En proceso</span><span><i className="dot resolved" />Resuelto</span></div><span>{puntos.length} activos</span></div>
    </section>
    <section className="panel recent-panel"><div className="panel-heading"><h2>{usuario?.rol === 'ciudadano' ? 'Tus reportes recientes' : 'Reportes recientes'}</h2><button className="text-button" onClick={() => navegar(publico ? 'mapa' : 'reportes')}>{publico ? 'Ver en mapa' : 'Ver todos'}</button></div><TablaReportes publica={publico} reportes={publico ? panelPublico?.recientes || [] : reportes.slice(0,4)} abrirReporte={abrirReporte} /></section>
  </>;
}
function TablaReportes({
  reportes: reportes,
  abrirReporte: abrirReporte,
  publica = false
}) {
  if (!reportes.length) return <div className="empty-state"><Portapapeles size={30} /><h3>Sin reportes.</h3></div>;
  return <div className="table-scroll"><table><thead><tr><th>Folio / incidencia</th><th>Ubicación</th><th>Fecha de registro</th><th>Estado</th>{!publica && <th><span className="sr-only">Detalle</span></th>}</tr></thead><tbody>{reportes.map(reporte => <tr key={reporte.id}><td>{publica ? <span className="folio-public">{reporte.folio}</span> : <button className="folio-button" onClick={() => abrirReporte(reporte.id)}>{reporte.folio}</button>}<small>{reporte.tipo}</small></td><td><span className="table-location"><MarcadorUbicacion size={14} />{reporte.calle}</span><small>{reporte.colonia || 'Granjas México'}</small></td><td>{formatearFecha(reporte.fecha_creacion)}</td><td><EtiquetaEstado estado={reporte.estado} /></td>{!publica && <td><button className="icon-button" aria-label={`Abrir reporte ${reporte.folio}`} onClick={() => abrirReporte(reporte.id)}><IndicadorDerecho size={17} /></button></td>}</tr>)}</tbody></table></div>;
}
function ListaReportes({
  reportes: reportes,
  abrirReporte: abrirReporte,
  cargando: cargando
}) {
  const [busqueda, establecerBusqueda] = usarEstado(""),
    [estado, establecerEstado] = usarEstado("");
  const filtrados = reportes.filter(reporte => (!estado || reporte.estado === estado) && `${reporte.folio} ${reporte.calle}`.toLowerCase().includes(busqueda.toLowerCase()));
  return <section className="panel report-list"><div className="list-tools"><label className="search-field"><IconoBuscar size={17} /><input aria-label="Buscar por folio o calle" placeholder="Buscar por folio o calle…" value={busqueda} onChange={evento => establecerBusqueda(evento.target.value)} /></label><select aria-label="Filtrar por estado" value={estado} onChange={evento => establecerEstado(evento.target.value)}><option value="">Todos los estados</option>{LISTA_ESTADOS.map(segmento => <option key={segmento}>{segmento}</option>)}</select><span>{filtrados.length} reportes</span></div>{cargando && !reportes.length ? <div className="empty-state"><IndicadorCarga className="spin" /><p>Cargando reportes…</p></div> : <TablaReportes reportes={filtrados} abrirReporte={abrirReporte} />}</section>;
}
function Campo({
  etiqueta: etiqueta,
  children: hijos,
  ayuda: ayuda,
  anchoCompleto = false
}) {
  return <label className={`field ${anchoCompleto ? 'wide' : ''}`}><span>{etiqueta}</span>{hijos}{ayuda && <small>{ayuda}</small>}</label>;
}
function SelectorFotografia({
  archivo: archivo,
  alCambiar: alCambiar,
  etiqueta = "Fotografía de la incidencia"
}) {
  const [vistaPrevia, establecerVistaPrevia] = usarEstado("");
  usarEfecto(() => {
    if (!archivo) {
      establecerVistaPrevia("");
      return;
    }
    const direccionUrl = URL.createObjectURL(archivo);
    establecerVistaPrevia(direccionUrl);
    return () => URL.revokeObjectURL(direccionUrl);
  }, [archivo]);
  return <label className={`photo-input ${archivo ? 'has-photo' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" required onChange={evento => alCambiar(evento.target.files?.[0] || null)} />{vistaPrevia ? <img src={vistaPrevia} alt="Vista previa del archivo seleccionado" /> : <IconoSubir size={27} strokeWidth={1.5} />}<span><b>{archivo ? archivo.name : etiqueta}</b><small>{archivo ? "Pulsa para cambiar la fotografía" : "Selecciona un archivo JPG, PNG o WebP · Hasta 5 MB"}</small></span></label>;
}
function FormularioReporte({
  usuario: usuario,
  alCrear: alCrear,
  alCancelar: alCancelar
}) {
  const [campos, establecerCampos] = usarEstado({
    tipo: "Bache",
    descripcion: "",
    calle: "",
    entre_calles: "",
    numero_exterior: "",
    referencias: "",
    codigo_postal: "08400",
    correo_contacto: usuario.correo,
    telefono: "",
    latitud: "",
    longitud: ""
  });
  const [archivo, establecerArchivo] = usarEstado(null),
    [error, establecerError] = usarEstado(""),
    [procesando, establecerProcesando] = usarEstado(false);
  const seleccionado = campos.latitud !== "" && campos.longitud !== "" ? [Number(campos.latitud), Number(campos.longitud)] : null;
  const unidadSeleccionada = seleccionado ? obtenerUnidadTerritorial(...seleccionado) : null;
  const entrada = (nombre, propiedades = {}) => <input {...propiedades} name={nombre} required value={campos[nombre]} onChange={evento => establecerCampos(actual => ({
    ...actual,
    [nombre]: evento.target.value
  }))} />;
  async function enviarFormulario(evento) {
    evento.preventDefault();
    establecerError("");
    if (!seleccionado || !puntoDentroZona(...seleccionado)) {
      establecerError("Señala una ubicación dentro de Granjas México I o II.");
      return;
    }
    if (!archivo || archivo.size > 5 * 1024 * 1024) {
      establecerError("Adjunta una fotografía de hasta 5 MB.");
      return;
    }
    establecerProcesando(true);
    try {
      const cuerpo = new FormData();
      for (const [nombre, valor] of Object.entries(campos)) cuerpo.append(nombre, valor);
      cuerpo.append("fotografia", archivo);
      const resultado = await consultarApi("/reportes", {
        method: 'POST',
        body: cuerpo
      });
      await alCrear(resultado);
    } catch (error) {
      establecerError(error.message);
    } finally {
      establecerProcesando(false);
    }
  }
  return <form className="report-form" onSubmit={enviarFormulario}><section className="panel form-panel"><div className="form-section-title"><div><h2>Incidencia</h2></div></div><div className="form-grid"><Campo etiqueta="Tipo de incidencia"><select value={campos.tipo} onChange={evento => establecerCampos({
            ...campos,
            tipo: evento.target.value
          })}><option>Bache</option><option>Socavón</option></select></Campo><Campo etiqueta="Descripción" anchoCompleto><textarea required minLength={10} maxLength={2000} rows={3} placeholder="Describe lo que observas y cómo afecta el paso…" value={campos.descripcion} onChange={evento => establecerCampos({
            ...campos,
            descripcion: evento.target.value
          })} /></Campo><div className="wide"><SelectorFotografia archivo={archivo} alCambiar={establecerArchivo} /></div></div></section><section className="panel form-panel"><div className="form-section-title"><div><h2>Ubicación</h2></div></div><MapaReportes seleccionado={seleccionado} alSeleccionar={([latitud, longitud]) => establecerCampos(actual => ({
        ...actual,
        latitud: String(latitud),
        longitud: String(longitud)
      }))} />{seleccionado && !unidadSeleccionada && <p className="form-error" role="status">La ubicación está fuera de Granjas México I y II.</p>}<div className="form-grid"><Campo etiqueta="Calle">{entrada("calle", {
            placeholder: 'Ej. Añil',
            minLength: 2,
            maxLength: 160
          })}</Campo><Campo etiqueta="Entre qué calles">{entrada("entre_calles", {
            placeholder: 'Ej. Avena y Resina',
            minLength: 3,
            maxLength: 200
          })}</Campo><Campo etiqueta="Número exterior cercano">{entrada("numero_exterior", {
            placeholder: 'Número o S/N',
            maxLength: 30
          })}</Campo><Campo etiqueta="Código postal">{entrada("codigo_postal", {
            pattern: '[0-9]{5}',
            inputMode: 'numeric',
            maxLength: 5
          })}</Campo><Campo etiqueta="Colonia"><input value={unidadSeleccionada?.nombre || "Selecciona una ubicación"} readOnly /></Campo><Campo etiqueta="Alcaldía"><input value="Iztacalco" readOnly /></Campo><Campo etiqueta="Latitud">{entrada("latitud", {
            type: 'number',
            step: 'any',
            placeholder: '19.397500'
          })}</Campo><Campo etiqueta="Longitud">{entrada("longitud", {
            type: 'number',
            step: 'any',
            placeholder: '-99.100000'
          })}</Campo><Campo etiqueta="Referencias del lugar" anchoCompleto>{entrada("referencias", {
            placeholder: 'Un comercio, cruce o punto de referencia cercano',
            minLength: 3,
            maxLength: 500
          })}</Campo></div></section><section className="panel form-panel"><div className="form-section-title"><div><h2>Datos de contacto</h2></div></div><div className="form-grid"><Campo etiqueta="Correo electrónico">{entrada("correo_contacto", {
            type: 'email',
            maxLength: 254
          })}</Campo><Campo etiqueta="Teléfono">{entrada("telefono", {
            type: 'tel',
            inputMode: 'tel',
            placeholder: '10 dígitos',
            minLength: 10,
            maxLength: 25
          })}</Campo></div></section>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="button secondary" disabled={procesando} onClick={alCancelar}><FlechaIzquierda size={16} />Cancelar</button><button className="button primary" disabled={procesando}>{procesando ? <IndicadorCarga size={17} className="spin" /> : <IconoAgregar size={17} />}Registrar reporte</button></div></form>;
}
function ListaNotificaciones({
  notificaciones: notificaciones,
  alMarcarLeida: alMarcarLeida,
  verZona,
  abrirReporte: abrirReporte
}) {
  return <section className="panel notifications-list"><div className="panel-heading"><div><h2>Actividad reciente</h2><p>{notificaciones.filter(notificacion => !notificacion.fecha_lectura).length} avisos sin leer</p></div></div>{!notificaciones.length && <div className="empty-state"><Campana size={30} /><h3>Sin notificaciones.</h3></div>}{notificaciones.map(notificacion => <article className={`notice ${notificacion.fecha_lectura ? 'read' : ''}`} key={notificacion.id}><div className="notice-icon"><Campana size={18} /></div><div><p>{notificacion.mensaje}</p><small>{formatearFechaHora(notificacion.fecha_creacion)}</small><button className="text-button" onClick={() => {
          if (notificacion.id_concentracion) verZona(notificacion); else abrirReporte(notificacion.id_reporte);
          if (!notificacion.fecha_lectura) void alMarcarLeida(notificacion.id);
        }}>{notificacion.id_concentracion ? 'Ver zona' : 'Ver reporte'}<FlechaDerecha size={13} /></button></div>{!notificacion.fecha_lectura && <button className="icon-button" aria-label="Marcar aviso como leído" onClick={() => alMarcarLeida(notificacion.id)}><MarcaVerificacion size={18} /></button>}</article>)}</section>;
}
function DetalleReporte({
  id,
  usuario: usuario,
  ingenieros: ingenieros,
  alCerrar: alCerrar,
  alActualizar: alActualizar
}) {
  const [reporte, establecerReporte] = usarEstado(null),
    [error, establecerError] = usarEstado(""),
    [procesando, establecerProcesando] = usarEstado(false),
    [ingeniero, establecerIngeniero] = usarEstado(""),
    [observaciones, establecerObservaciones] = usarEstado(""),
    [fotografia, establecerFotografia] = usarEstado(null);
  const dialogo = usarReferencia(null),
    botonCerrar = usarReferencia(null);
  const recargar = usarFuncionMemorizada(async () => {
    try {
      establecerReporte(await consultarApi(`/reportes/${id}`));
    } catch (error) {
      establecerError(error.message);
    }
  }, [id]);
  usarEfecto(() => {
    void recargar();
  }, [recargar]);
  usarEfecto(() => {
    const anterior = document.activeElement,
      desbordamiento = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botonCerrar.current?.focus();
    const clave = evento => {
      if (evento.key === "Escape" && !procesando) alCerrar();
      if (evento.key === "Tab") {
        const elementos = [...dialogo.current.querySelectorAll("button:not(:disabled), a[href], input, select, textarea")].filter(elemento => elemento.offsetParent !== null);
        const primero = elementos[0],
          ultimo = elementos.at(-1);
        if (evento.shiftKey && document.activeElement === primero) {
          evento.preventDefault();
          ultimo?.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primero?.focus();
        }
      }
    };
    window.addEventListener('keydown', clave);
    return () => {
      document.body.style.overflow = desbordamiento;
      anterior?.focus();
      window.removeEventListener('keydown', clave);
    };
  }, [procesando, alCerrar]);
  let siguiente = null;
  if (reporte && usuario.rol === "administracion" && reporte.estado === ESTADOS.PENDIENTE) siguiente = ESTADOS.EN_PROCESO;
  if (reporte && usuario.rol === "ingeniero" && reporte.id_ingeniero === usuario.id && reporte.estado === ESTADOS.EN_PROCESO) siguiente = ESTADOS.RESUELTO;
  if (reporte && usuario.rol === "administracion" && reporte.estado === ESTADOS.RESUELTO) siguiente = ESTADOS.FINALIZADO;
  async function cambiarEstado(evento) {
    evento.preventDefault();
    establecerProcesando(true);
    establecerError("");
    try {
      const cuerpo = new FormData();
      cuerpo.append("estado", siguiente);
      cuerpo.append("observaciones", observaciones);
      cuerpo.append("id_ingeniero", ingeniero);
      if (fotografia) cuerpo.append("fotografia", fotografia);
      await consultarApi(`/reportes/${id}/estado`, {
        method: 'POST',
        body: cuerpo
      });
      establecerFotografia(null);
      establecerObservaciones("");
      await recargar();
      await alActualizar("Estado actualizado. El historial y los avisos se guardaron correctamente.");
    } catch (error) {
      establecerError(error.message);
    } finally {
      establecerProcesando(false);
    }
  }
  return <div className="modal-backdrop" onMouseDown={evento => {
    if (evento.target === evento.currentTarget && !procesando) alCerrar();
  }}><section className="detail-dialog" ref={dialogo} role="dialog" aria-modal="true" aria-labelledby="detail-title"><header className="detail-heading"><div><span className="eyebrow">DETALLE DEL REPORTE</span><h2 id="detail-title">{reporte?.folio || "Consultando reporte…"}</h2></div><button className="icon-button" ref={botonCerrar} disabled={procesando} aria-label="Cerrar detalle" onClick={alCerrar}><IconoCerrar size={21} /></button></header><div className="detail-content">{error && <p className="form-error" role="alert">{error}</p>}{!reporte && !error && <div className="empty-state"><IndicadorCarga className="spin" /></div>}{reporte && <><div className="detail-status"><EtiquetaEstado estado={reporte.estado} /><span>{reporte.tipo} · {formatearFecha(reporte.fecha_creacion)}</span></div><h3>{reporte.calle}</h3><p className="detail-description">{reporte.descripcion}</p><dl className="detail-grid"><div><dt>Entre calles</dt><dd>{reporte.entre_calles}</dd></div><div><dt>Número cercano</dt><dd>{reporte.numero_exterior}</dd></div><div><dt>Colonia / alcaldía</dt><dd>{reporte.colonia}, {reporte.alcaldia}</dd></div><div><dt>Código postal</dt><dd>{reporte.codigo_postal}</dd></div><div className="wide"><dt>Referencias</dt><dd>{reporte.referencias}</dd></div><div><dt>Ubicación</dt><dd>{Number(reporte.latitud).toFixed(6)}, {Number(reporte.longitud).toFixed(6)}</dd></div><div><dt>Supervisor</dt><dd>{reporte.nombre_ingeniero || "Por asignar"}</dd></div>{reporte.correo_contacto && <div><dt>Correo de contacto</dt><dd>{reporte.correo_contacto}</dd></div>}{reporte.telefono && <div><dt>Teléfono</dt><dd>{reporte.telefono}</dd></div>}</dl><h3>Evidencia</h3><div className="evidence-grid">{reporte.fotografias.map(elemento => <figure key={elemento.id}><a href={`/api/fotografias/${elemento.id}`} target="_blank" rel="noreferrer"><img src={`/api/fotografias/${elemento.id}`} alt={elemento.categoria === "incidencia" ? "Evidencia adjunta de la incidencia" : "Evidencia adjunta de resolución"} /></a><figcaption>{elemento.categoria === "incidencia" ? "Registro de la incidencia" : "Resolución del reporte"}</figcaption></figure>)}</div><h3>Historial de seguimiento</h3><ol className="timeline">{reporte.historial.map(evento => <li key={evento.id}><span className={`timeline-point ${claseEstado(evento.estado_nuevo)}`} /><b>{evento.estado_nuevo}</b><small>{formatearFechaHora(evento.fecha_creacion)} · {evento.nombre_responsable}</small><p>{evento.observaciones}</p></li>)}</ol>{siguiente && <form className="transition-form" onSubmit={cambiarEstado}><h3>{siguiente === ESTADOS.EN_PROCESO ? "Asignar atención" : siguiente === ESTADOS.RESUELTO ? "Registrar resolución" : "Confirmar cierre"}</h3>{siguiente === ESTADOS.EN_PROCESO && <Campo etiqueta="Ingeniero supervisor"><select required value={ingeniero} onChange={evento => establecerIngeniero(evento.target.value)}><option value="">Seleccionar supervisor</option>{ingenieros.map(ingenieroDisponible => <option value={ingenieroDisponible.id} key={ingenieroDisponible.id}>{ingenieroDisponible.nombre}</option>)}</select></Campo>}{siguiente === ESTADOS.RESUELTO && <SelectorFotografia archivo={fotografia} alCambiar={establecerFotografia} etiqueta="Fotografía de la resolución" />}<Campo etiqueta="Observaciones"><textarea rows={2} maxLength={1000} value={observaciones} onChange={evento => establecerObservaciones(evento.target.value)} placeholder="Agrega una nota para el seguimiento" /></Campo><button className="button primary full" disabled={procesando}>{procesando ? <IndicadorCarga className="spin" size={17} /> : <CirculoVerificado size={17} />}{siguiente === ESTADOS.EN_PROCESO ? "Asignar supervisor" : siguiente === ESTADOS.RESUELTO ? "Marcar como resuelto" : "Finalizar reporte"}</button></form>}</>}</div></section></div>;
}
