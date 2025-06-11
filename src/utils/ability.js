const { AbilityBuilder, Ability } = require('@casl/ability');

function defineAbilityFor(user) {
  const { can, rules } = new AbilityBuilder(Ability);

  const permissions = user?.permissions || [];
  permissions.forEach(p => {
    can(p.action, p.subject);
  });

  return new Ability(rules);
}


module.exports = { defineAbilityFor };
