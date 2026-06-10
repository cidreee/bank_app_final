/* ============================================================
   Public client registration through backend API.
   ============================================================ */

if (getToken()) {
    window.location.href = 'dashboard.html';
} else {
    Logger.info('Register', 'Pagina de registro lista');
    _setupForm();
}

function _setupForm() {
    const pwdEl = document.getElementById('reg_password');
    const confirmEl = document.getElementById('reg_confirm');
    const toggleBtn = document.getElementById('togglePwd');
    const form = document.getElementById('registerForm');

    toggleBtn?.addEventListener('click', () => {
        const hide = pwdEl.type === 'text';
        pwdEl.type = hide ? 'password' : 'text';
        confirmEl.type = hide ? 'password' : 'text';
        toggleBtn.textContent = hide ? 'Ver' : 'Ocultar';
    });

    pwdEl?.addEventListener('input', () => {
        const v = pwdEl.value;
        _setRule('rule-len', v.length >= 5 && v.length <= 8);
        _setRule('rule-upper', /[A-Z]/.test(v));
        _setRule('rule-num', /[0-9]/.test(v));
        _setRule('rule-special', /[^A-Za-z0-9]/.test(v));
        if (confirmEl.value) _checkConfirm();
    });

    confirmEl?.addEventListener('input', _checkConfirm);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await _procesarRegistro();
    });
}

function _setRule(id, ok) {
    const el = document.getElementById(id);
    const pwd = document.getElementById('reg_password');
    if (!el) return;
    const filled = pwd && pwd.value.length > 0;
    el.classList.toggle('ok', ok && filled);
    el.classList.toggle('bad', !ok && filled);
}

function _checkConfirm() {
    const pwd = document.getElementById('reg_password').value;
    const confirm = document.getElementById('reg_confirm').value;
    const errEl = document.getElementById('err_confirm');
    errEl?.classList.toggle('visible', confirm.length > 0 && confirm !== pwd);
}

function _validarPassword(pwd) {
    const e = [];
    if (pwd.length < 5 || pwd.length > 8) e.push('longitud entre 5 y 8 caracteres');
    if (!/[A-Z]/.test(pwd)) e.push('al menos una mayuscula');
    if (!/[0-9]/.test(pwd)) e.push('al menos un numero');
    if (!/[^A-Za-z0-9]/.test(pwd)) e.push('al menos un caracter especial');
    return e;
}

async function _procesarRegistro() {
    const btn = document.getElementById('registerBtn');
    const alertDiv = document.getElementById('registerAlert');
    alertDiv.style.display = 'none';

    const nombre = document.getElementById('reg_nombre').value.trim();
    const apellido = document.getElementById('reg_apellido').value.trim();
    const email = document.getElementById('reg_email').value.trim().toLowerCase();
    const password = document.getElementById('reg_password').value;
    const confirm = document.getElementById('reg_confirm').value;

    function showError(msg) {
        document.getElementById('registerAlertMsg').textContent = msg;
        alertDiv.style.display = 'flex';
        btn.disabled = false;
        btn.textContent = 'Crear mi cuenta';
        Logger.warn('Register', `Registro rechazado: ${msg}`);
    }

    if (!nombre) return showError('El nombre es requerido.');
    if (!apellido) return showError('El apellido es requerido.');
    if (!email) return showError('El correo electronico es requerido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('El correo electronico no tiene un formato valido.');

    const erroresPwd = _validarPassword(password);
    if (erroresPwd.length) return showError(`Contrasena invalida: ${erroresPwd.join(', ')}.`);
    if (password !== confirm) return showError('Las contrasenas no coinciden.');

    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Creando cuenta...';

    try {
        const result = await API.registerCliente({ nombre, apellido, email, password });
        Logger.info('Register', `Registro exitoso: ${email}`, `cuenta: ${result.cuenta.numero_cuenta}`);

        document.getElementById('registerForm').style.display = 'none';
        alertDiv.style.display = 'none';
        document.getElementById('successNombre').textContent =
            `Bienvenido, ${nombre} ${apellido}. Tu cuenta esta lista.`;
        document.getElementById('successNumeroCuenta').textContent =
            formatCuentaMask(result.cuenta.numero_cuenta);
        document.getElementById('btnIrLogin').href = `login.html?registered=${encodeURIComponent(email)}`;
        document.getElementById('successScreen').style.display = 'block';
    } catch (err) {
        Logger.error('Register', 'Error al crear usuario', err.message);
        showError(err.message || 'Error al crear la cuenta. Intenta de nuevo.');
    }
}
