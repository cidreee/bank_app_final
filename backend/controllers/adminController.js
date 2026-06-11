const { sql, query } = require('../config/database');
const logger = require('../utils/logger');
const bcrypt = require('bcryptjs');
const { validarFormatoPassword } = require('../utils/validators');

const SALT_ROUNDS = 10;

function generarNumeroCuenta() {
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 10)).join('');
}

// BA-64: Admin consulta cuentas bloqueadas y todas las cuentas
async function getAllCuentas(req, res) {
    try {
        logger.info('Admin', `getAllCuentas solicitado por usuario=${req.user.id}`);
        const result = await query(`
            SELECT
                u.id            AS usuario_id,
                u.nombre, u.apellido, u.email, u.rol,
                u.estado        AS estado_usuario,
                u.intentos_fallidos, u.ultimo_acceso,
                c.numero_cuenta, c.saldo,
                c.estado        AS estado_cuenta,
                c.fecha_apertura
            FROM Usuarios u
            LEFT JOIN Cuentas c ON c.usuario_id = u.id
            ORDER BY u.id
        `);
        res.json(result.recordset);
    } catch (err) {
        logger.error('Admin', `getAllCuentas error: ${err.message}`, { userId: req.user.id });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

// BA-65 / BA-66: Solo admin puede reactivar cuentas bloqueadas
async function desbloquearUsuario(req, res) {
    try {
        const { usuarioId } = req.params;
        logger.info('Admin', `Solicitud de desbloqueo: usuario=${usuarioId} por admin=${req.user.id}`);

        const result = await query(
            'SELECT id, nombre, email, estado FROM Usuarios WHERE id = @id',
            [{ name: 'id', type: sql.Int, value: parseInt(usuarioId) }]
        );

        if (!result.recordset[0]) {
            logger.warn('Admin', `Usuario no encontrado para desbloqueo: id=${usuarioId}`);
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const target = result.recordset[0];

        await query(
            "UPDATE Usuarios SET estado = 'activo', intentos_fallidos = 0 WHERE id = @id",
            [{ name: 'id', type: sql.Int, value: parseInt(usuarioId) }]
        );

        logger.info('Admin', `Cuenta reactivada: ${target.email} (id=${usuarioId}) por admin=${req.user.id}`);
        res.json({ mensaje: 'Cuenta reactivada exitosamente' });

    } catch (err) {
        logger.error('Admin', `desbloquearUsuario error: ${err.message}`, { usuarioId: req.params.usuarioId });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

async function getAllTransferencias(req, res) {
    try {
        const page   = parseInt(req.query.page) || 1;
        const limit  = 10;
        const offset = (page - 1) * limit;

        logger.debug('Admin', `getAllTransferencias: página=${page} por admin=${req.user.id}`);

        const result = await query(`
            SELECT
                t.id, t.cuenta_origen, t.cuenta_destino, t.monto,
                t.concepto, t.tipo_transaccion, t.fecha_hora, t.estado,
                u_o.nombre + ' ' + u_o.apellido AS origen_nombre,
                u_d.nombre + ' ' + u_d.apellido AS destino_nombre
            FROM Transferencias t
            LEFT JOIN Cuentas c_o  ON c_o.numero_cuenta = t.cuenta_origen
            LEFT JOIN Usuarios u_o ON u_o.id = c_o.usuario_id
            LEFT JOIN Cuentas c_d  ON c_d.numero_cuenta = t.cuenta_destino
            LEFT JOIN Usuarios u_d ON u_d.id = c_d.usuario_id
            ORDER BY t.fecha_hora DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `, [
            { name: 'offset', type: sql.Int, value: offset },
            { name: 'limit',  type: sql.Int, value: limit }
        ]);

        const totalResult = await query('SELECT COUNT(*) AS total FROM Transferencias');
        const total = totalResult.recordset[0].total;

        res.json({
            transferencias: result.recordset,
            paginacion: { pagina_actual: page, total_paginas: Math.ceil(total / limit), total_registros: total }
        });
    } catch (err) {
        logger.error('Admin', `getAllTransferencias error: ${err.message}`);
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

async function crearCliente(req, res) {
    try {
        const { nombre, apellido, email, password } = req.body;
        const cleanEmail = String(email || '').toLowerCase().trim();

        if (!nombre || !apellido || !cleanEmail || !password) {
            return res.status(400).json({ error: 'Nombre, apellido, email y contraseña son requeridos' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({ error: 'Correo electrónico inválido' });
        }

        const erroresPassword = validarFormatoPassword(password);
        if (erroresPassword.length) {
            return res.status(400).json({ error: `Contraseña inválida: ${erroresPassword.join(', ')}` });
        }

        const existente = await query(
            'SELECT id FROM Usuarios WHERE email = @email',
            [{ name: 'email', type: sql.NVarChar, value: cleanEmail }]
        );
        if (existente.recordset[0]) {
            return res.status(409).json({ error: 'El correo ya está registrado' });
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const userResult = await query(`
            INSERT INTO Usuarios (nombre, apellido, email, password_hash, rol, estado, intentos_fallidos)
            OUTPUT INSERTED.id, INSERTED.nombre, INSERTED.apellido, INSERTED.email, INSERTED.rol
            VALUES (@nombre, @apellido, @email, @hash, 'cliente', 'activo', 0)
        `, [
            { name: 'nombre',   type: sql.NVarChar, value: nombre.trim() },
            { name: 'apellido', type: sql.NVarChar, value: apellido.trim() },
            { name: 'email',    type: sql.NVarChar, value: cleanEmail },
            { name: 'hash',     type: sql.NVarChar, value: hash }
        ]);

        const user = userResult.recordset[0];
        let numeroCuenta = generarNumeroCuenta();
        let creada = false;

        while (!creada) {
            const collision = await query(
                'SELECT numero_cuenta FROM Cuentas WHERE numero_cuenta = @numero',
                [{ name: 'numero', type: sql.Char(16), value: numeroCuenta }]
            );
            if (collision.recordset[0]) {
                numeroCuenta = generarNumeroCuenta();
                continue;
            }
            creada = true;
        }

        const cuentaResult = await query(`
            INSERT INTO Cuentas (numero_cuenta, usuario_id, saldo, estado)
            OUTPUT INSERTED.numero_cuenta, INSERTED.saldo, INSERTED.estado, INSERTED.fecha_apertura
            VALUES (@numero, @uid, 1000.00, 'activa')
        `, [
            { name: 'numero', type: sql.Char(16), value: numeroCuenta },
            { name: 'uid',    type: sql.Int,  value: user.id }
        ]);

        logger.info('Admin', `Cliente creado por admin=${req.user.id}: ${cleanEmail}`, { userId: user.id });
        res.status(201).json({ usuario: user, cuenta: cuentaResult.recordset[0] });
    } catch (err) {
        logger.error('Admin', `crearCliente error: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

module.exports = { getAllCuentas, desbloquearUsuario, getAllTransferencias, crearCliente };
