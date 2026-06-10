/* ============================================================
   BBVA Fake — Backend Logger
   Escribe logs en consola y en archivos rotativos (logs/)
   ============================================================ */

const fs   = require('fs');
const path = require('path');

const LOGS_DIR  = path.join(__dirname, '..', 'logs');
const MAX_LINES = 10000;

// Crear directorio de logs si no existe
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const FILES = {
    all:   path.join(LOGS_DIR, 'app.log'),
    error: path.join(LOGS_DIR, 'error.log'),
    auth:  path.join(LOGS_DIR, 'auth.log'),
    tx:    path.join(LOGS_DIR, 'transfers.log')
};

const COLORS = {
    ERROR: '\x1b[31m',
    WARN:  '\x1b[33m',
    INFO:  '\x1b[36m',
    DEBUG: '\x1b[90m',
    RESET: '\x1b[0m'
};

function _write(filePath, line) {
    try {
        fs.appendFileSync(filePath, line + '\n', 'utf8');
    } catch (e) {
        console.error('[Logger] No se pudo escribir en', filePath, e.message);
    }
}

function _log(level, module, message, data) {
    const ts    = new Date().toISOString();
    const extra = data !== undefined
        ? (typeof data === 'object' ? JSON.stringify(data) : String(data))
        : '';
    const line  = `[${ts}] [${level}] [${module}] ${message}${extra ? ' | ' + extra : ''}`;

    // Consola con color
    const color = COLORS[level] || '';
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        `${color}${line}${COLORS.RESET}`
    );

    // Archivo general
    _write(FILES.all, line);

    // Archivos por categoría
    if (level === 'ERROR')                       _write(FILES.error, line);
    if (module === 'Auth' || module === 'auth')  _write(FILES.auth,  line);
    if (module === 'Transfer' || module === 'transfer') _write(FILES.tx, line);
}

const logger = {
    info:  (mod, msg, data) => _log('INFO',  mod, msg, data),
    warn:  (mod, msg, data) => _log('WARN',  mod, msg, data),
    error: (mod, msg, data) => _log('ERROR', mod, msg, data),
    debug: (mod, msg, data) => _log('DEBUG', mod, msg, data),

    /** Retorna las últimas N líneas del log general */
    tail(n = 50) {
        try {
            const content = fs.readFileSync(FILES.all, 'utf8');
            return content.split('\n').filter(Boolean).slice(-n);
        } catch { return []; }
    },

    paths: FILES
};

module.exports = logger;
