const express = require('express');
const router = express.Router();
const BrandController = require('../../controllers/admin/brandController');
const { validateBrand } = require('../../validations/brandValidator');
const { upload } = require('../../config/cloudinary');

router.post('/create', upload.single('logoUrl'), validateBrand, BrandController.create);
router.put('/update/:id', upload.single('logoUrl'), validateBrand, BrandController.update);


router.get('/', BrandController.getAll);
router.get('/detail/:id', BrandController.getById);


router.delete('/soft-delete', BrandController.softDelete);
router.patch('/restore', BrandController.restore);
router.delete('/force-delete', BrandController.forceDelete);


router.post('/update-order', BrandController.updateOrderIndex);

module.exports = router;
