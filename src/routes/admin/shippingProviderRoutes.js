const express = require("express");
const ShippingProviderController = require("../../controllers/admin/shippingProviderController");

const router = express.Router();

// /api/shipping-providers/...
router.get("/", ShippingProviderController.getAll);
router.post("/", ShippingProviderController.create);
router.put("/:id", ShippingProviderController.update);
router.patch("/:id/toggle", ShippingProviderController.toggleActive);

module.exports = router;
