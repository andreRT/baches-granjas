# Requerimientos de la primera versión

Los capítulos I a III aportan el objetivo, las tecnologías, los perfiles y el proceso. El capítulo IV contiene indicaciones académicas para elaborar el diseño. El usuario confirmó que el código se construye desde cero y pidió nombres propios en español e interfaz sin opciones de demostración.

| ID | Función | Estado |
| --- | --- | --- |
| RF01 | Registro ciudadano | Implementado con rol fijo ciudadano |
| RF02 | Inicio y cierre de sesión | Implementado con sesión revocable |
| RF03 | Cuentas privadas del personal | Alta directa en la base mediante personal:crear, sin pantalla ni API de registro |
| RF04 | Reporte con ubicación, contacto y foto | Implementado y validado en el servidor |
| RF05 | Punto en mapa y cobertura | Contornos IECM 06-050 y 06-051; validación compartida entre React y API |
| RF06 | Folio único, fecha y Pendiente | Implementado con restricción de unicidad |
| RF07 | Consulta de reportes propios e historial | Implementado con autorización |
| RF08 | Consulta y gestión administrativa | Implementado con búsqueda y filtro |
| RF09 | Asignación del supervisor | Implementado junto al cambio de estado |
| RF10 | Resolución con evidencia | Implementado solo para el ingeniero asignado |
| RF11 | Mapa activo y calor | Implementado, excluye finalizados |
| RF12 | Dashboard público | Inicio con indicadores, calor y concentraciones sin sesión; acceso requerido al reportar o gestionar |
| Complementario | Historial y notificaciones | Implementados dentro del sistema; envío por correo fuera de la etapa actual |
| Complementario | DBSCAN y concentraciones | Detección automática en Python, visualización en Inicio/Mapa y alertas persistentes para alcaldía |
| Complementario | Respaldo y recuperación | Implementados manualmente; programación diaria pendiente |

## Proceso autorizado

1. El ciudadano registra el reporte en Pendiente.
2. Administración asigna al ingeniero y cambia a En proceso de resolución.
3. El ingeniero asignado adjunta evidencia y marca Resuelto.
4. Administración verifica y confirma Finalizado.

No se incluyen oficios, presupuestos, cuadrillas, reapertura, fusión automática de folios ni integración con SUAC. Los reportes se conservan después del cierre.

La indicación posterior del usuario exige detectar concentraciones sin pulsar un botón. La implementación actualiza las zonas al cambiar los reportes y mediante una comprobación periódica del servidor. Las concentraciones incluyen solamente reportes pendientes o en proceso; resolver o finalizar una incidencia deja de sumarla. La alcaldía recibe alertas nuevas y por duplicación de la cantidad, sin repetirlas en cada consulta. El motor predeterminado implementa DBSCAN con la biblioteca estándar de Python; scikit-learn queda como alternativa configurable por el bloqueo de sus dependencias numéricas en Windows. Esta diferencia técnica con lo propuesto en los capítulos está documentada en CONCENTRACIONES.md.

## Operación y validación

La aplicación activa usa la base reportes_granjas. La base anterior con los ejemplos permanece separada y sin modificaciones. Por indicación posterior del usuario, la interfaz abre el dashboard público y permite explorar el mapa de calor y las concentraciones sin sesión. Iniciar sesión abre el acceso y únicamente ofrece el registro ciudadano. Crear un reporte requiere autenticación y continúa al formulario cuando accede un ciudadano. Las credenciales de alcaldía e ingeniería son proporcionadas después de registrar al personal directamente en la base; el responsable técnico usa la herramienta interna personal:crear.

Las pruebas comprueban que una base vacía no habilite registro administrativo, que la antigua ruta de configuración no permita crear cuentas y que las solicitudes de registro con un rol de personal sean rechazadas. También cubren el acceso de las cuentas de personal insertadas directamente en la base, registro ciudadano, autenticación, contactos e imágenes ajenas, campos incompletos, archivos inválidos, ubicaciones fuera de zona, transiciones prohibidas, asignación simultánea, evidencia obligatoria, historial, avisos, sesión y recuperación de respaldos. Se ejecutan con bases temporales en MySQL y SQLite, separadas de la operación.

## Prioridades acordadas el 24 de noviembre de 2026

La tarea inmediata es reparar el entorno de Python y permitir pruebas locales del análisis automático. Las notificaciones se utilizarán dentro del sistema; correo y recuperación de contraseña no son prioridad. La programación de respaldos se pospone. Se solicita, para una etapa posterior, seleccionar un servicio de almacenamiento de fotografías en la nube con plan gratuito y conectar la aplicación. No se modifica el almacenamiento local en esta etapa.
