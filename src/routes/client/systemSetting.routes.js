const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/systemSetting.controller');

router.get('/', controller.getClientSettings);
module.exports = router;
