// routes/games.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all games
router.get('/', async (req, res) => {
  try {
    const { season_id, division_id } = req.query;
    
    let query = supabase
      .from('games')
      .select(`
        *,
        home_team:home_team_id (name, color),
        away_team:away_team_id (name, color),
        division:division_id (name),
        season:season_id (name)
      `)
      .order('game_date', { ascending: true });

    if (season_id) query = query.eq('season_id', season_id);
    if (division_id) query = query.eq('division_id', division_id);

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new game
router.post('/', async (req, res) => {
  try {
    const gameData = req.body;
    
    const { data, error } = await supabase
      .from('games')
      .insert([gameData])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create multiple games (for bulk scheduling)
router.post('/bulk', async (req, res) => {
  try {
    const { games } = req.body;
    
    const { data, error } = await supabase
      .from('games')
      .insert(games)
      .select();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update game
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const gameData = req.body;
    
    const { data, error } = await supabase
      .from('games')
      .update(gameData)
      .eq('id', id)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete game
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('games')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete all games for a season (useful for regenerating schedule)
router.delete('/season/:season_id', async (req, res) => {
  try {
    const { season_id } = req.params;
    
    const { error } = await supabase
      .from('games')
      .delete()
      .eq('season_id', season_id);

    if (error) throw error;
    res.json({ message: 'All games for season deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;