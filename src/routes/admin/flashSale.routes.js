const express = require('express');
const router = express.Router();
const FlashSaleController = require('../../controllers/admin/flashSaleController');


router.get('/flash-sales', FlashSaleController.list);


router.get('/flash-sales/:id', FlashSaleController.getById);


router.post('/flash-sales', FlashSaleController.create);

router.get('/flash-sales/skus/available', FlashSaleController.getAvailableSkus);
router.patch('/flash-sales/restore/:id', FlashSaleController.restore);
router.post('/flash-sales/restore-many', FlashSaleController.restoreMany);
router.delete('/flash-sales/soft-delete/:id', FlashSaleController.softDelete);
router.post('/flash-sales/soft-delete-many', FlashSaleController.softDeleteMany);


router.get('/flash-sales/categories/available-tree', FlashSaleController.getAvailableCategoriesWithTree);

router.put('/flash-sales/:id', FlashSaleController.update);


router.delete('/flash-sales/delete-many', FlashSaleController.deleteMany);

router.delete('/flash-sales/:id', FlashSaleController.delete);

module.exports = router;
