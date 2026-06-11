/* ============================================================
   Dashboard backed by API/SQL data.
   ============================================================ */

const LIMITE_DIA = 7000;
let historialPage = 1;
let adminMovimientosPage = 1;
let currentCuenta = null;

if (!requireAuth()) {
    // requireAuth redirects to login.
} else {
    initDashboard();
}

async function initDashboard() {
    const user = getUser();
    if (!user) {
        logout();
        return;
    }

    Logger.info('Dashboard', `Sesion activa: ${user.email} (${user.rol})`);
    renderUserInfo(user);
    setTodayDate();
    setupNav(user);
    setupTransferForm(user);

    if (user.rol === 'administrador') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        document.getElementById('balanceCard')?.classList.add('hidden');
        document.getElementById('statsGrid')?.classList.add('hidden');
        navigateTo('admin', user);
    } else {
        navigateTo('inicio', user);
    }
}

function renderUserInfo(user) {
    document.getElementById('navUserName').textContent = `${user.nombre} ${user.apellido}`;
    document.getElementById('navUserRole').textContent = user.rol === 'administrador' ? 'Administrador' : 'Cliente';
    document.getElementById('navAvatar').textContent = user.nombre.charAt(0).toUpperCase();
    document.getElementById('welcomeTitle').textContent = `Hola, ${user.nombre}`;
}

function setTodayDate() {
    document.getElementById('todayDate').textContent =
        new Date().toLocaleDateString('es-MX', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
}

function setupNav(user) {
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.dataset.section, user);
        });
    });
}

function navigateTo(section, user = getUser()) {
    if (section === 'admin' && user?.rol !== 'administrador') {
        Logger.warn('AccessControl', `Acceso admin denegado para ${user?.email}`);
        section = 'inicio';
    }

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));

    document.getElementById(`section-${section}`)?.classList.add('active');
    document.querySelectorAll(`[data-section="${section}"]`).forEach(a => a.classList.add('active'));

    Logger.debug('Dashboard', `Navegando a seccion: ${section}`);

    if (section === 'inicio') renderInicio();
    if (section === 'historial') cargarHistorial(1);
    if (section === 'admin') cargarAdmin();
}

async function refrescarDatos() {
    const btn = document.getElementById('btnRefrescar');
    btn.disabled = true;
    btn.innerHTML = '<span class="loader" style="border-top-color:var(--bbva-blue)"></span> Actualizando...';
    Logger.info('Dashboard', 'Refresco manual solicitado');

    try {
        await renderInicio();
        showToast('Pantalla actualizada', 'success', 1800);
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Refrescar pantalla';
    }
}

async function renderInicio() {
    const list = document.getElementById('recentTxList');
    if (list) list.innerHTML = '<li class="text-muted text-center" style="padding:20px">Cargando movimientos...</li>';

    try {
        const data = await API.resumenCuenta();
        currentCuenta = data.cuenta;
        const resumen = data.resumen;

        document.getElementById('saldoDisplay').textContent = formatCurrency(currentCuenta.saldo);
        document.getElementById('numeroCuentaDisplay').textContent = formatCuentaMask(currentCuenta.numero_cuenta);

        document.getElementById('statEnviado').textContent = formatCurrency(resumen.enviado_hoy);
        document.getElementById('statRecibido').textContent = formatCurrency(resumen.recibido_hoy);
        document.getElementById('statDisponible').textContent = formatCurrency(resumen.disponible_hoy);

        const pct = Math.min(100, (Number(resumen.enviado_hoy || 0) / LIMITE_DIA) * 100);
        const fill = document.getElementById('limiteDiarioFill');
        fill.style.width = `${pct}%`;
        fill.style.background = pct > 80 ? 'var(--bbva-danger)'
            : pct > 50 ? 'var(--bbva-warning)'
            : 'var(--bbva-blue-light)';

        const movimientos = await API.movimientos(1);
        renderMovimientosRecientes(movimientos.movimientos || []);
        Logger.debug('Dashboard', `Inicio renderizado para cuenta ${currentCuenta.numero_cuenta}`);
    } catch (err) {
        Logger.error('Dashboard', `Error renderInicio: ${err.message}`);
        showToast(err.message, 'error');
    }
}

function renderMovimientosRecientes(txs) {
    const list = document.getElementById('recentTxList');
    if (!list) return;

    if (!txs.length) {
        list.innerHTML = '<li class="text-muted text-center" style="padding:20px">Sin movimientos registrados</li>';
        return;
    }

    list.innerHTML = txs.slice(0, 5).map(tx => {
        const enviada = tx.direccion === 'enviada' || tx.cuenta_origen === currentCuenta?.numero_cuenta;
        const cuentaOtra = enviada ? tx.cuenta_destino : tx.cuenta_origen;
        return `
        <li class="tx-item">
            <div class="tx-icon ${enviada ? 'sent' : 'received'}">${enviada ? '-' : '+'}</div>
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

async function cargarHistorial(page) {
    historialPage = page;
    const tbody = document.getElementById('historialBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">Cargando...</td></tr>';

    try {
        if (!currentCuenta) {
            const resumen = await API.resumenCuenta();
            currentCuenta = resumen.cuenta;
        }

        const data = await API.movimientos(page);
        const txs = data.movimientos || [];
        const pag = data.paginacion || { total_registros: txs.length, total_paginas: 1 };

        document.getElementById('historialInfo').textContent =
            `${pag.total_registros} movimiento(s) - Pagina ${page} de ${pag.total_paginas || 1}`;

        if (!txs.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">Sin movimientos</td></tr>';
            document.getElementById('historialPaginacion').innerHTML = '';
            return;
        }

        tbody.innerHTML = txs.map(tx => {
            const enviada = tx.direccion === 'enviada' || tx.cuenta_origen === currentCuenta.numero_cuenta;
            const cuentaOtra = enviada ? tx.cuenta_destino : tx.cuenta_origen;
            return `<tr>
                <td><span class="badge ${enviada ? 'badge-danger' : 'badge-success'}">${enviada ? 'Enviada' : 'Recibida'}</span></td>
                <td>${escHtml(tx.concepto)}</td>
                <td class="font-mono" style="font-size:.8rem">${formatCuentaMask(cuentaOtra)}</td>
                <td class="${enviada ? 'tx-amount sent' : 'tx-amount received'}" style="white-space:nowrap">
                    ${enviada ? '-' : '+'}${formatCurrency(tx.monto)}
                </td>
                <td style="font-size:.82rem; white-space:nowrap">${formatDateTime(tx.fecha_hora)}</td>
                <td><span class="badge badge-info">${escHtml(tx.tipo_transaccion)}</span></td>
            </tr>`;
        }).join('');

        renderPaginacion(page, pag.total_paginas || 1, 'historialPaginacion', 'cargarHistorial');
        Logger.debug('Dashboard', `Historial cargado: pagina ${page}`);
    } catch (err) {
        Logger.error('Dashboard', `Error cargarHistorial: ${err.message}`);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:20px">${escHtml(err.message)}</td></tr>`;
    }
}

function setupTransferForm() {
    const tfCuenta = document.getElementById('tf_cuenta_destino');
    const tfMonto = document.getElementById('tf_monto');
    const form = document.getElementById('transferForm');
    if (!form) return;

    tfCuenta?.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        const ok = this.value.length === 16;
        this.classList.toggle('input-ok', ok);
        this.classList.toggle('input-fail', !ok && this.value.length > 0);
        document.getElementById('err_cuenta').classList.toggle('visible', !ok && this.value.length > 0);
    });

    tfMonto?.addEventListener('input', function () {
        const v = parseFloat(this.value);
        const ok = !Number.isNaN(v) && v >= 500;
        this.classList.toggle('input-ok', ok);
        this.classList.toggle('input-fail', !ok && this.value.length > 0);
        document.getElementById('err_monto').classList.toggle('visible', !ok && this.value.length > 0);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await procesarTransferencia();
    });
}

function previewTransfer() {
    const cuenta = document.getElementById('tf_cuenta_destino')?.value || '';
    const monto = parseFloat(document.getElementById('tf_monto')?.value) || 0;
    const concepto = document.getElementById('tf_concepto')?.value || '';
    const tipo = document.getElementById('tf_tipo')?.value || 'transferencia';

    if (!cuenta || !monto || !concepto) {
        showToast('Completa todos los campos antes de la vista previa', 'warning');
        return;
    }

    document.getElementById('sumCuenta').textContent = formatCuentaMask(cuenta);
    document.getElementById('sumConcepto').textContent = concepto;
    document.getElementById('sumTipo').textContent = tipo;
    document.getElementById('sumMonto').textContent = formatCurrency(monto);
    document.getElementById('transferSummary').classList.remove('hidden');
}

async function procesarTransferencia() {
    const btn = document.getElementById('btnTransfer');
    const alertDiv = document.getElementById('transferAlert');
    const cuenta = document.getElementById('tf_cuenta_destino').value.trim();
    const monto = parseFloat(parseFloat(document.getElementById('tf_monto').value).toFixed(2));
    const concepto = document.getElementById('tf_concepto').value.trim();
    const tipo = document.getElementById('tf_tipo').value;

    alertDiv.className = 'hidden';
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Procesando...';

    try {
        const result = await API.transferir({
            cuenta_destino: cuenta,
            monto,
            concepto,
            tipo_transaccion: tipo
        });

        Logger.info('Transferencia', `Exitosa: ${result.referencia}`);
        document.getElementById('successAmount').textContent = formatCurrency(result.monto);
        document.getElementById('successRef').textContent = `REF: ${result.referencia || '-'}`;
        document.getElementById('successFecha').textContent = result.fecha_hora ? formatDateTime(result.fecha_hora) : formatDateTime(new Date());
        document.getElementById('successModal').classList.add('open');

        document.getElementById('transferForm').reset();
        document.getElementById('transferSummary').classList.add('hidden');
        ['tf_cuenta_destino', 'tf_monto', 'tf_concepto'].forEach(id => {
            document.getElementById(id)?.classList.remove('input-ok', 'input-fail');
        });
    } catch (err) {
        Logger.warn('Transferencia', `Rechazada: ${err.message}`);
        alertDiv.className = 'alert alert-danger';
        alertDiv.innerHTML = `<span>!</span><span>${escHtml(err.message)}</span>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar transferencia';
    }
}

async function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('open');
    await renderInicio();
}

async function cargarAdmin() {
    const user = getUser();
    if (user?.rol !== 'administrador') {
        showToast('Acceso denegado', 'error');
        return;
    }

    const tbody = document.getElementById('adminBody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:20px">Cargando...</td></tr>';
    document.getElementById('adminMovimientosBody').innerHTML =
        '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">Cargando...</td></tr>';

    try {
        const users = await API.adminCuentas();
        const bloqueados = users.filter(u => u.estado_usuario === 'bloqueado').length;
        const clientes = users.filter(u => u.rol === 'cliente').length;

        document.getElementById('adminContador').textContent = `${users.length} usuario(s) - ${clientes} cliente(s)`;
        document.getElementById('adminSubtitle').textContent =
            bloqueados > 0 ? `${bloqueados} cuenta(s) bloqueada(s) pendiente(s)` : 'Todas las cuentas estan activas';

        if (!users.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted" style="padding:20px">Sin datos</td></tr>';
            await cargarAdminMovimientos(1);
            return;
        }

        tbody.innerHTML = users.map(u => `<tr>
            <td>${u.usuario_id}</td>
            <td>${escHtml(u.nombre)} ${escHtml(u.apellido)}</td>
            <td style="font-size:.82rem">${escHtml(u.email)}</td>
            <td><span class="badge ${u.rol === 'administrador' ? 'badge-warning' : 'badge-info'}">${u.rol}</span></td>
            <td>
                <span class="badge ${u.estado_usuario === 'activo' ? 'badge-success' : 'badge-danger'}">${u.estado_usuario}</span>
                ${u.intentos_fallidos > 0 ? `<small class="text-muted" style="display:block;font-size:.7rem">${u.intentos_fallidos} intento(s)</small>` : ''}
            </td>
            <td class="font-mono" style="font-size:.78rem">${u.numero_cuenta ? formatCuentaMask(u.numero_cuenta) : '-'}</td>
            <td style="font-weight:700; color:var(--bbva-blue)">${u.saldo !== null ? formatCurrency(u.saldo) : '-'}</td>
            <td style="font-size:.78rem">${u.ultimo_acceso ? formatDateTime(u.ultimo_acceso) : 'Nunca'}</td>
            <td>
                ${u.estado_usuario === 'bloqueado'
                    ? `<button class="btn btn-success btn-sm" onclick="desbloquearUsuario(${u.usuario_id}, '${escHtml(u.email)}')">Reactivar</button>`
                    : '<span class="text-muted" style="font-size:.78rem">-</span>'}
            </td>
        </tr>`).join('');

        await cargarAdminMovimientos(1);
    } catch (err) {
        Logger.error('Admin', `Error cargarAdmin: ${err.message}`);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:20px">${escHtml(err.message)}</td></tr>`;
    }
}

async function cargarAdminMovimientos(page) {
    adminMovimientosPage = page;
    const tbody = document.getElementById('adminMovimientosBody');
    const info = document.getElementById('adminMovimientosInfo');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">Cargando...</td></tr>';

    try {
        const data = await API.adminTransferencias(page);
        const txs = data.transferencias || [];
        const pag = data.paginacion || { total_registros: txs.length, total_paginas: 1 };

        info.textContent = `${pag.total_registros} movimiento(s) - Pagina ${page} de ${pag.total_paginas || 1}`;

        if (!txs.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted" style="padding:20px">Sin movimientos</td></tr>';
            document.getElementById('adminMovimientosPaginacion').innerHTML = '';
            return;
        }

        tbody.innerHTML = txs.map(tx => {
            const origenNombre = tx.origen_nombre || 'Sin usuario';
            const destinoNombre = tx.destino_nombre || 'Sin usuario';
            return `<tr>
                <td style="font-size:.82rem; white-space:nowrap">${formatDateTime(tx.fecha_hora)}</td>
                <td>
                    <span style="font-weight:700">${escHtml(origenNombre)}</span>
                    <small class="text-muted font-mono" style="display:block;font-size:.72rem">${formatCuentaMask(tx.cuenta_origen)}</small>
                </td>
                <td>
                    <span style="font-weight:700">${escHtml(destinoNombre)}</span>
                    <small class="text-muted font-mono" style="display:block;font-size:.72rem">${formatCuentaMask(tx.cuenta_destino)}</small>
                </td>
                <td>${escHtml(tx.concepto)}</td>
                <td><span class="badge badge-info">${escHtml(tx.tipo_transaccion)}</span></td>
                <td class="tx-amount sent" style="white-space:nowrap">${formatCurrency(tx.monto)}</td>
                <td><span class="badge ${tx.estado === 'completada' ? 'badge-success' : 'badge-warning'}">${escHtml(tx.estado)}</span></td>
            </tr>`;
        }).join('');

        renderPaginacion(page, pag.total_paginas || 1, 'adminMovimientosPaginacion', 'cargarAdminMovimientos');
        Logger.debug('Admin', `Movimientos globales cargados: pagina ${page}`);
    } catch (err) {
        Logger.error('Admin', `Error cargarAdminMovimientos: ${err.message}`);
        info.textContent = '';
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:20px">${escHtml(err.message)}</td></tr>`;
    }
}

async function desbloquearUsuario(id, email) {
    const user = getUser();
    if (user?.rol !== 'administrador') {
        showToast('Solo el administrador puede desbloquear cuentas', 'error');
        return;
    }
    if (!confirm(`Reactivar la cuenta de ${email}?`)) return;

    try {
        await API.desbloquearUsuario(id);
        showToast('Cuenta reactivada exitosamente', 'success');
        await cargarAdmin();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function abrirModalNuevoUsuario() {
    const admin = getUser();
    if (!admin || admin.rol !== 'administrador') {
        showToast('Accion no autorizada', 'error');
        return;
    }

    document.getElementById('newUserForm').reset();
    document.getElementById('nuAlert').className = 'alert alert-danger hidden';
    document.getElementById('nuSubmitBtn').disabled = false;
    document.getElementById('nuSubmitBtn').textContent = 'Crear usuario';
    document.getElementById('nu_previewCuenta').textContent = 'Se asignara al guardar';

    const pwdEl = document.getElementById('nu_password');
    const toggleBtn = document.getElementById('nu_togglePwd');
    toggleBtn.onclick = () => {
        const hide = pwdEl.type === 'text';
        pwdEl.type = hide ? 'password' : 'text';
        toggleBtn.textContent = hide ? 'Ver' : 'Ocultar';
    };

    document.getElementById('newUserModal').classList.add('open');
}

function cerrarModalNuevoUsuario() {
    document.getElementById('newUserModal').classList.remove('open');
}

async function procesarNuevoUsuario() {
    const btn = document.getElementById('nuSubmitBtn');
    const alertDiv = document.getElementById('nuAlert');
    alertDiv.className = 'alert alert-danger hidden';

    const nombre = document.getElementById('nu_nombre').value.trim();
    const apellido = document.getElementById('nu_apellido').value.trim();
    const email = document.getElementById('nu_email').value.trim().toLowerCase();
    const password = document.getElementById('nu_password').value;

    function showError(msg) {
        document.getElementById('nuAlertMsg').textContent = msg;
        alertDiv.className = 'alert alert-danger';
        btn.disabled = false;
        btn.textContent = 'Crear usuario';
    }

    if (!nombre) return showError('El nombre es requerido.');
    if (!apellido) return showError('El apellido es requerido.');
    if (!email) return showError('El correo electronico es requerido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('Correo electronico invalido.');

    const erroresPwd = _validarPwdRules(password);
    if (erroresPwd.length) return showError(`Contrasena invalida: ${erroresPwd.join(', ')}.`);

    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Creando...';

    try {
        const result = await API.crearUsuario({ nombre, apellido, email, password });
        showToast(`Usuario creado. Cuenta: ${formatCuentaMask(result.cuenta.numero_cuenta)}`, 'success', 5000);
        cerrarModalNuevoUsuario();
        await cargarAdmin();
    } catch (err) {
        showError(err.message);
    }
}

function _validarPwdRules(pwd) {
    const e = [];
    if (pwd.length < 5 || pwd.length > 8) e.push('5-8 caracteres');
    if (!/[A-Z]/.test(pwd)) e.push('mayuscula');
    if (!/[0-9]/.test(pwd)) e.push('numero');
    if (!/[^A-Za-z0-9]/.test(pwd)) e.push('caracter especial');
    return e;
}

function renderPaginacion(actual, total, containerId, callbackName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (total <= 1) {
        container.innerHTML = '';
        return;
    }

    const btn = (page, label, disabled, active) =>
        `<button ${disabled ? 'disabled' : ''} ${active ? 'class="active"' : ''}
            onclick="${callbackName}(${page})">${label}</button>`;

    let html = btn(actual - 1, '<', actual === 1, false);
    for (let i = 1; i <= total; i++) html += btn(i, i, false, i === actual);
    html += btn(actual + 1, '>', actual === total, false);
    container.innerHTML = html;
}
