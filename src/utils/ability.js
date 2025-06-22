const { AbilityBuilder, createMongoAbility } = require('@casl/ability');

/**
 * Tạo ability từ danh sách quyền (permission) và vai trò (roles)
 * @param {Array} permissions - Mảng permission [{ action: 'read', subject: 'User' }, ...]
 * @param {Array} roles - Mảng vai trò [{ name: 'Admin' }, ...]
 */
function defineAbilitiesFor(permissions = [], roles = []) {
  const { can, rules } = new AbilityBuilder(createMongoAbility);

  const isAdmin = roles.some(role => role.name === 'Admin' || role.name === 'super-admin');
  if (isAdmin) {
    
    can('manage', 'all');
    return createMongoAbility(rules);
  }

  for (const perm of permissions) {
    if (perm?.action && perm?.subject) {
      can(perm.action, perm.subject);
    }
  }

  return createMongoAbility(rules);
}

module.exports = { defineAbilitiesFor };
