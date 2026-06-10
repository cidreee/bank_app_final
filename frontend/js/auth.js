/* Lógica de autenticación — login.html (modo localStorage) */

(function () {
    // Si ya hay sesión activa, ir al dashboard
    if (getToken()) { window.location.href = 'dashboard.html'; return; }

    const form      = document.getElementById('loginForm');
    const usuarioEl = document.getElementById('usuario');
    const pwdEl     = document.getElementById('password');
    const alertBox  = document.getElementById('loginAlert');
    const alertMsg  = document.getElementById('loginAlertMsg');
    const toggleBtn = document.getElementById('togglePwd');
    const loginBtn  = document.getElementById('loginBtn');
    const attemptsW = document.getElementById('attemptsWarning');

    const MAX_INTENTOS = 3;

    toggleBtn.addEventListener('click', () => {
        const isText = pwdEl.type === 'text';
        pwdEl.type   = isText ? 'password' : 'text';
        toggleBtn.textContent = isText ? '👁' : '🙈';
    });

    function showAlert(msg) {
        alertMsg.textContent  = msg;
        alertBox.style.display = 'flex';
    }
    function hideAlert() { alertBox.style.display = 'none'; }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        hideAlert();
        attemptsW.style.display = 'none';

        const usuarioVal = usuarioEl.value.trim().toLowerCase();
        const passwordVal = pwdEl.value;

        if (!usuarioVal || !passwordVal) {
            showAlert('Por favor completa todos los campos.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loader"></span> Verificando...';

        // Pequeño delay artificial para simular red
        setTimeout(() => {
            try {
                const user = DB.getUserByUsuario(usuarioVal);

                if (!user) {
                    showAlert('Credenciales inválidas.');
                    resetBtn();
                    return;
                }

                if (user.estado === 'bloqueado') {
                    showAlert('Cuenta bloqueada. Contacte al administrador.');
                    resetBtn();
                    return;
                }

                if (user.password !== passwordVal) {
                    const nuevosIntentos = user.intentos_fallidos + 1;

                    if (nuevosIntentos > MAX_INTENTOS) {
                        DB.updateUser(user.id, { intentos_fallidos: nuevosIntentos, estado: 'bloqueado' });
                        showAlert('Cuenta bloqueada por múltiples intentos fallidos. Contacte al administrador.');
                    } else {
                        DB.updateUser(user.id, { intentos_fallidos: nuevosIntentos });
                        const restantes = MAX_INTENTOS - nuevosIntentos + 1;
                        const msg = `Credenciales inválidas. Te quedan ${restantes} intento(s).`;
                        showAlert(msg);
                        attemptsW.style.display = 'block';
                        attemptsW.textContent   = `⚠ ${msg}`;
                    }

                    pwdEl.value = '';
                    pwdEl.focus();
                    resetBtn();
                    return;
                }

                // ---- Login exitoso ----
                DB.updateUser(user.id, { intentos_fallidos: 0, ultimo_acceso: new Date().toISOString() });
                setSession(user.id);

                showToast(`Bienvenido, ${user.nombre}`, 'success', 2000);
                setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);

            } catch {
                showAlert('Error, consulte al administrador');
                resetBtn();
            }
        }, 400);

        function resetBtn() {
            loginBtn.disabled    = false;
            loginBtn.textContent = 'Ingresar';
        }
    });
})();
