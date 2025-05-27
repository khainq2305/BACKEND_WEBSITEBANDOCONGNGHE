const express = require('express');
const router = express.Router();

const BannerController = require('../../controllers/admin/BannerController');
const PlacementController = require('../../controllers/admin/placementController');
const BannerAssignmentController = require('../../controllers/admin/bannerAssignmentController');

// Banner
router.post('/banners', BannerController.create);
router.get('/banners', BannerController.getAll);
router.get('/banners/:id', BannerController.getById);
router.put('/banners/:id', BannerController.update);
router.delete('/banners/:id', BannerController.delete);

// Placement
router.post('/placements', PlacementController.create);
router.get('/placements', PlacementController.getAll);
router.put('/placements/:id', PlacementController.update);
router.delete('/placements/:id', PlacementController.delete);

// Banner - Placement Assignment
router.post('/assignments', BannerAssignmentController.assign);
router.get('/placements/:placementId/banners', BannerAssignmentController.getByPlacement);
router.delete('/assignments/:id', BannerAssignmentController.delete);

module.exports = router;
