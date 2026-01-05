const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

/**
 * GET /api/volunteers
 * Optional query params:
 *   - division_id
 *   - season_id
 *
 * Returns volunteers with joined division, season, and team info.
 */
router.get('/', async (req, res) => {
  try {
    const { division_id, season_id } = req.query;

    console.log('Fetching volunteers with filters:', { division_id, season_id });

    let query = supabase
      .from('volunteers')
      .select(`
        *,
        division:divisions (id, name),
        season:seasons (id, name),
        team:teams!volunteers_team_id_fkey (id, name, color)
      `);

    if (division_id) {
      query = query.eq('division_id', division_id);
    }

    if (season_id) {
      query = query.eq('season_id', season_id);
    }

    // Order by name by default
    query = query.order('name', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error fetching volunteers:', error);
      throw error;
    }

    console.log(`Found ${data?.length || 0} volunteers`);
    res.json(data || []);
  } catch (error) {
    console.error('Error in volunteers API:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/volunteers
 * Create a new volunteer record.
 */
router.post('/', async (req, res) => {
  try {
    const volunteerData = req.body;
    console.log('Creating volunteer:', volunteerData);

    const { data, error } = await supabase
      .from('volunteers')
      .insert(volunteerData)
      .select(`
        *,
        division:divisions (id, name),
        season:seasons (id, name),
        team:teams!volunteers_team_id_fkey (id, name, color)
      `)
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating volunteer:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/volunteers/:id
 * Update an existing volunteer.
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const volunteerData = req.body;

    console.log(`Updating volunteer ${id}:`, volunteerData);

    const { data, error } = await supabase
      .from('volunteers')
      .update(volunteerData)
      .eq('id', id)
      .select(`
        *,
        division:divisions (id, name),
        season:seasons (id, name),
        team:teams!volunteers_team_id_fkey (id, name, color)
      `)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error updating volunteer:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/volunteers/:id
 * Delete a volunteer.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`Deleting volunteer ${id}`);

    const { data, error } = await supabase
      .from('volunteers')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }

    res.json({ message: 'Volunteer deleted successfully' });
  } catch (error) {
    console.error('Error deleting volunteer:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/volunteers/import
 *
 * Body:
 * {
 *   volunteers: [ ...csv rows mapped to objects... ],
 *   season_id: "<season uuid>"
 * }
 *
 * Each row looks like the ones from your volunteer CSV:
 *   - volunteer first name
 *   - volunteer last name
 *   - volunteer email address
 *   - volunteer cellphone
 *   - volunteer role        (this is what we will store in interested_roles)
 *   - division name
 *   - team name (optional / "Unallocated")
 */
router.post('/import', async (req, res) => {
  try {
    const { volunteers: volunteersData, season_id } = req.body;

    console.log('=== VOLUNTEER IMPORT START ===');
    console.log('Season ID:', season_id);
    console.log('Raw volunteers data length:', volunteersData?.length);

    if (!volunteersData || !Array.isArray(volunteersData)) {
      return res.status(400).json({ error: 'Invalid volunteers data' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    const errors = [];
    const processedVolunteers = [];

    // Cache family matches so we don't query Supabase repeatedly for the same email/phone
    const familyMatchCache = new Map();
    const getCachedFamilyId = async ({ email, phone }) => {
      const e = String(email || '').trim().toLowerCase();
      const p = normalizePhone(phone);
      const key = `${e}|${p}`;
      if (familyMatchCache.has(key)) return familyMatchCache.get(key);
      const fid = await findMatchingFamilyId({ email: e, phone: p });
      familyMatchCache.set(key, fid);
      return fid;
    };

    // Load existing volunteers for this season for matching
    console.log('Loading existing volunteers for season:', season_id);
    const { data: existingVolunteers, error: existingError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('season_id', season_id);

    if (existingError) {
      console.error('Error loading existing volunteers:', existingError);
      return res.status(500).json({ error: 'Failed to load existing volunteers' });
    }

    const divisionMap = new Map();
    const teamMap = new Map();

    // Preload divisions and teams to map names -> ids
    try {
      console.log('Loading divisions for mapping...');
      const { data: divisions, error: divisionsError } = await supabase
        .from('divisions')
        .select('id, name');

      if (divisionsError) {
        console.error('Error loading divisions:', divisionsError);
        errors.push('Failed to load divisions from database');
      } else if (divisions && divisions.length > 0) {
        divisions.forEach((division) => {
          divisionMap.set(division.name, division.id);
        });
        console.log('Division map created with', divisionMap.size, 'divisions');
      } else {
        console.warn('No divisions found in database');
      }

      console.log('Loading teams for mapping...');
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name');

      if (!teamsError && teams) {
        teams.forEach((team) => {
          teamMap.set(team.name, team.id);
        });
        console.log('Team map created with', teamMap.size, 'teams');
      } else if (teamsError) {
        console.error('Error loading teams:', teamsError);
        errors.push('Failed to load teams from database');
      }
    } catch (mappingError) {
      console.error('Failed to load mappings:', mappingError);
      errors.push('Failed to load divisions/teams from database');
    }

    console.log('Processing CSV rows...');

    for (let index = 0; index < volunteersData.length; index++) {
      const volunteerData = volunteersData[index];

      try {
        // Basic required fields
        if (!volunteerData['volunteer first name'] && !volunteerData['volunteer last name']) {
          errors.push(`Row ${index + 1}: Missing volunteer name`);
          console.log(`Row ${index + 1} skipped: Missing volunteer name`);
          continue;
        }

        if (!volunteerData['division name']) {
          errors.push(`Row ${index + 1}: Missing division name`);
          console.log(`Row ${index + 1} skipped: Missing division name`);
          continue;
        }

        // Find division ID
        const divisionName = volunteerData['division name'];
        let divisionId = null;

        if (divisionMap.size > 0) {
          divisionId = divisionMap.get(divisionName);
          if (!divisionId) {
            // Try case-insensitive match
            for (let [name, id] of divisionMap) {
              if (name.toLowerCase() === divisionName.toLowerCase()) {
                divisionId = id;
                console.log(`Found division "${name}" (case-insensitive match)`);
                break;
              }
            }
          }

          if (!divisionId) {
            errors.push(`Row ${index + 1}: Division "${divisionName}" not found`);
            console.log(`Row ${index + 1} skipped: Division "${divisionName}" not found`);
            continue;
          }
        } else {
          errors.push(`Row ${index + 1}: No divisions available in database`);
          console.log(`Row ${index + 1} skipped: No divisions available`);
          continue;
        }

        // Find team ID if provided
        let teamId = null;
        const teamName = volunteerData['team name'];
        if (
          teamName &&
          teamName.trim() &&
          teamName !== 'Unallocated' &&
          teamMap.size > 0
        ) {
          teamId = teamMap.get(teamName);
          if (!teamId) {
            // Try case-insensitive team match
            for (let [name, id] of teamMap) {
              if (name.toLowerCase() === teamName.toLowerCase()) {
                teamId = id;
                console.log(`Found team "${name}" (case-insensitive match)`);
                break;
              }
            }
          }
          if (!teamId) {
            console.log(`Team "${teamName}" not found, will set team_id to null`);
          }
        }

        // === NEW R1 BEHAVIOR HERE ===
        // rawInterestedRoles = whatever the CSV says ("Manager, Assistant Coach, Team Parent")
        const rawInterestedRoles = volunteerData['volunteer role'] || null;

        const volunteerRecord = {
          name: `${volunteerData['volunteer first name']} ${volunteerData['volunteer last name']}`.trim(),
          email: volunteerData['volunteer email address'] || null,
          phone: volunteerData['volunteer cellphone'] || null,

          // PRIMARY assigned role (for now still stored in "role")
          // Derived as first role from CSV string.
          role: 'Parent', // keep system default; import role goes to interested_roles
        

          // Raw interested roles exactly as provided in CSV
          // e.g. "Manager, Assistant Coach, Team Parent"
          interested_roles: rawInterestedRoles || null,

          division_id: divisionId,
          season_id: season_id,
          team_id: teamId,
          notes: `Imported from volunteer signup. Original team: ${
            volunteerData['team name'] || 'Unallocated'
          }`,
          training_completed: false, // Default to false for imports

          // Defaults required by schema
          background_check_completed: false,
          background_check_complete: false,
          is_approved: false,
          shifts_completed: 0,
          shifts_required: 0,
          can_pickup: false,
          family_id: await getCachedFamilyId({ email: volunteerData['volunteer email address'], phone: volunteerData['volunteer cellphone'] }),
          player_id: null,
        };

        // Try to find an existing volunteer to update
        const existingVolunteer = findExistingVolunteer(
          existingVolunteers || [],
          volunteerRecord,
          divisionId,
          season_id
        );

        if (existingVolunteer) {
          console.log(
            `Found existing volunteer: ${volunteerRecord.name}, checking for updates`
          );
          const updatedVolunteer = await updateExistingVolunteer(
            existingVolunteer,
            volunteerRecord
          );
          if (updatedVolunteer) {
            processedVolunteers.push(updatedVolunteer);
          } else {
            // Nothing changed, keep the existing one
            processedVolunteers.push(existingVolunteer);
          }
        } else {
          // New volunteer: insert into DB
          const { data: inserted, error: insertError } = await supabase
            .from('volunteers')
            .insert(volunteerRecord)
            .select(`
              *,
              division:divisions (id, name),
              season:seasons (id, name),
              team:teams!volunteers_team_id_fkey (id, name, color)
            `)
            .single();

          if (insertError) {
            console.error(
              `Row ${index + 1}: Error inserting volunteer:`,
              insertError
            );
            errors.push(
              `Row ${index + 1}: Failed to insert volunteer: ${insertError.message}`
            );
            continue;
          }

          processedVolunteers.push(inserted);
        }
      } catch (rowError) {
        console.error(`Error processing row ${index + 1}:`, rowError);
        errors.push(`Row ${index + 1}: ${rowError.message}`);
      }
    }

    console.log(
      `Processing complete. ${processedVolunteers.length} valid volunteers, ${errors.length} errors`
    );

    if (processedVolunteers.length === 0) {
      return res.status(400).json({
        error: 'No valid volunteers to import',
        details: errors,
      });
    }

    // Split between newly inserted & updated
    const newVolunteers = processedVolunteers.filter((v) => !v.id);
    const updatedVolunteers = processedVolunteers.filter((v) => v.id);

    console.log(
      `New volunteers: ${newVolunteers.length}, Updated volunteers: ${updatedVolunteers.length}`
    );

    const response = {
      message: `${processedVolunteers.length} volunteers processed (${newVolunteers.length} new, ${updatedVolunteers.length} updated)`,
      data: processedVolunteers,
      warnings: errors,
    };

    if (errors.length > 0) {
      response.message += ` (${errors.length} rows had errors)`;
    }

    console.log('=== VOLUNTEER IMPORT COMPLETE ===');
    res.status(201).json(response);
  } catch (error) {
    console.error('=== VOLUNTEER IMPORT ERROR ===');
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Try to find an existing volunteer in DB that matches this row.
 * Uses multiple strategies:
 *  - Same season, same division, same email
 *  - Same season, same email
 *  - Same season, same normalized phone + same name
 */
function findExistingVolunteer(existingVolunteers, volunteerRecord, divisionId, seasonId) {
  if (!existingVolunteers || !Array.isArray(existingVolunteers)) return null;

  const email = (volunteerRecord.email || '').trim().toLowerCase();
  const phone = normalizePhone(volunteerRecord.phone);
  const name = (volunteerRecord.name || '').trim().toLowerCase();

  // Strategy 1: exact match by season, division, email
  if (email) {
    const match1 = existingVolunteers.find(
      (v) =>
        v.season_id === seasonId &&
        v.division_id === divisionId &&
        (v.email || '').trim().toLowerCase() === email
    );
    if (match1) return match1;
  }

  // Strategy 2: same season + same email
  if (email) {
    const match2 = existingVolunteers.find(
      (v) =>
        v.season_id === seasonId &&
        (v.email || '').trim().toLowerCase() === email
    );
    if (match2) return match2;
  }

  // Strategy 3: same season + same normalized phone + same name
  if (phone && name) {
    const match3 = existingVolunteers.find(
      (v) =>
        v.season_id === seasonId &&
        normalizePhone(v.phone) === phone &&
        (v.name || '').trim().toLowerCase() === name
    );
    if (match3) return match3;
  }

  return null;
}

/**
 * Check if two volunteers are the same person for duplicate detection in the same batch.
 */
function isSameVolunteer(vol1, vol2) {
  if (!vol1 || !vol2) return false;

  const name1 = (vol1.name || '').trim().toLowerCase();
  const name2 = (vol2.name || '').trim().toLowerCase();

  const email1 = (vol1.email || '').trim().toLowerCase();
  const email2 = (vol2.email || '').trim().toLowerCase();

  const phone1 = normalizePhone(vol1.phone);
  const phone2 = normalizePhone(vol2.phone);

  // Prefer email match if present
  if (email1 && email2 && email1 === email2) return true;

  // Name + phone combo
  if (name1 && name2 && name1 === name2 && phone1 && phone2 && phone1 === phone2) {
    return true;
  }

  return false;
}

/**
 * Extract a primary role from the raw "volunteer role" string.
 * Example:
 *   "Manager, Assistant Coach, Team Parent" -> "Manager"
 *   "Team Parent" -> "Team Parent"
 *   "" or null -> "Parent"
 */
function extractPrimaryRole(raw) {
  if (!raw) return 'Parent';

  const parts = String(raw)
    .split(/[;,/]+/) // split on comma, semicolon, slash
    .map((p) => p.trim())
    .filter(Boolean);

  return parts[0] || 'Parent';
}

/**
 * Normalize phone by removing all non-digits.
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

/**
 * Update existing volunteer using new imported data.
 * Only updates changed fields; also keeps interested_roles in sync.
 */
async function updateExistingVolunteer(existingVolunteer, newVolunteerData) {
  const updates = {};
  let hasChanges = false;

  // Email
  if (newVolunteerData.email && newVolunteerData.email !== existingVolunteer.email) {
    updates.email = newVolunteerData.email;
    hasChanges = true;
  }

  // Phone
  if (
    newVolunteerData.phone &&
    normalizePhone(newVolunteerData.phone) !== normalizePhone(existingVolunteer.phone)
  ) {
    updates.phone = newVolunteerData.phone;
    hasChanges = true;
  }

  // Team
  if (
    newVolunteerData.team_id !== undefined &&
    newVolunteerData.team_id !== existingVolunteer.team_id
  ) {
    updates.team_id = newVolunteerData.team_id;
    hasChanges = true;
  }

  // Notes
  if (newVolunteerData.notes && newVolunteerData.notes !== existingVolunteer.notes) {
    updates.notes = newVolunteerData.notes;
    hasChanges = true;
  }

  // Training Completed
  if (
    newVolunteerData.training_completed !== undefined &&
    newVolunteerData.training_completed !== existingVolunteer.training_completed
  ) {
    updates.training_completed = newVolunteerData.training_completed;
    hasChanges = true;
  }

  // NEW R1: keep interested_roles in sync with CSV
  if (
    newVolunteerData.interested_roles &&
    newVolunteerData.interested_roles !== existingVolunteer.interested_roles
  ) {
    updates.interested_roles = newVolunteerData.interested_roles;
    hasChanges = true;
  }

  // If nothing changed, just return
  if (!hasChanges) {
    console.log(`No changes needed for volunteer ${existingVolunteer.name}`);
    return null;
  }

  console.log(`Updating volunteer ${existingVolunteer.name} with changes:`, updates);

  const { data: updatedVolunteer, error } = await supabase
    .from('volunteers')
    .update(updates)
    .eq('id', existingVolunteer.id)
    .select(`
      *,
      division:divisions (id, name),
      season:seasons (id, name),
      team:teams!volunteers_team_id_fkey (id, name, color)
    `)
    .single();

  if (error) {
    console.error('Error updating volunteer:', error);
    throw error;
  }

  return updatedVolunteer;
}

// Normalize phone numbers for matching (digits only)
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// Try to find a matching family by email/phone.
// Returns family UUID (families.id) or null.
async function findMatchingFamilyId({ email, phone }) {
  const emailNorm = String(email || '').trim().toLowerCase();
  const phoneNorm = normalizePhone(phone);

  // 1) Exact email match (primary or parent2)
  if (emailNorm) {
    const { data: famByEmail, error } = await supabase
      .from('families')
      .select('id')
      .or(`primary_contact_email.eq.${emailNorm},parent2_email.eq.${emailNorm}`)
      .limit(1);

    if (!error && famByEmail && famByEmail.length > 0) {
      return famByEmail[0].id;
    }
  }

  // 2) Phone match (normalize and compare in JS)
  // Supabase can't easily normalize with SQL, so we do a coarse fetch by last 4 digits
  if (phoneNorm && phoneNorm.length >= 4) {
    const last4 = phoneNorm.slice(-4);
    const { data: famCandidates, error } = await supabase
      .from('families')
      .select('id, primary_contact_phone, parent2_phone')
      .or(`primary_contact_phone.ilike.%${last4}%,parent2_phone.ilike.%${last4}%`)
      .limit(50);

    if (!error && famCandidates && famCandidates.length > 0) {
      for (const fam of famCandidates) {
        const p1 = normalizePhone(fam.primary_contact_phone);
        const p2 = normalizePhone(fam.parent2_phone);
        if (p1 && p1 == phoneNorm) return fam.id;
        if (p2 && p2 == phoneNorm) return fam.id;
      }
    }
  }

  return null;
}

module.exports = router;