const supabase = require('../config/database');

class WorkbondExemptService {
  // Cache for board members (since they change infrequently)
  boardMembersCache = null;
  boardMembersCacheTime = null;
  CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  // Get board members with caching
  async getBoardMembersCached() {
    const now = Date.now();
    
    // Return cached data if valid
    if (this.boardMembersCache && 
        this.boardMembersCacheTime && 
        (now - this.boardMembersCacheTime) < this.CACHE_DURATION) {
      return this.boardMembersCache;
    }
    
    // Fetch fresh data
    const { data, error } = await supabase
      .from('board_members')
      .select('id, name, role, email, spouse_email, family_id, is_active')
      .eq('is_active', true);
    
    if (error) {
      console.error('Error fetching board members:', error);
      return [];
    }
    
    // Update cache
    this.boardMembersCache = data || [];
    this.boardMembersCacheTime = now;
    
    return this.boardMembersCache;
  }

  // Clear cache (call this when board members change)
  clearBoardMembersCache() {
    this.boardMembersCache = null;
    this.boardMembersCacheTime = null;
  }

  // Main exemption check with all optimizations and BATCHING
  async checkAndUpdateWorkbondExemptions(seasonId, progressCallback = null) {
    try {
      console.time(`Exemption check season ${seasonId}`);
      console.log(`Checking workbond exemptions for season: ${seasonId}`);
      
      if (progressCallback) progressCallback(0, 'Starting...');
      
      // 1. Get ALL data in parallel with minimal queries
      const [playersResponse, allBoardMembers] = await Promise.all([
        // Get players with their divisions
        supabase
          .from('players')
          .select(`
            family_id,
            program_title,
            division_id,
            divisions!inner (name)
          `)
          .eq('season_id', seasonId),
        
        // Get cached board members
        this.getBoardMembersCached()
      ]);

      if (playersResponse.error) {
        console.error('Error fetching players:', playersResponse.error);
        return;
      }

      const playersData = playersResponse.data || [];
      
      if (playersData.length === 0) {
        console.log('No players found for this season');
        return;
      }

      if (progressCallback) progressCallback(10, 'Processing data...');

      // 2. Extract unique family IDs
      const familyIds = [...new Set(playersData.map(p => p.family_id).filter(Boolean))];
      console.log(`Total families to check: ${familyIds.length}`);
      
      if (familyIds.length === 0) {
        console.log('No families found');
        return;
      }

      // 3. BATCH the family emails query to avoid "fetch failed"
      const BATCH_SIZE = 100;
      const batches = [];
      for (let i = 0; i < familyIds.length; i += BATCH_SIZE) {
        batches.push(familyIds.slice(i, i + BATCH_SIZE));
      }
      console.log(`Splitting families into ${batches.length} batches of ${BATCH_SIZE}`);
      
      let allFamilies = [];
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`Fetching families batch ${batchIndex + 1}/${batches.length} (${batch.length} families)...`);
        
        const { data: familiesBatch, error: familiesError } = await supabase
          .from('families')
          .select('id, primary_contact_email, parent2_email')
          .in('id', batch);
        
        if (familiesError) {
          console.error(`Error fetching families batch ${batchIndex + 1}:`, familiesError);
          // Continue with other batches
          continue;
        }
        
        if (familiesBatch && familiesBatch.length) {
          allFamilies = [...allFamilies, ...familiesBatch];
        }
      }
      
      console.log(`Total families fetched: ${allFamilies.length}`);

      if (progressCallback) progressCallback(20, 'Building lookup maps...');

      // 4. Build optimized lookup structures
      const {
        familiesMap,
        boardMembersByFamilyId,
        boardMembersByEmail
      } = this.buildLookupMaps(allFamilies || [], allBoardMembers || []);

      // 5. Group players by family
      playersData.forEach(player => {
        const familyId = player.family_id;
        if (familiesMap.has(familyId)) {
          familiesMap.get(familyId).players.push({
            program_title: player.program_title,
            division_name: player.divisions?.name
          });
        }
      });

      if (progressCallback) progressCallback(30, 'Checking exemptions...');

      // 6. Process families in optimized batches
      const familyEntries = Array.from(familiesMap.entries());
      const totalFamilies = familyEntries.length;
      
      let exemptCount = 0;
      let nonExemptCount = 0;
      let processedCount = 0;

      // Prepare batch updates
      const seasonWorkbondUpdates = [];
      const familiesTableUpdates = [];

      for (let i = 0; i < familyEntries.length; i += BATCH_SIZE) {
        const batch = familyEntries.slice(i, i + BATCH_SIZE);
        
        // Process batch
        for (const [familyId, familyData] of batch) {
          processedCount++;
          
          const exemptResult = this.shouldFamilyBeExemptOptimized(
            familyId,
            familyData.players,
            boardMembersByFamilyId,
            boardMembersByEmail,
            familyData.emails
          );
          
          if (exemptResult && exemptResult.exempt) {
            exemptCount++;
            const exemptNote = `Exempt - ${exemptResult.reason}`;
            
            // Queue updates
            seasonWorkbondUpdates.push({
              family_id: familyId,
              season_id: seasonId,
              notes: exemptNote,
              received: false,
              updated_at: new Date().toISOString()
            });
            
            familiesTableUpdates.push({
              id: familyId,
              work_bond_check_status: exemptNote,
              work_bond_check_received: false,
              updated_at: new Date().toISOString()
            });
            
          } else {
            // Check if currently marked exempt
            if (familyData.currentStatus && familyData.currentStatus.includes('Exempt')) {
              nonExemptCount++;
              
              // Queue removal of exempt status
              seasonWorkbondUpdates.push({
                family_id: familyId,
                season_id: seasonId,
                notes: '',
                received: false,
                updated_at: new Date().toISOString()
              });
              
              familiesTableUpdates.push({
                id: familyId,
                work_bond_check_status: '',
                work_bond_check_received: false,
                updated_at: new Date().toISOString()
              });
            }
          }
        }
        
        // Report progress
        const progress = Math.min(30 + (processedCount / totalFamilies * 50), 80);
        if (progressCallback) {
          progressCallback(Math.floor(progress), `Processed ${processedCount}/${totalFamilies} families...`);
        }
        
        console.log(`Processed ${processedCount}/${totalFamilies} families`);
      }

      if (progressCallback) progressCallback(80, 'Updating database...');

      // 7. Execute batch updates
      await this.executeBatchUpdates(seasonWorkbondUpdates, familiesTableUpdates, seasonId);

      if (progressCallback) progressCallback(100, 'Complete!');

      console.timeEnd(`Exemption check season ${seasonId}`);
      console.log(`Workbond exemption check complete. Exempt: ${exemptCount}, Reset: ${nonExemptCount}, Total: ${totalFamilies}`);
      
      return {
        exemptCount,
        nonExemptCount,
        totalFamilies
      };
      
    } catch (error) {
      console.error('Error in checkAndUpdateWorkbondExemptions:', error);
      throw error;
    }
  }

  // Build lookup maps for O(1) access
  buildLookupMaps(allFamilies, allBoardMembers) {
    const familiesMap = new Map();
    const boardMembersByFamilyId = new Map();
    const boardMembersByEmail = new Map();

    // Build family map
    allFamilies.forEach(family => {
      const emails = [
        family.primary_contact_email?.toLowerCase().trim(),
        family.parent2_email?.toLowerCase().trim()
      ].filter(Boolean);
      
      familiesMap.set(family.id, {
        emails: emails,
        players: [],
        currentStatus: family.work_bond_check_status // if included in query
      });
    });

    // Build board member maps
    allBoardMembers.forEach(boardMember => {
      // By family_id
      if (boardMember.family_id) {
        const key = boardMember.family_id;
        if (!boardMembersByFamilyId.has(key)) {
          boardMembersByFamilyId.set(key, []);
        }
        boardMembersByFamilyId.get(key).push(boardMember);
      }
      
      // By email
      const boardMemberEmails = [
        boardMember.email?.toLowerCase().trim(),
        boardMember.spouse_email?.toLowerCase().trim()
      ].filter(Boolean);
      
      boardMemberEmails.forEach(email => {
        if (!boardMembersByEmail.has(email)) {
          boardMembersByEmail.set(email, []);
        }
        boardMembersByEmail.get(email).push(boardMember);
      });
    });

    return {
      familiesMap,
      boardMembersByFamilyId,
      boardMembersByEmail
    };
  }

  // Optimized exemption check with Challenger logic
  shouldFamilyBeExemptOptimized(familyId, players, 
                               boardMembersByFamilyId, boardMembersByEmail, familyEmails) {
    if (!players || players.length === 0) {
      return null;
    }

    // Rule 1: Check if ALL players are in Challenger Division
    const allChallenger = players.every(player => {
      const programTitle = (player.program_title || '').toLowerCase();
      const divisionName = (player.division_name || '').toLowerCase();
      
      const isChallenger = programTitle.includes('challenger') || 
                           divisionName.includes('challenger');
      
      return isChallenger;
    });

    if (allChallenger) {
      const reason = players.length === 1 
        ? 'Challenger division player' 
        : `All ${players.length} players in Challenger division`;
      
      console.log(`✓ Family ${familyId}: ${reason} - EXEMPT`);
      return {
        exempt: true,
        reason: reason
      };
    }

    // Rule 2: Check if family has a board member
    // First check by family_id
    const boardMembersByFamily = boardMembersByFamilyId.get(familyId) || [];
    if (boardMembersByFamily.length > 0) {
      const firstMember = boardMembersByFamily[0];
      const reason = `Board Member: ${firstMember.name} (${firstMember.role || 'Member'})`;
      
      console.log(`✓ Family ${familyId}: ${reason} - EXEMPT`);
      return {
        exempt: true,
        reason: reason
      };
    }

    // Check by email
    if (familyEmails && familyEmails.length > 0) {
      for (const email of familyEmails) {
        const boardMembers = boardMembersByEmail.get(email) || [];
        if (boardMembers.length > 0) {
          const firstMember = boardMembers[0];
          const reason = `Board Member: ${firstMember.name} (${firstMember.role || 'Member'})`;
          
          console.log(`✓ Family ${familyId}: Email match ${email} -> ${reason} - EXEMPT`);
          return {
            exempt: true,
            reason: reason
          };
        }
      }
    }

    console.log(`✗ Family ${familyId}: No exemption criteria met`);
    return null;
  }

  // Execute batch updates efficiently
  async executeBatchUpdates(seasonWorkbondUpdates, familiesTableUpdates, seasonId) {
    try {
      // Update family_season_workbond using upsert
      if (seasonWorkbondUpdates.length > 0) {
        // Split into chunks for large datasets
        const CHUNK_SIZE = 500;
        
        for (let i = 0; i < seasonWorkbondUpdates.length; i += CHUNK_SIZE) {
          const chunk = seasonWorkbondUpdates.slice(i, i + CHUNK_SIZE);
          
          const { error } = await supabase
            .from('family_season_workbond')
            .upsert(chunk, {
              onConflict: 'family_id,season_id',
              ignoreDuplicates: false
            });
          
          if (error) {
            console.error(`Error upserting workbond chunk ${i/CHUNK_SIZE + 1}:`, error.message);
          } else {
            console.log(`Upserted workbond chunk ${i/CHUNK_SIZE + 1}/${Math.ceil(seasonWorkbondUpdates.length/CHUNK_SIZE)}`);
          }
        }
      }

      // Update families table
      if (familiesTableUpdates.length > 0) {
        const CHUNK_SIZE = 500;
        
        for (let i = 0; i < familiesTableUpdates.length; i += CHUNK_SIZE) {
          const chunk = familiesTableUpdates.slice(i, i + CHUNK_SIZE);
          
          // Use a transaction-like approach for each family
          for (const update of chunk) {
            const { error } = await supabase
              .from('families')
              .update({
                work_bond_check_status: update.work_bond_check_status,
                work_bond_check_received: update.work_bond_check_received,
                updated_at: update.updated_at
              })
              .eq('id', update.id);
            
            if (error) {
              console.error(`Error updating family ${update.id}:`, error.message);
            }
          }
          
          console.log(`Updated families chunk ${i/CHUNK_SIZE + 1}/${Math.ceil(familiesTableUpdates.length/CHUNK_SIZE)}`);
        }
      }
      
    } catch (error) {
      console.error('Error in executeBatchUpdates:', error);
    }
  }

  // Quick check for a single family (for Players page)
  async quickCheckFamilyExemption(familyId, seasonId) {
    try {
      // Get players for this family in this season
      const { data: players, error: playersError } = await supabase
        .from('players')
        .select(`
          program_title,
          division_id,
          divisions!inner (name)
        `)
        .eq('family_id', familyId)
        .eq('season_id', seasonId);

      if (playersError || !players || players.length === 0) {
        return { exempt: false, reason: '' };
      }

      // Get board members from cache
      const boardMembers = await this.getBoardMembersCached();
      
      // Get family emails
      const { data: family, error: familyError } = await supabase
        .from('families')
        .select('primary_contact_email, parent2_email')
        .eq('id', familyId)
        .single();

      if (familyError) return { exempt: false, reason: '' };

      const familyEmails = [
        family.primary_contact_email?.toLowerCase().trim(),
        family.parent2_email?.toLowerCase().trim()
      ].filter(Boolean);

      // Build quick lookup maps
      const boardMembersByFamilyId = new Map();
      const boardMembersByEmail = new Map();

      boardMembers.forEach(bm => {
        if (bm.family_id) {
          const key = bm.family_id;
          if (!boardMembersByFamilyId.has(key)) boardMembersByFamilyId.set(key, []);
          boardMembersByFamilyId.get(key).push(bm);
        }
        
        const emails = [bm.email?.toLowerCase().trim(), bm.spouse_email?.toLowerCase().trim()].filter(Boolean);
        emails.forEach(email => {
          if (!boardMembersByEmail.has(email)) boardMembersByEmail.set(email, []);
          boardMembersByEmail.get(email).push(bm);
        });
      });

      // Check exemption
      const exemptResult = this.shouldFamilyBeExemptOptimized(
        familyId,
        players,
        boardMembersByFamilyId,
        boardMembersByEmail,
        familyEmails
      );

      return exemptResult || { exempt: false, reason: '' };

    } catch (error) {
      console.error(`Error in quickCheckFamilyExemption for ${familyId}:`, error);
      return { exempt: false, reason: '' };
    }
  }

  // Background job version with WebSocket/progress reporting
  async startExemptionCheckJob(seasonId, socket = null) {
    try {
      const results = await this.checkAndUpdateWorkbondExemptions(seasonId, 
        (progress, message) => {
          if (socket) {
            socket.emit('exemption-progress', { progress, message });
          }
        }
      );
      
      return results;
    } catch (error) {
      if (socket) {
        socket.emit('exemption-error', { error: error.message });
      }
      throw error;
    }
  }
  
  async isFamilyExempt(familyId, seasonId) {
    try {
      const result = await this.quickCheckFamilyExemption(familyId, seasonId);
      return {
        exempt: result.exempt || false,
        reason: result.reason || ''
      };
    } catch (error) {
      console.error('Error in isFamilyExempt:', error);
      return { exempt: false, reason: 'Error checking exemption' };
    }
  }

  // Keep existing methods for backward compatibility
  async updateExemptionsAfterImport(seasonId) {
    console.log('Updating workbond exemptions after import...');
    return await this.checkAndUpdateWorkbondExemptions(seasonId);
  }

  async checkExemptionsBatch(familyIds, seasonId) {
    try {
      if (!familyIds || familyIds.length === 0) return [];
      
      // Use optimized approach with batching
      const results = [];
      const boardMembers = await this.getBoardMembersCached();
      
      // Batch the families query
      const BATCH_SIZE = 100;
      const batches = [];
      for (let i = 0; i < familyIds.length; i += BATCH_SIZE) {
        batches.push(familyIds.slice(i, i + BATCH_SIZE));
      }
      
      let allFamilies = [];
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const { data: familiesBatch, error: familiesError } = await supabase
          .from('families')
          .select('id, primary_contact_email, parent2_email')
          .in('id', batch);
        
        if (!familiesError && familiesBatch) {
          allFamilies = [...allFamilies, ...familiesBatch];
        }
      }
      
      // Batch the players query
      let allPlayers = [];
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const { data: playersBatch, error: playersError } = await supabase
          .from('players')
          .select(`
            family_id,
            program_title,
            division_id,
            divisions!inner (name)
          `)
          .eq('season_id', seasonId)
          .in('family_id', batch);
        
        if (!playersError && playersBatch) {
          allPlayers = [...allPlayers, ...playersBatch];
        }
      }
      
      // Build lookup maps
      const { familiesMap, boardMembersByFamilyId, boardMembersByEmail } = 
        this.buildLookupMaps(allFamilies, boardMembers);
      
      // Group players
      allPlayers.forEach(p => {
        if (familiesMap.has(p.family_id)) {
          familiesMap.get(p.family_id).players.push({
            program_title: p.program_title,
            division_name: p.divisions?.name
          });
        }
      });
      
      // Check each family
      for (const [familyId, familyData] of familiesMap.entries()) {
        const exemptResult = this.shouldFamilyBeExemptOptimized(
          familyId,
          familyData.players,
          boardMembersByFamilyId,
          boardMembersByEmail,
          familyData.emails
        );
        
        results.push({
          family_id: familyId,
          is_exempt: !!(exemptResult && exemptResult.exempt),
          exempt_reason: exemptResult?.reason || ''
        });
      }
      
      return results;
      
    } catch (error) {
      console.error('Error in checkExemptionsBatch:', error);
      return familyIds.map(id => ({
        family_id: id,
        is_exempt: false,
        exempt_reason: 'Error checking exemption'
      }));
    }
  }
}

module.exports = new WorkbondExemptService();