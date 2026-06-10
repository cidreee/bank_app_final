/* ============================================================
   BBVA Fake — register.js
   Registro de nuevos usuarios clientes
   ============================================================ */

dbReady.then(() => {
    if (getToken()) {
        window.location.href = 'dashboard.html';
        return;
    }
    Logger.info('Register', 'Página de registro lista');
    _setupForm();
}).catch(err => {
    Logger.error('Register', 'Error al inicializar registro', err.message);
});

function _setupForm() {
    const pwdEl     = document.getElementById('reg_password');
    const confirmEl = document.getElementById('reg_confirm');
    const usuarioEl = document.getElementById('reg_usuario');
    const toggleBtn = document.getElementById('togglePwd');
    const form      = document.getElementById('registerForm');

    toggleBtn?.addEventListener('click', () => {
        const hide = pwdEl.type === 'text';
        pwdEl.type      = hide ? 'password' : 'text';
        confirmEl.type  = hide ? 'password' : 'text';
        toggleBtn.textContent = hide ? '👁' : '🙈';
    });

    // Reglas en tiempo real
    pwdEl?.addEventListener('input', () => {
        const v = pwdEl.value;
        _setRule('rule-len',     v.length >= 5 && v.length <= 8);
        _setRule('rule-upper',   /[A-Z]/.test(v));
        _setRule('rule-num',     /[0-9]/.test(v));
        _setRule('rule-special', /[^A-Za-z0-9]/.test(v));
        if (confirmEl.value) _checkConfirm();
    });

    confirmEl?.addEventListener('input', _checkConfirm);

    // Solo alfanumérico + guión bajo, forzar minúsculas
    usuarioEl?.addEventListener('input', function () {
        this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await _procesarRegistro();
    });
}

function _setRule(id, ok) {
    const el  = document.getElementById(id);
    const pwd = document.getElementById('reg_password');
    if (!el) return;
    const filled = pwd && pwd.value.length > 0;
    el.classList.toggle('ok',  ok && filled);
    el.classList.toggle('bad', !ok && filled);
}

function _checkConfirm() {
    const pwd     = document.getElementById('reg_password').value;
    const confirm = document.getElementById('reg_confirm').value;
    const errEl   = document.getElementById('err_confirm');
    errEl?.classList.toggle('visible', confirm.length > 0 && confirm !== pwd);
}

function _validarPassword(pwd) {
    const e = [];
    if (pwd.length < 5 || pwd.length > 8) e.push('longitud entre 5 y 8 caracteres');
    if (!/[A-Z]/.test(pwd))               e.push('al menos una mayúscula');
    if (!/[0-9]/.test(pwd))               e.push('al menos un número');
    if (!/[^A-Za-z0-9]/.test(pwd))        e.push('al menos un carácter especial');
    return e;
}

async function _procesarRegistro() {
    const btn      = document.getElementById('registerBtn');
    const alertDiv = document.getElementById('registerAlert');
    alertDiv.style.display = 'none';

    const nombre   = document.getElementById('reg_nombre').value.trim();
    const apellido = document.getElementById('reg_apellido').value.trim();
    const email    = document.getElementById('reg_email').value.trim().toLowerCase();
    const usuario  = document.getElementById('reg_usuario').value.trim();
    const password = document.getElementById('reg_password').value;
    const confirm  = document.getElementById('reg_confirm').value;

    function showError(msg) {
        document.getElementById('registerAlertMsg').textContent = msg;
        alertDiv.style.display = 'flex';
        btn.disabled    = false;
        btn.textContent = 'Crear mi cuenta';
        Logger.warn('Register', `Registro rechazado: ${msg}`);
    }

    // ── Validaciones ──────────────────────────────────────────────────────────
    if (!nombre)   return showError('El nombre es requerido.');
    if (!apellido) return showError('El apellido es requerido.');

    if (!usuario || usuario.length < 3)
        return showError('El usuario debe tener al menos 3 caracteres.');
    if (!/^[a-z0-9_]+$/.test(usuario))
        return showError('El usuario solo puede contener letras, números y guión bajo.');

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return showError('El correo electrónico no tiene un formato válido.');

    const erroresPwd = _validarPassword(password);
    if (erroresPwd.length)
        return showError(`Contraseña inválida: ${erroresPwd.join(', ')}.`);

    if (password !== confirm)
        return showError('Las contraseñas no coinciden.');

    if (DB.getUserByUsuario(usuario))
        return showError(`El usuario "${usuario}" ya está registrado. Elige otro nombre.`);

    // ── Crear usuario — el número de cuenta se genera aquí, no antes ─────────
    btn.disabled  = true;
    btn.innerHTML = '<span class="loader"></span> Creando cuenta...';

    try {
        // El número se genera en este momento, justo antes de persistir
        const numeroCuenta = DB.generarNumeroCuenta();

        const result = await DB.createUser({
            nombre, apellido, email, usuario, password, numeroCuenta
        });

        Logger.info('Register', `Registro exitoso: ${usuario}`, `cuenta: ${result.cuenta.numero_cuenta}`);

        // Mostrar pantalla de éxito con el número ya asignado
        document.getElementById('registerForm').style.display = 'none';
        alertDiv.style.display = 'none';
        document.getElementById('successNombre').textContent =
            `Bienvenido, ${nombre} ${apellido}. Tu cuenta está lista.`;
        document.getElementById('successNumeroCuenta').textContent =
            formatCuentaMask(result.cuenta.numero_cuenta);
        const loginUrl = `login.html?registered=${encodeURIComponent(usuario)}`;
        document.getElementById('btnIrLogin').href = loginUrl;
        document.getElementById('successScreen').style.display = 'block';

    } catch (err) {
        Logger.error('Register', 'Error al crear usuario', err.message);
        showError(err.message || 'Error al crear la cuenta. Intenta de nuevo.');
    }
}
