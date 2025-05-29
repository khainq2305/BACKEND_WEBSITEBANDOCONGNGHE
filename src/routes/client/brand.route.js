const express = require('express');
const router = express.Router();
const BrandController = require('../../controllers/client/brandController');

router.get('/', BrandController.getAll);

module.exports = router;
