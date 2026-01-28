// backend/middleware/permissionEnforcer.js
const { getPermissionsForRole } = require('../services/rolePermissions');

// Map API baseUrl -> permission "resource key" (matches role_permissions.permissions JSON keys)
// IMPORTANT: these must match the keys you standardized in role_permissions (lowercase snake_case)
const RESOURCE_BY_BASEURL = {
  '/api/dashboard': 'dashboard',
  '/api/players': 'players',
  '/api/teams': 'teams',
  '/api/uniforms': 'uniforms',
  '/api/draft': 'draft',
  '/api/divisions': 'teams',

  // Configuration/admin data
  '/api/seasons': 'configuration',
  //'/api/teams': 'configuration', 
  '/api/configuration': 'configuration',
  //'/api/divisions': 'configuration', // when routes are mounted at /api and use /divisions
  '/api/trainings': 'configuration',
  '/api/season-export': 'configuration',

  // Volunteers / Board / Mailing
  '/api/volunteers': 'volunteers',
  '/api/volunteer-import': 'volunteers',
  '/api/board-members': 'board_members',
  '/api/families': 'mailing_list',
  '/api/families': 'families',
   '/api/family-manager': 'families',

  // Users / Email
  '/api/users': 'users',
  '/api/email-settings': 'email_settings',
  '/api/notifications': 'email_settings',

  // Scheduling / Workbond
  '/api/games': 'game_scheduler',
  '/api/workbond': 'workbond_management',
  '/api/family-season-workbond': 'workbond_management',
  '/api/family-season-workbond': 'players', 
  '/api/family-season-workbond/batch': 'workbond_management',

  // Requests page
  '/api/requests': 'requests',

  // Misc
  '/api/payment-data': 'dashboard',
};

function normalizeAccessValue(value) {
  // New format: none/read/write
  if (!value) return 'none';
  const v = String(value).toLowerCase();
  if (v === 'none' || v === 'read' || v === 'write') return v;

  // Backward compat: X/R/RW (just in case any old data is still around)
  if (v === 'x') return 'none';
  if (v === 'r') return 'read';
  if (v === 'rw') return 'write';

  return 'none';
}

function isWriteMethod(method) {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes((method || '').toUpperCase());
}

async function permissionEnforcer(req, res, next) {
  try {
    // Skip if not authenticated route
    if (!req.user || !req.user.role) return next();

    const lookupBaseUrl = req._permissionBaseUrl || req.baseUrl;
	const resource = RESOURCE_BY_BASEURL[lookupBaseUrl];
	console.log('[PERM]', req.method, lookupBaseUrl, req.path, '->', resource);
    if (!resource) return next(); // unknown resource -> don't block

    const perms = await getPermissionsForRole(req.user.role);
    if (!perms) return res.status(403).json({ error: 'No permissions defined for role' });

    const access = normalizeAccessValue(perms?.[resource]);

    if (access === 'none') {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (access === 'read' && isWriteMethod(req.method)) {
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
