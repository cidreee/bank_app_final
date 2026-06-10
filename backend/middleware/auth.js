const jwt = require('jsonwebtoken');

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

module.exports = { authenticateToken, requireAdmin };
