const express = require("express");
const router = express.Router();
const ComboController = require("../../controllers/admin/combo.controller");
const { checkJWT } = require("../../middlewares/checkJWT");
const { attachUserDetail } = require("../../middlewares/getUserDetail ");
const autoSlug = require("../../middlewares/autoSlug");
const { Combo } = require("../../models");
const { upload } = require("../../config/cloudinary");
const { createComboValidator, updateComboValidator } = require("../../validations/comboValidator");

// 🛡️ Auth
router.use(checkJWT);
router.use(attachUserDetail);

// ✅ Routes
router.get("/", ComboController.getAll);
router.get("/skus", ComboController.getAllSkus);
router.get("/:slug", ComboController.getBySlug);

// ✅ Tạo combo
router.post(
  "/",
  upload.single("thumbnail"),
  createComboValidator,
  autoSlug(Combo),
  ComboController.create
);

// ✅ Cập nhật combo
router.put(
  "/:slug",
  upload.single("thumbnail"),
  updateComboValidator,
  ComboController.update
);

// ✅ Soft delete / restore / delete nhiều
router.patch("/restore/:id", ComboController.restore);
router.delete("/force/:id", ComboController.delete);
router.delete("/:id", ComboController.softDelete);
router.post("/soft-delete-many", ComboController.softDeleteMany);

module.exports = router;
