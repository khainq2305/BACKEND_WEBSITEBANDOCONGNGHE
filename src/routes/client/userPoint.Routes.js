const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/client/userPointController');
const { checkJWT } = require('../../middlewares/checkJWT');

// Lấy tổng điểm
router.get('/', checkJWT, UserController.getUserPoints);

// Lấy lịch sử điểm
router.get('/history',        checkJWT, UserController.getPointHistory);

module.exports = router;
