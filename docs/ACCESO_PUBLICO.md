# Dashboard público y acceso a la cuenta

La portada muestra el dashboard sin exigir inicio de sesión. Permite consultar indicadores de toda la comunidad, mapa de calor, concentraciones, filtros del mapa y actividad reciente. La consulta no crea una cuenta ni una sesión.

## Navegación

**Iniciar sesión** abre un formulario simple con título, correo y contraseña. **Registrarse** cambia al formulario ciudadano e incorpora el nombre completo. Ambos conservan **Volver al inicio**. Por indicación del usuario se retiraron los lemas, ilustraciones, bloques promocionales y explicaciones repetidas de la interfaz; se mantienen las etiquetas de datos, validaciones, errores y confirmaciones de operación.

**Iniciar sesión** y **Crear reporte** se encuentran únicamente en la parte derecha de la interfaz. El panel izquierdo conserva la navegación y queda disponible para futuras funciones. No hay botón de actualización manual: los datos se cargan al abrir o refrescar la página, después de guardar cambios y cada 15 segundos mientras está visible.

**Crear reporte** pide acceso si todavía no hay sesión. Después de ingresar o registrarse como ciudadano se abre directamente el formulario del reporte. Si ingresa una cuenta de personal, se abre su inicio con las funciones que corresponden a su rol.

Al cerrar o vencer la sesión se retiran los datos privados del cliente y se vuelve al dashboard público. Las cargas anteriores se cancelan para que una respuesta pendiente no reponga datos del perfil anterior. El mapa público mantiene la actualización periódica y las concentraciones automáticas.

## Información compartida

La consulta `GET /api/publico/panel` devuelve indicadores agregados por estado, puntos activos, cuatro registros recientes y concentraciones. Los registros individuales contienen exclusivamente `id`, `folio`, `tipo`, `calle`, `colonia`, `latitud`, `longitud`, `estado` y `fecha_creacion`.

`GET /api/publico/analisis` aplica los filtros geográficos de la pantalla pública. Conserva la validación de parámetros, la limitación de solicitudes y la cola de procesamiento. Su respuesta omite el motor, identificadores de integrantes de los grupos y mensajes internos de configuración. Leer o filtrar el mapa no genera alertas.

Los puntos finalizados se excluyen del mapa; sus estados continúan reflejados en los totales y pueden aparecer en la actividad reciente. Los resueltos siguen en el mapa hasta el cierre, sin sumar al calor ni a las concentraciones por atender.

No se publican nombres de personas, cuentas, correos, teléfonos, referencias detalladas, fotografías, historial privado, notificaciones ni asignaciones. Los folios de la tabla pública se muestran como texto; no abren el detalle privado de un reporte.

## Permisos

| Función | Sin sesión | Cuenta necesaria |
| --- | --- | --- |
| Indicadores, puntos, calor, concentraciones y filtros | Disponible | No |
| Crear y seguir reportes propios | Acceso solicitado | Ciudadano |
| Asignar atención y confirmar el cierre | No disponible | Alcaldía |
| Registrar resolución con evidencia | No disponible | Ingeniero asignado |
| Fotografías y detalle privado | No disponible | Cuenta autorizada para el reporte |
| Notificaciones | No disponible | Destinatario autenticado |

El único registro de cuentas que ofrece la aplicación sigue siendo el ciudadano. Las cuentas de personal se crean directamente en la base mediante la herramienta interna.

## Verificación

Las pruebas de integración comprueban lectura pública sin cookies, campos permitidos, ausencia de contactos y fotografías en las respuestas, indicadores de avance, filtros y concentraciones públicas, y rechazo de las operaciones privadas sin sesión. Se mantienen las pruebas de perfiles, estados, alertas y respaldos en SQLite y MySQL.
