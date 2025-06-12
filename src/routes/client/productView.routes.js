const express = require('express');
const router = express.Router();
const ProductViewController = require('../../controllers/client/productViewController');

// POST / → Ghi nhận lượt xem
router.post('/', ProductViewController.addView);

// POST /list → Lấy danh sách theo ID
router.post('/list', ProductViewController.getByIds);

// GET /top → Lấy top sản phẩm xem nhiều
router.get('/top', ProductViewController.getTopViewedProducts);

module.exports = router;
