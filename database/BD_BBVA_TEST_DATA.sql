-- ============================================================
-- BD_BBVA — Datos de Prueba para QA / Testing
-- Ejecutar DESPUÉS de BD_BBVA.sql
-- Ejecutar DESPUÉS de: cd backend && npm run seed
-- (seed.js genera los hashes bcrypt correctos)
--
-- Cubre: BA-7 a BA-11 (Autenticación)
--        BA-21 a BA-31 (Transferencias)
-- ============================================================

USE BD_BBVA;
GO

-- ============================================================
-- LIMPIAR datos previos (solo para reinicio de pruebas)
-- ============================================================
-- DELETE FROM Transferencias;
-- DELETE FROM Cuentas;
-- DELETE FROM Usuarios WHERE email NOT IN ('admin@bbva.com');
-- GO

-- ============================================================
-- USUARIOS DE PRUEBA
-- NOTA: password_hash se genera con bcrypt vía seed.js
--       Aquí se documenta la contraseña en texto plano
--       para referencia de QA únicamente.
-- ============================================================

/*
 TABLA DE REFERENCIA PARA QA:
 ┌──────────────────────┬──────────────┬────────────────┬──────────────┬──────────────────────────────────────────────────────┐
 │ Usuario (email)      │ Contraseña   │ Rol            │ Estado       │ Propósito de prueba                                  │
 ├──────────────────────┼──────────────┼────────────────┼──────────────┼──────────────────────────────────────────────────────┤
 │ admin@bbva.com       │ Admin1!      │ administrador  │ activo       │ BA-11: Desbloquear cuentas, panel admin               │
 │ carlos@bbva.com      │ Carlos1!     │ cliente        │ activo       │ BA-21/22/23: Transferencias normales, límite diario   │
 │ maria@bbva.com       │ Maria1!      │ cliente        │ activo       │ BA-24: Cuenta destino válida para transferencias      │
 │ juan@bbva.com        │ Juan1!       │ cliente        │ activo       │ BA-23/BA-29: Saldo $499 → fondos insuficientes        │
 │ luisa@bbva.com       │ Luisa1!      │ cliente        │ activo       │ BA-25/BA-31: Saldo $49,800 → prueba límite destino    │
 │ pedro@bbva.com       │ Pedro1!      │ cliente        │ bloqueado    │ BA-10/BA-11: Cuenta bloqueada → prueba reactivación   │
 │ ana@bbva.com         │ Ana1!        │ cliente        │ activo       │ BA-28: Transferencias múltiples, cuenta adicional     │
 └──────────────────────┴──────────────┴────────────────┴──────────────┴──────────────────────────────────────────────────────┘
*/

-- Usuarios (password_hash será generado por seed.js)
-- Este bloque es solo documentativo; seed.js hace el INSERT real con hash bcrypt.

-- ============================================================
-- CASOS DE PRUEBA DOCUMENTADOS
-- ============================================================

/*
── BA-7 [RF-01] Inicio de sesión ──
  CASO 1 (éxito): email=carlos@bbva.com, pass=Carlos1!  → Ingresa al dashboard
  CASO 2 (vacío): email='', pass=''                     → Mensaje: "campos requeridos"
  CASO 3 (wrong): email=carlos@bbva.com, pass=xxxxx     → Mensaje: "Credenciales inválidas"

── BA-8 [RF-02] Validación de contraseña ──
  CASO 1: longitud < 5                  → Error de validación
  CASO 2: sin mayúscula                 → Error de validación
  CASO 3: sin número                    → Error de validación
  CASO 4: sin carácter especial         → Error de validación
  CASO 5: cumple todos (Carlos1!)       → Válida

── BA-9 [RF-03] Encriptación ──
  Verificar: la contraseña en BD nunca es texto plano, siempre es el hash.

── BA-10 [RF-04] Bloqueo de cuenta ──
  CASO 1: 1er intento fallido  → "Te quedan 3 intento(s)"
  CASO 2: 2do intento fallido  → "Te quedan 2 intento(s)"
  CASO 3: 3er intento fallido  → "Te queda 1 intento(s)"
  CASO 4: 4to intento fallido  → "Cuenta bloqueada"

── BA-11 [RF-05] Desbloqueo de cuenta ──
  Usar: admin@bbva.com → Panel Admin → Reactivar cuenta de pedro

── BA-21 [RF-09] Realizar transferencia ──
  Origen: carlos@bbva.com (cuenta: 1234567890123456, saldo: $15,000)
  Destino: maria@bbva.com (cuenta: 9876543210987654)
  Monto: $1,000  Concepto: "Prueba exitosa"  → "Transferencia exitosa"

── BA-22 [RF-10] Validación de monto ──
  CASO 1: monto $499     → "Monto mínimo $500.00"
  CASO 2: monto $500     → Válido
  CASO 3: total diario >$7,000 → "Límite diario excedido"

── BA-23 [RF-11] Validación de saldo ──
  Usar: juan@bbva.com (saldo $499)
  Monto: $500 → "Fondos insuficientes"

── BA-24 [RF-12] Validación de cuenta destino ──
  CASO 1: cuenta 9999999999999999 (no existe) → "Cuenta inexistente"
  CASO 2: cuenta 9876543210987654 (maria)      → Válida

── BA-25 [RF-13] Validación de límite destino ──
  Usar: luisa@bbva.com (saldo $49,800)
  Enviar $300 a luisa: 49800 + 300 = $50,100 > $50,000 → Rechazada

── BA-26 [RF-14] Confirmación ──
  Transferencia exitosa → Modal "Transferencia exitosa" + referencia + fecha/hora
  NO se genera comprobante descargable.

── BA-27 [RF-15] No cancelación ──
  Ir a Movimientos → Las transferencias completadas no tienen botón de cancelar.

── BA-28 [RF-16] Transferencias múltiples ──
  Hacer varias transferencias hasta agotar $7,000 diarios.
  En la siguiente: "Límite diario excedido. Disponible hoy: $X"

── BA-29 [RF-19] Saldo insuficiente ──
  Ver BA-23 arriba.

── BA-30 [RF-20] Cuenta inexistente ──
  Ver BA-24 caso 1 arriba.

── BA-31 [RF-21] Límite excedido ──
  Ver BA-25 arriba.
*/

-- ============================================================
-- CUENTAS DE PRUEBA (para inserción manual si se omite seed.js)
-- ============================================================
-- Saldos ajustados para ser consistentes con las 2 transferencias de hoy del seed:
-- carlos  → 1234567890123456  saldo: $12,300.00  (15000 - 1500 tx10 - 1200 tx11)
-- maria   → 9876543210987654  saldo: $10,000.00  (8500  + 1500 recibe tx10)
-- juan    → 1111222233334444  saldo:    $499.00   (saldo < mínimo transferencia)
-- luisa   → 5555666677778888  saldo: $49,800.00   (cerca del límite $50,000)
-- pedro   → 9999000011112222  saldo:  $5,000.00   (cuenta BLOQUEADA)
-- ana     → 3333444455556666  saldo:  $4,700.00   (3500  + 1200 recibe tx11)

-- ============================================================
-- CASOS DE PRUEBA — BA-4 HISTORIAL
-- ============================================================
/*
── BA-35 / BA-119: 5 transferencias más recientes en sección Inicio ──
  Login como carlos → sección Inicio → ver "Últimos movimientos" (max 5 registros)
  Verificar que solo muestra 5, ordenadas de más reciente a más antigua.

── BA-36 [RF-18] Datos mostrados (BA-121 / BA-122) ──
  Cada fila del historial debe contener:
    · Dirección   → "↑ Enviada" / "↓ Recibida"
    · Concepto    → texto libre de la transferencia
    · Cuenta      → número de cuenta del otro extremo (origen o destino)
    · Monto       → en pesos MXN con 2 decimales, rojo si enviada, verde si recibida
    · Fecha/hora  → dd/mm/aaaa hh:mm
    · Tipo        → transferencia | depósito | retiro

── BA-123: Sin filtros ──
  La sección Historial NO tiene campos de búsqueda, selectores de rango
  de fechas, ni ningún filtro. Solo paginación.

── BA-37 [RF-25] / BA-124 / BA-125 / BA-126: Registro persistente ──
  Cada transferencia queda registrada con:
    cuenta_origen, cuenta_destino, monto DECIMAL(12,2), concepto,
    tipo_transaccion, fecha_hora, estado='completada', referencia única.

── BA-39 [RNF-09] Persistencia ──
  Las transferencias se guardan en la tabla Transferencias (o localStorage en
  modo demo). Recargar la página debe mantener el historial intacto.

── Paginación (5 en 5) ──
  Carlos tiene 10 movimientos pre-cargados → Página 1 (5) + Página 2 (5).
  Los 2 más recientes son de HOY (tx10 y tx11), seguidos de los 8 históricos.
  Botones ‹ / 1 / 2 / › deben navegar correctamente.
*/

-- ============================================================
-- TRANSFERENCIAS DE PRUEBA (BA-124 / BA-125 / BA-126)
-- BA-126: DECIMAL(12,2) garantiza 2 decimales a nivel de BD
-- ============================================================

-- Historial para carlos (1234567890123456) — 10 movimientos = 2 páginas de 5
-- Ejecutar después de que seed.js haya insertado usuarios y cuentas.
-- seed.js ya inserta estas transferencias; este bloque es para inserción manual.
INSERT INTO Transferencias (cuenta_origen, cuenta_destino, monto, concepto, tipo_transaccion, fecha_hora, estado, referencia)
VALUES
    -- Página 1 (más recientes: 2 de HOY + 3 históricas)
    ('1234567890123456', '9876543210987654', 1500.00, 'Consulta médica familiar',  'transferencia', DATEADD(hour,-3,GETDATE()),  'completada', 'REF20240010'),  -- HOY
    ('1234567890123456', '3333444455556666', 1200.00, 'Préstamo mensual acordado', 'transferencia', DATEADD(hour,-1,GETDATE()),  'completada', 'REF20240011'),  -- HOY
    ('1234567890123456', '9876543210987654', 1000.00, 'Pago de renta',             'transferencia', DATEADD(day,-1,GETDATE()),   'completada', 'REF20240001'),
    ('3333444455556666', '1234567890123456',  500.00, 'Préstamo personal',         'transferencia', DATEADD(day,-2,GETDATE()),   'completada', 'REF20240002'),
    ('1234567890123456', '3333444455556666',  750.00, 'Servicios profesionales',   'transferencia', DATEADD(day,-3,GETDATE()),   'completada', 'REF20240003'),
    -- Página 2 (más antiguas)
    ('9876543210987654', '1234567890123456', 1200.00, 'Reembolso de compra',       'deposito',      DATEADD(day,-4,GETDATE()),   'completada', 'REF20240004'),
    ('1234567890123456', '9876543210987654',  800.00, 'Cena familiar',             'transferencia', DATEADD(day,-5,GETDATE()),   'completada', 'REF20240005'),
    ('1234567890123456', '3333444455556666',  600.00, 'Útiles escolares',          'transferencia', DATEADD(day,-6,GETDATE()),   'completada', 'REF20240006'),
    ('3333444455556666', '1234567890123456',  900.00, 'Pago factura pendiente',    'transferencia', DATEADD(day,-7,GETDATE()),   'completada', 'REF20240007'),
    ('1234567890123456', '9876543210987654',  550.00, 'Medicamentos familia',      'transferencia', DATEADD(day,-8,GETDATE()),   'completada', 'REF20240008'),
    -- Transferencia entre maria y ana (NO debe aparecer en historial de carlos — BA-123)
    ('9876543210987654', '3333444455556666',  750.00, 'Pago servicios entre socios','transferencia',DATEADD(day,-2,GETDATE()),  'completada', 'REF20240009');
GO

-- Verificar historial de carlos (BA-120: ordenado más reciente primero)
SELECT
    t.id,
    CASE WHEN t.cuenta_origen = '1234567890123456' THEN 'ENVIADA' ELSE 'RECIBIDA' END AS direccion,
    t.concepto,
    CASE WHEN t.cuenta_origen = '1234567890123456' THEN t.cuenta_destino ELSE t.cuenta_origen END AS cuenta_otra,
    t.monto,       -- BA-126: DECIMAL(12,2)
    t.fecha_hora,
    t.tipo_transaccion
FROM Transferencias t
WHERE t.cuenta_origen = '1234567890123456' OR t.cuenta_destino = '1234567890123456'
ORDER BY t.fecha_hora DESC;  -- BA-120: más reciente primero
GO

-- ============================================================
-- CONSULTAS ÚTILES PARA VALIDAR ESTADO
-- ============================================================

-- Ver todos los usuarios y sus estados
SELECT
    u.id, u.nombre, u.email, u.rol,
    u.estado, u.intentos_fallidos, u.ultimo_acceso,
    c.numero_cuenta, c.saldo, c.estado AS estado_cuenta
FROM Usuarios u
LEFT JOIN Cuentas c ON c.usuario_id = u.id
ORDER BY u.id;

-- Ver últimas 20 transferencias
SELECT TOP 20
    t.id, t.cuenta_origen, t.cuenta_destino,
    t.monto, t.concepto, t.tipo_transaccion,
    t.fecha_hora, t.estado
FROM Transferencias t
ORDER BY t.fecha_hora DESC;

-- Total enviado hoy por cuenta
SELECT
    cuenta_origen,
    SUM(monto) AS total_enviado_hoy,
    COUNT(*)   AS num_transferencias
FROM Transferencias
WHERE estado = 'completada'
  AND CAST(fecha_hora AS DATE) = CAST(GETDATE() AS DATE)
GROUP BY cuenta_origen;

-- Resetear intentos fallidos de un usuario (uso admin)
-- UPDATE Usuarios SET intentos_fallidos = 0, estado = 'activo' WHERE email = 'pedro@bbva.com';
GO
