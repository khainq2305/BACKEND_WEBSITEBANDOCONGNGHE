const express = require("express");
const router = express.Router();
const ProductCompareController = require("../../controllers/admin/productCompareController");
router.get("/product-compare", ProductCompareController.getCompareSpecs) ;
module.exports = router;
