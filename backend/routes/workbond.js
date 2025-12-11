const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get workbond requirements for divisions
router.get('/requirements', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    let query = supabase
      .from('workbond_requirements')
      .select(`
        *,
        division:divisions (id, name),
        season:seasons (id, name)
      `);

    if (season_id) query = query.eq('season_id', season_id);

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update workbond requirement
router.post('/requirements', async (req, res) => {
  try {
    const { division_id, season_id, shifts_required } = req.body;
    
    // Check if requirement already exists
    const { data: existing } = await supabase
      .from('workbond_requirements')
      .select('id')
      .eq('division_id', division_id)
      .eq('season_id', season_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('workbond_requirements')
        .update({ shifts_required })
        .eq('id', existing.id)
        .select(`
          *,
          division:divisions (id, name),
          season:seasons (id, name)
        `);
      
      if (error) throw error;
      result = data[0];
    } else {
      // Create new
      const { data, error } = await supabase
        .from('workbond_requirements')
        .insert([{ division_id, season_id, shifts_required }])
        .select(`
          *,
          division:divisions (id, name),
          season:seasons (id, name)
        `);
      
      if (error) throw error;
      result = data[0];
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get workbond shifts
router.get('/shifts', async (req, res) => {
  try {
    const { family_id, season_id, verified } = req.query;
    
    let query = supabase
      .from('workbond_shifts')
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email),
        volunteer:volunteers (name, email),
        season:seasons (id, name)
      `)
      .order('shift_date', { ascending: false });

    if (family_id) query = query.eq('family_id', family_id);
    if (season_id) query = query.eq('season_id', season_id);
    if (verified !== undefined) {
      query = verified === 'true' ? query.not('verified_by', 'is', null) : query.is('verified_by', null);
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add workbond shift
router.post('/shifts', async (req, res) => {
  try {
    const shiftData = req.body;
    
    // Ensure we have at least one shift completed
    if (!shiftData.spots_completed || shiftData.spots_completed < 1) {
      shiftData.spots_completed = 1;
    }
    
    const { data, error } = await supabase
      .from('workbond_shifts')
      .insert([shiftData])
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email),
        volunteer:volunteers (name, email),
        season:seasons (id, name)
      `);

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update workbond shift
router.put('/shifts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const shiftData = req.body;
    
    const { data, error } = await supabase
      .from('workbond_shifts')
      .update(shiftData)
      .eq('id', id)
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email),
        volunteer:volunteers (name, email),
        season:seasons (id, name)
      `);

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete workbond shift
router.delete('/shifts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('workbond_shifts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Shift deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Updated exemption function to include Board Members from board_members table
async function isFamilyExemptFromWorkbond(familyId, seasonId) {
  try {
    console.log(`Checking exemption for family ${familyId} in season ${seasonId}`);
    
    // Check if any volunteer from this family has an exempt role
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, name, role, team_id')
      .eq('family_id', familyId)
      .eq('season_id', seasonId)
      .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach'])
      .not('team_id', 'is', null);

    if (volunteersError) {
      console.error('Error checking volunteers:', volunteersError);
    }

    // Check if any family member is a Board Member (using family_id link)
    const { data: boardMembers, error: boardMembersError } = await supabase
      .from('board_members')
      .select('id, name, role, email, family_id, is_active')
      .eq('family_id', familyId)
      .eq('is_active', true); // Only consider active board members

    if (boardMembersError) {
      console.error('Error checking board members:', boardMembersError);
    }

    console.log(`Found ${volunteers?.length || 0} exempt volunteers and ${boardMembers?.length || 0} board members for family ${familyId}`);

    // Family is exempt if they have either:
    // 1. Volunteers with exempt roles AND team assignments, OR
    // 2. Active board members
    const hasExemptVolunteers = volunteers && volunteers.length > 0;
    const hasBoardMembers = boardMembers && boardMembers.length > 0;

    if (hasExemptVolunteers) {
      console.log(`Family exempt: Has exempt volunteer(s) with team assignments`);
      volunteers.forEach(v => {
        console.log(`- ${v.name}: ${v.role}`);
      });
      return true;
    }

    if (hasBoardMembers) {
      console.log(`Family exempt: Has board member(s)`);
      boardMembers.forEach(b => {
        console.log(`- ${b.name}: ${b.role} (active: ${b.is_active})`);
      });
      return true;
    }

    console.log('Family NOT exempt - no exempt volunteers with team assignments and no active board members');
    return false;
  } catch (error) {
    console.error('Error in exemption check:', error);
    return false;
  }
}

// Get workbond summary for families - UPDATED to show all volunteers
router.get('/summary', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    console.log('Loading workbond summary for season:', season_id);

    // Get families
    const { data: families, error: familiesError } = await supabase
      .from('families')
      .select('id, family_id, primary_contact_name, primary_contact_email')
      .order('primary_contact_name');

    if (familiesError) {
      console.error('Error fetching families:', familiesError);
      throw familiesError;
    }

    // Get players for this season
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        id,
        first_name,
        last_name,
        family_id,
        division:divisions (id, name),
        program_title,
        season_id
      `)
      .eq('season_id', season_id);

    if (playersError) {
      console.error('Error fetching players:', playersError);
      throw playersError;
    }

    // Get ALL volunteers for this season (including unlinked ones)
    const { data: allVolunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select(`
        id, 
        family_id, 
        role, 
        is_approved, 
        season_id,
        team_id,
        name,
        email
      `)
      .eq('season_id', season_id);

    if (volunteersError) {
      console.error('Error fetching volunteers:', volunteersError);
      throw volunteersError;
    }

    // Get workbond requirements
    const { data: requirements, error: requirementsError } = await supabase
      .from('workbond_requirements')
      .select(`
        division_id,
        shifts_required,
        division:divisions (name)
      `)
      .eq('season_id', season_id);

    if (requirementsError) {
      console.error('Error fetching requirements:', requirementsError);
      // Don't throw, continue with default requirements
    }

    // Get completed shifts
    const { data: shifts, error: shiftsError } = await supabase
      .from('workbond_shifts')
      .select('family_id, spots_completed')
      .eq('season_id', season_id);

    if (shiftsError) {
      console.error('Error fetching shifts:', shiftsError);
      // Don't throw, continue with 0 shifts
    }

    console.log(`Data loaded: ${families?.length} families, ${players?.length} players, ${allVolunteers?.length} volunteers`);

    // Show unlinked volunteers for debugging
    const unlinkedVolunteers = allVolunteers?.filter(v => !v.family_id) || [];
    console.log(`Unlinked volunteers: ${unlinkedVolunteers.length}`);
    unlinkedVolunteers.forEach(v => {
      console.log(`- ${v.name}: ${v.role} (email: ${v.email})`);
    });

    // Build summary
    const summary = [];
    
    for (const family of families) {
      try {
        const familyPlayers = players.filter(p => p.family_id === family.id);
        const familyVolunteers = allVolunteers.filter(v => v.family_id === family.id);
        const familyShifts = shifts ? shifts.filter(s => s.family_id === family.id) : [];
        
        // Calculate completed shifts
        const completedShifts = familyShifts.reduce((total, shift) => {
          return total + parseInt(shift.spots_completed || 1);
        }, 0);
        
        // Calculate required shifts (simplified - always 2 for now)
        const requiredShifts = 2;

        // Check if family is exempt
        const isExempt = await isFamilyExemptFromWorkbond(family.id, season_id);

        const finalRequiredShifts = isExempt ? 0 : requiredShifts;
        const remainingShifts = Math.max(0, finalRequiredShifts - completedShifts);
        const status = isExempt ? 'exempt' : 
                     remainingShifts === 0 ? 'completed' : 
                     'incomplete';

        summary.push({
          family_id: family.id,
          family_identifier: family.family_id,
          family_name: family.primary_contact_name,
          email: family.primary_contact_email,
          players: familyPlayers.map(p => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            full_name: `${p.first_name} ${p.last_name}`,
            division: p.division?.name || p.program_title || 'Unknown Division'
          })),
          volunteers: familyVolunteers.map(v => ({
            role: v.role,
            is_approved: v.is_approved,
            name: v.name
          })),
          required_shifts: finalRequiredShifts,
          completed_shifts: completedShifts,
          remaining_shifts: remainingShifts,
          status: status,
          is_exempt: isExempt
        });
      } catch (familyError) {
        console.error(`Error processing family ${family.id}:`, familyError);
        // Continue with next family
      }
    }

    console.log(`Summary built: ${summary.length} families processed`);
    res.json(summary);
    
  } catch (error) {
    console.error('Error in workbond summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Link volunteer to family
router.post('/link-volunteer', async (req, res) => {
  try {
    const { volunteer_id, family_id } = req.body;
    
    if (!volunteer_id || !family_id) {
      return res.status(400).json({ error: 'Volunteer ID and Family ID are required' });
    }

    // Update the volunteer with the family_id
    const { data, error } = await supabase
      .from('volunteers')
      .update({ family_id: family_id })
      .eq('id', volunteer_id)
      .select('*');

    if (error) throw error;

    res.json({ 
      message: 'Volunteer linked to family successfully',
      volunteer: data[0]
    });
  } catch (error) {
    console.error('Error linking volunteer:', error);
    res.status(500).json({ error: error.message });
  }
});

// Find unlinked volunteers
router.get('/unlinked-volunteers', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    let query = supabase
      .from('volunteers')
      .select(`
        *,
        division:divisions (name),
        team:teams (name)
      `)
      .is('family_id', null);

    if (season_id) query = query.eq('season_id', season_id);

    const { data, error } = await query;

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error fetching unlinked volunteers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-link volunteers by email matching
router.post('/auto-link-volunteers', async (req, res) => {
  try {
    const { season_id } = req.body;
    
    console.log('Auto-linking volunteers for season:', season_id);

    // Get all unlinked volunteers
    let unlinkedQuery = supabase
      .from('volunteers')
      .select('*')
      .is('family_id', null);

    if (season_id) unlinkedQuery = unlinkedQuery.eq('season_id', season_id);

    const { data: unlinkedVolunteers, error: unlinkedError } = await unlinkedQuery;

    if (unlinkedError) throw unlinkedError;

    // Get all families
    const { data: families, error: familiesError } = await supabase
      .from('families')
      .select('id, primary_contact_email, parent2_email, primary_contact_phone, parent2_phone');

    if (familiesError) throw familiesError;

    console.log(`Found ${unlinkedVolunteers?.length || 0} unlinked volunteers and ${families?.length || 0} families`);

    const results = {
      linked: [],
      failed: []
    };

    for (const volunteer of unlinkedVolunteers || []) {
      try {
        let matchedFamily = null;

        // Try to match by email
        if (volunteer.email) {
          matchedFamily = families.find(f => 
            f.primary_contact_email?.toLowerCase() === volunteer.email.toLowerCase() ||
            f.parent2_email?.toLowerCase() === volunteer.email.toLowerCase()
          );
        }

        // If no email match, try by phone
        if (!matchedFamily && volunteer.phone) {
          const volunteerPhone = volunteer.phone.replace(/\D/g, '');
          matchedFamily = families.find(f => 
            (f.primary_contact_phone && f.primary_contact_phone.replace(/\D/g, '') === volunteerPhone) ||
            (f.parent2_phone && f.parent2_phone.replace(/\D/g, '') === volunteerPhone)
          );
        }

        if (matchedFamily) {
          // Link the volunteer to the family
          const { data: updatedVolunteer, error: updateError } = await supabase
            .from('volunteers')
            .update({ family_id: matchedFamily.id })
            .eq('id', volunteer.id)
            .select('*');

          if (updateError) {
            console.error(`Error linking volunteer ${volunteer.id}:`, updateError);
            results.failed.push({
              volunteer: volunteer,
              error: updateError.message
            });
          } else {
            console.log(`Linked volunteer ${volunteer.name} to family ${matchedFamily.id}`);
            results.linked.push(updatedVolunteer[0]);
          }
        } else {
          results.failed.push({
            volunteer: volunteer,
            error: 'No matching family found'
          });
        }
      } catch (error) {
        console.error(`Error processing volunteer ${volunteer.id}:`, error);
        results.failed.push({
          volunteer: volunteer,
          error: error.message
        });
      }
    }

    res.json({
      message: `Auto-linking completed: ${results.linked.length} linked, ${results.failed.length} failed`,
      results: results
    });
  } catch (error) {
    console.error('Error in auto-linking:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import workbond shifts from spreadsheet - FIXED VERSION
router.post('/import-shifts', async (req, res) => {
  try {
    const { shifts: shiftsData, season_id } = req.body;
    
    if (!shiftsData || !Array.isArray(shiftsData)) {
      return res.status(400).json({ error: 'Invalid shifts data' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    console.log('=== WORKBOND SHIFT IMPORT START ===');
    console.log('Processing', shiftsData.length, 'shift records for season:', season_id);

    const processedShifts = [];
    const errors = [];
    const unlinkedVolunteers = [];
    const shiftKeys = new Set();

    // Get all families for matching
    const { data: families, error: familiesError } = await supabase
      .from('families')
      .select('id, primary_contact_email, parent2_email, primary_contact_phone, parent2_phone');

    if (familiesError) {
      console.error('Error fetching families:', familiesError);
      throw familiesError;
    }

    console.log('Found', families?.length || 0, 'families for matching');

    // Get existing shifts to check for duplicates
    const { data: existingShifts, error: existingShiftsError } = await supabase
      .from('workbond_shifts')
      .select('*')
      .eq('season_id', season_id);

    if (existingShiftsError) {
      console.error('Error fetching existing shifts:', existingShiftsError);
    }

    console.log('Found', existingShifts?.length || 0, 'existing shifts');

    for (const [index, shiftData] of shiftsData.entries()) {
      try {
        // Skip empty rows - check multiple fields
        if (!shiftData['First Name'] && !shiftData['Last Name'] && !shiftData['Email'] && !shiftData['Phone'] && !shiftData['Who']) {
          console.log(`Skipping empty row ${index + 1}`);
          continue;
        }

        // Skip rows without check-in time OR without Date (incomplete records)
        if ((!shiftData['Check-in Time (GMT)'] || shiftData['Check-in Time (GMT)'].trim() === '') && 
            (!shiftData['Date'] || shiftData['Date'].trim() === '')) {
          console.log(`Skipping row ${index + 1} - no check-in time or date`);
          continue;
        }

        // Use "Who" column as fallback for name if First Name/Last Name are empty
        let volunteerFirstName = shiftData['First Name'] || '';
        let volunteerLastName = shiftData['Last Name'] || '';
        
        if ((!volunteerFirstName || !volunteerLastName) && shiftData['Who']) {
          const whoParts = shiftData['Who'].split(' ');
          volunteerFirstName = whoParts[0] || '';
          volunteerLastName = whoParts.slice(1).join(' ') || '';
        }

        // Skip if we still don't have a name
        if (!volunteerFirstName && !volunteerLastName) {
          console.log(`Skipping row ${index + 1} - no volunteer name found`);
          continue;
        }

        // Create unique key for this shift
        const email = shiftData['Email'] || '';
        const checkinTime = shiftData['Check-in Time (GMT)'] || '';
        const shiftDate = shiftData['Date'] || '';
        const shiftKey = `${shiftDate}_${email}_${checkinTime}`;
        
        // Check if this shift already exists in database
        const isDuplicate = existingShifts?.some(existing => {
          const existingKey = `${existing.shift_date}_${existing.family_id}_${existing.shift_date}`;
          return existingKey === shiftKey;
        });

        if (isDuplicate) {
          console.log(`Skipping duplicate shift at row ${index + 1}`);
          continue;
        }

        // Check if shift key already processed in this import
        if (shiftKeys.has(shiftKey)) {
          console.log(`Skipping duplicate shift in same import at row ${index + 1}`);
          continue;
        }
        shiftKeys.add(shiftKey);

        // Find family by email or phone
        let familyId = null;
        let matchedBy = '';
        const volunteerEmail = shiftData['Email']?.toLowerCase().trim();
        const volunteerPhone = shiftData['Phone']?.replace(/\D/g, '');

        console.log(`Processing row ${index + 1}:`, {
          name: `${volunteerFirstName} ${volunteerLastName}`,
          email: volunteerEmail,
          phone: volunteerPhone,
          date: shiftData['Date'],
          checkin: shiftData['Check-in Time (GMT)']
        });

        // Try email matching first
        if (volunteerEmail) {
          const family = families.find(f => 
            f.primary_contact_email?.toLowerCase() === volunteerEmail ||
            f.parent2_email?.toLowerCase() === volunteerEmail
          );
          if (family) {
            familyId = family.id;
            matchedBy = 'email';
            console.log(`Matched family by email: ${familyId}`);
          }
        }

        // If no email match, try phone matching
        if (!familyId && volunteerPhone) {
          const family = families.find(f => 
            (f.primary_contact_phone && f.primary_contact_phone.replace(/\D/g, '') === volunteerPhone) ||
            (f.parent2_phone && f.parent2_phone.replace(/\D/g, '') === volunteerPhone)
          );
          if (family) {
            familyId = family.id;
            matchedBy = 'phone';
            console.log(`Matched family by phone: ${familyId}`);
          }
        }

        // Parse shift date - handle various formats
        let shiftDateFormatted;
        try {
          if (shiftData['Date']) {
            // Try parsing the date (format: 9/15/2025)
            const dateParts = shiftData['Date'].split('/');
            if (dateParts.length === 3) {
              const month = parseInt(dateParts[0]);
              const day = parseInt(dateParts[1]);
              const year = parseInt(dateParts[2]);
              shiftDateFormatted = new Date(year, month - 1, day).toISOString().split('T')[0];
            } else {
              // Fallback to current date
              shiftDateFormatted = new Date().toISOString().split('T')[0];
            }
          } else {
            shiftDateFormatted = new Date().toISOString().split('T')[0];
          }
        } catch (dateError) {
          console.error(`Invalid date format at row ${index + 1}:`, shiftData['Date']);
          shiftDateFormatted = new Date().toISOString().split('T')[0];
        }

        // Parse spots completed (credit amount) - use "Spots/Items" column
        const spotsCompleted = parseInt(shiftData['Spots/Items']) || 1;

        // Build shift record
        const shiftRecord = {
          family_id: familyId,
          season_id: season_id,
          shift_date: shiftDateFormatted,
          shift_type: shiftData['Task'] || 'Concession Stand',
          description: shiftData['Desc'] || '',
          spots_completed: spotsCompleted,
          hours_worked: parseFloat(shiftData['Hours tracking']) || 0,
          is_manual_credit: true,
          notes: `Imported from signup. Volunteer: ${volunteerFirstName} ${volunteerLastName}. Matched by: ${matchedBy || 'none'}. Check-in: ${shiftData['Check-in Time (GMT)'] || 'Not recorded'}`
        };

        console.log(`Created shift record for row ${index + 1}:`, {
          familyId,
          date: shiftDateFormatted,
          spots: spotsCompleted,
          type: shiftRecord.shift_type,
          matchType: matchedBy
        });

        // If no family matched, create an unlinked volunteer record WITH PROPER NAME
        if (!familyId) {
          const volunteerName = `${volunteerFirstName} ${volunteerLastName}`.trim();
          if (volunteerName && volunteerName !== ' ') {
            // Check if this volunteer already exists in this season
            const { data: existingVolunteer } = await supabase
              .from('volunteers')
              .select('id')
              .eq('name', volunteerName)
              .eq('season_id', season_id)
              .single();

            if (!existingVolunteer) {
              unlinkedVolunteers.push({
                name: volunteerName, // Use actual name from CSV
                email: shiftData['Email'],
                phone: shiftData['Phone'],
                role: 'Parent',
                season_id: season_id,
                division_id: null,
                notes: `Auto-created from workbond shift import for ${shiftData['Task']} on ${shiftDateFormatted}. TEMPORARY - NEEDS MANUAL LINKING`
              });
              console.log(`Created unlinked volunteer record: ${volunteerName}`);
            } else {
              console.log(`Volunteer ${volunteerName} already exists, skipping creation`);
            }
          }
        }

        processedShifts.push(shiftRecord);
        console.log(`Successfully processed shift for row ${index + 1}`);

      } catch (error) {
        console.error(`Error processing row ${index + 1}:`, error);
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    console.log(`Processed ${processedShifts.length} shifts, ${unlinkedVolunteers.length} unlinked volunteers`);

    // Insert shifts
    let insertedShifts = [];
    if (processedShifts.length > 0) {
      console.log('Inserting shifts into database...');
      const { data: inserted, error: insertError } = await supabase
        .from('workbond_shifts')
        .insert(processedShifts)
        .select('*');

      if (insertError) {
        console.error('Error inserting shifts:', insertError);
        console.error('Insert error details:', {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        });
        throw insertError;
      }
      insertedShifts = inserted || [];
      console.log(`Successfully inserted ${insertedShifts.length} shifts`);
    }

    // Create unlinked volunteers - THIS IS WHERE THE NAME GETS SET
    let createdVolunteers = [];
    if (unlinkedVolunteers.length > 0) {
      console.log('Creating unlinked volunteers...');
      const { data: volunteers, error: volunteersError } = await supabase
        .from('volunteers')
        .insert(unlinkedVolunteers)
        .select('*');

      if (volunteersError) {
        console.error('Error creating volunteers:', volunteersError);
        errors.push(`Failed to create some volunteer records: ${volunteersError.message}`);
      } else {
        createdVolunteers = volunteers || [];
        console.log(`Successfully created ${createdVolunteers.length} unlinked volunteers`);
        createdVolunteers.forEach(volunteer => {
          console.log(`- Created volunteer: ${volunteer.name}`);
        });
      }
    }

    const response = {
      message: `Import completed: ${insertedShifts.length} shifts processed, ${createdVolunteers.length} unlinked volunteers created`,
      data: {
        shifts: insertedShifts,
        volunteers: createdVolunteers
      },
      warnings: errors,
      stats: {
        totalProcessed: processedShifts.length,
        shiftsInserted: insertedShifts.length,
        volunteersCreated: createdVolunteers.length,
        errors: errors.length
      }
    };

    if (errors.length > 0) {
      response.message += ` (${errors.length} errors)`;
    }

    console.log('=== WORKBOND SHIFT IMPORT COMPLETE ===');
    console.log('Final stats:', response.stats);
    res.status(201).json(response);

  } catch (error) {
    console.error('=== WORKBOND SHIFT IMPORT ERROR ===');
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;