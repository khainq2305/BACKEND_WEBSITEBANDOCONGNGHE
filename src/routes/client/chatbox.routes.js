const express = require('express');
const cors = require('cors');
const router = express.Router();
const chatboxController = require('../../controllers/client/chatboxController');

// chỉ cho phép domain frontend
const chatboxCors = cors({
  origin: ["https://www.cyberzone.com.vn", "http://localhost:3000", "http://localhost:5173"],
  methods: ["POST"],
});

router.post('/', chatboxCors, (req, res) => chatboxController.chat(req, res));

module.exports = router;
