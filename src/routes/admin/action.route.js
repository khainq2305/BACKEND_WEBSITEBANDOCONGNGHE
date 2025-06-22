const express = require('express');
const router = express.Router();
const actionController = require('../../controllers/admin/actionController');

router.get('/', actionController.getAllActions);

module.exports = router;
