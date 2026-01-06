const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const familyMatching = require('../services/familyMatching');

// Create a custom JSON parser with increased limit for the import route
const jsonParser = express.json({ limit: '50mb' });

// Get all players with family and team info
router.get('/', async (req, res) => {
  try {
    const { season_id, division_id, team_id } = req.query;
    
    let query = supabase
      .from('players')
      .select(`
        *,
        family:families (*),
        division:divisions (name),
        team:teams (name, color)
      `)
      .order('last_name', { ascending: true });

    if (season_id) query = query.eq('season_id', season_id);
    if (division_id) query = query.eq('division_id', division_id);
    if (team_id) query = query.eq('team_id', team_id);

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new player
router.post('/', async (req, res) => {
  try {
    const playerData = req.body;
    
    const { data, error } = await supabase
      .from('players')
      .insert([playerData])
      .select(`
        *,
        family:families (*),
        division:divisions (name),
        team:teams (name, color)
      `);

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update player
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const playerData = req.body;
    
    const { data, error } = await supabase
      .from('players')
      .update(playerData)
      .eq('id', id)
      .select(`
        *,
        family:families (*),
        division:divisions (name),
        team:teams (name, color)
      `);

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get players for draft with family and volunteer info - WITH EMAIL MATCHING
router.get('/draft/:divisionId', async (req, res) => {
  try {
    const { divisionId } = req.params;
    const { season_id } = req.query;
    
    console.log('=== DRAFT DATA DEBUG START ===');
    console.log('Loading draft data for division ID:', divisionId, 'season:', season_id);

    // First, get the division name from the division ID
    const { data: division, error: divisionError } = await supabase
      .from('divisions')
      .select('name')
      .eq('id', divisionId)
      .single();

    if (divisionError) {
      console.error('Error fetching division:', divisionError);
      throw divisionError;
    }
    
    if (!division) {
      return res.status(404).json({ error: 'Division not found' });
    }

    console.log('Found division:', division.name);

    // Get players by program_title (which contains division names)
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        *,
        family:families (
          id,
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `)
      .eq('season_id', season_id)
      .ilike('program_title', `%${division.name}%`)
      .order('last_name', { ascending: true });

    if (playersError) {
      console.error('Supabase players error:', playersError);
      throw playersError;
    }

    console.log(`Players found for division "${division.name}":`, players?.length);

    // Enhanced volunteer fetching with multiple strategies
    if (players && players.length > 0) {
      const familyIds = players.map(p => p.family?.id).filter(Boolean);
      console.log('Family IDs found:', familyIds);

      // Collect all family emails for matching
      const familyEmails = new Set();
      players.forEach(player => {
        if (player.family?.primary_contact_email) {
          familyEmails.add(player.family.primary_contact_email.toLowerCase());
        }
        if (player.family?.parent2_email) {
          familyEmails.add(player.family.parent2_email.toLowerCase());
        }
      });
      console.log('Family emails found:', Array.from(familyEmails));

      if (familyIds.length > 0 || familyEmails.size > 0) {
        // STRATEGY 1: Get volunteers by family_id (direct relationship)
        let volunteersByFamily = [];
        if (familyIds.length > 0) {
          const { data: familyVolunteers, error: familyVolunteersError } = await supabase
            .from('volunteers')
            .select('*')
            .in('family_id', familyIds)
            .eq('season_id', season_id)
            .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

          if (familyVolunteersError) {
            console.error('Error fetching volunteers by family_id:', familyVolunteersError);
          } else {
            volunteersByFamily = familyVolunteers || [];
            console.log('Volunteers found by family_id:', volunteersByFamily.length);
          }
        }

        // STRATEGY 2: Get volunteers by email matching (for imported volunteers)
        let volunteersByEmail = [];
        if (familyEmails.size > 0) {
          const emailArray = Array.from(familyEmails);
          const { data: emailVolunteers, error: emailVolunteersError } = await supabase
            .from('volunteers')
            .select('*')
            .in('email', emailArray)
            .eq('season_id', season_id)
            .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

          if (emailVolunteersError) {
            console.error('Error fetching volunteers by email:', emailVolunteersError);
          } else {
            volunteersByEmail = emailVolunteers || [];
            console.log('Volunteers found by email matching:', volunteersByEmail.length);
            
            // Log which emails found matches
            if (volunteersByEmail.length > 0) {
              console.log('Email matches found:');
              volunteersByEmail.forEach(volunteer => {
                console.log(`- ${volunteer.name} (${volunteer.email}) -> ${volunteer.role}`);
              });
            }
          }
        }

        // STRATEGY 3: Get ALL volunteers for this division/season to see what exists
        const { data: allDivisionVolunteers, error: allDivisionError } = await supabase
          .from('volunteers')
          .select('*')
          .eq('division_id', divisionId)
          .eq('season_id', season_id)
          .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

        if (allDivisionError) {
          console.error('Error fetching division volunteers:', allDivisionError);
        } else {
          console.log('Volunteers found by division/season:', allDivisionVolunteers?.length);
          if (allDivisionVolunteers && allDivisionVolunteers.length > 0) {
            console.log('Division volunteers:');
            allDivisionVolunteers.forEach(volunteer => {
              console.log(`- ${volunteer.name} | ${volunteer.role} | Email: ${volunteer.email} | Family ID: ${volunteer.family_id}`);
            });
          }
        }

        // Combine all volunteer strategies
        const allVolunteers = [...volunteersByFamily, ...volunteersByEmail];
        const uniqueVolunteers = allVolunteers.filter((v, index, self) => 
          index === self.findIndex(t => t.id === v.id)
        );

        console.log('=== COMBINED VOLUNTEER RESULTS ===');
        console.log('Total unique volunteers found:', uniqueVolunteers.length);
        
        if (uniqueVolunteers.length > 0) {
          uniqueVolunteers.forEach(volunteer => {
            console.log(`- ${volunteer.name} | ${volunteer.role} | Email: ${volunteer.email} | Family ID: ${volunteer.family_id}`);
          });
        } else {
          console.log('NO VOLUNTEERS FOUND with any strategy');
          
          // Final check: Get ALL volunteers in this season regardless of role/division
          const { data: allSeasonVolunteers, error: allSeasonError } = await supabase
            .from('volunteers')
            .select('*')
            .eq('season_id', season_id);

          if (!allSeasonError && allSeasonVolunteers && allSeasonVolunteers.length > 0) {
            console.log('=== ALL VOLUNTEERS IN SEASON (any role/division) ===');
            console.log('Total volunteers in season:', allSeasonVolunteers.length);
            allSeasonVolunteers.forEach(volunteer => {
              console.log(`- ${volunteer.name} | ${volunteer.role} | Division: ${volunteer.division_id} | Email: ${volunteer.email} | Family ID: ${volunteer.family_id}`);
            });
          }
        }

        // Map volunteers to players
        players.forEach(player => {
          player.volunteers = [];
          
          // Strategy 1: Match by family_id
          if (player.family && player.family.id) {
            const familyVolunteers = uniqueVolunteers.filter(v => v.family_id === player.family.id);
            player.volunteers.push(...familyVolunteers);
          }
          
          // Strategy 2: Match by email
          if (player.family) {
            const familyEmails = [
              player.family.primary_contact_email?.toLowerCase(),
              player.family.parent2_email?.toLowerCase()
            ].filter(Boolean);
            
            const emailVolunteers = uniqueVolunteers.filter(v => 
              v.email && familyEmails.includes(v.email.toLowerCase())
            );
            player.volunteers.push(...emailVolunteers);
          }
          
          // Remove duplicates
          player.volunteers = player.volunteers.filter((v, index, self) => 
            index === self.findIndex(t => t.id === v.id)
          );
          
          if (player.volunteers.length > 0) {
            console.log(`>>> VOLUNTEERS ASSIGNED to ${player.first_name} ${player.last_name}:`, 
              player.volunteers.map(v => `${v.name} (${v.role})`));
          }
        });
      } else {
        console.log('No family IDs or emails found for players');
      }
    }

    // Get teams for this division
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .eq('division_id', divisionId)
      .eq('season_id', season_id);

    if (teamsError) {
      console.error('Supabase teams error:', teamsError);
      throw teamsError;
    }

    console.log('Teams found:', teams?.length);

    const result = {
      players: players || [],
      teams: teams || [],
      division: division.name
    };

    // Final summary with volunteer counts
    const playersWithVolunteers = result.players.filter(p => p.volunteers && p.volunteers.length > 0);
    console.log('=== FINAL SUMMARY ===');
    console.log('Players with volunteers:', playersWithVolunteers.length);
    playersWithVolunteers.forEach(player => {
      console.log(`- ${player.first_name} ${player.last_name}:`, 
        player.volunteers.map(v => `${v.name} (${v.role})`));
    });
    
    console.log('=== DRAFT DATA DEBUG END ===');
    
    res.json(result);
  } catch (error) {
    console.error('Complete error in draft route:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import players from CSV/data - UPDATED WITH SMART MERGE FUNCTIONALITY
router.post('/import', jsonParser, async (req, res) => {
  try {
    const { players: playersData, season_id } = req.body;
    
    console.log('=== PLAYER IMPORT START (SMART MERGE) ===');
    console.log('Season ID:', season_id);
    console.log('Players data length:', playersData?.length);
    
    if (!playersData || !Array.isArray(playersData)) {
      return res.status(400).json({ error: 'Invalid players data' });
    }

    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    // --- NEW: resolve division_id from program_title during import ---
    // We load divisions for this season once, then match by name.
    const { data: seasonDivisions, error: seasonDivisionsError } = await supabase
      .from('divisions')
      .select('id, name')
      .eq('season_id', season_id);

    if (seasonDivisionsError) {
      console.error('Error loading divisions for season:', seasonDivisionsError);
      throw seasonDivisionsError;
    }

    const divisionNameToId = new Map();
    (seasonDivisions || []).forEach((d) => {
      const name = String(d?.name || '').trim();
      if (d?.id && name) divisionNameToId.set(name.toLowerCase(), d.id);
    });

    // Match strategy:
    // 1) exact case-insensitive name match
    // 2) contains match (handles program_title like "Softball - Rookies Division (Coach Pitch)")
    const resolveDivisionId = (programTitle) => {
      const pt = String(programTitle || '').trim();
      if (!pt) return null;

      const exact = divisionNameToId.get(pt.toLowerCase());
      if (exact) return exact;

      // contains match
      const lower = pt.toLowerCase();
      for (const [divNameLower, divId] of divisionNameToId.entries()) {
        if (lower.includes(divNameLower)) return divId;
      }

      return null;
    };
    
    // Get existing players for this season to check for duplicates
    console.log('Checking for existing players in season:', season_id);
    const { data: existingPlayers, error: existingPlayersError } = await supabase
      .from('players')
      .select('*')
      .eq('season_id', season_id);

    if (existingPlayersError) {
      console.error('Error fetching existing players:', existingPlayersError);
      throw existingPlayersError;
    }

    console.log('Found existing players:', existingPlayers?.length);

    // For very large imports, process in batches to avoid memory issues
    const BATCH_SIZE = 100;
    const totalBatches = Math.ceil(playersData.length / BATCH_SIZE);
    
    console.log(`Processing ${playersData.length} players in ${totalBatches} batches of ${BATCH_SIZE}`);
    
    let allProcessedPlayers = [];
    let allErrors = [];
    const createdFamilies = new Set();
    const updatedPlayers = [];
    const newPlayers = [];
    
    // Process in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * BATCH_SIZE;
      const endIndex = Math.min(startIndex + BATCH_SIZE, playersData.length);
      const batchData = playersData.slice(startIndex, endIndex);
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (players ${startIndex + 1}-${endIndex})`);
      
      try {
        // Track families and their members for this batch
        const familyMap = new Map();
        const processedPlayers = [];
        const errors = [];
        
        // First pass: Process each player and assign to families
        for (const [index, playerData] of batchData.entries()) {
          const globalIndex = startIndex + index;
          try {
            // Validate required fields
            if (!playerData.first_name || !playerData.last_name) {
              errors.push(`Row ${globalIndex + 1}: Missing first_name or last_name`);
              continue;
            }

            // Check if player already exists in this season
            const existingPlayer = findExistingPlayer(existingPlayers, playerData, season_id);
            
            if (existingPlayer) {
              console.log(`Found existing player: ${playerData.first_name} ${playerData.last_name}, updating record`);
              
              // Update existing player
              const updatedPlayer = await updateExistingPlayer(existingPlayer, playerData, resolveDivisionId);
              updatedPlayers.push(updatedPlayer);

              // NEW: Also merge guardian/contact fields onto the existing family (if present)
              try {
  if (existingPlayer.family_id) {
    await familyMatching.mergeFamilyDetails(existingPlayer.family_id, playerData, {
      season_id: season_id,
      clearWorkbondIfEmpty: true
    });
  }
} catch (e) {
  console.warn('Family merge (existing player) failed:', e?.message || e);
}
              
            } else {
              // New player - create family association
              let family = await familyMatching.findExistingFamily(playerData);
              let isNewFamily = false;

              if (!family) {
                // Create new family
                const familyId = familyMatching.generateFamilyId(playerData);
                family = await createNewFamily(playerData, familyId);
                isNewFamily = true;
                createdFamilies.add(family.id);
              }

              // NEW: Ensure guardian/contact details are merged onto the family record
              try {
  if (family?.id) {
    await familyMatching.mergeFamilyDetails(family.id, playerData, {
      season_id: season_id,
      clearWorkbondIfEmpty: true
    });
  }
} catch (e) {
  console.warn('Family merge (new player) failed:', e?.message || e);
}

              // Add player to family group
              if (!familyMap.has(family.id)) {
                familyMap.set(family.id, []);
              }
              familyMap.get(family.id).push({ index: globalIndex, playerData, family, isNewFamily });
            }
            
          } catch (error) {
            errors.push(`Row ${globalIndex + 1}: ${error.message}`);
          }
        }

        // Second pass: Create NEW players for this batch (existing players were already handled)
        for (const [familyId, familyPlayers] of familyMap.entries()) {
          try {
            const family = familyPlayers[0].family;
            
            // Create all NEW players for this family
            for (const { index, playerData } of familyPlayers) {
              const playerRecord = {
                family_id: family.id,
                season_id: season_id,
                division_id: resolveDivisionId(playerData.program_title),
                registration_no: playerData.registration_no,
                first_name: playerData.first_name,
                last_name: playerData.last_name,
                birth_date: parseDate(playerData.birth_date),
                gender: playerData.gender,
                medical_conditions: playerData.medical_conditions,
                is_new_player: parseBoolean(playerData.new_or_returning === 'New'),
                is_returning: parseBoolean(playerData.new_or_returning === 'Returning'),
                is_travel_player: parseBoolean(playerData.travel_player),
                uniform_shirt_size: playerData.uniform_shirt_size,
                uniform_pants_size: playerData.uniform_pants_size,
                program_title: playerData.program_title,
                payment_received: parsePaymentStatus(playerData.payment_status),
              };

              processedPlayers.push(playerRecord);
              newPlayers.push(playerRecord);
            }

            // Create volunteers from parent information (only for new families)
            if (familyPlayers[0].isNewFamily) {
              await createFamilyVolunteers(family, season_id, familyPlayers[0].playerData);
            }
            
          } catch (error) {
            familyPlayers.forEach(({ index }) => {
              errors.push(`Row ${index + 1}: ${error.message}`);
            });
          }
        }

        // Insert NEW players for this batch
        if (processedPlayers.length > 0) {
          console.log(`Inserting ${processedPlayers.length} NEW players from batch ${batchIndex + 1}`);
          const { data: insertedPlayers, error: insertError } = await supabase
            .from('players')
            .insert(processedPlayers)
            .select();

          if (insertError) {
            console.error(`Batch ${batchIndex + 1} insert error:`, insertError);
            throw insertError;
          }

          allProcessedPlayers = allProcessedPlayers.concat(insertedPlayers);
        }

        allErrors = allErrors.concat(errors);
        
        // Small delay between batches to avoid overwhelming the database
        if (batchIndex < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (batchError) {
        console.error(`Error in batch ${batchIndex + 1}:`, batchError);
        allErrors.push(`Batch ${batchIndex + 1}: ${batchError.message}`);
      }
    }

    if (allProcessedPlayers.length === 0 && updatedPlayers.length === 0) {
      return res.status(400).json({ 
        error: 'No valid players to import', 
        details: allErrors 
      });
    }

    // Update shift requirements for all created families
    console.log('Updating shift requirements for new families...');
    for (const familyId of createdFamilies) {
      try {
        await familyMatching.updateFamilyShiftRequirements(familyId, season_id);
      } catch (error) {
        console.error(`Error updating shift requirements for family ${familyId}:`, error);
        allErrors.push(`Family ${familyId}: Failed to update shift requirements`);
      }
    }

    const response = { 
      message: `${allProcessedPlayers.length + updatedPlayers.length} players processed successfully (${allProcessedPlayers.length} new, ${updatedPlayers.length} updated)`, 
      data: {
        newPlayers: allProcessedPlayers,
        updatedPlayers: updatedPlayers
      },
      familyCount: createdFamilies.size,
      warnings: allErrors
    };

    if (allErrors.length > 0) {
      response.message += ` (${allErrors.length} rows had errors)`;
    }

    console.log('=== PLAYER IMPORT COMPLETE (SMART MERGE) ===');
    console.log(`Summary: ${allProcessedPlayers.length} new players, ${updatedPlayers.length} updated players`);
    res.status(201).json(response);
  } catch (error) {
    console.error('=== PLAYER IMPORT ERROR ===');
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// NEW: Helper function to find existing player
function findExistingPlayer(existingPlayers, playerData, seasonId) {
  if (!existingPlayers || !Array.isArray(existingPlayers)) return null;
  
  // Try multiple matching strategies
  
  // Strategy 1: Exact name match in same season
  const exactMatch = existingPlayers.find(player => 
    player.season_id === seasonId &&
    player.first_name?.toLowerCase() === playerData.first_name?.toLowerCase() &&
    player.last_name?.toLowerCase() === playerData.last_name?.toLowerCase()
  );
  
  if (exactMatch) return exactMatch;
  
  // Strategy 2: Registration number match
  if (playerData.registration_no) {
    const registrationMatch = existingPlayers.find(player => 
      player.season_id === seasonId &&
      player.registration_no === playerData.registration_no
    );
    
    if (registrationMatch) return registrationMatch;
  }
  
  // Strategy 3: Name and birth date match
  if (playerData.birth_date) {
    const parsedBirthDate = parseDate(playerData.birth_date);
    if (parsedBirthDate) {
      const birthDateMatch = existingPlayers.find(player => 
        player.season_id === seasonId &&
        player.first_name?.toLowerCase() === playerData.first_name?.toLowerCase() &&
        player.last_name?.toLowerCase() === playerData.last_name?.toLowerCase() &&
        player.birth_date === parsedBirthDate
      );
      
      if (birthDateMatch) return birthDateMatch;
    }
  }
  
  return null;
}

// NEW: Helper function to update existing player
async function updateExistingPlayer(existingPlayer, newPlayerData, resolveDivisionId) {
  const updates = {};
  
  // Only update fields that have new data and are different from existing data
  if (newPlayerData.registration_no && newPlayerData.registration_no !== existingPlayer.registration_no) {
    updates.registration_no = newPlayerData.registration_no;
  }
  
  if (newPlayerData.birth_date) {
    const parsedBirthDate = parseDate(newPlayerData.birth_date);
    if (parsedBirthDate && parsedBirthDate !== existingPlayer.birth_date) {
      updates.birth_date = parsedBirthDate;
    }
  }
  
  if (newPlayerData.gender && newPlayerData.gender !== existingPlayer.gender) {
    updates.gender = newPlayerData.gender;
  }
  
  if (newPlayerData.medical_conditions !== undefined && newPlayerData.medical_conditions !== existingPlayer.medical_conditions) {
    updates.medical_conditions = newPlayerData.medical_conditions;
  }
  
  if (newPlayerData.uniform_shirt_size && newPlayerData.uniform_shirt_size !== existingPlayer.uniform_shirt_size) {
    updates.uniform_shirt_size = newPlayerData.uniform_shirt_size;
  }
  
  if (newPlayerData.uniform_pants_size && newPlayerData.uniform_pants_size !== existingPlayer.uniform_pants_size) {
    updates.uniform_pants_size = newPlayerData.uniform_pants_size;
  }
  
  if (newPlayerData.program_title && newPlayerData.program_title !== existingPlayer.program_title) {
    updates.program_title = newPlayerData.program_title;
  }

  // NEW: keep players.division_id in sync with program_title (when possible)
  // Only set when we can confidently resolve an id for this season.
  if (typeof resolveDivisionId === 'function') {
    const resolvedDivisionId = resolveDivisionId(newPlayerData.program_title || existingPlayer.program_title);
    if (resolvedDivisionId && String(resolvedDivisionId) !== String(existingPlayer.division_id || '')) {
      updates.division_id = resolvedDivisionId;
    }
  }
  
  // Update boolean fields if they've changed
  if (newPlayerData.new_or_returning !== undefined) {
    const isNewPlayer = parseBoolean(newPlayerData.new_or_returning === 'New');
    if (isNewPlayer !== existingPlayer.is_new_player) {
      updates.is_new_player = isNewPlayer;
      updates.is_returning = !isNewPlayer;
    }
  }
  
  if (newPlayerData.travel_player !== undefined) {
    const isTravelPlayer = parseBoolean(newPlayerData.travel_player);
    if (isTravelPlayer !== existingPlayer.is_travel_player) {
      updates.is_travel_player = isTravelPlayer;
    }
  }
  
  if (newPlayerData.payment_status !== undefined) {
    const paymentReceived = parsePaymentStatus(newPlayerData.payment_status);
    if (paymentReceived !== existingPlayer.payment_received) {
      updates.payment_received = paymentReceived;
    }
  }
  
  // If there are updates to make, update the player
  if (Object.keys(updates).length > 0) {
    console.log(`Updating player ${existingPlayer.first_name} ${existingPlayer.last_name} with changes:`, updates);
    
    const { data: updatedPlayer, error } = await supabase
      .from('players')
      .update(updates)
      .eq('id', existingPlayer.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating player:', error);
      throw error;
    }
    
    return updatedPlayer;
  } else {
    console.log(`No changes needed for player ${existingPlayer.first_name} ${existingPlayer.last_name}`);
    return existingPlayer;
  }
}

// Helper function: Parse boolean values safely
function parseBoolean(value) {
  if (value === null || value === undefined || value === '') {
    return false; // Default to false for empty values
  }
  
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase().trim();
    if (lowerValue === 'true' || lowerValue === 'yes' || lowerValue === '1') return true;
    if (lowerValue === 'false' || lowerValue === 'no' || lowerValue === '0' || lowerValue === 'n/a' || lowerValue === 'na') return false;
  }
  
  return false; // Default to false for any other values
}

// Helper function: Parse payment status - FIXED for better detection
function parsePaymentStatus(paymentStatus) {
  if (!paymentStatus) return false;
  
  const status = paymentStatus.toLowerCase().trim();
  
  // Check for completed payment indicators
  if (status.includes('completed') || 
      status.includes('paid') || 
      status.includes('credit card') || 
      status.includes('check') ||
      status.includes('payment received') ||
      status === 'complete' ||
      status === 'paid') {
    return true;
  }
  
  // Check for pending indicators
  if (status.includes('pending') || 
      status.includes('unpaid') || 
      status.includes('waiting') ||
      status.includes('processing') ||
      status === 'pending') {
    return false;
  }
  
  return false; // Default to false for unknown statuses
}

// Helper function to create new family
async function createNewFamily(playerData, familyId) {
  const familyRecord = {
    family_id: familyId,
    primary_contact_name: `${playerData.parent1_firstname || ''} ${playerData.parent1_lastname || ''}`.trim(),
    primary_contact_email: playerData.parent1_email,
    primary_contact_phone: playerData.parent1_phone1,
    parent2_first_name: playerData.parent2_firstname,
    parent2_last_name: playerData.parent2_lastname,
    parent2_email: playerData.parent2_email,
    parent2_phone: playerData.parent2_phone1,
    address_line_1: playerData.address_line_1,
    address_line_2: playerData.address_line_2,
    city: playerData.city,
    state: playerData.state,
    zip_code: playerData.zip_code,
    // IMPORTANT: Only set work_bond_check_received if explicitly provided
    work_bond_check_received: parseWorkbondStatus(playerData.workbond_check_status)
  };

  // Fallback for primary contact name
  if (!familyRecord.primary_contact_name) {
    familyRecord.primary_contact_name = `${playerData.first_name} ${playerData.last_name}'s Parent`;
  }

  const { data: newFamily, error } = await supabase
    .from('families')
    .insert([familyRecord])
    .select()
    .single();

  if (error) throw error;
  return newFamily;
}

// NEW: Helper function to parse workbond status - handles empty values correctly
function parseWorkbondStatus(workbondStatus) {
  if (!workbondStatus || workbondStatus.trim() === '') {
    return false; // Empty string means NOT received
  }
  
  const status = workbondStatus.toLowerCase().trim();
  
  // Check for received indicators
  if (status.includes('received') || 
      status.includes('yes') || 
      status.includes('true') ||
      status.includes('1') ||
      status === 'received') {
    return true;
  }
  
  // Check for not received indicators
  if (status.includes('pending') || 
      status.includes('no') || 
      status.includes('false') ||
      status.includes('0') ||
      status.includes('not') ||
      status === 'pending') {
    return false;
  }
  
  return false; // Default to false for unknown statuses
}

// Helper function to create volunteers for a family
async function createFamilyVolunteers(family, seasonId, playerData) {
  const volunteers = [];

  // Create volunteer from parent1 if they have a name
  if (family.primary_contact_name && family.primary_contact_name !== `${playerData.first_name} ${playerData.last_name}'s Parent`) {
    volunteers.push({
      family_id: family.id,
      season_id: seasonId,
      name: family.primary_contact_name,
      email: family.primary_contact_email,
      phone: family.primary_contact_phone,
      role: 'Parent', // Default role - can be updated to Manager/Coach/Team Parent during draft
      can_pickup: true,
    });
  }

  // Create volunteer from parent2 if available
  if (family.parent2_first_name) {
    const parent2Name = `${family.parent2_first_name} ${family.parent2_last_name || ''}`.trim();
    volunteers.push({
      family_id: family.id,
      season_id: seasonId,
      name: parent2Name,
      email: family.parent2_email,
      phone: family.parent2_phone,
      role: 'Parent', // Default role
      can_pickup: true
    });
  }

  if (volunteers.length > 0) {
    const { error } = await supabase
      .from('volunteers')
      .insert(volunteers);

    if (error) {
      console.error('Error creating volunteers:', error);
    }
  }
}

// Helper function to parse various date formats - FIXED for timezone issues
function parseDate(dateString) {
  if (!dateString) return null;
  
  const cleanDateString = String(dateString).trim();
  
  // If it's already in YYYY-MM-DD, return as-is
  if (cleanDateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return cleanDateString;
  }
  
  // Convert MM/DD/YYYY to YYYY-MM-DD
  if (cleanDateString.includes('/')) {
    const parts = cleanDateString.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  
  // Convert MM-DD-YYYY to YYYY-MM-DD  
  if (cleanDateString.includes('-')) {
    const parts = cleanDateString.split('-');
    if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  
  return null;
}

// Get players by team for manager view
router.get('/team/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const { data, error } = await supabase
      .from('players')
      .select(`
        *,
        family:families (primary_contact_name, primary_contact_email, primary_contact_phone, parent2_first_name, parent2_last_name, parent2_email, parent2_phone)
      `)
      .eq('team_id', teamId)
      .order('last_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
