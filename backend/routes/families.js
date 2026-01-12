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
