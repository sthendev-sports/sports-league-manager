// backend/middleware/permissionEnforcer.js
const { getPermissionsForRole } = require('../services/rolePermissions');

// Map API baseUrl -> UI resource name (matches role_permissions keys)
const RESOURCE_BY_BASEURL = {
  '/api/dashboard': 'Dashboard',
  '/api/players': 'Players',
  '/api/teams': 'Teams',
  '/api/draft': 'Draft',
  '/api/seasons': 'Configuration',
  '/api/configuration': 'Configuration',
  '/api/divisions': 'Configuration', // if baseUrl becomes /api in some routers
  '/api/volunteers': 'Volunteers',
  '/api/volunteer-import': 'Volunteers',
  '/api/families': 'Mailing List',
  '/api/board-members': 'Board Members',
  '/api/users': 'Users',
  '/api/email-settings': 'Email Settings',
  '/api/notifications': 'Email Settings',
  '/api/games': 'Game Scheduler',
  '/api/workbond': 'Workbond Management',
  '/api/payment-data': 'Dashboard',
  '/api/season-export': 'Configuration',
};

function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || '').toUpperCase());
}

async function permissionEnforcer(req, res, next) {
  try {
    // Skip if not authenticated route
    if (!req.user || !req.user.role) return next();

    const resource = RESOURCE_BY_BASEURL[req.baseUrl];
    if (!resource) return next(); // unknown resource -> don't block

    const perms = await getPermissionsForRole(req.user.role);
    if (!perms) return res.status(403).json({ error: 'No permissions defined for role' });

    const access = perms[resource] || 'X';

    if (access === 'X') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (access === 'R' && isWriteMethod(req.method)) {
      return res.status(403).json({ error: 'Read-only role: write not allowed' });
    }

    // Attach scope info (e.g., Player Agent)
    const scope = perms.__scope__ || null;
    if (scope && scope.divisions === 'assigned') {
      req.permissionScope = { divisions: 'assigned' };
    }

    return next();
  } catch (err) {
    console.error('permissionEnforcer error:', err);
    return res.status(500).json({ error: 'Permission enforcement error' });
  }
}

module.exports = { permissionEnforcer };
