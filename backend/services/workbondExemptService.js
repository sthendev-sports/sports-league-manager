const supabase = require('../config/database');

class WorkbondExemptService {
  // Check if a family should be exempt from workbond requirements
  async checkAndUpdateWorkbondExemptions(seasonId) {
    try {
      console.log(`Checking workbond exemptions for season: ${seasonId}`);
      
      // Get all families with players in the current season
      const { data: familiesWithPlayers, error: familiesError } = await supabase
        .from('players')
        .select(`
          family_id,
          families!inner (
            id,
            work_bond_check_received,
            work_bond_check_status
          ),
          program_title,
          division_id,
          divisions!inner (name)
        `)
        .eq('season_id', seasonId);

      if (familiesError) {
        console.error('Error fetching families with players:', familiesError);
        return;
      }

      if (!familiesWithPlayers || familiesWithPlayers.length === 0) {
        console.log('No families found for this season');
        return;
      }

      // Group players by family
      const familiesMap = new Map();
      
      familiesWithPlayers.forEach(player => {
        const familyId = player.family_id;
        if (!familiesMap.has(familyId)) {
          familiesMap.set(familyId, {
            family: player.families,
            players: []
          });
        }
        familiesMap.get(familyId).players.push({
          program_title: player.program_title,
          division_name: player.divisions?.name,
          division_id: player.division_id
        });
      });

      let exemptCount = 0;
      let nonExemptCount = 0;
      
      // Process each family
      for (const [familyId, familyData] of familiesMap.entries()) {
        const exemptResult = await this.shouldFamilyBeExempt(familyId, familyData.players, seasonId);
        const currentStatus = familyData.family.work_bond_check_status || '';
        
        if (exemptResult && exemptResult.exempt) {
          // Family should be exempt
          // Only update if not already marked as exempt with the same reason
          if (!currentStatus.includes('Exempt') || 
              !currentStatus.includes(exemptResult.reason)) {
            const { error } = await supabase
              .from('families')
              .update({
                work_bond_check_received: true,
                work_bond_check_status: 'Exempt - ' + exemptResult.reason,
                updated_at: new Date().toISOString()
              })
              .eq('id', familyId);

            if (error) {
              console.error(`Error updating family ${familyId} as exempt:`, error);
            } else {
              console.log(`Updated family ${familyId} as exempt: ${exemptResult.reason}`);
              exemptCount++;
            }
          }
        } else {
          // Family should NOT be exempt
          // If currently marked as exempt (but shouldn't be), reset to default
          if (currentStatus.includes('Exempt')) {
            const { error } = await supabase
              .from('families')
              .update({
                work_bond_check_received: false,
                work_bond_check_status: '',
                updated_at: new Date().toISOString()
              })
              .eq('id', familyId);

            if (error) {
              console.error(`Error resetting family ${familyId} from exempt:`, error);
            } else {
              console.log(`Reset family ${familyId} from exempt to default`);
              nonExemptCount++;
            }
          }
        }
      }

      console.log(`Workbond exemption check complete. Exempt: ${exemptCount}, Reset to non-exempt: ${nonExemptCount}`);
      
    } catch (error) {
      console.error('Error in checkAndUpdateWorkbondExemptions:', error);
    }
  }

  // Determine if a family should be exempt
   async shouldFamilyBeExempt(familyId, players, seasonId) {
    if (!players || players.length === 0) {
      return null;
    }

    console.log(`Checking exemption for family ${familyId} with ${players.length} players`);

    // Rule 1: Check if ALL players are in Challenger Division
    const allChallenger = players.every(player => {
      const programTitle = (player.program_title || '').toLowerCase();
      const divisionName = (player.division_name || '').toLowerCase();
      const isChallenger = programTitle.includes('challenger') || divisionName.includes('challenger');
      console.log(`Player ${player.program_title} (${player.division_name}): Challenger=${isChallenger}`);
      return isChallenger;
    });

    if (allChallenger) {
      console.log(`✓ Family ${familyId}: All players in Challenger Division`);
      return {
        exempt: true,
        reason: 'All players in Challenger Division'
      };
    }

    // Rule 2: Check if family has a board member (REGARDLESS of division)
    // Board members are exempt even if they have non-Challenger players
    const hasBoardMember = await this.familyHasBoardMember(familyId, seasonId);
    if (hasBoardMember) {
      console.log(`✓ Family ${familyId}: Has board member ${hasBoardMember.name}`);
      return {
        exempt: true,
        reason: `Board Member: ${hasBoardMember.name} (${hasBoardMember.role})`
      };
    }

    // If not all Challenger and no board member, NOT exempt
    console.log(`✗ Family ${familyId}: Not exempt (not all Challenger and no board member)`);
    return null;
  }

  // Check if family has an active board member
  async familyHasBoardMember(familyId, seasonId) {
    try {
      console.log(`=== Checking board member for family ${familyId} ===`);
      
      // First, get the family to check their emails
      const { data: family, error: familyError } = await supabase
        .from('families')
        .select('primary_contact_email, parent2_email')
        .eq('id', familyId)
        .single();

      if (familyError) {
        console.error('Error fetching family:', familyError);
        return null;
      }

      const familyEmails = [
        family.primary_contact_email?.toLowerCase().trim(),
        family.parent2_email?.toLowerCase().trim()
      ].filter(Boolean);

      console.log('Family emails to match:', familyEmails);

      // Query 1: Check by family_id (exact match)
      const { data: boardMembersById, error: idError } = await supabase
        .from('board_members')
        .select('name, role, email, is_active, spouse_email')
        .eq('family_id', familyId)
        .eq('is_active', true)
        .limit(1);

      if (idError && idError.code !== 'PGRST116') {
        console.error('Error checking board members by family_id:', idError);
      }

      if (boardMembersById && boardMembersById.length > 0) {
        console.log(`✓ Found board member by family_id match: ${boardMembersById[0].name}`);
        return boardMembersById[0];
      }

      // Query 2: Check by email match (if we have family emails)
      if (familyEmails.length > 0) {
        // Get all active board members
        const { data: allActiveBoardMembers, error: allError } = await supabase
          .from('board_members')
          .select('name, role, email, is_active, spouse_email')
          .eq('is_active', true);

        if (allError) {
          console.error('Error fetching all board members:', allError);
        } else if (allActiveBoardMembers) {
          console.log(`Total active board members: ${allActiveBoardMembers.length}`);
          
          // Manual email matching (more flexible than Supabase query)
          for (const boardMember of allActiveBoardMembers) {
            const boardMemberEmails = [
              boardMember.email?.toLowerCase().trim(),
              boardMember.spouse_email?.toLowerCase().trim()
            ].filter(Boolean);
            
            console.log(`Board member ${boardMember.name} emails:`, boardMemberEmails);
            
            // Check if any board member email matches any family email
            const hasMatch = boardMemberEmails.some(boardEmail => 
              familyEmails.some(familyEmail => 
                boardEmail && familyEmail && boardEmail === familyEmail
              )
            );
            
            if (hasMatch) {
              console.log(`✓ Found board member by email match: ${boardMember.name} (${boardMember.email})`);
              return boardMember;
            }
          }
        }
        
        // Also try Supabase query for email match (exact)
        const { data: boardMembersByEmail, error: emailError } = await supabase
          .from('board_members')
          .select('name, role, email, is_active, spouse_email')
          .in('email', familyEmails)
          .eq('is_active', true)
          .limit(1);

        if (emailError && emailError.code !== 'PGRST116') {
          console.error('Error checking board members by email:', emailError);
        }

        if (boardMembersByEmail && boardMembersByEmail.length > 0) {
          console.log(`✓ Found board member by exact email match: ${boardMembersByEmail[0].name}`);
          return boardMembersByEmail[0];
        }

        // Check spouse email
        const { data: boardMembersBySpouseEmail, error: spouseError } = await supabase
          .from('board_members')
          .select('name, role, email, is_active, spouse_email')
          .in('spouse_email', familyEmails)
          .eq('is_active', true)
          .limit(1);

        if (spouseError && spouseError.code !== 'PGRST116') {
          console.error('Error checking board members by spouse email:', spouseError);
        }

        if (boardMembersBySpouseEmail && boardMembersBySpouseEmail.length > 0) {
          console.log(`✓ Found board member by spouse email match: ${boardMembersBySpouseEmail[0].name}`);
          return boardMembersBySpouseEmail[0];
        }
      }

      console.log(`✗ No board member found for family ${familyId}`);
      return null;
    } catch (error) {
      console.error('Error in familyHasBoardMember:', error);
      return null;
    }
  }

  // Run this after player import to update exemptions
  async updateExemptionsAfterImport(seasonId) {
    console.log('Updating workbond exemptions after import...');
    await this.checkAndUpdateWorkbondExemptions(seasonId);
  }
}

module.exports = new WorkbondExemptService();