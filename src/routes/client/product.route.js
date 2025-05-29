const express = require('express');
const router = express.Router();

const ProductController = require('../../controllers/client/productController');

router.get('/', ProductController.getProductsByCategory);

module.exports = router;
