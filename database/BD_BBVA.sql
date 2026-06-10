-- ============================================================
-- BD_BBVA - Script de Creación de Base de Datos
-- Banco BBVA México (Simulación)
-- ============================================================

USE master;
GO

IF EXISTS (SELECT name FROM sys.databases WHERE name = 'BD_BBVA')
    DROP DATABASE BD_BBVA;
GO

CREATE DATABASE BD_BBVA;
GO

USE BD_BBVA;
GO

-- ============================================================
-- TABLA: Usuarios
-- ============================================================
CREATE TABLE Usuarios (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    nombre          NVARCHAR(100)   NOT NULL,
    apellido        NVARCHAR(100)   NOT NULL,
    email           NVARCHAR(150)   NOT NULL UNIQUE,
    password_hash   NVARCHAR(255)   NOT NULL,
    rol             NVARCHAR(20)    NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'administrador')),
    intentos_fallidos INT           NOT NULL DEFAULT 0,
    estado          NVARCHAR(20)    NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'bloqueado')),
    fecha_creacion  DATETIME        NOT NULL DEFAULT GETDATE(),
    ultimo_acceso   DATETIME        NULL
);
GO

-- ============================================================
-- TABLA: Cuentas
-- ============================================================
CREATE TABLE Cuentas (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    numero_cuenta   CHAR(16)        NOT NULL UNIQUE,
    usuario_id      INT             NOT NULL FOREIGN KEY REFERENCES Usuarios(id),
    saldo           DECIMAL(12,2)   NOT NULL DEFAULT 0.00 CHECK (saldo >= 0),
    estado          NVARCHAR(20)    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'bloqueada', 'cerrada')),
    fecha_apertura  DATETIME        NOT NULL DEFAULT GETDATE(),
    CONSTRAINT chk_saldo_maximo CHECK (saldo <= 50000.00)
);
GO

-- ============================================================
-- TABLA: Transferencias
-- ============================================================
CREATE TABLE Transferencias (
    id                  INT IDENTITY(1,1) PRIMARY KEY,
    cuenta_origen       CHAR(16)        NOT NULL,
    cuenta_destino      CHAR(16)        NOT NULL,
    monto               DECIMAL(12,2)   NOT NULL CHECK (monto >= 500.00),
    concepto            NVARCHAR(200)   NOT NULL,
    tipo_transaccion    NVARCHAR(50)    NOT NULL DEFAULT 'transferencia' CHECK (tipo_transaccion IN ('transferencia', 'deposito', 'retiro')),
    fecha_hora          DATETIME        NOT NULL DEFAULT GETDATE(),
    estado              NVARCHAR(20)    NOT NULL DEFAULT 'completada' CHECK (estado IN ('completada', 'fallida', 'pendiente')),
    referencia          NVARCHAR(50)    NOT NULL DEFAULT NEWID()
);
GO

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_transferencias_origen   ON Transferencias(cuenta_origen);
CREATE INDEX idx_transferencias_destino  ON Transferencias(cuenta_destino);
CREATE INDEX idx_transferencias_fecha    ON Transferencias(fecha_hora DESC);
CREATE INDEX idx_cuentas_usuario         ON Cuentas(usuario_id);
GO

-- ============================================================
-- VISTA: Límite diario por cuenta origen
-- ============================================================
CREATE VIEW vw_transferencias_diarias AS
    SELECT
        cuenta_origen,
        CAST(fecha_hora AS DATE)    AS fecha,
        SUM(monto)                  AS total_dia,
        COUNT(*)                    AS num_transferencias
    FROM Transferencias
    WHERE estado = 'completada'
    GROUP BY cuenta_origen, CAST(fecha_hora AS DATE);
GO

-- ============================================================
-- DATOS SEMILLA - Usuarios de prueba
-- Passwords: Admin1! / Cliente1!  (hasheados con bcrypt en la app)
-- Los hashes reales se generan al ejecutar: node backend/seed.js
-- ============================================================
INSERT INTO Usuarios (nombre, apellido, email, password_hash, rol)
VALUES
    ('Admin',   'BBVA',    'admin@bbva.com',    'PENDIENTE_HASH', 'administrador'),
    ('Carlos',  'Mendoza', 'carlos@bbva.com',   'PENDIENTE_HASH', 'cliente'),
    ('María',   'García',  'maria@bbva.com',    'PENDIENTE_HASH', 'cliente');
GO

INSERT INTO Cuentas (numero_cuenta, usuario_id, saldo)
VALUES
    ('1234567890123456', 2, 15000.00),
    ('9876543210987654', 3, 8500.00);
GO
