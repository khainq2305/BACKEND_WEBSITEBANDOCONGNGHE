const express = require('express');
const router = express.Router();
const ProductQuestionController = require('../../controllers/admin/productQuestionController');

// [GET] /admin/product-questions
router.get('/', ProductQuestionController.getAll);

// [POST] /admin/product-questions/reply
router.post('/reply', ProductQuestionController.reply);

module.exports = router;
