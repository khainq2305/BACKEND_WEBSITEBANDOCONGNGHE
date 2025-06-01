// src/routes/admin/review.route.js
const express = require('express');
const router = express.Router();
const ReviewController = require('../../controllers/admin/review.controller');
const { validateReply } = require('../../validations/reviewValidator');

// Lấy danh sách review được nhóm theo sản phẩm (thông qua SKU)
router.get('/', ReviewController.getGroupedByProduct);

router.get('/all', ReviewController.getAll);

// Lấy 1 review chi tiết theo Slug (cho trang ReviewAllDetail)
router.get('/detail/slug/:slug', ReviewController.getOneBySlug);

// Lấy danh sách chi tiết review theo SKU
router.get('/:skuId', ReviewController.getBySku);

// Phản hồi đánh giá
router.patch('/reply/:id', validateReply, ReviewController.replyToReview);







module.exports = router;
