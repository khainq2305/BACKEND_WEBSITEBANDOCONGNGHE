const express = require("express");
const PaymentMethodController = require("../../controllers/admin/paymentMethodController");

const router = express.Router();

// /api/payment-methods/...
router.get("/", PaymentMethodController.getAll);
router.post("/", PaymentMethodController.create);
router.put("/:id", PaymentMethodController.update);
router.patch("/:id/toggle", PaymentMethodController.toggleActive);

module.exports = router;
