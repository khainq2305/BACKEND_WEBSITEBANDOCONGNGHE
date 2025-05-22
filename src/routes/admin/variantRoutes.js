// src/routes/admin/variantRoutes.js
const express = require('express');
const router = express.Router();
const VariantController = require('../../controllers/admin/variantController');
const VariantValueController = require('../../controllers/admin/variantValueController');

router.get('/variants/list', VariantController.getAll);
router.post('/variants/create', VariantController.create);
router.post('/variant-values/create', VariantValueController.create);

module.exports = router;
