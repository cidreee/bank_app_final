const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { getMiCuenta, getMovimientos } = require('../controllers/accountController');

router.use(authenticateToken);

router.get('/mi-cuenta',    getMiCuenta);
router.get('/movimientos',  getMovimientos);

module.exports = router;
