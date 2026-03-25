const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
// ADD THIS: Import and use permission enforcer
const { permissionEnforcer } = require('../middleware/permissionEnforcer');

// Apply permission enforcer to ALL volunteer routes
router.use(permissionEnforcer);

// ===== SYNC FUNCTION FOR BOARD MEMBER LINKING =====
/**
 * Find board member by email and sync training completions from volunteer to board member
 * This keeps volunteer and board member trainings in sync
 */
async function syncWithBoardMember(volunteerId, volunteerEmail) {
  try {
    if (!volunteerEmail) {
      console.log('No email provided for volunteer, cannot sync with board member');
      return;
    }
    
    console.log(`\n🔄 [SYNC FROM VOLUNTEER] Syncing trainings for volunteer ${volunteerId} with email: ${volunteerEmail}`);
    
    // Find board member with same email
    const { data: boardMember, error: boardMemberError } = await supabase
      .from('board_members')
      .select('id, email, first_name, last_name')
      .eq('email', volunteerEmail)
      .single();
    
    if (boardMemberError || !boardMember) {
      console.log(`No board member found with email: ${volunteerEmail}`);
      return;
    }
    
    console.log(`✅ Found board member: ${boardMember.first_name} ${boardMember.last_name} (${boardMember.id})`);
    
    // Get volunteer's current trainings
    const { data: volunteerTrainings, error: vtError } = await supabase
      .from('volunteer_trainings')
      .select(`
        id,
        training_id,
        status,
        completed_date,
        training:trainings (id, name, is_required)
      `)
      .eq('volunteer_id', volunteerId);
    
    if (vtError) {
      console.error('Error fetching volunteer trainings:', vtError);
      return;
    }
    
    console.log(`Found ${volunteerTrainings?.length || 0} volunteer trainings`);
    
    // Get board member's current trainings
    const { data: boardMemberTrainings, error: bmError } = await supabase
      .from('board_member_trainings')
      .select('id, training_id, status, completed_date')
      .eq('board_member_id', boardMember.id);
    
    if (bmError) {
      console.error('Error fetching board member trainings:', bmError);
      return;
    }
    
    console.log(`Found ${boardMemberTrainings?.length || 0} board member trainings`);
    
    // Create maps for easy lookup
    const volunteerTrainingMap = new Map();
    volunteerTrainings?.forEach(t => {
      volunteerTrainingMap.set(t.training_id, t);
    });
    
    const boardMemberTrainingMap = new Map();
    boardMemberTrainings?.forEach(t => {
      boardMemberTrainingMap.set(t.training_id, t);
    });
    
    // Sync from volunteer to board member
    for (const [trainingId, volunteerTraining] of volunteerTrainingMap) {
      const boardMemberTraining = boardMemberTrainingMap.get(trainingId);
      
      if (!boardMemberTraining) {
        // Board member doesn't have this training - create it
        const { error: insertError } = await supabase
          .from('board_member_trainings')
          .insert([{
            board_member_id: boardMember.id,
            training_id: trainingId,
            status: volunteerTraining.status,
            completed_date: volunteerTraining.completed_date,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          console.error(`Error creating board member training ${trainingId}:`, insertError);
        } else {
          console.log(`✅ Created board member training: ${volunteerTraining.training?.name || trainingId} with status: ${volunteerTraining.status}`);
        }
      } else if (boardMemberTraining.status !== volunteerTraining.status || 
                 boardMemberTraining.completed_date !== volunteerTraining.completed_date) {
        // Update board member's training to match volunteer
        const { error: updateError } = await supabase
          .from('board_member_trainings')
          .update({
            status: volunteerTraining.status,
            completed_date: volunteerTraining.completed_date,
            updated_at: new Date().toISOString()
          })
          .eq('id', boardMemberTraining.id);
        
        if (updateError) {
          console.error(`Error updating board member training ${trainingId}:`, updateError);
        } else {
          console.log(`✅ Updated board member training: ${volunteerTraining.training?.name || trainingId} to status: ${volunteerTraining.status}`);
        }
      }
    }
    
    console.log(`🔄 [SYNC FROM VOLUNTEER COMPLETE] Volunteer and board member trainings are now in sync\n`);
    
  } catch (error) {
    console.error('Error in syncWithBoardMember:', error);
  }
}

// ===== END SYNC FUNCTION =====

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
        trainings: trainings,
        training_completed: completedTrainings.length > 0,
        trainings_summary: {
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
    
    // Sync with board member if volunteer has email
    if (data.email) {
      await syncWithBoardMember(data.id, data.email);
    }

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

    // Clean the data - remove training-related fields that shouldn't be in volunteers table
    const { trainings, trainings_summary, division, season, team, ...dataToUpdate } = volunteerData;

    const { data, error } = await supabase
      .from('volunteers')
      .update(dataToUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    // Sync with board member if volunteer has email
    if (data.email) {
      await syncWithBoardMember(data.id, data.email);
    }

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
 * POST /api/trainings/volunteer/:volunteerId
 * Update volunteer's training status and sync with board member
 */
router.post('/trainings/volunteer/:volunteerId', async (req, res) => {
  try {
    const { volunteerId } = req.params;
    const { trainings } = req.body;
    
    console.log(`\n📝 Updating trainings for volunteer: ${volunteerId}`);
    
    // Get volunteer's email for syncing
    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('email, name')
      .eq('id', volunteerId)
      .single();
    
    if (volunteerError) {
      console.error('Error fetching volunteer:', volunteerError);
      return res.status(500).json({ error: volunteerError.message });
    }
    
    console.log(`Volunteer: ${volunteer.name}, Email: ${volunteer.email}`);
    
    // Update volunteer trainings
    for (const training of trainings) {
      const { data: existing, error: findError } = await supabase
        .from('volunteer_trainings')
        .select('id')
        .eq('volunteer_id', volunteerId)
        .eq('training_id', training.training_id)
        .single();
      
      if (findError && findError.code !== 'PGRST116') {
        console.error(`Error finding training ${training.training_id}:`, findError);
        continue;
      }
      
      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('volunteer_trainings')
          .update({
            status: training.status,
            completed_date: training.completed_date,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
        
        if (updateError) {
          console.error(`Error updating training ${training.training_id}:`, updateError);
        } else {
          console.log(`✅ Updated training ${training.training_id} to status: ${training.status}`);
        }
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from('volunteer_trainings')
          .insert([{
            volunteer_id: volunteerId,
            training_id: training.training_id,
            status: training.status,
            completed_date: training.completed_date,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          console.error(`Error creating training ${training.training_id}:`, insertError);
        } else {
          console.log(`✅ Created training ${training.training_id} with status: ${training.status}`);
        }
      }
    }
    
    // SYNC WITH BOARD MEMBER
    if (volunteer.email) {
      await syncWithBoardMember(volunteerId, volunteer.email);
    } else {
      console.log('⚠️ Volunteer has no email, cannot sync with board member');
    }
    
    // Return updated trainings
    const { data: updatedTrainings, error: fetchError } = await supabase
      .from('volunteer_trainings')
      .select(`
        *,
        training:trainings (id, name, is_required, category)
      `)
      .eq('volunteer_id', volunteerId);
    
    if (fetchError) {
      console.error('Error fetching updated trainings:', fetchError);
      return res.status(500).json({ error: fetchError.message });
    }
    
    console.log(`✅ Successfully synced ${updatedTrainings?.length || 0} trainings\n`);
    res.json(updatedTrainings);
    
  } catch (error) {
    console.error('Error updating volunteer trainings:', error);
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
 */
router.post('/import', async (req, res) => {
  try {
    const { volunteers: volunteersData, season_id } = req.body;

    console.log('=== VOLUNTEER IMPORT START ===');
    console.log('Season ID:', season_id);
    console.log('Raw volunteers data length:', volunteersData?.length);
    console.log('=== FIRST 3 ROWS RAW DATA ===');
    for (let i = 0; i < Math.min(3, volunteersData?.length || 0); i++) {
      console.log(`Row ${i}:`, JSON.stringify(volunteersData[i], null, 2));
    }
    console.log('=== END RAW DATA ===');

    if (!volunteersData || !Array.isArray(volunteersData)) {
      return res.status(400).json({ error: 'Invalid volunteers data' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    const errors = [];
    const processedVolunteers = [];

    // Cache family matches
    const familyMatchCache = new Map();
    
    const getCachedFamilyId = async ({ email, phone }, seasonId) => {
      const e = String(email || '').trim().toLowerCase();
      const p = normalizePhone(phone);
      
      const baseEmail = e.split('@')[0]?.replace(/\./g, '');
      const cacheKeys = [];
      
      if (e && p) cacheKeys.push(`${e}|${p}|${seasonId}`);
      if (e) cacheKeys.push(`${e}||${seasonId}`);
      if (p) cacheKeys.push(`|${p}|${seasonId}`);
      if (baseEmail && p) cacheKeys.push(`${baseEmail}@${e.split('@')[1]}|${p}|${seasonId}`);
      
      for (const key of cacheKeys) {
        if (familyMatchCache.has(key)) {
          return familyMatchCache.get(key);
        }
      }
      
      const fid = await findMatchingFamilyId({ email: e, phone: p }, seasonId);
      cacheKeys.forEach(key => {
        familyMatchCache.set(key, fid);
      });
      
      return fid;
    };

    // Load existing volunteers
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

    // Preload divisions and teams
    try {
      console.log('Loading divisions for mapping...');
      const { data: divisions, error: divisionsError } = await supabase
        .from('divisions')
        .select('id, name')
        .eq('season_id', season_id);

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

    const BATCH_SIZE = 100;
    const totalRows = volunteersData.length;
    let processedCount = 0;

    for (let batchStart = 0; batchStart < totalRows; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, totalRows);
      console.log(`\n=== Processing batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: rows ${batchStart + 1} to ${batchEnd} ===`);
      
      for (let index = batchStart; index < batchEnd; index++) {
        const volunteerData = volunteersData[index];
        const rowNumber = index + 1;

        try {
          if (!volunteerData['volunteer first name'] && !volunteerData['volunteer last name']) {
            errors.push(`Row ${rowNumber}: Missing volunteer name`);
            continue;
          }

          if (!volunteerData['division name']) {
            errors.push(`Row ${rowNumber}: Missing division name`);
            continue;
          }

          const cleanString = (value) => {
            if (!value) return '';
            return String(value).replace(/^["']+|["']+$/g, '').trim();
          };

          const rawDivisionName = volunteerData['division name'] || '';
          const divisionName = cleanString(rawDivisionName);
          let divisionId = null;

          if (divisionMap.size > 0) {
            divisionId = divisionMap.get(divisionName);
            
            if (!divisionId) {
              for (let [name, id] of divisionMap) {
                if (name.toLowerCase() === divisionName.toLowerCase()) {
                  divisionId = id;
                  break;
                }
              }
            }

            if (!divisionId) {
              errors.push(`Row ${rowNumber}: Division "${divisionName}" not found`);
              continue;
            }
          } else {
            errors.push(`Row ${rowNumber}: No divisions available in database`);
            continue;
          }

          let teamId = null;
          const teamName = volunteerData['team name'];
          if (teamName && teamName.trim() && teamName !== 'Unallocated' && teamMap.size > 0) {
            teamId = teamMap.get(teamName);
            if (!teamId) {
              for (let [name, id] of teamMap) {
                if (name.toLowerCase() === teamName.toLowerCase()) {
                  teamId = id;
                  break;
                }
              }
            }
          }

          const rawInterestedRoles = volunteerData['volunteer role'] || null;

          const matchedVolunteer = findExistingVolunteer(
            existingVolunteers || [],
            {
              name: `${volunteerData['volunteer first name']} ${volunteerData['volunteer last name']}`.trim(),
              email: volunteerData['volunteer email address'],
              phone: volunteerData['volunteer cellphone']
            },
            divisionId,
            season_id
          );

          let finalFamilyId = null;
          
          if (matchedVolunteer && matchedVolunteer.family_id) {
            finalFamilyId = matchedVolunteer.family_id;
          } else {
            finalFamilyId = await getCachedFamilyId(
              { 
                email: volunteerData['volunteer email address'], 
                phone: volunteerData['volunteer cellphone'] 
              },
              season_id
            );
          }

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
            notes: `Imported from volunteer signup. Original team: ${volunteerData['team name'] || 'Unallocated'}`,
            training_completed: false,
            background_check_completed: volunteerData['verification status'] || 'pending',
            background_check_complete: false,
            is_approved: false,
            shifts_completed: 0,
            shifts_required: 0,
            can_pickup: false,
            family_id: finalFamilyId,
            player_id: null,
          };

          const existingVolunteer = findExistingVolunteer(
            existingVolunteers || [],
            volunteerRecord,
            divisionId,
            season_id
          );

          if (existingVolunteer) {
            const updatedVolunteer = await updateExistingVolunteer(
              existingVolunteer,
              volunteerRecord
            );
            if (updatedVolunteer) {
              processedVolunteers.push(updatedVolunteer);
              // Sync with board member
              if (updatedVolunteer.email) {
                await syncWithBoardMember(updatedVolunteer.id, updatedVolunteer.email);
              }
            } else {
              processedVolunteers.push(existingVolunteer);
              // Sync with board member even if no changes
              if (existingVolunteer.email) {
                await syncWithBoardMember(existingVolunteer.id, existingVolunteer.email);
              }
            }
          } else {
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
              console.error(`Row ${rowNumber}: Error inserting volunteer:`, insertError);
              errors.push(`Row ${rowNumber}: Failed to insert volunteer: ${insertError.message}`);
              continue;
            }

            processedVolunteers.push(inserted);
            
            // Sync with board member
            if (inserted.email) {
              await syncWithBoardMember(inserted.id, inserted.email);
            }
          }
          
          processedCount++;
          
          if (processedCount % 50 === 0) {
            console.log(`Progress: ${processedCount}/${totalRows} rows processed`);
          }
          
        } catch (rowError) {
          console.error(`Error processing row ${index + 1}:`, rowError);
          errors.push(`Row ${index + 1}: ${rowError.message}`);
        }
      }
      
      if (batchEnd < totalRows) {
        console.log(`Batch complete. Waiting a moment before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    console.log(`Processing complete. ${processedVolunteers.length} valid volunteers, ${errors.length} errors`);

    if (processedVolunteers.length === 0) {
      return res.status(400).json({
        error: 'No valid volunteers to import',
        details: errors,
      });
    }

    const newVolunteers = processedVolunteers.filter((v) => !v.id);
    const updatedVolunteers = processedVolunteers.filter((v) => v.id);

    console.log(`New volunteers: ${newVolunteers.length}, Updated volunteers: ${updatedVolunteers.length}`);

    const response = {
      message: `${processedVolunteers.length} volunteers processed (${newVolunteers.length} new, ${updatedVolunteers.length} updated)`,
      data: processedVolunteers,
      warnings: errors,
    };

    if (errors.length > 0) {
      response.message += ` (${errors.length} rows had errors)`;
      console.log('\n=== ERRORS FOUND DURING IMPORT ===');
      errors.forEach((error, index) => {
        console.log(`Error ${index + 1}: ${error}`);
      });
      console.log('=== END ERRORS ===\n');
    } else {
      console.log('No errors during import');
    }

    console.log('=== VOLUNTEER IMPORT COMPLETE ===');
    console.log(`Successfully processed: ${processedVolunteers.length} volunteers`);
    console.log(`Errors: ${errors.length}`);
    
    res.status(201).json(response);
  } catch (error) {
    console.error('=== VOLUNTEER IMPORT ERROR ===');
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/volunteers/bulk-assign-trainings
 * Assign required trainings to all volunteers with eligible roles
 */
router.post('/bulk-assign-trainings', async (req, res) => {
  try {
    const { season_id } = req.body;
    
    if (!season_id) {
      return res.status(400).json({ error: 'season_id is required' });
    }
    
    // First, get all required trainings for volunteers
    const { data: requiredTrainings, error: trainingsError } = await supabase
      .from('trainings')
      .select('id, name, category')
      .eq('is_required', true)
      .in('category', ['volunteer', 'both']);
    
    if (trainingsError) {
      console.error('Error fetching trainings:', trainingsError);
      return res.status(500).json({ error: 'Failed to fetch trainings' });
    }
    
    if (!requiredTrainings || requiredTrainings.length === 0) {
      return res.status(400).json({ 
        error: 'No required trainings found for volunteers. Please create required trainings with category "volunteer" or "both".' 
      });
    }
    
    console.log(`Found ${requiredTrainings.length} required trainings:`);
    requiredTrainings.forEach(t => console.log(`  - ${t.name} (${t.category})`));
    
    const eligibleRoles = ['Manager', 'Coach', 'Assistant Coach', 'Team Parent'];
    
    // Get all volunteers with eligible roles
    const { data: volunteers, error: volunteerError } = await supabase
      .from('volunteers')
      .select('id, role, name, email')
      .eq('season_id', season_id)
      .in('role', eligibleRoles);
    
    if (volunteerError) throw volunteerError;
    
    console.log(`Found ${volunteers?.length || 0} volunteers with eligible roles`);
    
    let assignedCount = 0;
    let errorCount = 0;
    let alreadyCompleteCount = 0;
    const assignmentDetails = [];
    
    for (const volunteer of volunteers) {
      try {
        // Check existing assignments
        const { data: existing, error: existingError } = await supabase
          .from('volunteer_trainings')
          .select('training_id')
          .eq('volunteer_id', volunteer.id);
        
        if (existingError) {
          console.error(`Error checking existing trainings for ${volunteer.name}:`, existingError);
          errorCount++;
          continue;
        }
        
        const existingIds = new Set(existing?.map(e => e.training_id) || []);
        
        // Find which trainings need to be assigned
        const trainingsToAssign = requiredTrainings
          .filter(t => !existingIds.has(t.id))
          .map(training => ({
            volunteer_id: volunteer.id,
            training_id: training.id,
            status: 'pending',
            completed_date: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
        
        if (trainingsToAssign.length > 0) {
          const { error: insertError } = await supabase
            .from('volunteer_trainings')
            .insert(trainingsToAssign);
          
          if (insertError) {
            errorCount++;
            console.error(`❌ Failed to assign trainings to ${volunteer.name}:`, insertError);
            assignmentDetails.push({
              name: volunteer.name,
              role: volunteer.role,
              status: 'failed',
              error: insertError.message
            });
          } else {
            assignedCount++;
            console.log(`✅ Assigned ${trainingsToAssign.length} training(s) to ${volunteer.name} (${volunteer.role})`);
            assignmentDetails.push({
              name: volunteer.name,
              role: volunteer.role,
              status: 'success',
              trainings_assigned: trainingsToAssign.length,
              training_names: trainingsToAssign.map(t => {
                const training = requiredTrainings.find(rt => rt.id === t.training_id);
                return training?.name || 'Unknown';
              })
            });
            
            // Sync with board member if volunteer has email
            if (volunteer.email) {
              await syncWithBoardMember(volunteer.id, volunteer.email);
            }
          }
        } else {
          alreadyCompleteCount++;
          console.log(`⏭️ Volunteer ${volunteer.name} already has all required trainings`);
          assignmentDetails.push({
            name: volunteer.name,
            role: volunteer.role,
            status: 'already_complete',
            trainings_assigned: 0
          });
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing volunteer ${volunteer.name}:`, error);
        assignmentDetails.push({
          name: volunteer.name,
          role: volunteer.role,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Assigned trainings to ${assignedCount} volunteers (${alreadyCompleteCount} already had them, ${errorCount} errors)`,
      assigned: assignedCount,
      already_complete: alreadyCompleteCount,
      errors: errorCount,
      details: assignmentDetails,
      total_volunteers: volunteers?.length || 0,
      required_trainings: requiredTrainings.map(t => ({ id: t.id, name: t.name, category: t.category }))
    });
  } catch (error) {
    console.error('Error in bulk-assign-trainings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Try to find an existing volunteer in DB that matches this row.
 */
function findExistingVolunteer(existingVolunteers, volunteerRecord, divisionId, seasonId) {
  if (!existingVolunteers || !Array.isArray(existingVolunteers)) {
    return null;
  }

  const volunteerId = volunteerRecord.volunteer_id;
  
  if (volunteerId) {
    const matchById = existingVolunteers.find(
      (v) => String(v.volunteer_id) === String(volunteerId) && v.season_id === seasonId
    );
    if (matchById) {
      return matchById;
    }
  }
  
  return null;
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
 */
async function updateExistingVolunteer(existingVolunteer, newVolunteerData) {
  const updates = {};
  let hasChanges = false;

  console.log(`\n🔄 [UPDATE CHECK] for ${existingVolunteer.name}`);
  console.log(`   Existing family_id: ${existingVolunteer.family_id}`);
  console.log(`   New family_id: ${newVolunteerData.family_id}`);
  
  if (newVolunteerData.division_id !== undefined && 
      newVolunteerData.division_id !== existingVolunteer.division_id) {
    updates.division_id = newVolunteerData.division_id;
    hasChanges = true;
    console.log(`   ✅ Division ID needs update: ${existingVolunteer.division_id} -> ${newVolunteerData.division_id}`);
  }

  // Family ID - ONLY update if we have a VALID family_id from matching
  if (newVolunteerData.family_id !== undefined && 
      newVolunteerData.family_id !== null && 
      newVolunteerData.family_id !== '') {
    if (newVolunteerData.family_id !== existingVolunteer.family_id) {
      updates.family_id = newVolunteerData.family_id;
      hasChanges = true;
      console.log(`   ✅ Family ID needs update: ${existingVolunteer.family_id} -> ${newVolunteerData.family_id}`);
    }
  } else if (existingVolunteer.family_id) {
    console.log(`   🛡️ Preserving existing family_id: ${existingVolunteer.family_id} (no match found in import)`);
  }

  if (newVolunteerData.email && newVolunteerData.email !== existingVolunteer.email) {
    updates.email = newVolunteerData.email;
    hasChanges = true;
    console.log(`   ✅ Email needs update`);
  }

  if (newVolunteerData.phone && normalizePhone(newVolunteerData.phone) !== normalizePhone(existingVolunteer.phone)) {
    updates.phone = newVolunteerData.phone;
    hasChanges = true;
    console.log(`   ✅ Phone needs update`);
  }

  // Team - Only update if a valid team_id is provided
  if (newVolunteerData.team_id !== undefined && newVolunteerData.team_id !== null && newVolunteerData.team_id !== '') {
    if (newVolunteerData.team_id !== existingVolunteer.team_id) {
      updates.team_id = newVolunteerData.team_id;
      hasChanges = true;
      console.log(`   ✅ Team ID needs update: ${existingVolunteer.team_id} -> ${newVolunteerData.team_id}`);
    }
  } else if (existingVolunteer.team_id) {
    console.log(`   ⏭️ No team in CSV, preserving existing team: ${existingVolunteer.team_id}`);
  }

  if (newVolunteerData.notes && newVolunteerData.notes !== existingVolunteer.notes) {
    updates.notes = newVolunteerData.notes;
    hasChanges = true;
    console.log(`   ✅ Notes need update`);
  }

  if (newVolunteerData.training_completed !== undefined && newVolunteerData.training_completed !== existingVolunteer.training_completed) {
    updates.training_completed = newVolunteerData.training_completed;
    hasChanges = true;
    console.log(`   ✅ Training completed needs update`);
  }

  if (newVolunteerData.background_check_completed && newVolunteerData.background_check_completed !== existingVolunteer.background_check_completed) {
    updates.background_check_completed = newVolunteerData.background_check_completed;
    hasChanges = true;
    console.log(`   ✅ Background check needs update`);
  }

  if (newVolunteerData.interested_roles && newVolunteerData.interested_roles !== existingVolunteer.interested_roles) {
    updates.interested_roles = newVolunteerData.interested_roles;
    hasChanges = true;
    console.log(`   ✅ Interested roles need update: "${newVolunteerData.interested_roles}"`);
  }
  
  if (newVolunteerData.volunteer_id && newVolunteerData.volunteer_id !== existingVolunteer.volunteer_id) {
    updates.volunteer_id = newVolunteerData.volunteer_id;
    hasChanges = true;
    console.log(`   ✅ Volunteer ID needs update`);
  }

  if (newVolunteerData.volunteer_type_id && newVolunteerData.volunteer_type_id !== existingVolunteer.volunteer_type_id) {
    updates.volunteer_type_id = newVolunteerData.volunteer_type_id;
    hasChanges = true;
    console.log(`   ✅ Volunteer Type ID needs update`);
  }

  console.log(`   Has changes? ${hasChanges}`);
  console.log(`   Updates object:`, updates);

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

/**
 * Try to find a matching family by email/phone.
 */
async function findMatchingFamilyId({ email, phone }, seasonId) {
  console.log(`\n🔍 [FIND FAMILY DEBUG START] =================================`);
  console.log(`   Email: "${email}"`);
  console.log(`   Phone: "${phone}"`);
  console.log(`   Season ID: "${seasonId}"`);
  
  const emailNorm = String(email || '').trim().toLowerCase();
  const phoneNorm = normalizePhone(phone);
  
  let candidateFamilies = [];

  if (emailNorm) {
    const { data: famByEmail, error: emailError } = await supabase
      .from('families')
      .select('id, primary_contact_email, parent2_email')
      .or(`primary_contact_email.ilike.${emailNorm},parent2_email.ilike.${emailNorm}`);

    if (emailError) {
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
  }

  if (candidateFamilies.length === 0 && phoneNorm && phoneNorm.length >= 4) {
    const { data: famCandidates } = await supabase
      .from('families')
      .select('id, primary_contact_phone, parent2_phone')
      .or(`primary_contact_phone.ilike.%${phoneNorm.slice(-4)}%,parent2_phone.ilike.%${phoneNorm.slice(-4)}%`)
      .limit(50);
    
    for (const fam of famCandidates || []) {
      const p1 = normalizePhone(fam.primary_contact_phone);
      const p2 = normalizePhone(fam.parent2_phone);
      
      if ((p1 && p1 === phoneNorm) || (p2 && p2 === phoneNorm)) {
        candidateFamilies.push({ id: fam.id });
        break;
      }
    }
  }

  if (candidateFamilies.length > 0) {
    const familyId = candidateFamilies[0].id;
    console.log(`   🎉 RETURNING FAMILY ID: ${familyId}`);
    console.log(`🔍 [FIND FAMILY DEBUG END] =================================\n`);
    return familyId;
  }

  console.log(`   🚫 No family found at all`);
  console.log(`🔍 [FIND FAMILY DEBUG END] =================================\n`);
  return null;
}

module.exports = router;