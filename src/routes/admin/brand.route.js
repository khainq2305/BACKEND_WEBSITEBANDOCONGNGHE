const express = require('express');
const router = express.Router();
const BrandController = require('../../controllers/admin/brandController');
const { validateBrand } = require('../../validations/brandValidator');
const { upload } = require('../../config/cloudinary');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize'); // Import middleware phân quyền thông minh

// =================================================================
// ÁP DỤNG MIDDLEWARE CHUNG CHO TẤT CẢ CÁC ROUTE BÊN DƯỚI
// =================================================================
router.use(checkJWT);
router.use(attachUserDetail); // Thêm vào để lấy thông tin user cho việc phân quyền

// =================================================================
// ĐỊNH NGHĨA CÁC ROUTE VỚI PHÂN QUYỀN TỰ ĐỘNG
// =================================================================

// [POST] /create -> Tự động hiểu action là 'create'
router.post(
  '/create',
  authorize('Brand'),
  upload.single('logoUrl'),
  validateBrand,
  BrandController.create
);

// [GET] / -> Tự động hiểu action là 'read'
router.get('/', authorize('Brand'), BrandController.getAll);

// [GET] /detail/:slug -> Tự động hiểu action là 'read'
router.get('/detail/:slug', authorize('Brand'), BrandController.getById);

// [PUT] /update/:slug -> Tự động hiểu action là 'update'
router.put(
  '/update/:slug',
  authorize('Brand'),
  upload.single('logoUrl'),
  validateBrand,
  BrandController.update
);

// [DELETE] /soft-delete -> Ghi đè action là 'delete'
router.delete('/soft-delete', authorize('Brand', 'delete'), BrandController.softDelete);

// [PATCH] /restore -> Ghi đè action là 'update' vì khôi phục là một dạng cập nhật
router.patch('/restore', authorize('Brand', 'update'), BrandController.restore);

// [DELETE] /force-delete -> Ghi đè action là 'delete'
router.delete('/force-delete', authorize('Brand', 'delete'), BrandController.forceDelete);

// [POST] /update-order -> Ghi đè action là 'update' vì sắp xếp là một dạng cập nhật
router.post('/update-order', authorize('Brand', 'update'), BrandController.updateOrderIndex);

module.exports = router;
