// routes/sku.route.js

const express = require('express');
const router = express.Router();
const SkuController = require('../../controllers/admin/skuController');

router.get('/', SkuController.getAllSkus);
router.get('/:id', SkuController.getSkuById);
router.post('/', SkuController.createSku);
router.put('/:id', SkuController.updateSku);
// router.delete('/:id', SkuController.deleteSku);

router.post('/:id/import', SkuController.importStock);

// Xuất kho
router.post('/:id/export', SkuController.exportStock);

router.get('/:id/logs', SkuController.getLogs);

module.exports = router;
