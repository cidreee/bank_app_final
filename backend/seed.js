// Script para insertar datos semilla con passwords correctamente hasheados
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sql, query, getPool } = require('./config/database');

const SALT_ROUNDS = 10;

const usuarios = [
    { nombre: 'Admin',   apellido: 'BBVA',    email: 'admin@bbva.com',  password: 'Admin1!',   rol: 'administrador' },
    { nombre: 'Carlos',  apellido: 'Mendoza', email: 'carlos@bbva.com', password: 'Carlos1!',  rol: 'cliente' },
    { nombre: 'María',   apellido: 'García',  email: 'maria@bbva.com',  password: 'Maria1!',   rol: 'cliente' }
];

async function seed() {
    try {
        await getPool();
        console.log('Conectado a BD_BBVA...');

        for (const u of usuarios) {
            const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
            await query(`
                IF NOT EXISTS (SELECT 1 FROM Usuarios WHERE email = @email)
                BEGIN
                    INSERT INTO Usuarios (nombre, apellido, email, password_hash, rol)
                    VALUES (@nombre, @apellido, @email, @hash, @rol)
                END
                ELSE
                BEGIN
                    UPDATE Usuarios SET password_hash = @hash WHERE email = @email
                END
            `, [
                { name: 'nombre',   type: sql.NVarChar, value: u.nombre },
                { name: 'apellido', type: sql.NVarChar, value: u.apellido },
                { name: 'email',    type: sql.NVarChar, value: u.email },
                { name: 'hash',     type: sql.NVarChar, value: hash },
                { name: 'rol',      type: sql.NVarChar, value: u.rol }
            ]);
            console.log(`✓ Usuario: ${u.email} | Password: ${u.password}`);
        }

        // Cuentas para clientes
        const cuentas = [
            { email: 'carlos@bbva.com', numero: '1234567890123456', saldo: 15000.00 },
            { email: 'maria@bbva.com',  numero: '9876543210987654', saldo: 8500.00 }
        ];

        for (const c of cuentas) {
            const uid = await query('SELECT id FROM Usuarios WHERE email = @email',
                [{ name: 'email', type: sql.NVarChar, value: c.email }]);
            const userId = uid.recordset[0]?.id;
            if (userId) {
                await query(`
                    IF NOT EXISTS (SELECT 1 FROM Cuentas WHERE usuario_id = @uid)
                    BEGIN
                        INSERT INTO Cuentas (numero_cuenta, usuario_id, saldo)
                        VALUES (@num, @uid, @saldo)
                    END
                `, [
                    { name: 'num',   type: sql.Char,    value: c.numero },
                    { name: 'uid',   type: sql.Int,     value: userId },
                    { name: 'saldo', type: sql.Decimal, value: c.saldo }
                ]);
                console.log(`✓ Cuenta: ${c.numero} → ${c.email} (saldo: $${c.saldo})`);
            }
        }

        console.log('\n✅ Seed completado exitosamente.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error en seed:', err.message);
        process.exit(1);
    }
}

seed();
