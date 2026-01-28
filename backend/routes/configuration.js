const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { permissionEnforcer } = require('../middleware/permissionEnforcer');

// GET all divisions
router.get('/divisions', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    let query = supabase
      .from('divisions')
      .select('*')
      .order('name', { ascending: true });

    if (season_id) {
      query = query.eq('season_id', season_id);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching divisions:', error);
    res.status(500).json({ error: 'Failed to fetch divisions' });
  }
});

// GET division by ID
router.get('/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('divisions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Division not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching division:', error);
    res.status(500).json({ error: 'Failed to fetch division' });
  }
});

// CREATE new division
router.post('/divisions', async (req, res) => {
  try {
    console.log('Creating new division with data:', req.body);
    
    const { name, player_agent_name, player_agent_email, player_agent_phone, season_id } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Division name is required' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    const { data, error } = await supabase
      .from('divisions')
      .insert([{ 
        name: name.trim(),
        player_agent_name: player_agent_name || null,
        player_agent_email: player_agent_email || null,
        player_agent_phone: player_agent_phone || null,
        season_id: season_id
      }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('Division created successfully:', data);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating division:', error);
    res.status(500).json({ error: 'Failed to create division: ' + error.message });
  }
});

// UPDATE division
router.put('/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, player_agent_name, player_agent_email, player_agent_phone, season_id } = req.body;
    
    console.log('Updating division:', id, 'with data:', req.body);

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Division name is required' });
    }

    const { data, error } = await supabase
      .from('divisions')
      .update({ 
        name: name.trim(),
        player_agent_name: player_agent_name || null,
        player_agent_email: player_agent_email || null,
        player_agent_phone: player_agent_phone || null,
        season_id: season_id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Division not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error updating division:', error);
    res.status(500).json({ error: 'Failed to update division' });
  }
});

// DELETE division
router.delete('/divisions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Deleting division:', id);

    // Check if division has teams assigned
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .eq('division_id', id);

    if (teamsError) throw teamsError;
    if (teams && teams.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete division that has teams assigned. Please reassign teams first.' 
      });
    }
    
    const { data, error } = await supabase
      .from('divisions')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Division not found' });
    }
    
    res.json({ message: 'Division deleted successfully' });
  } catch (error) {
    console.error('Error deleting division:', error);
    res.status(500).json({ error: 'Failed to delete division' });
  }
});

// Protect team create/update/delete that lives in configuration routes
router.use('/teams', authMiddleware, (req, res, next) => {
  // Force permissionEnforcer to treat these as the Teams resource
  req._permissionBaseUrl = '/api/teams';
  return permissionEnforcer(req, res, next);
});

// Teams routes (if they don't exist elsewhere)
router.post('/teams', async (req, res) => {
  try {
    console.log('Creating new team with data:', req.body);
    
    const { name, color, division_id, season_id } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    const { data, error } = await supabase
      .from('teams')
      .insert([{ 
        name: name.trim(),
        color: color || 'blue',
        division_id: division_id || null,
        season_id: season_id
      }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('Team created successfully:', data);
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: 'Failed to create team: ' + error.message });
  }
});

router.put('/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, division_id, season_id } = req.body;
    
    console.log('Updating team:', id, 'with data:', req.body);

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    const { data, error } = await supabase
      .from('teams')
      .update({ 
        name: name.trim(),
        color: color || 'blue',
        division_id: division_id || null,
        season_id: season_id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

router.delete('/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Deleting team:', id);
    
    const { data, error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

module.exports = router;