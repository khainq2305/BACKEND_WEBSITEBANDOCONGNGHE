const express = require('express');
const router = express.Router();
const TagController = require('../../controllers/admin/TagController')


router.get('/', TagController.getAll)


module.exports = router;