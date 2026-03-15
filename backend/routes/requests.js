const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware } = require('../middleware/auth'); // Remove requireRole

/**
 * Requests API (Player Requests)
 * Base path: /api/requests
 */

// Apply auth middleware to all routes
router.use(authMiddleware);
// REMOVE the requireRole line completely

// Helper function to check permissions
const hasPermission = (user, resource, requiredLevel = 'read') => {
  // Administrators always have full access
  if (user.role === 'Administrator') return true;
  
  // Check user's permissions for this resource
  const userPermission = user.permissions?.[resource];
  
  if (!userPermission) return false;
  
  // Permission hierarchy: none < read < write
  const permissionOrder = { 'none': 0, 'read': 1, 'write': 2 };
  const userLevel = permissionOrder[userPermission] || 0;
  const requiredLevelValue = permissionOrder[requiredLevel] || 1;
  
  return userLevel >= requiredLevelValue;
};

// GET /api/requests?season_id=...
// GET /api/requests?season_id=...
router.get('/', async (req, res) => {
  try {
    const { season_id } = req.query;
    const user = req.user;

    console.log('===== REQUEST DEBUG =====');
    console.log('User making request:', {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions
    });
    console.log('Season ID filter:', season_id);

    // Check if user has read permission for requests
    if (!hasPermission(user, 'requests', 'read')) {
      console.log('PERMISSION DENIED: User lacks read permission for requests');
      return res.status(403).json({ error: 'Access denied. You do not have permission to view requests.' });
    }
    console.log('PERMISSION GRANTED: User has read access');

    let query = supabase
      .from('requests')
      .select(`
        *,
        requesting_player:players!requests_player_id_fkey (
          id,
          first_name,
          last_name,
          birth_date,
          division_id,
          division:divisions (
            id,
            name
          )
        ),
        current_division:divisions!requests_current_division_id_fkey (
          id,
          name
        ),
        new_division:divisions!requests_new_division_id_fkey (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (season_id) {
      console.log('Applying season filter:', season_id);
      query = query.eq('season_id', season_id);
    }

    console.log('Executing Supabase query...');
    const { data, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    console.log(`Query returned ${data?.length || 0} requests`);
    if (data && data.length > 0) {
      console.log('First request sample:', {
        id: data[0].id,
        type: data[0].type,
        program: data[0].program,
        player_id: data[0].player_id
      });
    } else {
      console.log('No requests found in database for this season');
    }

    res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/requests
router.post('/', async (req, res) => {
  try {
    const user = req.user;
    
    // Check if user has write permission for requests
    if (!hasPermission(user, 'requests', 'write')) {
      return res.status(403).json({ error: 'Access denied. You need write permission to create requests.' });
    }

    const {
      season_id,
      player_id,
      parent_request,
      status,
      type,
      program,
      comments,
      current_division_id,
      new_division_id,
      requested_teammate_name
    } = req.body || {};

    if (!season_id) return res.status(400).json({ error: 'season_id is required' });
    if (!player_id) return res.status(400).json({ error: 'player_id is required' });

    const payload = {
      season_id,
      player_id,
      parent_request: parent_request || null,
      status: status || 'Pending',
      type: type || null,
      program: program || null,
      comments: comments || null,
      current_division_id: current_division_id || null,
      new_division_id: new_division_id || null,
      requested_teammate_name: requested_teammate_name || null
    };

    const { data, error } = await supabase
      .from('requests')
      .insert([payload])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating request:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/requests/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Check if user has write permission for requests
    if (!hasPermission(user, 'requests', 'write')) {
      return res.status(403).json({ error: 'Access denied. You need write permission to update requests.' });
    }

    const {
      parent_request,
      status,
      type,
      program,
      comments,
      current_division_id,
      new_division_id,
      requested_teammate_name,
      player_id,
      season_id
    } = req.body || {};

    const updates = {
      parent_request: parent_request ?? null,
      status: status ?? null,
      type: type ?? null,
      program: program ?? null,
      comments: comments ?? null,
      current_division_id: current_division_id ?? null,
      new_division_id: new_division_id ?? null,
      requested_teammate_name: requested_teammate_name ?? null,
      player_id: player_id ?? null,
      season_id: season_id ?? null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('requests')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        requesting_player:players!requests_player_id_fkey (
          id,
          first_name,
          last_name,
          birth_date,
          division_id,
          division:divisions (
            id,
            name
          )
        ),
        current_division:divisions!requests_current_division_id_fkey (
          id,
          name
        ),
        new_division:divisions!requests_new_division_id_fkey (
          id,
          name
        )
      `)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error updating request:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/requests/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Keep delete restricted to Administrators only for safety
    if (user.role !== 'Administrator') {
      return res.status(403).json({ error: 'Access denied. Only Administrators can delete requests.' });
    }

    const { error } = await supabase
      .from('requests')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting request:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;