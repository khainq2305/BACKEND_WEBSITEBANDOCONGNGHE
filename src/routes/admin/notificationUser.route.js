const express = require('express');
const router = express.Router();
const NotificationUserController = require('../../controllers/admin/notificationUser.controller');
const { checkJWT  } = require('../../middlewares/checkJWT');
router.post('/', checkJWT,  NotificationUserController.createMany);
router.get('/:notificationId', checkJWT, NotificationUserController.getUsersByNotification);
router.delete('/:notificationId', checkJWT,  NotificationUserController.deleteByNotification);

module.exports = router;
