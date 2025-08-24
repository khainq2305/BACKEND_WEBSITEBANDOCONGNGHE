const express = require('express');
const router = express.Router();
const SystemSettingController = require('../../controllers/admin/systemSettingController');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
const multer = require('multer');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("SystemSettings"))
const upload = multer({ dest: 'uploads/' });
const { validateSystemSetting } = require('../../validations/validateSystemSetting');


router.get(
  '/',
 
  SystemSettingController.get
);

router.put(
  '/update',
  upload.fields([
    { name: 'siteLogo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
  ]), validateSystemSetting,
  SystemSettingController.update
);

module.exports = router;
