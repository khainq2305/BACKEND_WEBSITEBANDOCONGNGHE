const express = require("express");
const router = express.Router();
const { upload } = require("../../config/cloudinary");

const HighlightedCategoryItemController = require("../../controllers/admin/highlightedCategoryItemController");
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
router.use(checkJWT);
const {
  validateHighlightedCategoryItem,
} = require("../../validations/validateHighlightedCategoryItem");
const { attachUserDetail } = require("../../middlewares/getUserDetail ");
const { authorize } = require("../../middlewares/authorize");
router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("HighlightedCategoryItem"));

router.get("/list", HighlightedCategoryItemController.list);

router.post(
  "/",
  upload.single("image"),
  validateHighlightedCategoryItem,
  HighlightedCategoryItemController.create
);

router.put(
  "/:slug",
  upload.single("image"),
  validateHighlightedCategoryItem,
  HighlightedCategoryItemController.update
);

router.post("/delete-many", HighlightedCategoryItemController.deleteMany);

router.post("/reorder", HighlightedCategoryItemController.reorder);

router.delete("/:id", HighlightedCategoryItemController.delete);

router.get("/categories/list", HighlightedCategoryItemController.getCategories);

router.get("/:slug", HighlightedCategoryItemController.getById);

module.exports = router;
