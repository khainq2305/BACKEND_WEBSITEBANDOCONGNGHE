const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/client/userPointController');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/', checkJWT, UserController.getUserPoints);

router.get('/history', checkJWT, UserController.getPointHistory);

module.exports = router;
