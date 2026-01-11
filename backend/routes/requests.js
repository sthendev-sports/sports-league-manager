const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

/**
 * Requests API (Player Requests)
 * Base path: /api/requests
 *
 * Table: requests
 * - id (uuid)
 * - season_id (uuid)
 * - player_id (uuid)
 * - parent_request (text)
 * - status (text)          // Pending | Approved | Denied
 * - type (text)            // Move Up | Move Down | Teammate Request | Volunteer Request | Admin
 * - program (text)         // Baseball | Softball | Admin
 * - comments (text)
 * - current_division_id (uuid)
 * - new_division_id (uuid)
 * - created_at, updated_at
 */

router.use(authMiddleware);
router.use(requireRole('Administrator', 'President'));

// GET /api/requests?season_id=...
router.get('/', async (req, res) => {
  try {
    const { season_id } = req.query;

    let query = supabase
      .from('requests')
.select(`
  *,
  requesting_player:players!requests_player_id_fkey (
    id,
    first_name,
    last_name,
    birth_date,
    division_id
  ),
  requested_player:players!requests_requested_player_id_fkey (
    id,
    first_name,
    last_name,
    birth_date,
    division_id
  )
`)
      .order('created_at', { ascending: false });

    if (season_id) query = query.eq('season_id', season_id);

    const { data, error } = await query;

    if (error) throw error;
    res.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error fetching requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/requests
router.post('/', async (req, res) => {
  try {
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
    const {
      parent_request,
      status,
      type,
      program,
      comments,
      current_division_id,
      new_division_id,
	  requested_teammate_name
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
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
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
