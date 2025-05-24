const express = require('express');
const router = express.Router();
const PostController = require('../../controllers/admin/postController');
const { Post } = require('../../models/index')
const autoSlug = require('../../middlewares/autoSlug')
const pagination = require('../../middlewares/pagination')
router.post('/them-bai-viet-moi',autoSlug(Post), PostController.create);           // Tạo bài viết
router.get('/',pagination, PostController.getAll);
router.get('/chinh-sua-bai-viet/:slug', PostController.getBySlug);
router.put('/cap-nhat-bai-viet/:slug', autoSlug(Post), PostController.update);
router.post('/chuyen-vao-thung-rac', PostController.softDelete);           // Lấy tất cả
router.post('/khoi-phuc', PostController.restore);        // Lấy theo ID
router.put('/:slug', PostController.update);         // Cập nhật
router.post('/xoa-vinh-vien', PostController.forceDelete);      // Xoá

module.exports = router;
