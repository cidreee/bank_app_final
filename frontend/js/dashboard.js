/* ============================================================
   BBVA Fake — dashboard.js
   BA-21 a BA-31 (Transferencias)
   BA-11 (Desbloqueo de cuentas — admin)
   ============================================================ */

const MONTO_MIN  = 500;
const LIMITE_DIA = 7000;
const SALDO_MAX  = 50000;

let historialPage = 1;

// ---- Guardar session check ----
if (!requireAuth()) { /* redirigido por requireAuth */ }

// ---- Arrancar SOLO cuando la DB esté lista ----
dbReady.then(() => {
    const user = getUser();
    if (!user) { logout(); return; }

    Logger.info('Dashboard', `Sesión activa: ${user.usuario} (${user.rol})`);

    renderUserInfo(user);
    setTodayDate();
    setupNav(user);

    if (user.rol === 'administrador') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        document.getElementById('balanceCard')?.classList.add('hidden');
        document.getElementById('statsGrid')?.classList.add('hidden');
        navigateTo('admin', user);
    } else {
        navigateTo('inicio', user);
    }

    setupTransferForm(user);
}).catch(err => {
    Logger.error('Dashboard', 'Error al inicializar dashboard', err.message);
    showToast('Error al cargar. Recarga la página.', 'error');
});

// ---- Navbar ----
function renderUserInfo(user) {
    document.getElementById('navUserName').textContent =
        `${user.nombre} ${user.apellido}`;
    document.getElementById('navUserRole').textContent =
        user.rol === 'administrador' ? 'Administrador' : 'Cliente';
    document.getElementById('navAvatar').textContent =
        user.nombre.charAt(0).toUpperCase();
    document.getElementById('welcomeTitle').textContent = `Hola, ${user.nombre}`;
}

function setTodayDate() {
    document.getElementById('todayDate').textContent =
        new Date().toLocaleDateString('es-MX', {
            weekday:'long', year:'numeric', month:'long', day:'numeric'
        });
}

// ---- Navegación sidebar ----
function setupNav(user) {
    document.querySelectorAll('[data-section]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(link.dataset.section, user);
        });
    });
}

function navigateTo(section, user) {
    user = user || getUser();

    // BA-14 [RNF-02]: bloquear acceso a admin para roles no autorizados
    if (section === 'admin' && user?.rol !== 'administrador') {
        Logger.error('AccessControl', `BA-14: acceso a panel admin denegado para ${user?.usuario} (rol: ${user?.rol})`);
        section = 'inicio';
    }

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));

    const el = document.getElementById(`section-${section}`);
    if (el) el.classList.add('active');
    document.querySelectorAll(`[data-section="${section}"]`).forEach(a => a.classList.add('active'));

    Logger.debug('Dashboard', `Navegando a sección: ${section}`);

    if (section === 'inicio')    renderInicio(user);
    if (section === 'historial') cargarHistorial(1);
    if (section === 'admin')     cargarAdmin();
}

// ---- Refrescar (botón manual) ----
function refrescarDatos() {
    const user = getUser();
    const btn  = document.getElementById('btnRefrescar');
    btn.disabled  = true;
    btn.innerHTML = '<span class="loader" style="border-top-color:var(--bbva-blue)"></span> Actualizando...';
    Logger.info('Dashboard', 'Refresco manual solicitado');
    setTimeout(() => {
        renderInicio(user);
        btn.disabled  = false;
        btn.innerHTML = '🔄 Refrescar pantalla';
        showToast('Pantalla actualizada', 'success', 1800);
    }, 500);
}

// ---- Sección Inicio ----
function renderInicio(user) {
    const cuenta = DB.getCuentaByUsuario(user.id);
    if (!cuenta) {
        Logger.warn('Dashboard', `Usuario ${user.usuario} no tiene cuenta asociada`);
        return;
    }

    document.getElementById('saldoDisplay').textContent        = formatCurrency(cuenta.saldo);
    document.getElementById('numeroCuentaDisplay').textContent = formatCuentaMask(cuenta.numero_cuenta);

    const enviado    = DB.getTotalEnviadoHoy(cuenta.numero_cuenta);
    const disponible = Math.max(0, LIMITE_DIA - enviado);
    const hoy        = new Date().toDateString();

    const recibidoHoy = DB.getTransfers()
        .filter(t => t.cuenta_destino === cuenta.numero_cuenta
                  && t.estado === 'completada'
                  && new Date(t.fecha_hora).toDateString() === hoy)
        .reduce((s, t) => s + t.monto, 0);

    document.getElementById('statEnviado').textContent    = formatCurrency(enviado);
    document.getElementById('statRecibido').textContent   = formatCurrency(recibidoHoy);
    document.getElementById('statDisponible').textContent = formatCurrency(disponible);

    const pct  = Math.min(100, (enviado / LIMITE_DIA) * 100);
    const fill = document.getElementById('limiteDiarioFill');
    fill.style.width      = pct + '%';
    fill.style.background = pct > 80 ? 'var(--bbva-danger)'
                          : pct > 50 ? 'var(--bbva-warning)'
                          :            'var(--bbva-blue-light)';

    renderMovimientosRecientes(cuenta.numero_cuenta);
    Logger.debug('Dashboard', `Inicio renderizado: saldo ${formatCurrency(cuenta.saldo)}, enviado hoy ${formatCurrency(enviado)}`);
}

function renderMovimientosRecientes(numeroCuenta) {
    const list = document.getElementById('recentTxList');
    const { list: txs } = DB.getTransfersByCuenta(numeroCuenta, 1, 5);

    if (!txs.length) {
        list.innerHTML = '<li class="text-muted text-center" style="padding:20px">Sin movimientos registrados</li>';
        return;
    }

    list.innerHTML = txs.map(tx => {
        const enviada    = tx.cuenta_origen === numeroCuenta;
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

// ---- Historial paginado (BA-35 / BA-119 / BA-120 / BA-121 / BA-122 / BA-123) ----
// BA-119: Muestra 5 transferencias por página
// BA-120: Ordenadas de más reciente a más antigua
// BA-123: SIN filtros (diseño de solo-lectura)
function cargarHistorial(page) {
    const user = getUser();
    if (!user) return;
    historialPage = page;
    const cuenta = DB.getCuentaByUsuario(user.id);
    const tbody  = document.getElementById('historialBody');

    if (!cuenta) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:20px">Sin cuenta asociada</td></tr>';
        return;
    }

    const { list: txs, total, totalPages } = DB.getTransfersByCuenta(cuenta.numero_cuenta, page, 5);

    document.getElementById('historialInfo').textContent =
        `${total} movimiento(s) · Página ${page} de ${totalPages}`;

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

    // BA-120: paginación de 5 en 5, ordenado de más reciente a más antiguo
    renderPaginacion(page, totalPages, 'historialPaginacion', 'cargarHistorial');
    Logger.debug('Dashboard', `Historial cargado: página ${page}/${totalPages}, ${txs.length} registros`);
}

// ---- Formulario de transferencias ----
function setupTransferForm(user) {
    const tfCuenta  = document.getElementById('tf_cuenta_destino');
    const tfMonto   = document.getElementById('tf_monto');
    const tfConcepto= document.getElementById('tf_concepto');
    const form      = document.getElementById('transferForm');
    if (!form) return;

    // BA-79: Validación en tiempo real — número de cuenta (16 dígitos)
    tfCuenta?.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '');
        const ok = this.value.length === 16;
        this.classList.toggle('input-ok',   ok);
        this.classList.toggle('input-fail', !ok && this.value.length > 0);
        document.getElementById('err_cuenta').classList.toggle('visible', !ok && this.value.length > 0);
    });

    // BA-84: Validación en tiempo real — monto mínimo
    tfMonto?.addEventListener('input', function () {
        const v  = parseFloat(this.value);
        const ok = !isNaN(v) && v >= MONTO_MIN;
        this.classList.toggle('input-ok',   ok);
        this.classList.toggle('input-fail', !ok && this.value.length > 0);
        document.getElementById('err_monto').classList.toggle('visible', !ok && this.value.length > 0);
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        _procesarTransferencia(user, tfCuenta, tfMonto, tfConcepto);
    });
}

// Exponer para el botón "Vista previa"
function previewTransfer() {
    const cuenta   = document.getElementById('tf_cuenta_destino')?.value || '';
    const monto    = parseFloat(document.getElementById('tf_monto')?.value) || 0;
    const concepto = document.getElementById('tf_concepto')?.value || '';
    const tipo     = document.getElementById('tf_tipo')?.value || 'transferencia';

    if (!cuenta || !monto || !concepto) {
        showToast('Completa todos los campos antes de la vista previa', 'warning');
        return;
    }
    document.getElementById('sumCuenta').textContent   = formatCuentaMask(cuenta);
    document.getElementById('sumConcepto').textContent = escHtml(concepto);
    document.getElementById('sumTipo').textContent     = tipo;
    document.getElementById('sumMonto').textContent    = formatCurrency(monto);
    document.getElementById('transferSummary').classList.remove('hidden');
    Logger.debug('Dashboard', 'Vista previa de transferencia mostrada');
}

function _procesarTransferencia(user, tfCuenta, tfMonto, tfConcepto) {
    const btn      = document.getElementById('btnTransfer');
    const alertDiv = document.getElementById('transferAlert');
    const cuenta   = tfCuenta.value.trim();
    // BA-126: monto siempre con exactamente 2 decimales
    const monto    = parseFloat(parseFloat(tfMonto.value).toFixed(2));
    const concepto = tfConcepto.value.trim();
    const tipo     = document.getElementById('tf_tipo').value;

    alertDiv.className = 'hidden';

    function showError(msg, nivel = 'danger') {
        alertDiv.className = `alert alert-${nivel}`;
        alertDiv.innerHTML = `<span>⚠</span><span>${escHtml(msg)}</span>`;
        btn.disabled    = false;
        btn.textContent = 'Confirmar transferencia';
        Logger.warn('Transferencia', `Rechazada: ${msg}`, { cuenta, monto });
    }

    // ── Validaciones de entrada ──────────────────────────────────────────────
    // BA-79: formulario completo
    if (!cuenta || !monto || !concepto) return showError('Todos los campos son requeridos');

    // BA-24 / BA-88: 16 dígitos
    if (cuenta.length !== 16) return showError('El número de cuenta debe tener exactamente 16 dígitos');

    // BA-82: monto mínimo $500
    if (isNaN(monto) || monto < MONTO_MIN)
        return showError(`El monto mínimo de transferencia es ${formatCurrency(MONTO_MIN)}`);

    btn.disabled    = true;
    btn.innerHTML   = '<span class="loader"></span> Procesando...';
    Logger.info('Transferencia', `Iniciando: ${user.usuario} → ${cuenta}, monto $${monto}`);

    // Pequeño delay para simular procesamiento
    setTimeout(() => {
        // ── Validaciones de negocio ───────────────────────────────────────────
        const cuentaOrigen = DB.getCuentaByUsuario(user.id);
        if (!cuentaOrigen) return showError('Cuenta origen no encontrada');
        if (cuentaOrigen.estado !== 'activa') return showError('Su cuenta se encuentra inactiva');

        // No transferirse a sí mismo
        if (cuentaOrigen.numero_cuenta === cuenta)
            return showError('No puede transferir a su propia cuenta');

        // BA-24 / BA-88 / BA-89: cuenta destino existe
        const cuentaDestino = DB.getCuentaByNumero(cuenta);
        if (!cuentaDestino) return showError('Cuenta inexistente');
        if (cuentaDestino.estado !== 'activa')
            return showError('La cuenta destino no está activa');

        // BA-23 / BA-85 / BA-87: fondos suficientes
        if (cuentaOrigen.saldo < monto) return showError('Fondos insuficientes');

        // BA-25 / BA-92 / BA-93: límite de saldo destino
        if (cuentaDestino.saldo + monto > SALDO_MAX)
            return showError(`La cuenta destino alcanzaría el límite máximo de ${formatCurrency(SALDO_MAX)}`);

        // BA-22 / BA-82: límite diario
        const totalHoy = DB.getTotalEnviadoHoy(cuentaOrigen.numero_cuenta);
        if (totalHoy + monto > LIMITE_DIA) {
            const disponible = LIMITE_DIA - totalHoy;
            return showError(`Límite diario excedido. Disponible hoy: ${formatCurrency(Math.max(0, disponible))}`);
        }

        // ── BA-81: Ejecutar transferencia ────────────────────────────────────
        DB.updateCuenta(cuentaOrigen.numero_cuenta, {
            saldo: +(cuentaOrigen.saldo - monto).toFixed(2)
        });
        DB.updateCuenta(cuentaDestino.numero_cuenta, {
            saldo: +(cuentaDestino.saldo + monto).toFixed(2)
        });

        // BA-98: registrar como operación permanente (estado: completada)
        const tx = DB.addTransfer({
            cuenta_origen:    cuentaOrigen.numero_cuenta,
            cuenta_destino:   cuentaDestino.numero_cuenta,
            monto,
            concepto,
            tipo_transaccion: tipo,
            fecha_hora:       new Date().toISOString(),
            estado:           'completada',          // BA-98: permanente
            referencia:       'REF' + Date.now()
        });

        Logger.info('Transferencia', `Exitosa #${tx.id}: $${monto} → ${cuenta}`, tx.referencia);

        // BA-94 / BA-95: mostrar mensaje de éxito SOLO cuando sea correcta
        document.getElementById('successAmount').textContent = formatCurrency(monto);
        document.getElementById('successRef').textContent    = tx.referencia;
        document.getElementById('successFecha').textContent  = formatDateTime(tx.fecha_hora);
        document.getElementById('successModal').classList.add('open');

        // Limpiar formulario
        document.getElementById('transferForm').reset();
        document.getElementById('transferSummary').classList.add('hidden');
        ['tf_cuenta_destino','tf_monto','tf_concepto'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('input-ok', 'input-fail');
        });

        btn.disabled    = false;
        btn.textContent = 'Confirmar transferencia';
    }, 600);
}

// BA-94: modal de éxito — BA-96: sin comprobante descargable, BA-97: sin opción de cancelar
function closeSuccessModal() {
    document.getElementById('successModal').classList.remove('open');
    const user = getUser();
    renderInicio(user);
    Logger.debug('Dashboard', 'Modal de éxito cerrado');
}

// ---- Panel Admin (BA-11 / BA-64 / BA-65 / BA-66) ----
function cargarAdmin() {
    // BA-14 [RNF-02]: verificar rol antes de mostrar datos
    const currentUser = getUser();
    if (!currentUser || currentUser.rol !== 'administrador') {
        Logger.error('AccessControl', `BA-14: acceso a cargarAdmin denegado para ${currentUser?.usuario}`);
        showToast('Acceso denegado', 'error');
        return;
    }

    Logger.info('Admin', 'Panel de administración cargado');
    const tbody   = document.getElementById('adminBody');
    // BA-13 [RNF-01]: usar getUsersPublic para nunca exponer password_hash
    const users   = DB.getUsersPublic();
    const cuentas = DB.getCuentas();

    const totalClientes  = users.filter(u => u.rol === 'cliente').length;
    const bloqueados     = users.filter(u => u.estado === 'bloqueado').length;
    const contador       = document.getElementById('adminContador');
    const subtitle       = document.getElementById('adminSubtitle');
    if (contador) contador.textContent = `${users.length} usuario(s) · ${totalClientes} cliente(s)`;
    if (subtitle) subtitle.textContent =
        bloqueados > 0
            ? `${bloqueados} cuenta(s) bloqueada(s) pendiente(s) de reactivación`
            : 'Todas las cuentas están activas';

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
                    ? `<button class="btn btn-success btn-sm" onclick="desbloquearUsuario(${u.id}, '${escHtml(u.usuario)}')">🔓 Reactivar</button>`
                    : '<span class="text-muted" style="font-size:.78rem">—</span>'}
            </td>
        </tr>`;
    }).join('');
}

// BA-65 / BA-66: solo admin puede desbloquear
function desbloquearUsuario(id, usuarioNombre) {
    const currentUser = getUser();
    if (currentUser.rol !== 'administrador') {
        Logger.error('Admin', `Intento no autorizado de desbloqueo por: ${currentUser.usuario}`);
        showToast('Solo el administrador puede desbloquear cuentas', 'error');
        return;
    }
    if (!confirm(`¿Reactivar la cuenta de "${usuarioNombre}"?`)) return;

    DB.updateUser(id, { estado: 'activo', intentos_fallidos: 0 });
    Logger.info('Admin', `Cuenta reactivada por ${currentUser.usuario}: usuario id=${id} (${usuarioNombre})`);
    showToast('Cuenta reactivada exitosamente', 'success');
    cargarAdmin();
}

// ---- Modal: Nuevo usuario (admin) ----
function abrirModalNuevoUsuario() {
    const admin = getUser();
    if (!admin || admin.rol !== 'administrador') {
        Logger.error('AccessControl', `BA-14: acceso a crear usuario denegado para ${admin?.usuario} (rol: ${admin?.rol})`);
        showToast('Acción no autorizada', 'error');
        return;
    }

    // Limpiar form
    document.getElementById('newUserForm').reset();
    document.getElementById('nuAlert').className = 'alert alert-danger hidden';
    document.getElementById('nuSubmitBtn').disabled = false;
    document.getElementById('nuSubmitBtn').textContent = 'Crear usuario';

    // Toggle contraseña
    const pwdEl     = document.getElementById('nu_password');
    const toggleBtn = document.getElementById('nu_togglePwd');
    toggleBtn.onclick = () => {
        const hide = pwdEl.type === 'text';
        pwdEl.type = hide ? 'password' : 'text';
        toggleBtn.textContent = hide ? '👁' : '🙈';
    };

    // Forzar solo alfanumérico en usuario
    const usuarioEl = document.getElementById('nu_usuario');
    usuarioEl.oninput = function () {
        this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    };

    // Generar preview de cuenta
    const preview = DB.generarNumeroCuenta();
    document.getElementById('nu_previewCuenta').dataset.numero = preview;
    document.getElementById('nu_previewCuenta').textContent = formatCuentaMask(preview);

    document.getElementById('newUserModal').classList.add('open');
    Logger.debug('Admin', 'Modal nuevo usuario abierto');
}

function cerrarModalNuevoUsuario() {
    document.getElementById('newUserModal').classList.remove('open');
}

async function procesarNuevoUsuario() {
    const btn      = document.getElementById('nuSubmitBtn');
    const alertDiv = document.getElementById('nuAlert');
    alertDiv.className = 'alert alert-danger hidden';

    const nombre   = document.getElementById('nu_nombre').value.trim();
    const apellido = document.getElementById('nu_apellido').value.trim();
    const email    = document.getElementById('nu_email').value.trim().toLowerCase();
    const usuario  = document.getElementById('nu_usuario').value.trim();
    const password = document.getElementById('nu_password').value;
    const numero   = document.getElementById('nu_previewCuenta').dataset.numero;

    function showError(msg) {
        document.getElementById('nuAlertMsg').textContent = msg;
        alertDiv.className = 'alert alert-danger';
        btn.disabled    = false;
        btn.textContent = 'Crear usuario';
        Logger.warn('Admin', `Creación de usuario rechazada: ${msg}`, { usuario });
    }

    if (!nombre)   return showError('El nombre es requerido.');
    if (!apellido) return showError('El apellido es requerido.');
    if (!usuario || usuario.length < 3)
        return showError('El usuario debe tener al menos 3 caracteres.');
    if (!/^[a-z0-9_]+$/.test(usuario))
        return showError('El usuario solo puede contener letras, números y guión bajo.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return showError('Correo electrónico con formato inválido.');

    const erroresPwd = _validarPwdRules(password);
    if (erroresPwd.length)
        return showError(`Contraseña inválida: ${erroresPwd.join(', ')}.`);
    if (DB.getUserByUsuario(usuario))
        return showError(`El usuario "${usuario}" ya existe.`);

    btn.disabled  = true;
    btn.innerHTML = '<span class="loader"></span> Creando...';

    try {
        const result = await DB.createUser({ nombre, apellido, email, usuario, password, numeroCuenta: numero });
        Logger.info('Admin', `Usuario creado por admin: ${usuario}`, `cuenta: ${result.cuenta.numero_cuenta}`);
        showToast(`Usuario "${usuario}" creado. Cuenta: ${formatCuentaMask(result.cuenta.numero_cuenta)}`, 'success', 5000);
        cerrarModalNuevoUsuario();
        cargarAdmin();
    } catch (err) {
        Logger.error('Admin', 'Error al crear usuario', err.message);
        showError(err.message || 'Error al crear el usuario.');
    }
}

function _validarPwdRules(pwd) {
    const e = [];
    if (pwd.length < 5 || pwd.length > 8) e.push('5–8 caracteres');
    if (!/[A-Z]/.test(pwd))               e.push('mayúscula');
    if (!/[0-9]/.test(pwd))               e.push('número');
    if (!/[^A-Za-z0-9]/.test(pwd))        e.push('carácter especial');
    return e;
}

// ---- Paginación genérica ----
// callbackName: nombre de función global como string, ej. 'cargarHistorial'
function renderPaginacion(actual, total, containerId, callbackName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (total <= 1) { container.innerHTML = ''; return; }

    const btn = (page, label, disabled, active) =>
        `<button ${disabled ? 'disabled' : ''} ${active ? 'class="active"' : ''}
            onclick="${callbackName}(${page})">${label}</button>`;

    let html = btn(actual - 1, '‹', actual === 1, false);
    for (let i = 1; i <= total; i++) {
        html += btn(i, i, false, i === actual);
    }
    html += btn(actual + 1, '›', actual === total, false);
    container.innerHTML = html;
}
