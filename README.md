# Reportes viales de Granjas México

Aplicación para registrar baches y socavones y gestionar su atención entre ciudadanía, administración e ingeniería. Utiliza React, Node.js, MySQL, Leaflet y un componente Python para DBSCAN.

## Arranque

En esta computadora ya están preparadas las dependencias y la instancia MySQL local del proyecto, puerto 3307.

```powershell
cd 'C:\Users\andre\OneDrive\Documentos\ChatGPT\Andre\baches-granjas'
npm run dev
```

Abre http://127.0.0.1:5173. La API usa el puerto 3001. Detén los procesos con Ctrl+C. No ejecutes dos copias del proyecto simultáneamente.

La aplicación abre el dashboard público: indicadores de la comunidad, mapa de calor, concentraciones y actividad reciente, sin exigir una cuenta. La opción **Iniciar sesión** abre el acceso y el registro ciudadano. Elegir **Crear reporte** sin sesión lleva al acceso y continúa al formulario después de autenticar a un ciudadano. Alcaldía e ingeniería inician sesión para gestionar sus funciones. No hay una pantalla de configuración de administración ni un formulario para crear personal.

La opción **Crea tu cuenta** registra exclusivamente ciudadanos. Los usuarios de alcaldía e ingeniería reciben sus credenciales después de que el responsable técnico los registre directamente en la base de datos con la herramienta interna descrita más abajo. Todos los perfiles utilizan el mismo inicio de sesión.

## Datos de operación

La base activa es `reportes_granjas`, con tablas y columnas en español. Inicia sin reportes de ejemplo. La base anterior `baches_granjas_local`, que contenía seis reportes ficticios, se conservó sin modificar y no está conectada a la interfaz actual. También se conservan sus archivos de imagen. No se renombraron esos ejemplos para presentarlos como incidencias reales.

La configuración privada está en `.env`. Las fotografías nuevas se guardan en `data/fotografias`. No compartas `.env`, `data/` o `backups/` ni los subas a Git.

## Programación en español

Las variables, funciones, componentes y datos del dominio usan nombres en español: `usuario`, `reporte`, `idIngeniero`, `abrirBaseDatos`, `crearAplicacion`, `FormularioReporte`, `ESTADOS.PENDIENTE`. Los datos de la API y de la base utilizan campos como `correo_contacto`, `fecha_creacion` e `id_ingeniero`.

Los contratos de las bibliotecas conservan sus identificadores obligatorios: propiedades HTML, opciones de MySQL, métodos de Node.js y argumentos de scikit-learn. Los módulos importados tienen alias en español. Consulta [las convenciones de nombres](docs/CONVENCIONES.md).

## Flujo de atención

1. El ciudadano registra la incidencia, dirección, contacto, ubicación y fotografía.
2. Administración asigna al ingeniero y cambia a **En proceso de resolución**.
3. El ingeniero asignado adjunta evidencia y marca **Resuelto**.
4. Administración revisa y confirma **Finalizado**.

El folio, las fotografías, el historial y los avisos permanecen consultables con sus permisos. Un reporte finalizado deja de aparecer en el mapa. No se permiten saltos de estado ni reaperturas.

Las fotografías admitidas son JPG, PNG y WebP de hasta 5 MB. El servidor las decodifica y guarda como WebP sin metadatos. El mapa comunitario comparte ubicaciones y estados sin revelar contactos ni evidencias ajenas.

## Crear cuentas de personal

Esta operación se realiza en la computadora del servidor, con acceso a las credenciales de MySQL. No existe una pantalla ni una ruta de la API para dar de alta personal. La herramienta ejecuta un INSERT en la tabla usuarios y deriva la contraseña mediante scrypt; no guarda contraseñas en texto plano.

Con MySQL iniciado, define la contraseña que se proporcionará al usuario de la alcaldía y ejecuta:

```powershell
$env:NUEVA_CONTRASENA_USUARIO = 'SustituyeEstoPorUnaClaveParaLaAlcaldia'
npm run personal:crear -- administracion alcaldia@example.com Nombre Apellido
Remove-Item Env:NUEVA_CONTRASENA_USUARIO
```

Para el ingeniero civil, utiliza una contraseña distinta:

```powershell
$env:NUEVA_CONTRASENA_USUARIO = 'SustituyeEstoPorUnaContrasenaPropia'
npm run personal:crear -- ingeniero ingenieria@example.com Nombre Apellido
Remove-Item Env:NUEVA_CONTRASENA_USUARIO
```

Proporciona a cada integrante su correo y contraseña por el medio acordado. Los correos y claves anteriores son marcadores para sustituir por los datos correspondientes; no se insertan automáticamente. La contraseña debe tener entre 10 y 128 caracteres. El comando no imprime la contraseña ni la acepta como argumento. El registro público siempre crea ciudadanos y rechaza solicitudes que intenten elegir un rol de personal.

## Instalación en otra computadora

Requiere Node.js 24.13 o superior, MySQL 8.0/8.4 y Python 3.10 o superior para el análisis automático. El motor predeterminado de DBSCAN usa la biblioteca estándar de Python.

```powershell
npm ci
Copy-Item .env.example .env
```

Configura en `.env` una base vacía y su usuario: `MYSQL_SERVIDOR`, `MYSQL_PUERTO`, `MYSQL_BASE_DATOS`, `MYSQL_USUARIO` y `MYSQL_CONTRASENA`. Después ejecuta:

```powershell
npm run base:preparar
npm run dev
```

Para crear una instancia aislada en Windows con el MySQL instalado en la ruta habitual, ejecuta `npm run db:local:init` antes de crear `.env`. El comando exige libre el puerto 3307 y no sobrescribe una instancia ni una configuración existentes. Utiliza `MYSQL_EJECUTABLE` si el ejecutable está en otra ruta.

Para preparar Python en Windows de 64 bits:

```powershell
npm run python:preparar
npm run test:python
```

El comando descarga el paquete integrado oficial de Python 3.14.10 desde python.org, verifica su SHA-256 y lo guarda en `.python/`. No modifica PATH ni depende de la instalación de Codex. Esta copia se usa antes que `.venv` si no se define `PYTHON_EJECUTABLE`; la configuración local de esta computadora apunta a `./.python/python.exe`. El análisis funciona sin conexión después de preparar Python.

En otros sistemas, instala Python 3.10 o superior y configura `PYTHON_EJECUTABLE` con el ejecutable correspondiente. Las rutas relativas se resuelven desde la raíz del proyecto. La instalación de `analysis/requirements.txt` solo es necesaria si seleccionas `MOTOR_DBSCAN=scikit-learn`; el motor predeterminado `python` no importa NumPy, SciPy ni scikit-learn. Las variables propias de configuración están en español; `NODE_ENV` mantiene el nombre que exige Node.js.

## Comandos

| Comando | Función |
| --- | --- |
| `npm run dev` | MySQL local cuando corresponde, API y React con recarga |
| `npm run build` | Compila la interfaz en dist |
| `npm start` | Sirve la API y la interfaz compilada |
| `npm run base:preparar` | Prepara las tablas de una base configurada |
| `npm run geografia:actualizar` | Descarga y contrasta los límites de Granjas México I y II del IECM |
| `npm run personal:crear -- rol correo Nombre` | Crea una cuenta de personal |
| `npm test` | Pruebas de permisos, flujo, respaldos y recarga en entornos temporales |
| `npm run test:mysql` | Prueba el flujo en una base MySQL temporal de la instancia local iniciada |
| `npm run test:python` | Pruebas del componente geográfico |
| `npm run python:preparar` | Prepara la copia oficial de Python para Windows x64 dentro del proyecto |
| `npm run respaldar` | Respalda registros y fotografías; conserva tres copias |
| `npm run restaurar -- ruta` | Recupera un respaldo en una base vacía |

Para servir directamente la compilación con `npm start`, configura `ORIGEN_APLICACION=http://127.0.0.1:3001`. En un despliegue con HTTPS, usa `NODE_ENV=production` y el origen HTTPS correspondiente para activar cookies Secure.

La recarga de API compara cada segundo el contenido JavaScript y JSON de server/ y shared/. Los archivos internos de MySQL y los cambios de fecha de OneDrive no reinician la API. Al cambiar `.env` o el comando de arranque, detén y vuelve a iniciar el proyecto.

## Pendientes técnicos

Prioridades acordadas el 24 de noviembre de 2026:

- La etapa actual se limita a reparar Python y comprobar el análisis automático en local.
- Las notificaciones serán internas dentro del sistema. No se configura ni se verifica envío por correo en esta etapa; SMTP permanece sin configurar.
- Recuperación de contraseña y programación de respaldos diarios quedan pospuestas.
- Para una etapa posterior se solicita almacenar las fotografías en un servicio de nube con plan gratuito. Falta elegir el servicio y conectar la aplicación; por ahora las fotografías siguen en almacenamiento local.
- El despliegue HTTPS y las pruebas con usuarios siguen pendientes. La aplicación no se integra con SUAC ni con sistemas oficiales.

El mapa de calor representa densidad de reportes; DBSCAN identifica grupos por proximidad. Ninguno determina por sí mismo la gravedad de una incidencia.

El acceso público utiliza consultas específicas de solo lectura. Comparte folio, tipo, calle, colonia, ubicación, fecha y estado; los indicadores son totales agregados. Los contactos, fotografías, detalles privados, notificaciones y operaciones de gestión conservan sus permisos. Consulta [el flujo de acceso público](docs/ACCESO_PUBLICO.md).

## Archivos principales

| Carpeta | Contenido |
| --- | --- |
| src | Componentes React, interfaz, mapa y estilos |
| server | API, sesiones, base, fotos, avisos y respaldos |
| shared | Estados, permisos y delimitación geográfica |
| database | Estructuras MySQL y SQLite en español |
| analysis | Agrupamiento y pruebas de Python |
| scripts | Arranque y herramientas de administración |
| tests | Pruebas automatizadas aisladas |
| docs | Diseño y convenciones |

La implementación sigue los capítulos I a III y la confirmación de que se comienza sin código previo. El capítulo IV contiene una guía académica de diseño. Consulta [requerimientos](docs/REQUERIMIENTOS.md) y [arquitectura](docs/ARQUITECTURA.md).
