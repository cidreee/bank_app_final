const { sql, query } = require('../config/database');
const logger = require('../utils/logger');

async function getMiCuenta(req, res) {
    try {
        logger.debug('Account', `getMiCuenta: usuario=${req.user.id}`);
        const result = await query(
            'SELECT numero_cuenta, saldo, estado, fecha_apertura FROM Cuentas WHERE usuario_id = @uid',
            [{ name: 'uid', type: sql.Int, value: req.user.id }]
        );
        if (!result.recordset[0]) {
            logger.warn('Account', `Cuenta no encontrada para usuario ${req.user.id}`);
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        logger.error('Account', `getMiCuenta error: ${err.message}`, { userId: req.user.id });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

async function getMovimientos(req, res) {
    try {
        const page   = parseInt(req.query.page) || 1;
        const limit  = 5;
        const offset = (page - 1) * limit;

        const cuentaResult = await query(
            'SELECT numero_cuenta FROM Cuentas WHERE usuario_id = @uid',
            [{ name: 'uid', type: sql.Int, value: req.user.id }]
        );

        if (!cuentaResult.recordset[0]) {
            logger.warn('Account', `Sin cuenta para usuario ${req.user.id}`);
            return res.status(404).json({ error: 'Cuenta no encontrada' });
        }

        const numeroCuenta = cuentaResult.recordset[0].numero_cuenta;

        const movimientosResult = await query(`
            SELECT
                t.id, t.cuenta_origen, t.cuenta_destino, t.monto, t.concepto,
                t.tipo_transaccion, t.fecha_hora, t.estado, t.referencia,
                CASE WHEN t.cuenta_origen = @cuenta THEN 'enviada' ELSE 'recibida' END AS direccion,
                u_o.nombre + ' ' + u_o.apellido AS nombre_origen,
                u_d.nombre + ' ' + u_d.apellido AS nombre_destino
            FROM Transferencias t
            LEFT JOIN Cuentas c_o  ON c_o.numero_cuenta  = t.cuenta_origen
            LEFT JOIN Usuarios u_o ON u_o.id              = c_o.usuario_id
            LEFT JOIN Cuentas c_d  ON c_d.numero_cuenta  = t.cuenta_destino
            LEFT JOIN Usuarios u_d ON u_d.id              = c_d.usuario_id
            WHERE (t.cuenta_origen = @cuenta OR t.cuenta_destino = @cuenta)
              AND t.estado = 'completada'
            ORDER BY t.fecha_hora DESC
            OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
        `, [
            { name: 'cuenta', type: sql.Char, value: numeroCuenta },
            { name: 'offset', type: sql.Int,  value: offset },
            { name: 'limit',  type: sql.Int,  value: limit }
        ]);

        const totalResult = await query(`
            SELECT COUNT(*) AS total
            FROM Transferencias
            WHERE (cuenta_origen = @cuenta OR cuenta_destino = @cuenta) AND estado = 'completada'
        `, [{ name: 'cuenta', type: sql.Char, value: numeroCuenta }]);

        const total = totalResult.recordset[0].total;

        logger.debug('Account', `Movimientos: usuario=${req.user.id}, página=${page}, total=${total}`);

        res.json({
            movimientos: movimientosResult.recordset,
            paginacion: {
                pagina_actual:   page,
                total_paginas:   Math.ceil(total / limit),
                total_registros: total,
                por_pagina:      limit
            }
        });
    } catch (err) {
        logger.error('Account', `getMovimientos error: ${err.message}`, { userId: req.user.id });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

module.exports = { getMiCuenta, getMovimientos };
