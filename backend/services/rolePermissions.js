// backend/services/rolePermissions.js
const supabase = require('../config/database');

const TABLE = 'role_permissions';

// In-memory cache to avoid hitting DB on every request
let cache = {
  loadedAt: 0,
  ttlMs: 60_000,
  data: null,
};

const DEFAULT_PERMISSIONS = {
  "Administrator": {
    "Dashboard": "RW",
    "Players": "RW",
    "Teams": "RW",
    "Draft": "RW",
    "Team Uniforms": "RW",
    "Game Scheduler": "RW",
    "Workbond Management": "RW",
    "Volunteers": "RW",
    "Mailing List": "RW",
    "Board Members": "RW",
    "Users": "RW",
    "Email Settings": "RW",
    "Configuration": "RW"
  },
  "President": {
    "Dashboard": "RW",
    "Players": "RW",
    "Teams": "RW",
    "Draft": "RW",
    "Team Uniforms": "RW",
    "Game Scheduler": "RW",
    "Workbond Management": "RW",
    "Volunteers": "RW",
    "Mailing List": "RW",
    "Board Members": "RW",
    "Users": "RW",
    "Email Settings": "RW",
    "Configuration": "RW"
  },
  "Treasurer": {
    "Dashboard": "R",
    "Players": "R",
    "Teams": "R",
    "Draft": "X",
    "Team Uniforms": "R",
    "Game Scheduler": "R",
    "Workbond Management": "R",
    "Volunteers": "R",
    "Mailing List": "R",
    "Board Members": "R",
    "Users": "X",
    "Email Settings": "R",
    "Configuration": "X"
  },
  "Player Agent": {
    "Dashboard": "X",
    "Players": "R",
    "Teams": "R",
    "Draft": "RW",
    "Team Uniforms": "R",
    "Game Scheduler": "X",
    "Workbond Management": "X",
    "Volunteers": "R",
    "Mailing List": "X",
    "Board Members": "X",
    "Users": "X",
    "Email Settings": "X",
    "Configuration": "X",
    "__scope__": {
      "divisions": "assigned"
    }
  },
  "Equipment Manager": {
    "Dashboard": "X",
    "Players": "R",
    "Teams": "R",
    "Draft": "R",
    "Team Uniforms": "RW",
    "Game Scheduler": "X",
    "Workbond Management": "X",
    "Volunteers": "X",
    "Mailing List": "X",
    "Board Members": "X",
    "Users": "X",
    "Email Settings": "X",
    "Configuration": "X"
  },
  "Work Bond Manager": {
    "Dashboard": "X",
    "Players": "R",
    "Teams": "X",
    "Draft": "X",
    "Team Uniforms": "X",
    "Game Scheduler": "X",
    "Workbond Management": "RW",
    "Volunteers": "R",
    "Mailing List": "R",
    "Board Members": "X",
    "Users": "X",
    "Email Settings": "X",
    "Configuration": "X"
  }
};

async function ensureDefaultsExist() {
  // If table is empty, seed defaults
  const { data, error } = await supabase.from(TABLE).select('role').limit(1);
  if (error) throw error;
  if (data && data.length > 0) return;

  const rows = Object.entries(DEFAULT_PERMISSIONS).map(([role, permissions]) => ({
    role,
    permissions,
  }));

  const insertRes = await supabase.from(TABLE).insert(rows);
  if (insertRes.error) throw insertRes.error;
}

async function loadAllPermissions(force = false) {
  const now = Date.now();
  if (!force && cache.data && (now - cache.loadedAt) < cache.ttlMs) {
    return cache.data;
  }

  await ensureDefaultsExist();

  const { data, error } = await supabase.from(TABLE).select('role, permissions');
  if (error) throw error;

  const map = {};
  for (const row of data || []) {
    map[row.role] = row.permissions || {};
  }

  cache = { ...cache, loadedAt: now, data: map };
  return map;
}

async function getPermissionsForRole(role) {
  const all = await loadAllPermissions(false);
  return all[role] || null;
}

async function upsertRolePermissions(role, permissions) {
  // Upsert by role
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ role, permissions }, { onConflict: 'role' })
    .select();

  if (error) throw error;

  // Refresh cache
  await loadAllPermissions(true);
  return data?.[0] || null;
}

async function deleteRole(role) {
  const { error } = await supabase.from(TABLE).delete().eq('role', role);
  if (error) throw error;
  await loadAllPermissions(true);
}

module.exports = {
  loadAllPermissions,
  getPermissionsForRole,
  upsertRolePermissions,
  deleteRole,
  DEFAULT_PERMISSIONS,
};
