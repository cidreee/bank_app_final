require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const rateLimit   = require('express-rate-limit');

const authRoutes      = require('./routes/auth');
const accountRoutes   = require('./routes/accounts');
const transferRoutes  = require('./routes/transfers');
const adminRoutes     = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Rate limiting para login (evitar fuerza bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 20,
    message: { error: 'Demasiados intentos. Intente en 15 minutos.' }
});

// Rutas API
app.use('/api/auth',        loginLimiter, authRoutes);
app.use('/api/cuentas',     accountRoutes);
app.use('/api/transferencias', transferRoutes);
app.use('/api/admin',       adminRoutes);

// Catch-all: SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// Arranque del servidor
app.listen(PORT, () => {
    console.log(`BBVA Fake server running on http://localhost:${PORT}`);
});

module.exports = app;
