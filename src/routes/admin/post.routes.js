const express = require('express');
const router = express.Router();
const PostController = require('../../controllers/admin/postController');

router.post('/them-bai-viet', PostController.create);           // Tạo bài viết
router.get('/', PostController.getAll);
router.get('/chinh-sua-bai-viet/:id', PostController.getById);
router.put('/cap-nhat-bai-viet/:id', PostController.update)
router.post('/chuyen-vao-thung-rac', PostController.softDelete);           // Lấy tất cả
router.post('/khoi-phuc', PostController.restore);        // Lấy theo ID
router.put('/:id', PostController.update);         // Cập nhật
router.post('/xoa-vinh-vien', PostController.forceDelete);      // Xoá

module.exports = router;
