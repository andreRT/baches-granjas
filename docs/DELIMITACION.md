# Delimitación de Granjas México I y II

La cobertura del proyecto es la unión de estas dos unidades territoriales de Iztacalco:

| Clave IECM | Unidad territorial |
| --- | --- |
| 06-050 | Granjas México I |
| 06-051 | Granjas México II |

Se utilizan los límites de participación ciudadana del IECM. La división I/II corresponde a esas unidades territoriales; este criterio no constituye un deslinde catastral.

## Fuente y procedencia

Los contornos se descargaron del [visor cartográfico del IECM](https://scmgpc.iecm.mx/Cartografia_SCMGPC.php) el 16 de noviembre de 2026, hora de Ciudad de México. El portal se presenta como SCMGPC 2025. Su código público consulta las geometrías con el identificador técnico `ut_2024`; se conserva ese dato en la procedencia y no se atribuye una fecha distinta a la geometría.

El comando de actualización utiliza las mismas consultas de lectura del visor a `https://scmgpc.iecm.mx/paginas/controlador.php`:

1. `opcion=obtenerPoligono`, `dato=06-050` o `06-051`, `bd=ut_2024`.
2. `opcion=obtenerDatosUT`, `claveUT=06-050` o `06-051`.

Antes de guardar, contrasta clave, nombre, alcaldía y coordenadas de ambas respuestas. Verifica el cierre de cada anillo y que las coordenadas estén en el entorno de Iztacalco. Una respuesta fallida o distinta al formato esperado interrumpe la actualización antes de escribir los archivos. No se ejecuta código descargado.

Los contornos conservan los 101 y 87 vértices publicados, respectivamente, incluido el punto de cierre. Solo se convierte el formato del visor a GeoJSON: `[longitud, latitud]`. No se redibujan ni simplifican. `shared/geografia/procedencia.json` registra fuente, descarga, criterio y SHA-256 del GeoJSON.

## Comportamiento de la aplicación

- El mapa ajusta su vista a ambas unidades y las distingue con colores y etiquetas.
- React y Node.js usan `shared/geografia/granjas-mexico.json` mediante las funciones de `shared/domain.js`.
- Los puntos deben pertenecer a al menos uno de los polígonos. El rectángulo envolvente no se usa para autorizar ubicaciones.
- Los bordes exteriores y la división compartida se admiten. Sobre la división compartida se asigna Granjas México I por orden de clave.
- La comparación incorpora únicamente una tolerancia numérica de `1e-10` grados para redondeo de coma flotante; no agrega una franja de cobertura en metros.
- La API calcula `colonia` a partir de las coordenadas de cada reporte nuevo. No acepta ese dato como autoridad desde el navegador.
- Los reportes existentes conservan su dirección e historial; esta actualización no modifica registros anteriores.
- La validación funciona con los contornos incluidos aunque el IECM no esté disponible. La carga de las teselas del mapa base sí requiere conexión.

## Actualizar la fuente

Desde la carpeta del proyecto:

```powershell
npm run geografia:actualizar
npm test
npm run build
```

Revisa visualmente cualquier cambio de límites antes de publicarlo. En desarrollo, la actualización del JSON recarga la API y Vite. En un despliegue, vuelve a compilar y reinicia el servicio para que interfaz y API utilicen la misma versión.

## Revisar en Google Maps

El mapa base de la aplicación sigue siendo Leaflet con OpenStreetMap. Para cotejar los contornos sobre cartografía de Google, el proyecto incluye `public/geografia/granjas-mexico-i-ii.kml`, generado con las mismas coordenadas que el GeoJSON.

En [Google My Maps](https://mymaps.google.com/), crea un mapa, añade una capa y selecciona **Importar** para cargar ese KML. Google documenta este procedimiento en su [ayuda de importación de archivos](https://support.google.com/mymaps/answer/3024836?hl=es). La fuente de los contornos continúa siendo el IECM.

## Verificación

Las pruebas cubren puntos interiores de I y II, extensiones al norte y al este omitidas por el rectángulo anterior, puntos exteriores antes permitidos, bordes, división compartida, geometrías con huecos y múltiples polígonos, y coordenadas inválidas. El flujo de API comprueba el rechazo de una ubicación exterior y el guardado de reportes en ambas unidades, con colonia determinada por el servidor. Se ejecuta en bases temporales separadas de la operación.
