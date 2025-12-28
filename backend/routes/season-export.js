const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// --- Workbond helpers for export (mirrors /api/workbond/summary families tab) ---
function _toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function _computeExemption({ volunteers = [], boardRoles = [] }) {
  const reasons = [];
  const exemptRoles = new Set(['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

  const volRoles = new Set();
  for (const v of volunteers) {
    if (!v) continue;
    if (v.is_approved === false) continue;
    if (v.role && exemptRoles.has(v.role)) volRoles.add(v.role);
  }
  if (volRoles.size > 0) reasons.push(`Volunteer role: ${Array.from(volRoles).sort().join(', ')}`);

  if (boardRoles && boardRoles.length > 0) {
    reasons.push(`Board Member: ${Array.from(new Set(boardRoles)).sort().join(', ')}`);
  }

  return { is_exempt: reasons.length > 0, exempt_reason: reasons.join(' | ') };
}

async function buildWorkbondSummaryForSeason(seasonId) {
  // Players in season
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('id, family_id, division_id, season_id')
    .eq('season_id', seasonId);

  if (playersError) throw playersError;

  // Volunteers in season
  const { data: volunteers, error: volunteersError } = await supabase
    .from('volunteers')
    .select('id, family_id, role, is_approved, season_id, name, email')
    .eq('season_id', seasonId);

  if (volunteersError) throw volunteersError;

  // Shifts in season
  const { data: shifts, error: shiftsError } = await supabase
    .from('workbond_shifts')
    .select('id, season_id, family_id, spots_completed, shift_date, shift_type, description, notes, created_at, updated_at')
    .eq('season_id', seasonId);

  if (shiftsError) throw shiftsError;

  // Requirements in season
  const { data: requirements, error: reqError } = await supabase
    .from('workbond_requirements')
    .select('division_id, shifts_required')
    .eq('season_id', seasonId);

  if (reqError) throw reqError;

  const reqByDivision = new Map((requirements || []).map(r => [String(r.division_id), _toNum(r.shifts_required)]));

  // Board members (global / active)
  const { data: boardMembers, error: boardMembersError } = await supabase
    .from('board_members')
    .select('family_id, role')
    .eq('is_active', true);

  if (boardMembersError) throw boardMembersError;

  const boardRolesByFamily = new Map();
  for (const bm of (boardMembers || [])) {
    if (!bm?.family_id) continue;
    const arr = boardRolesByFamily.get(bm.family_id) || [];
    arr.push(bm.role || 'Board Member');
    boardRolesByFamily.set(bm.family_id, arr);
  }

  // Determine participating families (matches workbond.js behavior)
  const participatingFamilyIds = new Set();
  for (const p of (players || [])) if (p.family_id) participatingFamilyIds.add(p.family_id);
  for (const v of (volunteers || [])) if (v.family_id) participatingFamilyIds.add(v.family_id);
  for (const s of (shifts || [])) if (s.family_id) participatingFamilyIds.add(s.family_id);

  // Families rows
  let families = [];
  if (participatingFamilyIds.size > 0) {
    const ids = Array.from(participatingFamilyIds);
    // chunk to avoid URL length / RPC limits
    const chunkSize = 200;
    const out = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: famChunk, error: famErr } = await supabase
        .from('families')
        .select('id, family_id, primary_contact_name, primary_contact_email, parent2_email')
        .in('id', chunk);

      if (famErr) throw famErr;
      out.push(...(famChunk || []));
    }
    families = out;
  }

  const playersByFamily = new Map();
  for (const p of (players || [])) {
    if (!p.family_id) continue;
    const arr = playersByFamily.get(p.family_id) || [];
    arr.push(p);
    playersByFamily.set(p.family_id, arr);
  }

  const volunteersByFamily = new Map();
  for (const v of (volunteers || [])) {
    if (!v.family_id) continue;
    const arr = volunteersByFamily.get(v.family_id) || [];
    arr.push(v);
    volunteersByFamily.set(v.family_id, arr);
  }

  const completedByFamily = new Map();
  for (const s of (shifts || [])) {
    if (!s.family_id) continue;
    const cur = completedByFamily.get(s.family_id) || 0;
    completedByFamily.set(s.family_id, cur + _toNum(s.spots_completed || 0));
  }

  const summary = (families || [])
    .map(f => {
      const fid = f.id;
      const famPlayers = playersByFamily.get(fid) || [];
      const famVols = volunteersByFamily.get(fid) || [];
      const completed = completedByFamily.get(fid) || 0;

      // Required shifts = max requirement among a family's player divisions
      let required = 0;
      for (const p of famPlayers) {
        const divId = p.division_id ? String(p.division_id) : null;
        const req = divId && reqByDivision.has(divId) ? reqByDivision.get(divId) : 0;
        if (req > required) required = req;
      }

      const exInfo = _computeExemption({
        volunteers: famVols,
        boardRoles: boardRolesByFamily.get(fid) || []
      });

      const remaining = exInfo.is_exempt ? 0 : Math.max(required - completed, 0);
      const status = exInfo.is_exempt ? 'Exempt' : (remaining === 0 ? 'Completed' : 'Incomplete');

      const emails = [f.primary_contact_email, f.parent2_email].filter(Boolean);

      return {
        family_id: f.id,
        family_name: f.primary_contact_name || '',
        emails: emails,
        required,
        completed,
        remaining,
        status,
        exempt_reason: exInfo.exempt_reason || ''
      };
    })
    .sort((a, b) => (a.family_name || '').localeCompare(b.family_name || ''));

  // Add family_name into shifts export
  const familyNameById = new Map((families || []).map(f => [f.id, f.primary_contact_name || '']));
  const shiftsOut = (shifts || []).map(s => ({
    ...s,
    family_name: familyNameById.get(s.family_id) || ''
  }));

  return { summary, shifts: shiftsOut };
}

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

    // Workbond export (Families tab summary + Shift log)
    let workbond_summary = [];
    let workbond_shifts = [];
    try {
      const wb = await buildWorkbondSummaryForSeason(id);
      workbond_summary = wb.summary || [];
      workbond_shifts = wb.shifts || [];
    } catch (e) {
      console.warn('Workbond export skipped due to error:', e?.message || e);
    }

    // Get workbond requirements
    const { data: workbond_requirements, error: requirementsError } = await supabase
      .from('workbond_requirements')
      .select('*')
      .eq('season_id', id);

    if (requirementsError) {
      console.warn('Error fetching workbond requirements:', requirementsError);
    }

    const exportData = {
      season: { id },
      divisions: divisions || [],
      teams: teams || [],
      players: playersWithAge || [],
      families: families || [],
      volunteers: volunteers || [],
      workbond_summary,
      workbond_shifts,
      workbond_requirements: workbond_requirements || [],
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
      ${players?.length || 0} players,
      ${workbond_summary?.length || 0} workbond summary records,
      ${workbond_shifts?.length || 0} workbond shifts`);

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