const supabase = require('../config/database');

class FamilyMatchingService {
  // Find existing family by multiple criteria
  async findExistingFamily(playerData) {
    const matchingCriteria = [];
    
    // 1. By provided family_id
    if (playerData.family_id) {
      matchingCriteria.push({ field: 'family_id', value: playerData.family_id });
    }
    
    // 2. By parent1 email (exact match)
    if (playerData.parent1_email) {
      matchingCriteria.push({ field: 'primary_contact_email', value: playerData.parent1_email.toLowerCase() });
    }
    
    // 3. By parent2 email (exact match)
    if (playerData.parent2_email) {
      matchingCriteria.push({ field: 'parent2_email', value: playerData.parent2_email.toLowerCase() });
    }
    
    // 4. By phone number (if available)
    if (playerData.parent1_phone1) {
      matchingCriteria.push({ field: 'primary_contact_phone', value: playerData.parent1_phone1 });
    }
    
    // Try each matching criterion
    for (const criterion of matchingCriteria) {
      const { data: family, error } = await supabase
        .from('families')
        .select('*')
        .eq(criterion.field, criterion.value)
        .single();
      
      if (family && !error) {
        console.log(`Found existing family using ${criterion.field}: ${criterion.value}`);
        return family;
      }
    }
    
    // 5. Fuzzy matching by last name and address (if available)
    if (playerData.parent1_lastname && playerData.address_line_1) {
      const { data: families, error } = await supabase
        .from('families')
        .select('*')
        .ilike('primary_contact_name', `%${playerData.parent1_lastname}%`)
        .ilike('address_line_1', `%${playerData.address_line_1}%`);
      
      if (families && families.length > 0 && !error) {
        console.log(`Found existing family using fuzzy matching: ${playerData.parent1_lastname}, ${playerData.address_line_1}`);
        return families[0]; // Return the first match
      }
    }
    
    return null;
  }

  // Generate a new family ID
  generateFamilyId(playerData) {
    const base = playerData.parent1_lastname || playerData.last_name || 'FAM';
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${base.toUpperCase()}_${timestamp}_${random}`;
  }

  // Calculate required shifts for a family based on their children's divisions
  async calculateRequiredShifts(familyId, seasonId) {
    // First, check if any volunteer in this family has an exempt role
    const exemptRoles = ['Manager', 'Assistant Coach', 'Team Parent'];
    
    const { data: familyVolunteers, error: volunteerError } = await supabase
      .from('volunteers')
      .select('role')
      .eq('family_id', familyId)
      .eq('season_id', seasonId)
      .in('role', exemptRoles);

    if (volunteerError) {
      console.error('Error checking volunteer roles:', volunteerError);
    }

    // If any family member has an exempt role, no shifts required
    if (familyVolunteers && familyVolunteers.length > 0) {
      console.log(`Family ${familyId} has exempt volunteer(s): ${familyVolunteers.map(v => v.role).join(', ')} - no shifts required`);
      return 0;
    }

    // Get all players in this family for the season with their divisions
    const { data: players, error } = await supabase
      .from('players')
      .select(`
        division_id,
        divisions!inner (name)
      `)
      .eq('family_id', familyId)
      .eq('season_id', seasonId);

    if (error || !players) {
      console.error('Error calculating required shifts:', error);
      return 0;
    }

    // Get shift requirements for each division in this season
    const { data: shiftRequirements, error: requirementsError } = await supabase
      .from('division_shift_requirements')
      .select('division_id, shifts_required')
      .eq('season_id', seasonId);

    if (requirementsError) {
      console.error('Error getting shift requirements:', requirementsError);
      return 0;
    }

    // Create a map of division requirements
    const requirementsMap = new Map();
    shiftRequirements.forEach(req => {
      requirementsMap.set(req.division_id, req.shifts_required);
    });

    // Find the highest shift requirement among the family's divisions
    let highestRequirement = 0;
    players.forEach(player => {
      const requirement = requirementsMap.get(player.division_id) || 2; // Default to 2
      if (requirement > highestRequirement) {
        highestRequirement = requirement;
      }
    });

    return highestRequirement;
  }

  // Update family shift requirements
  async updateFamilyShiftRequirements(familyId, seasonId) {
    const shiftsRequired = await this.calculateRequiredShifts(familyId, seasonId);
    
    // Update all volunteers in this family
    const { error } = await supabase
      .from('volunteers')
      .update({ shifts_required: shiftsRequired })
      .eq('family_id', familyId)
      .eq('season_id', seasonId);

    if (error) {
      console.error('Error updating volunteer shift requirements:', error);
    }

    return shiftsRequired;
  }

  // Update volunteer role and recalculate shift requirements
  async updateVolunteerRole(volunteerId, newRole, seasonId) {
    const exemptRoles = ['Manager', 'Assistant Coach', 'Team Parent'];
    
    // Update the volunteer's role
    const { data: volunteer, error } = await supabase
      .from('volunteers')
      .update({ role: newRole })
      .eq('id', volunteerId)
      .select('family_id')
      .single();

    if (error) {
      console.error('Error updating volunteer role:', error);
      return;
    }

    // Recalculate shift requirements for the family
    if (volunteer && volunteer.family_id) {
      await this.updateFamilyShiftRequirements(volunteer.family_id, seasonId);
    }
  }

  // UPDATED: Merge family details - COMPLETELY OVERWRITE workbond for the current season
  async mergeFamilyDetails(familyId, playerData, options = {}) {
    if (!familyId) return null;

    const updates = {};

    const p1First = (playerData.parent1_firstname || '').toString().trim();
    const p1Last = (playerData.parent1_lastname || '').toString().trim();
    const p1Name = `${p1First} ${p1Last}`.trim();
    const p1Email = (playerData.parent1_email || '').toString().trim().toLowerCase();
    const p1Phone = (playerData.parent1_phone1 || '').toString().trim();

    const p2First = (playerData.parent2_firstname || '').toString().trim();
    const p2Last = (playerData.parent2_lastname || '').toString().trim();
    const p2Email = (playerData.parent2_email || '').toString().trim().toLowerCase();
    const p2Phone = (playerData.parent2_phone1 || '').toString().trim();

    // Only set fields when we actually have values
    if (p1Name) updates.primary_contact_name = p1Name;
    if (p1Email) updates.primary_contact_email = p1Email;
    if (p1Phone) updates.primary_contact_phone = p1Phone;

    if (p2First) updates.parent2_first_name = p2First;
    if (p2Last) updates.parent2_last_name = p2Last;
    if (p2Email) updates.parent2_email = p2Email;
    if (p2Phone) updates.parent2_phone = p2Phone;

    // Address fields (optional)
    const addr1 = (playerData.address_line_1 || '').toString().trim();
    const addr2 = (playerData.address_line_2 || '').toString().trim();
    const city = (playerData.city || '').toString().trim();
    const state = (playerData.state || '').toString().trim();
    const zip = (playerData.zip_code || '').toString().trim();

    if (addr1) updates.address_line_1 = addr1;
    if (addr2) updates.address_line_2 = addr2;
    if (city) updates.city = city;
    if (state) updates.state = state;
    if (zip) updates.zip_code = zip;

    // SIMPLE RULE: Always set workbond based on import file
    if (playerData.workbond_check_status !== undefined) {
      const status = playerData.workbond_check_status.toString().trim();
      
      if (status === '') {
        // If blank, set both fields to empty/false
        updates.work_bond_check_received = false;
        updates.work_bond_check_status = '';
      } else {
        // If there's data, store it exactly as provided
        updates.work_bond_check_received = this.parseWorkbondStatus(status);
        updates.work_bond_check_status = status;
      }
      
      console.log(`Setting workbond for family ${familyId}: status="${status}", received=${updates.work_bond_check_received}`);
    }

    // If there are no updates, skip
    if (Object.keys(updates).length === 0) return null;

    const { data, error } = await supabase
      .from('families')
      .update(updates)
      .eq('id', familyId)
      .select()
      .single();

    if (error) {
      console.error('Error merging family details:', error);
      return null;
    }

    return data;
  }

  // NEW: Store workbond status per season
  async updateSeasonWorkbondStatus(familyId, seasonId, workbondStatus) {
    try {
      const statusValue = this.parseWorkbondStatus(workbondStatus);
      const noteValue = workbondStatus.trim() || '';
      
      // Create or update season-specific workbond record
      const { data: existing, error: checkError } = await supabase
        .from('family_season_workbond')
        .select('id')
        .eq('family_id', familyId)
        .eq('season_id', seasonId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error checking workbond status:', checkError);
      }

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('family_season_workbond')
          .update({
            received: statusValue,
            notes: noteValue,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) console.error('Error updating workbond status:', error);
      } else {
        // Create new
        const { error } = await supabase
          .from('family_season_workbond')
          .insert({
            family_id: familyId,
            season_id: seasonId,
            received: statusValue,
            notes: noteValue
          });

        if (error) console.error('Error creating workbond status:', error);
      }
    } catch (error) {
      console.error('Error in updateSeasonWorkbondStatus:', error);
    }
  }

  // NEW: Get workbond status for a family in a specific season
  async getSeasonWorkbondStatus(familyId, seasonId) {
    try {
      const { data, error } = await supabase
        .from('family_season_workbond')
        .select('received, notes')
        .eq('family_id', familyId)
        .eq('season_id', seasonId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          return { received: false, notes: '' };
        }
        console.error('Error getting workbond status:', error);
        return { received: false, notes: '' };
      }

      return data || { received: false, notes: '' };
    } catch (error) {
      console.error('Error in getSeasonWorkbondStatus:', error);
      return { received: false, notes: '' };
    }
  }

  parseWorkbondStatus(workbondStatus) {
    if (!workbondStatus || workbondStatus.trim() === '') {
      return false; // Empty string means NOT received
    }
    
    const status = workbondStatus.toLowerCase().trim();
    
    if (status.includes('received') || 
        status.includes('yes') || 
        status.includes('true') ||
        status.includes('1') ||
        status === 'received') {
      return true;
    }
    
    if (status.includes('pending') || 
        status.includes('no') || 
        status.includes('false') ||
        status.includes('0') ||
        status.includes('not') ||
        status === 'pending') {
      return false;
    }
    
    return false;
  }
}

module.exports = new FamilyMatchingService();