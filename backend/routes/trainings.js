const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// GET all training types
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    
    let query = supabase
      .from('trainings')
      .select('*')
      .order('name', { ascending: true });

    if (category) {
      if (category === 'volunteer') {
        query = query.or('category.eq.volunteer,category.eq.both');
      } else if (category === 'board_member') {
        query = query.or('category.eq.board_member,category.eq.both');
      }
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching trainings:', error);
    res.status(500).json({ error: 'Failed to fetch trainings' });
  }
});

// GET training by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('trainings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Training not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching training:', error);
    res.status(500).json({ error: 'Failed to fetch training' });
  }
});

// CREATE new training
router.post('/', async (req, res) => {
  try {
    const { name, description, expires_in_days, expires_on_date, category, is_required } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Training name is required' });
    }

    if (!category || !['volunteer', 'board_member', 'both'].includes(category)) {
      return res.status(400).json({ error: 'Valid category is required (volunteer, board_member, or both)' });
    }

    // Validate expiration type
    if (expires_in_days && expires_on_date) {
      return res.status(400).json({ error: 'Cannot set both expires_in_days and expires_on_date' });
    }

    const { data, error } = await supabase
      .from('trainings')
      .insert([{
        name: name.trim(),
        description: description || null,
        expires_in_days: expires_in_days || null,
        expires_on_date: expires_on_date || null,
        category: category,
        is_required: is_required || false,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error creating training:', error);
    res.status(500).json({ error: 'Failed to create training' });
  }
});

// UPDATE training
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, expires_in_days, expires_on_date, category, is_required } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Training name is required' });
    }

    // Validate expiration type
    if (expires_in_days && expires_on_date) {
      return res.status(400).json({ error: 'Cannot set both expires_in_days and expires_on_date' });
    }

    const { data, error } = await supabase
      .from('trainings')
      .update({
        name: name.trim(),
        description: description || null,
        expires_in_days: expires_in_days || null,
        expires_on_date: expires_on_date || null,
        category: category,
        is_required: is_required || false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Training not found' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error updating training:', error);
    res.status(500).json({ error: 'Failed to update training' });
  }
});

// DELETE training
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if training is assigned to any volunteers or board members
    const { data: volunteerTrainings, error: vtError } = await supabase
      .from('volunteer_trainings')
      .select('id')
      .eq('training_id', id)
      .limit(1);

    if (vtError) throw vtError;
    
    const { data: boardMemberTrainings, error: bmtError } = await supabase
      .from('board_member_trainings')
      .select('id')
      .eq('training_id', id)
      .limit(1);

    if (bmtError) throw bmtError;
    
    if ((volunteerTrainings && volunteerTrainings.length > 0) || 
        (boardMemberTrainings && boardMemberTrainings.length > 0)) {
      return res.status(400).json({ 
        error: 'Cannot delete training that has been assigned to volunteers or board members. Please unassign first.' 
      });
    }
    
    const { data, error } = await supabase
      .from('trainings')
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: 'Training not found' });
    }
    
    res.json({ message: 'Training deleted successfully' });
  } catch (error) {
    console.error('Error deleting training:', error);
    res.status(500).json({ error: 'Failed to delete training' });
  }
});

// Clear specific training from all volunteers or board members
router.post('/clear-training', async (req, res) => {
  try {
    const { training_id, target_type } = req.body;
    
    if (!training_id || !target_type) {
      return res.status(400).json({ error: 'Training ID and target type are required' });
    }

    if (!['volunteers', 'board_members', 'all'].includes(target_type)) {
      return res.status(400).json({ error: 'Target type must be volunteers, board_members, or all' });
    }

    let clearedCount = 0;

    // Clear from volunteers
    if (target_type === 'volunteers' || target_type === 'all') {
      const { error: vError } = await supabase
        .from('volunteer_trainings')
        .delete()
        .eq('training_id', training_id);

      if (vError) throw vError;
      
      // Count cleared records
      const { count } = await supabase
        .from('volunteer_trainings')
        .select('*', { count: 'exact', head: true })
        .eq('training_id', training_id);
      
      clearedCount += count || 0;
    }

    // Clear from board members
    if (target_type === 'board_members' || target_type === 'all') {
      const { error: bError } = await supabase
        .from('board_member_trainings')
        .delete()
        .eq('training_id', training_id);

      if (bError) throw bError;
      
      // Count cleared records
      const { count } = await supabase
        .from('board_member_trainings')
        .select('*', { count: 'exact', head: true })
        .eq('training_id', training_id);
      
      clearedCount += count || 0;
    }

    res.json({
      message: `Training cleared successfully from ${target_type}`,
      cleared_count: clearedCount
    });
  } catch (error) {
    console.error('Error clearing training:', error);
    res.status(500).json({ error: 'Failed to clear training' });
  }
});

// Check and update expired trainings
router.post('/check-expirations', async (req, res) => {
  try {
    const { target_type } = req.body;
    
    if (!target_type || !['volunteers', 'board_members', 'all'].includes(target_type)) {
      return res.status(400).json({ error: 'Valid target type is required' });
    }

    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let updatedCount = 0;

    // Get all trainings
    const { data: trainings, error: tError } = await supabase
      .from('trainings')
      .select('id, expires_in_days, expires_on_date')
      .or('expires_in_days.not.is.null,expires_on_date.not.is.null');

    if (tError) throw tError;

    for (const training of trainings || []) {
      if (training.expires_in_days) {
        // Calculate cutoff date for days-based expiration
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - training.expires_in_days);
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

        // Update volunteer trainings (days-based)
        if (target_type === 'volunteers' || target_type === 'all') {
          const { error: vError } = await supabase
            .from('volunteer_trainings')
            .update({ 
              status: 'expired',
              updated_at: new Date().toISOString()
            })
            .eq('training_id', training.id)
            .eq('status', 'completed')
            .lt('completed_date', cutoffDateStr);

          if (vError) throw vError;
        }

        // Update board member trainings (days-based)
        if (target_type === 'board_members' || target_type === 'all') {
          const { error: bError } = await supabase
            .from('board_member_trainings')
            .update({ 
              status: 'expired',
              updated_at: new Date().toISOString()
            })
            .eq('training_id', training.id)
            .eq('status', 'completed')
            .lt('completed_date', cutoffDateStr);

          if (bError) throw bError;
        }
      }
      
      if (training.expires_on_date) {
        // Date-based expiration: if current date is past expires_on_date, mark as expired
        const today = new Date().toISOString().split('T')[0];
        
        if (today > training.expires_on_date) {
          // Update volunteer trainings (date-based)
          if (target_type === 'volunteers' || target_type === 'all') {
            const { error: vError } = await supabase
              .from('volunteer_trainings')
              .update({ 
                status: 'expired',
                updated_at: new Date().toISOString()
              })
              .eq('training_id', training.id)
              .eq('status', 'completed');

            if (vError) throw vError;
          }

          // Update board member trainings (date-based)
          if (target_type === 'board_members' || target_type === 'all') {
            const { error: bError } = await supabase
              .from('board_member_trainings')
              .update({ 
                status: 'expired',
                updated_at: new Date().toISOString()
              })
              .eq('training_id', training.id)
              .eq('status', 'completed');

            if (bError) throw bError;
          }
        }
      }
    }

    res.json({
      message: 'Expiration check completed',
      target_type: target_type
    });
  } catch (error) {
    console.error('Error checking expirations:', error);
    res.status(500).json({ error: 'Failed to check expirations' });
  }
});

// Get volunteer's trainings
router.get('/volunteer/:volunteer_id', async (req, res) => {
  try {
    const { volunteer_id } = req.params;
    
    const { data, error } = await supabase
      .from('volunteer_trainings')
      .select(`
        *,
        training:trainings (*)
      `)
      .eq('volunteer_id', volunteer_id);

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching volunteer trainings:', error);
    res.status(500).json({ error: 'Failed to fetch volunteer trainings' });
  }
});

// Update volunteer's trainings
router.post('/volunteer/:volunteer_id', async (req, res) => {
  try {
    const { volunteer_id } = req.params;
    const { trainings } = req.body; // Array of {training_id, completed_date, status}
    
    if (!Array.isArray(trainings)) {
      return res.status(400).json({ error: 'Trainings array is required' });
    }

    // Delete existing trainings for this volunteer
    const { error: deleteError } = await supabase
      .from('volunteer_trainings')
      .delete()
      .eq('volunteer_id', volunteer_id);

    if (deleteError) throw deleteError;

    // Insert new trainings if any
    if (trainings.length > 0) {
      const trainingRecords = trainings.map(training => ({
        volunteer_id: volunteer_id,
        training_id: training.training_id,
        completed_date: training.completed_date || null,
        status: training.status || 'pending',
        created_at: new Date().toISOString()
      }));

      const { data, error: insertError } = await supabase
        .from('volunteer_trainings')
        .insert(trainingRecords)
        .select(`
          *,
          training:trainings (*)
        `);

      if (insertError) throw insertError;
      res.json(data || []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error updating volunteer trainings:', error);
    res.status(500).json({ error: 'Failed to update volunteer trainings' });
  }
});

// Get board member's trainings
router.get('/board-member/:board_member_id', async (req, res) => {
  try {
    const { board_member_id } = req.params;
    
    const { data, error } = await supabase
      .from('board_member_trainings')
      .select(`
        *,
        training:trainings (*)
      `)
      .eq('board_member_id', board_member_id);

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching board member trainings:', error);
    res.status(500).json({ error: 'Failed to fetch board member trainings' });
  }
});

// Update board member's trainings
router.post('/board-member/:board_member_id', async (req, res) => {
  try {
    const { board_member_id } = req.params;
    const { trainings } = req.body;
    
    if (!Array.isArray(trainings)) {
      return res.status(400).json({ error: 'Trainings array is required' });
    }

    // Delete existing trainings for this board member
    const { error: deleteError } = await supabase
      .from('board_member_trainings')
      .delete()
      .eq('board_member_id', board_member_id);

    if (deleteError) throw deleteError;

    // Insert new trainings if any
    if (trainings.length > 0) {
      const trainingRecords = trainings.map(training => ({
        board_member_id: board_member_id,
        training_id: training.training_id,
        completed_date: training.completed_date || null,
        status: training.status || 'pending',
        created_at: new Date().toISOString()
      }));

      const { data, error: insertError } = await supabase
        .from('board_member_trainings')
        .insert(trainingRecords)
        .select(`
          *,
          training:trainings (*)
        `);

      if (insertError) throw insertError;
      res.json(data || []);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error updating board member trainings:', error);
    res.status(500).json({ error: 'Failed to update board member trainings' });
  }
});

module.exports = router;