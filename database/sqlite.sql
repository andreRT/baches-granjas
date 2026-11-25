PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, correo TEXT NOT NULL UNIQUE COLLATE NOCASE,
  resumen_contrasena TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN ('ciudadano','administracion','ingeniero')),
  fecha_creacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sesiones (
  resumen_token TEXT PRIMARY KEY, id_usuario TEXT NOT NULL REFERENCES usuarios(id), fecha_vencimiento TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reportes (
  id TEXT PRIMARY KEY, folio TEXT NOT NULL UNIQUE, id_ciudadano TEXT NOT NULL REFERENCES usuarios(id),
  id_ingeniero TEXT REFERENCES usuarios(id), tipo TEXT NOT NULL CHECK(tipo IN ('Bache','Socavón')),
  descripcion TEXT NOT NULL, calle TEXT NOT NULL, entre_calles TEXT NOT NULL,
  colonia TEXT NOT NULL, alcaldia TEXT NOT NULL, codigo_postal TEXT NOT NULL,
  numero_exterior TEXT NOT NULL, referencias TEXT NOT NULL, correo_contacto TEXT NOT NULL,
  telefono TEXT NOT NULL, latitud REAL NOT NULL, longitud REAL NOT NULL,
  estado TEXT NOT NULL CHECK(estado IN ('Pendiente','En proceso de resolución','Resuelto','Finalizado')),
  fecha_creacion TEXT NOT NULL, fecha_actualizacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fotografias (
  id TEXT PRIMARY KEY, id_reporte TEXT NOT NULL REFERENCES reportes(id),
  categoria TEXT NOT NULL CHECK(categoria IN ('incidencia','resolucion')), nombre_archivo TEXT NOT NULL,
  id_autor TEXT NOT NULL REFERENCES usuarios(id), fecha_creacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS historial_reportes (
  id TEXT PRIMARY KEY, id_reporte TEXT NOT NULL REFERENCES reportes(id),
  estado_anterior TEXT, estado_nuevo TEXT NOT NULL, id_responsable TEXT NOT NULL REFERENCES usuarios(id),
  observaciones TEXT NOT NULL, fecha_creacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notificaciones (
  id TEXT PRIMARY KEY, id_usuario TEXT NOT NULL REFERENCES usuarios(id), id_reporte TEXT NOT NULL REFERENCES reportes(id),
  mensaje TEXT NOT NULL, fecha_lectura TEXT, fecha_creacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS correos_pendientes (
  id TEXT PRIMARY KEY, id_notificacion TEXT NOT NULL REFERENCES notificaciones(id),
  destinatario TEXT NOT NULL, asunto TEXT NOT NULL, contenido TEXT NOT NULL,
  fecha_envio TEXT, intentos INTEGER NOT NULL DEFAULT 0, ultimo_error TEXT, fecha_creacion TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_citizen ON reportes(id_ciudadano);
CREATE INDEX IF NOT EXISTS idx_reports_engineer ON reportes(id_ingeniero);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reportes(estado);
CREATE INDEX IF NOT EXISTS idx_history_report ON historial_reportes(id_reporte);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notificaciones(id_usuario);
CREATE TABLE IF NOT EXISTS estado_concentraciones (
  id TEXT PRIMARY KEY, huella TEXT NOT NULL, resultado TEXT NOT NULL, fecha_actualizacion TEXT
);
CREATE TABLE IF NOT EXISTS concentraciones (
  id TEXT PRIMARY KEY, nombre_zona TEXT NOT NULL, ids_reportes TEXT NOT NULL, cantidad INTEGER NOT NULL,
  latitud REAL NOT NULL, longitud REAL NOT NULL, radio_visual_metros REAL NOT NULL,
  cantidad_ultimo_aviso INTEGER NOT NULL, activa INTEGER NOT NULL,
  fecha_deteccion TEXT NOT NULL, fecha_actualizacion TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notificaciones_concentracion (
  id_notificacion TEXT NOT NULL UNIQUE REFERENCES notificaciones(id),
  id_concentracion TEXT NOT NULL REFERENCES concentraciones(id),
  id_usuario TEXT NOT NULL REFERENCES usuarios(id), umbral INTEGER NOT NULL,
  PRIMARY KEY(id_usuario,id_concentracion,umbral)
);
