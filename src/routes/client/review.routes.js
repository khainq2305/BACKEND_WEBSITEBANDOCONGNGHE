const router = require("express").Router();
const ReviewController = require("../../controllers/client/reviewController");
const { checkJWT } = require("../../middlewares/checkJWT");
const upload = require("../../middlewares/upload");
const { validateReview } = require("../../validations/reviewValidator");

// ⚠️ Tuyệt đối không thêm prefix nào ở đây!
// đúng thứ tự
router.post(
  "/create",
  checkJWT,
  upload.array("media", 5),
  validateReview, // phải đặt sau upload để req.body có dữ liệu
  ReviewController.create
);

router.get("/sku/:id", ReviewController.getBySkuId);


module.exports = router;
