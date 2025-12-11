// backend/config/roles.js

// These are the human-readable role names that will be stored in the "users" table.
// Make sure the values here MATCH what you store in the database.
const ROLES = {
  ADMINISTRATOR: 'Administrator',
  PRESIDENT: 'President',
  TREASURER: 'Treasurer',
  EQUIPMENT_MANAGER: 'Equipment Manager',
  PLAYER_AGENT: 'Player Agent',
  WORKBOND_MANAGER: 'Work Bond Manager',
};

// Helper arrays for convenience (we’ll use these later when protecting routes)
const ADMIN_LIKE_ROLES = [ROLES.ADMINISTRATOR, ROLES.PRESIDENT];
const FINANCE_ROLES = [ROLES.TREASURER, ...ADMIN_LIKE_ROLES];
const WORKBOND_ROLES = [ROLES.WORKBOND_MANAGER, ...ADMIN_LIKE_ROLES];
const EQUIPMENT_ROLES = [ROLES.EQUIPMENT_MANAGER, ...ADMIN_LIKE_ROLES];
const PLAYER_AGENT_ROLES = [ROLES.PLAYER_AGENT, ...ADMIN_LIKE_ROLES];

module.exports = {
  ROLES,
  ADMIN_LIKE_ROLES,
  FINANCE_ROLES,
  WORKBOND_ROLES,
  EQUIPMENT_ROLES,
  PLAYER_AGENT_ROLES,
};
