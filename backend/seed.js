// ============================================================
// BD_BBVA — Script de datos semilla con todos los usuarios de prueba
// Corre con:  cd backend && npm run seed
// ============================================================

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, query, getPool } = require('./config/database');
const logger = require('./utils/logger');

const SALT_ROUNDS = 10;

// ──────────────────────────────────────────────────────────────────────────────
// USUARIOS DE PRUEBA (ver BD_BBVA_TEST_DATA.sql para casos de prueba completos)
// ──────────────────────────────────────────────────────────────────────────────
const usuarios = [
    // Administrador
    { nombre:'Admin',  apellido:'BBVA',    email:'admin@bbva.com',  password:'Admin1!',  rol:'administrador', estado:'activo' },
    // Clientes activos
    { nombre:'Carlos', apellido:'Mendoza', email:'carlos@bbva.com', password:'Carlos1!', rol:'cliente',       estado:'activo' },
    { nombre:'María',  apellido:'García',  email:'maria@bbva.com',  password:'Maria1!',  rol:'cliente',       estado:'activo' },
    // BA-23/BA-29: saldo $499 → fondos insuficientes
    { nombre:'Juan',   apellido:'Pérez',   email:'juan@bbva.com',   password:'Juan1!',   rol:'cliente',       estado:'activo' },
    // BA-25/BA-31: saldo $49,800 → límite destino
    { nombre:'Luisa',  apellido:'Torres',  email:'luisa@bbva.com',  password:'Luisa1!',  rol:'cliente',       estado:'activo' },
    // BA-10/BA-11: cuenta bloqueada → prueba reactivación
    { nombre:'Pedro',  apellido:'Ramírez', email:'pedro@bbva.com',  password:'Pedro1!',  rol:'cliente',       estado:'bloqueado', intentos:4 },
    // BA-28: transferencias múltiples
    { nombre:'Ana',    apellido:'López',   email:'ana@bbva.com',    password:'Ana1!',    rol:'cliente',       estado:'activo' }
];

// Cuentas asociadas a los clientes
// Saldos ajustados para ser consistentes con las transferencias de hoy del seed:
//   carlos: 15000 - 1500 (tx10) - 1200 (tx11) = 12300
//   maria:   8500 + 1500 (recibe tx10)          = 10000
//   ana:     3500 + 1200 (recibe tx11)           = 4700
const cuentas = [
    { email:'carlos@bbva.com', numero:'1234567890123456', saldo:12300.00 },
    { email:'maria@bbva.com',  numero:'9876543210987654', saldo:10000.00 },
    { email:'juan@bbva.com',   numero:'1111222233334444', saldo:499.00   },
    { email:'luisa@bbva.com',  numero:'5555666677778888', saldo:49800.00 },
    { email:'pedro@bbva.com',  numero:'9999000011112222', saldo:5000.00  },
    { email:'ana@bbva.com',    numero:'3333444455556666', saldo:4700.00  }
];
const numerosCuentaSeed = cuentas.map(c => c.numero);

// ──────────────────────────────────────────────────────────────────────────────
async function seed() {
    try {
        await getPool();
        logger.info('Seed', 'Conexión a BD_BBVA establecida');

        // Insertar / actualizar usuarios
        for (const u of usuarios) {
            const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
            await query(`
                IF NOT EXISTS (SELECT 1 FROM Usuarios WHERE email = @email)
                BEGIN
                    INSERT INTO Usuarios (nombre, apellido, email, password_hash, rol, estado, intentos_fallidos)
                    VALUES (@nombre, @apellido, @email, @hash, @rol, @estado, @intentos)
                END
                ELSE
                BEGIN
                    UPDATE Usuarios
                    SET password_hash = @hash, rol = @rol, estado = @estado, intentos_fallidos = @intentos
                    WHERE email = @email
                END
            `, [
                { name:'nombre',    type:sql.NVarChar, value:u.nombre },
                { name:'apellido',  type:sql.NVarChar, value:u.apellido },
                { name:'email',     type:sql.NVarChar, value:u.email },
                { name:'hash',      type:sql.NVarChar, value:hash },
                { name:'rol',       type:sql.NVarChar, value:u.rol },
                { name:'estado',    type:sql.NVarChar, value:u.estado },
                { name:'intentos',  type:sql.Int,      value:u.intentos || 0 }
            ]);
            logger.info('Seed', `✓ Usuario: ${u.email} | pwd: ${u.password} | estado: ${u.estado}`);
        }

        // Reiniciar datos financieros de usuarios semilla para evitar residuos
        // de corridas previas o datos creados manualmente durante pruebas.
        const seedParams = numerosCuentaSeed.map((numero, i) => ({
            name:`seed${i}`,
            type:sql.Char(16),
            value:numero
        }));
        const seedPlaceholders = numerosCuentaSeed.map((_, i) => `@seed${i}`).join(', ');

        await query(`
            DELETE FROM Transferencias
            WHERE referencia LIKE 'REF202400%'
               OR cuenta_origen IN (${seedPlaceholders})
               OR cuenta_destino IN (${seedPlaceholders})
        `, seedParams);

        await query(`
            DELETE c
            FROM Cuentas c
            INNER JOIN Usuarios u ON u.id = c.usuario_id
            WHERE u.email IN (${cuentas.map((_, i) => `@email${i}`).join(', ')})
               OR c.numero_cuenta IN (${seedPlaceholders})
        `, [
            ...cuentas.map((c, i) => ({ name:`email${i}`, type:sql.NVarChar, value:c.email })),
            ...seedParams
        ]);

        // Insertar cuentas limpias usando numero_cuenta como llave real.
        for (const c of cuentas) {
            const uidRes = await query(
                'SELECT id FROM Usuarios WHERE email = @email',
                [{ name:'email', type:sql.NVarChar, value:c.email }]
            );
            const userId = uidRes.recordset[0]?.id;
            if (!userId) { logger.warn('Seed', `Usuario no encontrado: ${c.email}`); continue; }

            await query(`
                INSERT INTO Cuentas (numero_cuenta, usuario_id, saldo, estado)
                VALUES (@num, @uid, @saldo, 'activa')
            `, [
                { name:'num',   type:sql.Char(16), value:c.numero },
                { name:'uid',   type:sql.Int,     value:userId },
                { name:'saldo', type:sql.Decimal, value:c.saldo }
            ]);
            logger.info('Seed', `✓ Cuenta: ${c.numero} → ${c.email} ($${c.saldo.toFixed(2)})`);
        }

        // ── Transferencias de prueba (BA-35 / BA-119 / BA-120 / BA-124 / BA-126) ──
        logger.info('Seed', 'Insertando transferencias de prueba...');

        // BA-126: DECIMAL(12,2) garantiza 2 decimales en BD; los valores ya vienen con 2 dec.
        const transfers = [
            { origen:'1234567890123456', destino:'9876543210987654', monto:1000.00, concepto:'Pago de renta',           tipo:'transferencia', dias:1, ref:'REF20240001' },
            { origen:'3333444455556666', destino:'1234567890123456', monto:500.00,  concepto:'Préstamo personal',        tipo:'transferencia', dias:2, ref:'REF20240002' },
            { origen:'1234567890123456', destino:'3333444455556666', monto:750.00,  concepto:'Servicios profesionales',  tipo:'transferencia', dias:3, ref:'REF20240003' },
            { origen:'9876543210987654', destino:'1234567890123456', monto:1200.00, concepto:'Reembolso de compra',      tipo:'deposito',       dias:4, ref:'REF20240004' },
            { origen:'1234567890123456', destino:'9876543210987654', monto:800.00,  concepto:'Cena familiar',            tipo:'transferencia', dias:5, ref:'REF20240005' },
            { origen:'1234567890123456', destino:'3333444455556666', monto:600.00,  concepto:'Útiles escolares',         tipo:'transferencia', dias:6, ref:'REF20240006' },
            { origen:'3333444455556666', destino:'1234567890123456', monto:900.00,  concepto:'Pago factura pendiente',   tipo:'transferencia', dias:7, ref:'REF20240007' },
            { origen:'1234567890123456', destino:'9876543210987654', monto:550.00,  concepto:'Medicamentos familia',     tipo:'transferencia', dias:8, ref:'REF20240008' },
            { origen:'9876543210987654', destino:'3333444455556666', monto:750.00,  concepto:'Pago servicios entre socios',tipo:'transferencia',dias:2, ref:'REF20240009' },
            // Transferencias de HOY — BA-22: $2,700 de $7,000 usados, deja $4,300 disponibles
            { origen:'1234567890123456', destino:'9876543210987654', monto:1500.00, concepto:'Consulta médica familiar',   tipo:'transferencia', dias:0, ref:'REF20240010' },
            { origen:'1234567890123456', destino:'3333444455556666', monto:1200.00, concepto:'Préstamo mensual acordado',  tipo:'transferencia', dias:0, ref:'REF20240011' },
        ];

        for (const t of transfers) {
            await query(`
                INSERT INTO Transferencias (cuenta_origen, cuenta_destino, monto, concepto, tipo_transaccion, fecha_hora, estado, referencia)
                VALUES (@origen, @destino, @monto, @concepto, @tipo, DATEADD(day, -@dias, GETDATE()), 'completada', @ref)
            `, [
                { name:'origen',   type:sql.Char(16), value:t.origen },
                { name:'destino',  type:sql.Char(16), value:t.destino },
                { name:'monto',    type:sql.Decimal, value:t.monto },
                { name:'concepto', type:sql.NVarChar,value:t.concepto },
                { name:'tipo',     type:sql.NVarChar,value:t.tipo },
                { name:'dias',     type:sql.Int,     value:t.dias },
                { name:'ref',      type:sql.NVarChar,value:t.ref }
            ]);
        }
        logger.info('Seed', `✓ ${transfers.length} transferencias de prueba insertadas`);

        console.log('\n✅ Seed completado. Resumen de accesos para QA:');
        console.log('──────────────────────────────────────────────────');
        console.log('  admin@bbva.com   / Admin1!   (administrador)');
        console.log('  carlos@bbva.com  / Carlos1!  (cliente $12,300)');
        console.log('  maria@bbva.com   / Maria1!   (cliente $10,000)');
        console.log('  juan@bbva.com    / Juan1!    (cliente $499 — fondos insuficientes)');
        console.log('  luisa@bbva.com   / Luisa1!   (cliente $49,800 — cerca de límite)');
        console.log('  pedro@bbva.com   / Pedro1!   (BLOQUEADO — probar reactivación)');
        console.log('  ana@bbva.com     / Ana1!     (cliente $4,700)');
        console.log('──────────────────────────────────────────────────');

        process.exit(0);
    } catch (err) {
        logger.error('Seed', `Error en seed: ${err.message}`, err.stack);
        process.exit(1);
    }
}

seed();
