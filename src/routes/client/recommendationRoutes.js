// src/routes/recommendationRoutes.js

const express = require('express');
const router = express.Router();
const RecommendationController = require('../../controllers/client/RecommendationController'); 
const { checkJWT } = require('../../middlewares/checkJWT');
router.get('/',   checkJWT,RecommendationController.getRecommendations);

module.exports = router;