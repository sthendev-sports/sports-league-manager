const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all families with players
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .select(`
        *,
        players:players (*),
        extended_family:extended_family (*)
      `)
      .order('primary_contact_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get families missing work bond checks
router.get('/missing-workbond-checks', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .select('*')
      .eq('work_bond_check_received', false)
      .order('primary_contact_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get families with incomplete work bond shifts
router.get('/incomplete-workbond-shifts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('families')
      .select('*')
      .lt('work_bond_shifts_completed', 'work_bond_shifts_required')
      .order('primary_contact_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/families/:id/workbond-status/:seasonId
router.get('/:id/workbond-status/:seasonId', async (req, res) => {
  try {
    const { id, seasonId } = req.params;
    
    const { data, error } = await supabase
      .from('family_season_workbond')
      .select('*')
      .eq('family_id', id)
      .eq('season_id', seasonId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Not found
        // Fallback to families table for backward compatibility
        const { data: familyData } = await supabase
          .from('families')
          .select('work_bond_check_status, work_bond_check_received')
          .eq('id', id)
          .single();
        
        return res.json({
          notes: familyData?.work_bond_check_status || '',
          received: familyData?.work_bond_check_received || false
        });
      }
      throw error;
    }

    res.json({
      notes: data.notes || '',
      received: data.received || false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// In families.js or new file
router.post('/family-season-workbond', async (req, res) => {
  try {
    const { family_id, season_id, notes, received } = req.body;
    
    // Check if record exists
    const { data: existing, error: checkError } = await supabase
      .from('family_season_workbond')
      .select('id')
      .eq('family_id', family_id)
      .eq('season_id', season_id)
      .single();

    let result;
    if (existing) {
      // Update existing
      const { data, error } = await supabase
        .from('family_season_workbond')
        .update({ notes, received, updated_at: new Date() })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('family_season_workbond')
        .insert([{ family_id, season_id, notes, received }])
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update workbond status for a family
router.put('/:familyId/workbond-status', async (req, res) => {
  try {
    const { familyId } = req.params;
    const { work_bond_check_status, work_bond_check_received } = req.body;
    
    const { data, error } = await supabase
      .from('families')
      .update({
        work_bond_check_status: work_bond_check_status || null,
        work_bond_check_received: work_bond_check_received || false
      })
      .eq('id', familyId)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add extended family member
router.post('/:familyId/extended-family', async (req, res) => {
  try {
    const { familyId } = req.params;
    const extendedFamilyData = req.body;
    
    const { data, error } = await supabase
      .from('extended_family')
      .insert([{ ...extendedFamilyData, family_id: familyId }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
