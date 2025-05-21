const express = require('express');
const router = express.Router();

const {
  getAllBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  restoreBrand,
  forceDeleteBrand
} = require('../../controllers/admin/brandController');


const { validateBrand } = require('../../validations/brandValidator');
// const checkJWT = require('../../middlewares/checkJWT');

// router.use(checkJWT); // Bật nếu cần

// Lấy danh sách & tạo mới brand
router.get('/', getAllBrands);
router.post('/', validateBrand, createBrand);

// Lấy chi tiết, cập nhật, xoá mềm brand
router.get('/:id', getBrandById);
router.put('/:id', validateBrand, updateBrand);
router.delete('/:id', deleteBrand);

// Khôi phục & xoá vĩnh viễn
router.patch('/:id/restore', restoreBrand);
router.delete('/:id/force', forceDeleteBrand);

module.exports = router;
