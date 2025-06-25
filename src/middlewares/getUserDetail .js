const { getUserInfo } = require('../services/admin/auth.service');

const attachUserDetail = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Không xác định được người dùng!' });
    }

    const fullUser = await getUserInfo(req.user.id);
    req.user = fullUser; 
    next();
  } catch (error) {
    res.status(500).json({ message: 'Không lấy được thông tin người dùng!' });
  }
};

module.exports = { attachUserDetail };
