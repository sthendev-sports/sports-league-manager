const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const workbondExemptService = require('../services/workbondExemptService');

// POST /api/family-season-workbond/batch - Get workbond records for multiple families in a season
router.post('/batch', async (req, res) => {
  try {
    const { season_id, family_ids } = req.body;
    
    if (!season_id || !family_ids || !Array.isArray(family_ids) || family_ids.length === 0) {
      return res.json([]);
    }

    // Filter out any null/undefined family IDs
    const validFamilyIds = family_ids.filter(id => id && id.trim() !== '');
    
    if (validFamilyIds.length === 0) {
      return res.json([]);
    }

    const { data, error } = await supabase
      .from('family_season_workbond')
      .select('*')
      .eq('season_id', season_id)
      .in('family_id', validFamilyIds);

    if (error) {
      console.error('Error fetching batch workbond records:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data || []);
  } catch (error) {
    console.error('Error in batch workbond endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/family-season-workbond - Create or update a workbond record
router.post('/', async (req, res) => {
  try {
    const { family_id, season_id, notes, received, update_families_table = true } = req.body;
    
    if (!family_id || !season_id) {
      return res.status(400).json({ error: 'family_id and season_id are required' });
    }

    // CHECK FOR EXEMPTIONS USING YOUR SERVICE
    const exemptionInfo = await workbondExemptService.isFamilyExempt(family_id, season_id);
    const isExempt = exemptionInfo.exempt;
    
    // If user is trying to mark as received but family is exempt, override
    let finalNotes = notes || '';
    let finalReceived = received || false;
    
    if (isExempt) {
      // Auto-mark as exempt (override user input for exempt families)
      finalNotes = `Exempt - ${exemptionInfo.reason}`;
      finalReceived = false; // Exempt families don't provide checks
      console.log(`Family ${family_id} is exempt: ${exemptionInfo.reason}. Overriding user input.`);
    }

    // Check if record exists
    const { data: existing, error: checkError } = await supabase
      .from('family_season_workbond')
      .select('*')
      .eq('family_id', family_id)
      .eq('season_id', season_id)
      .single();

    let result;
    
    if (existing) {
      // Update existing record
      const updates = {
        notes: finalNotes,
        received: finalReceived,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('family_season_workbond')
        .update(updates)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new record
      const newRecord = {
        family_id,
        season_id,
        notes: finalNotes,
        received: finalReceived,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('family_season_workbond')
        .insert([newRecord])
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Optionally update the families table for compatibility
    if (update_families_table) {
      try {
        const { error: familyError } = await supabase
          .from('families')
          .update({
            work_bond_check_status: finalNotes,
            work_bond_check_received: finalReceived,
            updated_at: new Date().toISOString()
          })
          .eq('id', family_id);

        if (familyError) {
          console.error('Error updating families table (non-critical):', familyError);
        }
      } catch (familyUpdateError) {
        console.error('Error in families table update (non-critical):', familyUpdateError);
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Error in workbond create/update endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// ADD THIS NEW ENDPOINT: Check and update exemptions for all families in a season
router.post('/update-exemptions', async (req, res) => {
  try {
    const { season_id } = req.body;
    
    if (!season_id) {
      return res.status(400).json({ error: 'season_id is required' });
    }

    await workbondExemptService.checkAndUpdateWorkbondExemptions(season_id);
    
    res.json({ 
      success: true, 
      message: 'Exemption check completed successfully' 
    });
  } catch (error) {
    console.error('Error in update-exemptions endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// ADD THIS: Check exemptions for multiple families
router.post('/check-exemptions-batch', async (req, res) => {
  try {
    const { family_ids, season_id } = req.body;
    
    if (!season_id || !family_ids || !Array.isArray(family_ids)) {
      return res.json([]);
    }

    const results = [];
    
    for (const familyId of family_ids) {
      try {
        const exemptionInfo = await workbondExemptService.isFamilyExempt(familyId, season_id);
        
        results.push({
          family_id: familyId,
          is_exempt: exemptionInfo.exempt,
          exempt_reason: exemptionInfo.reason
        });
        
        // Auto-update workbond record if exempt
        if (exemptionInfo.exempt) {
          const exemptNote = `Exempt - ${exemptionInfo.reason}`;
          
          const { data: existing } = await supabase
            .from('family_season_workbond')
            .select('id')
            .eq('family_id', familyId)
            .eq('season_id', season_id)
            .single();
          
          if (!existing) {
            await supabase
              .from('family_season_workbond')
              .insert([{
                family_id: familyId,
                season_id: season_id,
                notes: exemptNote,
                received: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }]);
          }
        }
      } catch (error) {
        console.error(`Error checking exemption for family ${familyId}:`, error);
        results.push({
          family_id: familyId,
          is_exempt: false,
          exempt_reason: 'Error checking exemption'
        });
      }
    }

    res.json(results);
  } catch (error) {
    console.error('Error in check-exemptions-batch endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/family-season-workbond/check-exemptions-batch - Optimized batch check
router.post('/check-exemptions-batch', async (req, res) => {
  try {
    const { family_ids, season_id } = req.body;
    
    if (!season_id || !family_ids || !Array.isArray(family_ids)) {
      return res.json([]);
    }

    // Use the optimized batch method
    const results = await workbondExemptService.checkExemptionsBatch(family_ids, season_id);
    
    res.json(results);
  } catch (error) {
    console.error('Error in check-exemptions-batch endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/families/:familyId/season-workbond/:seasonId - Get specific family/season workbond
router.get('/:familyId/season-workbond/:seasonId', async (req, res) => {
  try {
    const { familyId, seasonId } = req.params;

    const { data, error } = await supabase
      .from('family_season_workbond')
      .select('*')
      .eq('family_id', familyId)
      .eq('season_id', seasonId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        return res.json({
          received: false,
          notes: '',
          family_id: familyId,
          season_id: seasonId
        });
      }
      throw error;
    }

    res.json(data || { received: false, notes: '' });
  } catch (error) {
    console.error('Error fetching family season workbond:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;