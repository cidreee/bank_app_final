/* ============================================================
   BBVA Fake — auth.js
   BA-7  [RF-01] Inicio de sesión
   BA-8  [RF-02] Validación de contraseña
   BA-9  [RF-03] Encriptación/hashing
   BA-10 [RF-04] Bloqueo de cuenta
   ============================================================ */

const MAX_INTENTOS = 3;

// Reglas de contraseña (BA-55, BA-56, BA-57)
function validarFormatoPassword(pwd) {
    const errores = [];
    if (pwd.length < 5 || pwd.length > 8) errores.push('longitud entre 5 y 8 caracteres');
    if (!/[A-Z]/.test(pwd))               errores.push('al menos una mayúscula');
    if (!/[0-9]/.test(pwd))               errores.push('al menos un número');
    if (!/[^A-Za-z0-9]/.test(pwd))        errores.push('al menos un carácter especial');
    return errores;  // array vacío = válida
}

// ---- Inicializar SOLO cuando la DB esté lista ----
dbReady.then(() => {
    // Si ya hay sesión, ir al dashboard
    if (getToken()) {
        Logger.info('Auth', 'Sesión existente detectada — redirigiendo al dashboard');
        window.location.href = 'dashboard.html';
        return;
    }

    // Mensaje de éxito al volver desde registro
    const params = new URLSearchParams(window.location.search);
    const usuarioRegistrado = params.get('registered');
    if (usuarioRegistrado) {
        showToast(`Cuenta creada para "${usuarioRegistrado}". ¡Ya puedes iniciar sesión!`, 'success', 5000);
        // Prellenar el campo usuario
        const inputUsuario = document.getElementById('usuario');
        if (inputUsuario) inputUsuario.value = usuarioRegistrado;
    }

    Logger.info('Auth', 'Página de login lista');
    _setupForm();
}).catch(err => {
    Logger.error('Auth', 'Error al inicializar login', err.message);
    document.getElementById('loginAlert').style.display = 'flex';
    document.getElementById('loginAlertMsg').textContent = 'Error al inicializar la aplicación. Recarga la página.';
});

function _setupForm() {
    const form      = document.getElementById('loginForm');
    const usuarioEl = document.getElementById('usuario');
    const pwdEl     = document.getElementById('password');
    const alertBox  = document.getElementById('loginAlert');
    const alertMsg  = document.getElementById('loginAlertMsg');
    const toggleBtn = document.getElementById('togglePwd');
    const loginBtn  = document.getElementById('loginBtn');
    const attemptsW = document.getElementById('attemptsWarning');

    // Toggle visibilidad de contraseña
    toggleBtn.addEventListener('click', () => {
        const isText  = pwdEl.type === 'text';
        pwdEl.type    = isText ? 'password' : 'text';
        toggleBtn.textContent = isText ? '👁' : '🙈';
        Logger.debug('Auth', `Visibilidad contraseña: ${isText ? 'oculta' : 'visible'}`);
    });

    function showAlert(msg) {
        alertMsg.textContent   = msg;
        alertBox.style.display = 'flex';
    }
    function hideAlert() {
        alertBox.style.display = 'none';
        attemptsW.style.display = 'none';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const usuarioVal = usuarioEl.value.trim().toLowerCase();
        const passwordVal = pwdEl.value;

        // BA-53: campos no vacíos
        if (!usuarioVal || !passwordVal) {
            Logger.warn('Auth', 'Intento de login con campos vacíos');
            showAlert('Por favor completa todos los campos.');
            return;
        }

        loginBtn.disabled  = true;
        loginBtn.innerHTML = '<span class="loader"></span> Verificando...';

        try {
            const user = DB.getUserByUsuario(usuarioVal);

            // Usuario no existe
            if (!user) {
                Logger.warn('Auth', `Login fallido — usuario no encontrado: ${usuarioVal}`);
                showAlert('Credenciales inválidas.');
                return;
            }

            // BA-63: cuenta bloqueada
            if (user.estado === 'bloqueado') {
                Logger.warn('Auth', `Login rechazado — cuenta bloqueada: ${usuarioVal}`);
                showAlert('Cuenta bloqueada. Contacte al administrador.');
                return;
            }

            // BA-60: comparar password con hash almacenado (BA-58/59)
            const passwordOk = await verifyPassword(passwordVal, user.password_hash);

            if (!passwordOk) {
                const nuevosIntentos = user.intentos_fallidos + 1;

                if (nuevosIntentos > MAX_INTENTOS) {
                    // BA-62: bloquear al superar el máximo
                    DB.updateUser(user.id, { intentos_fallidos: nuevosIntentos, estado: 'bloqueado' });
                    Logger.error('Auth', `Cuenta bloqueada por intentos: ${usuarioVal}`, `intentos: ${nuevosIntentos}`);
                    showAlert('Cuenta bloqueada por múltiples intentos fallidos. Contacte al administrador.');
                } else {
                    DB.updateUser(user.id, { intentos_fallidos: nuevosIntentos });
                    const restantes = MAX_INTENTOS - nuevosIntentos + 1;
                    const msg = `Credenciales inválidas. Te quedan ${restantes} intento(s).`;
                    Logger.warn('Auth', `Intento fallido ${nuevosIntentos}/${MAX_INTENTOS}: ${usuarioVal}`);
                    showAlert(msg);
                    attemptsW.style.display = 'block';
                    attemptsW.textContent   = `⚠ ${msg}`;
                }

                pwdEl.value = '';
                pwdEl.focus();
                return;
            }

            // ---- Login exitoso ----
            DB.updateUser(user.id, { intentos_fallidos: 0, ultimo_acceso: new Date().toISOString() });
            setSession(user.id);
            Logger.info('Auth', `Login exitoso: ${usuarioVal} (rol: ${user.rol})`);

            showToast(`Bienvenido, ${user.nombre}`, 'success', 2000);
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 600);

        } catch (err) {
            Logger.error('Auth', 'Error inesperado en login', err.message);
            showAlert('Error, consulte al administrador');
        } finally {
            loginBtn.disabled    = false;
            loginBtn.textContent = 'Ingresar';
        }
    });
}
