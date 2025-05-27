const express = require('express');
const router = express.Router();
const upload = require('../../middlewares/upload'); // THÊM DÒNG NÀY
const HighlightedCategoryItemController = require('../../controllers/admin/highlightedCategoryItemController');
// Thêm mới danh mục nổi bật (form gửi ảnh)
const { validateHighlightedCategoryItem } = require('../../validations/validateHighlightedCategoryItem');

// Tạo mới
// Lấy danh sách danh mục nổi bật (có phân trang + tìm kiếm)
// 📌 Thay vì `/highlighted-category-items`, bạn nên đổi thành `/highlighted-category-items/list`
router.get('/highlighted-category-items/list', HighlightedCategoryItemController.list);

// Tạo mới danh mục nổi bật



router.post(
  '/highlighted-category-items',
  upload.single('image'),
  validateHighlightedCategoryItem,
  HighlightedCategoryItemController.create
);

// Cập nhật
router.put(
  '/highlighted-category-items/:id',
  upload.single('image'),
  validateHighlightedCategoryItem,
  HighlightedCategoryItemController.update
);

router.post('/highlighted-category-items/delete-many', HighlightedCategoryItemController.deleteMany);

// Cập nhật danh mục nổi bật theo id

router.post('/highlighted-category-items/reorder', HighlightedCategoryItemController.reorder);

// Xoá danh mục nổi bật theo id
router.delete('/highlighted-category-items/:id', HighlightedCategoryItemController.delete);
// Lấy danh sách danh mục cho form chọn
router.get('/highlighted-category-items/categories/list', HighlightedCategoryItemController.getCategories);

// (Tuỳ chọn) Lấy chi tiết 1 item (nếu cần edit form frontend)
router.get('/highlighted-category-items/:id', HighlightedCategoryItemController.getById);

module.exports = router;
