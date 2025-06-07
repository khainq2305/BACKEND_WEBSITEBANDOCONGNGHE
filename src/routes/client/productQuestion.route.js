// src/routes/client/productQuestion.route.js

const express = require('express');
const router = express.Router();
const ProductQuestionController = require('../../controllers/client/productQuestionController');

router.post('/', ProductQuestionController.createQuestion);

router.post('/reply', ProductQuestionController.replyFromUser);

router.get('/:productId', ProductQuestionController.getByProductId);

module.exports = router;
