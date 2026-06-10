/* ============================================================
   Login against backend API and SQL-backed users.
   ============================================================ */

if (getToken()) {
    Logger.info('Auth', 'Sesion existente detectada');
    window.location.href = 'dashboard.html';
}

const params = new URLSearchParams(window.location.search);
const emailRegistrado = params.get('registered');
if (emailRegistrado) {
    showToast(`Cuenta creada para ${emailRegistrado}. Ya puedes iniciar sesion.`, 'success', 5000);
}

_setupForm();

function _setupForm() {
    const form = document.getElementById('loginForm');
    const emailEl = document.getElementById('usuario');
    const pwdEl = document.getElementById('password');
    const alertBox = document.getElementById('loginAlert');
    const alertMsg = document.getElementById('loginAlertMsg');
    const toggleBtn = document.getElementById('togglePwd');
    const loginBtn = document.getElementById('loginBtn');
    const attemptsW = document.getElementById('attemptsWarning');

    if (emailRegistrado && emailEl) emailEl.value = emailRegistrado;

    toggleBtn?.addEventListener('click', () => {
        const isText = pwdEl.type === 'text';
        pwdEl.type = isText ? 'password' : 'text';
        toggleBtn.textContent = isText ? 'Ver' : 'Ocultar';
        Logger.debug('Auth', `Visibilidad password: ${isText ? 'oculta' : 'visible'}`);
    });

    function showAlert(msg) {
        alertMsg.textContent = msg;
        alertBox.style.display = 'flex';
    }

    function hideAlert() {
        alertBox.style.display = 'none';
        attemptsW.style.display = 'none';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const email = emailEl.value.trim().toLowerCase();
        const password = pwdEl.value;

        if (!email || !password) {
            Logger.warn('Auth', 'Intento de login con campos vacios');
            showAlert('Por favor completa correo y contraseña.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span class="loader"></span> Verificando...';

        try {
            const data = await API.login(email, password);
            Logger.info('Auth', `Login exitoso: ${data.usuario.email} (${data.usuario.rol})`);
            showToast(`Bienvenido, ${data.usuario.nombre}`, 'success', 1800);
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);
        } catch (err) {
            Logger.warn('Auth', `Login rechazado: ${err.message}`);
            showAlert(err.message || 'Credenciales invalidas.');
            if (err.status === 401 || err.status === 403) {
                attemptsW.style.display = 'block';
                attemptsW.textContent = err.message;
            }
            pwdEl.value = '';
            pwdEl.focus();
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Ingresar';
        }
    });
}
