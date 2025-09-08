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
  "trash": "softDelete",
  "restore": "restore",
  "export": "export",
  "reply": "reply",
  "cancel": "cancel",
};
const authorize = (subject, overrideAction = null) => {
  return (req, res, next) => {
    // lấy segment cuối trong path (vd: /users/:id/reset-password → reset-password)
    const lastSegment = req.path.split("/").filter(Boolean).pop();
    const finalAction = overrideAction || urlToAction[lastSegment] || methodToAction[req.method] || null;

  

    if (!finalAction) {
      return res.status(405).json({
        message: `Phương thức ${req.method} không được hỗ trợ.`,
      });
    }
    console.log('URL Path:', req.path);
    console.log('Last Segment:', lastSegment);
    console.log('HTTP Method:', req.method);
    console.log('Final Action:', finalAction);
    console.log('Subject:', subject);
    
    return checkPermission(finalAction, subject)(req, res, next);
  };
};

module.exports = { authorize };
