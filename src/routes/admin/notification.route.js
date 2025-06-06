const express = require("express");
const router = express.Router();
const NotificationController = require("../../controllers/admin/notification.controller");
const { upload } = require("../../config/cloudinary");
const autoSlug = require('../../middlewares/autoSlug');
const { Notification } = require('../../models');

const {
  createNotificationValidator,
  updateNotificationValidator,
} = require("../../validations/notificationValidator");

// Các route đứng trước :id
router.get("/", NotificationController.getAll);
router.post("/delete-many", NotificationController.deleteMany);

router.get("/:id", NotificationController.getById);

// Áp dụng middleware validator
// Tạo mới
router.post(
  "/",
  upload.single("image"),
  autoSlug(Notification), // ✅ THÊM DÒNG NÀY
  NotificationController.create
);
// Cập nhật
router.put(
  "/:id",
  upload.single("image"),
  autoSlug(Notification), // ✅ THÊM DÒNG NÀY
  NotificationController.update
);
router.delete("/:id", NotificationController.delete);

module.exports = router;
