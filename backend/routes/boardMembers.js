const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get all board members with family info
router.get('/', async (req, res) => {
  try {
    const { is_active } = req.query;
    
    let query = supabase
      .from('board_members')
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email)
      `)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    const { data, error } = await query;

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create or update board member
router.post('/', async (req, res) => {
  try {
    const boardMemberData = req.body;
    
    // Try to find matching family by email
    if (boardMemberData.email) {
      const { data: family } = await supabase
        .from('families')
        .select('id')
        .or(`primary_contact_email.eq.${boardMemberData.email},parent2_email.eq.${boardMemberData.email}`)
        .single();
      
      if (family) {
        boardMemberData.family_id = family.id;
      }
    }
    
    const { data, error } = await supabase
      .from('board_members')
      .insert([boardMemberData])
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email)
      `)
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update board member
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const boardMemberData = req.body;
    
    // Try to find matching family by email if email changed
    if (boardMemberData.email) {
      const { data: family } = await supabase
        .from('families')
        .select('id')
        .or(`primary_contact_email.eq.${boardMemberData.email},parent2_email.eq.${boardMemberData.email}`)
        .single();
      
      if (family) {
        boardMemberData.family_id = family.id;
      } else {
        boardMemberData.family_id = null;
      }
    }
    
    const { data, error } = await supabase
      .from('board_members')
      .update(boardMemberData)
      .eq('id', id)
      .select(`
        *,
        family:families (family_id, primary_contact_name, primary_contact_email)
      `)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete board member
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from('board_members')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Board member deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import board members from spreadsheet data
router.post('/import', async (req, res) => {
  try {
    const { boardMembers } = req.body;
    
    if (!boardMembers || !Array.isArray(boardMembers)) {
      return res.status(400).json({ error: 'Invalid board members data' });
    }

    const results = [];
    const errors = [];

    for (const [index, member] of boardMembers.entries()) {
      try {
        // Find matching family by email
        let family_id = null;
        if (member.email) {
          const { data: family } = await supabase
            .from('families')
            .select('id')
            .or(`primary_contact_email.eq.${member.email},parent2_email.eq.${member.email}`)
            .single();
          
          if (family) {
            family_id = family.id;
          }
        }

        const boardMemberData = {
          first_name: member.first_name,
          last_name: member.last_name,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          phone: member.phone,
          role: member.role || 'Board Member',
          spouse_first_name: member.spouse_first_name,
          spouse_last_name: member.spouse_last_name,
          spouse_email: member.spouse_email,
          abuse_awareness_completed: member.abuse_awareness_completed === true || member.abuse_awareness_completed === 'Y',
          family_id: family_id,
          is_active: true
        };

        // Check if board member already exists
        const { data: existingMember } = await supabase
          .from('board_members')
          .select('id')
          .eq('email', member.email)
          .single();

        let result;
        if (existingMember) {
          // Update existing member
          const { data } = await supabase
            .from('board_members')
            .update(boardMemberData)
            .eq('id', existingMember.id)
            .select()
            .single();
          result = { ...data, action: 'updated' };
        } else {
          // Create new member
          const { data } = await supabase
            .from('board_members')
            .insert([boardMemberData])
            .select()
            .single();
          result = { ...data, action: 'created' };
        }

        results.push(result);
      } catch (error) {
        errors.push(`Row ${index + 1}: ${error.message}`);
      }
    }

    res.json({
      message: `Processed ${results.length} board members`,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get board members for player agent dropdown
router.get('/player-agents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('board_members')
      .select('id, name, first_name, last_name, email, phone, role')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Equipment Manager contact info
router.get('/equipment-manager', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('board_members')
      .select('id, name, first_name, last_name, email, phone')
      .eq('role', 'Equipment Manager')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(1); // Get the first active Equipment Manager

    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ 
        error: 'No active Equipment Manager found. Please add an Equipment Manager in the Board Members section.' 
      });
    }
    
    res.json(data[0]); // Return the first Equipment Manager
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset yearly compliance statuses (training/background check) for board members
// POST /api/board-members/reset-compliance
// Body (optional): { only_active: true }
router.post('/reset-compliance', async (req, res) => {
  try {
    const { only_active = true } = req.body || {};

    let query = supabase
      .from('board_members')
      .update({
        abuse_awareness_completed: false,
        background_check_completed: false,
        updated_at: new Date().toISOString(),
      });

    if (only_active) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.select('id');

    if (error) throw error;

    res.json({
      message: 'Compliance statuses reset successfully',
      updated_count: Array.isArray(data) ? data.length : 0,
      only_active,
    });
  } catch (error) {
    console.error('Error resetting compliance statuses:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;