/* ============================================================
   BBVA Fake — utils.js
   LocalStorage DB + Hashing (SHA-256 via Web Crypto API)
   BA-9: Encriptación de contraseñas [RF-03]
   ============================================================ */

// ---- Hashing de contraseñas (BA-58 / BA-59 / BA-60) ----
const _SALT = 'bbva_fake_salt_2024';

async function hashPassword(pwd) {
    const data = new TextEncoder().encode(pwd + _SALT);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function verifyPassword(pwd, storedHash) {
    return (await hashPassword(pwd)) === storedHash;
}

// ---- Base de datos local (localStorage) ----
const DB_VERSION = '5';   // incrementar si cambia el esquema o usuarios semilla

const DB = {
    _k: {
        users:    'bbva_users',
        cuentas:  'bbva_cuentas',
        transfers:'bbva_transfers',
        version:  'bbva_db_version'
    },

    /** Inicializa la DB (async por el hashing). Llamar una sola vez al arrancar. */
    async init() {
        if (localStorage.getItem(this._k.version) === DB_VERSION) {
            Logger.info('DB', `DB v${DB_VERSION} ya inicializada`);
            return;
        }
        Logger.info('DB', `Inicializando DB v${DB_VERSION}...`);
        // Limpiar versión anterior
        Object.values(this._k).forEach(k => localStorage.removeItem(k));
        await this._seed();
        localStorage.setItem(this._k.version, DB_VERSION);
        Logger.info('DB', 'Seed completado');
    },

    async _seed() {
        // Usuarios semilla (BA-7, BA-10, BA-11 y escenarios de transferencia)
        const rawUsers = [
            // ── Administrador ──────────────────────────────────────────────────────
            { id:1, nombre:'Admin',  apellido:'BBVA',    usuario:'admin',  password:'admin',   rol:'administrador' },
            // ── Clientes activos ───────────────────────────────────────────────────
            { id:2, nombre:'Carlos', apellido:'Mendoza', usuario:'carlos', password:'12345',   rol:'cliente' },
            { id:3, nombre:'María',  apellido:'García',  usuario:'maria',  password:'Maria1!', rol:'cliente' },
            // Saldo $499 → prueba BA-23 / BA-29 fondos insuficientes
            { id:4, nombre:'Juan',   apellido:'Pérez',   usuario:'juan',   password:'Juan1!',  rol:'cliente' },
            // Saldo $49,800 → prueba BA-25 / BA-31 límite destino
            { id:5, nombre:'Luisa',  apellido:'Torres',  usuario:'luisa',  password:'Luisa1!', rol:'cliente' },
            // Cuenta bloqueada → prueba BA-10 / BA-11
            { id:6, nombre:'Pedro',  apellido:'Ramírez', usuario:'pedro',  password:'Pedro1!', rol:'cliente',
              estado:'bloqueado', intentos_fallidos:4 },
            // Cuenta extra para transferencias múltiples (BA-28)
            { id:7, nombre:'Ana',    apellido:'López',   usuario:'ana',    password:'Ana1!',   rol:'cliente' }
        ];

        const users = await Promise.all(rawUsers.map(async u => {
            const { password, ...rest } = u;
            return {
                ...rest,
                password_hash:     await hashPassword(password),
                estado:            u.estado            || 'activo',
                intentos_fallidos: u.intentos_fallidos || 0,
                ultimo_acceso:     null,
                fecha_creacion:    new Date().toISOString()
            };
        }));

        const cuentas = [
            // carlos: 15000 - 1500 (tx10) - 1200 (tx11) = 12300 (transferencias de hoy ya incluidas)
            { id:1, numero_cuenta:'1234567890123456', usuario_id:2, saldo:12300.00, estado:'activa' },
            // maria: 8500 + 1500 (recibe tx10) = 10000
            { id:2, numero_cuenta:'9876543210987654', usuario_id:3, saldo:10000.00, estado:'activa' },
            { id:3, numero_cuenta:'1111222233334444', usuario_id:4, saldo:499.00,   estado:'activa' },
            { id:4, numero_cuenta:'5555666677778888', usuario_id:5, saldo:49800.00, estado:'activa' },
            { id:5, numero_cuenta:'9999000011112222', usuario_id:6, saldo:5000.00,  estado:'activa' },
            // ana: 3500 + 1200 (recibe tx11) = 4700
            { id:6, numero_cuenta:'3333444455556666', usuario_id:7, saldo:4700.00,  estado:'activa' }
        ].map(c => ({ ...c, fecha_apertura: new Date().toISOString() }));

        // ── Historial de prueba (BA-35 / BA-36 / BA-37 / BA-39) ──────────────
        // 8 transferencias para carlos: página 1 (5) + página 2 (3)
        // Ordenadas de más antigua a más reciente en el array;
        // getTransfersByCuenta las invertirá por fecha (BA-120)
        const ago = (n, h = 10) => {
            const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 30, 0, 0);
            return d.toISOString();
        };
        const transfers = [
            // Página 2 — más antiguas
            { id:8, cuenta_origen:'1234567890123456', cuenta_destino:'9876543210987654', monto:550.00, concepto:'Medicamentos familia',      tipo_transaccion:'transferencia', fecha_hora:ago(8), estado:'completada', referencia:'REF20240008' },
            { id:7, cuenta_origen:'3333444455556666', cuenta_destino:'1234567890123456', monto:900.00, concepto:'Pago factura pendiente',    tipo_transaccion:'transferencia', fecha_hora:ago(7), estado:'completada', referencia:'REF20240007' },
            { id:6, cuenta_origen:'1234567890123456', cuenta_destino:'3333444455556666', monto:600.00, concepto:'Útiles escolares',          tipo_transaccion:'transferencia', fecha_hora:ago(6), estado:'completada', referencia:'REF20240006' },
            // Página 1 — más recientes (las 5 que se muestran en inicio)
            { id:5, cuenta_origen:'1234567890123456', cuenta_destino:'9876543210987654', monto:800.00, concepto:'Cena familiar',             tipo_transaccion:'transferencia', fecha_hora:ago(5), estado:'completada', referencia:'REF20240005' },
            { id:4, cuenta_origen:'9876543210987654', cuenta_destino:'1234567890123456', monto:1200.00,concepto:'Reembolso de compra',       tipo_transaccion:'deposito',       fecha_hora:ago(4), estado:'completada', referencia:'REF20240004' },
            { id:3, cuenta_origen:'1234567890123456', cuenta_destino:'3333444455556666', monto:750.00, concepto:'Servicios profesionales',   tipo_transaccion:'transferencia', fecha_hora:ago(3), estado:'completada', referencia:'REF20240003' },
            { id:2, cuenta_origen:'3333444455556666', cuenta_destino:'1234567890123456', monto:500.00, concepto:'Préstamo personal',         tipo_transaccion:'transferencia', fecha_hora:ago(2), estado:'completada', referencia:'REF20240002' },
            { id:1, cuenta_origen:'1234567890123456', cuenta_destino:'9876543210987654', monto:1000.00,concepto:'Pago de renta',             tipo_transaccion:'transferencia', fecha_hora:ago(1), estado:'completada', referencia:'REF20240001' },
            // Transferencia entre otros usuarios (NO debe aparecer en historial de carlos — BA-123)
            { id:9,  cuenta_origen:'9876543210987654', cuenta_destino:'3333444455556666', monto:750.00,  concepto:'Pago servicios entre socios', tipo_transaccion:'transferencia', fecha_hora:ago(2),    estado:'completada', referencia:'REF20240009' },
            // ── Transferencias de HOY para carlos (BA-22: límite diario parcial) ──
            // $1,500 + $1,200 = $2,700 enviados hoy → disponible $4,300 · barra al ~39%
            { id:10, cuenta_origen:'1234567890123456', cuenta_destino:'9876543210987654', monto:1500.00, concepto:'Consulta médica familiar',   tipo_transaccion:'transferencia', fecha_hora:ago(0, 9),  estado:'completada', referencia:'REF20240010' },
            { id:11, cuenta_origen:'1234567890123456', cuenta_destino:'3333444455556666', monto:1200.00, concepto:'Préstamo mensual acordado',   tipo_transaccion:'transferencia', fecha_hora:ago(0, 11), estado:'completada', referencia:'REF20240011' },
        ];

        localStorage.setItem(this._k.users,     JSON.stringify(users));
        localStorage.setItem(this._k.cuentas,   JSON.stringify(cuentas));
        localStorage.setItem(this._k.transfers,  JSON.stringify(transfers));
    },

    // ---- Usuarios ----
    getUsers()   { return JSON.parse(localStorage.getItem(this._k.users)    || '[]'); },
    saveUsers(a) { localStorage.setItem(this._k.users, JSON.stringify(a)); },

    // Devuelve usuario COMPLETO (solo para flujos de autenticación internos)
    getUserByUsuario(u) { return this.getUsers().find(x => x.usuario === u)  || null; },
    getUserById(id)     { return this.getUsers().find(x => x.id === id)      || null; },

    // BA-13 [RNF-01]: versiones públicas — nunca exponen password_hash
    getUserPublicById(id) {
        const u = this.getUserById(id);
        if (!u) return null;
        const { password_hash: _, ...safe } = u;
        return safe;
    },
    getUsersPublic() {
        return this.getUsers().map(u => {
            const { password_hash: _, ...safe } = u;
            return safe;
        });
    },

    updateUser(id, fields) {
        // Nunca permitir sobrescribir el hash desde fuera del flujo de auth
        const { password_hash: _blocked, ...safeFields } = fields;
        if (_blocked !== undefined) {
            Logger.error('DB', `BA-13: intento de escritura directa de password_hash bloqueado`, `usuario id=${id}`);
            return;
        }
        const users = this.getUsers().map(u => u.id === id ? { ...u, ...safeFields } : u);
        this.saveUsers(users);
        Logger.debug('DB', `Usuario ${id} actualizado`, Object.keys(safeFields).join(', '));
    },

    // Solo para uso interno de auth.js — actualiza el hash de forma controlada
    _updatePasswordHash(id, newHash) {
        const users = this.getUsers().map(u => u.id === id ? { ...u, password_hash: newHash } : u);
        this.saveUsers(users);
        Logger.info('DB', `BA-13: password_hash actualizado para usuario id=${id}`);
    },

    // ---- Cuentas ----
    getCuentas()   { return JSON.parse(localStorage.getItem(this._k.cuentas)   || '[]'); },
    saveCuentas(a) { localStorage.setItem(this._k.cuentas, JSON.stringify(a)); },

    getCuentaByUsuario(uid) { return this.getCuentas().find(c => c.usuario_id === uid) || null; },
    getCuentaByNumero(num)  { return this.getCuentas().find(c => c.numero_cuenta === String(num)) || null; },

    updateCuenta(numero, fields) {
        const cuentas = this.getCuentas().map(c =>
            c.numero_cuenta === String(numero) ? { ...c, ...fields } : c
        );
        this.saveCuentas(cuentas);
    },

    // ---- Transferencias ----
    getTransfers()   { return JSON.parse(localStorage.getItem(this._k.transfers) || '[]'); },
    saveTransfers(a) { localStorage.setItem(this._k.transfers, JSON.stringify(a)); },

    addTransfer(tx) {
        const list = this.getTransfers();
        const id   = list.length ? list[list.length - 1].id + 1 : 1;
        // BA-126: montos siempre con exactamente 2 decimales
        const full = { id, ...tx, monto: parseFloat(Number(tx.monto).toFixed(2)) };
        list.push(full);
        this.saveTransfers(list);
        Logger.info('DB', `Transferencia #${id} registrada`, `${tx.cuenta_origen} → ${tx.cuenta_destino} $${tx.monto}`);
        return full;
    },

    getTransfersByCuenta(numero, page = 1, perPage = 5) {
        const all = this.getTransfers()
            .filter(t => (t.cuenta_origen === numero || t.cuenta_destino === numero) && t.estado === 'completada')
            .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
        return {
            list:       all.slice((page - 1) * perPage, page * perPage),
            total:      all.length,
            totalPages: Math.ceil(all.length / perPage) || 1
        };
    },

    getTotalEnviadoHoy(numeroCuenta) {
        const hoy = new Date().toDateString();
        return this.getTransfers()
            .filter(t =>
                t.cuenta_origen === numeroCuenta &&
                t.estado === 'completada' &&
                new Date(t.fecha_hora).toDateString() === hoy
            )
            .reduce((s, t) => s + t.monto, 0);
    },

    // ---- Registro de nuevos usuarios ----
    generarNumeroCuenta() {
        let num;
        do {
            num = Array.from({length: 16}, () => Math.floor(Math.random() * 10)).join('');
        } while (this.getCuentaByNumero(num));
        return num;
    },

    async createUser({ nombre, apellido, email, usuario, password, numeroCuenta }) {
        const users = this.getUsers();
        if (users.find(u => u.usuario === usuario)) {
            Logger.warn('DB', `Intento de crear usuario duplicado: "${usuario}"`);
            throw new Error(`El usuario "${usuario}" ya está en uso`);
        }

        const newId   = users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
        const hash    = await hashPassword(password);
        const newUser = {
            id:                newId,
            nombre,
            apellido,
            usuario,
            email:             email || '',
            password_hash:     hash,
            rol:               'cliente',     // nuevos usuarios siempre son clientes (BA-14)
            estado:            'activo',
            intentos_fallidos: 0,
            ultimo_acceso:     null,
            fecha_creacion:    new Date().toISOString()
        };
        users.push(newUser);
        this.saveUsers(users);

        // Verificar colisión de número de cuenta (carrera entre ventanas)
        if (this.getCuentaByNumero(numeroCuenta)) {
            Logger.warn('DB', `Colisión de número de cuenta, regenerando: ${numeroCuenta}`);
            numeroCuenta = this.generarNumeroCuenta();
        }

        const cuentas   = this.getCuentas();
        const cuentaId  = cuentas.length ? Math.max(...cuentas.map(c => c.id)) + 1 : 1;
        const newCuenta = {
            id:             cuentaId,
            numero_cuenta:  numeroCuenta,
            usuario_id:     newId,
            saldo:          1000.00,
            estado:         'activa',
            fecha_apertura: new Date().toISOString()
        };
        cuentas.push(newCuenta);
        this.saveCuentas(cuentas);

        Logger.info('DB', `Nuevo usuario registrado: ${usuario} (id=${newId})`, `cuenta: ${numeroCuenta}`);
        const { password_hash: _, ...safeUser } = newUser;
        return { user: safeUser, cuenta: newCuenta };
    }
};

// Promesa global — ambas páginas esperan esto antes de operar
const dbReady = DB.init().catch(err => {
    Logger.error('DB', 'Error fatal al inicializar la base de datos', err.message);
});

// ---- Sesión (sessionStorage: se limpia al cerrar pestaña) ----
function getToken()         { return sessionStorage.getItem('bbva_uid'); }
function setSession(uid)    { sessionStorage.setItem('bbva_uid', String(uid)); }
function clearSession()     { sessionStorage.removeItem('bbva_uid'); }

function getUser() {
    const uid = getToken();
    if (!uid) return null;
    // BA-13: nunca exponer password_hash fuera del flujo de autenticación
    return DB.getUserPublicById(parseInt(uid));
}

function logout() {
    const u = getUser();
    if (u) Logger.info('Auth', `Sesión cerrada: ${u.usuario}`);
    clearSession();
    window.location.href = 'login.html';
}

function requireAuth() {
    if (!getToken()) {
        Logger.warn('Auth', 'Acceso denegado — no hay sesión activa');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// ---- Formatters ----
function formatCurrency(n) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: 'MXN', minimumFractionDigits: 2
    }).format(n);
}

function formatCuentaMask(n) {
    return String(n).replace(/(.{4})/g, '$1 ').trim();
}

function formatDateTime(d) {
    return new Date(d).toLocaleString('es-MX', {
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit'
    });
}

// ---- Toast ----
function showToast(msg, type = 'info', duration = 4000) {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${escHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = '.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ---- XSS prevention ----
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
