/* ============================================================
   BBVA Fake — utils.js
   Modo sin servidor: toda la data vive en localStorage
   ============================================================ */

// ---- Base de datos local ----
const DB = {

    _k: {
        users:     'bbva_users',
        cuentas:   'bbva_cuentas',
        transfers: 'bbva_transfers',
        init:      'bbva_initialized'
    },

    init() {
        if (localStorage.getItem(this._k.init)) return;
        this._seed();
        localStorage.setItem(this._k.init, '1');
    },

    _seed() {
        const users = [
            {
                id: 1, nombre: 'Admin', apellido: 'BBVA',
                usuario: 'admin', password: 'admin',
                rol: 'administrador', intentos_fallidos: 0,
                estado: 'activo', ultimo_acceso: null,
                fecha_creacion: new Date().toISOString()
            },
            {
                id: 2, nombre: 'Carlos', apellido: 'Mendoza',
                usuario: 'carlos', password: '12345',
                rol: 'cliente', intentos_fallidos: 0,
                estado: 'activo', ultimo_acceso: null,
                fecha_creacion: new Date().toISOString()
            }
        ];

        const cuentas = [
            {
                id: 1, numero_cuenta: '1234567890123456',
                usuario_id: 2, saldo: 15000.00,
                estado: 'activa',
                fecha_apertura: new Date().toISOString()
            }
        ];

        localStorage.setItem(this._k.users,     JSON.stringify(users));
        localStorage.setItem(this._k.cuentas,   JSON.stringify(cuentas));
        localStorage.setItem(this._k.transfers,  JSON.stringify([]));
    },

    // ---- Usuarios ----
    getUsers()       { return JSON.parse(localStorage.getItem(this._k.users)     || '[]'); },
    saveUsers(arr)   { localStorage.setItem(this._k.users,    JSON.stringify(arr)); },

    getUserByUsuario(u) { return this.getUsers().find(x => x.usuario === u) || null; },
    getUserById(id)     { return this.getUsers().find(x => x.id === id)     || null; },

    updateUser(id, fields) {
        const users = this.getUsers().map(u => u.id === id ? { ...u, ...fields } : u);
        this.saveUsers(users);
    },

    // ---- Cuentas ----
    getCuentas()     { return JSON.parse(localStorage.getItem(this._k.cuentas)   || '[]'); },
    saveCuentas(arr) { localStorage.setItem(this._k.cuentas,  JSON.stringify(arr)); },

    getCuentaByUsuario(uid)   { return this.getCuentas().find(c => c.usuario_id === uid) || null; },
    getCuentaByNumero(num)    { return this.getCuentas().find(c => c.numero_cuenta === num) || null; },

    updateCuenta(numero, fields) {
        const cuentas = this.getCuentas().map(c =>
            c.numero_cuenta === numero ? { ...c, ...fields } : c
        );
        this.saveCuentas(cuentas);
    },

    // ---- Transferencias ----
    getTransfers()   { return JSON.parse(localStorage.getItem(this._k.transfers) || '[]'); },
    saveTransfers(a) { localStorage.setItem(this._k.transfers, JSON.stringify(a)); },

    addTransfer(tx) {
        const list = this.getTransfers();
        const next = { id: (list.length ? list[list.length - 1].id + 1 : 1), ...tx };
        list.push(next);
        this.saveTransfers(list);
        return next;
    },

    getTransfersBycuenta(numero, page = 1, perPage = 5) {
        const all = this.getTransfers()
            .filter(t => (t.cuenta_origen === numero || t.cuenta_destino === numero) && t.estado === 'completada')
            .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
        const total = all.length;
        const slice = all.slice((page - 1) * perPage, page * perPage);
        return { list: slice, total, totalPages: Math.ceil(total / perPage) };
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
    }
};

// Inicializar DB al cargar
DB.init();

// ---- Sesión ----
function getToken()  { return sessionStorage.getItem('bbva_uid'); }
function setSession(uid) { sessionStorage.setItem('bbva_uid', String(uid)); }
function clearSession()  { sessionStorage.removeItem('bbva_uid'); }

function getUser() {
    const uid = getToken();
    if (!uid) return null;
    return DB.getUserById(parseInt(uid));
}

function logout() {
    clearSession();
    window.location.href = 'login.html';
}

function requireAuth() {
    if (!getToken()) { window.location.href = 'login.html'; return false; }
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
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// ---- Toast ----
function showToast(msg, type = 'info', duration = 4000) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = '.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ---- XSS ----
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
