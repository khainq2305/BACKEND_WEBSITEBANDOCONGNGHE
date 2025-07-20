const express = require('express');
const router = express.Router();
const SpinRewardController = require('../../controllers/admin/spinRewardController');

router.get('/list', SpinRewardController.getAll);

router.get('/:id', SpinRewardController.getById);

router.post('/create', SpinRewardController.create);

router.put('/:id', SpinRewardController.update);

router.delete('/:id', SpinRewardController.remove);

module.exports = router;
