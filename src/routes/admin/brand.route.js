const express = require('express');
const router = express.Router();
const BrandController = require('../../controllers/admin/brandController');
const { validateBrand } = require('../../validations/brandValidator');
const { upload } = require('../../config/cloudinary');
const {checkJWT} = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Brand"))
router.post('/create', upload.single('logoUrl'), validateBrand, BrandController.create);


router.get('/', BrandController.getAll);
router.get('/detail/:slug', BrandController.getById);
router.put('/update/:slug', upload.single('logoUrl'), validateBrand, BrandController.update);


router.delete('/soft-delete', BrandController.softDelete);
router.patch('/restore', BrandController.restore);
router.delete('/force-delete', BrandController.forceDelete);


router.post('/update-order', BrandController.updateOrderIndex);

module.exports = router;
