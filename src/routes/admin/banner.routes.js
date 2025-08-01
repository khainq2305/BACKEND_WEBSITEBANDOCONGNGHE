const express = require('express');
const router = express.Router();
const { upload } = require('../../config/cloudinary');
const BannerController = require('../../controllers/admin/BannerController');
const { validateBanner } = require('../../validations/bannerValidator'); 
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');

router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("Banner"));

router.get('/categories-for-select', BannerController.getCategoriesForSelect);
router.get('/products-for-select', BannerController.getProductsForSelect);

router.post('/create', upload.single('image'), validateBanner, BannerController.create);
router.put('/update/:slug', upload.single('image'), validateBanner, BannerController.update);
router.get('/detail/:slug', BannerController.getById);
router.get('/list', BannerController.getAll);

router.delete('/force-delete-many', BannerController.forceDeleteMany);
router.delete('/delete/:id', authorize("Banner", "delete"), BannerController.delete);
router.put('/update-order/:id', BannerController.updateOrder);

module.exports = router;
