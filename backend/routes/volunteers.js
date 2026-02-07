const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
// ADD THIS: Import and use permission enforcer
const { permissionEnforcer } = require('../middleware/permissionEnforcer');

// Apply permission enforcer to ALL volunteer routes
router.use(permissionEnforcer);


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

    // First, get volunteers with basic relationships
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

    query = query.order('name', { ascending: true });

    const { data: volunteers, error } = await query;

    if (error) {
      console.error('Supabase error fetching volunteers:', error);
      throw error;
    }

    // Then, get trainings for each volunteer
    const volunteersWithTrainings = [];
    
    for (const volunteer of volunteers || []) {
      // Get trainings for this volunteer
      const { data: volunteerTrainings, error: trainingsError } = await supabase
        .from('volunteer_trainings')
        .select(`
          id,
          status,
          completed_date,
          training:trainings!inner (
            id,
            name,
            is_required
          )
        `)
        .eq('volunteer_id', volunteer.id);

      if (trainingsError) {
        console.error(`Error loading trainings for volunteer ${volunteer.id}:`, trainingsError);
      }

      const trainings = volunteerTrainings || [];
      const completedTrainings = trainings.filter(t => t.status === 'completed');
      const expiredTrainings = trainings.filter(t => t.status === 'expired');
      const requiredTrainings = trainings.filter(t => t.training?.is_required);
      const completedRequired = requiredTrainings.filter(t => t.status === 'completed');

      volunteersWithTrainings.push({
        ...volunteer,
        trainings: trainings, // Keep as separate field
        training_completed: completedTrainings.length > 0, // Legacy field for compatibility
        trainings_summary: { // Simplified summary
          total: trainings.length,
          completed: completedTrainings.length,
          expired: expiredTrainings.length,
          required: requiredTrainings.length,
          completed_required: completedRequired.length,
          all_required_completed: requiredTrainings.length > 0 && 
                                 completedRequired.length === requiredTrainings.length
        }
      });
    }

    console.log(`Found ${volunteersWithTrainings?.length || 0} volunteers`);
    res.json(volunteersWithTrainings || []);
  } catch (error) {
    console.error('Error in volunteers API:', error);
    res.status(500).json({ error: error.message });
  }
});

/**router.put('/:id', async (req, res) => {
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
 * REVERTED: No longer updates families table
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const volunteerData = req.body;

    console.log(`Updating volunteer ${id}:`, volunteerData);

    // Clean the data - remove training-related fields that shouldn't be in volunteers table
    const { trainings, trainings_summary, division, season, team, ...dataToUpdate } = volunteerData;

    const { data, error } = await supabase
      .from('volunteers')
      .update(dataToUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Return simple success response
    res.json({
      success: true,
      message: 'Volunteer updated successfully',
      id: data.id,
      name: data.name
    });
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
    // Replace the getCachedFamilyId function
const getCachedFamilyId = async ({ email, phone }, seasonId) => {
  const e = String(email || '').trim().toLowerCase();
  const p = normalizePhone(phone);
  
  // Create multiple cache keys to handle variations
  const baseEmail = e.split('@')[0]?.replace(/\./g, ''); // Remove dots from local part
  const cacheKeys = [];
  
  // Full match keys
  if (e && p) cacheKeys.push(`${e}|${p}|${seasonId}`);
  if (e) cacheKeys.push(`${e}||${seasonId}`); // Email only
  if (p) cacheKeys.push(`|${p}|${seasonId}`); // Phone only
  
  // Try base email (without dots)
  if (baseEmail && p) cacheKeys.push(`${baseEmail}@${e.split('@')[1]}|${p}|${seasonId}`);
  
  console.log(`\n🔑 [CACHE] Looking up with keys:`, cacheKeys);
  
  // Check all cache keys
  for (const key of cacheKeys) {
    if (familyMatchCache.has(key)) {
      const cached = familyMatchCache.get(key);
      console.log(`🔑 [CACHE HIT] Key: "${key}" -> ${cached}`);
      return cached;
    }
  }
  
  console.log(`🔑 [CACHE MISS] No cache hits, calling findMatchingFamilyId`);
  const fid = await findMatchingFamilyId({ email: e, phone: p }, seasonId);
  
  // Cache under all keys
  cacheKeys.forEach(key => {
    familyMatchCache.set(key, fid);
    console.log(`🔑 [CACHE SET] Key: "${key}" -> ${fid}`);
  });
  
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
        .select('id, name')
  .eq('season_id', season_id);  // <-- ADD THIS FILTER!

// Create division map
if (divisions && divisions.length > 0) {
  divisions.forEach((division) => {
    divisionMap.set(division.name, division.id);
  });
  console.log(`Division map created with ${divisionMap.size} divisions for season ${season_id}`);
} else {
  console.warn(`No divisions found for season ${season_id}`);
  errors.push(`No divisions configured for season ${season_id}. Please create divisions first.`);
}

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

// FIRST: Check if this volunteer already exists
const matchedVolunteer = findExistingVolunteer(  // <-- Changed variable name
  existingVolunteers || [],
  {
    name: `${volunteerData['volunteer first name']} ${volunteerData['volunteer last name']}`.trim(),
    email: volunteerData['volunteer email address'],
    phone: volunteerData['volunteer cellphone']
  },
  divisionId,
  season_id
);

// DECIDE family_id: Keep existing if we have it, otherwise try to find match
let finalFamilyId = null;
if (matchedVolunteer && matchedVolunteer.family_id) {  // <-- Use matchedVolunteer
  // Volunteer already exists with a family_id - KEEP IT
  finalFamilyId = matchedVolunteer.family_id;
  console.log(`🔗 Preserving existing family_id ${finalFamilyId} for ${matchedVolunteer.name}`);
} else {
  // No existing volunteer or no family_id - try to find match
  finalFamilyId = await getCachedFamilyId(
    { 
      email: volunteerData['volunteer email address'], 
      phone: volunteerData['volunteer cellphone'] 
    },
    season_id
  );
  if (finalFamilyId) {
    console.log(`🔗 Found new family match: ${finalFamilyId}`);
  }
}

// NOW create the volunteerRecord with the determined family_id
const volunteerRecord = {
  name: `${volunteerData['volunteer first name']} ${volunteerData['volunteer last name']}`.trim(),
  email: volunteerData['volunteer email address'] || null,
  phone: volunteerData['volunteer cellphone'] || null,
  role: 'Parent',
  interested_roles: rawInterestedRoles || null,
  volunteer_id: volunteerData['volunteer id'] || null,
  volunteer_type_id: volunteerData['volunteer type id'] || null,
  division_id: divisionId,
  season_id: season_id,
  team_id: teamId,
  notes: `Imported from volunteer signup. Original team: ${
    volunteerData['team name'] || 'Unallocated'
  }`,
  training_completed: false,
  background_check_completed: volunteerData['verification status'] || 'pending',
  background_check_complete: false,
  is_approved: false,
  shifts_completed: 0,
  shifts_required: 0,
  can_pickup: false,
  family_id: finalFamilyId,  // <-- This is now either preserved or newly found
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
  if (!existingVolunteers || !Array.isArray(existingVolunteers)) {
    console.log(`No existing volunteers to check against`);
    return null;
  }

  const email = (volunteerRecord.email || '').trim().toLowerCase();
  const phone = normalizePhone(volunteerRecord.phone);
  const name = (volunteerRecord.name || '').trim().toLowerCase();

  console.log(`Looking for existing volunteer:`);
  console.log(`  Email: ${email}`);
  console.log(`  Phone: ${phone}`);
  console.log(`  Name: ${name}`);
  console.log(`  Division: ${divisionId}`);
  console.log(`  Season: ${seasonId}`);

  // Strategy 1: exact match by season, division, email
  if (email) {
    const match1 = existingVolunteers.find(
      (v) =>
        v.season_id === seasonId &&
        v.division_id === divisionId &&
        (v.email || '').trim().toLowerCase() === email
    );
    if (match1) {
      console.log(`✅ Found existing volunteer by email+season+division: ${match1.name}, family_id: ${match1.family_id}`);
      return match1;
    }
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
  // Remove ALL non-numeric characters
  const normalized = String(phone).replace(/\D/g, '');
  console.log(`   normalizePhone: "${phone}" -> "${normalized}"`);
  return normalized;
}

/**
 * Update existing volunteer using new imported data.
 * Only updates changed fields; also keeps interested_roles in sync.
 */
async function updateExistingVolunteer(existingVolunteer, newVolunteerData) {
  const updates = {};
  let hasChanges = false;

  console.log(`\n🔄 [UPDATE CHECK] for ${existingVolunteer.name}`);
  console.log(`   Existing family_id: ${existingVolunteer.family_id}`);
  console.log(`   New family_id: ${newVolunteerData.family_id}`);
 // ==== CRITICAL FIX: Never clear an existing family_id ====
  // If we have existing family_id and import doesn't provide a new one, keep existing
  if (existingVolunteer.family_id && (!newVolunteerData.family_id || newVolunteerData.family_id === null)) {
    console.log(`   🛡️  Preserving existing family_id: ${existingVolunteer.family_id}`);
    // Remove family_id from newVolunteerData so it won't be updated
    delete newVolunteerData.family_id;
  }
  // ==== END FIX ====


  // Check family_id FIRST - this is critical!
  if (
    newVolunteerData.family_id !== undefined &&
    newVolunteerData.family_id !== existingVolunteer.family_id
  ) {
    updates.family_id = newVolunteerData.family_id;
    hasChanges = true;
    console.log(`   ✅ Family ID needs update: ${existingVolunteer.family_id} -> ${newVolunteerData.family_id}`);
  }

  // Email
  if (newVolunteerData.email && newVolunteerData.email !== existingVolunteer.email) {
    updates.email = newVolunteerData.email;
    hasChanges = true;
    console.log(`   ✅ Email needs update`);
  }

  // Phone
  if (
    newVolunteerData.phone &&
    normalizePhone(newVolunteerData.phone) !== normalizePhone(existingVolunteer.phone)
  ) {
    updates.phone = newVolunteerData.phone;
    hasChanges = true;
    console.log(`   ✅ Phone needs update`);
  }

  // Team
  if (
    newVolunteerData.team_id !== undefined &&
    newVolunteerData.team_id !== existingVolunteer.team_id
  ) {
    updates.team_id = newVolunteerData.team_id;
    hasChanges = true;
    console.log(`   ✅ Team ID needs update`);
  }

  // Notes
  if (newVolunteerData.notes && newVolunteerData.notes !== existingVolunteer.notes) {
    updates.notes = newVolunteerData.notes;
    hasChanges = true;
    console.log(`   ✅ Notes need update`);
  }

  // Training Completed
  if (
    newVolunteerData.training_completed !== undefined &&
    newVolunteerData.training_completed !== existingVolunteer.training_completed
  ) {
    updates.training_completed = newVolunteerData.training_completed;
    hasChanges = true;
    console.log(`   ✅ Training completed needs update`);
  }

  // Background Check Status
  if (
    newVolunteerData.background_check_completed &&
    newVolunteerData.background_check_completed !== existingVolunteer.background_check_completed
  ) {
    updates.background_check_completed = newVolunteerData.background_check_completed;
    hasChanges = true;
    console.log(`   ✅ Background check needs update`);
  }

  // Interested Roles - IMPORTANT FOR DRAFT!
  if (
    newVolunteerData.interested_roles &&
    newVolunteerData.interested_roles !== existingVolunteer.interested_roles
  ) {
    updates.interested_roles = newVolunteerData.interested_roles;
    hasChanges = true;
    console.log(`   ✅ Interested roles need update: "${newVolunteerData.interested_roles}"`);
  }
  
  // Volunteer ID
  if (
    newVolunteerData.volunteer_id &&
    newVolunteerData.volunteer_id !== existingVolunteer.volunteer_id
  ) {
    updates.volunteer_id = newVolunteerData.volunteer_id;
    hasChanges = true;
    console.log(`   ✅ Volunteer ID needs update`);
  }

  // Volunteer Type ID
  if (
    newVolunteerData.volunteer_type_id &&
    newVolunteerData.volunteer_type_id !== existingVolunteer.volunteer_type_id
  ) {
    updates.volunteer_type_id = newVolunteerData.volunteer_type_id;
    hasChanges = true;
    console.log(`   ✅ Volunteer Type ID needs update`);
  }

  console.log(`   Has changes? ${hasChanges}`);
  console.log(`   Updates object:`, updates);

  // If nothing changed, just return
  if (!hasChanges) {
    console.log(`🔄 No changes needed for volunteer ${existingVolunteer.name}`);
    return null;
  }

  console.log(`🔄 Updating volunteer ${existingVolunteer.name} with changes:`, updates);

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

  console.log(`🔄 Successfully updated volunteer`);
  return updatedVolunteer;
}

// Normalize phone numbers for matching (digits only)
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

// Try to find a matching family by email/phone.
// Returns family UUID (families.id) or null.
// Replace the ENTIRE findMatchingFamilyId function (around line ~350)
async function findMatchingFamilyId({ email, phone }, seasonId) {
  console.log(`\n🔍 [FIND FAMILY DEBUG START] =================================`);
  console.log(`   Email: "${email}"`);
  console.log(`   Phone: "${phone}"`);
  console.log(`   Season ID: "${seasonId}"`);
  
  const emailNorm = String(email || '').trim().toLowerCase();
  const phoneNorm = normalizePhone(phone);
  
  console.log(`   Email normalized: "${emailNorm}"`);
  console.log(`   Phone normalized: "${phoneNorm}"`);

  let candidateFamilies = [];

  // 1. Find families by EMAIL - FIXED SYNTAX
  if (emailNorm) {
    console.log(`\n   📧 Searching families by email...`);
    
    // Try multiple query approaches
    console.log(`   Trying query 1: .or() with ilike`);
    const { data: famByEmail, error: emailError } = await supabase
      .from('families')
      .select('id, primary_contact_email, parent2_email')
      .or(`primary_contact_email.ilike.${emailNorm},parent2_email.ilike.${emailNorm}`);

    if (emailError) {
      console.error(`   ❌ Query 1 error:`, emailError.message);
      
      // Fallback: Try separate queries
      console.log(`   Trying query 2: Separate ilike queries`);
      const { data: fam1 } = await supabase
        .from('families')
        .select('id, primary_contact_email')
        .ilike('primary_contact_email', emailNorm);
      
      const { data: fam2 } = await supabase
        .from('families')
        .select('id, parent2_email')
        .ilike('parent2_email', emailNorm);
      
      candidateFamilies = [...(fam1 || []), ...(fam2 || [])];
    } else {
      candidateFamilies = famByEmail || [];
    }
    
    console.log(`   ✅ Found ${candidateFamilies.length} families by email:`);
    candidateFamilies.forEach(fam => {
      console.log(`      - Family ${fam.id}: p_email="${fam.primary_contact_email}", p2_email="${fam.parent2_email}"`);
    });
  }

  // 2. If no email matches, try PHONE
  if (candidateFamilies.length === 0 && phoneNorm && phoneNorm.length >= 4) {
    console.log(`\n   📞 Searching families by phone (last 4: ${phoneNorm.slice(-4)})...`);
    
    const { data: famCandidates, error: phoneError } = await supabase
      .from('families')
      .select('id, primary_contact_phone, parent2_phone')
      .or(`primary_contact_phone.ilike.%${phoneNorm.slice(-4)}%,parent2_phone.ilike.%${phoneNorm.slice(-4)}%`)
      .limit(50);

    if (phoneError) {
      console.error(`   ❌ Phone search error:`, phoneError);
    } else {
      console.log(`   ✅ Found ${famCandidates?.length || 0} families by phone pattern`);
      
      for (const fam of famCandidates || []) {
        const p1 = normalizePhone(fam.primary_contact_phone);
        const p2 = normalizePhone(fam.parent2_phone);
        console.log(`      Checking family ${fam.id}: p1="${p1}", p2="${p2}" vs "${phoneNorm}"`);
        
        if ((p1 && p1 === phoneNorm) || (p2 && p2 === phoneNorm)) {
          candidateFamilies.push({ id: fam.id });
          console.log(`      🎯 Phone exact match found!`);
          break;
        }
      }
    }
  }

  console.log(`\n   📊 Total candidate families: ${candidateFamilies.length}`);

  // 3. Return FIRST matching family (we'll deal with season/division later)
  if (candidateFamilies.length > 0) {
    const familyId = candidateFamilies[0].id;
    console.log(`   🎉 RETURNING FAMILY ID: ${familyId}`);
    
    // Optional: Log if players exist in this season
    const { data: seasonPlayers } = await supabase
      .from('players')
      .select('id, first_name, last_name, division_id')
      .eq('family_id', familyId)
      .eq('season_id', seasonId)
      .limit(3);
    
    if (seasonPlayers && seasonPlayers.length > 0) {
      console.log(`   ✅ Family has ${seasonPlayers.length} player(s) in season ${seasonId}:`);
      seasonPlayers.forEach(p => {
        console.log(`      - ${p.first_name} ${p.last_name} (Division: ${p.division_id})`);
      });
    } else {
      console.log(`   ⚠️  Family has NO players in season ${seasonId} (but volunteer can still help)`);
    }
    
    console.log(`🔍 [FIND FAMILY DEBUG END] =================================\n`);
    return familyId;
  }

  console.log(`   🚫 No family found at all`);
  console.log(`🔍 [FIND FAMILY DEBUG END] =================================\n`);
  return null;
}

module.exports = router;