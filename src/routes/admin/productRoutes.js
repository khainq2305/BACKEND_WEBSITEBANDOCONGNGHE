const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { validateSimpleProduct } = require('../../validations/validateSimpleProduct');

const upload = require('../../middlewares/upload');

router.post(
  '/product/create',
  upload.any(), // THAY ĐỔI Ở ĐÂY: Chấp nhận tất cả các file từ mọi trường
  validateSimpleProduct,
  ProductController.create
);
// Xoá mềm 1 sản phẩm
router.delete('/product/soft/:id', ProductController.softDelete);

// Xoá mềm nhiều sản phẩm
router.post('/product/soft-delete-many', ProductController.softDeleteMany);

// Khôi phục 1 sản phẩm
router.patch('/product/restore/:id', ProductController.restore);

// Khôi phục nhiều sản phẩm
router.post('/product/restore-many', ProductController.restoreMany);

// Xoá vĩnh viễn 1 sản phẩm
router.delete('/product/force/:id', ProductController.forceDelete);

router.get('/brands/list', ProductController.getBrandList);
// ✅ Route TẠO SẢN PHẨM đúng yêu cầu
router.post('/product/update-order', ProductController.updateOrderIndexBulk);

// (Nếu cần)
router.get('/product/list', ProductController.getAll);    // 👉 GET danh sách
router.get('/categories/tree', ProductController.getCategoryTree);

module.exports = router;
