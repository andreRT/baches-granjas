# Concentraciones y alertas automáticas

El usuario pidió que el programa identifique y muestre concentraciones de incidencias sin iniciar el análisis con un botón. El servicio corre en el servidor aunque ninguna persona esté viendo el mapa. No fusiona reportes ni cambia su prioridad, responsable o estado.

## Criterio

- Solo participan reportes Pendientes o En proceso de resolución con coordenadas dentro de la cobertura IECM.
- DBSCAN usa distancia Haversine, vecindad de 150 metros y mínimo de 3 reportes, incluido el punto que se evalúa.
- Un grupo puede extenderse más de 150 metros mediante una cadena de núcleos densos. El radio no es un límite del tamaño completo del grupo.
- Los reportes que no cumplen el criterio siguen visibles como puntos individuales. Los resueltos se muestran hasta el cierre, pero no suman a la concentración ni a la capa de calor por atender.
- El círculo rojizo de una concentración es una referencia visual: cubre sus integrantes con un margen de 30 metros y se dibuja con un radio mínimo de 120 metros para distinguirlo en la vista general. No representa un perímetro de daño comprobado ni modifica la cobertura de registro.
- Se cuentan reportes, sin afirmar que cada uno corresponda a un bache distinto. La densidad no determina por sí sola la gravedad.

El criterio de núcleos, puntos de borde y ruido sigue la [descripción de DBSCAN de scikit-learn](https://scikit-learn.org/stable/modules/clustering.html#dbscan).

## Automatización

Al iniciar la API se ejecuta una revisión. Se solicita otra después de confirmar cada alta y cambio de estado, y un temporizador revisa los datos cada 30 segundos. La huella del conjunto permite reutilizar el resultado si no cambian los datos. Las solicitudes simultáneas se agrupan en una cola y se vuelve a comprobar el conjunto antes de publicar un resultado. La fila de estado se bloquea durante la publicación en MySQL.

Las zonas, sus integrantes y los umbrales de avisos se guardan en la base. La identidad se conserva por el mayor número de reportes compartidos. En una división, una sola parte conserva la identidad; en una unión, se conserva la de mayor coincidencia. Una zona que deja de cumplir el mínimo queda inactiva. Si vuelve a formarse una concentración después, puede recibir una identidad nueva.

La pantalla actualiza puntos, zonas y notificaciones cada 15 segundos mientras está visible y al volver a la pestaña. Por tanto, existe un pequeño intervalo entre una escritura y su aparición en otras sesiones; la detección no requiere recargar ni pulsar Actualizar. Los filtros del mapa solicitan automáticamente el análisis de la selección. Sus resultados no cambian las alertas globales de alcaldía.

## Alertas

Cada cuenta de alcaldía recibe una alerta persistente al detectarse una zona y cuando su cantidad alcanza al menos el doble de la cantidad de la última alerta. Por ejemplo: 3 reportes generan una alerta; 4 o 5 actualizan el mapa; 6 generan una nueva alerta. La restricción única por destinatario, concentración y umbral impide repeticiones al consultar, reiniciar o ejecutar dos instancias.

Las nuevas cuentas de alcaldía reciben aviso de las zonas que continúan activas. Ciudadanía e ingeniería pueden ver las concentraciones en el mapa comunitario, pero no reciben estas alertas administrativas. Los avisos de seguimiento de sus reportes siguen funcionando.

Las alertas aparecen en Notificaciones y abren la zona del mapa. Cuando la zona queda inactiva, el aviso conserva su historial y la interfaz lo indica. Se genera también el correo pendiente mediante la bandeja existente; su entrega requiere SMTP configurado y no se ha verificado con destinatarios externos.

## Motor de Python y diferencia con los capítulos

Los capítulos proponen scikit-learn. En esta computadora se confirmó que Windows bloquea una extensión de SciPy al importar esa biblioteca. El motor predeterminado ahora implementa DBSCAN con módulos de la biblioteca estándar de Python, sin importar dependencias numéricas externas ni modificar la protección de Windows. Conserva el algoritmo, la métrica y los parámetros; no es un agrupamiento por cuadrícula ni un simple conteo de puntos cercanos.

Se puede elegir explícitamente `MOTOR_DBSCAN=scikit-learn` e instalar `analysis/requirements.txt` cuando las bibliotecas estén autorizadas. Esa opción no se ha podido verificar aquí debido al bloqueo. No se presenta el motor estándar como si utilizara scikit-learn.

`PYTHON_EJECUTABLE` permite seleccionar el intérprete; las rutas relativas se resuelven desde la raíz del proyecto. En Windows x64, `npm run python:preparar` descarga Python 3.14.10 oficial y verifica su SHA-256 antes de extraerlo en `.python/`. Si no se define un ejecutable, se prefiere esa copia local, después `.venv` y finalmente Python del sistema. El motor estándar no necesita pip ni paquetes externos. La configuración local apunta a `./.python/python.exe`, sin depender de rutas de Codex que pueden desaparecer tras una actualización. Un despliegue requiere preparar su propio intérprete según el sistema operativo.

## Fallas, límites y respaldo

El análisis admite hasta 2000 reportes por atender, se ejecuta fuera del proceso Node.js y tiene un límite de 15 segundos. Las consultas de vista comparten resultados y serializan ejecuciones de Python. Si falta Python, falla el cálculo o se supera el límite, el registro de reportes sigue funcionando; se conserva el último resultado y la interfaz advierte que puede estar desactualizado. No se publica un resultado vacío como si se hubiera comprobado que no existen concentraciones.

Los respaldos de formato 2 incluyen las tres tablas nuevas. Se mantiene lectura de respaldos anteriores de formato 1, que no tenían concentraciones; después de restaurarlos, estas se reconstruyen al iniciar la aplicación.

## Verificación

`npm run test:python` cubre grupos, ruido, puntos de borde, expansión por cadenas, mínimo de puntos, coordenadas inválidas y el límite de 2000 reportes. `npm test` y `npm run test:mysql` comprueban las altas simultáneas que alcanzan el umbral, el crecimiento, la deduplicación entre instancias, filtros sin avisos, fallas y recuperación, retiro por resolución, detección sin solicitudes al mapa, lectura de alertas y respaldo con reinicio.
