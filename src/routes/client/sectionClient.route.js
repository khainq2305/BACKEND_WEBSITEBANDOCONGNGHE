const express = require('express');
const router = express.Router();
const SectionClientController = require('../../controllers/client/sectionClientController');

router.get('/home-sections', SectionClientController.getHomeSections);

module.exports = router;
