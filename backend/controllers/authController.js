const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, query } = require('../config/database');

const MAX_INTENTOS = 3;

function validarPassword(password) {
    if (password.length < 5 || password.length > 8) return false;
    if (!/[A-Z]/.test(password))  return false;
    if (!/[0-9]/.test(password))  return false;
    if (!/[^A-Za-z0-9]/.test(password)) return false;
    return true;
}

async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son requeridos' });
        }

        const result = await query(
            'SELECT id, nombre, apellido, email, password_hash, rol, intentos_fallidos, estado FROM Usuarios WHERE email = @email',
            [{ name: 'email', type: sql.NVarChar, value: email.toLowerCase().trim() }]
        );

        const user = result.recordset[0];

        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        if (user.estado === 'bloqueado') {
            return res.status(403).json({ error: 'Cuenta bloqueada. Contacte al administrador.' });
        }

        const passwordOk = await bcrypt.compare(password, user.password_hash);

        if (!passwordOk) {
            const nuevosIntentos = user.intentos_fallidos + 1;
            if (nuevosIntentos > MAX_INTENTOS) {
                await query(
                    'UPDATE Usuarios SET estado = \'bloqueado\', intentos_fallidos = @intentos WHERE id = @id',
                    [
                        { name: 'intentos', type: sql.Int, value: nuevosIntentos },
                        { name: 'id',       type: sql.Int, value: user.id }
                    ]
                );
                return res.status(403).json({ error: 'Cuenta bloqueada por múltiples intentos fallidos. Contacte al administrador.' });
            }
            await query(
                'UPDATE Usuarios SET intentos_fallidos = @intentos WHERE id = @id',
                [
                    { name: 'intentos', type: sql.Int, value: nuevosIntentos },
                    { name: 'id',       type: sql.Int, value: user.id }
                ]
            );
            const restantes = MAX_INTENTOS - nuevosIntentos + 1;
            return res.status(401).json({
                error: `Credenciales inválidas. ${restantes > 0 ? `Te quedan ${restantes} intento(s).` : 'Cuenta bloqueada.'}`
            });
        }

        // Login exitoso: resetear intentos y actualizar último acceso
        await query(
            'UPDATE Usuarios SET intentos_fallidos = 0, ultimo_acceso = GETDATE() WHERE id = @id',
            [{ name: 'id', type: sql.Int, value: user.id }]
        );

        // Obtener cuenta del usuario (solo clientes)
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

        res.json({
            token,
            usuario: {
                id:      user.id,
                nombre:  user.nombre,
                apellido: user.apellido,
                email:   user.email,
                rol:     user.rol
            },
            cuenta
        });

    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

module.exports = { login, validarPassword };
