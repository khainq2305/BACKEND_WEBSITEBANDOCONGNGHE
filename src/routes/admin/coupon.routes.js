const express = require('express');
const router = express.Router();
const CouponController = require('../../controllers/admin/couponController');
const { validateCoupon } = require('../../validations/couponValidator');
const {upload} = require('.././../config/cloudinary')
router.post('/coupon/create', validateCoupon, CouponController.create);
router.get('/coupon/list', CouponController.list);


router.patch('/coupon/update/:id',validateCoupon, CouponController.update);


router.delete('/coupon/soft/:id', CouponController.softDelete);


router.patch('/coupon/restore/:id', CouponController.restore);


router.delete('/coupon/force/:id', CouponController.forceDelete);

router.get('/coupon/users', CouponController.getUsers);


router.get('/coupon/categories', CouponController.getCategories);


router.get('/coupon/products', CouponController.getProducts);

router.post('/coupon/soft-delete-many', CouponController.softDeleteMany);

router.post('/coupon/restore-many', CouponController.restoreMany);

router.post('/coupon/force-delete-many', CouponController.forceDeleteMany);
router.get('/coupon/:id', CouponController.getById);

module.exports = router;
