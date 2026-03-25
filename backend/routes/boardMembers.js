const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

/**
 * Find volunteer by email and sync training completions
 * This keeps board member and volunteer trainings in sync
 */
async function syncTrainingsWithVolunteer(boardMemberId, boardMemberEmail) {
  try {
    if (!boardMemberEmail) {
      console.log('No email provided for board member, cannot sync with volunteer');
      return;
    }
    
    console.log(`\n🔄 [SYNC] Syncing trainings for board member ${boardMemberId} with email: ${boardMemberEmail}`);
    
    // Find volunteer with same email
    const { data: volunteer, error: volunteerError } = await supabase
      .from('volunteers')
      .select('id, name, email')
      .eq('email', boardMemberEmail)
      .single();
    
    if (volunteerError || !volunteer) {
      console.log(`No volunteer found with email: ${boardMemberEmail}`);
      return;
    }
    
    console.log(`✅ Found volunteer: ${volunteer.name} (${volunteer.id})`);
    
    // Get board member's current trainings
    const { data: boardMemberTrainings, error: bmError } = await supabase
      .from('board_member_trainings')
      .select(`
        id,
        training_id,
        status,
        completed_date,
        training:trainings (id, name, is_required)
      `)
      .eq('board_member_id', boardMemberId);
    
    if (bmError) {
      console.error('Error fetching board member trainings:', bmError);
      return;
    }
    
    console.log(`Found ${boardMemberTrainings?.length || 0} board member trainings`);
    
    // Get volunteer's current trainings
    const { data: volunteerTrainings, error: vtError } = await supabase
      .from('volunteer_trainings')
      .select('id, training_id, status, completed_date')
      .eq('volunteer_id', volunteer.id);
    
    if (vtError) {
      console.error('Error fetching volunteer trainings:', vtError);
      return;
    }
    
    console.log(`Found ${volunteerTrainings?.length || 0} volunteer trainings`);
    
    // Create maps for easy lookup
    const bmTrainingMap = new Map();
    boardMemberTrainings?.forEach(t => {
      bmTrainingMap.set(t.training_id, t);
    });
    
    const volunteerTrainingMap = new Map();
    volunteerTrainings?.forEach(t => {
      volunteerTrainingMap.set(t.training_id, t);
    });
    
    // Sync from board member to volunteer
    for (const [trainingId, bmTraining] of bmTrainingMap) {
      const volunteerTraining = volunteerTrainingMap.get(trainingId);
      
      if (!volunteerTraining) {
        // Volunteer doesn't have this training - create it
        const { error: insertError } = await supabase
          .from('volunteer_trainings')
          .insert([{
            volunteer_id: volunteer.id,
            training_id: trainingId,
            status: bmTraining.status,
            completed_date: bmTraining.completed_date,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          console.error(`Error creating volunteer training ${trainingId}:`, insertError);
        } else {
          console.log(`✅ Created volunteer training: ${bmTraining.training?.name || trainingId} with status: ${bmTraining.status}`);
        }
      } else if (volunteerTraining.status !== bmTraining.status || 
                 volunteerTraining.completed_date !== bmTraining.completed_date) {
        // Update volunteer's training to match board member
        const { error: updateError } = await supabase
          .from('volunteer_trainings')
          .update({
            status: bmTraining.status,
            completed_date: bmTraining.completed_date,
            updated_at: new Date().toISOString()
          })
          .eq('id', volunteerTraining.id);
        
        if (updateError) {
          console.error(`Error updating volunteer training ${trainingId}:`, updateError);
        } else {
          console.log(`✅ Updated volunteer training: ${bmTraining.training?.name || trainingId} to status: ${bmTraining.status}`);
        }
      }
    }
    
    // Sync from volunteer to board member (for any trainings the board member might be missing)
    for (const [trainingId, volunteerTraining] of volunteerTrainingMap) {
      if (!bmTrainingMap.has(trainingId)) {
        // Board member doesn't have this training - create it
        const { error: insertError } = await supabase
          .from('board_member_trainings')
          .insert([{
            board_member_id: boardMemberId,
            training_id: trainingId,
            status: volunteerTraining.status,
            completed_date: volunteerTraining.completed_date,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }]);
        
        if (insertError) {
          console.error(`Error creating board member training ${trainingId}:`, insertError);
        } else {
          console.log(`✅ Created board member training: ${trainingId} with status: ${volunteerTraining.status}`);
        }
      }
    }
    
    console.log(`🔄 [SYNC COMPLETE] Board member and volunteer trainings are now in sync\n`);
    
  } catch (error) {
    console.error('Error in syncTrainingsWithVolunteer:', error);
  }
}

/**
 * Auto-assign required trainings to a board member
 */
async function autoAssignBoardMemberTrainings(boardMemberId, email) {
  try {
    // Fetch ALL required trainings for board members (category = 'board_member' or 'both')
    const { data: trainings, error: trainingError } = await supabase
      .from('trainings')
      .select('id, name, category')
      .eq('is_required', true)
      .in('category', ['board_member', 'both']);
    
    if (trainingError) {
      console.error('Error fetching required trainings:', trainingError);
      return;
    }
    
    if (!trainings || trainings.length === 0) {
      console.log('No required board member trainings found');
      return;
    }
    
    console.log(`Found ${trainings.length} required trainings for board members:`);
    trainings.forEach(t => console.log(`  - ${t.name} (${t.category})`));
    
    // Check existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('board_member_trainings')
      .select('training_id')
      .eq('board_member_id', boardMemberId);
    
    if (existingError) {
      console.error('Error checking existing trainings:', existingError);
      return;
    }
    
    const existingTrainingIds = new Set(existing.map(e => e.training_id));
    
    // Create new training assignments
    const newAssignments = trainings
      .filter(t => !existingTrainingIds.has(t.id))
      .map(training => ({
        board_member_id: boardMemberId,
        training_id: training.id,
        status: 'pending',
        completed_date: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    
    if (newAssignments.length > 0) {
      const { error: insertError } = await supabase
        .from('board_member_trainings')
        .insert(newAssignments);
      
      if (insertError) {
        console.error('Error auto-assigning trainings:', insertError);
      } else {
        console.log(`✅ Auto-assigned ${newAssignments.length} trainings to board member ${boardMemberId}`);
      }
    } else {
      console.log(`Board member ${boardMemberId} already has all required trainings`);
    }
    
    // Sync with volunteer if email exists
    if (email) {
      await syncTrainingsWithVolunteer(boardMemberId, email);
    }
    
  } catch (error) {
    console.error('Error in autoAssignBoardMemberTrainings:', error);
  }
}

// Get all board members
router.get('/', async (req, res) => {
  try {
    const { is_active } = req.query;
    
    let query = supabase
      .from('board_members')
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email),
        board_member_trainings!left (
          id,
          status,
          completed_date,
          training:trainings!inner (
            id,
            name,
            is_required
          )
        )
      `)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Transform data to include training summary
    const transformedData = (data || []).map(member => {
      const trainings = member.board_member_trainings || [];
      const completedTrainings = trainings.filter(t => t.status === 'completed');
      const expiredTrainings = trainings.filter(t => t.status === 'expired');
      const requiredTrainings = trainings.filter(t => t.training?.is_required);
      const completedRequired = requiredTrainings.filter(t => t.status === 'completed');
      
      return {
        ...member,
        trainings_summary: {
          total: trainings.length,
          completed: completedTrainings.length,
          expired: expiredTrainings.length,
          required: requiredTrainings.length,
          completed_required: completedRequired.length,
          all_required_completed: requiredTrainings.length > 0 && 
                                 completedRequired.length === requiredTrainings.length,
          details: trainings.map(t => ({
            name: t.training?.name,
            status: t.status,
            completed_date: t.completed_date
          }))
        }
      };
    });

    res.json(transformedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new board member
router.post('/', async (req, res) => {
  try {
    const boardMemberData = req.body;
    
    // Try to find matching family by email
    if (boardMemberData.email) {
      const { data: family } = await supabase
        .from('families')
        .select('id')
        .or(`primary_contact_email.eq.${boardMemberData.email},parent2_email.eq.${boardMemberData.email}`)
        .single();
      
      if (family) {
        boardMemberData.family_id = family.id;
      }
    }
    
    const { data, error } = await supabase
      .from('board_members')
      .insert([boardMemberData])
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email)
      `)
      .single();

    if (error) throw error;
    
    // Auto-assign required trainings
    if (data.id) {
      await autoAssignBoardMemberTrainings(data.id, data.email);
    }
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating board member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update board member
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const boardMemberData = req.body;
    
    // Get existing board member to check if email changed
    const { data: existingMember } = await supabase
      .from('board_members')
      .select('email')
      .eq('id', id)
      .single();
    
    // Try to find matching family by email if email changed
    if (boardMemberData.email) {
      const { data: family } = await supabase
        .from('families')
        .select('id')
        .or(`primary_contact_email.eq.${boardMemberData.email},parent2_email.eq.${boardMemberData.email}`)
        .single();
      
      if (family) {
        boardMemberData.family_id = family.id;
      } else {
        boardMemberData.family_id = null;
      }
    }
    
    const { data, error } = await supabase
      .from('board_members')
      .update(boardMemberData)
      .eq('id', id)
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email)
      `)
      .single();

    if (error) throw error;
    
    // Auto-assign trainings
    if (data.id) {
      await autoAssignBoardMemberTrainings(data.id, data.email);
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error updating board member:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete board member
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Board member deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/trainings/board-member/:boardMemberId - Update board member trainings
router.post('/trainings/board-member/:boardMemberId', async (req, res) => {
  try {
    const { boardMemberId } = req.params;
    const { trainings } = req.body;
    
    console.log(`\n📝 Updating trainings for board member: ${boardMemberId}`);
    
    // Get board member's email for syncing
    const { data: boardMember, error: memberError } = await supabase
      .from('board_members')
      .select('email, first_name, last_name')
      .eq('id', boardMemberId)
      .single();
    
    if (memberError) {
      console.error('Error fetching board member:', memberError);
      return res.status(500).json({ error: memberError.message });
    }
    
    console.log(`Board member: ${boardMember.first_name} ${boardMember.last_name}, Email: ${boardMember.email}`);
    
    // Update board member trainings
    for (const training of trainings) {
      const { data: existing, error: findError } = await supabase
        .from('board_member_trainings')
        .select('id')
        .eq('board_member_id', boardMemberId)
        .eq('training_id', training.training_id)
        .single();
      
      if (findError && findError.code !== 'PGRST116') {
        console.error(`Error finding training ${training.training_id}:`, findError);
        continue;
      }
      
      if (existing) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('board_member_trainings')
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
          .from('board_member_trainings')
          .insert([{
            board_member_id: boardMemberId,
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
    
    // SYNC WITH VOLUNTEER - This is the key step!
    if (boardMember.email) {
      await syncTrainingsWithVolunteer(boardMemberId, boardMember.email);
    } else {
      console.log('⚠️ Board member has no email, cannot sync with volunteer');
    }
    
    // Return updated trainings
    const { data: updatedTrainings, error: fetchError } = await supabase
      .from('board_member_trainings')
      .select(`
        *,
        training:trainings (id, name, is_required, category)
      `)
      .eq('board_member_id', boardMemberId);
    
    if (fetchError) {
      console.error('Error fetching updated trainings:', fetchError);
      return res.status(500).json({ error: fetchError.message });
    }
    
    console.log(`✅ Successfully synced ${updatedTrainings?.length || 0} trainings\n`);
    res.json(updatedTrainings);
    
  } catch (error) {
    console.error('Error updating board member trainings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk assign trainings to all board members
router.post('/bulk-assign-trainings', async (req, res) => {
  try {
    const { only_active = true } = req.body;
    
    // First, get all required trainings for board members
    const { data: requiredTrainings, error: trainingsError } = await supabase
      .from('trainings')
      .select('id, name, category')
      .eq('is_required', true)
      .in('category', ['board_member', 'both']);
    
    if (trainingsError) {
      console.error('Error fetching trainings:', trainingsError);
      return res.status(500).json({ error: 'Failed to fetch trainings' });
    }
    
    if (!requiredTrainings || requiredTrainings.length === 0) {
      return res.status(400).json({ 
        error: 'No required trainings found for board members. Please create required trainings with category "board_member" or "both".' 
      });
    }
    
    console.log(`Found ${requiredTrainings.length} required trainings:`);
    requiredTrainings.forEach(t => console.log(`  - ${t.name} (${t.category})`));
    
    // Get all board members
    let query = supabase
      .from('board_members')
      .select('id, email, first_name, last_name, is_active');
    
    if (only_active) {
      query = query.eq('is_active', true);
    }
    
    const { data: boardMembers, error: memberError } = await query;
    
    if (memberError) throw memberError;
    
    console.log(`Found ${boardMembers?.length || 0} board members`);
    
    let assignedCount = 0;
    let errorCount = 0;
    let alreadyCompleteCount = 0;
    let syncedCount = 0;
    const assignmentDetails = [];
    
    for (const member of boardMembers) {
      try {
        // Check existing assignments
        const { data: existing, error: existingError } = await supabase
          .from('board_member_trainings')
          .select('training_id')
          .eq('board_member_id', member.id);
        
        if (existingError) {
          console.error(`Error checking existing trainings for ${member.first_name} ${member.last_name}:`, existingError);
          errorCount++;
          continue;
        }
        
        const existingIds = new Set(existing?.map(e => e.training_id) || []);
        
        // Find which trainings need to be assigned
        const trainingsToAssign = requiredTrainings
          .filter(t => !existingIds.has(t.id))
          .map(training => ({
            board_member_id: member.id,
            training_id: training.id,
            status: 'pending',
            completed_date: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));
        
        if (trainingsToAssign.length > 0) {
          const { error: insertError } = await supabase
            .from('board_member_trainings')
            .insert(trainingsToAssign);
          
          if (insertError) {
            errorCount++;
            console.error(`❌ Failed to assign trainings to ${member.first_name} ${member.last_name}:`, insertError);
            assignmentDetails.push({
              name: `${member.first_name} ${member.last_name}`,
              email: member.email,
              status: 'failed',
              error: insertError.message
            });
          } else {
            assignedCount++;
            console.log(`✅ Assigned ${trainingsToAssign.length} training(s) to ${member.first_name} ${member.last_name}`);
            assignmentDetails.push({
              name: `${member.first_name} ${member.last_name}`,
              email: member.email,
              status: 'success',
              trainings_assigned: trainingsToAssign.length,
              training_names: trainingsToAssign.map(t => {
                const training = requiredTrainings.find(rt => rt.id === t.training_id);
                return training?.name || 'Unknown';
              })
            });
            
            // Sync with volunteer if email exists
            if (member.email) {
              await syncTrainingsWithVolunteer(member.id, member.email);
              syncedCount++;
            }
          }
        } else {
          alreadyCompleteCount++;
          console.log(`⏭️ Board member ${member.first_name} ${member.last_name} already has all required trainings`);
          assignmentDetails.push({
            name: `${member.first_name} ${member.last_name}`,
            email: member.email,
            status: 'already_complete',
            trainings_assigned: 0
          });
        }
      } catch (error) {
        errorCount++;
        console.error(`❌ Error processing board member ${member.first_name} ${member.last_name}:`, error);
        assignmentDetails.push({
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Assigned trainings to ${assignedCount} board members (${alreadyCompleteCount} already had them, ${errorCount} errors). Synced with ${syncedCount} volunteers.`,
      assigned: assignedCount,
      already_complete: alreadyCompleteCount,
      errors: errorCount,
      synced_with_volunteers: syncedCount,
      details: assignmentDetails,
      total_board_members: boardMembers?.length || 0,
      required_trainings: requiredTrainings.map(t => ({ id: t.id, name: t.name, category: t.category }))
    });
  } catch (error) {
    console.error('Error in bulk-assign-trainings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get board members for player agent dropdown
router.get('/player-agents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('board_members')
      .select('id, name, first_name, last_name, email, phone, role')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Equipment Manager contact info
router.get('/equipment-manager', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('board_members')
      .select('id, name, first_name, last_name, email, phone')
      .eq('role', 'Equipment Manager')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(1);

    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'No active Equipment Manager found. Please add an Equipment Manager in the Board Members section.' 
      });
    }
    
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset yearly compliance statuses
router.post('/reset-compliance', async (req, res) => {
  try {
    const { only_active = true } = req.body || {};

    let query = supabase
      .from('board_members')
      .update({
        abuse_awareness_completed: false,
        background_check_completed: false,
        updated_at: new Date().toISOString(),
      });

    if (only_active) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.select('id');

    if (error) throw error;

    res.json({
      message: 'Compliance statuses reset successfully',
      updated_count: Array.isArray(data) ? data.length : 0,
      only_active,
    });
  } catch (error) {
    console.error('Error resetting compliance statuses:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import board members from spreadsheet data
router.post('/import', async (req, res) => {
  try {
    const { boardMembers } = req.body;
    
    if (!boardMembers || !Array.isArray(boardMembers)) {
      return res.status(400).json({ error: 'Invalid board members data' });
    }

    const results = [];
    const errors = [];

    for (const [index, member] of boardMembers.entries()) {
      try {
        // Find matching family by email
        let family_id = null;
        if (member.email) {
          const { data: family } = await supabase
            .from('families')
            .select('id')
            .or(`primary_contact_email.eq.${member.email},parent2_email.eq.${member.email}`)
            .single();
          
          if (family) {
            family_id = family.id;
          }
        }

        const boardMemberData = {
          first_name: member.first_name,
          last_name: member.last_name,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          phone: member.phone,
          role: member.role || 'Board Member',
          spouse_first_name: member.spouse_first_name,
          spouse_last_name: member.spouse_last_name,
          spouse_email: member.spouse_email,
          abuse_awareness_completed: member.abuse_awareness_completed === true || member.abuse_awareness_completed === 'Y',
          background_check_completed: member.background_check_completed === true || member.background_check_completed === 'Y',
          family_id: family_id,
          is_active: true
        };

        // Check if board member already exists
        const { data: existingMember } = await supabase
          .from('board_members')
          .select('id')
          .eq('email', member.email)
          .single();

        let result;
        if (existingMember) {
          // Update existing member
          const { data } = await supabase
            .from('board_members')
            .update(boardMemberData)
            .eq('id', existingMember.id)
            .select()
            .single();
          result = { ...data, action: 'updated' };
          
          // Sync trainings for updated member
          if (result.email) {
            await syncTrainingsWithVolunteer(result.id, result.email);
          }
        } else {
          // Create new member
          const { data } = await supabase
            .from('board_members')
            .insert([boardMemberData])
            .select()
            .single();
          result = { ...data, action: 'created' };
          
          // Auto-assign trainings for new member
          if (result.id) {
            await autoAssignBoardMemberTrainings(result.id, result.email);
          }
        }

        results.push(result);
      } catch (error) {
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    res.json({
      message: `Processed ${results.length} board members`,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in import:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;