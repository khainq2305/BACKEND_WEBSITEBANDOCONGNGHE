const express = require('express');
const router = express.Router();
const FlashSaleController = require('../../controllers/admin/flashSaleController');
const { validateFlashSale } = require('../../validations/flashSaleValidator');

const {upload} = require('../../config/cloudinary'); 

router.get('/flash-sales', FlashSaleController.list);



router.post('/flash-sales', upload.single('bannerImage'), validateFlashSale, FlashSaleController.create);
router.patch('/flash-sales/:slug', upload.single('bannerImage'), validateFlashSale, FlashSaleController.update);

router.get('/flash-sales/:slug', FlashSaleController.getById);

router.get('/flash-sales/skus/available', FlashSaleController.getAvailableSkus);
router.patch('/flash-sales/restore/:id', FlashSaleController.restore);
router.post('/flash-sales/restore-many', FlashSaleController.restoreMany);
router.delete('/flash-sales/soft-delete/:id', FlashSaleController.softDelete);
router.post('/flash-sales/soft-delete-many', FlashSaleController.softDeleteMany);
router.post('/flash-sales/force-delete-many', FlashSaleController.forceDeleteMany);

router.delete('/flash-sales/force/:id', FlashSaleController.forceDelete);

router.get('/flash-sales/categories/available-tree', FlashSaleController.getAvailableCategoriesWithTree);




module.exports = router;
