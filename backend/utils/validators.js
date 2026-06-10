const MONTO_MINIMO = 500.00;
const LIMITE_DIARIO = 7000.00;
const SALDO_MAXIMO = 50000.00;

// BA-8 [RF-02]: reglas centrales para validar contrasenas de usuarios.
function validarFormatoPassword(password) {
    const pwd = String(password || '');
    const errores = [];
    if (pwd.length < 5 || pwd.length > 8) errores.push('longitud 5-8 caracteres');
    if (!/[A-Z]/.test(pwd)) errores.push('al menos una mayuscula');
    if (!/[0-9]/.test(pwd)) errores.push('al menos un numero');
    if (!/[^A-Za-z0-9]/.test(pwd)) errores.push('al menos un caracter especial');
    return errores;
}

// BA-82 / BA-88: validaciones de entrada antes de consultar cuentas en BD.
function validarEntradaTransferencia({ cuentaDestino, monto, concepto }) {
    const errores = [];
    const montoNum = Number(monto);

    if (!cuentaDestino || monto === undefined || monto === null || !concepto) {
        errores.push('Todos los campos son requeridos');
    }
    if (cuentaDestino && String(cuentaDestino).length !== 16) {
        errores.push('El numero de cuenta debe tener exactamente 16 digitos');
    }
    if (Number.isNaN(montoNum) || montoNum < MONTO_MINIMO) {
        errores.push(`El monto minimo de transferencia es $${MONTO_MINIMO.toFixed(2)}`);
    }

    return errores;
}

module.exports = {
    LIMITE_DIARIO,
    MONTO_MINIMO,
    SALDO_MAXIMO,
    validarEntradaTransferencia,
    validarFormatoPassword
};
