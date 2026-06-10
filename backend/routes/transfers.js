const express = require('express');
const router  = express.Router();
const { authenticateToken, requireCliente } = require('../middleware/auth');
const { realizarTransferencia } = require('../controllers/transferController');

router.use(authenticateToken);

// BA-14 [RNF-02]: solo clientes pueden realizar transferencias
router.post('/', requireCliente, realizarTransferencia);

module.exports = router;
