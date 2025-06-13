const express = require('express');
const router = express.Router();
const ProductViewController = require('../../controllers/client/productViewController');

router.post('/', ProductViewController.addView);
router.post('/list', ProductViewController.getByIds);
router.get('/top', ProductViewController.getTopViewedProducts);

module.exports = router;
