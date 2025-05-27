const express = require('express');
const router = express.Router();
const NotificationController = require('../../controllers/admin/notification.controller');
const { upload } = require('../../config/cloudinary');
const { createNotificationValidator, updateNotificationValidator } = require('../../validations/notificationValidator');

// Các route đứng trước :id
router.get('/', NotificationController.getAll);
router.post('/update-order', NotificationController.updateOrderIndex);
router.post('/delete-many', NotificationController.deleteMany);

router.get('/:id', NotificationController.getById);

// Áp dụng middleware validator
router.post('/', upload.single('image'), createNotificationValidator, NotificationController.create);
router.put('/:id', upload.single('image'), updateNotificationValidator, NotificationController.update);
router.delete('/:id', NotificationController.delete);

module.exports = router;
