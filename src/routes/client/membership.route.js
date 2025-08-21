// console.log('🐛 membership.route.js LOADED');

const router = require("express").Router();
const MembershipController = require("../../controllers/client/membershipController");
const { checkJWT } = require('../../middlewares/checkJWT');

// Thêm log ở handler
router.get("/me", checkJWT, MembershipController.getMembershipInfo);


module.exports = router;
