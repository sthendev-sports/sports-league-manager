const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all teams (simplified - no volunteer joins for now)
router.get('/', async (req, res) => {
  try {
    const { season_id, division_id } = req.query;
    
    let query = supabase
      .from('teams')
      .select(`
        *,
        division:divisions (name)
      `)
      .order('name', { ascending: true });

    if (season_id) query = query.eq('season_id', season_id);
    if (division_id) query = query.eq('division_id', division_id);

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new team
router.post('/', async (req, res) => {
  try {
    const teamData = req.body;
    
    const { data, error } = await supabase
      .from('teams')
      .insert([teamData])
      .select(`
        *,
        division:divisions (name)
      `);

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update team
// Update team with manager assignment
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const teamData = req.body;
    
    const { data, error } = await supabase
      .from('teams')
      .update(teamData)
      .eq('id', id)
      .select('*');

    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get team roster
router.get('/:id/roster', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('players')
      .select(`
        *,
        family:families (primary_contact_name, primary_contact_email, primary_contact_phone)
      `)
      .eq('team_id', id)
      .order('last_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete team
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
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
    res.status(500).json({ error: error.message });
  }
});

// Get all teams with volunteers and player counts (with role filtering)
router.get('/with-details', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    console.log('Loading teams with details, season:', season_id);
    
    // First get teams with basic info
    let teamsQuery = supabase
      .from('teams')
      .select(`
        *,
        division:divisions (name)
      `)
      .order('name', { ascending: true });

    if (season_id) teamsQuery = teamsQuery.eq('season_id', season_id);

    const { data: teams, error: teamsError } = await teamsQuery;

    if (teamsError) {
      console.error('Error fetching teams:', teamsError);
      throw teamsError;
    }

    console.log(`Found ${teams?.length || 0} teams`);

    // If no teams, return empty array
    if (!teams || teams.length === 0) {
      return res.json([]);
    }

    const teamIds = teams.map(team => team.id);
    
    // Get COMPREHENSIVE player data for these teams - UPDATED TO INCLUDE ALL FIELDS
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        family:families (
          id,
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone,
          work_bond_check_received
        )
      `)
      .in('team_id', teamIds);

    if (playersError) {
      console.error('Error fetching players:', playersError);
      // Don't throw - continue without players
    }

    console.log(`Found ${players?.length || 0} players across teams`);

    // Get volunteers for these teams - ONLY SPECIFIC ROLES
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, name, role, email, phone, team_id')
      .in('team_id', teamIds)
      .in('role', ['Manager', 'Assistant Coach', 'Team Parent']) // ONLY THESE ROLES
      .order('role', { ascending: true });

    if (volunteersError) {
      console.error('Error fetching volunteers:', volunteersError);
      // Don't throw - continue without volunteers
    }

    console.log(`Found ${volunteers?.length || 0} volunteers across teams (filtered by role)`);

    // Combine the data
    const teamsWithDetails = teams.map(team => {
      const teamPlayers = players?.filter(p => p.team_id === team.id) || [];
      const teamVolunteers = volunteers?.filter(v => v.team_id === team.id) || [];
      
      return {
        ...team,
        players: teamPlayers,
        volunteers: teamVolunteers,
        player_count: teamPlayers.length,
        // Find specific volunteer roles
        manager: teamVolunteers.find(v => v.role === 'Manager') || null,
        assistant_coach: teamVolunteers.find(v => v.role === 'Assistant Coach') || null,
        team_parent: teamVolunteers.find(v => v.role === 'Team Parent') || null
      };
    });

    console.log('Teams with details processed successfully');
    res.json(teamsWithDetails);
  } catch (error) {
    console.error('Error in teams/with-details:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;