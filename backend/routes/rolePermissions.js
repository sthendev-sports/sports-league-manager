// backend/routes/rolePermissions.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

// Only Admin can manage role permissions
router.use(authMiddleware);
router.use(requireRole(ROLES.ADMINISTRATOR));

// GET all role permissions
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET specific role permission
router.get('/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const { data, error } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Role not found' });
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE role permissions
router.put('/:role', async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions, description, display_order } = req.body;

    console.log(`Updating role permissions for ${role}:`, permissions);

    // Check if role exists
    const { data: existingRole } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .single();

    if (!existingRole) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // REMOVED: The system role check - allow modifying any role
    
    const updateData = {
      permissions: permissions || {},
      updated_at: new Date().toISOString()
    };

    // Optional fields
    if (description !== undefined) updateData.description = description;
    if (display_order !== undefined) updateData.display_order = display_order;

    const { data, error } = await supabase
      .from('role_permissions')
      .update(updateData)
      .eq('role', role)
      .select()
      .single();

    if (error) throw error;
    
    console.log('Successfully updated role permissions:', data);
    res.json(data);
    
  } catch (error) {
    console.error('Error updating role permissions:', error);
    res.status(500).json({ error: error.message });
  }
});

// RESET role to default permissions
router.post('/:role/reset', async (req, res) => {
  try {
    const { role } = req.params;
    
    // Get default permissions for this role (from system template)
    const { data: defaultPerms } = await supabase
      .from('role_permissions')
      .select('permissions')
      .eq('is_system', true)
      .eq('role', role)
      .single();

    if (!defaultPerms) {
      return res.status(404).json({ error: 'No default template found for this role' });
    }

    const { data, error } = await supabase
      .from('role_permissions')
      .update({
        permissions: defaultPerms.permissions,
        updated_at: new Date().toISOString()
      })
      .eq('role', role)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;