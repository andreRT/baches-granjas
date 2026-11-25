-- Ejecutar sobre una base vacía MySQL 8.4. No contiene DROP ni datos personales.
CREATE TABLE IF NOT EXISTS usuarios (
  id VARCHAR(36) PRIMARY KEY, nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(254) NOT NULL UNIQUE, resumen_contrasena VARCHAR(256) NOT NULL,
  rol ENUM('ciudadano','administracion','ingeniero') NOT NULL, fecha_creacion VARCHAR(24) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS sesiones (
  resumen_token CHAR(64) PRIMARY KEY, id_usuario VARCHAR(36) NOT NULL,
  fecha_vencimiento VARCHAR(24) NOT NULL, FOREIGN KEY(id_usuario) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS reportes (
  id VARCHAR(36) PRIMARY KEY, folio VARCHAR(40) NOT NULL UNIQUE,
  id_ciudadano VARCHAR(36) NOT NULL, id_ingeniero VARCHAR(36),
  tipo ENUM('Bache','Socavón') NOT NULL, descripcion TEXT NOT NULL,
  calle VARCHAR(160) NOT NULL, entre_calles VARCHAR(200) NOT NULL,
  colonia VARCHAR(80) NOT NULL, alcaldia VARCHAR(80) NOT NULL,
  codigo_postal CHAR(5) NOT NULL, numero_exterior VARCHAR(30) NOT NULL,
  referencias VARCHAR(500) NOT NULL, correo_contacto VARCHAR(254) NOT NULL,
  telefono VARCHAR(25) NOT NULL, latitud DOUBLE NOT NULL, longitud DOUBLE NOT NULL,
  estado ENUM('Pendiente','En proceso de resolución','Resuelto','Finalizado') NOT NULL,
  fecha_creacion VARCHAR(24) NOT NULL, fecha_actualizacion VARCHAR(24) NOT NULL,
  FOREIGN KEY(id_ciudadano) REFERENCES usuarios(id), FOREIGN KEY(id_ingeniero) REFERENCES usuarios(id),
  INDEX idx_reports_citizen(id_ciudadano), INDEX idx_reports_engineer(id_ingeniero), INDEX idx_reports_status(estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS fotografias (
  id VARCHAR(36) PRIMARY KEY, id_reporte VARCHAR(36) NOT NULL,
  categoria ENUM('incidencia','resolucion') NOT NULL, nombre_archivo VARCHAR(100) NOT NULL,
  id_autor VARCHAR(36) NOT NULL, fecha_creacion VARCHAR(24) NOT NULL,
  FOREIGN KEY(id_reporte) REFERENCES reportes(id), FOREIGN KEY(id_autor) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS historial_reportes (
  id VARCHAR(36) PRIMARY KEY, id_reporte VARCHAR(36) NOT NULL,
  estado_anterior VARCHAR(40), estado_nuevo VARCHAR(40) NOT NULL, id_responsable VARCHAR(36) NOT NULL,
  observaciones VARCHAR(1000) NOT NULL, fecha_creacion VARCHAR(24) NOT NULL,
  FOREIGN KEY(id_reporte) REFERENCES reportes(id), FOREIGN KEY(id_responsable) REFERENCES usuarios(id),
  INDEX idx_history_report(id_reporte)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notificaciones (
  id VARCHAR(36) PRIMARY KEY, id_usuario VARCHAR(36) NOT NULL, id_reporte VARCHAR(36) NOT NULL,
  mensaje VARCHAR(500) NOT NULL, fecha_lectura VARCHAR(24), fecha_creacion VARCHAR(24) NOT NULL,
  FOREIGN KEY(id_usuario) REFERENCES usuarios(id), FOREIGN KEY(id_reporte) REFERENCES reportes(id),
  INDEX idx_notifications_user(id_usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS correos_pendientes (
  id VARCHAR(36) PRIMARY KEY, id_notificacion VARCHAR(36) NOT NULL,
  destinatario VARCHAR(254) NOT NULL, asunto VARCHAR(200) NOT NULL, contenido TEXT NOT NULL,
  fecha_envio VARCHAR(24), intentos INT NOT NULL DEFAULT 0, ultimo_error VARCHAR(500), fecha_creacion VARCHAR(24) NOT NULL,
  FOREIGN KEY(id_notificacion) REFERENCES notificaciones(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS estado_concentraciones (
  id VARCHAR(20) PRIMARY KEY, huella CHAR(64) NOT NULL,
  resultado LONGTEXT NOT NULL, fecha_actualizacion VARCHAR(24)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS concentraciones (
  id VARCHAR(36) PRIMARY KEY, nombre_zona VARCHAR(260) NOT NULL,
  ids_reportes LONGTEXT NOT NULL, cantidad INT NOT NULL,
  latitud DOUBLE NOT NULL, longitud DOUBLE NOT NULL, radio_visual_metros DOUBLE NOT NULL,
  cantidad_ultimo_aviso INT NOT NULL, activa TINYINT NOT NULL,
  fecha_deteccion VARCHAR(24) NOT NULL, fecha_actualizacion VARCHAR(24) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notificaciones_concentracion (
  id_notificacion VARCHAR(36) NOT NULL UNIQUE, id_concentracion VARCHAR(36) NOT NULL,
  id_usuario VARCHAR(36) NOT NULL, umbral INT NOT NULL,
  PRIMARY KEY(id_usuario,id_concentracion,umbral),
  FOREIGN KEY(id_notificacion) REFERENCES notificaciones(id),
  FOREIGN KEY(id_concentracion) REFERENCES concentraciones(id),
  FOREIGN KEY(id_usuario) REFERENCES usuarios(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
