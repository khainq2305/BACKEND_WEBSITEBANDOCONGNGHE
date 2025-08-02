const express = require('express');
const router = express.Router();
const ClientComboController = require('../../controllers/client/combo.controller');

router.get('/', ClientComboController.getAll);

module.exports = router;
