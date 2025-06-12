const express = require("express");
const router = express.Router();
const SectionController = require("../../controllers/admin/sectionController");
const { upload } = require("../../config/cloudinary");
const { validateSection } = require("../../validations/sectionValidator");
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");


router.use(checkJWT);


router.get("/sections", SectionController.getAllSections);
router.get("/sections/products", SectionController.getAllProducts);
router.get("/sections/categories", SectionController.getAllCategories); 

router.post(
  "/sections",
  upload.array("bannerImages"),
  validateSection,
  SectionController.createSection
);


router.put(
  "/sections/:slug",
  upload.array("bannerImages"),
  validateSection,
  SectionController.updateSection
);


router.get("/sections/:slug", SectionController.getSectionById);


router.delete("/sections/:id", SectionController.deleteSection);


router.patch("/sections/update-order", SectionController.updateOrderIndexes);

module.exports = router;
