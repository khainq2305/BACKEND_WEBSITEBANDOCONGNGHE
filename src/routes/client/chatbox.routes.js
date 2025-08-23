// routes/client/chatbox.js
const express = require('express');
const cors = require('cors');
const router = express.Router();
const chatboxController = require('../../controllers/client/chatboxController');

// Preflight cho route này (đảm bảo browser nhận header CORS)
router.options('/', cors());

// Health / debug: trả JSON thay vì Render welcome page khi open URL trực tiếp
router.get('/', cors(), (req, res) => res.json({ message: 'Chatbox endpoint alive' }));

// API chính: xử lý POST tin nhắn
router.post('/', cors(), (req, res) => chatboxController.chat(req, res));

module.exports = router;
