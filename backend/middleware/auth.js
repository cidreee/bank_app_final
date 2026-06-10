const jwt    = require('jsonwebtoken');
const logger = require('../utils/logger');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso no autorizado' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado' });
        }
        req.user = user;
        next();
    });
}

function requireAdmin(req, res, next) {
    if (req.user.rol !== 'administrador') {
        return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }
    next();
}

// BA-14 [RNF-02]: operaciones financieras solo disponibles para clientes
function requireCliente(req, res, next) {
    if (req.user.rol !== 'cliente') {
        logger.warn('AccessControl', `BA-14: operación de cliente rechazada para rol: ${req.user.rol} (${req.user.email})`);
        return res.status(403).json({ error: 'Operación disponible solo para clientes' });
    }
    next();
}

module.exports = { authenticateToken, requireAdmin, requireCliente };
