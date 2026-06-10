const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { sql, query } = require('../config/database');
const logger = require('../utils/logger');

const MAX_INTENTOS = 3;

// BA-8 [RF-02] Validación de contraseña (BA-55 / BA-56 / BA-57)
function validarFormatoPassword(password) {
    const errores = [];
    if (password.length < 5 || password.length > 8) errores.push('longitud 5-8 caracteres');
    if (!/[A-Z]/.test(password))         errores.push('al menos una mayúscula');
    if (!/[0-9]/.test(password))         errores.push('al menos un número');
    if (!/[^A-Za-z0-9]/.test(password))  errores.push('al menos un carácter especial');
    return errores;
}

// BA-7 [RF-01] Inicio de sesión
async function login(req, res) {
    const ip = req.ip || req.connection.remoteAddress;
    try {
        const { email, password } = req.body;

        // BA-53: campos no vacíos
        if (!email || !password) {
            logger.warn('Auth', 'Login rechazado: campos vacíos', { ip });
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        logger.info('Auth', `Intento de login: ${email}`, { ip });

        const result = await query(
            'SELECT id, nombre, apellido, email, password_hash, rol, intentos_fallidos, estado FROM Usuarios WHERE email = @email',
            [{ name: 'email', type: sql.NVarChar, value: email.toLowerCase().trim() }]
        );

        const user = result.recordset[0];

        if (!user) {
            logger.warn('Auth', `Login fallido — usuario no encontrado: ${email}`, { ip });
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // BA-63: cuenta bloqueada
        if (user.estado === 'bloqueado') {
            logger.warn('Auth', `Login rechazado — cuenta bloqueada: ${email}`, { ip });
            return res.status(403).json({ error: 'Cuenta bloqueada. Contacte al administrador.' });
        }

        // BA-60: comparar password con hash (BA-58 / BA-59)
        const passwordOk = await bcrypt.compare(password, user.password_hash);

        if (!passwordOk) {
            const nuevosIntentos = user.intentos_fallidos + 1;

            if (nuevosIntentos > MAX_INTENTOS) {
                // BA-62: bloquear cuenta
                await query(
                    "UPDATE Usuarios SET estado = 'bloqueado', intentos_fallidos = @i WHERE id = @id",
                    [
                        { name: 'i',  type: sql.Int, value: nuevosIntentos },
                        { name: 'id', type: sql.Int, value: user.id }
                    ]
                );
                logger.error('Auth', `Cuenta bloqueada por intentos: ${email}`, { intentos: nuevosIntentos, ip });
                return res.status(403).json({
                    error: 'Cuenta bloqueada por múltiples intentos fallidos. Contacte al administrador.'
                });
            }

            await query(
                'UPDATE Usuarios SET intentos_fallidos = @i WHERE id = @id',
                [
                    { name: 'i',  type: sql.Int, value: nuevosIntentos },
                    { name: 'id', type: sql.Int, value: user.id }
                ]
            );

            const restantes = MAX_INTENTOS - nuevosIntentos + 1;
            logger.warn('Auth', `Password incorrecto intento ${nuevosIntentos}/${MAX_INTENTOS}: ${email}`, { ip });
            return res.status(401).json({
                error: `Credenciales inválidas. ${restantes > 0 ? `Te quedan ${restantes} intento(s).` : 'Cuenta bloqueada.'}`
            });
        }

        // ---- Login exitoso ----
        await query(
            'UPDATE Usuarios SET intentos_fallidos = 0, ultimo_acceso = GETDATE() WHERE id = @id',
            [{ name: 'id', type: sql.Int, value: user.id }]
        );

        let cuenta = null;
        if (user.rol === 'cliente') {
            const cuentaResult = await query(
                'SELECT numero_cuenta, saldo, estado FROM Cuentas WHERE usuario_id = @uid',
                [{ name: 'uid', type: sql.Int, value: user.id }]
            );
            cuenta = cuentaResult.recordset[0] || null;
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, nombre: user.nombre, apellido: user.apellido, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        logger.info('Auth', `Login exitoso: ${email} (rol: ${user.rol})`, { ip });

        res.json({
            token,
            usuario: { id: user.id, nombre: user.nombre, apellido: user.apellido, email: user.email, rol: user.rol },
            cuenta
        });

    } catch (err) {
        logger.error('Auth', `Error en login: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

module.exports = { login, validarFormatoPassword };
