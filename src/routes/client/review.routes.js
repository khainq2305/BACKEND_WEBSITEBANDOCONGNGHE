const router = require("express").Router();
const ReviewController = require("../../controllers/client/reviewController");
const { checkJWT } = require("../../middlewares/checkJWT");
const {upload }= require("../../config/cloudinary");
const { validateReview } = require("../../validations/reviewValidator");

router.post(
  "/create",
  checkJWT,
  upload.array("media", 5),
  validateReview,
  ReviewController.create
);

router.get("/sku/:id", ReviewController.getBySkuId);

router.get('/check-can-review/:skuId', checkJWT, ReviewController.checkCanReview);

router.get('/:id/can-edit', checkJWT, ReviewController.checkCanEdit);

router.put('/:id', checkJWT, upload.array("media", 5), validateReview, ReviewController.update);

module.exports = router;
