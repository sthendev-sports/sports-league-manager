const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

/**
 * Seasons API
 * - GET    /api/seasons
 * - GET    /api/seasons/active
 * - POST   /api/seasons
 * - PUT    /api/seasons/:id
 * - POST   /api/seasons/copy-structure
 * - DELETE /api/seasons/:id
 */

// Get all seasons
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching seasons:', error);
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
      .maybeSingle();

    if (error) throw error;
    res.json(data || null);
  } catch (error) {
    console.error('Error fetching active season:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new season (optionally copy divisions+teams from an existing season)
router.post('/', async (req, res) => {
  try {
    const { name, year, start_date, end_date, is_active, copy_from_season } = req.body || {};

    if (!name || !year) {
      return res.status(400).json({ error: 'name and year are required' });
    }

    // Determine a source season to copy from:
    // 1) If UI provided copy_from_season, use it
    // 2) Otherwise default to the currently-active season (if any)
    let sourceSeasonId = copy_from_season || null;
    if (!sourceSeasonId) {
      const { data: activeSeason, error: activeErr } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (activeErr) throw activeErr;
      sourceSeasonId = activeSeason?.id || null;
    }

    // If setting active, clear others first
    if (is_active) {
      const { error: clearError } = await supabase
        .from('seasons')
        .update({ is_active: false })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // update all rows
      if (clearError) throw clearError;
    }

    const { data: season, error } = await supabase
      .from('seasons')
      .insert([{
        name,
        year,
        start_date: start_date || null,
        end_date: end_date || null,
        is_active: !!is_active
      }])
      .select()
      .single();

    if (error) throw error;

    // Copy divisions + teams (no players/volunteers) if we have a valid source season
    if (sourceSeasonId && sourceSeasonId !== season.id) {
      // Load source divisions
      const { data: sourceDivisions, error: divErr } = await supabase
        .from('divisions')
        .select('id, name, board_member_id, player_agent_name, player_agent_email, player_agent_phone')
        .eq('season_id', sourceSeasonId)
        .order('created_at', { ascending: true });
      if (divErr) throw divErr;

      // Insert divisions into target
      const divisionsToInsert = (sourceDivisions || []).map(d => ({
        season_id: season.id,
        name: d.name,
        board_member_id: d.board_member_id || null,
        player_agent_name: d.player_agent_name || null,
        player_agent_email: d.player_agent_email || null,
        player_agent_phone: d.player_agent_phone || null
      }));

      let divisionIdMap = new Map();
      if (divisionsToInsert.length) {
        const { data: insertedDivisions, error: insDivErr } = await supabase
          .from('divisions')
          .insert(divisionsToInsert)
          .select('id, name');
        if (insDivErr) throw insDivErr;

        // Map by division name (works because divisions are season-scoped and names are stable in your app)
        const insertedByName = new Map((insertedDivisions || []).map(d => [String(d.name || '').trim(), d.id]));
        (sourceDivisions || []).forEach(sd => {
          const key = String(sd.name || '').trim();
          const newId = insertedByName.get(key);
          if (newId) divisionIdMap.set(sd.id, newId);
        });
      }

      // Load source teams
      const { data: sourceTeams, error: teamErr } = await supabase
        .from('teams')
        .select('id, name, division_id, color, manager_name, manager_email, manager_phone, volunteer_manager_id, volunteer_assistant_coach_id, volunteer_team_parent_id')
        .eq('season_id', sourceSeasonId)
        .order('created_at', { ascending: true });
      if (teamErr) throw teamErr;

      // Insert teams into target (remap division_id)
      const teamsToInsert = (sourceTeams || []).map(t => ({
        season_id: season.id,
        name: t.name,
        division_id: t.division_id ? (divisionIdMap.get(t.division_id) || null) : null,
        color: t.color || null,
        manager_name: t.manager_name || null,
        manager_email: t.manager_email || null,
        manager_phone: t.manager_phone || null,}));

      if (teamsToInsert.length) {
        const { error: insTeamErr } = await supabase.from('teams').insert(teamsToInsert);
        if (insTeamErr) throw insTeamErr;
      }
    }

    res.status(201).json(season);
  } catch (error) {
    console.error('Error creating season:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update season
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, year, start_date, end_date, is_active } = req.body || {};

    // If setting active, clear others first
    if (is_active) {
      const { error: clearError } = await supabase
        .from('seasons')
        .update({ is_active: false })
        .neq('id', id);
      if (clearError) throw clearError;
    }

    const updateData = {
      ...(name !== undefined ? { name } : {}),
      ...(year !== undefined ? { year } : {}),
      ...(start_date !== undefined ? { start_date: start_date || null } : {}),
      ...(end_date !== undefined ? { end_date: end_date || null } : {}),
      ...(is_active !== undefined ? { is_active: !!is_active } : {})
    };

    const { data, error } = await supabase
      .from('seasons')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating season:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Copy division + team structure from one season to another.
 * Copies:
 *  - divisions: name, board_member_id, player_agent_* fields
 *  - teams: name, color, manager_* fields, division mapping
 * Does NOT copy players, volunteers, or any volunteer assignments on teams.
 */
router.post('/copy-structure', async (req, res) => {
  try {
    const { source_season_id, target_season_id } = req.body || {};
    if (!source_season_id || !target_season_id) {
      return res.status(400).json({ error: 'source_season_id and target_season_id are required' });
    }

    // Load source divisions
    const { data: sourceDivisions, error: divErr } = await supabase
      .from('divisions')
      .select('id, name, board_member_id, player_agent_name, player_agent_email, player_agent_phone')
      .eq('season_id', source_season_id)
      .order('created_at', { ascending: true });

    if (divErr) throw divErr;

    // Insert divisions into target
    const divisionsToInsert = (sourceDivisions || []).map(d => ({
      season_id: target_season_id,
      name: d.name,
      board_member_id: d.board_member_id || null,
      player_agent_name: d.player_agent_name || null,
      player_agent_email: d.player_agent_email || null,
      player_agent_phone: d.player_agent_phone || null
    }));

    let insertedDivisions = [];
    if (divisionsToInsert.length > 0) {
      const { data: newDivs, error: insDivErr } = await supabase
        .from('divisions')
        .insert(divisionsToInsert)
        .select('id, name');

      if (insDivErr) throw insDivErr;
      insertedDivisions = newDivs || [];
    }

    // Build mapping old_division_id -> new_division_id
    const divIdMap = new Map();
    for (let i = 0; i < (sourceDivisions || []).length; i++) {
      const oldId = sourceDivisions[i].id;
      const newId = insertedDivisions[i]?.id;
      if (oldId && newId) divIdMap.set(oldId, newId);
    }

    // Load source teams
    const { data: sourceTeams, error: teamErr } = await supabase
      .from('teams')
      .select('id, name, color, division_id, manager_name, manager_phone, manager_email')
      .eq('season_id', source_season_id)
      .order('created_at', { ascending: true });

    if (teamErr) throw teamErr;

    // Insert teams into target
    const teamsToInsert = (sourceTeams || []).map(t => ({
      season_id: target_season_id,
      division_id: t.division_id ? (divIdMap.get(t.division_id) || null) : null,
      name: t.name,
      color: t.color || null,
      manager_name: t.manager_name || null,
      manager_phone: t.manager_phone || null,
      manager_email: t.manager_email || null,

      // explicitly DO NOT copy volunteer assignments
      volunteer_manager_id: null,
      volunteer_assistant_coach_id: null,
      volunteer_team_parent_id: null,
      volunteer_id: null
    }));

    let insertedTeams = [];
    if (teamsToInsert.length > 0) {
      const { data: newTeams, error: insTeamErr } = await supabase
        .from('teams')
        .insert(teamsToInsert)
        .select('id, name');

      if (insTeamErr) throw insTeamErr;
      insertedTeams = newTeams || [];
    }

    res.json({
      message: 'Season structure copied successfully',
      copied_divisions: insertedDivisions.length,
      copied_teams: insertedTeams.length
    });
  } catch (error) {
    console.error('Error copying season structure:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete season (relies on FK ON DELETE CASCADE for season-related tables)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // In most schemas, divisions/teams/etc cascade from seasons(id).
    // If your DB doesn't cascade for some tables, use the "Clear Season Data" action first.
    const { error } = await supabase
      .from('seasons')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Season deleted successfully' });
  } catch (error) {
    console.error('Error deleting season:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
