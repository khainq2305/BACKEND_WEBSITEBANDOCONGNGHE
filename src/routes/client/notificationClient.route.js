const express = require('express');
const router = express.Router();
const NotificationClientController = require('../../controllers/client/notificationClient.controller');
const { checkJWT } = require('../../middlewares/checkJWT');

// ✅ Lấy danh sách thông báo của user hiện tại
router.get('/', checkJWT, NotificationClientController.getForCurrentUser);

// ✅ Đánh dấu một thông báo là đã đọc
router.patch('/:id/read', checkJWT, NotificationClientController.markAsRead);

// ✅ Đánh dấu tất cả thông báo là đã đọc
router.patch('/read-all', checkJWT, NotificationClientController.markAllAsRead);

module.exports = router;
