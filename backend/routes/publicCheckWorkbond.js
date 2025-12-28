const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

// Public: list players (active season) with division + team for search UI
router.get('/players', async (req, res) => {
  try {
    const { data: activeSeason, error: seasonErr } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single();

    if (seasonErr || !activeSeason) {
      return res.status(500).json({ error: 'Active season not found' });
    }

    // Players with division
    const { data: players, error: playersErr } = await supabase
      .from('players')
      .select('id, first_name, last_name, division_id, team_id')
      .eq('season_id', activeSeason.id);

    if (playersErr) {
      console.error('Error fetching players:', playersErr);
      return res.status(500).json({ error: 'Unable to load players' });
    }

    const divisionIds = Array.from(new Set((players || []).map(p => p.division_id).filter(Boolean)));
    const teamIds = Array.from(new Set((players || []).map(p => p.team_id).filter(Boolean)));

    const [{ data: divisions, error: divErr }, { data: teams, error: teamErr }] = await Promise.all([
      divisionIds.length
        ? supabase.from('divisions').select('id, name').in('id', divisionIds)
        : Promise.resolve({ data: [], error: null }),
      teamIds.length
        ? supabase.from('teams').select('id, name').in('id', teamIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    if (divErr) console.warn('Error fetching divisions:', divErr);
    if (teamErr) console.warn('Error fetching teams:', teamErr);

    const divMap = new Map((divisions || []).map(d => [d.id, d.name]));
    const teamMap = new Map((teams || []).map(t => [t.id, t.name]));

    const output = (players || []).map(p => ({
      player_id: p.id,
      player_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      division_name: divMap.get(p.division_id) || '',
      team_name: teamMap.get(p.team_id) || ''
    }))
    // remove blanks
    .filter(p => p.player_name);

    res.json({ players: output });
  } catch (err) {
    console.error('Unexpected error in GET /players', err);
    res.status(500).json({ error: 'Unexpected error' });
  }
});

// Public: get the message shown after a lookup
router.get('/message', async (req, res) => {
  try {
    console.log('Fetching message from public_page_configs...');
    
    const { data, error } = await supabase
      .from('public_page_configs')
      .select('value, metadata, updated_at')
      .eq('key', 'workbond_public_status_message')
      .maybeSingle();

    console.log('Database query result:', { 
      data_exists: !!data, 
      has_metadata: !!data?.metadata,
      error: error?.message 
    });

    if (error) {
      // Table might not exist yet, return empty message instead of failing
      console.warn('Warning fetching public page config (returning empty):', error?.message || error);
      return res.json({ message: '', allow_html: false });
    }

    let allowHtml = false;
    if (data?.metadata) {
      console.log('Raw metadata from DB:', data.metadata, 'Type:', typeof data.metadata);
      
      if (typeof data.metadata === 'object') {
        allowHtml = Boolean(data.metadata.allow_html);
        console.log('Parsed metadata object, allow_html:', allowHtml);
      } else if (typeof data.metadata === 'string') {
        try {
          const parsed = JSON.parse(data.metadata);
          allowHtml = Boolean(parsed.allow_html);
          console.log('Parsed metadata string, allow_html:', allowHtml);
        } catch (e) {
          console.warn('Failed to parse metadata JSON:', e);
        }
      }
    } else {
      console.log('No metadata found in database record');
    }

    console.log('Returning:', { 
      message: data?.value || '', 
      allow_html: allowHtml,
      has_metadata: !!data?.metadata
    });

    res.json({ 
      message: data?.value || '', 
      allow_html: allowHtml 
    });
  } catch (err) {
    console.error('Unexpected error in GET /message', err);
    return res.json({ message: '', allow_html: false });
  }
});

// Public: check workbond status for a player after validating contact
router.post('/status', async (req, res) => {
  try {
    const { player_id, contact } = req.body || {};
    if (!player_id || !contact) {
      return res.status(400).json({ error: 'player_id and contact are required' });
    }

    const { data: activeSeason, error: seasonErr } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single();

    if (seasonErr || !activeSeason) {
      return res.status(500).json({ error: 'Active season not found' });
    }

    // Load player with family_id and division/team for echoing back
    const { data: player, error: playerErr } = await supabase
      .from('players')
      .select('id, first_name, last_name, family_id, division_id, team_id')
      .eq('id', player_id)
      .eq('season_id', activeSeason.id)
      .single();

    if (playerErr || !player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    if (!player.family_id) {
      return res.status(400).json({ error: 'Player is not linked to a family yet. Please contact the league.' });
    }

    const contactEmail = String(contact).trim().toLowerCase();
    const contactPhone = String(contact).includes('@') ? '' : String(contact).trim();
    const contactPhoneNorm = normalizePhone(contactPhone);

    // Get the family to check for contact emails and phones
    const { data: family, error: familyErr } = await supabase
      .from('families')
      .select('id, primary_contact_email, primary_contact_phone, parent2_email, parent2_phone')
      .eq('id', player.family_id)
      .single();

    if (familyErr) {
      console.error('Error fetching family:', familyErr);
      return res.status(500).json({ error: 'Unable to load family information' });
    }

    // Validate using family emails/phones OR volunteers in the same family
    let isContactValid = false;
    
    // Check family emails first
    const familyEmails = [
      family.primary_contact_email,
      family.parent2_email
    ].filter(email => email && email.trim()).map(email => email.toLowerCase().trim());
    
    // Check family phones
    const familyPhones = [
      family.primary_contact_phone,
      family.parent2_phone
    ].filter(phone => phone && phone.trim()).map(phone => normalizePhone(phone));
    
    // Check if contact matches any family email
    if (contactEmail && familyEmails.includes(contactEmail)) {
      isContactValid = true;
    }
    
    // Check if contact matches any family phone (normalized)
    if (contactPhoneNorm && familyPhones.includes(contactPhoneNorm)) {
      isContactValid = true;
    }
    
    // If not valid via family contacts, check volunteers
    if (!isContactValid) {
      const { data: familyVolunteers, error: volErr } = await supabase
        .from('volunteers')
        .select('email, phone')
        .eq('season_id', activeSeason.id)
        .eq('family_id', player.family_id);

      if (volErr) {
        console.error('Error fetching volunteers:', volErr);
      } else {
        const volunteerMatches = (familyVolunteers || []).some(v => {
          const emailMatch = v.email && (v.email || '').toLowerCase() === contactEmail;
          const phoneMatch = contactPhoneNorm && v.phone && normalizePhone(v.phone) === contactPhoneNorm;
          return emailMatch || phoneMatch;
        });
        
        if (volunteerMatches) {
          isContactValid = true;
        }
      }
    }

    if (!isContactValid) {
      return res.status(403).json({ 
        error: 'Verification failed. Please use an email or phone number on file for this family.' 
      });
    }

    // Compute completed shifts (sum spots_completed for the family)
    const { data: shifts, error: shiftsErr } = await supabase
      .from('workbond_shifts')
      .select('spots_completed')
      .eq('season_id', activeSeason.id)
      .eq('family_id', player.family_id);

    if (shiftsErr) {
      console.error('Error fetching workbond shifts:', shiftsErr);
      // Don't return error here, just log it
    }

    const completed = (shifts || []).reduce((sum, s) => sum + (Number(s.spots_completed) || 0), 0);

    // Get family exemption status - check board members and volunteer roles
    let isExempt = false;
    let exemptReason = '';
    
    try {
      // Check board members - ANY board member means exempt
      const { data: boardMembers, error: boardErr } = await supabase
        .from('board_members')
        .select('id, role')
        .eq('family_id', player.family_id);

      if (boardErr) {
        console.warn('Error checking board members:', boardErr);
      } else if (boardMembers && boardMembers.length > 0) {
        isExempt = true;
        exemptReason = `Board Member (${boardMembers[0].role})`;
      }
      
      // Check volunteers - specific roles are exempt
      if (!isExempt) {
        const { data: volunteers, error: volErr2 } = await supabase
          .from('volunteers')
          .select('id, role')
          .eq('season_id', activeSeason.id)
          .eq('family_id', player.family_id);

        if (volErr2) {
          console.warn('Error checking volunteers:', volErr2);
        } else if (volunteers && volunteers.length > 0) {
          // List of volunteer roles that are exempt from workbond
          const exemptVolunteerRoles = [
            'Head Coach',
            'Assistant Coach',
            'Coach',
            'Team Manager',
            'Volunteer Coordinator',
            'Division Coordinator',
            'League Official'
          ];
          
          const exemptVolunteer = volunteers.find(v => {
            if (!v.role) return false;
            const volunteerRole = v.role.toLowerCase();
            return exemptVolunteerRoles.some(exemptRole => 
              volunteerRole.includes(exemptRole.toLowerCase())
            );
          });
          
          if (exemptVolunteer) {
            isExempt = true;
            exemptReason = `Volunteer (${exemptVolunteer.role})`;
          }
        }
      }
    } catch (exemptionErr) {
      console.error('Error checking exemption status:', exemptionErr);
      // Continue without exemption
    }

    let required = 0;

    if (isExempt) {
      required = 0;
      console.log(`Family ${player.family_id} is exempt: ${exemptReason}`);
    } else {
      // Not exempt, check division requirements
      const { data: familyPlayers, error: famPlayersErr } = await supabase
        .from('players')
        .select('division_id')
        .eq('season_id', activeSeason.id)
        .eq('family_id', player.family_id);

      if (famPlayersErr) {
        console.error('Error fetching family players:', famPlayersErr);
        // Continue with required = 0
      } else {
        const divIds = Array.from(new Set((familyPlayers || []).map(p => p.division_id).filter(Boolean)));

        // If no division ids, required stays 0
        if (divIds.length) {
          // Choose the "highest" division by sort_order if present, else by id
          const { data: divisions, error: divErr } = await supabase
            .from('divisions')
            .select('id, sort_order')
            .in('id', divIds);

          if (divErr) {
            console.warn('Error fetching divisions sort_order:', divErr);
          }

          const orderMap = new Map((divisions || []).map(d => [d.id, d.sort_order ?? 0]));
          const highestDivId = divIds.slice().sort((a, b) => (orderMap.get(b) || 0) - (orderMap.get(a) || 0))[0];

          const { data: reqRow, error: reqErr } = await supabase
            .from('workbond_requirements')
            .select('shifts_required')
            .eq('season_id', activeSeason.id)
            .eq('division_id', highestDivId)
            .maybeSingle();

          if (reqErr) {
            console.warn('Error fetching requirement:', reqErr);
          }
          required = Number(reqRow?.shifts_required) || 0;
        }
      }
    }

    const remaining = Math.max(0, required - completed);

    // Get division and team names
    let divisionName = '';
    let teamName = '';
    
    try {
      if (player.division_id) {
        const { data: divisionData } = await supabase
          .from('divisions')
          .select('name')
          .eq('id', player.division_id)
          .maybeSingle();
        divisionName = divisionData?.name || '';
      }
      
      if (player.team_id) {
        const { data: teamData } = await supabase
          .from('teams')
          .select('name')
          .eq('id', player.team_id)
          .maybeSingle();
        teamName = teamData?.name || '';
      }
    } catch (nameErr) {
      console.warn('Error fetching division/team names:', nameErr);
    }

    // Get message from public_page_configs table
    let publicMessage = '';
    let allowHtml = false;
    try {
      const { data: msgRow } = await supabase
        .from('public_page_configs')
        .select('value, metadata')
        .eq('key', 'workbond_public_status_message')
        .maybeSingle();
      
      publicMessage = msgRow?.value || '';
      
      // Extract allow_html from metadata - handle both old and new formats
      if (msgRow?.metadata) {
        if (typeof msgRow.metadata === 'object') {
          allowHtml = Boolean(msgRow.metadata.allow_html);
        } else if (typeof msgRow.metadata === 'string') {
          try {
            const parsed = JSON.parse(msgRow.metadata);
            allowHtml = Boolean(parsed.allow_html);
          } catch (e) {
            console.warn('Failed to parse metadata JSON:', e);
          }
        }
      }
    } catch (msgErr) {
      console.warn('Error fetching message:', msgErr);
    }

    res.json({
      player: {
        player_id: player.id,
        player_name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
        division_name: divisionName,
        team_name: teamName
      },
      required_shifts: required,
      completed_shifts: completed,
      remaining_shifts: remaining,
      message: publicMessage,
      allow_html: allowHtml,
      exempt: isExempt,
      exempt_reason: exemptReason
    });
  } catch (err) {
    console.error('Unexpected error in POST /status', err);
    res.status(500).json({ error: 'Unexpected error: ' + err.message });
  }
});

// Admin/President: update the message
router.put('/message', authMiddleware, async (req, res) => {
  try {
    // First check if user is authenticated (authMiddleware should handle this)
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const role = req.user?.role;
    const allowed = [ROLES.ADMIN, ROLES.PRESIDENT, ROLES.ADMINISTRATOR];
    if (!allowed.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: Admin or President role required' });
    }

    const { message, allow_html = false } = req.body || {};
    if (typeof message !== 'string') {
      return res.status(400).json({ error: 'message must be a string' });
    }

    // First, get existing metadata to preserve any other fields
    const { data: existing, error: fetchError } = await supabase
      .from('public_page_configs')
      .select('metadata')
      .eq('key', 'workbond_public_status_message')
      .maybeSingle();

    let metadata = {};
    if (!fetchError && existing?.metadata) {
      // If metadata exists, preserve it
      if (typeof existing.metadata === 'object') {
        metadata = { ...existing.metadata };
      } else if (typeof existing.metadata === 'string') {
        try {
          metadata = JSON.parse(existing.metadata);
        } catch (e) {
          console.warn('Failed to parse existing metadata:', e);
        }
      }
    }
    
    // Update the allow_html flag
    metadata.allow_html = Boolean(allow_html);
    
    console.log('Saving message with metadata:', { 
      message_length: message.length,
      allow_html: metadata.allow_html,
      full_metadata: metadata 
    });

    // Use upsert to insert or update the message in public_page_configs table
    const { error } = await supabase
      .from('public_page_configs')
      .upsert({ 
        key: 'workbond_public_status_message', 
        value: message,
        metadata: metadata,
        updated_at: new Date().toISOString()
      }, { 
        onConflict: 'key',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error saving public page config:', error);
      
      // If table doesn't exist, provide helpful error
      if (error.code === '42P01') {
        return res.status(500).json({ 
          error: 'Public page configs table does not exist. Please create the table with: CREATE TABLE public.public_page_configs (key text PRIMARY KEY, value text, metadata jsonb, updated_at timestamp DEFAULT now())' 
        });
      }
      
      return res.status(500).json({ error: 'Unable to save message: ' + error.message });
    }

    res.json({ 
      success: true,
      message: message,
      allow_html: allow_html
    });
  } catch (err) {
    console.error('Unexpected error in PUT /message', err);
    res.status(500).json({ error: 'Unexpected error: ' + err.message });
  }
});

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = router;