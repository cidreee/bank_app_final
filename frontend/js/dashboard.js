/* Dashboard principal — modo localStorage, sin backend */

if (!requireAuth()) { /* redirigido */ }

const MONTO_MIN   = 500;
const LIMITE_DIA  = 7000;
const SALDO_MAX   = 50000;

const user = getUser();
let historialPage = 1;

// ---- Inicialización ----
window.addEventListener('DOMContentLoaded', () => {
    if (!user) { logout(); return; }

    renderUserInfo();
    setTodayDate();
    setupNav();

    if (user.rol === 'administrador') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        document.getElementById('balanceCard')?.classList.add('hidden');
        document.getElementById('statsGrid')?.classList.add('hidden');
        // Admin inicia en panel de administración
        navigateTo('admin');
    } else {
        renderInicio();
    }
});

// ---- Navbar ----
function renderUserInfo() {
    const fullName = `${user.nombre} ${user.apellido}`;
    document.getElementById('navUserName').textContent = fullName;
    document.getElementById('navUserRole').textContent =
        user.rol === 'administrador' ? 'Administrador' : 'Cliente';
    document.getElementById('navAvatar').textContent = user.nombre.charAt(0).toUpperCase();
    document.getElementById('welcomeTitle').textContent = `Hola, ${user.nombre}`;
}

function setTodayDate() {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('todayDate').textContent =
        new Date().toLocaleDateString('es-MX', opts);
}

// ---- Navegación ----
function setupNav() {
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.dataset.section);
        });
    });
}

function navigateTo(section) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));

    const el = document.getElementById(`section-${section}`);
    if (el) el.classList.add('active');

    document.querySelectorAll(`[data-section="${section}"]`).forEach(a => a.classList.add('active'));

    if (section === 'inicio')     renderInicio();
    if (section === 'historial')  cargarHistorial(1);
    if (section === 'admin')      cargarAdmin();
}

// ---- Refrescar ----
function refrescarDatos() {
    const btn = document.getElementById('btnRefrescar');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="border-top-color:var(--bbva-blue)"></span> Actualizando...';
    setTimeout(() => {
        renderInicio();
        btn.disabled = false;
        btn.innerHTML = '🔄 Refrescar pantalla';
        showToast('Pantalla actualizada', 'success', 1800);
    }, 500);
}

// ---- Sección Inicio ----
function renderInicio() {
    const cuenta = DB.getCuentaByUsuario(user.id);
    if (!cuenta) return;

    document.getElementById('saldoDisplay').textContent        = formatCurrency(cuenta.saldo);
    document.getElementById('numeroCuentaDisplay').textContent = formatCuentaMask(cuenta.numero_cuenta);

    const enviado    = DB.getTotalEnviadoHoy(cuenta.numero_cuenta);
    const disponible = Math.max(0, LIMITE_DIA - enviado);
    const hoy        = new Date().toDateString();

    const recibidoHoy = DB.getTransfers()
        .filter(t =>
            t.cuenta_destino === cuenta.numero_cuenta &&
            t.estado === 'completada' &&
            new Date(t.fecha_hora).toDateString() === hoy
        )
        .reduce((s, t) => s + t.monto, 0);

    document.getElementById('statEnviado').textContent    = formatCurrency(enviado);
    document.getElementById('statRecibido').textContent   = formatCurrency(recibidoHoy);
    document.getElementById('statDisponible').textContent = formatCurrency(disponible);

    const pct = Math.min(100, (enviado / LIMITE_DIA) * 100);
    const fill = document.getElementById('limiteDiarioFill');
    fill.style.width      = pct + '%';
    fill.style.background = pct > 80 ? 'var(--bbva-danger)' : pct > 50 ? 'var(--bbva-warning)' : 'var(--bbva-blue-light)';

    renderMovimientosRecientes(cuenta.numero_cuenta);
}

function renderMovimientosRecientes(numeroCuenta) {
    const list = document.getElementById('recentTxList');
    const { list: txs } = DB.getTransfersBycuenta(numeroCuenta, 1, 5);

    if (!txs.length) {
        list.innerHTML = '<li class="text-muted text-center" style="padding:20px">Sin movimientos registrados</li>';
        return;
    }

    list.innerHTML = txs.map(tx => {
        const enviada   = tx.cuenta_origen === numeroCuenta;
        const cuentaOtra = enviada ? tx.cuenta_destino : tx.cuenta_origen;
        return `
        <li class="tx-item">
            <div class="tx-icon ${enviada ? 'sent' : 'received'}">${enviada ? '↑' : '↓'}</div>
            <div class="tx-info">
                <p class="tx-concepto">${escHtml(tx.concepto)}</p>
                <p class="tx-cuenta">${formatCuentaMask(cuentaOtra)}</p>
                <p class="tx-fecha">${formatDateTime(tx.fecha_hora)}</p>
            </div>
            <span class="tx-amount ${enviada ? 'sent' : 'received'}">
                ${enviada ? '-' : '+'}${formatCurrency(tx.monto)}
            </span>
        </li>`;
    }).join('');
}

// ---- Historial ----
function cargarHistorial(page) {
    historialPage = page;
    const cuenta = DB.getCuentaByUsuario(user.id);
    const tbody  = document.getElementById('historialBody');

    if (!cuenta) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">Sin cuenta asociada</td></tr>';
        return;
    }

    const { list: txs, total, totalPages } = DB.getTransfersBycuenta(cuenta.numero_cuenta, page, 5);

    document.getElementById('historialInfo').textContent =
        `${total} movimiento(s) · Página ${page} de ${totalPages || 1}`;

    if (!txs.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">Sin movimientos</td></tr>';
        document.getElementById('historialPaginacion').innerHTML = '';
        return;
    }

    tbody.innerHTML = txs.map(tx => {
        const enviada    = tx.cuenta_origen === cuenta.numero_cuenta;
        const cuentaOtra = enviada ? tx.cuenta_destino : tx.cuenta_origen;
        return `<tr>
            <td><span class="badge ${enviada ? 'badge-danger' : 'badge-success'}">${enviada ? '↑ Enviada' : '↓ Recibida'}</span></td>
            <td>${escHtml(tx.concepto)}</td>
            <td class="font-mono" style="font-size:.8rem">${cuentaOtra}</td>
            <td class="${enviada ? 'tx-amount sent' : 'tx-amount received'}" style="white-space:nowrap">
                ${enviada ? '-' : '+'}${formatCurrency(tx.monto)}
            </td>
            <td style="font-size:.82rem; white-space:nowrap">${formatDateTime(tx.fecha_hora)}</td>
            <td><span class="badge badge-info">${escHtml(tx.tipo_transaccion)}</span></td>
        </tr>`;
    }).join('');

    renderPaginacion(page, totalPages, 'historialPaginacion', cargarHistorial);
}

// ---- Transferencias ----
// Validación en tiempo real
document.getElementById('tf_cuenta_destino')?.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '');
    const ok  = this.value.length === 16;
    this.classList.toggle('input-ok',   ok);
    this.classList.toggle('input-fail', !ok && this.value.length > 0);
    document.getElementById('err_cuenta').classList.toggle('visible', !ok && this.value.length > 0);
});

document.getElementById('tf_monto')?.addEventListener('input', function () {
    const v  = parseFloat(this.value);
    const ok = !isNaN(v) && v >= MONTO_MIN;
    this.classList.toggle('input-ok',   ok);
    this.classList.toggle('input-fail', !ok && this.value.length > 0);
    document.getElementById('err_monto').classList.toggle('visible', !ok && this.value.length > 0);
});

function previewTransfer() {
    const cuenta   = document.getElementById('tf_cuenta_destino')?.value || '';
    const monto    = parseFloat(document.getElementById('tf_monto')?.value) || 0;
    const concepto = document.getElementById('tf_concepto')?.value || '';
    const tipo     = document.getElementById('tf_tipo')?.value || 'transferencia';

    if (!cuenta || !monto || !concepto) {
        showToast('Completa todos los campos antes de la vista previa', 'warning');
        return;
    }
    document.getElementById('sumCuenta').textContent  = formatCuentaMask(cuenta);
    document.getElementById('sumConcepto').textContent = concepto;
    document.getElementById('sumTipo').textContent    = tipo;
    document.getElementById('sumMonto').textContent   = formatCurrency(monto);
    document.getElementById('transferSummary').classList.remove('hidden');
}

document.getElementById('transferForm')?.addEventListener('submit', (e) => {
    e.preventDefault();

    const btn      = document.getElementById('btnTransfer');
    const alertDiv = document.getElementById('transferAlert');
    const cuenta   = document.getElementById('tf_cuenta_destino').value.trim();
    const monto    = parseFloat(document.getElementById('tf_monto').value);
    const concepto = document.getElementById('tf_concepto').value.trim();
    const tipo     = document.getElementById('tf_tipo').value;

    alertDiv.className = 'hidden';

    function showError(msg, tipo = 'danger') {
        alertDiv.className = `alert alert-${tipo}`;
        alertDiv.innerHTML = `<span>⚠</span><span>${escHtml(msg)}</span>`;
        btn.disabled    = false;
        btn.textContent = 'Confirmar transferencia';
    }

    // --- Validaciones ---
    if (cuenta.length !== 16) return showError('El número de cuenta debe tener exactamente 16 dígitos');
    if (isNaN(monto) || monto < MONTO_MIN) return showError(`El monto mínimo de transferencia es ${formatCurrency(MONTO_MIN)}`);
    if (!concepto) return showError('El concepto es requerido');

    btn.disabled    = true;
    btn.innerHTML   = '<span class="loader"></span> Procesando...';

    setTimeout(() => {
        const cuentaOrigen = DB.getCuentaByUsuario(user.id);
        if (!cuentaOrigen)               return showError('Cuenta origen no encontrada');
        if (cuentaOrigen.estado !== 'activa') return showError('Su cuenta se encuentra inactiva');
        if (cuentaOrigen.numero_cuenta === cuenta) return showError('No puede transferir a su propia cuenta');

        const cuentaDestino = DB.getCuentaByNumero(cuenta);
        if (!cuentaDestino)              return showError('Cuenta inexistente');
        if (cuentaDestino.estado !== 'activa') return showError('La cuenta destino no está activa');
        if (cuentaOrigen.saldo < monto)  return showError('Fondos insuficientes');

        if (cuentaDestino.saldo + monto > SALDO_MAX) {
            return showError(`La cuenta destino alcanzaría el límite máximo de ${formatCurrency(SALDO_MAX)}`);
        }

        const totalHoy = DB.getTotalEnviadoHoy(cuentaOrigen.numero_cuenta);
        if (totalHoy + monto > LIMITE_DIA) {
            const disponible = LIMITE_DIA - totalHoy;
            return showError(`Límite diario excedido. Disponible hoy: ${formatCurrency(disponible)}`);
        }

        // ---- Ejecutar transferencia ----
        DB.updateCuenta(cuentaOrigen.numero_cuenta, { saldo: +(cuentaOrigen.saldo - monto).toFixed(2) });
        DB.updateCuenta(cuentaDestino.numero_cuenta, { saldo: +(cuentaDestino.saldo + monto).toFixed(2) });

        const ref = 'REF' + Date.now();
        const tx  = DB.addTransfer({
            cuenta_origen:    cuentaOrigen.numero_cuenta,
            cuenta_destino:   cuentaDestino.numero_cuenta,
            monto,
            concepto,
            tipo_transaccion: tipo,
            fecha_hora:       new Date().toISOString(),
            estado:           'completada',
            referencia:       ref
        });

        // Mostrar modal de éxito
        document.getElementById('successAmount').textContent = formatCurrency(monto);
        document.getElementById('successRef').textContent    = tx.referencia;
        document.getElementById('successFecha').textContent  = formatDateTime(tx.fecha_hora);
        document.getElementById('successModal').classList.add('open');

        // Limpiar formulario
        document.getElementById('transferForm').reset();
        document.getElementById('transferSummary').classList.add('hidden');
        ['tf_cuenta_destino', 'tf_monto', 'tf_concepto'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('input-ok', 'input-fail');
        });

        btn.disabled    = false;
        btn.textContent = 'Confirmar transferencia';
    }, 600);
});

function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('open');
    renderInicio();
}

// ---- Panel Admin ----
function cargarAdmin() {
    const tbody = document.getElementById('adminBody');
    const users   = DB.getUsers();
    const cuentas = DB.getCuentas();

    if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:20px">Sin datos</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(u => {
        const cuenta = cuentas.find(c => c.usuario_id === u.id) || null;
        return `<tr>
            <td>${u.id}</td>
            <td>${escHtml(u.nombre)} ${escHtml(u.apellido)}</td>
            <td style="font-size:.82rem">${escHtml(u.usuario)}</td>
            <td><span class="badge ${u.rol === 'administrador' ? 'badge-warning' : 'badge-info'}">${u.rol}</span></td>
            <td>
                <span class="badge ${u.estado === 'activo' ? 'badge-success' : 'badge-danger'}">${u.estado}</span>
                ${u.intentos_fallidos > 0
                    ? `<small class="text-muted" style="display:block;font-size:.7rem">${u.intentos_fallidos} intento(s)</small>`
                    : ''}
            </td>
            <td class="font-mono" style="font-size:.78rem">${cuenta ? cuenta.numero_cuenta : '—'}</td>
            <td style="font-weight:700; color:var(--bbva-blue)">${cuenta ? formatCurrency(cuenta.saldo) : '—'}</td>
            <td style="font-size:.78rem">${u.ultimo_acceso ? formatDateTime(u.ultimo_acceso) : 'Nunca'}</td>
            <td>
                ${u.estado === 'bloqueado'
                    ? `<button class="btn btn-success btn-sm" onclick="desbloquearUsuario(${u.id})">🔓 Reactivar</button>`
                    : '<span class="text-muted" style="font-size:.78rem">—</span>'}
            </td>
        </tr>`;
    }).join('');
}

function desbloquearUsuario(id) {
    if (!confirm('¿Reactivar esta cuenta?')) return;
    DB.updateUser(id, { estado: 'activo', intentos_fallidos: 0 });
    showToast('Cuenta reactivada exitosamente', 'success');
    cargarAdmin();
}

// ---- Paginación ----
function renderPaginacion(actual, total, containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container || total <= 1) { if (container) container.innerHTML = ''; return; }

    let html = `<button ${actual === 1 ? 'disabled' : ''} onclick="${callback.name}(${actual - 1})">‹</button>`;
    for (let i = 1; i <= total; i++) {
        html += `<button class="${i === actual ? 'active' : ''}" onclick="${callback.name}(${i})">${i}</button>`;
    }
    html += `<button ${actual === total ? 'disabled' : ''} onclick="${callback.name}(${actual + 1})">›</button>`;
    container.innerHTML = html;
}
