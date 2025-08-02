const express = require("express");
const router = express.Router();
const ComboController = require("../../controllers/admin/combo.controller");
const { checkJWT } = require("../../middlewares/checkJWT");
const { attachUserDetail } = require("../../middlewares/getUserDetail ");
const autoSlug = require("../../middlewares/autoSlug");
const { Combo } = require("../../models");
const { upload } = require("../../config/cloudinary");

// 🛡️ Auth
router.use(checkJWT);
router.use(attachUserDetail);

// ✅ Routes
router.get("/", ComboController.getAll);
router.get("/skus", ComboController.getAllSkus);
router.get("/:slug", ComboController.getBySlug);

// ✅ Chỉ giữ 1 route POST để tạo combo
router.post(
  "/",
  upload.single("thumbnail"),
  autoSlug(Combo),
  ComboController.create
);
router.put("/:slug", upload.single("thumbnail"), ComboController.update);

router.put("/:slug", ComboController.update);
router.patch("/restore/:id", ComboController.restore);
router.delete("/force/:id", ComboController.delete);
router.delete("/:id", ComboController.softDelete);
router.post("/soft-delete-many", ComboController.softDeleteMany);

module.exports = router;
