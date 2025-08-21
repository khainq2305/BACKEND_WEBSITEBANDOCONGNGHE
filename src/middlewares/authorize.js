// middlewares/authorize.js
const { checkPermission } = require("./casl.middleware");

const methodToAction = {
  GET: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

// Map URL → custom action
const urlToAction = {
  "reset-password": "resetPassword",
  "lock": "lockAccount",
  "unlock": "unlockAccount",
  "status": "lockAccount",   // 👈 thêm cái này
  "soft-delete": "softDelete",
  "restore": "restore",
  "export": "export",
  "reply": "reply",
  "cancel": "cancel",
};
const authorize = (subject) => {
  return (req, res, next) => {
    // lấy segment cuối trong path (vd: /users/:id/reset-password → reset-password)
    const lastSegment = req.path.split("/").filter(Boolean).pop();
    let finalAction = null;

    if (urlToAction[lastSegment]) {
      finalAction = urlToAction[lastSegment];
    } else {
      finalAction = methodToAction[req.method] || null;
    }

    console.log("  authorize middleware:", {
      method: req.method,
      path: req.path,
      finalAction,
    });

    if (!finalAction) {
      return res.status(405).json({
        message: `Phương thức ${req.method} không được hỗ trợ.`,
      });
    }

    return checkPermission(finalAction, subject)(req, res, next);
  };
};

module.exports = { authorize };
