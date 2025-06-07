const express = require('express');
const router = express.Router();

const CategoryController = require('../../controllers/client/categoryController');


router.get('/', CategoryController.getNestedCategories);
router.get('/:slug', CategoryController.getBySlug);

module.exports = router;
