const { sql, query } = require('../config/database');
const logger = require('../utils/logger');
const {
    LIMITE_DIARIO,
    SALDO_MAXIMO,
    validarEntradaTransferencia
} = require('../utils/validators');

// BA-21 [RF-09] Realizar transferencia
async function realizarTransferencia(req, res) {
    const userId = req.user.id;
    try {
        const { cuenta_destino, monto, concepto, tipo_transaccion } = req.body;
        const montoNum = parseFloat(monto);

        logger.info('Transfer', `Inicio transferencia: usuario=${userId}`, {
            cuenta_destino, monto: montoNum, concepto
        });

        // ── Validaciones de entrada: campos, cuenta de 16 digitos y monto minimo.
        const erroresEntrada = validarEntradaTransferencia({ cuentaDestino: cuenta_destino, monto, concepto });
        if (erroresEntrada.length) {
            logger.warn('Transfer', 'Entrada invalida', { userId, errores: erroresEntrada });
            return res.status(400).json({ error: erroresEntrada[0] });
        }

        // ── Cuenta origen ────────────────────────────────────────────────────
        const origenResult = await query(
            'SELECT numero_cuenta, saldo, estado FROM Cuentas WHERE usuario_id = @uid',
            [{ name: 'uid', type: sql.Int, value: userId }]
        );
        const cuentaOrigen = origenResult.recordset[0];

        if (!cuentaOrigen) {
            logger.error('Transfer', 'Cuenta origen no encontrada', { userId });
            return res.status(404).json({ error: 'Cuenta origen no encontrada' });
        }
        if (cuentaOrigen.estado !== 'activa') {
            logger.warn('Transfer', 'Cuenta origen inactiva', { userId, estado: cuentaOrigen.estado });
            return res.status(403).json({ error: 'Su cuenta se encuentra inactiva' });
        }
        if (cuentaOrigen.numero_cuenta === String(cuenta_destino)) {
            return res.status(400).json({ error: 'No puede transferir a su propia cuenta' });
        }

        // BA-89: verificar cuenta destino existe
        const destinoResult = await query(
            'SELECT numero_cuenta, saldo, estado FROM Cuentas WHERE numero_cuenta = @ndest',
            [{ name: 'ndest', type: sql.Char(16), value: String(cuenta_destino) }]
        );
        const cuentaDestino = destinoResult.recordset[0];

        if (!cuentaDestino) {
            logger.warn('Transfer', `Cuenta inexistente: ${cuenta_destino}`, { userId });
            return res.status(404).json({ error: 'Cuenta inexistente' });
        }
        if (cuentaDestino.estado !== 'activa') {
            return res.status(400).json({ error: 'La cuenta destino no está activa' });
        }

        // BA-85 / BA-87: fondos suficientes
        if (parseFloat(cuentaOrigen.saldo) < montoNum) {
            logger.warn('Transfer', 'Fondos insuficientes', {
                userId, saldo: cuentaOrigen.saldo, monto: montoNum
            });
            return res.status(400).json({ error: 'Fondos insuficientes' });
        }

        // BA-92 / BA-93: límite de saldo destino
        if (parseFloat(cuentaDestino.saldo) + montoNum > SALDO_MAXIMO) {
            logger.warn('Transfer', 'Límite de saldo destino excedido', {
                saldo_actual: cuentaDestino.saldo, monto: montoNum
            });
            return res.status(400).json({
                error: `La cuenta destino alcanzaría el límite máximo de $${SALDO_MAXIMO.toFixed(2)}`
            });
        }

        // BA-82: límite diario
        const hoy = new Date().toISOString().split('T')[0];
        const totalDiaResult = await query(`
            SELECT ISNULL(SUM(monto), 0) AS total
            FROM Transferencias
            WHERE cuenta_origen = @origen AND estado = 'completada'
              AND CAST(fecha_hora AS DATE) = @hoy
        `, [
            { name: 'origen', type: sql.Char(16), value: cuentaOrigen.numero_cuenta },
            { name: 'hoy',    type: sql.NVarChar,  value: hoy }
        ]);

        const totalDia = parseFloat(totalDiaResult.recordset[0].total);
        if (totalDia + montoNum > LIMITE_DIARIO) {
            const disponible = LIMITE_DIARIO - totalDia;
            logger.warn('Transfer', 'Límite diario excedido', {
                totalDia, monto: montoNum, disponible
            });
            return res.status(400).json({
                error: `Límite diario excedido. Disponible hoy: $${Math.max(0, disponible).toFixed(2)}`
            });
        }

        // ── BA-81: Ejecutar transferencia ────────────────────────────────────
        const tipoTx = tipo_transaccion || 'transferencia';

        await query(
            'UPDATE Cuentas SET saldo = saldo - @monto WHERE numero_cuenta = @origen',
            [
                { name: 'monto',  type: sql.Decimal, value: montoNum },
                { name: 'origen', type: sql.Char(16), value: cuentaOrigen.numero_cuenta }
            ]
        );

        await query(
            'UPDATE Cuentas SET saldo = saldo + @monto WHERE numero_cuenta = @destino',
            [
                { name: 'monto',   type: sql.Decimal, value: montoNum },
                { name: 'destino', type: sql.Char(16), value: String(cuenta_destino) }
            ]
        );

        // BA-98: registrar como completada (permanente)
        const insertResult = await query(`
            INSERT INTO Transferencias (cuenta_origen, cuenta_destino, monto, concepto, tipo_transaccion, estado)
            OUTPUT INSERTED.id, INSERTED.fecha_hora, INSERTED.referencia
            VALUES (@origen, @destino, @monto, @concepto, @tipo, 'completada')
        `, [
            { name: 'origen',   type: sql.Char(16), value: cuentaOrigen.numero_cuenta },
            { name: 'destino',  type: sql.Char(16), value: String(cuenta_destino) },
            { name: 'monto',    type: sql.Decimal,  value: montoNum },
            { name: 'concepto', type: sql.NVarChar, value: concepto },
            { name: 'tipo',     type: sql.NVarChar, value: tipoTx }
        ]);

        const tx = insertResult.recordset[0];

        logger.info('Transfer', `Transferencia exitosa #${tx.id}`, {
            origen: cuentaOrigen.numero_cuenta,
            destino: cuenta_destino,
            monto: montoNum,
            referencia: tx.referencia
        });

        // BA-94 / BA-95: mensaje solo cuando exitosa
        res.json({
            mensaje:    'Transferencia exitosa',
            referencia: tx.referencia,
            fecha_hora: tx.fecha_hora,
            monto:      montoNum.toFixed(2)
        });

    } catch (err) {
        logger.error('Transfer', `Error en transferencia: ${err.message}`, { userId, stack: err.stack });
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

module.exports = { realizarTransferencia };
