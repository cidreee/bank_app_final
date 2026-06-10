/* ============================================================
   BBVA Fake — logger.js
   Sistema de logs del lado cliente (localStorage + console)
   Cubre: BA-7 al BA-11, BA-21 al BA-31
   ============================================================ */

const Logger = (function () {
    const MAX_LOGS = 600;
    const STORAGE_KEY = 'bbva_logs';

    const LEVEL_STYLE = {
        ERROR: 'color:#D63031;font-weight:bold',
        WARN:  'color:#E17A00;font-weight:bold',
        INFO:  'color:#1973B8',
        DEBUG: 'color:#8C9BAB'
    };

    function _getLogs() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
        catch { return []; }
    }

    function _save(logs) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); }
        catch (e) { console.error('[Logger] No se pudo guardar log:', e.message); }
    }

    function _log(level, module, message, data) {
        const entry = {
            ts:      new Date().toISOString(),
            level,
            module,
            message,
            data:    data !== undefined ? (typeof data === 'object' ? JSON.stringify(data) : String(data)) : null
        };

        // Salida en consola del navegador con color
        const consoleFn = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
        console[consoleFn](
            `%c[BBVA ${level}] [${module}] ${message}`,
            LEVEL_STYLE[level] || '',
            data !== undefined ? data : ''
        );

        // Persistir en localStorage
        const logs = _getLogs();
        logs.push(entry);
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
        _save(logs);
    }

    return {
        info:  (mod, msg, data) => _log('INFO',  mod, msg, data),
        warn:  (mod, msg, data) => _log('WARN',  mod, msg, data),
        error: (mod, msg, data) => _log('ERROR', mod, msg, data),
        debug: (mod, msg, data) => _log('DEBUG', mod, msg, data),

        /** Retorna todos los logs, opcionalmente filtrados por nivel */
        getLogs(level = null) {
            const all = _getLogs();
            return level ? all.filter(l => l.level === level) : all;
        },

        getErrors()  { return this.getLogs('ERROR'); },
        getWarnings(){ return this.getLogs('WARN');  },

        /** Descarga los logs como archivo JSON */
        export() {
            const blob = new Blob([JSON.stringify(_getLogs(), null, 2)], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `bbva_logs_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },

        clear() {
            localStorage.removeItem(STORAGE_KEY);
            console.log('%c[BBVA INFO] [Logger] Logs eliminados', LEVEL_STYLE.INFO);
        },

        /** Imprime en consola un resumen del estado de los logs */
        summary() {
            const logs  = _getLogs();
            const errs  = logs.filter(l => l.level === 'ERROR').length;
            const warns = logs.filter(l => l.level === 'WARN').length;
            console.table({ total: logs.length, errores: errs, advertencias: warns });
        }
    };
})();
