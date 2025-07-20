const express = require('express');
const router = express.Router();
const NotificationUserController = require('../../controllers/admin/notificationUser.controller');
const NotificationController = require('../../controllers/admin/notification.controller'); // 👈 thêm dòng này

const { checkJWT  } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail '); // 👈 THÊM

router.post('/', checkJWT,  NotificationUserController.createMany);
router.get('/:notificationId', checkJWT, NotificationUserController.getUsersByNotification);
router.delete('/:notificationId', checkJWT,  NotificationUserController.deleteByNotification);
router.patch('/:id/read', checkJWT, attachUserDetail, NotificationController.markAsRead);
router.patch('/read-all', checkJWT, attachUserDetail, NotificationController.markAllAsRead);

module.exports = router;
