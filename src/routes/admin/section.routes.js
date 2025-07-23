const express = require("express");
const router = express.Router();
const SectionController = require("../../controllers/admin/sectionController");
const { upload } = require("../../config/cloudinary");
const { validateSection } = require("../../validations/sectionValidator");
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');

router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Section"))

router.get("/", SectionController.getAllSections);
router.get("/products", SectionController.getAllProducts);
router.get("/categories", SectionController.getAllCategories); 

router.post(
  "/",
  upload.array("bannerImages"),
  validateSection,
  SectionController.createSection
);


router.put(
  "/:slug",
  upload.array("bannerImages"),
  validateSection,
  SectionController.updateSection
);


router.get("/:slug", SectionController.getSectionById);


router.delete("/:id", SectionController.deleteSection);


router.patch("/update-order", SectionController.updateOrderIndexes);

module.exports = router;
