const express = require('express');
const cors = require('cors');
const router = express.Router();
const chatboxController = require('../../controllers/client/chatboxController');

// Cho phép CORS riêng cho route chatbox
router.post('/', cors(), (req, res) => chatboxController.chat(req, res));

module.exports = router;
