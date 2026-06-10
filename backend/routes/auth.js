const express = require('express');
const router  = express.Router();
const { login, registrarCliente } = require('../controllers/authController');

router.post('/login', login);
router.post('/register', registrarCliente);

module.exports = router;
