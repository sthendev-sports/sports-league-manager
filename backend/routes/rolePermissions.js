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

// CREATE a new role
router.post('/', async (req, res) => {
  try {
    const { role, description, display_order } = req.body;

    if (!role || !role.trim()) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    const roleName = role.trim();

    // Check if role already exists
    const { data: existing, error: checkError } = await supabase
      .from('role_permissions')
      .select('role')
      .eq('role', roleName)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking existing role:', checkError);
      return res.status(500).json({ error: 'Failed to check existing role' });
    }

    if (existing) {
      return res.status(409).json({ error: 'A role with this name already exists' });
    }

    // Create new role with empty permissions by default
    const newRole = {
      role: roleName,
      permissions: {}, // Start with empty permissions
      description: description || null,
      display_order: display_order || 0,
      is_system: false, // User-created roles are not system roles
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('role_permissions')
      .insert([newRole])
      .select()
      .single();

    if (error) {
      console.error('Error creating role:', error);
      return res.status(500).json({ error: 'Failed to create role' });
    }

    console.log('Successfully created new role:', data);
    res.status(201).json(data);
    
  } catch (error) {
    console.error('Error creating role:', error);
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
    const { data: existingRole, error: checkError } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .single();

    if (checkError) {
      return res.status(404).json({ error: 'Role not found' });
    }

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
    
    // Check if role exists
    const { data: existingRole, error: checkError } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .single();

    if (checkError) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // If it's a system role, get system defaults (could be from a config file or hardcoded)
    // For non-system roles, you might want to reset to empty or some default template
    let defaultPermissions = {};
    
    if (existingRole.is_system) {
      // For system roles, you might have predefined defaults
      // This is where you'd load from a config file or constants
      defaultPermissions = {}; // Replace with actual defaults if needed
    }

    const { data, error } = await supabase
      .from('role_permissions')
      .update({
        permissions: defaultPermissions,
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

// DELETE a role
router.delete('/:role', async (req, res) => {
  try {
    const { role } = req.params;

    // Check if role exists and if it's a system role
    const { data: existingRole, error: checkError } = await supabase
      .from('role_permissions')
      .select('*')
      .eq('role', role)
      .single();

    if (checkError) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Prevent deletion of system roles
    if (existingRole.is_system) {
      return res.status(403).json({ error: 'System roles cannot be deleted' });
    }

    // Check if any users are assigned to this role
    const { data: usersWithRole, error: usersError } = await supabase
      .from('users')
      .select('id')
      .eq('role', role)
      .limit(1);

    if (usersError) {
      console.error('Error checking users with role:', usersError);
      return res.status(500).json({ error: 'Failed to check if role is in use' });
    }

    if (usersWithRole && usersWithRole.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete role because it is assigned to one or more users' 
      });
    }

    // Delete the role
    const { error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role);

    if (deleteError) {
      console.error('Error deleting role:', deleteError);
      return res.status(500).json({ error: 'Failed to delete role' });
    }

    console.log('Successfully deleted role:', role);
    res.json({ success: true, message: `Role "${role}" deleted successfully` });
    
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;