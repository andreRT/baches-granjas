# Convenciones para programar en español

El código propio utiliza nombres en español para variables, funciones, componentes, propiedades de dominio, tablas y columnas. Las variables usan camelCase, las constantes compartidas usan MAYUSCULAS_CON_GUIONES y las columnas de la base usan snake_case. Se omiten tildes en identificadores para facilitar su escritura.

Ejemplos: `usuario`, `reporte`, `idIngeniero`, `fechaActual`, `guardarFotografia`, `crearNotificacion`, `abrirBaseDatos`, `FormularioReporte`, `ESTADOS.PENDIENTE` e `id_ciudadano`.

Los identificadores exigidos por JavaScript, HTML o bibliotecas conservan su contrato. Cambiar `respuesta.status`, `archivo.name`, `evento.target.value`, `referencia.current` o las opciones `user` y `password` de MySQL impediría que sus bibliotecas funcionaran. Los nombres locales sí están en español:

```js
import { useState as usarEstado } from 'react';
import { randomUUID as generarIdentificador } from 'node:crypto';

const [usuario, establecerUsuario] = usarEstado(null);
const idReporte = generarIdentificador();
```

En el motor opcional de scikit-learn, los argumentos `eps`, `min_samples`, `metric` y `algorithm` pertenecen a esa biblioteca. El algoritmo se importa como `AgrupamientoDBSCAN`. El motor predeterminado usa la biblioteca estándar de Python; los datos propios se llaman `puntos`, `radio_metros`, `minimo_puntos`, `coordenadas` y `grupos`.

Las carpetas y comandos convencionales de las herramientas, como `src`, `server`, `scripts`, `npm run dev` y `npm run build`, se mantienen para conservar el arranque existente. También hay comandos en español para preparar la base, crear personal y administrar respaldos.

Las pruebas automatizadas están separadas de los datos de operación. Los registros de sus bases temporales nunca se cargan en la aplicación.
