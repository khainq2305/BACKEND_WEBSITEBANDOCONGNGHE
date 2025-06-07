const express = require('express');
const router = express.Router();
const { upload } = require('../../config/cloudinary');
const BannerController = require('../../controllers/admin/BannerController');
const { validateBanner } = require('../../validations/bannerValidator'); 


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
  '/banners/:id',
  upload.single('image'),
  validateBanner,
  BannerController.update
);


router.get('/banners', BannerController.getAll);


router.get('/banners/:id', BannerController.getById);


router.delete('/banners/:id', BannerController.delete);


router.post('/banners/force-delete', BannerController.forceDeleteMany);

module.exports = router;
