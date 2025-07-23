// routes/sku.route.js

const express = require('express');
const router = express.Router();
const SkuController = require('../../controllers/admin/skuController');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Product"))
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
