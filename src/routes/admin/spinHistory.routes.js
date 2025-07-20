const express = require('express');
const router = express.Router();
const spinHistoryController = require('../../controllers/admin/spinHistoryController'); 

router.get('/list', spinHistoryController.getAll);

router.get('/:id', spinHistoryController.getById);

module.exports = router;
