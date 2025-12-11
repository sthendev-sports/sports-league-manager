const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all seasons
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active season
router.get('/active', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('is_active', true)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new season
router.post('/', async (req, res) => {
  try {
    const { name, year, start_date, end_date, is_active } = req.body;
    
    const { data, error } = await supabase
      .from('seasons')
      .insert([{ name, year, start_date, end_date, is_active }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update season
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, year, start_date, end_date, is_active } = req.body;
    
    const { data, error } = await supabase
      .from('seasons')
      .update({ name, year, start_date, end_date, is_active })
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get season statistics
router.get('/:id/statistics', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get player counts by division
    const { data: divisionStats, error: divisionError } = await supabase
      .from('players')
      .select(`
        division:divisions (name),
        team_id
      `)
      .eq('season_id', id);

    if (divisionError) throw divisionError;

    // Get team counts
    const { data: teamStats, error: teamError } = await supabase
      .from('teams')
      .select('id, division_id')
      .eq('season_id', id);

    if (teamError) throw teamError;

    // Calculate statistics
    const stats = {
      totalPlayers: divisionStats.length,
      playersWithTeams: divisionStats.filter(p => p.team_id).length,
      totalTeams: teamStats.length,
      playersByDivision: {}
    };

    divisionStats.forEach(player => {
      const divisionName = player.division?.name || 'Unknown';
      stats.playersByDivision[divisionName] = (stats.playersByDivision[divisionName] || 0) + 1;
    });

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
