const express = require('express');
const router = express.Router();
const PostController = require('../../controllers/admin/postController');
const { Post } = require('../../models/index')
const autoSlug = require('../../middlewares/autoSlug')
const pagination = require('../../middlewares/pagination')
const { upload } = require('../../config/cloudinary')
const validatePost = require('../../validations/postValidator')



router.post('/them-bai-viet-moi',upload.single('thumbnail'), validatePost , autoSlug(Post),  PostController.create);           // Tạo bài viết
router.get('/',pagination, PostController.getAll);
router.get('/chinh-sua-bai-viet/:slug', PostController.getBySlug);
router.put('/cap-nhat-bai-viet/:slug',upload.single('thumbnail'), validatePost, autoSlug(Post), PostController.update);
router.post('/chuyen-vao-thung-rac', PostController.softDelete);           // Lấy tất cả
router.post('/khoi-phuc', PostController.restore);        // Lấy theo ID
router.put('/:slug', PostController.update);         // Cập nhật
router.post('/xoa-vinh-vien', PostController.forceDelete);        

module.exports = router;
