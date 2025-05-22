// src/routes/client/shipping.routes.js
const express = require('express');
const router = express.Router();
const shippingController = require('../../controllers/client/shippingController');

router.get('/provinces', shippingController.getProvinces);
router.get('/districts', shippingController.getDistricts);
router.get('/wards', shippingController.getWards);

module.exports = router;
