/**
 * Draft Routes - WORKING VERSION (Fixed for your exact schema)
 */
console.log('✅ LOADED routes/draft.js - WORKING VERSION - EXACT SCHEMA');
const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

const DRAFT_ELIGIBLE_ROLES = ['Manager', 'Assistant Coach', 'Team Parent', 'Team Manager'];

function parseInterestedRoles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map(String).map(x => x.trim()).filter(Boolean);
    } catch (_) {}
    
    return s
      .split(/\r?\n|\s*;\s*|\s*,\s*|\s*\|\s*/g)
      .map(x => x.trim())
      .filter(Boolean);
  }
  
  return [String(raw).trim()].filter(Boolean);
}

function eligibleRolesFromInterested(volunteerRow) {
  const roles = parseInterestedRoles(volunteerRow?.interested_roles);
  const eligibleRoles = [];
  
  for (const target of DRAFT_ELIGIBLE_ROLES) {
    if (roles.some(r => r.toLowerCase() === target.toLowerCase())) {
      if (target.toLowerCase() === 'team manager') {
        eligibleRoles.push('Manager');
      } else {
        eligibleRoles.push(target);
      }
    }
  }
  
  return eligibleRoles;
}

router.get('/data', async (req, res) => {
  const divisionId = req.query.division_id || req.query.divisionId;
  const seasonId = req.query.season_id || req.query.seasonId;

  if (!divisionId || !seasonId) {
    return res.status(400).json({ error: 'Missing division_id or season_id' });
  }

  console.log('\n=== DRAFT DATA - WORKING VERSION ===');
  console.log(`Season: ${seasonId}, Division: ${divisionId}`);

  try {
    // 1) Get players for this season/division
   const { data: players, error: playersErr } = await supabase
  .from('players')
  .select(`
    *,
    volunteers:volunteers (
      id,
      name,
      role,
      email,
      phone,
      family_id,
      interested_roles
    )
  `)
  .eq('season_id', seasonId)
  .eq('division_id', divisionId)
  .order('last_name', { ascending: true });  // Optional: add ordering

    if (playersErr) {
      console.error('Players error:', playersErr);
      return res.status(500).json({ error: 'Failed to load players', details: playersErr.message });
    }

    console.log(`Players found: ${players?.length || 0}`);
	
	// After getting players, add this:
console.log('\n=== COMPREHENSIVE PLAYER DATA DEBUG ===');
console.log(`Total players: ${players?.length || 0}`);

if (players && players.length > 0) {
  // Check first 3 players
  for (let i = 0; i < Math.min(3, players.length); i++) {
    const player = players[i];
    console.log(`\n--- Player ${i + 1}: ${player.first_name} ${player.last_name} ---`);
    
    // Check all the fields we need
    const importantFields = [
      'birth_date', 
      'is_travel_player', 
      'is_new_player', 
      'is_returning',
      'gender'
    ];
    
    importantFields.forEach(field => {
      console.log(`${field}:`, player[field], `(type: ${typeof player[field]})`);
    });
    
    // Check volunteers
    console.log('Volunteers count:', player.volunteers?.length || 0);
    if (player.volunteers && player.volunteers.length > 0) {
      console.log('First volunteer:', player.volunteers[0]);
    }
    
    // Show ALL fields for this player
    console.log('All fields:', Object.keys(player));
  }
}

    // 2) Get unique family IDs from players
    const familyIds = [];
    const familyIdSet = new Set();
    
    for (const p of players || []) {
      if (p.family_id && !familyIdSet.has(p.family_id)) {
        familyIdSet.add(p.family_id);
        familyIds.push(p.family_id);
      }
    }

    console.log(`Unique family IDs: ${familyIds.length}`);
    if (familyIds.length > 0) {
      console.log('Sample family IDs:', familyIds.slice(0, 5));
    }

    // 3) Get volunteers for these family IDs in this season/division
    let volunteers = [];
    if (familyIds.length > 0) {
      const { data: vData, error: vErr } = await supabase
        .from('volunteers')
        .select('id, name, email, family_id, division_id, season_id, role, interested_roles, team_id, is_approved, background_check_completed')
        .eq('season_id', seasonId)
        .eq('division_id', divisionId)
        .in('family_id', familyIds);

      if (vErr) {
        console.error('Volunteers error:', vErr);
        return res.status(500).json({ error: 'Failed to load volunteers', details: vErr.message });
      }

      console.log(`Volunteers found (raw): ${vData?.length || 0}`);
      
      // Log what we found
      if (vData && vData.length > 0) {
        console.log('\nVolunteers with interested_roles:');
        vData.forEach(v => {
          const parsed = parseInterestedRoles(v.interested_roles);
          const eligible = eligibleRolesFromInterested(v);
          console.log(`- ${v.name} (Family: ${v.family_id})`);
          console.log(`  interested_roles: "${v.interested_roles}"`);
          console.log(`  parsed:`, parsed);
          console.log(`  eligible:`, eligible);
        });
      }

      // Filter to only those with eligible roles
      volunteers = (vData || []).filter(v => {
        const eligible = eligibleRolesFromInterested(v);
        return eligible.length > 0;
      });
      
      console.log(`\nVolunteers with eligible roles: ${volunteers.length}`);
    }

    // 4) Organize volunteers by family ID
    const volunteersByFamily = {};
    for (const v of volunteers) {
      if (!v.family_id) continue;
      if (!volunteersByFamily[v.family_id]) volunteersByFamily[v.family_id] = [];
      volunteersByFamily[v.family_id].push(v);
    }

    // 5) Link volunteers to players
    console.log('\n=== LINKING VOLUNTEERS TO PLAYERS ===');
    let playersWithVolunteersCount = 0;
    let totalVolunteerEntries = 0;
    
    const playersWithVolunteers = (players || []).map(p => {
      const famId = p.family_id;
      const famVols = famId ? (volunteersByFamily[famId] || []) : [];

      const expanded = [];
      for (const v of famVols) {
        const eligible = eligibleRolesFromInterested(v);
        for (const roleName of eligible) {
          expanded.push({
            id: v.id,
            name: v.name,
            email: v.email,
            family_id: v.family_id,
            interested_roles: v.interested_roles,
            current_role: v.role,
            is_approved: v.is_approved,
            background_check_completed: v.background_check_completed,
            derived_role: roleName,
          });
          totalVolunteerEntries++;
        }
      }

      if (expanded.length > 0) {
        playersWithVolunteersCount++;
        console.log(`✅ ${p.first_name} ${p.last_name} has ${expanded.length} volunteer(s)`);
        expanded.forEach(v => {
          console.log(`   - ${v.name} (${v.derived_role})`);
        });
      } else if (famId && volunteersByFamily[famId]) {
        console.log(`⚠️  ${p.first_name} ${p.last_name} has volunteer(s) but none with eligible roles`);
      } else if (famId) {
        console.log(`❌ ${p.first_name} ${p.last_name} has NO volunteers (Family: ${famId})`);
      }

      return {
        //id: p.id,
        //first_name: p.first_name,
        //last_name: p.last_name,
        //family_id: p.family_id,
         ...p,
		// Create full_name from first_name + last_name
        name: `${p.first_name} ${p.last_name}`,
        volunteers: expanded,
      };
    });

    // 6) Get teams
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, name, division_id, season_id, color')
      .eq('season_id', seasonId)
      .eq('division_id', divisionId);

    if (teamsErr) {
      console.error('Teams error:', teamsErr);
    }

    // 7) Get division info
    const { data: division, error: divisionErr } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('id', divisionId)
      .single();

    console.log('\n=== SUMMARY ===');
    console.log(`Total players: ${players?.length || 0}`);
    console.log(`Players with volunteers: ${playersWithVolunteersCount}`);
    console.log(`Total volunteer entries: ${totalVolunteerEntries}`);
    console.log('=== END ===\n');

    return res.json({
      division: division || null,
      teams: teams || [],
      players: playersWithVolunteers,
      volunteers: volunteers || [],
      summary: {
        totalPlayers: players?.length || 0,
        playersWithVolunteers: playersWithVolunteersCount,
        totalVolunteerEntries: totalVolunteerEntries,
      }
    });

  } catch (err) {
    console.error('Draft endpoint error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;