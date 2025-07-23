// src/services/admin/auditLogger.js
const { AuditLog } = require('../../models');

class AuditLogger {
  /**
   * Ghi log audit cho các thao tác CRUD
   * @param {Object} options
   */
  static async log({
    eventType,
    entityType,
    entityId,
    req,
    oldValue = null,
    newValue = null,
    changedFields = null,
    metadata = null
  }) {
    try {
      const userId = req.user?.id || null;
      const userEmail = req.user?.email || null;
      const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
      const logData = {
        eventType,
        entityType,
        entityId: String(entityId),
        userId,
        userEmail,
        oldValue: oldValue ? JSON.stringify(oldValue) : null,
        newValue: newValue ? JSON.stringify(newValue) : null,
        changedFields: changedFields ? JSON.stringify(changedFields) : null,
        ipAddress,
        userAgent: req.headers['user-agent'] || null,
        timestamp: new Date(),
        metadata: metadata ? JSON.stringify(metadata) : null
      };
      await AuditLog.create(logData);
      console.log(`[AUDIT LOG] ${eventType} - ${entityType}:${entityId} by ${userEmail || 'system'} newValue:${newValue} - oldValue:${oldValue}`);
      return true;
    } catch (error) {
      console.error('Lỗi khi ghi audit log:', error);
      return false;
    }
  }

  static async logCreate(entityType, entityId, newValue, req, metadata = null) {
    return this.log({
      eventType: 'CREATE', entityType, entityId, req, newValue, metadata
    });
  }

  static async logUpdate(entityType, entityId, oldValue, newValue, req, changedFields = null, metadata = null) {
    return this.log({
      eventType: 'UPDATE', entityType, entityId, req, oldValue, newValue, changedFields, metadata
    });
  }

  static async logDelete(entityType, entityId, oldValue, req, metadata = null) {
    return this.log({
      eventType: 'DELETE', entityType, entityId, req, oldValue, metadata
    });
  }

  static async logRestore(entityType, entityId, newValue, req, metadata = null) {
    return this.log({
      eventType: 'RESTORE', entityType, entityId, req, newValue, metadata
    });
  }

  static getChangedFields(oldObj, newObj) {
    const changedFields = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
    for (const key of allKeys) {
      const oldValue = oldObj?.[key];
      const newValue = newObj?.[key];
      if (["createdAt", "updatedAt", "deletedAt"].includes(key)) continue;
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changedFields.push({ field: key, oldValue, newValue });
      }
    }
    return changedFields;
  }
}

module.exports = AuditLogger; 