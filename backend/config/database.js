const sql = require('mssql');
require('dotenv').config();

const config = {
    server:   process.env.DB_SERVER   || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_DATABASE || 'BD_BBVA',
    user:     process.env.DB_USER     || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
        encrypt:              process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
        enableArithAbort:     true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

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
