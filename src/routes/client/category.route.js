const express = require('express');
const router = express.Router();

const CategoryController = require('../../controllers/client/categoryController');

// Gọi đúng method static trong class
router.get('/', CategoryController.getNestedCategories);

module.exports = router;
