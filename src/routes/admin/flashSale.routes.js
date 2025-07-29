const express = require('express');
const router = express.Router();
const FlashSaleController = require('../../controllers/admin/flashSaleController');
const { validateFlashSale } = require('../../validations/flashSaleValidator');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
const {upload} = require('../../config/cloudinary'); 
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("FlashSale"))
router.get('/', FlashSaleController.list);

router.get('/list', FlashSaleController.list);
router.post('/create', upload.single('bannerImage'), validateFlashSale, FlashSaleController.create);
router.patch('/update/:slug', upload.single('bannerImage'), validateFlashSale, FlashSaleController.update);
router.get('/detail/:slug', FlashSaleController.getById);
router.patch('/update-order', FlashSaleController.updateOrder);

router.get('/skus/available', FlashSaleController.getAvailableSkus);
router.patch('/restore/:id', FlashSaleController.restore);
router.post('/restore-many', FlashSaleController.restoreMany);
router.delete('/soft-delete/:id', FlashSaleController.softDelete);
router.post('/soft-delete-many', FlashSaleController.softDeleteMany);
router.post('/force-delete-many', FlashSaleController.forceDeleteMany);

router.delete('/force/:id', FlashSaleController.forceDelete);

router.get('/categories/available-tree', FlashSaleController.getAvailableCategoriesWithTree);




module.exports = router;
