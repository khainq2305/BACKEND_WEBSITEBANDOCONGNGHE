const express = require('express');
const router = express.Router();
const StockLogController = require('../../controllers/admin/StockController');

// ✅ GET tất cả lịch sử xuất nhập hàng
// GET /api/stock-logs
router.get('/', StockLogController.getAll);

// ✅ GET lịch sử của 1 SKU
// GET /api/stock-logs/sku/:skuId
router.get('/:skuId', StockLogController.getBySkuId);

// ✅ Tạo log mới
// POST /api/stock-logs
router.post('/', StockLogController.create);

// ✅ Xoá log (nếu cần)
// DELETE /api/stock-logs/:id
router.delete('/:id', StockLogController.delete);

// ✅ Update log (tuỳ chọn)
// PUT /api/stock-logs/:id
router.put('/:id', StockLogController.update);

module.exports = router;
