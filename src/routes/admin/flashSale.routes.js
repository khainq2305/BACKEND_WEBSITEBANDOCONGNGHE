const express = require('express');
const router = express.Router();
const FlashSaleController = require('../../controllers/admin/flashSaleController');

// Danh sách tất cả flash sale
router.get('/flash-sales', FlashSaleController.list);

// Chi tiết 1 flash sale theo ID
router.get('/flash-sales/:id', FlashSaleController.getById);

// Tạo mới flash sale
router.post('/flash-sales', FlashSaleController.create);
// ✅ Lấy danh sách SKU dùng được cho Flash Sale
router.get('/flash-sales/skus/available', FlashSaleController.getAvailableSkus);

// ✅ Lấy danh sách danh mục dạng cây (cha-con)
router.get('/flash-sales/categories/available-tree', FlashSaleController.getAvailableCategoriesWithTree);

// Cập nhật flash sale
router.put('/flash-sales/:id', FlashSaleController.update);

// Xoá flash sale
router.delete('/flash-sales/:id', FlashSaleController.delete);

module.exports = router;
