// routes/import-shifts.js
const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Import shifts from CSV
router.post('/import-shifts', async (req, res) => {
  try {
    const { shifts, season_id } = req.body;

    console.log('Importing shifts:', shifts.length);

    const results = {
      imported: 0,
      matched: 0,
      unmatched: 0,
      createdVolunteers: 0,
      createdShifts: 0,
      warnings: [],
      unmatchedRecords: [],
    };

    for (const shift of shifts) {
      try {
        // Extract data from CSV
        const volunteerName = shift['Who'] || shift['Name'] || '';
        const volunteerEmail = shift['Email'] || '';
        const volunteerPhone = shift['Phone'] || '';
        const playerName = shift['Players First and Last Name'] || shift['Player Name'] || '';
        const shiftDate = parseDate(shift['Date']);
        const shiftType = shift['Task'] || 'Concession Stand';
        const hours = parseHours(shift['Hours tracking'] || '2.5');
        
        // Skip empty rows
        if (!volunteerName || !shiftDate) {
          continue;
        }

        let matchedFamily = null;
        let matchedVolunteer = null;
        
        // 1. Try to find by player name
        if (playerName) {
          const playerNameParts = playerName.split(' ');
          const firstName = playerNameParts[0] || '';
          const lastName = playerNameParts.slice(1).join(' ') || '';
          
          const { data: players, error: playerError } = await supabase
            .from('players')
            .select('*, families(*)')
            .or(`first_name.ilike.%${firstName}%,last_name.ilike.%${lastName}%`)
            .eq('season_id', season_id)
            .limit(1);
          
          if (!playerError && players && players.length > 0 && players[0].families) {
            matchedFamily = players[0].families;
          }
        }
        
        // 2. Try to find by email
        if (!matchedFamily && volunteerEmail) {
          const { data: families, error: familyError } = await supabase
            .from('families')
            .select('*')
            .or(`primary_contact_email.eq.${volunteerEmail},parent2_email.eq.${volunteerEmail}`)
            .limit(1);
          
          if (!familyError && families && families.length > 0) {
            matchedFamily = families[0];
          }
        }
        
        // 3. Try to find by phone
        if (!matchedFamily && volunteerPhone) {
          const { data: families, error: familyError } = await supabase
            .from('families')
            .select('*')
            .or(`primary_contact_phone.eq.${volunteerPhone},parent2_phone.eq.${volunteerPhone}`)
            .limit(1);
          
          if (!familyError && families && families.length > 0) {
            matchedFamily = families[0];
          }
        }
        
        // If we found a match, create the shift
        if (matchedFamily) {
          // Find or create volunteer
          const { data: existingVolunteer, error: volunteerError } = await supabase
            .from('volunteers')
            .select('*')
            .or(`email.eq.${volunteerEmail},phone.eq.${volunteerPhone},name.eq.${volunteerName}`)
            .eq('season_id', season_id)
            .limit(1);
          
          let volunteerId = existingVolunteer?.[0]?.id;
          
          if (!volunteerId) {
            // Create new volunteer
            const { data: newVolunteer, error: createError } = await supabase
              .from('volunteers')
              .insert({
                name: volunteerName,
                email: volunteerEmail,
                phone: volunteerPhone,
                role: 'Parent',
                family_id: matchedFamily.id,
                season_id: season_id
              })
              .select()
              .single();
            
            if (!createError && newVolunteer) {
              volunteerId = newVolunteer.id;
              results.createdVolunteers++;
            }
          }
          
          // Create workbond shift
          await supabase
            .from('workbond_shifts')
            .insert({
              family_id: matchedFamily.id,
              volunteer_id: volunteerId,
              season_id: season_id,
              shift_date: shiftDate.toISOString().split('T')[0],
              shift_type: shiftType,
              hours_worked: hours,
              description: shift['Desc'] || '',
              is_manual_credit: false
            });
          
          results.createdShifts++;
          results.matched++;
        } else {
          // Save to unmatched imports
          const { data: importRecord, error: importError } = await supabase
            .from('workbond_imports')
            .insert({
              shift_date: shiftDate.toISOString().split('T')[0],
              volunteer_name: volunteerName,
              volunteer_email: volunteerEmail,
              volunteer_phone: volunteerPhone,
              player_name: playerName,
              shift_type: shiftType,
              hours_worked: hours,
              description: shift['Desc'] || '',
              season_id: season_id,
              is_matched: false
            })
            .select()
            .single();
          
          if (!importError && importRecord) {
            results.unmatched++;
            results.unmatchedRecords.push(importRecord);
          }
        }
        
        results.imported++;
        
      } catch (error) {
        results.warnings.push(`Error processing shift: ${error.message}`);
      }
    }
    
    res.json({
      success: true,
      message: 'Import completed',
      ...results
    });
    
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get unmatched imports
router.get('/unmatched-imports', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }
    
    const { data, error } = await supabase
      .from('workbond_imports')
      .select('*')
      .eq('season_id', season_id)
      .eq('is_matched', false)
      .order('shift_date', { ascending: false });
    
    if (error) throw error;
    
    res.json(data || []);
    
  } catch (error) {
    console.error('Error fetching unmatched imports:', error);
    res.status(500).json({ error: error.message });
  }
});

// Link an import to a family
router.post('/link-import/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { family_id, season_id } = req.body;
    
    if (!id || !family_id || !season_id) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get the import record
    const { data: importRecord, error: importError } = await supabase
      .from('workbond_imports')
      .select('*')
      .eq('id', id)
      .single();
    
    if (importError) throw importError;
    
    if (!importRecord) {
      return res.status(404).json({ error: 'Import record not found' });
    }
    
    // Find or create volunteer
    const { data: existingVolunteer } = await supabase
      .from('volunteers')
      .select('*')
      .or(`email.eq.${importRecord.volunteer_email},phone.eq.${importRecord.volunteer_phone},name.eq.${importRecord.volunteer_name}`)
      .eq('season_id', season_id)
      .limit(1);
    
    let volunteerId = existingVolunteer?.[0]?.id;
    
    if (!volunteerId) {
      // Create new volunteer
      const { data: newVolunteer, error: volunteerError } = await supabase
        .from('volunteers')
        .insert({
          name: importRecord.volunteer_name,
          email: importRecord.volunteer_email,
          phone: importRecord.volunteer_phone,
          role: 'Parent',
          family_id: family_id,
          season_id: season_id
        })
        .select()
        .single();
      
      if (volunteerError) throw volunteerError;
      volunteerId = newVolunteer.id;
    }
    
    // Create workbond shift
    const { error: shiftError } = await supabase
      .from('workbond_shifts')
      .insert({
        family_id: family_id,
        volunteer_id: volunteerId,
        season_id: season_id,
        shift_date: importRecord.shift_date,
        shift_type: importRecord.shift_type,
        hours_worked: importRecord.hours_worked,
        description: importRecord.description,
        is_manual_credit: false
      });
    
    if (shiftError) throw shiftError;
    
    // Update import record as matched
    await supabase
      .from('workbond_imports')
      .update({
        is_matched: true,
        matched_family_id: family_id,
        matched_volunteer_id: volunteerId,
        processed_at: new Date().toISOString(),
        match_method: 'manual_link'
      })
      .eq('id', id);
    
    res.json({
      success: true,
      message: 'Import linked successfully'
    });
    
  } catch (error) {
    console.error('Error linking import:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-link all unmatched imports
router.post('/auto-link-all', async (req, res) => {
  try {
    const { season_id } = req.body;
    
    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }
    
    // Get all unmatched imports
    const { data: unmatchedImports, error: fetchError } = await supabase
      .from('workbond_imports')
      .select('*')
      .eq('season_id', season_id)
      .eq('is_matched', false);
    
    if (fetchError) throw fetchError;
    
    let linked = 0;
    let failed = 0;
    
    for (const importRecord of unmatchedImports || []) {
      try {
        // Try to find family by email
        let family = null;
        
        if (importRecord.volunteer_email) {
          const { data: families } = await supabase
            .from('families')
            .select('*')
            .or(`primary_contact_email.eq.${importRecord.volunteer_email},parent2_email.eq.${importRecord.volunteer_email}`)
            .limit(1);
          
          if (families && families.length > 0) {
            family = families[0];
          }
        }
        
        // Try by phone if email didn't match
        if (!family && importRecord.volunteer_phone) {
          const { data: families } = await supabase
            .from('families')
            .select('*')
            .or(`primary_contact_phone.eq.${importRecord.volunteer_phone},parent2_phone.eq.${importRecord.volunteer_phone}`)
            .limit(1);
          
          if (families && families.length > 0) {
            family = families[0];
          }
        }
        
        if (family) {
          // Find or create volunteer
          const { data: existingVolunteer } = await supabase
            .from('volunteers')
            .select('*')
            .or(`email.eq.${importRecord.volunteer_email},phone.eq.${importRecord.volunteer_phone},name.eq.${importRecord.volunteer_name}`)
            .eq('season_id', season_id)
            .limit(1);
          
          let volunteerId = existingVolunteer?.[0]?.id;
          
          if (!volunteerId) {
            const { data: newVolunteer } = await supabase
              .from('volunteers')
              .insert({
                name: importRecord.volunteer_name,
                email: importRecord.volunteer_email,
                phone: importRecord.volunteer_phone,
                role: 'Parent',
                family_id: family.id,
                season_id: season_id
              })
              .select()
              .single();
            
            if (newVolunteer) {
              volunteerId = newVolunteer.id;
            }
          }
          
          // Create workbond shift
          await supabase
            .from('workbond_shifts')
            .insert({
              family_id: family.id,
              volunteer_id: volunteerId,
              season_id: season_id,
              shift_date: importRecord.shift_date,
              shift_type: importRecord.shift_type,
              hours_worked: importRecord.hours_worked,
              description: importRecord.description,
              is_manual_credit: false
            });
          
          // Mark as matched
          await supabase
            .from('workbond_imports')
            .update({
              is_matched: true,
              matched_family_id: family.id,
              matched_volunteer_id: volunteerId,
              processed_at: new Date().toISOString(),
              match_method: 'auto_link'
            })
            .eq('id', importRecord.id);
          
          linked++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to auto-link import ${importRecord.id}:`, error);
        failed++;
      }
    }
    
    res.json({
      success: true,
      message: `Auto-link completed: ${linked} linked, ${failed} failed`,
      linked,
      failed
    });
    
  } catch (error) {
    console.error('Error auto-linking:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function parseDate(dateStr) {
  if (!dateStr) return new Date();
  return new Date(dateStr);
}

function parseHours(hoursStr) {
  const hours = parseFloat(hoursStr);
  return isNaN(hours) ? 2.5 : hours;
}

module.exports = router;