const express = require('express');
const router  = express.Router();
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getAllCuentas, desbloquearUsuario, getAllTransferencias } = require('../controllers/adminController');

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/cuentas',                      getAllCuentas);
router.get('/transferencias',               getAllTransferencias);
router.patch('/usuarios/:usuarioId/desbloquear', desbloquearUsuario);

module.exports = router;
