const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

/**
 * Key fixes in this version:
 * 1) Deterministic required_shifts:
 *    - We read players.division_id directly (and also join divisions for display).
 *    - We read workbond_requirements.shifts_required.
 *    - If requirements query fails, we RETURN 500 instead of silently defaulting to 1.
 * 2) Keeps prior shift log / CRUD endpoints as-is.
 * 3) FIXED: Board member exemption now checks by email as well as family_id
 */

// -------------------- REQUIREMENTS --------------------
router.get('/requirements', async (req, res) => {
  try {
    const { season_id } = req.query;
    if (!season_id) return res.status(400).json({ error: 'season_id is required' });

    const { data: divisions, error: divErr } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('season_id', season_id)
      .order('name');

    if (divErr) throw divErr;

    const { data: reqs, error: reqErr } = await supabase
      .from('workbond_requirements')
      .select('division_id, season_id, shifts_required')
      .eq('season_id', season_id);

    if (reqErr) throw reqErr;

    const byDivision = new Map((reqs || []).map(r => [String(r.division_id), r]));

    const rows = (divisions || []).map(d => {
      const r = byDivision.get(String(d.id));
      return {
        season_id,
        division_id: d.id,
        division_name: d.name,
        shifts_required: r ? r.shifts_required : null
      };
    });

    res.json(rows);
  } catch (error) {
    console.error('Error fetching requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/requirements', async (req, res) => {
  try {
    const isArray = Array.isArray(req.body);
    const payload = isArray ? req.body : [req.body];

    const season_id = payload?.[0]?.season_id;
    if (!season_id) return res.status(400).json({ error: 'season_id is required' });

    const rows = (payload || [])
      .filter(r => r && r.season_id && r.division_id !== undefined && r.division_id !== null)
      .map(r => ({
        season_id: r.season_id,
        division_id: r.division_id,
        shifts_required: r.shifts_required ?? null
      }));

    if (!rows.length) return res.json({ ok: true, saved: 0 });

    // Replace strategy: delete then insert (avoids needing a UNIQUE constraint)
    const { error: delErr } = await supabase
      .from('workbond_requirements')
      .delete()
      .eq('season_id', season_id);

    if (delErr) throw delErr;

    const { data: insData, error: insErr } = await supabase
      .from('workbond_requirements')
      .insert(rows)
      .select();

    if (insErr) throw insErr;

    return res.json({ ok: true, saved: (insData || []).length, replaced: true });
  } catch (error) {
    console.error('Error saving requirements:', error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------- SHIFTS (unchanged from prior) --------------------
router.get('/shifts', async (req, res) => {
  try {
    const { family_id, season_id, verified } = req.query;

    let query = supabase
      .from('workbond_shifts')
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email, parent2_email),
        volunteer:volunteers (name, email),
        season:seasons (id, name)
      `)
      .order('shift_date', { ascending: false });

    if (family_id) query = query.eq('family_id', family_id);
    if (season_id) query = query.eq('season_id', season_id);
    if (verified !== undefined) query = query.eq('is_verified', verified === 'true');

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/shifts', async (req, res) => {
  try {
    const body = req.body || {};
    const shiftData = { ...body };

    if (shiftData.date && !shiftData.shift_date) shiftData.shift_date = shiftData.date;

    const taskStr = shiftData.task || shiftData.shift_type || shiftData.description;
    if (taskStr) {
      if (!shiftData.shift_type) shiftData.shift_type = taskStr;
      if (!shiftData.description) shiftData.description = taskStr;
    }

    const timeStr = shiftData.time || '';
    const completedByStr = shiftData.completed_by || shiftData.completedBy || '';
    const extraNotes = [];
    if (timeStr) extraNotes.push(`Time: ${timeStr}`);
    if (completedByStr) extraNotes.push(`Completed by: ${completedByStr}`);
    if (extraNotes.length) {
      shiftData.notes = (shiftData.notes ? `${shiftData.notes}\n` : '') + extraNotes.join('\n');
    }

    delete shiftData.date;
    delete shiftData.time;
    delete shiftData.task;
    delete shiftData.completed_by;
    delete shiftData.completedBy;

    const { data, error } = await supabase
      .from('workbond_shifts')
      .insert([shiftData])
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error adding workbond shift:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/shifts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const update = { ...body };

    const timeStr = update.time || '';
    const completedByStr = update.completed_by || update.completedBy || '';

    if (timeStr || completedByStr) {
      const notesBase = String(update.notes || '');
      const lines = notesBase
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
        .filter(l => {
          const ll = l.toLowerCase();
          return !ll.startsWith('time:') && !ll.startsWith('completed by:');
        });

      if (timeStr) lines.push(`Time: ${timeStr}`);
      if (completedByStr) lines.push(`Completed by: ${completedByStr}`);
      update.notes = lines.join('\n');
    }

    delete update.time;
    delete update.completed_by;
    delete update.completedBy;

    const { data, error } = await supabase
      .from('workbond_shifts')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating workbond shift:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/shifts/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('workbond_shifts')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting workbond shift:', error);
    res.status(500).json({ error: error.message });
  }
});

// -------------------- EXEMPTION HELPERS --------------------
async function getFamilyExemptionInfo(familyId, seasonId) {
  const reasons = [];

  const { data: volunteers, error: volunteersError } = await supabase
    .from('volunteers')
    .select('id, name, role, team_id')
    .eq('family_id', familyId)
    .eq('season_id', seasonId)
    .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach'])
    .not('team_id', 'is', null);

  if (volunteersError) {
    console.error('Error checking volunteers:', volunteersError);
  } else if ((volunteers || []).length) {
    const roles = [...new Set(volunteers.map(v => v.role).filter(Boolean))];
    if (roles.length) reasons.push(`Volunteer role: ${roles.join(', ')}`);
  }

  const { data: boardMembers, error: boardMembersError } = await supabase
    .from('board_members')
    .select('id, name, role, email, family_id, is_active')
    .eq('family_id', familyId)
    .eq('is_active', true);

  if (boardMembersError) {
    console.error('Error checking board members:', boardMembersError);
  } else if ((boardMembers || []).length) {
    const roles = [...new Set(boardMembers.map(b => b.role).filter(Boolean))];
    reasons.push(roles.length ? `Board Member: ${roles.join(', ')}` : 'Board Member');
  }

  return {
    is_exempt: reasons.length > 0,
    exempt_reason: reasons.join(' | ')
  };
}

// -------------------- SUMMARY --------------------
router.get('/summary', async (req, res) => {
  try {
    const { season_id } = req.query;
    if (!season_id) return res.status(400).json({ error: 'Season ID is required' });

    // NOTE: families are global across seasons.
    // We'll load them AFTER we know which families are participating in this season.

    // Players (include division_id + joined division for label, and program_title for fallback)
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        id,
        first_name,
        last_name,
        family_id,
        division_id,
        division:divisions (id, name),
        program_title,
        season_id
      `)
      .eq('season_id', season_id);

    if (playersError) throw playersError;

    // Divisions for program_title -> division_id fallback (same logic as your required-shifts fix)
    const { data: seasonDivisions, error: seasonDivisionsError } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('season_id', season_id);

    if (seasonDivisionsError) throw seasonDivisionsError;

    const norm = (s) => String(s || '').trim().toLowerCase();
    const divisionIdByName = new Map(
      (seasonDivisions || [])
        .filter(d => d && d.id && d.name)
        .map(d => [norm(d.name), d.id])
    );

    // Attach resolved division id to players when missing (by matching program_title -> divisions.name)
    const playersWithDivision = (players || []).map(p => {
      const existingDivId = p.division_id || (p.division && p.division.id) || null;
      if (existingDivId) return { ...p, __resolved_division_id: existingDivId };
      const inferred = divisionIdByName.get(norm(p.program_title)) || null;
      return { ...p, __resolved_division_id: inferred };
    });

    // Volunteers (season-wide, used for both display and exemptions)
    const { data: allVolunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, family_id, role, is_approved, season_id, team_id, name, email')
      .eq('season_id', season_id);

    if (volunteersError) throw volunteersError;

    // Shifts (season-wide)
    const { data: shifts, error: shiftsError } = await supabase
      .from('workbond_shifts')
      .select('id, season_id, family_id, spots_completed')
      .eq('season_id', season_id);

    if (shiftsError) throw shiftsError;

    // Requirements (season-wide)
    const { data: requirements, error: reqError } = await supabase
      .from('workbond_requirements')
      .select('division_id, shifts_required')
      .eq('season_id', season_id);

    if (reqError) throw reqError;

    const reqByDivision = new Map(
      (requirements || []).map(r => [String(r.division_id), r.shifts_required])
    );

    // -------------------- Families IN this season --------------------
    // Only include families that participate in the selected season (players, volunteers, or shifts).
    const participatingFamilyIds = new Set();
    for (const p of (playersWithDivision || [])) if (p?.family_id) participatingFamilyIds.add(String(p.family_id));
    for (const v of (allVolunteers || [])) if (v?.family_id) participatingFamilyIds.add(String(v.family_id));
    for (const s of (shifts || [])) if (s?.family_id) participatingFamilyIds.add(String(s.family_id));

    const familyIdList = Array.from(participatingFamilyIds);
    const { data: families, error: familiesError } = familyIdList.length
      ? await supabase
          .from('families')
          .select('id, family_id, primary_contact_name, primary_contact_email, parent2_email')
          .in('id', familyIdList)
          .order('primary_contact_name')
      : { data: [], error: null };

    if (familiesError) throw familiesError;

    // -------------------- PERFORMANCE: precompute lookups --------------------

    // Group players by family_id (handles either families.id or families.family_id depending on your data)
    const playersByFamily = new Map();
    for (const p of (playersWithDivision || [])) {
      const fid = p.family_id;
      if (!fid) continue;
      const key = String(fid);
      if (!playersByFamily.has(key)) playersByFamily.set(key, []);
      playersByFamily.get(key).push(p);
    }

    // Group volunteers by family_id
    const volunteersByFamily = new Map();
    for (const v of (allVolunteers || [])) {
      const fid = v.family_id;
      if (!fid) continue;
      const key = String(fid);
      if (!volunteersByFamily.has(key)) volunteersByFamily.set(key, []);
      volunteersByFamily.get(key).push(v);
    }

    // Sum completed shifts by family_id
    const completedByFamily = new Map();
    for (const s of (shifts || [])) {
      const fid = s.family_id;
      if (!fid) continue;
      const key = String(fid);
      completedByFamily.set(key, (completedByFamily.get(key) || 0) + (s.spots_completed || 0));
    }

    // FIXED: Load board members with email and create maps by family_id AND email
    const { data: boardMembers, error: boardMembersError } = await supabase
      .from('board_members')
      .select('family_id, role, email')
      .eq('is_active', true);

    if (boardMembersError) throw boardMembersError;

    const exemptRoles = new Set(['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

    const volunteerExemptRolesByFamily = new Map();
    for (const v of (allVolunteers || [])) {
      const fid = v.family_id;
      if (!fid) continue;
      // match prior behavior: exemption requires team_id and role in list
      if (!v.team_id) continue;
      if (!exemptRoles.has(v.role)) continue;

      const key = String(fid);
      if (!volunteerExemptRolesByFamily.has(key)) volunteerExemptRolesByFamily.set(key, new Set());
      volunteerExemptRolesByFamily.get(key).add(v.role);
    }

    // Create two maps for board members: one by family_id, one by email
    const boardRolesByFamily = new Map();
    const boardRolesByEmail = new Map();
    for (const b of (boardMembers || [])) {
      if (b.family_id) {
        const key = String(b.family_id);
        if (!boardRolesByFamily.has(key)) boardRolesByFamily.set(key, new Set());
        if (b.role) boardRolesByFamily.get(key).add(b.role);
      }
      if (b.email) {
        const emailKey = b.email.toLowerCase().trim();
        if (!boardRolesByEmail.has(emailKey)) boardRolesByEmail.set(emailKey, new Set());
        if (b.role) boardRolesByEmail.get(emailKey).add(b.role);
      }
    }

    // NEW: Function to get exemption info checking both family_id and email
    function getExemptionForFamily(family) {
      const reasons = [];

      // Volunteer exemption (check by family_id)
      const familyIdKeys = [String(family.id), String(family.family_id)].filter(Boolean);
      const vRoles = new Set();
      for (const k of familyIdKeys) {
        const set = volunteerExemptRolesByFamily.get(k);
        if (set) for (const r of set) vRoles.add(r);
      }
      if (vRoles.size) reasons.push(`Volunteer role: ${Array.from(vRoles).join(', ')}`);

      // Board member exemption (check by family_id AND email)
      const bRoles = new Set();
      
      // Check by family_id
      for (const k of familyIdKeys) {
        const set = boardRolesByFamily.get(k);
        if (set) for (const r of set) bRoles.add(r);
      }
      
      // Check by email (primary and parent2)
      const emails = [
        family.primary_contact_email,
        family.parent2_email
      ].filter(Boolean).map(e => e.toLowerCase().trim());
      
      for (const email of emails) {
        const set = boardRolesByEmail.get(email);
        if (set) for (const r of set) bRoles.add(r);
      }
      
      if (bRoles.size) {
        reasons.push(`Board Member: ${Array.from(bRoles).join(', ')}`);
      } else {
        // If there is an active board member row with empty role, still exempt
        for (const k of familyIdKeys) {
          if (boardRolesByFamily.has(k) && boardRolesByFamily.get(k).size === 0) {
            reasons.push('Board Member');
            break;
          }
        }
        for (const email of emails) {
          if (boardRolesByEmail.has(email) && boardRolesByEmail.get(email).size === 0) {
            reasons.push('Board Member');
            break;
          }
        }
      }

      return { is_exempt: reasons.length > 0, exempt_reason: reasons.join(' | ') };
    }

    // -------------------- Build summary --------------------
const summary = [];

for (const family of (families || [])) {
  const familyPlayers =
    playersByFamily.get(String(family.id)) ||
    playersByFamily.get(String(family.family_id)) ||
    [];

  const familyVolunteers =
    volunteersByFamily.get(String(family.id)) ||
    volunteersByFamily.get(String(family.family_id)) ||
    [];

  // required shifts = max requirement across the player's divisions (default 1 if no requirement exists)
  let requiredShifts = 1;

  const divIds = (familyPlayers || [])
    .map(p => p.__resolved_division_id || (p.division && p.division.id) || null)
    .filter(Boolean)
    .map(x => String(x));

  const reqVals = divIds
    .map(divId => reqByDivision.get(divId))
    .filter(v => v !== null && v !== undefined)
    .map(v => Number(v))
    .filter(v => !Number.isNaN(v));

  if (reqVals.length) requiredShifts = Math.max(...reqVals);

  const completedShifts =
    completedByFamily.get(String(family.id)) ??
    completedByFamily.get(String(family.family_id)) ??
    0;

  // FIXED: Use the new function that checks both family_id and email
  const exInfo = getExemptionForFamily(family);
  const finalRequiredShifts = exInfo.is_exempt ? 0 : requiredShifts;
  const remainingShifts = Math.max(0, finalRequiredShifts - completedShifts);

  const status = exInfo.is_exempt
    ? 'exempt'
    : remainingShifts === 0
      ? 'completed'
      : 'incomplete';

  // ==== NEW: Get volunteer emails for this family ====
  // Get unique volunteer emails that aren't already in family guardian emails
  const familyGuardianEmails = [
    family.primary_contact_email,
    family.parent2_email
  ].filter(Boolean).map(e => e.toLowerCase().trim());
  
  const volunteerEmails = (familyVolunteers || [])
    .map(v => v.email)
    .filter(Boolean)
    .map(e => e.toLowerCase().trim())
    .filter(email => !familyGuardianEmails.includes(email)) // Don't duplicate guardian emails
    .filter((email, index, self) => self.indexOf(email) === index); // Remove duplicates

  // Combine all emails: guardians first, then volunteers
  const allEmails = [
    family.primary_contact_email,
    family.parent2_email,
    ...volunteerEmails
  ].filter(Boolean);

  summary.push({
    family_id: family.id,
    family_identifier: family.family_id,
    family_name: family.primary_contact_name,
    email: family.primary_contact_email,
    parent2_email: family.parent2_email,
    all_emails: allEmails, // NOW INCLUDES VOLUNTEER EMAILS!
    players: (familyPlayers || []).map(p => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name} ${p.last_name}`,
      division: (p.division && p.division.name) || p.program_title || 'Unknown Division',
      division_id: p.__resolved_division_id || (p.division && p.division.id) || null
    })),
    volunteers: (familyVolunteers || []).map(v => ({
      role: v.role,
      is_approved: v.is_approved,
      name: v.name,
      email: v.email // Added email to volunteer info
    })),
    required_shifts: finalRequiredShifts,
    completed_shifts: completedShifts,
    remaining_shifts: remainingShifts,
    status,
    is_exempt: exInfo.is_exempt,
    exempt_reason: exInfo.exempt_reason || ''
  });
}

    res.json(summary);
  } catch (error) {
    console.error('Error in workbond summary:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;