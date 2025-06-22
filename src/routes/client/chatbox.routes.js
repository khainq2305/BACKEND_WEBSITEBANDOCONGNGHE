const express = require('express');
const router = express.Router();
const chatboxController = require('../../controllers/client/chatboxController');

router.post('/', (req, res) => chatboxController.chat(req, res));

module.exports = router;
