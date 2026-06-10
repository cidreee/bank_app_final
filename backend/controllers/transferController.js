const { sql, query } = require('../config/database');

const MONTO_MINIMO    = 500.00;
const LIMITE_DIARIO   = 7000.00;
const SALDO_MAXIMO    = 50000.00;

async function realizarTransferencia(req, res) {
    try {
        const { cuenta_destino, monto, concepto, tipo_transaccion } = req.body;
        const montoNum = parseFloat(monto);

        // Validaciones básicas
        if (!cuenta_destino || !monto || !concepto) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' });
        }

        if (String(cuenta_destino).length !== 16) {
            return res.status(400).json({ error: 'El número de cuenta debe tener exactamente 16 dígitos' });
        }

        if (isNaN(montoNum) || montoNum < MONTO_MINIMO) {
            return res.status(400).json({ error: `El monto mínimo de transferencia es $${MONTO_MINIMO.toFixed(2)}` });
        }

        // Obtener cuenta origen del usuario autenticado
        const cuentaOrigenResult = await query(
            'SELECT numero_cuenta, saldo, estado FROM Cuentas WHERE usuario_id = @uid',
            [{ name: 'uid', type: sql.Int, value: req.user.id }]
        );

        const cuentaOrigen = cuentaOrigenResult.recordset[0];
        if (!cuentaOrigen) {
            return res.status(404).json({ error: 'Cuenta origen no encontrada' });
        }

        if (cuentaOrigen.estado !== 'activa') {
            return res.status(403).json({ error: 'Su cuenta se encuentra inactiva' });
        }

        if (cuentaOrigen.numero_cuenta === String(cuenta_destino)) {
            return res.status(400).json({ error: 'No puede transferir a su propia cuenta' });
        }

        // Verificar cuenta destino
        const cuentaDestinoResult = await query(
            'SELECT numero_cuenta, saldo, estado FROM Cuentas WHERE numero_cuenta = @ndest',
            [{ name: 'ndest', type: sql.Char, value: String(cuenta_destino) }]
        );

        const cuentaDestino = cuentaDestinoResult.recordset[0];
        if (!cuentaDestino) {
            return res.status(404).json({ error: 'Cuenta inexistente' });
        }

        if (cuentaDestino.estado !== 'activa') {
            return res.status(400).json({ error: 'La cuenta destino no está activa' });
        }

        // Verificar saldo máximo en destino
        if (parseFloat(cuentaDestino.saldo) + montoNum > SALDO_MAXIMO) {
            return res.status(400).json({
                error: `La cuenta destino alcanzaría el límite máximo de $${SALDO_MAXIMO.toFixed(2)}`
            });
        }

        // Verificar fondos suficientes
        if (parseFloat(cuentaOrigen.saldo) < montoNum) {
            return res.status(400).json({ error: 'Fondos insuficientes' });
        }

        // Verificar límite diario
        const hoy = new Date().toISOString().split('T')[0];
        const totalDiaResult = await query(`
            SELECT ISNULL(SUM(monto), 0) AS total
            FROM Transferencias
            WHERE cuenta_origen = @origen
              AND estado = 'completada'
              AND CAST(fecha_hora AS DATE) = @hoy
        `, [
            { name: 'origen', type: sql.Char,     value: cuentaOrigen.numero_cuenta },
            { name: 'hoy',    type: sql.NVarChar,  value: hoy }
        ]);

        const totalDia = parseFloat(totalDiaResult.recordset[0].total);
        if (totalDia + montoNum > LIMITE_DIARIO) {
            const disponible = LIMITE_DIARIO - totalDia;
            return res.status(400).json({
                error: `Límite diario excedido. Disponible hoy: $${disponible.toFixed(2)}`
            });
        }

        // Ejecutar transferencia (actualizar saldos + registrar)
        const tipoTx = tipo_transaccion || 'transferencia';

        await query(
            'UPDATE Cuentas SET saldo = saldo - @monto WHERE numero_cuenta = @origen',
            [
                { name: 'monto',  type: sql.Decimal, value: montoNum },
                { name: 'origen', type: sql.Char,    value: cuentaOrigen.numero_cuenta }
            ]
        );

        await query(
            'UPDATE Cuentas SET saldo = saldo + @monto WHERE numero_cuenta = @destino',
            [
                { name: 'monto',   type: sql.Decimal, value: montoNum },
                { name: 'destino', type: sql.Char,    value: String(cuenta_destino) }
            ]
        );

        const insertResult = await query(`
            INSERT INTO Transferencias (cuenta_origen, cuenta_destino, monto, concepto, tipo_transaccion, estado)
            OUTPUT INSERTED.id, INSERTED.fecha_hora, INSERTED.referencia
            VALUES (@origen, @destino, @monto, @concepto, @tipo, 'completada')
        `, [
            { name: 'origen',   type: sql.Char,     value: cuentaOrigen.numero_cuenta },
            { name: 'destino',  type: sql.Char,     value: String(cuenta_destino) },
            { name: 'monto',    type: sql.Decimal,  value: montoNum },
            { name: 'concepto', type: sql.NVarChar, value: concepto },
            { name: 'tipo',     type: sql.NVarChar, value: tipoTx }
        ]);

        const tx = insertResult.recordset[0];

        res.json({
            mensaje:    'Transferencia exitosa',
            referencia: tx.referencia,
            fecha_hora: tx.fecha_hora,
            monto:      montoNum.toFixed(2)
        });

    } catch (err) {
        console.error('realizarTransferencia:', err);
        res.status(500).json({ error: 'Error, consulte al administrador' });
    }
}

module.exports = { realizarTransferencia };
