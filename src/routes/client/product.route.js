const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/client/productController');
const { getProductsByCategory } = require('../../controllers/client/productController');

router.get('/', getProductsByCategory);


router.get('/product/:slug', ProductController.getProductDetailBySlug);

module.exports = router;
