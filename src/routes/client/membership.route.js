// routes/membership.js
const router = require("express").Router();
const MembershipController = require("../../controllers/client/membershipController");


router.get("/me", MembershipController.getMembershipInfo);

module.exports = router;
