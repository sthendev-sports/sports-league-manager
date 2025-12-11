const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get players for draft with family and volunteer info
router.get('/draft/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { season_id } = req.query;
    
    console.log('Loading draft data for division:', divisionId, 'season:', season_id);

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        family:families (
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        ),
        volunteers:volunteers (
          id,
          name,
          role,
          email,
          phone
        )
      `)
      .eq('division_id', divisionId)
      .eq('season_id', season_id)
      .order('last_name', { ascending: true });

    if (playersError) {
      console.error('Supabase players error:', playersError);
      throw playersError;
    }

    console.log('Players found:', players?.length);

    // Get teams for this division
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('division_id', divisionId)
      .eq('season_id', season_id);

    if (teamsError) {
      console.error('Supabase teams error:', teamsError);
      throw teamsError;
    }

    console.log('Teams found:', teams?.length);

    // Get player agents
    const { data: playerAgents, error: agentsError } = await supabase
      .from('division_player_agents')
      .select(`
        division:divisions (name),
        board_member:board_members (name, email, phone)
      `)
      .eq('division_id', divisionId)
      .eq('season_id', season_id)
      .single();

    if (agentsError && agentsError.code !== 'PGRST116') {
      console.error('Supabase player agents error:', agentsError);
      // Don't throw this error - it's optional data
    }

    const result = {
      players: players || [],
      teams: teams || [],
      playerAgent: playerAgents || null
    };

    console.log('Final draft data result:', result);
    res.json(result);
  } catch (error) {
    console.error('Complete error in draft route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update player team assignment
router.put('/players/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { team_id } = req.body;

    console.log('Updating player team assignment:', { playerId, team_id });

    const { data, error } = await supabase
      .from('players')
      .update({ team_id })
      .eq('id', playerId)
      .select();

    if (error) {
      console.error('Error updating player:', error);
      throw error;
    }

    console.log('Player updated successfully:', data);
    res.json(data);
  } catch (error) {
    console.error('Error in player update route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update volunteer assignment
router.put('/volunteers/:volunteerId', async (req, res) => {
  try {
    const { volunteerId } = req.params;
    const { team_id, role } = req.body;

    console.log('Updating volunteer assignment:', { volunteerId, team_id, role });

    const { data, error } = await supabase
      .from('volunteers')
      .update({ team_id, role })
      .eq('id', volunteerId)
      .select();

    if (error) {
      console.error('Error updating volunteer:', error);
      throw error;
    }

    console.log('Volunteer updated successfully:', data);
    res.json(data);
  } catch (error) {
    console.error('Error in volunteer update route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update team manager information
router.put('/teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { manager_name, volunteer_manager_id } = req.body;

    console.log('Updating team manager info:', { teamId, manager_name, volunteer_manager_id });

    const { data, error } = await supabase
      .from('teams')
      .update({ 
        manager_name,
        volunteer_manager_id 
      })
      .eq('id', teamId)
      .select();

    if (error) {
      console.error('Error updating team:', error);
      throw error;
    }

    console.log('Team updated successfully:', data);
    res.json(data);
  } catch (error) {
    console.error('Error in team update route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get or create draft session for division
router.get('/session/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { season_id } = req.query;

    // Check for existing draft session
    let { data: session, error } = await supabase
      .from('draft_sessions')
      .select('*')
      .eq('division_id', divisionId)
      .eq('season_id', season_id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    // If no session exists, create one with teams in random order
    if (!session) {
      // Get teams for this division
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id')
        .eq('division_id', divisionId)
        .eq('season_id', season_id);

      if (teamsError) throw teamsError;

      // Randomize draft order
      const draftOrder = teams.map(team => team.id).sort(() => Math.random() - 0.5);

      // Create new session
      const { data: newSession, error: createError } = await supabase
        .from('draft_sessions')
        .insert([{
          division_id: divisionId,
          season_id: season_id,
          draft_order: draftOrder,
          current_pick: 0
        }])
        .select('*')
        .single();

      if (createError) throw createError;
      session = newSession;
    }

    // Get team details for the draft order
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .in('id', session.draft_order);

    if (teamsError) throw teamsError;

    // Map teams to draft order
    const orderedTeams = session.draft_order.map(teamId => 
      teams.find(team => team.id === teamId)
    );

    // Get draft picks
    const { data: picks, error: picksError } = await supabase
      .from('draft_picks')
      .select(`
        *,
        player:players (
          id,
          first_name,
          last_name,
          birth_date,
          gender,
          is_travel_player
        ),
        team:teams (name, color)
      `)
      .eq('draft_session_id', session.id)
      .order('pick_number', { ascending: true });

    if (picksError) throw picksError;

    res.json({
      session: {
        ...session,
        ordered_teams: orderedTeams
      },
      picks: picks || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Make a draft pick
router.post('/pick', async (req, res) => {
  try {
    const { draft_session_id, team_id, player_id, pick_number } = req.body;

    // Create the pick
    const { data: pick, error } = await supabase
      .from('draft_picks')
      .insert([{
        draft_session_id,
        team_id,
        player_id,
        pick_number
      }])
      .select(`
        *,
        player:players (
          id,
          first_name,
          last_name,
          birth_date,
          gender,
          is_travel_player
        ),
        team:teams (name, color)
      `)
      .single();

    if (error) throw error;

    // Update draft session current pick
    const { error: updateError } = await supabase
      .from('draft_sessions')
      .update({ current_pick: pick_number })
      .eq('id', draft_session_id);

    if (updateError) throw updateError;

    res.json(pick);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current draft state
router.get('/state/:draftSessionId', async (req, res) => {
  try {
    const { draftSessionId } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('draft_sessions')
      .select(`
        *,
        picks:draft_picks (
          id,
          pick_number,
          player:players (
            id,
            first_name,
            last_name,
            birth_date,
            gender,
            is_travel_player
          ),
          team:teams (name, color)
        )
      `)
      .eq('id', draftSessionId)
      .single();

    if (sessionError) throw sessionError;

    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;