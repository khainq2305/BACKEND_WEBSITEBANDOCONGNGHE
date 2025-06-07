// routes/client/slider.js
const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/client/bannerController');


router.get('/banner', bannerController.getByType);
// Thêm dòng này:
router.get('/banner/category/:categoryId', bannerController.getCategoryBanner);
router.get('/banner/product/:productId', bannerController.getProductBanner);

module.exports = router;
