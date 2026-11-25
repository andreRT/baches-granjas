import { DatabaseSync as BaseSqliteSincrona } from 'node:sqlite';
import { mkdir as crearDirectorio, readFile as leerArchivo } from 'node:fs/promises';
import rutas from 'node:path';
import clienteMysql from 'mysql2/promise';
import { configuracion, RAIZ } from './config.js';
async function abrirBaseDatos() {
  if (!["sqlite", "mysql"].includes(configuracion.motor)) throw new Error("MOTOR_BASE_DATOS debe ser sqlite o mysql.");
  let baseDatos;
  let conexionSqlite;
  let grupoConexiones;
  // La conexión SQLite serializa las transacciones completas,
  // incluidas las lecturas, para que ninguna solicitud vea datos sin confirmar.
  let cola = Promise.resolve();
  const serializar = operacion => {
    const resultado = cola.then(operacion);
    cola = resultado.catch(() => {});
    return resultado;
  };
  const adaptadorSqlite = {
    consultar: async (sentenciaSql, parametros = []) => conexionSqlite.prepare(sentenciaSql).all(...parametros),
    obtener: async (sentenciaSql, parametros = []) => conexionSqlite.prepare(sentenciaSql).get(...parametros),
    ejecutar: async (sentenciaSql, parametros = []) => conexionSqlite.prepare(sentenciaSql).run(...parametros)
  };
  if (configuracion.motor === "sqlite") {
    await crearDirectorio(rutas.dirname(configuracion.rutaSqlite), {
      recursive: true
    });
    conexionSqlite = new BaseSqliteSincrona(configuracion.rutaSqlite);
    conexionSqlite.exec(await leerArchivo(rutas.join(RAIZ, "database/sqlite.sql"), "utf8"));
    baseDatos = Object.fromEntries(Object.entries(adaptadorSqlite).map(([clave, operacion]) => [clave, (...argumentos) => serializar(() => operacion(...argumentos))]));
  } else {
    if (!process.env.MYSQL_BASE_DATOS || !process.env.MYSQL_USUARIO) throw new Error("Configura MYSQL_BASE_DATOS y MYSQL_USUARIO en .env.");
    grupoConexiones = clienteMysql.createPool({
      host: process.env.MYSQL_SERVIDOR || '127.0.0.1',
      port: Number(process.env.MYSQL_PUERTO || 3306),
      user: process.env.MYSQL_USUARIO,
      password: process.env.MYSQL_CONTRASENA,
      database: process.env.MYSQL_BASE_DATOS,
      connectionLimit: 5,
      charset: 'utf8mb4'
    });
    const esquema = await leerArchivo(rutas.join(RAIZ, "database/mysql.sql"), "utf8");
    for (const sentencia of esquema.split(";").filter(segmento => segmento.trim())) await grupoConexiones.query(sentencia);
    baseDatos = adaptadorMysql(grupoConexiones);
  }
  baseDatos.transaccion = async operacion => {
    if (conexionSqlite) return serializar(async () => {
      conexionSqlite.exec("BEGIN IMMEDIATE");
      try {
        const valor = await operacion(adaptadorSqlite);
        conexionSqlite.exec("COMMIT");
        return valor;
      } catch (error) {
        conexionSqlite.exec("ROLLBACK");
        throw error;
      }
    });
    const conexion = await grupoConexiones.getConnection();
    try {
      await conexion.beginTransaction();
      const resultado = await operacion(adaptadorMysql(conexion));
      await conexion.commit();
      return resultado;
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  };
  baseDatos.cerrar = async () => {
    await cola;
    if (conexionSqlite) conexionSqlite.close();
    if (grupoConexiones) await grupoConexiones.end();
  };
  return baseDatos;
}
export { abrirBaseDatos };
function adaptadorMysql(conexion) {
  return {
    consultar: async (sentenciaSql, parametros = []) => (await conexion.execute(sentenciaSql, parametros))[0],
    obtener: async (sentenciaSql, parametros = []) => (await conexion.execute(sentenciaSql, parametros))[0][0],
    ejecutar: async (sentenciaSql, parametros = []) => (await conexion.execute(sentenciaSql, parametros))[0]
  };
}
