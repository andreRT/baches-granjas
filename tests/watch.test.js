import prueba from 'node:test';
import verificar from 'node:assert/strict';
import { mkdtemp as crearDirectorioTemporal, mkdir as crearDirectorio, writeFile as escribirArchivo, utimes as cambiarFechasArchivo, rm as eliminarRuta } from 'node:fs/promises';
import sistemaOperativo from 'node:os';
import rutas from 'node:path';
import { vigilarCodigoFuente } from '../scripts/watch-source.js';
prueba("MySQL y los cambios de metadatos no reinician la API; editar código sí", async contextoPrueba => {
  const raiz = await crearDirectorioTemporal(rutas.join(sistemaOperativo.tmpdir(), "granjas-watch-"));
  for (const directorio of ["server", "shared", "data/local-mysql", "node_modules/example"]) {
    await crearDirectorio(rutas.join(raiz, directorio), {
      recursive: true
    });
  }
  const entradaArchivo = rutas.join(raiz, "server/index.js");
  await escribirArchivo(entradaArchivo, "console.log(\"original\");");
  await escribirArchivo(rutas.join(raiz, 'server/segundo.js'), 'export const segundo = 2;');
  let reinicios = 0;
  const monitor = await vigilarCodigoFuente({
    raiz: raiz,
    alCambiar: () => {
      reinicios++;
    },
    intervaloMilisegundos: 60000,
    alError: error => {
      throw error;
    }
  });
  contextoPrueba.after(async () => {
    monitor.detener();
    verificar.ok(raiz.startsWith(rutas.join(sistemaOperativo.tmpdir(), "granjas-watch-")));
    await eliminarRuta(raiz, {
      recursive: true,
      force: true
    });
  });
  await escribirArchivo(rutas.join(raiz, "data/local-mysql/binlog.000003"), "nueva escritura de MySQL");
  await escribirArchivo(rutas.join(raiz, "node_modules/example/index.js"), "cambio de una dependencia");
  await monitor.comprobar();
  verificar.equal(reinicios, 0, "las escrituras de la base y dependencias no deben reiniciar");
  await cambiarFechasArchivo(entradaArchivo, new Date(), new Date());
  await monitor.comprobar();
  verificar.equal(reinicios, 0, "un cambio de fecha sin modificar el contenido no debe reiniciar");
  await escribirArchivo(entradaArchivo, "console.log(\"editado\");");
  await monitor.comprobar();
  verificar.equal(reinicios, 1, "un cambio real de código debe reiniciar una sola vez");
  await monitor.comprobar();
  verificar.equal(reinicios, 1);
  await escribirArchivo(rutas.join(raiz, "shared/nuevo.js"), "export const nuevo = true;");
  await monitor.comprobar();
  verificar.equal(reinicios, 2, "un archivo de código nuevo también debe detectarse");
  await escribirArchivo(rutas.join(raiz, "shared/geografia.json"), '{"type":"FeatureCollection","features":[]}');
  await monitor.comprobar();
  verificar.equal(reinicios, 3, "actualizar la delimitación compartida debe recargar la API");
});
