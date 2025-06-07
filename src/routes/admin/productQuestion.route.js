const express = require('express');
const router = express.Router();
const ProductQuestionController = require('../../controllers/admin/productQuestionController');
const { validateReply } = require('../../validations/productQuestionValidator');

// 1. Lấy danh sách câu hỏi + phản hồi, có phân trang/search/filter
router.get('/', ProductQuestionController.getAll);

// 2. Lấy chi tiết 1 câu hỏi (Admin view)
//    → Route này rất quan trọng, phải đặt trước các route chung có param để tránh conflict
router.get('/:id', ProductQuestionController.getById);

// 3. Admin gửi phản hồi (reply)
router.post('/reply', validateReply, ProductQuestionController.reply);

// 4. Ẩn câu hỏi hoặc ẩn phản hồi (Admin)
router.patch('/:id/hide', ProductQuestionController.hide);

module.exports = router;
