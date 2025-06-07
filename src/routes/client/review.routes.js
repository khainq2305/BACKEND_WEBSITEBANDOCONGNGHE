const router = require("express").Router();
const ReviewController = require("../../controllers/client/reviewController");
const { checkJWT } = require("../../middlewares/checkJWT");
const upload = require("../../middlewares/upload");
const { validateReview } = require("../../validations/reviewValidator");

router.post(
  "/create",
  checkJWT,
  upload.array("media", 5),
  validateReview,
  ReviewController.create
);

router.get("/sku/:id", ReviewController.getBySkuId);


module.exports = router;
