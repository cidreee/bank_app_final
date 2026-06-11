/* ============================================================
   BBVA Fake - API client + shared utilities
   The browser keeps only the JWT/session. Users, accounts and
   transfers now come from the backend and SQL Server.
   ============================================================ */

const API_BASE = '/api';
const SESSION_KEYS = {
    token: 'bbva_token',
    user: 'bbva_user'
};

// Kept for compatibility with older page bootstraps.
const dbReady = Promise.resolve();

function getToken() {
    return sessionStorage.getItem(SESSION_KEYS.token);
}

function setSession(token, user) {
    sessionStorage.setItem(SESSION_KEYS.token, token);
    sessionStorage.setItem(SESSION_KEYS.user, JSON.stringify(user));
}

function clearSession() {
    sessionStorage.removeItem(SESSION_KEYS.token);
    sessionStorage.removeItem(SESSION_KEYS.user);
}

function getUser() {
    try {
        return JSON.parse(sessionStorage.getItem(SESSION_KEYS.user) || 'null');
    } catch (_) {
        return null;
    }
}

function logout() {
    const u = getUser();
    if (u) Logger.info('Auth', `Sesion cerrada: ${u.email}`);
    clearSession();
    window.location.href = 'login.html';
}

function requireAuth() {
    if (!getToken()) {
        Logger.warn('Auth', 'Acceso denegado: no hay token activo');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

async function apiFetch(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers
    });

    let payload = {};
    try {
        payload = await response.json();
    } catch (_) {
        payload = {};
    }

    if (!response.ok) {
        const error = new Error(payload.error || 'Error, consulte al administrador');
        error.status = response.status;
        error.payload = payload;
        throw error;
    }

    return payload;
}

const API = {
    async login(email, password) {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        setSession(data.token, data.usuario);
        return data;
    },

    registerCliente(payload) {
        return apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    resumenCuenta() {
        return apiFetch('/cuentas/resumen');
    },

    movimientos(page = 1) {
        return apiFetch(`/cuentas/movimientos?page=${encodeURIComponent(page)}`);
    },

    transferir(payload) {
        return apiFetch('/transferencias', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    adminCuentas() {
        return apiFetch('/admin/cuentas');
    },

    adminTransferencias(page = 1) {
        return apiFetch(`/admin/transferencias?page=${encodeURIComponent(page)}`);
    },

    desbloquearUsuario(id) {
        return apiFetch(`/admin/usuarios/${encodeURIComponent(id)}/desbloquear`, {
            method: 'PATCH'
        });
    },

    crearUsuario(payload) {
        return apiFetch('/admin/usuarios', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
};

// ---- Formatters ----
function formatCurrency(n) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2
    }).format(Number(n || 0));
}

function formatCuentaMask(n) {
    return String(n || '').replace(/(.{4})/g, '$1 ').trim();
}

function formatDateTime(d) {
    return new Date(d).toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ---- Toast ----
function showToast(msg, type = 'info', duration = 4000) {
    const icons = { success: 'OK', error: 'X', warning: '!', info: 'i' };
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'i'}</span><span>${escHtml(msg)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = '.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ---- XSS prevention ----
function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
