const express = require("express");
const router = express.Router();
const CategoryProductController = require("../../controllers/admin/categoryProductController");
const { upload } = require("../../config/cloudinary");
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");


router.use(checkJWT);
const {
  validateCategoryProduct,
  validateCategoryUpdate,
} = require("../../validations/categoryProductValidator");
router.get("/nested", CategoryProductController.getAllNested);

router.get("/", CategoryProductController.getAll);
router.get("/:id", CategoryProductController.getById);

router.post(
  "/",
  upload.single("thumbnail"),
  validateCategoryProduct,
  CategoryProductController.create
);

router.put(
  "/:id",
  upload.single("thumbnail"),
  validateCategoryUpdate,
  CategoryProductController.update
);
router.delete("/soft-delete/:id", CategoryProductController.softDelete); 
router.post("/force-delete-many", CategoryProductController.forceDeleteMany);
router.post("/soft-delete", CategoryProductController.softDeleteMany);

router.post("/restore/:id", CategoryProductController.restore);
router.delete("/force-delete/:id", CategoryProductController.forceDelete);

router.post("/update-order-index", CategoryProductController.updateOrderIndex);
router.post("/restore-all", CategoryProductController.restoreAll);
router.post("/restore-many", CategoryProductController.restoreMany);



module.exports = router;
