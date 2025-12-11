const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// GET season export data - SEPARATE ROUTE
router.get('/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Exporting data for season:', id);

    // Fetch all data for the season with related information
    const { data: divisions, error: divisionsError } = await supabase
      .from('divisions')
      .select('*')
      .eq('season_id', id);

    if (divisionsError) {
      console.error('Error fetching divisions:', divisionsError);
      throw divisionsError;
    }

    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('season_id', id);

    if (teamsError) {
      console.error('Error fetching teams:', teamsError);
      throw teamsError;
    }

    // Get ALL player fields without specifying them individually
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('season_id', id);

    if (playersError) {
      console.error('Error fetching players:', playersError);
      // Don't throw error for players - they might not exist yet
    }

    // Get families
    const { data: families, error: familiesError } = await supabase
      .from('families')
      .select('*')
      .eq('season_id', id);

    if (familiesError) {
      console.error('Error fetching families:', familiesError);
    }

    // Get volunteers
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('season_id', id);

    if (volunteersError) {
      console.error('Error fetching volunteers:', volunteersError);
    }

    // Calculate age for players based on date_of_birth
    const playersWithAge = players ? players.map(player => {
      let age = '';
      if (player.date_of_birth) {
        const birthDate = new Date(player.date_of_birth);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        // Adjust if birthday hasn't occurred this year
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }
      return {
        ...player,
        age: age.toString()
      };
    }) : [];

    const exportData = {
      season: { id },
      divisions: divisions || [],
      teams: teams || [],
      players: playersWithAge || [],
      families: families || [],
      volunteers: volunteers || [],
      // Debug info to see what fields are available
      debug: {
        playerFields: players && players.length > 0 ? Object.keys(players[0]) : [],
        divisionFields: divisions && divisions.length > 0 ? Object.keys(divisions[0]) : [],
        teamFields: teams && teams.length > 0 ? Object.keys(teams[0]) : []
      }
    };

    console.log('DEBUG - Player fields available:', exportData.debug.playerFields);
    console.log('DEBUG - Division fields available:', exportData.debug.divisionFields);
    console.log('DEBUG - Team fields available:', exportData.debug.teamFields);

    console.log(`Export data retrieved: 
      ${divisions?.length || 0} divisions, 
      ${teams?.length || 0} teams, 
      ${players?.length || 0} players`);

    res.json(exportData);
  } catch (error) {
    console.error('Error exporting season data:', error);
    res.status(500).json({ error: 'Failed to export season data: ' + error.message });
  }
});

// Clear season data - SEPARATE ROUTE
router.delete('/:id/clear-data', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Clearing data for season:', id);

    // Delete in correct order to respect foreign key constraints
    const tables = [
      'volunteer_shifts',
      'volunteers', 
      'players',
      'families'
    ];

    const results = [];

    for (const table of tables) {
      console.log(`Clearing ${table} for season ${id}...`);
      const { data, error, count } = await supabase
        .from(table)
        .delete()
        .eq('season_id', id);
      
      if (error) {
        console.error(`Error clearing ${table}:`, error.message);
        results.push({ table, error: error.message });
      } else {
        console.log(`✓ Cleared ${table}`);
        results.push({ table, success: true, count });
      }
    }

    console.log(`Data cleanup completed for season ${id}!`);
    res.json({ 
      message: 'Season data cleared successfully',
      results 
    });
  } catch (error) {
    console.error('Error clearing season data:', error);
    res.status(500).json({ error: 'Failed to clear season data: ' + error.message });
  }
});

module.exports = router;