const express = require('express');
const router = express.Router();
const ProductViewController = require('../../controllers/client/productViewController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.use(checkJWT);
router.post('/', ProductViewController.addView);
router.post('/list', ProductViewController.getByIds);
router.get('/recently-viewed-by-category-level1', ProductViewController.getRecentlyViewedByCategoryLevel1);
router.get('/search-compare', ProductViewController.searchForCompare);


module.exports = router;
