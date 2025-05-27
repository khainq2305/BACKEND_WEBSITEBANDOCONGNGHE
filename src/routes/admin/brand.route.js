const express = require('express');
const router = express.Router();
const BrandController = require('../../controllers/admin/brandController');
const { validateBrand } = require('../../validations/brandValidator');
const { upload } = require('../../config/cloudinary');
// Tạo & cập nhật (có hỗ trợ upload logoUrl)
router.post('/create', upload.single('logoUrl'), validateBrand, BrandController.create);
router.put('/update/:id', upload.single('logoUrl'), validateBrand, BrandController.update);

// Danh sách thương hiệu
router.get('/', BrandController.getAll);
router.get('/detail/:id', BrandController.getById);

// Thao tác trạng thái
router.delete('/soft-delete', BrandController.softDelete);
router.patch('/restore', BrandController.restore);
router.delete('/force-delete', BrandController.forceDelete);

// Cập nhật thứ tự
router.post('/update-order', BrandController.updateOrderIndex);

module.exports = router;
