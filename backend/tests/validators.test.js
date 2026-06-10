const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validarEntradaTransferencia,
    validarFormatoPassword
} = require('../utils/validators');

test('validarFormatoPassword acepta contrasenas con longitud, mayuscula, numero y especial', () => {
    assert.deepEqual(validarFormatoPassword('Abc1!'), []);
});

test('validarFormatoPassword reporta las reglas faltantes', () => {
    const errores = validarFormatoPassword('abc');

    assert.ok(errores.includes('longitud 5-8 caracteres'));
    assert.ok(errores.includes('al menos una mayuscula'));
    assert.ok(errores.includes('al menos un numero'));
    assert.ok(errores.includes('al menos un caracter especial'));
});

test('validarEntradaTransferencia acepta una transferencia basica valida', () => {
    const errores = validarEntradaTransferencia({
        cuentaDestino: '1234567890123456',
        monto: 500,
        concepto: 'Pago de prueba'
    });

    assert.deepEqual(errores, []);
});

test('validarEntradaTransferencia rechaza cuenta corta y monto menor al minimo', () => {
    const errores = validarEntradaTransferencia({
        cuentaDestino: '123',
        monto: 100,
        concepto: 'Pago de prueba'
    });

    assert.ok(errores.includes('El numero de cuenta debe tener exactamente 16 digitos'));
    assert.ok(errores.includes('El monto minimo de transferencia es $500.00'));
});
