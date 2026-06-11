require('dotenv').config();

const authType = (process.env.DB_AUTH_TYPE || 'sql').toLowerCase();
const useWindowsAuth = authType === 'windows';
const sql = useWindowsAuth ? require('mssql/msnodesqlv8') : require('mssql');

function buildConnectionString() {
    if (process.env.DB_CONNECTION_STRING) {
        return process.env.DB_CONNECTION_STRING;
    }

    const server = process.env.DB_SERVER || 'localhost';
    const database = process.env.DB_DATABASE || 'BD_BBVA';
    const trustCert = process.env.DB_TRUST_CERT !== 'false' ? 'Yes' : 'No';
    const driver = process.env.DB_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server';

    return [
        `Driver={${driver}}`,
        `Server=${server}`,
        `Database=${database}`,
        'Trusted_Connection=Yes',
        `TrustServerCertificate=${trustCert}`
    ].join(';') + ';';
}

const config = useWindowsAuth
    ? {
        connectionString: buildConnectionString(),
        driver: 'msnodesqlv8',
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    }
    : {
        server: process.env.DB_SERVER || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 1433,
        database: process.env.DB_DATABASE || 'BD_BBVA',
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || '',
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
            enableArithAbort: true
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
