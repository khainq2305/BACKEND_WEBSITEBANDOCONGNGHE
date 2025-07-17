const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/client/productController');
const { getProductsByCategory } = require('../../controllers/client/productController');

router.get('/product/related', ProductController.getRelatedProducts); 
router.get('/', getProductsByCategory);
;
router.get('/product/compare-ids', ProductController.getCompareByIds); // THÊM DÒNG NÀY
router.get('/product/:slug', ProductController.getProductDetailBySlug);

module.exports = router;
