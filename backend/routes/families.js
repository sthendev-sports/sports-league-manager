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

// backend/routes/families.js - Add this endpoint
// Replace the entire /merge-tool endpoint (starting from line 76) with:

// Replace the entire /merge-tool endpoint with this improved version:
router.get('/merge-tool', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    if (!season_id) {
      return res.status(400).json({ error: 'season_id is required' });
    }

    console.log('Finding ALL family duplicates (including across seasons)...');

    // 1. Get ALL families (not just those with players in this season)
    const { data: allFamilies, error: familiesError } = await supabase
      .from('families')
      .select(`
        id,
        family_id,
        primary_contact_name,
        primary_contact_email,
        primary_contact_phone,
        parent2_email,
        parent2_phone,
        parent2_first_name,
        parent2_last_name
      `)
      .order('primary_contact_name', { ascending: true });

    if (familiesError) {
      console.error('Database error fetching families:', familiesError);
      throw familiesError;
    }

    console.log(`Found ${allFamilies?.length || 0} total families in database`);

    // 2. Get players for the selected season to show which families have players
    const { data: seasonPlayers, error: playersError } = await supabase
      .from('players')
      .select(`
        id,
        first_name,
        last_name,
        family_id,
        season_id
      `)
      .eq('season_id', season_id);

    if (playersError) {
      console.error('Database error fetching season players:', playersError);
    }

    // 3. Get volunteers for the selected season
    const { data: seasonVolunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select(`
        id,
        name,
        email,
        family_id,
        season_id
      `)
      .eq('season_id', season_id);

    if (volunteersError) {
      console.error('Database error fetching season volunteers:', volunteersError);
    }

    // 4. Create normalization functions with better matching
    const normalizeEmail = (email) => {
      if (!email) return '';
      const normalized = String(email)
        .toLowerCase()
        .trim()
        .replace(/\.(?=.*@gmail\.com)/g, ''); // Remove dots from Gmail addresses
      return normalized;
    };

    const normalizePhone = (phone) => {
      if (!phone) return '';
      // Keep only digits, remove +1, take last 10 digits
      const digits = String(phone).replace(/\D/g, '');
      const cleaned = digits.replace(/^1/, ''); // Remove leading 1 (US country code)
      return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned; // Last 10 digits
    };

    const normalizeName = (name) => {
      if (!name) return '';
      return String(name)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/[^a-z\s]/g, ''); // Remove non-letters for comparison
    };

    // 5. Build enhanced family objects with player/volunteer info
    const enhancedFamilies = (allFamilies || []).map(family => {
      // Find players for this family in the selected season
      const familyPlayers = (seasonPlayers || [])
        .filter(p => p.family_id === family.id)
        .map(p => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`
        }));

      // Find volunteers for this family in the selected season
      const familyVolunteers = (seasonVolunteers || [])
        .filter(v => v.family_id === family.id)
        .map(v => ({
          id: v.id,
          name: v.name
        }));

      // Extract last name from primary contact name for matching
      const primaryNameParts = (family.primary_contact_name || '').split(/\s+/);
      const primaryLastName = primaryNameParts.length > 0 
        ? normalizeName(primaryNameParts[primaryNameParts.length - 1])
        : '';

      const parent2LastName = normalizeName(family.parent2_last_name || '');

      return {
        ...family,
        players: familyPlayers,
        volunteers: familyVolunteers,
        // Add normalized fields for matching
        normalized: {
          primary_email: normalizeEmail(family.primary_contact_email),
          secondary_email: normalizeEmail(family.parent2_email),
          primary_phone: normalizePhone(family.primary_contact_phone),
          secondary_phone: normalizePhone(family.parent2_phone),
          primary_last_name: primaryLastName,
          parent2_last_name: parent2LastName
        }
      };
    });

    // 6. Create indices for matching with multiple strategies
    const emailToFamilies = new Map();
    const phoneToFamilies = new Map();
    const lastNameToFamilies = new Map();

    enhancedFamilies.forEach(family => {
      const familyId = family.id;
      
      // Index by emails (both primary and secondary)
      const emails = [
        family.normalized.primary_email,
        family.normalized.secondary_email
      ].filter(e => e && e.length > 3); // Only index valid emails
      
      emails.forEach(email => {
        if (!emailToFamilies.has(email)) emailToFamilies.set(email, []);
        if (!emailToFamilies.get(email).includes(familyId)) {
          emailToFamilies.get(email).push(familyId);
        }
      });

      // Index by phones (both primary and secondary)
      const phones = [
        family.normalized.primary_phone,
        family.normalized.secondary_phone
      ].filter(p => p && p.length >= 7); // Only index valid phone numbers
      
      phones.forEach(phone => {
        if (!phoneToFamilies.has(phone)) phoneToFamilies.set(phone, []);
        if (!phoneToFamilies.get(phone).includes(familyId)) {
          phoneToFamilies.get(phone).push(familyId);
        }
      });

      // Index by last names (from both primary contact and secondary)
      const lastNames = [
        family.normalized.primary_last_name,
        family.normalized.parent2_last_name
      ].filter(name => name && name.length > 1);
      
      lastNames.forEach(lastName => {
        if (!lastNameToFamilies.has(lastName)) lastNameToFamilies.set(lastName, []);
        if (!lastNameToFamilies.get(lastName).includes(familyId)) {
          lastNameToFamilies.get(lastName).push(familyId);
        }
      });
    });

    // 7. Find duplicate groups using multiple strategies
    const duplicateGroupsMap = new Map(); // group key -> array of family IDs
    const processedFamilies = new Set();

    // Strategy 1: Exact email match
    for (const [email, familyIds] of emailToFamilies.entries()) {
      if (email && familyIds.length > 1) {
        const sortedIds = [...new Set(familyIds)].sort();
        const groupKey = `email:${email}:${sortedIds.join('-')}`;
        if (!duplicateGroupsMap.has(groupKey)) {
          duplicateGroupsMap.set(groupKey, sortedIds);
        }
      }
    }

    // Strategy 2: Exact phone match
    for (const [phone, familyIds] of phoneToFamilies.entries()) {
      if (phone && familyIds.length > 1) {
        const sortedIds = [...new Set(familyIds)].sort();
        const groupKey = `phone:${phone}:${sortedIds.join('-')}`;
        if (!duplicateGroupsMap.has(groupKey)) {
          duplicateGroupsMap.set(groupKey, sortedIds);
        }
      }
    }

    // Strategy 3: Same last name AND same email domain or area code
    for (const [lastName, familyIds] of lastNameToFamilies.entries()) {
      if (lastName && familyIds.length > 1) {
        const families = enhancedFamilies.filter(f => familyIds.includes(f.id));
        
        // Check if they share email domain or phone area code
        const hasConnection = families.some(f1 => 
          families.some(f2 => 
            f1.id !== f2.id && (
              // Same email domain (e.g., both @gmail.com)
              (f1.normalized.primary_email && f2.normalized.primary_email && 
               f1.normalized.primary_email.split('@')[1] === f2.normalized.primary_email.split('@')[1]) ||
              // Same phone area code (first 3 digits)
              (f1.normalized.primary_phone && f2.normalized.primary_phone &&
               f1.normalized.primary_phone.slice(0, 3) === f2.normalized.primary_phone.slice(0, 3))
            )
          )
        );

        if (hasConnection) {
          const sortedIds = [...new Set(familyIds)].sort();
          const groupKey = `name:${lastName}:${sortedIds.join('-')}`;
          if (!duplicateGroupsMap.has(groupKey)) {
            duplicateGroupsMap.set(groupKey, sortedIds);
          }
        }
      }
    }

    // 8. Merge overlapping groups (if families appear in multiple groups)
    const mergedGroups = [];
    const alreadyGrouped = new Set();
    
    for (const familyIds of duplicateGroupsMap.values()) {
      // Skip if all families in this group are already in another group
      if (familyIds.every(id => alreadyGrouped.has(id))) {
        continue;
      }
      
      // Find all families in this group
      const groupFamilies = enhancedFamilies.filter(f => familyIds.includes(f.id));
      
      // Filter out families with no players/volunteers in current season?
      // Optional: you might want to see all duplicates, even those not active in current season
      // const familiesWithActivity = groupFamilies.filter(f => 
      //   f.players.length > 0 || f.volunteers.length > 0
      // );
      
      // if (familiesWithActivity.length > 1) {
      if (groupFamilies.length > 1) {
        mergedGroups.push(groupFamilies);
        familyIds.forEach(id => alreadyGrouped.add(id));
      }
    }

    // 9. Format response
    console.log(`Found ${mergedGroups.length} duplicate groups`);
    
    // Sort groups by number of families (largest first)
    mergedGroups.sort((a, b) => b.length - a.length);
    
    res.json({
      success: true,
      season_id: season_id,
      totalFamilies: allFamilies?.length || 0,
      duplicateGroups: mergedGroups.length,
      duplicates: mergedGroups.map(group => 
        group.map(family => ({
          id: family.id,
          primary_contact_name: family.primary_contact_name,
          primary_contact_email: family.primary_contact_email,
          primary_contact_phone: family.primary_contact_phone,
          parent2_email: family.parent2_email,
          parent2_phone: family.parent2_phone,
          parent2_first_name: family.parent2_first_name,
          parent2_last_name: family.parent2_last_name,
          players: family.players || [],
          volunteers: family.volunteers || []
        }))
      )
    });

  } catch (error) {
    console.error('Merge tool error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add merge endpoint
router.post('/merge', async (req, res) => {
  try {
    const { targetFamilyId, sourceFamilyIds } = req.body;

    // Validate
    if (!targetFamilyId || !Array.isArray(sourceFamilyIds)) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // 1. Update all players from source families to target family
    await supabase
      .from('players')
      .update({ family_id: targetFamilyId })
      .in('family_id', sourceFamilyIds);

    // 2. Update all volunteers from source families to target family
    await supabase
      .from('volunteers')
      .update({ family_id: targetFamilyId })
      .in('family_id', sourceFamilyIds);

    // 3. Delete source families (optional - or mark as merged)
    await supabase
      .from('families')
      .delete()
      .in('id', sourceFamilyIds);

    res.json({
      success: true,
      message: `Merged ${sourceFamilyIds.length} families into ${targetFamilyId}`,
      targetFamilyId
    });

  } catch (error) {
    console.error('Merge error:', error);
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
