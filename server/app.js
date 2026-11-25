import servidorExpress from 'express';
import gestorCargas from 'multer';
import { randomBytes as generarBytesAleatorios, randomUUID as generarIdentificador } from 'node:crypto';
import rutas from 'node:path';
import { existsSync as existeRuta } from 'node:fs';
import {crearServicioConcentraciones} from './concentraciones.js';
import {consultarPanelPublico, publicarConcentraciones} from './publico.js';
import { configuracion, RAIZ } from './config.js';
import { resumirContrasena, verificarContrasena, resumirToken, ErrorHttp, exigirTexto, validarCorreo, validarContrasena, limitarSolicitudes } from './security.js';
import { guardarFotografia, descartarFotografia } from './photos.js';
import { crearNotificacion } from './notifications.js';
import { ZONA_COBERTURA, ESTADOS, LISTA_ESTADOS, puedeConsultarReporte, puntoDentroZona, obtenerUnidadTerritorial, transicionPermitida } from '../shared/domain.js';
const usuarioPublico = usuario => ({
  id: usuario.id,
  nombre: usuario.nombre,
  correo: usuario.correo,
  rol: usuario.rol
});
const fechaActual = () => new Date().toISOString();
const cargaArchivos = gestorCargas({
  storage: gestorCargas.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 22,
    fieldSize: 8000,
    parts: 24
  }
});
function crearAplicacion(baseDatos, {concentraciones = crearServicioConcentraciones(baseDatos)} = {}) {
  const aplicacion = servidorExpress();
  aplicacion.locals.concentraciones = concentraciones;
  aplicacion.disable("x-powered-by");
  aplicacion.use((solicitud, respuesta, siguiente) => {
    respuesta.set({
      'X-Content-Type-Options': "nosniff",
      'Referrer-Policy': "same-origin",
      'X-Frame-Options': "DENY"
    });
    if (solicitud.path.startsWith("/api")) respuesta.set("Cache-Control", "no-store");
    // Las cookies SameSite=Strict y la validación de Origin protegen las operaciones del navegador.
    if (!["GET", "HEAD", "OPTIONS"].includes(solicitud.method) && solicitud.headers.origin && solicitud.headers.origin !== configuracion.origen) {
      return siguiente(new ErrorHttp(403, "Origen de la solicitud no autorizado."));
    }
    siguiente();
  });
  aplicacion.use(servidorExpress.json({
    limit: '32kb'
  }));
  aplicacion.use((solicitud, respuesta, siguiente) => {
    solicitud.body ??= {};
    siguiente();
  });
  aplicacion.use("/api", limitarSolicitudes(400, 60000));
  const limiteAutenticacion = limitarSolicitudes(30, 15 * 60000);
  aplicacion.get("/api/salud", (solicitud, respuesta) => respuesta.json({
    correcto: true,
    base_datos: configuracion.motor
  }));
  aplicacion.get("/api/configuracion", (solicitud, respuesta) => respuesta.json({ zona: ZONA_COBERTURA }));
  async function analizarSeleccion(solicitud) {
    const radioMetros = Number(solicitud.query.eps || 150), minimoPuntos = Number(solicitud.query.minimo_puntos || 3);
    if (!Number.isFinite(radioMetros) || radioMetros < 20 || radioMetros > 500 || !Number.isInteger(minimoPuntos) || minimoPuntos < 2 || minimoPuntos > 20) throw new ErrorHttp(400, 'Parámetros de agrupamiento inválidos.');
    const filtro = construirFiltroReportes(solicitud.query);
    const puntos = (await baseDatos.consultar(`SELECT r.id,r.latitud,r.longitud FROM reportes r WHERE r.estado IN (?,?) ${filtro.sentenciaSql} ORDER BY r.id`, [ESTADOS.PENDIENTE, ESTADOS.EN_PROCESO, ...filtro.parametros])).filter(punto => puntoDentroZona(punto.latitud, punto.longitud));
    if (puntos.length > 2000) throw new ErrorHttp(422, 'Reduce el periodo del análisis a un máximo de 2000 reportes.');
    return concentraciones.analizar(puntos, radioMetros, minimoPuntos);
  }
  // Solo estas consultas se sirven antes de exigir una sesión; las operaciones privadas conservan su autorización.
  aplicacion.get('/api/publico/panel', async (solicitud, respuesta) => respuesta.json(await consultarPanelPublico(baseDatos, concentraciones)));
  aplicacion.get('/api/publico/analisis', limitarSolicitudes(12, 60000), async (solicitud, respuesta) => {
    try {respuesta.json(publicarConcentraciones(await analizarSeleccion(solicitud)));}
    catch (error) {
      if (!error.status || error.status >= 500) throw new ErrorHttp(503, 'No se pudo actualizar la detección de concentraciones. Intenta de nuevo en unos momentos.');
      throw error;
    }
  });
  async function crearSesion(usuario, respuesta) {
    const tokenSesion = generarBytesAleatorios(32).toString("hex");
    await baseDatos.ejecutar("INSERT INTO sesiones (resumen_token,id_usuario,fecha_vencimiento) VALUES (?,?,?)", [resumirToken(tokenSesion), usuario.id, new Date(Date.now() + 8 * 3600000).toISOString()]);
    respuesta.cookie('baches_session', tokenSesion, {
      httpOnly: true,
      sameSite: 'strict',
      secure: configuracion.produccion,
      maxAge: 8 * 3600000,
      path: '/'
    });
  }
  aplicacion.post("/api/autenticacion/registro", limiteAutenticacion, async (solicitud, respuesta) => {
    if (solicitud.body.rol !== undefined && solicitud.body.rol !== 'ciudadano') {
      throw new ErrorHttp(403, 'El registro público está disponible únicamente para ciudadanos.');
    }
    const nombre = exigirTexto(solicitud.body.nombre, "Nombre", 2, 100),
      correoNormalizado = validarCorreo(solicitud.body.correo);
    const resumen = await resumirContrasena(validarContrasena(solicitud.body.contrasena));
    const usuario = {
      id: generarIdentificador(),
      nombre: nombre,
      correo: correoNormalizado,
      rol: "ciudadano"
    };
    try {
      await baseDatos.ejecutar("INSERT INTO usuarios (id,nombre,correo,resumen_contrasena,rol,fecha_creacion) VALUES (?,?,?,?,?,?)", [usuario.id, nombre, correoNormalizado, resumen, "ciudadano", fechaActual()]);
    } catch (error) {
      if (esErrorDuplicado(error)) throw new ErrorHttp(409, "Este correo ya tiene una cuenta registrada.");
      throw error;
    }
    await crearSesion(usuario, respuesta);
    respuesta.status(201).json({
      usuario: usuarioPublico(usuario)
    });
  });
  aplicacion.post("/api/autenticacion/ingresar", limiteAutenticacion, async (solicitud, respuesta) => {
    const correoNormalizado = validarCorreo(solicitud.body.correo);
    if (typeof solicitud.body.contrasena !== "string" || solicitud.body.contrasena.length > 128) throw new ErrorHttp(400, "Escribe tu contraseña.");
    const usuario = await baseDatos.obtener("SELECT * FROM usuarios WHERE correo = ?", [correoNormalizado]);
    if (!usuario || !(await verificarContrasena(solicitud.body.contrasena, usuario.resumen_contrasena))) throw new ErrorHttp(401, "Correo o contraseña incorrectos.");
    await crearSesion(usuario, respuesta);
    respuesta.json({
      usuario: usuarioPublico(usuario)
    });
  });
  aplicacion.use("/api", async (solicitud, respuesta, siguiente) => {
    const valorOriginal = solicitud.headers.cookie?.split(";").map(segmento => segmento.trim()).find(segmento => segmento.startsWith("baches_session="))?.slice(15);
    if (!valorOriginal || !/^[a-f0-9]{64}$/.test(valorOriginal)) throw new ErrorHttp(401, "Inicia sesión para continuar.");
    solicitud.resumenSesion = resumirToken(valorOriginal);
    const usuario = await baseDatos.obtener("SELECT u.* FROM usuarios u JOIN sesiones s ON s.id_usuario = u.id WHERE s.resumen_token = ? AND s.fecha_vencimiento > ?", [solicitud.resumenSesion, fechaActual()]);
    if (!usuario) throw new ErrorHttp(401, "Tu sesión terminó. Vuelve a iniciar sesión.");
    solicitud.usuario = usuarioPublico(usuario);
    siguiente();
  });
  aplicacion.get("/api/autenticacion/sesion", (solicitud, respuesta) => respuesta.json({
    usuario: solicitud.usuario
  }));
  aplicacion.post("/api/autenticacion/salir", async (solicitud, respuesta) => {
    await baseDatos.ejecutar("DELETE FROM sesiones WHERE resumen_token = ?", [solicitud.resumenSesion]);
    respuesta.clearCookie('baches_session', {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: configuracion.produccion
    });
    respuesta.status(204).end();
  });
  aplicacion.get("/api/ingenieros", async (solicitud, respuesta) => {
    if (solicitud.usuario.rol !== "administracion") throw new ErrorHttp(403, "Solo administración puede consultar supervisores.");
    respuesta.json(await baseDatos.consultar("SELECT id,nombre FROM usuarios WHERE rol = 'ingeniero' ORDER BY nombre"));
  });
  aplicacion.get("/api/reportes", async (solicitud, respuesta) => {
    const alcance = alcanceReportes(solicitud.usuario);
    const filtro = construirFiltroReportes(solicitud.query);
    const filas = await baseDatos.consultar(`SELECT r.*, u.nombre AS nombre_ingeniero FROM reportes r LEFT JOIN usuarios u ON u.id = r.id_ingeniero WHERE ${alcance.sentenciaSql} ${filtro.sentenciaSql} ORDER BY r.fecha_creacion DESC`, [...alcance.parametros, ...filtro.parametros]);
    if (solicitud.usuario.rol === "ingeniero") for (const fila of filas) {
      delete fila.correo_contacto;
      delete fila.telefono;
      delete fila.id_ciudadano;
    }
    respuesta.json(filas);
  });
  aplicacion.get("/api/mapa", async (solicitud, respuesta) => {
    const filtro = construirFiltroReportes(solicitud.query);
    // El mapa comunitario comparte ubicación y estado; los contactos y evidencias requieren autorización.
    respuesta.json(await baseDatos.consultar(`SELECT r.id,r.folio,r.tipo,r.calle,r.latitud,r.longitud,r.estado,r.fecha_creacion FROM reportes r WHERE r.estado <> ? ${filtro.sentenciaSql} ORDER BY r.fecha_creacion DESC`, [ESTADOS.FINALIZADO, ...filtro.parametros]));
  });
  aplicacion.get("/api/analisis", limitarSolicitudes(12, 60000), async (solicitud, respuesta) => {
    respuesta.json(await analizarSeleccion(solicitud));
  });
  aplicacion.get('/api/concentraciones', async (solicitud, respuesta) => respuesta.json(await concentraciones.obtenerEstado()));
  aplicacion.post("/api/reportes", (solicitud, respuesta, siguiente) => {
    if (solicitud.usuario.rol !== "ciudadano") return siguiente(new ErrorHttp(403, "Solo la ciudadanía puede crear reportes."));
    siguiente();
  }, cargaArchivos.single("fotografia"), async (solicitud, respuesta) => {
    const datos = validarReporte(solicitud.body);
    let nombreArchivo = await guardarFotografia(solicitud.file);
    const id = generarIdentificador(),
      fecha = fechaActual();
    const anio = new Intl.DateTimeFormat("en", {
      timeZone: "America/Mexico_City",
      year: "numeric"
    }).format(new Date());
    const folio = `GM-${anio}-${generarBytesAleatorios(6).toString("hex").toUpperCase()}`;
    try {
      await baseDatos.transaccion(async transaccion => {
        await transaccion.ejecutar(`INSERT INTO reportes (id,folio,id_ciudadano,tipo,descripcion,calle,entre_calles,colonia,alcaldia,codigo_postal,numero_exterior,referencias,correo_contacto,telefono,latitud,longitud,estado,fecha_creacion,fecha_actualizacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, folio, solicitud.usuario.id, datos.tipo, datos.descripcion, datos.calle, datos.entre_calles, datos.colonia, "Iztacalco", datos.codigo_postal, datos.numero_exterior, datos.referencias, datos.correo_contacto, datos.telefono, datos.latitud, datos.longitud, ESTADOS.PENDIENTE, fecha, fecha]);
        await transaccion.ejecutar("INSERT INTO fotografias (id,id_reporte,categoria,nombre_archivo,id_autor,fecha_creacion) VALUES (?,?,?,?,?,?)", [generarIdentificador(), id, "incidencia", nombreArchivo, solicitud.usuario.id, fecha]);
        await agregarHistorial(transaccion, id, null, ESTADOS.PENDIENTE, solicitud.usuario.id, "Reporte registrado por la ciudadanía.", fecha);
        const reporte = {
          id,
          folio
        };
        await crearNotificacion(transaccion, solicitud.usuario.id, reporte, `Registramos tu reporte ${folio}. Estado: ${ESTADOS.PENDIENTE}.`, fecha);
        for (const administrador of await transaccion.consultar("SELECT id FROM usuarios WHERE rol = 'administracion'")) await crearNotificacion(transaccion, administrador.id, reporte, `Nuevo reporte ${folio}: ${datos.tipo} en ${datos.calle}.`, fecha);
      });
      nombreArchivo = null;
    } finally {
      await descartarFotografia(nombreArchivo);
    }
    void concentraciones.solicitarActualizacion();
    respuesta.status(201).json({
      id,
      folio,
      estado: ESTADOS.PENDIENTE
    });
  });
  aplicacion.get("/api/reportes/:id", async (solicitud, respuesta) => {
    const reporte = await obtenerReporteAutorizado(baseDatos, solicitud.usuario, solicitud.params.id);
    const fotografias = await baseDatos.consultar("SELECT id,categoria,fecha_creacion FROM fotografias WHERE id_reporte = ? ORDER BY fecha_creacion", [reporte.id]);
    const historial = await baseDatos.consultar("SELECT h.*,u.nombre AS nombre_responsable FROM historial_reportes h JOIN usuarios u ON u.id = h.id_responsable WHERE h.id_reporte = ? ORDER BY h.fecha_creacion,h.id", [reporte.id]);
    const ingeniero = reporte.id_ingeniero ? await baseDatos.obtener("SELECT nombre FROM usuarios WHERE id = ?", [reporte.id_ingeniero]) : null;
    // Ingeniería recibe únicamente los datos necesarios para atender el reporte asignado.
    if (solicitud.usuario.rol === "ingeniero") {
      delete reporte.correo_contacto;
      delete reporte.telefono;
      delete reporte.id_ciudadano;
    }
    respuesta.json({
      ...reporte,
      nombre_ingeniero: ingeniero?.nombre,
      fotografias: fotografias,
      historial: historial
    });
  });
  aplicacion.get("/api/fotografias/:id", async (solicitud, respuesta) => {
    const fotografia = await baseDatos.obtener("SELECT * FROM fotografias WHERE id = ?", [solicitud.params.id]);
    if (!fotografia) throw new ErrorHttp(404, "No se encontró la fotografía.");
    await obtenerReporteAutorizado(baseDatos, solicitud.usuario, fotografia.id_reporte);
    respuesta.set("Content-Type", "image/webp");
    respuesta.sendFile(rutas.join(configuracion.carpetaFotografias, fotografia.nombre_archivo));
  });
  aplicacion.post("/api/reportes/:id/estado", cargaArchivos.single("fotografia"), async (solicitud, respuesta) => {
    const siguiente = solicitud.body.estado;
    const reporte = await obtenerReporteAutorizado(baseDatos, solicitud.usuario, solicitud.params.id);
    if (!transicionPermitida(solicitud.usuario, reporte, siguiente)) throw new ErrorHttp(409, "Este cambio de estado no está permitido para tu perfil o para el estado actual.");
    let nombreArchivo = siguiente === ESTADOS.RESUELTO ? await guardarFotografia(solicitud.file) : null;
    try {
      await baseDatos.transaccion(async transaccion => {
        const actual = await transaccion.obtener(`SELECT * FROM reportes WHERE id = ?${configuracion.motor === "mysql" ? " FOR UPDATE" : ""}`, [reporte.id]);
        if (!transicionPermitida(solicitud.usuario, actual, siguiente)) throw new ErrorHttp(409, "El reporte cambió. Actualiza la información antes de continuar.");
        let idIngeniero = actual.id_ingeniero;
        if (siguiente === ESTADOS.EN_PROCESO) {
          const ingeniero = await transaccion.obtener("SELECT id FROM usuarios WHERE id = ? AND rol = 'ingeniero'", [solicitud.body.id_ingeniero || ""]);
          if (!ingeniero) throw new ErrorHttp(400, "Selecciona un ingeniero supervisor válido.");
          idIngeniero = ingeniero.id;
        }
        const observaciones = solicitud.body.observaciones ? exigirTexto(solicitud.body.observaciones, "Observaciones", 1, 1000) : "Actualización de seguimiento.";
        const fecha = fechaActual();
        await transaccion.ejecutar("UPDATE reportes SET estado = ?, id_ingeniero = ?, fecha_actualizacion = ? WHERE id = ?", [siguiente, idIngeniero, fecha, actual.id]);
        if (nombreArchivo) await transaccion.ejecutar("INSERT INTO fotografias (id,id_reporte,categoria,nombre_archivo,id_autor,fecha_creacion) VALUES (?,?,?,?,?,?)", [generarIdentificador(), actual.id, "resolucion", nombreArchivo, solicitud.usuario.id, fecha]);
        await agregarHistorial(transaccion, actual.id, actual.estado, siguiente, solicitud.usuario.id, observaciones, fecha);
        const destinatarios = new Set([actual.id_ciudadano]);
        if (siguiente === ESTADOS.EN_PROCESO) destinatarios.add(idIngeniero);
        if (siguiente === ESTADOS.RESUELTO) for (const administrador of await transaccion.consultar("SELECT id FROM usuarios WHERE rol = 'administracion'")) destinatarios.add(administrador.id);
        for (const destinatario of destinatarios) await crearNotificacion(transaccion, destinatario, actual, `${actual.folio}: el estado cambió a ${siguiente}.`, fecha);
      });
      nombreArchivo = null;
    } finally {
      await descartarFotografia(nombreArchivo);
    }
    void concentraciones.solicitarActualizacion();
    respuesta.json({
      correcto: true,
      estado: siguiente
    });
  });
  aplicacion.get("/api/notificaciones", async (solicitud, respuesta) => respuesta.json(await baseDatos.consultar(`SELECT n.*, nc.id_concentracion, c.nombre_zona, c.latitud, c.longitud, c.radio_visual_metros, c.activa AS concentracion_activa FROM notificaciones n LEFT JOIN notificaciones_concentracion nc ON nc.id_notificacion = n.id LEFT JOIN concentraciones c ON c.id = nc.id_concentracion WHERE n.id_usuario = ? ORDER BY n.fecha_creacion DESC,n.id LIMIT 100`, [solicitud.usuario.id])));
  aplicacion.post("/api/notificaciones/:id/leer", async (solicitud, respuesta) => {
    await baseDatos.ejecutar("UPDATE notificaciones SET fecha_lectura = ? WHERE id = ? AND id_usuario = ?", [fechaActual(), solicitud.params.id, solicitud.usuario.id]);
    respuesta.status(204).end();
  });
  aplicacion.use("/api", (solicitud, respuesta) => respuesta.status(404).json({
    error: "No se encontró esta operación."
  }));
  const carpetaCompilada = rutas.join(RAIZ, "dist");
  if (existeRuta(rutas.join(carpetaCompilada, "index.html"))) {
    aplicacion.use(servidorExpress.static(carpetaCompilada));
    aplicacion.get("/{*path}", (solicitud, respuesta) => respuesta.sendFile(rutas.join(carpetaCompilada, "index.html")));
  }
  aplicacion.use((error, solicitud, respuesta, siguiente) => {
    if (respuesta.headersSent) return siguiente(error);
    const estado = error instanceof gestorCargas.MulterError || error.type === "entity.parse.failed" || error.type === "entity.too.large" ? 400 : error.status || 500;
    if (estado >= 500 && !(error instanceof ErrorHttp)) console.error("Error de API:", error.code || error.name);
    respuesta.status(estado).json({
      error: estado >= 500 && !(error instanceof ErrorHttp) ? "No se pudo completar la operación. Intenta de nuevo." : error instanceof gestorCargas.MulterError ? "Adjunta una sola fotografía de hasta 5 MB y revisa los campos del formulario." : error.type ? "El contenido de la solicitud no es válido." : error.message
    });
  });
  return aplicacion;
}
export { crearAplicacion };
function esErrorDuplicado(error) {
  return error.code === "ER_DUP_ENTRY" || /UNIQUE constraint failed/i.test(error.message);
}
function alcanceReportes(usuario) {
  if (usuario.rol === "administracion") return {
    sentenciaSql: "1=1",
    parametros: []
  };
  return {
    sentenciaSql: usuario.rol === "ciudadano" ? "r.id_ciudadano = ?" : "r.id_ingeniero = ?",
    parametros: [usuario.id]
  };
}
function construirFiltroReportes(consulta) {
  const condiciones = [],
    parametros = [];
  if (consulta.estado) {
    if (!LISTA_ESTADOS.includes(consulta.estado)) throw new ErrorHttp(400, "Estado no válido.");
    condiciones.push("r.estado = ?");
    parametros.push(consulta.estado);
  }
  if (consulta.tipo) {
    if (!["Bache", "Socavón"].includes(consulta.tipo)) throw new ErrorHttp(400, "Tipo de incidencia no válido.");
    condiciones.push("r.tipo = ?");
    parametros.push(consulta.tipo);
  }
  for (const clave of ["desde", "hasta"]) if (consulta[clave]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(consulta[clave]) || Number.isNaN(Date.parse(consulta[clave]))) throw new ErrorHttp(400, "Fecha no válida.");
    condiciones.push(`r.fecha_creacion ${clave === "desde" ? ">=" : "<="} ?`);
    parametros.push(new Date(`${consulta[clave]}T${clave === "desde" ? "00:00:00.000" : "23:59:59.999"}-06:00`).toISOString());
  }
  if (consulta.busqueda) {
    condiciones.push("(r.folio LIKE ? OR r.calle LIKE ?)");
    const termino = exigirTexto(consulta.busqueda, "Búsqueda", 1, 80).replace(/[%_]/g, "");
    parametros.push(`%${termino}%`, `%${termino}%`);
  }
  return {
    sentenciaSql: condiciones.length ? ` AND ${condiciones.join(" AND ")}` : "",
    parametros: parametros
  };
}
async function obtenerReporteAutorizado(baseDatos, usuario, id) {
  const reporte = await baseDatos.obtener("SELECT * FROM reportes WHERE id = ?", [id]);
  if (!reporte || !puedeConsultarReporte(usuario, reporte)) throw new ErrorHttp(404, "No se encontró el reporte o no tienes acceso a él.");
  return reporte;
}
async function agregarHistorial(transaccion, id, anterior, siguiente, responsable, observaciones, fecha) {
  await transaccion.ejecutar("INSERT INTO historial_reportes (id,id_reporte,estado_anterior,estado_nuevo,id_responsable,observaciones,fecha_creacion) VALUES (?,?,?,?,?,?,?)", [generarIdentificador(), id, anterior, siguiente, responsable, observaciones, fecha]);
}
function validarReporte(cuerpo) {
  if (!["Bache", "Socavón"].includes(cuerpo.tipo)) throw new ErrorHttp(400, "Selecciona Bache o Socavón.");
  const latitud = Number(cuerpo.latitud),
    longitud = Number(cuerpo.longitud);
  const unidad = obtenerUnidadTerritorial(latitud, longitud);
  if (cuerpo.latitud === "" || cuerpo.longitud === "" || !unidad) throw new ErrorHttp(400, "Selecciona una ubicación dentro de Granjas México I o II.");
  const codigoPostal = exigirTexto(cuerpo.codigo_postal, "Código postal", 5, 5);
  if (!/^\d{5}$/.test(codigoPostal)) throw new ErrorHttp(400, "El código postal debe tener cinco dígitos.");
  const telefono = exigirTexto(cuerpo.telefono, "Teléfono", 10, 25);
  if (!/^[+\d\s()-]+$/.test(telefono) || telefono.replace(/\D/g, "").length < 10 || telefono.replace(/\D/g, "").length > 15) throw new ErrorHttp(400, "Escribe un teléfono de entre 10 y 15 dígitos.");
  return {
    tipo: cuerpo.tipo,
    descripcion: exigirTexto(cuerpo.descripcion, "Descripción", 10, 2000),
    calle: exigirTexto(cuerpo.calle, "Calle", 2, 160),
    entre_calles: exigirTexto(cuerpo.entre_calles, "Entre calles", 3, 200),
    colonia: unidad.nombre,
    numero_exterior: exigirTexto(cuerpo.numero_exterior, "Número exterior cercano", 1, 30),
    referencias: exigirTexto(cuerpo.referencias, "Referencias", 3, 500),
    codigo_postal: codigoPostal,
    telefono: telefono,
    correo_contacto: validarCorreo(cuerpo.correo_contacto),
    latitud: latitud,
    longitud: longitud
  };
}
