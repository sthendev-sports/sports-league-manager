const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { permissionEnforcer } = require('../middleware/permissionEnforcer');
const emailService = require('../services/emailService');

// Apply auth middleware to all routes
router.use(authMiddleware);
router.use(permissionEnforcer);

// ============================================
// Helper Functions
// ============================================

function determineSportFromDivision(divisionName) {
  if (!divisionName) return 'unknown';
  const name = divisionName.toLowerCase();
  if (name.includes('baseball')) return 'baseball';
  if (name.includes('softball')) return 'softball';
  return 'unknown';
}

function calculateLeagueAge(birthDate, sport) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let cutoff;
  if (sport === 'baseball') {
    cutoff = new Date(now.getFullYear(), 7, 31);
  } else if (sport === 'softball') {
    cutoff = new Date(now.getFullYear() - 1, 11, 31);
  } else {
    return null;
  }
  let age = cutoff.getFullYear() - birth.getFullYear();
  const monthDiff = cutoff.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && cutoff.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// ============================================
// Season Management
// ============================================

// GET /api/all-stars/seasons - Get all All-Star seasons
router.get('/seasons', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('season_type', 'all_star')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching All-Star seasons:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/all-stars/seasons/:id - Get specific season
router.get('/seasons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Season not found' });
    res.json(data);
  } catch (error) {
    console.error('Error fetching season:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/all-stars/seasons - Create All-Star season
router.post('/seasons', async (req, res) => {
  try {
    const { name, year, source_season_id, import_option, shifts_required = 2 } = req.body;

    if (!name || !year) {
      return res.status(400).json({ error: 'Name and year are required' });
    }
    if (!source_season_id) {
      return res.status(400).json({ error: 'Source season is required' });
    }

    const { data: sourceSeason, error: sourceError } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('id', source_season_id)
      .single();

    if (sourceError) {
      return res.status(404).json({ error: 'Source season not found' });
    }

    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .insert([{
        name,
        year,
        season_type: 'all_star',
        source_season_id,
        is_active: false
      }])
      .select()
      .single();

    if (seasonError) throw seasonError;

    const { data: division, error: divisionError } = await supabase
      .from('divisions')
      .insert([{
        name: 'All-Stars',
        season_id: season.id,
        division_type: 'all_star'
      }])
      .select()
      .single();

    if (divisionError) throw divisionError;

    const { error: reqError } = await supabase
      .from('workbond_requirements')
      .insert([{
        season_id: season.id,
        division_id: division.id,
        shifts_required: shifts_required || 2
      }]);

    if (reqError) throw reqError;

    let imported_count = 0;
    if (import_option === 'all' && source_season_id) {
      const { data: players, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('season_id', source_season_id)
        .neq('status', 'withdrawn')
        .order('last_name', { ascending: true });

      if (!playersError && players && players.length > 0) {
        const playersToImport = players.map(p => ({
          first_name: p.first_name,
          last_name: p.last_name,
          birth_date: p.birth_date,
          gender: p.gender,
          family_id: p.family_id,
          season_id: season.id,
          source_player_id: p.id,
          imported_from_season_id: source_season_id,
          is_travel_player: p.is_travel_player || false,
          status: p.status || 'active',
          all_star_jersey_number: null,
          workbond_check_received: false,
          is_new_player: p.is_new_player || false,
          program_title: p.program_title || null,
          division_id: null,
          team_id: null,
          uniform_shirt_size: p.uniform_shirt_size || null,
          uniform_pants_size: p.uniform_pants_size || null,
          source_shirt_size: p.uniform_shirt_size || null,
          source_pants_size: p.uniform_pants_size || null,
          all_star_payment_status: 'not_received',
          all_star_payment_details: null
        }));

        const { error: importError } = await supabase
          .from('players')
          .insert(playersToImport);

        if (!importError) {
          imported_count = playersToImport.length;
        }
      }
    }

    res.status(201).json({
      season,
      division,
      shifts_required: shifts_required || 2,
      imported_count
    });

  } catch (error) {
    console.error('Error creating All-Star season:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/all-stars/seasons/:id - Delete All-Star season
router.delete('/seasons/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await supabase.from('players').delete().eq('season_id', id);
    await supabase.from('teams').delete().eq('season_id', id).eq('team_type', 'all_star');
    await supabase.from('divisions').delete().eq('season_id', id).eq('division_type', 'all_star');
    await supabase.from('workbond_requirements').delete().eq('season_id', id);

    const { error } = await supabase.from('seasons').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'All-Star season deleted successfully' });
  } catch (error) {
    console.error('Error deleting All-Star season:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Team Management
// ============================================

// GET /api/all-stars/seasons/:id/teams
router.get('/seasons/:id/teams', async (req, res) => {
  try {
    const { id: seasonId } = req.params;

    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('season_id', seasonId)
      .eq('team_type', 'all_star')
      .order('created_at', { ascending: true });

    if (teamsError) throw teamsError;

    const teamsWithPlayers = await Promise.all((teams || []).map(async (team) => {
      const { data: players, error: playersError } = await supabase
        .from('players')
        .select('id, first_name, last_name, birth_date, league_age, all_star_jersey_number, workbond_check_received, status, uniform_shirt_size, uniform_pants_size, source_shirt_size, source_pants_size, all_star_payment_status, all_star_payment_details, workbond_check_status, workbond_check_details')
        .eq('team_id', team.id)
        .order('last_name', { ascending: true });

      if (playersError) throw playersError;
      return { ...team, players: players || [] };
    }));

    res.json(teamsWithPlayers || []);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/all-stars/seasons/:id/teams
router.post('/seasons/:id/teams', async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    const { sport, age_group, manager_id } = req.body;

    if (!sport || !age_group) {
      return res.status(400).json({ error: 'Sport and age group are required' });
    }

    let managerName = null;
    let managerEmail = null;
    let managerPhone = null;

    if (manager_id) {
      const { data: volunteer } = await supabase
        .from('volunteers')
        .select('name, email, phone')
        .eq('id', manager_id)
        .single();

      if (volunteer) {
        managerName = volunteer.name;
        managerEmail = volunteer.email;
        managerPhone = volunteer.phone;
      } else {
        const { data: boardMember } = await supabase
          .from('board_members')
          .select('name, email, phone')
          .eq('id', manager_id)
          .single();

        if (boardMember) {
          managerName = boardMember.name;
          managerEmail = boardMember.email;
          managerPhone = boardMember.phone;
        }
      }
    }

    let teamName = `${sport.charAt(0).toUpperCase() + sport.slice(1)} - ${age_group} All-Stars`;
    if (managerName) {
      const lastName = managerName.split(' ').pop();
      teamName = `${teamName} - ${lastName}`;
    }

    const { data, error } = await supabase
      .from('teams')
      .insert([{
        name: teamName,
        season_id: seasonId,
        sport: sport.toLowerCase(),
        age_group: age_group.toUpperCase(),
        team_type: 'all_star',
        manager_name: managerName,
        manager_email: managerEmail,
        manager_phone: managerPhone
      }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/all-stars/teams/:id
router.delete('/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: players } = await supabase
      .from('players')
      .select('id')
      .eq('team_id', id)
      .limit(1);

    if (players && players.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete team with assigned players. Reassign players first.' 
      });
    }

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Team deleted successfully' });
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Player Import
// ============================================

// GET /api/all-stars/seasons/:id/source-divisions
router.get('/seasons/:id/source-divisions', async (req, res) => {
  try {
    const { id: seasonId } = req.params;

    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('source_season_id')
      .eq('id', seasonId)
      .single();

    if (seasonError) {
      return res.status(404).json({ error: 'Season not found' });
    }

    if (!season || !season.source_season_id) {
      return res.status(400).json({ error: 'No source season found' });
    }

    const { data: divisions, error: divisionsError } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('season_id', season.source_season_id)
      .order('name', { ascending: true });

    if (divisionsError) throw divisionsError;

    res.json(divisions || []);
  } catch (error) {
    console.error('Error fetching source divisions:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/all-stars/seasons/:id/source-players
router.get('/seasons/:id/source-players', async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    const { sport, league_age, division_id, travel, search } = req.query;

    console.log('Fetching source players for season:', seasonId);

    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('source_season_id')
      .eq('id', seasonId)
      .single();

    if (seasonError) {
      console.error('Season error:', seasonError);
      return res.status(404).json({ error: 'Season not found' });
    }

    if (!season || !season.source_season_id) {
      return res.status(400).json({ error: 'No source season found' });
    }

    console.log('Source season ID:', season.source_season_id);

    let query = supabase
      .from('players')
      .select(`
        *,
        family:families (
          id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `)
      .eq('season_id', season.source_season_id)
      .neq('status', 'withdrawn')
      .order('last_name', { ascending: true });

    if (division_id && division_id !== '') {
      query = query.eq('division_id', division_id);
    }

    if (travel === 'true') {
      query = query.eq('is_travel_player', true);
    } else if (travel === 'false') {
      query = query.eq('is_travel_player', false);
    }

    if (search && search.trim() !== '') {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    }

    const { data: players, error: playersError } = await query;

    if (playersError) {
      console.error('Players query error:', playersError);
      return res.status(500).json({ error: playersError.message });
    }

    console.log(`Found ${players?.length || 0} players`);

    const { data: divisions, error: divisionsError } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('season_id', season.source_season_id);

    if (divisionsError) {
      console.error('Divisions query error:', divisionsError);
    }

    const divisionMap = {};
    (divisions || []).forEach(d => {
      divisionMap[d.id] = d.name;
    });

    const playersWithAge = (players || []).map(player => {
      const divisionName = divisionMap[player.division_id] || player.program_title || '';
      const playerSport = determineSportFromDivision(divisionName);
      const leagueAge = calculateLeagueAge(player.birth_date, playerSport);
      return {
        ...player,
        league_age: leagueAge,
        league_age_display: leagueAge !== null ? `${leagueAge}U` : 'N/A',
        sport: playerSport,
        division_name: divisionName,
        uniform_shirt_size: player.uniform_shirt_size || null,
        uniform_pants_size: player.uniform_pants_size || null
      };
    });

    let filteredPlayers = playersWithAge;
    if (sport && sport !== 'all') {
      filteredPlayers = filteredPlayers.filter(p => p.sport === sport);
    }

    if (league_age && league_age !== 'all') {
      const ageNum = parseInt(league_age.replace('U', ''));
      if (!isNaN(ageNum)) {
        filteredPlayers = filteredPlayers.filter(p => p.league_age === ageNum);
      }
    }

    console.log(`Returning ${filteredPlayers.length} filtered players`);
    res.json(filteredPlayers);
  } catch (error) {
    console.error('Error fetching source players:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// POST /api/all-stars/seasons/:id/import-players
router.post('/seasons/:id/import-players', async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    const { player_ids } = req.body;

    if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ error: 'No players selected for import' });
    }

    const { data: season } = await supabase
      .from('seasons')
      .select('source_season_id')
      .eq('id', seasonId)
      .single();

    if (!season || !season.source_season_id) {
      return res.status(400).json({ error: 'No source season found' });
    }

    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        family:families (
          id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `)
      .eq('season_id', season.source_season_id)
      .in('id', player_ids)
      .order('last_name', { ascending: true });

    if (playersError) {
      return res.status(500).json({ error: playersError.message });
    }

    if (!players || players.length === 0) {
      return res.status(404).json({ error: 'No players found' });
    }

    let importedCount = 0;
    let updatedCount = 0;
    let errors = [];

    for (const player of players) {
      try {
        // Check if player already exists in All-Star season
        const { data: existingPlayer } = await supabase
          .from('players')
          .select('id')
          .eq('source_player_id', player.id)
          .eq('season_id', seasonId)
          .single();

        if (existingPlayer) {
          // Update existing player
          const { error: updateError } = await supabase
            .from('players')
            .update({
              uniform_shirt_size: player.uniform_shirt_size || null,
              uniform_pants_size: player.uniform_pants_size || null,
              source_shirt_size: player.uniform_shirt_size || null,
              source_pants_size: player.uniform_pants_size || null,
              is_travel_player: player.is_travel_player || false,
              status: player.status || 'active',
              program_title: player.program_title || null
            })
            .eq('id', existingPlayer.id);

          if (updateError) {
            errors.push({ player: `${player.first_name} ${player.last_name}`, error: updateError.message });
          } else {
            updatedCount++;
          }
        } else {
          // Insert new player with payment fields
          const playersToImport = {
            first_name: player.first_name,
            last_name: player.last_name,
            birth_date: player.birth_date,
            gender: player.gender,
            family_id: player.family_id,
            season_id: seasonId,
            source_player_id: player.id,
            imported_from_season_id: season.source_season_id,
            is_travel_player: player.is_travel_player || false,
            status: player.status || 'active',
            all_star_jersey_number: null,
            workbond_check_received: false,
            is_new_player: player.is_new_player || false,
            program_title: player.program_title || null,
            division_id: null,
            team_id: null,
            uniform_shirt_size: player.uniform_shirt_size || null,
            uniform_pants_size: player.uniform_pants_size || null,
            source_shirt_size: player.uniform_shirt_size || null,
            source_pants_size: player.uniform_pants_size || null,
            all_star_payment_status: 'not_received',
            all_star_payment_details: null
          };

          const { error: importError } = await supabase
            .from('players')
            .insert([playersToImport]);

          if (importError) {
            errors.push({ player: `${player.first_name} ${player.last_name}`, error: importError.message });
          } else {
            importedCount++;
          }
        }
      } catch (playerError) {
        console.error(`Error processing player ${player.first_name} ${player.last_name}:`, playerError);
        errors.push({ player: `${player.first_name} ${player.last_name}`, error: playerError.message });
      }
    }

    res.json({
      message: `Imported ${importedCount} new players, updated ${updatedCount} existing players`,
      imported_count: importedCount,
      updated_count: updatedCount,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('Error importing players:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Player Assignment
// ============================================

// GET /api/all-stars/seasons/:id/players
router.get('/seasons/:id/players', async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    const { team_id } = req.query;

    console.log(`Fetching players for All-Star season ${seasonId}`);

    let query = supabase
      .from('players')
      .select('*')
      .eq('season_id', seasonId)
      .order('last_name', { ascending: true });

    if (team_id) {
      query = query.eq('team_id', team_id);
    }

    const { data: players, error: playersError } = await query;

    if (playersError) {
      console.error('Players query error:', playersError);
      throw playersError;
    }

    if (!players || players.length === 0) {
      return res.json([]);
    }

    const teamIds = players.map(p => p.team_id).filter(Boolean);
    let teamMap = {};
    if (teamIds.length > 0) {
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .in('id', teamIds);
      
      if (!teamsError) {
        teams.forEach(t => {
          teamMap[t.id] = t;
        });
      }
    }

    const familyIds = players.map(p => p.family_id).filter(Boolean);
    let familyMap = {};
    if (familyIds.length > 0) {
      const { data: families, error: familiesError } = await supabase
        .from('families')
        .select('*')
        .in('id', familyIds);
      
      if (!familiesError) {
        families.forEach(f => {
          familyMap[f.id] = f;
        });
      }
    }

    let volunteerExemptRolesByFamily = new Map();
    if (familyIds.length > 0) {
      const { data: volunteers, error: volunteersError } = await supabase
        .from('volunteers')
        .select('*')
        .in('family_id', familyIds)
        .eq('season_id', seasonId);
      
      if (!volunteersError) {
        const EXEMPT_ROLES = ['Manager', 'Assistant Coach', 'Team Parent', 'Coach'];
        volunteers.forEach(v => {
          if (EXEMPT_ROLES.includes(v.role) && v.team_id !== null) {
            const key = String(v.family_id);
            if (!volunteerExemptRolesByFamily.has(key)) {
              volunteerExemptRolesByFamily.set(key, new Set());
            }
            volunteerExemptRolesByFamily.get(key).add(v.role);
          }
        });
      }
    }

    let boardRolesByFamily = new Map();
    let boardRolesByEmail = new Map();
    
    const { data: boardMembers, error: boardMembersError } = await supabase
      .from('board_members')
      .select('*')
      .eq('is_active', true);
    
    if (!boardMembersError) {
      boardMembers.forEach(b => {
        if (b.family_id) {
          const key = String(b.family_id);
          if (!boardRolesByFamily.has(key)) {
            boardRolesByFamily.set(key, new Set());
          }
          if (b.role) boardRolesByFamily.get(key).add(b.role);
        }
        
        if (b.email) {
          const emailKey = b.email.toLowerCase().trim();
          if (!boardRolesByEmail.has(emailKey)) {
            boardRolesByEmail.set(emailKey, new Set());
          }
          if (b.role) boardRolesByEmail.get(emailKey).add(b.role);
        }
      });
    }

    const playersWithData = (players || []).map(player => {
      const team = teamMap[player.team_id] || null;
      const family = familyMap[player.family_id] || null;
      
      let leagueAge = player.league_age;
      if (!leagueAge && team?.sport) {
        leagueAge = calculateLeagueAge(player.birth_date, team.sport);
      }

      let isBoardMember = false;
      let isExempt = false;
      let exemptReason = '';

      if (family) {
        const familyIdKeys = [String(family.id), String(family.family_id)].filter(Boolean);
        
        for (const k of familyIdKeys) {
          if (boardRolesByFamily.has(k) && boardRolesByFamily.get(k).size > 0) {
            isBoardMember = true;
            isExempt = true;
            exemptReason = `Board Member: ${Array.from(boardRolesByFamily.get(k)).join(', ')}`;
            break;
          }
        }
        
        if (!isBoardMember) {
          const emails = [
            family.primary_contact_email,
            family.parent2_email
          ].filter(Boolean).map(e => e.toLowerCase().trim());
          
          for (const email of emails) {
            if (boardRolesByEmail.has(email) && boardRolesByEmail.get(email).size > 0) {
              isBoardMember = true;
              isExempt = true;
              exemptReason = `Board Member: ${Array.from(boardRolesByEmail.get(email)).join(', ')}`;
              break;
            }
          }
        }
        
        if (!isExempt) {
          for (const k of familyIdKeys) {
            if (volunteerExemptRolesByFamily.has(k) && volunteerExemptRolesByFamily.get(k).size > 0) {
              isExempt = true;
              exemptReason = `Volunteer: ${Array.from(volunteerExemptRolesByFamily.get(k)).join(', ')}`;
              break;
            }
          }
        }
      }

      let workbondStatus = player.workbond_check_status || 'not_received';
      if (isExempt) {
        workbondStatus = 'exempt';
      }

      return {
        ...player,
        league_age: leagueAge,
        team: team,
        family: family,
        is_board_member: isBoardMember,
        has_exempt_volunteer: isExempt,
        exempt_reason: exemptReason,
        workbond_check_status: workbondStatus,
        all_star_payment_status: player.all_star_payment_status || 'not_received',
        all_star_payment_details: player.all_star_payment_details || null
      };
    });

    console.log(`Returning ${playersWithData.length} players with exemption data`);
    res.json(playersWithData || []);
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/all-stars/seasons/:id/assign
router.post('/seasons/:id/assign', async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    const { player_id, team_id } = req.body;

    if (!player_id || !team_id) {
      return res.status(400).json({ error: 'Player ID and Team ID are required' });
    }

    const { data: playerCheck, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('id', player_id)
      .eq('season_id', seasonId)
      .single();

    if (playerError || !playerCheck) {
      return res.status(404).json({ error: 'Player not found in this season' });
    }

    const { data: teamCheck, error: teamError } = await supabase
      .from('teams')
      .select('id')
      .eq('id', team_id)
      .eq('season_id', seasonId)
      .single();

    if (teamError || !teamCheck) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const { data, error } = await supabase
      .from('players')
      .update({ team_id: team_id })
      .eq('id', player_id)
      .select()
      .single();

    if (error) throw error;

    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('id', team_id)
      .single();

    const { data: family } = await supabase
      .from('families')
      .select('*')
      .eq('id', data.family_id)
      .single();

    let leagueAge = data.league_age;
    if (!leagueAge && team?.sport) {
      leagueAge = calculateLeagueAge(data.birth_date, team.sport);
    }

    res.json({ 
      message: 'Player assigned successfully', 
      player: {
        ...data,
        league_age: leagueAge,
        team: team,
        family: family
      }
    });
  } catch (error) {
    console.error('Error assigning player:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/all-stars/assign/:id
router.delete('/assign/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('players')
      .update({ team_id: null })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Player not found' });

    res.json({ message: 'Player removed from team', player: data });
  } catch (error) {
    console.error('Error removing player:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/all-stars/remove/:id - Remove player from All-Star season entirely
router.delete('/remove/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Player removed from All-Star season successfully' });
  } catch (error) {
    console.error('Error removing player:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/all-stars/players/:id
router.put('/players/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      all_star_jersey_number, 
      workbond_check_received,
      workbond_check_status,
      workbond_check_details,
      uniform_shirt_size,
      uniform_pants_size,
      all_star_payment_status,
      all_star_payment_details
    } = req.body;

    const updateData = {};
    if (all_star_jersey_number !== undefined) {
      updateData.all_star_jersey_number = all_star_jersey_number;
    }
    if (workbond_check_received !== undefined) {
      updateData.workbond_check_received = workbond_check_received;
    }
    if (workbond_check_status !== undefined) {
      updateData.workbond_check_status = workbond_check_status;
    }
    if (workbond_check_details !== undefined) {
      updateData.workbond_check_details = workbond_check_details;
    }
    if (uniform_shirt_size !== undefined) {
      updateData.uniform_shirt_size = uniform_shirt_size;
    }
    if (uniform_pants_size !== undefined) {
      updateData.uniform_pants_size = uniform_pants_size;
    }
    if (all_star_payment_status !== undefined) {
      updateData.all_star_payment_status = all_star_payment_status;
    }
    if (all_star_payment_details !== undefined) {
      updateData.all_star_payment_details = all_star_payment_details;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    console.log('Updating player with data:', updateData);

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, family_id, season_id')
      .eq('id', id)
      .single();

    if (playerError || !player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { data, error } = await supabase
      .from('players')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    let siblingResults = [];
    if ((workbond_check_received !== undefined || workbond_check_status !== undefined) && player.family_id) {
      const { data: siblings, error: siblingError } = await supabase
        .from('players')
        .select('id, first_name, last_name')
        .eq('family_id', player.family_id)
        .eq('season_id', player.season_id)
        .neq('id', id);

      if (!siblingError && siblings && siblings.length > 0) {
        const siblingIds = siblings.map(s => s.id);
        const siblingUpdate = {};
        if (workbond_check_received !== undefined) {
          siblingUpdate.workbond_check_received = workbond_check_received;
        }
        if (workbond_check_status !== undefined) {
          siblingUpdate.workbond_check_status = workbond_check_status;
        }
        if (Object.keys(siblingUpdate).length > 0) {
          const { error: updateError } = await supabase
            .from('players')
            .update(siblingUpdate)
            .in('id', siblingIds);

          if (!updateError) {
            siblingResults = siblings.map(s => ({
              id: s.id,
              name: `${s.first_name} ${s.last_name}`
            }));
          }
        }
      }
    }

    res.json({
      player: data,
      siblings_updated: siblingResults
    });
  } catch (error) {
    console.error('Error updating player:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Dashboard Summary
// ============================================

// GET /api/all-stars/seasons/:id/summary
router.get('/seasons/:id/summary', async (req, res) => {
  try {
    const { id: seasonId } = req.params;

    const { count: teamsCount } = await supabase
      .from('teams')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .eq('team_type', 'all_star');

    const { count: playersCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .not('team_id', 'is', null);

    const { count: volunteersCount } = await supabase
      .from('volunteers')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', seasonId);

    const { count: unassignedCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', seasonId)
      .is('team_id', null);

    res.json({
      teams: teamsCount || 0,
      players: playersCount || 0,
      volunteers: volunteersCount || 0,
      unassigned: unassignedCount || 0
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Available Managers
// ============================================

// GET /api/all-stars/seasons/:id/managers
router.get('/seasons/:id/managers', async (req, res) => {
  try {
    const { id: seasonId } = req.params;

    const { data: volunteers, error: volunteerError } = await supabase
      .from('volunteers')
      .select('id, name, email, phone, role')
      .eq('season_id', seasonId)
      .order('name', { ascending: true });

    if (volunteerError) throw volunteerError;

    const { data: boardMembers, error: boardError } = await supabase
      .from('board_members')
      .select('id, name, email, phone, role')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (boardError) throw boardError;

    const managerMap = new Map();
    (volunteers || []).forEach(v => {
      const key = v.email || v.name;
      if (!managerMap.has(key)) {
        managerMap.set(key, {
          id: v.id,
          name: v.name,
          email: v.email,
          phone: v.phone,
          role: v.role || 'Volunteer',
          source: 'volunteer'
        });
      }
    });

    (boardMembers || []).forEach(b => {
      const key = b.email || b.name;
      if (!managerMap.has(key)) {
        managerMap.set(key, {
          id: b.id,
          name: b.name,
          email: b.email,
          phone: b.phone,
          role: b.role || 'Board Member',
          source: 'board_member'
        });
      }
    });

    res.json(Array.from(managerMap.values()));
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Roster Emails - UPDATED with Exemption Logic
// ============================================

// POST /api/all-stars/seasons/:id/send-rosters
router.post('/seasons/:id/send-rosters', async (req, res) => {
  try {
    const { id: seasonId } = req.params;
    const { team_id } = req.body;

    console.log(`Sending All-Star roster emails for season ${seasonId}`);

    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('name, year')
      .eq('id', seasonId)
      .single();

    if (seasonError) throw seasonError;

    // Get teams with players
    let query = supabase
      .from('teams')
      .select(`
        *,
        players:players (
          id,
          first_name,
          last_name,
          birth_date,
          league_age,
          all_star_jersey_number,
          workbond_check_received,
          uniform_shirt_size,
          uniform_pants_size,
          all_star_payment_status,
          all_star_payment_details,
          workbond_check_status,
          workbond_check_details,
          family_id,
          family:families (
            primary_contact_name,
            primary_contact_email,
            primary_contact_phone,
            parent2_first_name,
            parent2_last_name,
            parent2_email,
            parent2_phone
          )
        )
      `)
      .eq('season_id', seasonId)
      .eq('team_type', 'all_star')
      .not('manager_email', 'is', null);

    if (team_id) {
      query = query.eq('id', team_id);
    }

    const { data: teams, error: teamsError } = await query;

    if (teamsError) {
      console.error('Teams query error:', teamsError);
      throw teamsError;
    }

    if (!teams || teams.length === 0) {
      return res.status(404).json({ error: 'No teams with managers found' });
    }

    // Get board members for exemption checking
    const { data: boardMembers, error: boardMembersError } = await supabase
      .from('board_members')
      .select('*')
      .eq('is_active', true);

    if (boardMembersError) {
      console.error('Board members query error:', boardMembersError);
    }

    // Get volunteers for exemption checking
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('season_id', seasonId);

    if (volunteersError) {
      console.error('Volunteers query error:', volunteersError);
    }

    // Build maps for exemption checking
    const boardRolesByFamily = new Map();
    const boardRolesByEmail = new Map();
    
    (boardMembers || []).forEach(b => {
      if (b.family_id) {
        const key = String(b.family_id);
        if (!boardRolesByFamily.has(key)) {
          boardRolesByFamily.set(key, new Set());
        }
        if (b.role) boardRolesByFamily.get(key).add(b.role);
      }
      if (b.email) {
        const emailKey = b.email.toLowerCase().trim();
        if (!boardRolesByEmail.has(emailKey)) {
          boardRolesByEmail.set(emailKey, new Set());
        }
        if (b.role) boardRolesByEmail.get(emailKey).add(b.role);
      }
    });

    // Build volunteer exemption map
    const EXEMPT_ROLES = ['Manager', 'Assistant Coach', 'Team Parent', 'Coach'];
    const volunteerExemptByFamily = new Map();
    (volunteers || []).forEach(v => {
      if (EXEMPT_ROLES.includes(v.role) && v.team_id !== null && v.family_id) {
        const key = String(v.family_id);
        if (!volunteerExemptByFamily.has(key)) {
          volunteerExemptByFamily.set(key, new Set());
        }
        volunteerExemptByFamily.get(key).add(v.role);
      }
    });

    let sentCount = 0;
    let errors = [];

    for (const team of teams) {
      try {
        const sportName = team.sport ? team.sport.charAt(0).toUpperCase() + team.sport.slice(1) : 'All-Star';
        const subject = `${team.name} - All-Star Roster`;

        let html = `
          <h2 style="color: #1a56db; margin-bottom: 8px;">${team.name}</h2>
          <p style="margin-bottom: 16px; color: #374151;">
            <strong>Season:</strong> ${season.name} (${season.year})<br>
            <strong>Sport:</strong> ${sportName}<br>
            <strong>Age Group:</strong> ${team.age_group || 'N/A'}<br>
            <strong>Manager:</strong> ${team.manager_name || 'Not Assigned'}
          </p>
        `;

        if (team.players && team.players.length > 0) {
          html += `
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">#</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Player Name</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Jersey #</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Shirt Size</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Pant Size</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Payment</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Workbond</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Guardian 1</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Guardian 1 Email</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Guardian 1 Phone</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Guardian 2</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Guardian 2 Email</th>
                  <th style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: left;">Guardian 2 Phone</th>
                </tr>
              </thead>
              <tbody>
          `;

          team.players.forEach((player, index) => {
            const family = player.family || {};
            
            const guardian1Name = family.primary_contact_name || 'N/A';
            const guardian1Email = family.primary_contact_email || 'N/A';
            const guardian1Phone = family.primary_contact_phone || 'N/A';
            
            const guardian2Name = (family.parent2_first_name || family.parent2_name) ? 
              `${family.parent2_first_name || ''} ${family.parent2_last_name || ''}`.trim() || 'N/A' 
              : 'N/A';
            const guardian2Email = family.parent2_email || 'N/A';
            const guardian2Phone = family.parent2_phone || 'N/A';
            
            const shirtSize = player.uniform_shirt_size || 'N/A';
            const pantSize = player.uniform_pants_size || 'N/A';
            const paymentStatus = player.all_star_payment_status === 'received' ? '✓ Paid' : 'Pending';
            const paymentAmount = player.all_star_payment_details?.amount ? ` ($${player.all_star_payment_details.amount})` : '';
            
            // DETERMINE WORKBOND STATUS WITH EXEMPTION LOGIC
            let workbondLabel = 'Not Received';
            let workbondClass = 'background-color: #fef3c7; color: #92400e;';
            
            let isExempt = false;
            
            if (player.family_id) {
              const familyIdKey = String(player.family_id);
              
              if (boardRolesByFamily.has(familyIdKey) && boardRolesByFamily.get(familyIdKey).size > 0) {
                isExempt = true;
              }
              
              if (!isExempt && family) {
                const emails = [
                  family.primary_contact_email,
                  family.parent2_email
                ].filter(Boolean).map(e => e.toLowerCase().trim());
                
                for (const email of emails) {
                  if (boardRolesByEmail.has(email) && boardRolesByEmail.get(email).size > 0) {
                    isExempt = true;
                    break;
                  }
                }
              }
              
              if (!isExempt && volunteerExemptByFamily.has(familyIdKey) && volunteerExemptByFamily.get(familyIdKey).size > 0) {
                isExempt = true;
              }
            }
            
            if (isExempt) {
              workbondLabel = 'Exempt';
              workbondClass = 'background-color: #f3f4f6; color: #374151;';
            } else if (player.workbond_check_status === 'received') {
              workbondLabel = 'Received';
              workbondClass = 'background-color: #d1fae5; color: #065f46;';
            } else if (player.workbond_check_details?.check_number) {
              workbondLabel = 'Received';
              workbondClass = 'background-color: #d1fae5; color: #065f46;';
            }
            
            html += `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: center;">${index + 1}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; font-weight: 500;">${player.first_name} ${player.last_name}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: center;">${player.all_star_jersey_number || 'N/A'}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: center;">${shirtSize}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: center;">${pantSize}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: center;">${paymentStatus}${paymentAmount}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db; text-align: center;">
                  <span style="${workbondClass} padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 500;">${workbondLabel}</span>
                  ${player.workbond_check_details?.check_number ? `<div style="font-size: 10px; color: #6b7280;">#${player.workbond_check_details.check_number}</div>` : ''}
                </td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db;">${guardian1Name}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db;">${guardian1Email}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db;">${guardian1Phone}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db;">${guardian2Name}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db;">${guardian2Email}</td>
                <td style="padding: 8px 12px; border: 1px solid #d1d5db;">${guardian2Phone}</td>
              </tr>
            `;
          });

          html += `
              </tbody>
            </table>
          `;
        } else {
          html += `<p style="color: #6b7280;">No players assigned to this team yet.</p>`;
        }

        html += `
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #4b5563; font-size: 14px;">
            Please contact me with any questions.<br>
            <br>
            Regards,<br>
            <strong>League Admin</strong>
          </p>
        `;

        await emailService.sendEmail({
          to: team.manager_email,
          subject: subject,
          html: html,
          text: `${team.name} - All-Star Roster\n\nPlayers: ${team.players?.map(p => `${p.first_name} ${p.last_name}`).join(', ')}`
        });

        sentCount++;
        console.log(`Sent All-Star roster email to ${team.manager_email} for ${team.name}`);
      } catch (emailError) {
        console.error(`Error sending email to ${team.manager_email}:`, emailError);
        errors.push({
          team: team.name,
          email: team.manager_email,
          error: emailError.message
        });
      }
    }

    res.json({
      message: `Roster emails sent successfully`,
      sent_count: sentCount,
      total_teams: teams.length,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('Error sending roster emails:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;