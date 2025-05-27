const express = require('express');
const router = express.Router();
const SearchController = require('../../controllers/client/searchController');

router.get('/search', SearchController.searchProducts);
router.get('/search/history', SearchController.getSearchHistory);

module.exports = router;
