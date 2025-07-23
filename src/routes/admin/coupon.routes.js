const express = require('express');
const router = express.Router();
const CouponController = require('../../controllers/admin/couponController');
const { validateCoupon } = require('../../validations/couponValidator');
const {upload} = require('.././../config/cloudinary');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { checkJWT } = require('../../middlewares/checkJWT');
const { authorize } = require('../../middlewares/authorize');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Coupon"))
router.post('/create', validateCoupon, CouponController.create);
router.get('/list', CouponController.list);


router.patch('/update/:id',validateCoupon, CouponController.update);


router.delete('/soft/:id', CouponController.softDelete);


router.patch('/restore/:id', CouponController.restore);


router.delete('/force/:id', CouponController.forceDelete);

router.get('/users', CouponController.getUsers);


router.get('/products', CouponController.getProducts);

router.post('/soft-delete-many', CouponController.softDeleteMany);

router.post('/restore-many', CouponController.restoreMany);

router.post('/force-delete-many', CouponController.forceDeleteMany);
router.get('/:id', CouponController.getById);

module.exports = router;
