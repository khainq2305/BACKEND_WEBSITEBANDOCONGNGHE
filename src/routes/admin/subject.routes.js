const express = require('express');
const router = express.Router();
const SubjectController = require('../../controllers/admin/SubjectController');

// Route để lấy danh sách tất cả các subject
// GET /api/admin/subjects
router.get('/', SubjectController.findAll);

module.exports = router;