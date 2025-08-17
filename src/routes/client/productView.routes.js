const express = require('express');
const router = express.Router();
const ProductViewController = require('../../controllers/client/productViewController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.post('/',checkJWT, ProductViewController.addView);
router.post('/list', checkJWT,ProductViewController.getByIds);
router.get('/recently-viewed-by-category-level1', ProductViewController.getRecentlyViewedByCategoryLevel1);
router.get('/search-compare', ProductViewController.searchForCompare);


module.exports = router;
