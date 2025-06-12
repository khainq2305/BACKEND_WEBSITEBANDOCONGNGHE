const express = require('express');
const router = express.Router();
const { upload } = require('../../config/cloudinary');
const BannerController = require('../../controllers/admin/BannerController');
const { validateBanner } = require('../../validations/bannerValidator'); 

router.get('/banners/categories-for-select', BannerController.getCategoriesForSelect);
router.get('/banners/products-for-select', BannerController.getProductsForSelect);

router.post(
  '/banners',
  upload.single('image'),
  validateBanner,
  BannerController.create
);

// Cập nhật thứ tự hiển thị (kéo thả)
router.put(
  '/banners/:id/update-order',
  BannerController.updateOrder
);
router.put(
  '/banners/:slug',
  upload.single('image'),
  validateBanner,
  BannerController.update
);
// Sửa lại route từ POST → DELETE
router.delete('/banners/force-delete', BannerController.forceDeleteMany);

router.get('/banners/:slug', BannerController.getById);

router.get('/banners', BannerController.getAll);




router.delete('/banners/:id', BannerController.delete);


module.exports = router;
