const express = require('express');
const cors = require('cors');
const router = express.Router();
const chatboxController = require('../../controllers/client/chatboxController');

const chatboxCors = cors({
  origin: [
    "https://www.cyberzone.com.vn",
    "http://localhost:3000",
    "http://localhost:5173"
  ],
  methods: ["POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"], // 👈 thêm dòng này
  credentials: true
});

// Cho phép preflight OPTIONS
router.options('/', chatboxCors);

// Xử lý chat
router.post('/', chatboxCors, (req, res) => chatboxController.chat(req, res));

module.exports = router;
