require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');
const logger     = require('./utils/logger');

const authRoutes     = require('./routes/auth');
const accountRoutes  = require('./routes/accounts');
const transferRoutes = require('./routes/transfers');
const adminRoutes    = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---- Middlewares globales ----
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de logging de cada request
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const level = res.statusCode >= 500 ? 'error'
                    : res.statusCode >= 400 ? 'warn'
                    : 'debug';
        logger[level]('HTTP', `${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`,
            { ip: req.ip });
    });
    next();
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting para login (evitar fuerza bruta — BA-10)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    handler(req, res) {
        logger.warn('Auth', `Rate limit excedido para ${req.ip}`);
        res.status(429).json({ error: 'Demasiados intentos. Intente en 15 minutos.' });
    }
});

// ---- Rutas API ----
app.use('/api/auth',           loginLimiter, authRoutes);
app.use('/api/cuentas',        accountRoutes);
app.use('/api/transferencias', transferRoutes);
app.use('/api/admin',          adminRoutes);

// ---- Manejo global de errores ----
app.use((err, req, res, next) => {
    logger.error('Server', `Error no controlado: ${err.message}`, { stack: err.stack, url: req.originalUrl });
    res.status(500).json({ error: 'Error, consulte al administrador' });
});

// Catch-all: SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.listen(PORT, () => {
    logger.info('Server', `BBVA Fake server iniciado en http://localhost:${PORT}`);
    logger.info('Server', `Logs guardados en: ${path.join(__dirname, 'logs/')}`);
});

module.exports = app;
