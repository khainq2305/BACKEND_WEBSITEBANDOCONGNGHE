// src/middlewares/auditMiddleware.js
const AuditLogger = require('../services/admin/auditLogger');

/**
 * Middleware để tự động ghi audit log cho các thao tác CRUD (POST, PUT, PATCH, DELETE)
 * @param {string} entityType - Loại thực thể (Product, User, ...)
 */
const auditMiddleware = (entityType) => {
  return async (req, res, next) => {
    // Lưu lại các hàm gốc
    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);

    // Ghi log khi response trả về thành công
    const auditResponse = async (data) => {
      try {
        if (res.statusCode >= 400) return;
        const method = req.method;
        let entityId = req.params.id || req.body.id;
        let newValue = null;
        let oldValue = req.auditOldValue || null;
        let changedFields = null;

        // Lấy data trả về (nếu có)
        let parsedData;
        try {
          parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        } catch (e) {
          parsedData = data;
        }
        if (parsedData && parsedData.data) {
          newValue = parsedData.data;
          if (!entityId && newValue.id) entityId = newValue.id;
        } else if (req.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
          newValue = req.body;
        }

        switch (method) {
          case 'POST':
            if (entityId && newValue) {
              await AuditLogger.logCreate(entityType, entityId, newValue, req);
            }
            break;
          case 'PUT':
          case 'PATCH':
            if (entityId) {
              if (oldValue && newValue) {
                changedFields = AuditLogger.getChangedFields(oldValue, newValue);
              }
              await AuditLogger.logUpdate(entityType, entityId, oldValue, newValue, req, changedFields);
            }
            break;
          case 'DELETE':
            if (entityId) {
              await AuditLogger.logDelete(entityType, entityId, oldValue, req);
            }
            break;
        }
      } catch (err) {
        console.error('Audit log error:', err);
      }
    };

    // Override res.send
    res.send = function (data) {
      auditResponse(data);
      return originalSend(data);
    };
    // Override res.json
    res.json = function (data) {
      auditResponse(data);
      return originalJson(data);
    };
    next();
  };
};

/**
 * Helper để set oldValue trước khi update/delete
 * Sử dụng trong controller: await setAuditOldValue(req, oldValue)
 */
const setAuditOldValue = async (req, oldValue) => {
  req.auditOldValue = oldValue;
};

module.exports = {
  auditMiddleware,
  setAuditOldValue,
}; 