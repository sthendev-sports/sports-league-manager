// backend/routes/rolePermissions.js
const express = require('express');
const router = express.Router();

const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');
const {
  loadAllPermissions,
  upsertRolePermissions,
  deleteRole,
} = require('../services/rolePermissions');

// Admin only: manage permissions
router.get('/', authMiddleware, requireRole(ROLES.ADMINISTRATOR), async (req, res) => {
  try {
    const data = await loadAllPermissions(false);
    return res.json({ permissions: data });
  } catch (err) {
    console.error('GET /role-permissions error:', err);
    return res.status(500).json({ error: 'Failed to load role permissions' });
  }
});

router.put('/:role', authMiddleware, requireRole(ROLES.ADMINISTRATOR), async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body || {};
    if (!role || !permissions || typeof permissions !== 'object') {
      return res.status(400).json({ error: 'role and permissions are required' });
    }

    const saved = await upsertRolePermissions(role, permissions);
    return res.json({ role: saved?.role, permissions: saved?.permissions });
  } catch (err) {
    console.error('PUT /role-permissions/:role error:', err);
    return res.status(500).json({ error: 'Failed to save role permissions' });
  }
});

router.delete('/:role', authMiddleware, requireRole(ROLES.ADMINISTRATOR), async (req, res) => {
  try {
    const { role } = req.params;
    if (!role) return res.status(400).json({ error: 'role is required' });

    // Safety: don't allow deleting core roles
    if (['Administrator', 'President'].includes(role)) {
      return res.status(400).json({ error: 'Cannot delete core role' });
    }

    await deleteRole(role);
    return res.json({ success: true });
  } catch (err) {
    console.error('DELETE /role-permissions/:role error:', err);
    return res.status(500).json({ error: 'Failed to delete role' });
  }
});

module.exports = router;
