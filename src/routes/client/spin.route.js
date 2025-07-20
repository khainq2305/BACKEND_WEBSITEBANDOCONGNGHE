const express = require('express');
const router = express.Router();
const SpinController = require('../../controllers/client/spinController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/rewards', checkJWT, SpinController.getRewards);

router.get('/status', checkJWT, SpinController.getSpinStatus);

router.post('/roll', checkJWT, SpinController.spin);

router.get('/history', checkJWT, SpinController.getHistory);


module.exports = router;
