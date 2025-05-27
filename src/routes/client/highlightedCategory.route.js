const express = require('express');
const router = express.Router();
const HighlightedCategoryController = require('../../controllers/client/highlightedCategoryItemController');

router.get('/highlighted-categories', HighlightedCategoryController.list);

module.exports = router;
