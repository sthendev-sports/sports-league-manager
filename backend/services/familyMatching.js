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
}

module.exports = new FamilyMatchingService();