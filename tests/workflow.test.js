import prueba from 'node:test';
import verificar from 'node:assert/strict';
import { mkdtemp as crearDirectorioTemporal, rm as eliminarRuta, readFile as leerArchivo, stat as consultarArchivo } from 'node:fs/promises';
import sistemaOperativo from 'node:os';
import rutas from 'node:path';
import { randomUUID as generarIdentificador } from 'node:crypto';
import procesadorImagenes from 'sharp';
const directorioTemporal = await crearDirectorioTemporal(rutas.join(sistemaOperativo.tmpdir(), "granjas-tests-"));
process.env.MOTOR_BASE_DATOS = process.env.MOTOR_BASE_DATOS_PRUEBAS || "sqlite";
process.env.RUTA_SQLITE = rutas.join(directorioTemporal, "test.sqlite");
process.env.CARPETA_FOTOGRAFIAS = rutas.join(directorioTemporal, "uploads");
process.env.NODE_ENV = "test";
const {
  abrirBaseDatos: abrirBaseDatos
} = await import("../server/db.js");
const {
  crearAplicacion: crearAplicacion
} = await import("../server/app.js");
const {crearServicioConcentraciones} = await import('../server/concentraciones.js');
const {
  resumirContrasena: resumirContrasena
} = await import("../server/security.js");
const {
  ESTADOS: ESTADOS,
  puntoDentroZona: puntoDentroZona
} = await import("../shared/domain.js");
const {
  crearRespaldo: crearRespaldo,
  restaurarRespaldo: restaurarRespaldo,
  TABLAS_RESPALDO: TABLAS_RESPALDO
} = await import("../server/backups.js");
prueba(`flujo completo, integridad y permisos (${process.env.MOTOR_BASE_DATOS})`, async contextoPrueba => {
  const baseDatos = await abrirBaseDatos();
  const aplicacion = crearAplicacion(baseDatos);
  const servidor = aplicacion.listen(0, "127.0.0.1");
  await new Promise(resolver => servidor.once('listening', resolver));
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  contextoPrueba.after(async () => {
    await new Promise(resolver => servidor.close(resolver));
    await aplicacion.locals.concentraciones.detener();
    await baseDatos.cerrar();
    verificar.ok(directorioTemporal.startsWith(rutas.join(sistemaOperativo.tmpdir(), "granjas-tests-")));
    await eliminarRuta(directorioTemporal, {
      recursive: true,
      force: true
    });
  });
  async function enviarSolicitud(ruta, {
    galletaSesion: galletaSesion,
    contenido: cuerpo,
    metodo = "GET",
    origin: origenSolicitud
  } = {}) {
    const respuestaHttp = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: {
        ...(galletaSesion ? {
          Cookie: galletaSesion
        } : {}),
        ...(cuerpo && !(cuerpo instanceof FormData) ? {
          'Content-Type': 'application/json'
        } : {}),
        ...(origenSolicitud ? {
          Origin: origenSolicitud
        } : {})
      },
      ...(cuerpo ? {
        body: cuerpo instanceof FormData ? cuerpo : JSON.stringify(cuerpo)
      } : {})
    });
    const datos = respuestaHttp.status === 204 ? null : respuestaHttp.headers.get("content-type")?.includes("application/json") ? await respuestaHttp.json() : await respuestaHttp.arrayBuffer();
    return {
      respuestaHttp: respuestaHttp,
      datos: datos,
      estado: respuestaHttp.status,
      galletaSesion: respuestaHttp.headers.get("set-cookie")?.split(";")[0]
    };
  }
  const contrasena = "PruebaSegura!2026";
  await contextoPrueba.test('una base vacía no habilita el alta administrativa por la aplicación', async () => {
    const configuracionInicial = await enviarSolicitud('/configuracion');
    verificar.equal('requiereAdministracion' in configuracionInicial.datos, false);
    verificar.equal('demoPassword' in configuracionInicial.datos, false);
    verificar.equal('demoAccounts' in configuracionInicial.datos, false);
    verificar.equal(configuracionInicial.datos.zona.type, 'FeatureCollection');
    verificar.deepEqual(configuracionInicial.datos.zona.features.map(unidad => unidad.properties.clave), ['06-050','06-051']);
    const inicializacion = await enviarSolicitud('/administracion/inicializar', {
      metodo: 'POST',
      contenido: { nombre: 'Intento administrativo', correo: 'inicio@example.com', contrasena }
    });
    verificar.ok([401,404].includes(inicializacion.estado));
    verificar.equal((await baseDatos.obtener('SELECT COUNT(*) AS total FROM usuarios')).total, 0);
  });
  const ciudadano = await enviarSolicitud("/autenticacion/registro", {
    metodo: "POST",
    contenido: {
      nombre: "Ciudadano de prueba",
      correo: "prueba@example.com",
      contrasena: contrasena
    }
  });
  await contextoPrueba.test('el dashboard se consulta sin sesión y las operaciones privadas siguen protegidas', async () => {
    const publico = await enviarSolicitud('/publico/panel');
    verificar.equal(publico.estado, 200);
    verificar.deepEqual(publico.datos.indicadores, {registrados: 0, pendientes: 0, en_proceso: 0, atendidos: 0});
    verificar.deepEqual(publico.datos.puntos, []);
    verificar.deepEqual(publico.datos.recientes, []);
    verificar.equal(publico.galletaSesion, undefined);
    for (const ruta of ['/reportes','/notificaciones','/ingenieros','/concentraciones','/autenticacion/sesion']) verificar.equal((await enviarSolicitud(ruta)).estado, 401);
    verificar.equal((await enviarSolicitud('/reportes', {metodo: 'POST', contenido: {tipo: 'Bache'}})).estado, 401);
    verificar.equal((await enviarSolicitud('/reportes/no-autorizado/estado', {metodo: 'POST', contenido: {estado: ESTADOS.FINALIZADO}})).estado, 401);
    verificar.equal((await enviarSolicitud('/publico/panel', {metodo: 'POST', contenido: {}})).estado, 401);
    verificar.equal((await enviarSolicitud('/publico/analisis?eps=invalido')).estado, 400);
  });
  const otroUsuario = await enviarSolicitud("/autenticacion/registro", {
    metodo: "POST",
    contenido: {
      nombre: "Otra persona",
      correo: "otra@example.com",
      contrasena: contrasena
    }
  });
  await contextoPrueba.test('el registro ciudadano rechaza el alta de personal aunque se manipule la solicitud', async () => {
    for (const rol of ['administracion','ingeniero']) {
      const intento = await enviarSolicitud('/autenticacion/registro', {
        metodo: 'POST', contenido: { nombre: 'Alta no autorizada', correo: `${rol}@example.com`, contrasena, rol }
      });
      verificar.equal(intento.estado,403);
    }
    const rutaEliminada = await enviarSolicitud('/administracion/inicializar', {
      metodo: 'POST', galletaSesion: ciudadano.galletaSesion,
      contenido: { nombre: 'Alta no autorizada', correo: 'alcaldia@example.com', contrasena }
    });
    verificar.equal(rutaEliminada.estado,404);
    verificar.equal((await baseDatos.obtener("SELECT COUNT(*) AS total FROM usuarios WHERE rol <> 'ciudadano'")).total,0);
  });
  const idAdministrador = generarIdentificador(),
    idIngeniero = generarIdentificador(),
    idSegundoIngeniero = generarIdentificador();
  const contrasenaResumida = await resumirContrasena(contrasena);
  for (const [id, rol, nombre] of [[idAdministrador, "administracion", "Administración"], [idIngeniero, "ingeniero", "Ingeniero"], [idSegundoIngeniero, "ingeniero", "Otro ingeniero"]]) {
    await baseDatos.ejecutar("INSERT INTO usuarios (id,nombre,correo,resumen_contrasena,rol,fecha_creacion) VALUES (?,?,?,?,?,?)", [id, nombre, `${id}@example.com`, contrasenaResumida, rol, new Date().toISOString()]);
  }
  const ingresar = async id => (await enviarSolicitud("/autenticacion/ingresar", {
    metodo: "POST",
    contenido: {
      correo: `${id}@example.com`,
      contrasena: contrasena
    }
  })).galletaSesion;
  const administrador = await ingresar(idAdministrador),
    ingeniero = await ingresar(idIngeniero),
    segundoIngeniero = await ingresar(idSegundoIngeniero);
  const imagenPng = await procesadorImagenes({
    create: {
      width: 40,
      height: 40,
      channels: 3,
      background: '#5a7e53'
    }
  }).png().toBuffer();
  function crearFormularioReporte(cambios = {}, fotografia = imagenPng) {
    const formulario = new FormData();
    for (const [clave, valor] of Object.entries({
      tipo: "Bache",
      descripcion: "Bache visible que afecta el paso de vehículos.",
      calle: "Añil",
      entre_calles: "Avena y Resina",
      codigo_postal: "08400",
      numero_exterior: "S/N",
      referencias: "Frente al comercio de prueba.",
      correo_contacto: "prueba@example.com",
      telefono: "5512345678",
      latitud: "19.400",
      longitud: "-99.100",
      ...cambios
    })) formulario.append(clave, valor);
    if (fotografia) formulario.append("fotografia", new Blob([fotografia], {
      type: 'image/png'
    }), "evidencia.png");
    return formulario;
  }
  const cambiarEstado = (estado, fotografia = false, id_ingeniero = "") => {
    const formulario = new FormData();
    formulario.append("estado", estado);
    formulario.append("id_ingeniero", id_ingeniero);
    formulario.append("observaciones", "Observación de la prueba.");
    if (fotografia) formulario.append("fotografia", new Blob([imagenPng], {
      type: 'image/png'
    }), "resolucion.png");
    return formulario;
  };
  let reporteCreado;
  await contextoPrueba.test("el registro público crea únicamente ciudadanos y protege contraseñas", async () => {
    verificar.equal(ciudadano.estado, 201);
    verificar.equal(ciudadano.datos.usuario.rol, "ciudadano");
    verificar.match(ciudadano.respuestaHttp.headers.get("set-cookie"), /HttpOnly/i);
    verificar.match(ciudadano.respuestaHttp.headers.get("set-cookie"), /SameSite=Strict/i);
    const usuario = await baseDatos.obtener("SELECT * FROM usuarios WHERE id = ?", [ciudadano.datos.usuario.id]);
    verificar.notEqual(usuario.resumen_contrasena, contrasena);
    verificar.ok(!("resumen_contrasena" in ciudadano.datos.usuario));
    verificar.equal((await enviarSolicitud("/autenticacion/registro", {
      metodo: "POST",
      contenido: {
        nombre: "Duplicado",
        correo: "PRUEBA@example.com",
        contrasena: contrasena
      }
    })).estado, 409);
  });
  await contextoPrueba.test("autenticación, origen y validación de contraseña", async () => {
    verificar.equal((await enviarSolicitud("/mapa")).estado, 401);
    verificar.equal((await enviarSolicitud("/autenticacion/ingresar", {
      metodo: "POST",
      contenido: {
        correo: "prueba@example.com",
        contrasena: "incorrecta"
      }
    })).estado, 401);
    verificar.equal((await enviarSolicitud("/autenticacion/salir", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      origin: "https://no-autorizado.example"
    })).estado, 403);
    verificar.equal((await enviarSolicitud("/autenticacion/registro", {
      metodo: "POST",
      contenido: {
        nombre: "Prueba",
        correo: "invalido",
        contrasena: "corta"
      }
    })).estado, 400);
  });
  await contextoPrueba.test("geolocalización, datos obligatorios y archivos válidos", async () => {
    verificar.equal(puntoDentroZona(19.4, -99.1), true);
    verificar.equal(puntoDentroZona(0, 0), false);
    verificar.equal(puntoDentroZona(NaN, -99.1), false);
    verificar.equal((await enviarSolicitud("/reportes", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      contenido: crearFormularioReporte({
        latitud: 19.389,
        longitud: -99.105
      })
    })).estado, 400);
    verificar.equal((await baseDatos.obtener('SELECT COUNT(*) AS total FROM reportes')).total, 0);
    verificar.equal((await enviarSolicitud("/reportes", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      contenido: crearFormularioReporte({}, null)
    })).estado, 400);
    verificar.equal((await enviarSolicitud("/reportes", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      contenido: crearFormularioReporte({}, Buffer.from("<svg>no es una fotografía</svg>"))
    })).estado, 400);
    verificar.equal((await enviarSolicitud("/reportes", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      contenido: crearFormularioReporte({
        telefono: "no valido"
      })
    })).estado, 400);
    verificar.equal((await enviarSolicitud("/reportes", {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: crearFormularioReporte()
    })).estado, 403);
    const resultado = await enviarSolicitud("/reportes", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      contenido: crearFormularioReporte()
    });
    verificar.equal(resultado.estado, 201);
    verificar.equal(resultado.datos.estado, ESTADOS.PENDIENTE);
    verificar.equal((await baseDatos.obtener('SELECT colonia FROM reportes WHERE id = ?', [resultado.datos.id])).colonia, 'Granjas México I');
    verificar.match(resultado.datos.folio, /^GM-\d{4}-/);
    reporteCreado = resultado.datos;
  });
  await contextoPrueba.test("cada perfil consulta solamente los detalles y fotografías autorizados", async () => {
    const detalle = await enviarSolicitud(`/reportes/${reporteCreado.id}`, {
      galletaSesion: ciudadano.galletaSesion
    });
    verificar.equal(detalle.estado, 200);
    verificar.equal(detalle.datos.historial.length, 1);
    verificar.equal(detalle.datos.fotografias.length, 1);
    verificar.equal((await enviarSolicitud(`/reportes/${reporteCreado.id}`)).estado, 401);
    verificar.equal((await enviarSolicitud(`/fotografias/${detalle.datos.fotografias[0].id}`)).estado, 401);
    verificar.equal((await enviarSolicitud(`/reportes/${reporteCreado.id}`, {
      galletaSesion: otroUsuario.galletaSesion
    })).estado, 404);
    verificar.equal((await enviarSolicitud(`/fotografias/${detalle.datos.fotografias[0].id}`, {
      galletaSesion: otroUsuario.galletaSesion
    })).estado, 404);
    verificar.equal((await enviarSolicitud("/reportes", {
      galletaSesion: otroUsuario.galletaSesion
    })).datos.length, 0);
    verificar.equal((await enviarSolicitud("/reportes", {
      galletaSesion: ingeniero
    })).datos.length, 0);
    const puntos = (await enviarSolicitud("/mapa", {
      galletaSesion: otroUsuario.galletaSesion
    })).datos;
    verificar.equal(puntos.length, 1);
    verificar.ok(!("correo_contacto" in puntos[0]));
    verificar.ok(!("telefono" in puntos[0]));
  });
  await contextoPrueba.test('el dashboard público comparte solo campos permitidos y no contiene contactos ni fotografías', async () => {
    const publico = await enviarSolicitud('/publico/panel');
    verificar.equal(publico.estado, 200);
    verificar.equal(publico.datos.indicadores.registrados, 1);
    verificar.equal(publico.datos.indicadores.pendientes, 1);
    const camposPublicos = ['id','folio','tipo','calle','colonia','latitud','longitud','estado','fecha_creacion'].sort();
    for (const fila of [...publico.datos.puntos, ...publico.datos.recientes]) verificar.deepEqual(Object.keys(fila).sort(), camposPublicos);
    const contenido = JSON.stringify(publico.datos);
    for (const privado of ['correo_contacto','telefono','resumen_contrasena','id_ciudadano','id_ingeniero','fotografias','prueba@example.com','5512345678','Ciudadano de prueba']) verificar.ok(!contenido.includes(privado));
    verificar.equal('motor' in publico.datos.concentraciones, false);
    verificar.equal((await enviarSolicitud('/publico/analisis?tipo=Bache')).estado, 200);
  });
  await contextoPrueba.test("prohíbe saltos de estados, asignaciones inválidas y cambios ciudadanos", async () => {
    const direccionUrl = `/reportes/${reporteCreado.id}/estado`;
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.FINALIZADO)
    })).estado, 409);
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion,
      contenido: cambiarEstado(ESTADOS.EN_PROCESO, false, idIngeniero)
    })).estado, 409);
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.EN_PROCESO, false, ciudadano.datos.usuario.id)
    })).estado, 400);
    const sinCambios = (await enviarSolicitud(`/reportes/${reporteCreado.id}`, {
      galletaSesion: administrador
    })).datos;
    verificar.equal(sinCambios.estado, ESTADOS.PENDIENTE);
    verificar.equal(sinCambios.historial.length, 1);
  });
  await contextoPrueba.test("la asignación es atómica ante dos solicitudes simultáneas", async () => {
    const direccionUrl = `/reportes/${reporteCreado.id}/estado`;
    const resultados = await Promise.all([enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.EN_PROCESO, false, idIngeniero)
    }), enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.EN_PROCESO, false, idIngeniero)
    })]);
    verificar.deepEqual(resultados.map(reporte => reporte.estado).sort(), [200, 409]);
    const propios = (await enviarSolicitud("/reportes", {
      galletaSesion: ingeniero
    })).datos;
    verificar.equal(propios.length, 1);
    verificar.ok(!("telefono" in propios[0]));
    verificar.ok(!("correo_contacto" in propios[0]));
  });
  await contextoPrueba.test("solo el ingeniero asignado puede resolver y requiere evidencia", async () => {
    const direccionUrl = `/reportes/${reporteCreado.id}/estado`;
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: segundoIngeniero,
      contenido: cambiarEstado(ESTADOS.RESUELTO, true)
    })).estado, 404);
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.RESUELTO, true)
    })).estado, 409);
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: ingeniero,
      contenido: cambiarEstado(ESTADOS.RESUELTO)
    })).estado, 400);
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: ingeniero,
      contenido: cambiarEstado(ESTADOS.RESUELTO, true)
    })).estado, 200);
    const detalle = (await enviarSolicitud(`/reportes/${reporteCreado.id}`, {
      galletaSesion: ingeniero
    })).datos;
    verificar.ok(!("telefono" in detalle));
    verificar.equal(detalle.fotografias.length, 2);
  });
  await contextoPrueba.test("el cierre administrativo oculta el punto y conserva el historial", async () => {
    const direccionUrl = `/reportes/${reporteCreado.id}/estado`;
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: ingeniero,
      contenido: cambiarEstado(ESTADOS.FINALIZADO)
    })).estado, 409);
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.FINALIZADO)
    })).estado, 200);
    verificar.equal((await enviarSolicitud("/mapa", {
      galletaSesion: ciudadano.galletaSesion
    })).datos.length, 0);
    const reporte = (await enviarSolicitud(`/reportes/${reporteCreado.id}`, {
      galletaSesion: ciudadano.galletaSesion
    })).datos;
    verificar.equal(reporte.estado, ESTADOS.FINALIZADO);
    verificar.deepEqual(reporte.historial.map(evento => evento.estado_nuevo), Object.values(ESTADOS));
    verificar.equal((await enviarSolicitud(direccionUrl, {
      metodo: "POST",
      galletaSesion: administrador,
      contenido: cambiarEstado(ESTADOS.EN_PROCESO, false, idIngeniero)
    })).estado, 409);
    const correosPendientes = await baseDatos.consultar("SELECT * FROM correos_pendientes");
    verificar.ok(correosPendientes.length >= 4);
    verificar.ok(correosPendientes.every(correo => !correo.fecha_envio));
  });
  await contextoPrueba.test('los indicadores públicos conservan el avance y el mapa excluye los finalizados', async () => {
    const publico = await enviarSolicitud('/publico/panel');
    verificar.equal(publico.datos.indicadores.atendidos, 1);
    verificar.equal(publico.datos.indicadores.pendientes, 0);
    verificar.equal(publico.datos.puntos.length, 0);
    verificar.equal(publico.datos.recientes[0].estado, ESTADOS.FINALIZADO);
  });
  await contextoPrueba.test("las notificaciones pertenecen al destinatario y se pueden marcar como leídas", async () => {
    const notificaciones = (await enviarSolicitud("/notificaciones", {
      galletaSesion: ciudadano.galletaSesion
    })).datos;
    verificar.equal(notificaciones.length, 4);
    await enviarSolicitud(`/notificaciones/${notificaciones[0].id}/leer`, {
      galletaSesion: otroUsuario.galletaSesion,
      metodo: "POST"
    });
    verificar.equal((await baseDatos.obtener("SELECT fecha_lectura FROM notificaciones WHERE id = ?", [notificaciones[0].id])).fecha_lectura, null);
    await enviarSolicitud(`/notificaciones/${notificaciones[0].id}/leer`, {
      galletaSesion: ciudadano.galletaSesion,
      metodo: "POST"
    });
    verificar.ok((await baseDatos.obtener("SELECT fecha_lectura FROM notificaciones WHERE id = ?", [notificaciones[0].id])).fecha_lectura);
  });
  await contextoPrueba.test("los filtros son validados y el cierre de sesión revoca el acceso", async () => {
    verificar.equal((await enviarSolicitud("/reportes?estado=no-existe", {
      galletaSesion: administrador
    })).estado, 400);
    verificar.equal((await enviarSolicitud("/analisis?eps=999999", {
      galletaSesion: administrador
    })).estado, 400);
    const pythonAnterior = process.env.PYTHON_EJECUTABLE;
    try {
      process.env.PYTHON_EJECUTABLE = rutas.join(directorioTemporal, "python-no-existe.exe");
      const noDisponible = await enviarSolicitud("/analisis", {
        galletaSesion: administrador
      });
      verificar.equal(noDisponible.estado, 503);
      verificar.match(noDisponible.datos.error, /PYTHON_EJECUTABLE/);
      const falloPublico = await enviarSolicitud('/publico/analisis');
      verificar.equal(falloPublico.estado, 503);
      verificar.ok(!falloPublico.datos.error.includes('PYTHON_EJECUTABLE'));
    } finally {
      if (pythonAnterior === undefined) delete process.env.PYTHON_EJECUTABLE;else process.env.PYTHON_EJECUTABLE = pythonAnterior;
    }
    verificar.equal((await enviarSolicitud("/autenticacion/salir", {
      metodo: "POST",
      galletaSesion: ciudadano.galletaSesion
    })).estado, 204);
    verificar.equal((await enviarSolicitud("/autenticacion/sesion", {
      galletaSesion: ciudadano.galletaSesion
    })).estado, 401);
  });
  await contextoPrueba.test("el respaldo recupera registros y fotografías en una base vacía", async () => {
    await aplicacion.locals.concentraciones.solicitarActualizacion();
    const directorio = await crearRespaldo(baseDatos, rutas.join(directorioTemporal, "backups"));
    const instantanea = JSON.parse(await leerArchivo(rutas.join(directorio, "snapshot.json"), "utf8"));
    verificar.equal(instantanea.tablas.reportes.length, 1);
    verificar.ok(!("sesiones" in instantanea.tablas));
    for (const fotografia of instantanea.tablas.fotografias) verificar.ok((await consultarArchivo(rutas.join(directorio, "fotografias", fotografia.nombre_archivo))).size > 0);
    await verificar.rejects(restaurarRespaldo(baseDatos, directorio), /base vacía/);
    await baseDatos.transaccion(async transaccion => {
      await transaccion.ejecutar("DELETE FROM sesiones");
      for (const tabla of [...TABLAS_RESPALDO].reverse()) await transaccion.ejecutar(`DELETE FROM ${tabla}`);
    });
    await restaurarRespaldo(baseDatos, directorio);
    verificar.equal((await baseDatos.obtener("SELECT COUNT(*) AS total FROM historial_reportes")).total, 4);
    verificar.equal((await baseDatos.obtener("SELECT COUNT(*) AS total FROM fotografias")).total, 2);
    verificar.equal((await baseDatos.obtener("SELECT COUNT(*) AS total FROM sesiones")).total, 0);
  });
  await contextoPrueba.test('acepta Granjas México II al este del límite anterior y determina la colonia en el servidor', async () => {
    const sesion = await enviarSolicitud('/autenticacion/ingresar', {
      metodo: 'POST', contenido: {correo: 'otra@example.com', contrasena}
    });
    const resultado = await enviarSolicitud('/reportes', {
      metodo: 'POST', galletaSesion: sesion.galletaSesion,
      contenido: crearFormularioReporte({latitud: 19.401, longitud: -99.084, colonia: 'Valor manipulado'})
    });
    verificar.equal(resultado.estado, 201);
    const guardado = await baseDatos.obtener('SELECT colonia FROM reportes WHERE id = ?', [resultado.datos.id]);
    verificar.equal(guardado.colonia, 'Granjas México II');
  });
  let sesionConcentraciones, zonaConcentracion;
  const totalAlertas = async () => (await baseDatos.obtener('SELECT COUNT(*) AS total FROM notificaciones_concentracion')).total;
  await contextoPrueba.test('crear el tercer reporte genera una concentración y una alerta administrativa sin pedir el análisis', async () => {
    sesionConcentraciones = (await enviarSolicitud('/autenticacion/ingresar', {metodo: 'POST', contenido: {correo: 'otra@example.com', contrasena}})).galletaSesion;
    const resultados = await Promise.all([0.0001, 0.0002].map(desplazamiento => enviarSolicitud('/reportes', {
      metodo: 'POST', galletaSesion: sesionConcentraciones,
      contenido: crearFormularioReporte({latitud: 19.401 + desplazamiento, longitud: -99.084})
    })));
    verificar.ok(resultados.every(resultado => resultado.estado === 201));
    await aplicacion.locals.concentraciones.solicitarActualizacion();
    const estado = await aplicacion.locals.concentraciones.obtenerEstado();
    verificar.equal(estado.error, null);
    verificar.equal(estado.grupos.length, 1);
    verificar.equal(estado.grupos[0].cantidad, 3);
    zonaConcentracion = estado.grupos[0];
    verificar.equal(await totalAlertas(), 1);
    const panelAnonimo = await enviarSolicitud('/publico/panel');
    verificar.equal(panelAnonimo.estado, 200);
    verificar.equal(panelAnonimo.datos.concentraciones.grupos[0].cantidad, 3);
    verificar.equal('ids_reportes' in panelAnonimo.datos.concentraciones.grupos[0], false);
    const analisisAnonimo = await enviarSolicitud('/publico/analisis');
    verificar.equal(analisisAnonimo.estado, 200);
    verificar.equal(analisisAnonimo.datos.grupos[0].cantidad, 3);
    verificar.equal('motor' in analisisAnonimo.datos, false);
    verificar.equal(await totalAlertas(), 1, 'la consulta pública tampoco debe generar nuevas alertas');
    verificar.equal((await baseDatos.obtener('SELECT id_usuario FROM notificaciones_concentracion')).id_usuario, idAdministrador);
    for (let indice = 0; indice < 3; indice++) await aplicacion.locals.concentraciones.solicitarActualizacion();
    verificar.equal(await totalAlertas(), 1, 'comprobar repetidamente no debe volver a avisar');
    verificar.equal((await enviarSolicitud('/concentraciones')).estado, 401);
    const sesionAdministrativa = await ingresar(idAdministrador);
    const avisos = (await enviarSolicitud('/notificaciones', {galletaSesion: sesionAdministrativa})).datos;
    verificar.ok(avisos.some(aviso => aviso.id_concentracion === zonaConcentracion.id));
    const ajenos = (await enviarSolicitud('/notificaciones', {galletaSesion: sesionConcentraciones})).datos;
    verificar.ok(ajenos.every(aviso => !aviso.id_concentracion));
  });
  await contextoPrueba.test('el crecimiento conserva la zona y avisa una sola vez al duplicar la concentración', async () => {
    const resultados = await Promise.all([0.0003, 0.0004, 0.0005].map(desplazamiento => enviarSolicitud('/reportes', {
      metodo: 'POST', galletaSesion: sesionConcentraciones,
      contenido: crearFormularioReporte({latitud: 19.401 + desplazamiento, longitud: -99.084})
    })));
    verificar.ok(resultados.every(resultado => resultado.estado === 201));
    await aplicacion.locals.concentraciones.solicitarActualizacion();
    const estado = await aplicacion.locals.concentraciones.obtenerEstado();
    verificar.equal(estado.grupos[0].id, zonaConcentracion.id);
    verificar.equal(estado.grupos[0].cantidad, 6);
    zonaConcentracion = estado.grupos[0];
    verificar.equal(await totalAlertas(), 2);
    const segundoServicio = crearServicioConcentraciones(baseDatos);
    try {
      await Promise.all([segundoServicio.solicitarActualizacion(), aplicacion.locals.concentraciones.solicitarActualizacion()]);
      verificar.equal(await totalAlertas(), 2, 'dos instancias no deben duplicar avisos');
    } finally {await segundoServicio.detener();}
    const filtrado = await enviarSolicitud('/analisis?tipo=Socav%C3%B3n', {galletaSesion: sesionConcentraciones});
    verificar.equal(filtrado.estado, 200);
    verificar.equal(filtrado.datos.grupos.length, 0);
    verificar.equal(await totalAlertas(), 2, 'filtrar la vista no debe generar alertas');
  });
  await contextoPrueba.test('una falla de Python conserva la última detección y se recupera sin alertas repetidas', async () => {
    const pythonAnterior = process.env.PYTHON_EJECUTABLE;
    try {
      process.env.PYTHON_EJECUTABLE = rutas.join(directorioTemporal, 'python-no-existe.exe');
      const creado = await enviarSolicitud('/reportes', {metodo: 'POST', galletaSesion: sesionConcentraciones, contenido: crearFormularioReporte({latitud: 19.403, longitud: -99.107})});
      verificar.equal(creado.estado, 201);
      await aplicacion.locals.concentraciones.solicitarActualizacion();
      const estado = await aplicacion.locals.concentraciones.obtenerEstado();
      verificar.equal(estado.desactualizado, true);
      verificar.match(estado.error, /PYTHON_EJECUTABLE/);
      verificar.equal(estado.grupos[0].cantidad, 6);
      verificar.equal(await totalAlertas(), 2);
    } finally {
      if (pythonAnterior === undefined) delete process.env.PYTHON_EJECUTABLE; else process.env.PYTHON_EJECUTABLE = pythonAnterior;
    }
    await aplicacion.locals.concentraciones.solicitarActualizacion();
    verificar.equal((await aplicacion.locals.concentraciones.obtenerEstado()).desactualizado, false);
    verificar.equal(await totalAlertas(), 2);
  });
  await contextoPrueba.test('resolver reportes retira la concentración y conserva sus alertas como historial', async () => {
    const sesionAdministrativa = await ingresar(idAdministrador), sesionIngeniero = await ingresar(idIngeniero);
    for (const id of zonaConcentracion.ids_reportes.slice(0, 4)) {
      verificar.equal((await enviarSolicitud(`/reportes/${id}/estado`, {metodo: 'POST', galletaSesion: sesionAdministrativa, contenido: cambiarEstado(ESTADOS.EN_PROCESO, false, idIngeniero)})).estado, 200);
      verificar.equal((await enviarSolicitud(`/reportes/${id}/estado`, {metodo: 'POST', galletaSesion: sesionIngeniero, contenido: cambiarEstado(ESTADOS.RESUELTO, true)})).estado, 200);
    }
    await aplicacion.locals.concentraciones.solicitarActualizacion();
    const estado = await aplicacion.locals.concentraciones.obtenerEstado();
    verificar.equal(estado.grupos.length, 0);
    verificar.equal(estado.cantidad_puntos, 3);
    verificar.equal((await baseDatos.obtener('SELECT activa FROM concentraciones WHERE id = ?', [zonaConcentracion.id])).activa, 0);
    verificar.equal(await totalAlertas(), 2);
    const avisos = (await enviarSolicitud('/notificaciones', {galletaSesion: sesionAdministrativa})).datos.filter(aviso => aviso.id_concentracion);
    verificar.ok(avisos.every(aviso => aviso.concentracion_activa === 0));
    await enviarSolicitud(`/notificaciones/${avisos[0].id}/leer`, {metodo: 'POST', galletaSesion: sesionAdministrativa});
    verificar.ok((await baseDatos.obtener('SELECT fecha_lectura FROM notificaciones WHERE id = ?', [avisos[0].id])).fecha_lectura);
  });
  await contextoPrueba.test('el servicio detecta cambios en segundo plano sin solicitudes al mapa y persiste sus avisos', async () => {
    await aplicacion.locals.concentraciones.detener();
    const aislado = await baseDatos.obtener('SELECT id FROM reportes WHERE latitud = ? AND longitud = ? AND estado = ?', [19.403, -99.107, ESTADOS.PENDIENTE]);
    await baseDatos.ejecutar('UPDATE reportes SET latitud = ?, longitud = ?, calle = ?, colonia = ? WHERE id = ?', [19.40125, -99.084, 'Añil', 'Granjas México II', aislado.id]);
    const servicio = crearServicioConcentraciones(baseDatos, {intervaloMilisegundos: 50});
    servicio.iniciar();
    try {
      const limiteEspera = Date.now() + 8000;
      while (await totalAlertas() < 3 && Date.now() < limiteEspera) await new Promise(resolver => setTimeout(resolver, 30));
      verificar.equal(await totalAlertas(), 3);
      verificar.equal((await servicio.obtenerEstado()).grupos[0].cantidad, 3);
    } finally {await servicio.detener();}
    const copia = await crearRespaldo(baseDatos, rutas.join(directorioTemporal, 'backups'));
    await baseDatos.transaccion(async transaccion => {
      await transaccion.ejecutar('DELETE FROM sesiones');
      for (const tabla of [...TABLAS_RESPALDO].reverse()) await transaccion.ejecutar(`DELETE FROM ${tabla}`);
    });
    await restaurarRespaldo(baseDatos, copia);
    const recuperado = crearServicioConcentraciones(baseDatos);
    try {
      await recuperado.solicitarActualizacion();
      verificar.equal(await totalAlertas(), 3);
      verificar.equal((await recuperado.obtenerEstado()).grupos[0].cantidad, 3);
    } finally {await recuperado.detener();}
  });
});
