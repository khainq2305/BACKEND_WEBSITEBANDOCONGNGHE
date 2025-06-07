const express = require('express');
const router = express.Router();
const NotificationUserController = require('../../controllers/admin/notificationUser.controller');
const { checkJWT  } = require('../../middlewares/checkJWT');

// POST /admin/notification-users
router.post('/', checkJWT,  NotificationUserController.createMany);

// GET /admin/notification-users/:notificationId
router.get('/:notificationId', checkJWT, NotificationUserController.getUsersByNotification);

// DELETE /admin/notification-users/:notificationIddd//
router.delete('/:notificationId', checkJWT,  NotificationUserController.deleteByNotification);

module.exports = router;
