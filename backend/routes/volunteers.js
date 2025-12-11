const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all volunteers with division, season, and team info
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
        team:teams!volunteers_team_id_fkey (id, name)
      `)
      .order('name', { ascending: true });

    if (division_id) query = query.eq('division_id', division_id);
    if (season_id) query = query.eq('season_id', season_id);

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

// Create new volunteer - update to include team
router.post('/', async (req, res) => {
  try {
    const volunteerData = req.body;
    console.log('Creating volunteer:', volunteerData);
    
    // Validate required fields
    if (!volunteerData.name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!volunteerData.role) {
      return res.status(400).json({ error: 'Role is required' });
    }
    if (!volunteerData.season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    const { data, error } = await supabase
      .from('volunteers')
      .insert([volunteerData])
      .select(`
        *,
        division:divisions (id, name),
        season:seasons (id, name),
        team:teams!volunteers_team_id_fkey (id, name)
      `);

    if (error) {
      console.error('Supabase error creating volunteer:', error);
      throw error;
    }
    
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Error creating volunteer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update volunteer - update to include team
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
        team:teams!volunteers_team_id_fkey (id, name)
      `);

    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Volunteer not found' });
    }
    
    console.log('Updated volunteer with team:', data[0].team);
    res.json(data[0]);
  } catch (error) {
    console.error('Error updating volunteer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete volunteer
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

// Import volunteers from CSV - ENHANCED WITH SMART MERGE AND MULTIPLE ROLE SUPPORT
router.post('/import', async (req, res) => {
  try {
    const { volunteers: volunteersData, season_id } = req.body;
    
    console.log('=== VOLUNTEER IMPORT START (SMART MERGE) ===');
    console.log('Season ID:', season_id);
    console.log('Raw volunteers data length:', volunteersData?.length);
    
    if (!volunteersData || !Array.isArray(volunteersData)) {
      return res.status(400).json({ error: 'Invalid volunteers data' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    // Get existing volunteers for this season to check for duplicates
    console.log('Checking for existing volunteers in season:', season_id);
    const { data: existingVolunteers, error: existingVolunteersError } = await supabase
      .from('volunteers')
      .select('*')
      .eq('season_id', season_id);

    if (existingVolunteersError) {
      console.error('Error fetching existing volunteers:', existingVolunteersError);
      throw existingVolunteersError;
    }

    console.log('Found existing volunteers:', existingVolunteers?.length);

    const processedVolunteers = [];
    const errors = [];
    const divisionMap = new Map();
    const teamMap = new Map();

    try {
      // First, get all divisions to map names to IDs
      console.log('Loading divisions for mapping...');
      const { data: divisions, error: divisionsError } = await supabase
        .from('divisions')
        .select('id, name');
      
      if (divisionsError) {
        console.error('Error fetching divisions:', divisionsError);
        throw divisionsError;
      }
      
      console.log('Available divisions:', divisions);
      
      if (divisions && divisions.length > 0) {
        divisions.forEach(division => {
          divisionMap.set(division.name, division.id);
        });
        console.log('Division map created with', divisionMap.size, 'divisions');
      } else {
        console.warn('No divisions found in database');
      }

      // Also get teams for team mapping (optional)
      console.log('Loading teams for mapping...');
      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, name');
      
      if (!teamsError && teams) {
        teams.forEach(team => {
          teamMap.set(team.name, team.id);
        });
        console.log('Team map created with', teamMap.size, 'teams');
      }
      
    } catch (mappingError) {
      console.error('Failed to load mappings:', mappingError);
      errors.push('Failed to load divisions/teams from database');
    }

    console.log('Processing CSV rows...');
    
    for (const [index, volunteerData] of volunteersData.entries()) {
      try {
        console.log(`Processing row ${index + 1}:`, volunteerData);
        
        // Validate required fields - using the exact CSV headers (lowercase)
        if (!volunteerData['volunteer first name'] || !volunteerData['volunteer last name']) {
          errors.push(`Row ${index + 1}: Missing volunteer name`);
          console.log(`Row ${index + 1} skipped: Missing name`);
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
            // Try case-insensitive matching
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

        // Find team ID if team name is provided (optional)
        let teamId = null;
        const teamName = volunteerData['team name'];
        if (teamName && teamName.trim() && teamName !== 'Unallocated' && teamMap.size > 0) {
          teamId = teamMap.get(teamName);
          if (!teamId) {
            // Try case-insensitive matching for team
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

        const volunteerRecord = {
          name: `${volunteerData['volunteer first name']} ${volunteerData['volunteer last name']}`.trim(),
          email: volunteerData['volunteer email address'] || null,
          phone: volunteerData['volunteer cellphone'] || null,
          role: volunteerData['volunteer role'] || 'Parent',
          division_id: divisionId,
          season_id: season_id,
          team_id: teamId,
          notes: `Imported from volunteer signup. Original team: ${volunteerData['team name'] || 'Unallocated'}`,
          // Set defaults for your schema
          background_check_completed: false,
          background_check_complete: false,
          is_approved: false,
          shifts_completed: 0,
          shifts_required: 0,
          can_pickup: false,
          family_id: null,
          player_id: null
        };

        // Check if volunteer already exists using multiple strategies
        const existingVolunteer = findExistingVolunteer(existingVolunteers, volunteerRecord, divisionId, season_id);
        
        if (existingVolunteer) {
          console.log(`Found existing volunteer: ${volunteerRecord.name}, checking for updates`);
          
          // Update existing volunteer if needed
          const updatedVolunteer = await updateExistingVolunteer(existingVolunteer, volunteerRecord);
          if (updatedVolunteer) {
            processedVolunteers.push(updatedVolunteer);
          } else {
            console.log(`No updates needed for volunteer: ${volunteerRecord.name}`);
            processedVolunteers.push(existingVolunteer);
          }
        } else {
          // Check if this is a duplicate in the current import batch (same person, same division, same role)
          const isDuplicateInBatch = processedVolunteers.some(v => 
            isSameVolunteer(v, volunteerRecord) && 
            v.division_id === divisionId && 
            v.role === volunteerRecord.role
          );
          
          if (isDuplicateInBatch) {
            console.log(`Skipping duplicate in batch: ${volunteerRecord.name} (${volunteerRecord.role} in division ${divisionId})`);
            errors.push(`Row ${index + 1}: Duplicate volunteer ${volunteerRecord.name} with same role in same division`);
          } else {
            console.log(`Creating new volunteer: ${volunteerRecord.name} (${volunteerRecord.role})`);
            processedVolunteers.push(volunteerRecord);
          }
        }

      } catch (error) {
        console.error(`Error processing row ${index + 1}:`, error);
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    console.log(`Processing complete. ${processedVolunteers.length} valid volunteers, ${errors.length} errors`);

    if (processedVolunteers.length === 0) {
      return res.status(400).json({ 
        error: 'No valid volunteers to import', 
        details: errors
      });
    }

    // Separate new volunteers from updated ones
    const newVolunteers = processedVolunteers.filter(v => !v.id);
    const updatedVolunteers = processedVolunteers.filter(v => v.id);

    console.log(`New volunteers: ${newVolunteers.length}, Updated volunteers: ${updatedVolunteers.length}`);

    let insertedVolunteers = [];

    // Insert new volunteers
    if (newVolunteers.length > 0) {
      console.log('Inserting new volunteers into database...');
      const { data: inserted, error: insertError } = await supabase
        .from('volunteers')
        .insert(newVolunteers)
        .select(`
          *,
          division:divisions (id, name),
          season:seasons (id, name),
          team:teams!volunteers_team_id_fkey (id, name)
        `);

      if (insertError) {
        console.error('Database insert error:', insertError);
        throw insertError;
      }
      insertedVolunteers = inserted || [];
    }

    // Combine inserted and updated volunteers for response
    const allVolunteers = [...insertedVolunteers, ...updatedVolunteers];

    const response = { 
      message: `${allVolunteers.length} volunteers processed successfully (${newVolunteers.length} new, ${updatedVolunteers.length} updated)`, 
      data: allVolunteers,
      warnings: errors
    };

    if (errors.length > 0) {
      response.message += ` (${errors.length} rows had errors)`;
    }

    console.log('=== VOLUNTEER IMPORT COMPLETE (SMART MERGE) ===');
    res.status(201).json(response);
  } catch (error) {
    console.error('=== VOLUNTEER IMPORT ERROR ===');
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW: Helper function to find existing volunteer
function findExistingVolunteer(existingVolunteers, volunteerRecord, divisionId, seasonId) {
  if (!existingVolunteers || !Array.isArray(existingVolunteers)) return null;
  
  // Try multiple matching strategies in order of priority
  
  // Strategy 1: Same person, same division, same role (exact duplicate)
  const exactMatch = existingVolunteers.find(volunteer => 
    volunteer.season_id === seasonId &&
    volunteer.division_id === divisionId &&
    volunteer.role === volunteerRecord.role &&
    isSameVolunteer(volunteer, volunteerRecord)
  );
  
  if (exactMatch) return exactMatch;
  
  // Strategy 2: Same person, same division, different role (multiple roles allowed)
  const samePersonSameDivision = existingVolunteers.find(volunteer => 
    volunteer.season_id === seasonId &&
    volunteer.division_id === divisionId &&
    isSameVolunteer(volunteer, volunteerRecord)
  );
  
  if (samePersonSameDivision) {
    console.log(`Found same person in same division with different role: ${volunteerRecord.name} (existing: ${samePersonSameDivision.role}, new: ${volunteerRecord.role})`);
    // Allow multiple roles - don't return as existing so a new record will be created
    return null;
  }
  
  // Strategy 3: Same person, different division (different division = different volunteer record)
  const samePersonDifferentDivision = existingVolunteers.find(volunteer => 
    volunteer.season_id === seasonId &&
    volunteer.division_id !== divisionId &&
    isSameVolunteer(volunteer, volunteerRecord)
  );
  
  if (samePersonDifferentDivision) {
    console.log(`Found same person in different division: ${volunteerRecord.name} (existing division: ${samePersonDifferentDivision.division_id}, new division: ${divisionId})`);
    // Different division = different volunteer record
    return null;
  }
  
  // Strategy 4: Email match (for volunteers without proper name matching)
  if (volunteerRecord.email) {
    const emailMatch = existingVolunteers.find(volunteer => 
      volunteer.season_id === seasonId &&
      volunteer.email === volunteerRecord.email &&
      volunteer.division_id === divisionId &&
      volunteer.role === volunteerRecord.role
    );
    
    if (emailMatch) return emailMatch;
  }
  
  return null;
}

// NEW: Helper function to check if two volunteer records represent the same person
function isSameVolunteer(volunteer1, volunteer2) {
  // Name matching (primary method)
  if (volunteer1.name && volunteer2.name && 
      volunteer1.name.toLowerCase() === volunteer2.name.toLowerCase()) {
    return true;
  }
  
  // Email matching (secondary method)
  if (volunteer1.email && volunteer2.email && 
      volunteer1.email.toLowerCase() === volunteer2.email.toLowerCase()) {
    return true;
  }
  
  // Phone matching (tertiary method)
  if (volunteer1.phone && volunteer2.phone && 
      normalizePhone(volunteer1.phone) === normalizePhone(volunteer2.phone)) {
    return true;
  }
  
  return false;
}

// NEW: Helper function to normalize phone numbers for comparison
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, ''); // Remove all non-digit characters
}

// NEW: Helper function to update existing volunteer
async function updateExistingVolunteer(existingVolunteer, newVolunteerData) {
  const updates = {};
  let hasChanges = false;
  
  // Only update fields that have new data and are different from existing data
  if (newVolunteerData.email && newVolunteerData.email !== existingVolunteer.email) {
    updates.email = newVolunteerData.email;
    hasChanges = true;
  }
  
  if (newVolunteerData.phone && normalizePhone(newVolunteerData.phone) !== normalizePhone(existingVolunteer.phone)) {
    updates.phone = newVolunteerData.phone;
    hasChanges = true;
  }
  
  if (newVolunteerData.team_id !== undefined && newVolunteerData.team_id !== existingVolunteer.team_id) {
    updates.team_id = newVolunteerData.team_id;
    hasChanges = true;
  }
  
  if (newVolunteerData.notes && newVolunteerData.notes !== existingVolunteer.notes) {
    updates.notes = newVolunteerData.notes;
    hasChanges = true;
  }
  
  // If there are updates to make, update the volunteer
  if (hasChanges) {
    console.log(`Updating volunteer ${existingVolunteer.name} with changes:`, updates);
    
    const { data: updatedVolunteer, error } = await supabase
      .from('volunteers')
      .update(updates)
      .eq('id', existingVolunteer.id)
      .select(`
        *,
        division:divisions (id, name),
        season:seasons (id, name),
        team:teams!volunteers_team_id_fkey (id, name)
      `)
      .single();

    if (error) {
      console.error('Error updating volunteer:', error);
      throw error;
    }
    
    return updatedVolunteer;
  } else {
    console.log(`No changes needed for volunteer ${existingVolunteer.name}`);
    return null; // No updates were made
  }
}

module.exports = router;