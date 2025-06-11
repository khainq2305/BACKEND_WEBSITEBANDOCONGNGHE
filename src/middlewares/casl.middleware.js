const { defineAbilityFor } = require("../utils/ability");

const checkPermission = (action, subject) => {
  return (req, res, next) => {
    const ability = defineAbilityFor(req.user); // req.user phải có .permissions
    if (!ability.can(action, subject)) {
      console.log(ability)
      return res.status(403).json({ message: "Không đủ quyền để thực hiện hành động này!" });
    }

    next();
  };
};

module.exports = { checkPermission };
