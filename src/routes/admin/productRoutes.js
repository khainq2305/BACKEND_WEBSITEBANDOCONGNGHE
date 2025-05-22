const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');

// ✅ Route TẠO SẢN PHẨM đúng yêu cầu
router.post('/product/create', ProductController.create); // 👈 CHÍNH XÁC

// (Nếu cần)
router.get('/product/list', ProductController.getAll);    // 👉 GET danh sách

module.exports = router;
