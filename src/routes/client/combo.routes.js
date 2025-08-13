const express = require('express');
const router = express.Router();
const ClientComboController = require('../../controllers/client/combo.controller');

router.get('/', ClientComboController.getAll);
router.get('/:slug', ClientComboController.getBySlug); // 👈 Thêm dòng này

module.exports = router;
