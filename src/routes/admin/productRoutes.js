const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { validateSimpleProduct } = require('../../validations/validateSimpleProduct');
const { upload } = require('../../config/cloudinary');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize'); // Import middleware phân quyền thông minh

// =================================================================
// ÁP DỤNG MIDDLEWARE CHUNG CHO TẤT CẢ CÁC ROUTE BÊN DƯỚI
// =================================================================
router.use(checkJWT);
router.use(attachUserDetail);

// =================================================================
// MIDDLEWARE XỬ LÝ RIÊNG CHO PRODUCT (khi có multipart/form-data)
// =================================================================
const parseProductBody = (req, res, next) => {
  try {
    if (req.body.product) {
      req.product = JSON.parse(req.body.product);
      // Đảm bảo các trường mediaUrls luôn là array để tránh lỗi
      if (Array.isArray(req.product?.skus)) {
        req.product.skus = req.product.skus.map(sku => ({
          ...sku,
          mediaUrls: Array.isArray(sku.mediaUrls) ? sku.mediaUrls : [],
        }));
      }
    } else {
      req.product = req.body;
    }
    next();
  } catch (error) {
    return res.status(400).json({ message: 'Dữ liệu sản phẩm không hợp lệ', error: error.message });
  }
};

// =================================================================
// ĐỊNH NGHĨA CÁC ROUTE VỚI PHÂN QUYỀN TỰ ĐỘNG
// =================================================================

// --- Quản lý Product ---
router.get('/product/list', authorize('Product'), ProductController.getAll);
router.get('/product/:slug', authorize('Product'), ProductController.getById);

router.post(
  '/product/create',
  authorize('Product'), // POST -> 'create'
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  ProductController.create
);

router.put(
  '/product/update/:slug',
  authorize('Product'), // PUT -> 'update'
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  ProductController.update
);

router.delete('/product/soft/:id', authorize('Product'), ProductController.softDelete); // DELETE -> 'delete'
router.delete('/product/force/:id', authorize('Product'), ProductController.forceDelete); // DELETE -> 'delete'
router.patch('/product/restore/:id', authorize('Product', 'update'), ProductController.restore); // PATCH -> Ghi đè thành 'update'
router.post('/product/update-order', authorize('Product', 'update'), ProductController.updateOrderIndexBulk); // POST -> Ghi đè thành 'update'

// --- Xử lý hàng loạt ---
router.post('/product/force-delete-many', authorize('Product', 'delete'), ProductController.forceDeleteMany); // POST -> Ghi đè thành 'delete'
router.post('/product/soft-delete-many', authorize('Product', 'delete'), ProductController.softDeleteMany); // POST -> Ghi đè thành 'delete'
router.post('/product/restore-many', authorize('Product', 'update'), ProductController.restoreMany); // POST -> Ghi đè thành 'update'

// --- Lấy dữ liệu từ các model liên quan ---
router.get('/categories/tree', authorize('Category', 'read'), ProductController.getCategoryTree); // Cần quyền đọc Category
router.get('/brands/list', authorize('Brand', 'read'), ProductController.getBrandList); // Cần quyền đọc Brand

module.exports = router;
