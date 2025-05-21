const express = require('express');
const router = express.Router();

const brandRoutes = require('./brand.route'); 

router.use('/brands', brandRoutes);

module.exports = router;
