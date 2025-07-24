const express = require("express");
const router = express.Router();
const NotificationController = require("../../controllers/admin/notification.controller");
const { upload } = require("../../config/cloudinary");
const autoSlug = require("../../middlewares/autoSlug");
const { Notification } = require("../../models");
const {checkJWT} = require ("../../middlewares/checkJWT")
const {attachUserDetail} = require ("../../middlewares/getUserDetail ")
const { authorize } = require("../../middlewares/authorize");

const {
  createNotificationValidator,
  updateNotificationValidator,
} = require("../../validations/notificationValidator");
router.get('/by-role', checkJWT, attachUserDetail, NotificationController.getByRole);

router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("notification"))
router.get("/", NotificationController.getAll);
router.post("/delete-many", NotificationController.deleteMany);
router.get('/slug/:slug', NotificationController.getBySlug);

router.get("/:id", NotificationController.getById);

router.post(
  "/",
  upload.single("image"),
  autoSlug(Notification),
  NotificationController.create
);

router.put(
  "/:id",
  upload.single("image"),
  autoSlug(Notification),
  NotificationController.update
);
router.delete("/:id", NotificationController.delete);

module.exports = router;
