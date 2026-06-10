// Configuración de conexión a SQL Server con Windows Authentication
require('dotenv').config();

const sql = require('mssql/msnodesqlv8');

const connectionString =
    process.env.DB_CONNECTION_STRING ||
    `Driver={ODBC Driver 18 for SQL Server};Server=${process.env.DB_SERVER || 'localhost'};Database=${process.env.DB_DATABASE || 'BD_BBVA'};Trusted_Connection=Yes;TrustServerCertificate=Yes;`;

const config = {
    connectionString,
    driver: 'msnodesqlv8',
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

/*
|--------------------------------------------------------------------------
| CONFIGURACIÓN ALTERNATIVA: Usuario y contraseña SQL Server
|--------------------------------------------------------------------------
| Si alguien usa SQL user, puede comentar lo de arriba y usar esto:
|
| const sql = require('mssql');
|
| const config = {
|     server: process.env.DB_SERVER || 'localhost',
|     port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
|     database: process.env.DB_DATABASE || 'BD_BBVA',
|     user: process.env.DB_USER,
|     password: process.env.DB_PASSWORD,
|     options: {
|         encrypt: process.env.DB_ENCRYPT === 'true',
|         trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
|         enableArithAbort: true
|     },
|     pool: {
|         max: 10,
|         min: 0,
|         idleTimeoutMillis: 30000
|     }
| };
|
| if (!config.port) {
|     delete config.port;
| }
*/

let pool = null;

async function getPool() {
    if (!pool) {
        pool = await sql.connect(config);
    }
    return pool;
}

async function query(queryStr, inputs = []) {
    const p = await getPool();
    const request = p.request();

    for (const { name, type, value } of inputs) {
        request.input(name, type, value);
    }

    return request.query(queryStr);
}

module.exports = { sql, getPool, query };