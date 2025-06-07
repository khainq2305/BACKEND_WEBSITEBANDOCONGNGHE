const express = require('express');
const router = express.Router();
const CouponController = require('../../controllers/admin/couponController');
const { validateCoupon } = require('../../validations/couponValidator');
const {upload} = require('.././../config/cloudinary')
// Tạo mới
router.post('/coupon/create', validateCoupon, CouponController.create);
// Tạo mới


// Danh sách + tìm kiếm + phân trang
router.get('/coupon/list', CouponController.list);


router.patch('/coupon/update/:id',validateCoupon, CouponController.update);

// Xoá mềm
router.delete('/coupon/soft/:id', CouponController.softDelete);

// Khôi phục
router.patch('/coupon/restore/:id', CouponController.restore);

// Xoá vĩnh viễn
router.delete('/coupon/force/:id', CouponController.forceDelete);
// Lấy user active
router.get('/coupon/users', CouponController.getUsers);

// Lấy danh mục active
router.get('/coupon/categories', CouponController.getCategories);

// Lấy sản phẩm (SKU) active
router.get('/coupon/products', CouponController.getProducts);
// Xoá mềm nhiều
router.post('/coupon/soft-delete-many', CouponController.softDeleteMany);

// Khôi phục nhiều
router.post('/coupon/restore-many', CouponController.restoreMany);

// Xoá vĩnh viễn nhiều
router.post('/coupon/force-delete-many', CouponController.forceDeleteMany);
router.get('/coupon/:id', CouponController.getById);

module.exports = router;
