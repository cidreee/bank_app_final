const express = require('express');
const router  = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { realizarTransferencia } = require('../controllers/transferController');

router.use(authenticateToken);

router.post('/', realizarTransferencia);

module.exports = router;
