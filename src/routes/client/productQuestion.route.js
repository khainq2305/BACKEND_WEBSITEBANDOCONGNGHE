const express = require('express');
const router = express.Router();
const ProductQuestionController = require('../../controllers/client/productQuestionController');

router.post('/reply', ProductQuestionController.replyToAdmin);

module.exports = router;
