// backend/routes/notifications.js

const express = require('express');
const router = express.Router();
const supabase = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');
const { sendEmail } = require('../services/emailService');

// Helpers
function calculateAge(birthDateStr) {
  if (!birthDateStr) return '';
  const d = new Date(birthDateStr);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age;
}

function escapeHtml(str) {
  return (str || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(str) {
  return (str || '').trim().toLowerCase();
}

// All notification routes require auth + admin/president
router.use(authMiddleware);
router.use(requireRole(ROLES.ADMINISTRATOR, ROLES.PRESIDENT));

/**
 * POST /api/notifications/send-late-add-equipment-manager
 *
 * Body: { season_id: string, team_id: string, player_id: string }
 *
 * Sends a targeted "late add" email to the Equipment Manager
 * Includes team info, manager info, and player uniform details
 */
router.post('/send-late-add-equipment-manager', async (req, res) => {
  try {
    const { season_id, team_id, player_id } = req.body || {};

    if (!season_id) return res.status(400).json({ error: 'season_id is required.' });
    if (!team_id) return res.status(400).json({ error: 'team_id is required.' });
    if (!player_id) return res.status(400).json({ error: 'player_id is required.' });

    // 1) Get Equipment Manager contact from board_members
    const { data: equipmentManager, error: emError } = await supabase
      .from('board_members')
      .select('id, name, first_name, last_name, email, phone')
      .eq('role', 'Equipment Manager')
      .eq('is_active', true)
      .order('last_name', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emError) throw emError;
    if (!equipmentManager) {
      return res.status(404).json({
        error: 'No active Equipment Manager found. Please add an Equipment Manager in the Board Members section.'
      });
    }

    const equipmentManagerEmail = equipmentManager.email;
    const equipmentManagerName =
      equipmentManager.name ||
      `${equipmentManager.first_name || ''} ${equipmentManager.last_name || ''}`.trim();

    // 2) Load team + division info
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(
        `
        id,
        name,
        color,
        season_id,
        division_id,
        division:divisions (id, name)
      `
      )
      .eq('id', team_id)
      .maybeSingle();

    if (teamError) throw teamError;
    if (!team) return res.status(404).json({ error: 'Team not found.' });
    if (team.season_id !== season_id) {
      return res.status(400).json({
        error: 'Team does not belong to the provided season_id.'
      });
    }

    const divisionName = team.division?.name || 'Unknown Division';

    // 3) Load team manager info
    const { data: teamVolunteers, error: volsError } = await supabase
      .from('volunteers')
      .select('id, name, email, phone, role')
      .eq('season_id', season_id)
      .eq('team_id', team_id);

    if (volsError) throw volsError;

    // Find manager(s)
    const managers = (teamVolunteers || []).filter(
      (v) => v.role && v.role.toLowerCase().includes('manager')
    );

    let managerName = 'Not assigned';
    let managerEmail = 'Not assigned';
    let managerPhone = 'Not assigned';

    if (managers.length > 0) {
      const manager = managers[0];
      managerName = manager.name || 'Not assigned';
      managerEmail = manager.email || 'Not assigned';
      managerPhone = manager.phone || 'Not assigned';
    }

    // 4) Load the new player with uniform info
    const { data: newPlayer, error: newPlayerError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        uniform_shirt_size,
        uniform_pants_size,
        team_id
      `
      )
      .eq('id', player_id)
      .maybeSingle();

    if (newPlayerError) throw newPlayerError;
    if (!newPlayer) return res.status(404).json({ error: 'Player not found.' });
    if (newPlayer.team_id !== team_id) {
      return res.status(400).json({
        error:
          'This player is not currently assigned to the provided team_id. Please assign the player first, then send the late-add email.',
      });
    }

    const playerName =
      `${newPlayer.first_name || ''} ${newPlayer.last_name || ''}`.trim();

    const uniformShirt =
      newPlayer.uniform_shirt_size || 'Not specified';

    const uniformPants =
      newPlayer.uniform_pants_size || 'Not specified';

    // 5) Build email
    const subject =
      `Equipment Order - New Player Added - ${divisionName} - ${team.name}`;

    let text = '';
    text += `Hello ${equipmentManagerName},\n\n`;
    text += `A NEW PLAYER has been added and requires uniform equipment.\n\n`;
    text += `NEW PLAYER ADDED\n\n`;
    text += `Division: ${divisionName}\n`;
    text += `Team: ${team.name}\n`;

    if (team.color) {
      text += `Color: ${team.color}\n`;
    }

    text += `Manager Name: ${managerName}\n`;
    text += `Manager Email: ${managerEmail}\n`;
    text += `Manager Phone Number: ${managerPhone}\n\n`;
    text += `Player Name, Uniform Shirt, Uniform Pants\n`;
    text += `----------------------------------------\n`;
    text += `${playerName}, ${uniformShirt}, ${uniformPants}\n`;

    let html = '';

    html += `<p>Hello ${escapeHtml(equipmentManagerName)},</p>`;

    html +=
      `<p><strong>A NEW PLAYER has been added and requires uniform equipment.</strong></p>`;

    html +=
      `<h3 style="margin-top:16px; margin-bottom:8px;">NEW PLAYER ADDED</h3>`;

    html +=
      `<table style="border-collapse: collapse; width: 100%; font-size: 14px; margin-top: 8px;">`;

    html +=
      `<tr><td style="padding: 4px 8px; font-weight: bold;">Division:</td>` +
      `<td style="padding: 4px 8px;">${escapeHtml(divisionName)}</td></tr>`;

    html +=
      `<tr><td style="padding: 4px 8px; font-weight: bold;">Team:</td>` +
      `<td style="padding: 4px 8px;">${escapeHtml(team.name)}</td></tr>`;

    if (team.color) {
      html +=
        `<tr><td style="padding: 4px 8px; font-weight: bold;">Color:</td>` +
        `<td style="padding: 4px 8px;">${escapeHtml(team.color)}</td></tr>`;
    }

    html +=
      `<tr><td style="padding: 4px 8px; font-weight: bold;">Manager Name:</td>` +
      `<td style="padding: 4px 8px;">${escapeHtml(managerName)}</td></tr>`;

    html +=
      `<tr><td style="padding: 4px 8px; font-weight: bold;">Manager Email:</td>` +
      `<td style="padding: 4px 8px;">${escapeHtml(managerEmail)}</td></tr>`;

    html +=
      `<tr><td style="padding: 4px 8px; font-weight: bold;">Manager Phone Number:</td>` +
      `<td style="padding: 4px 8px;">${escapeHtml(managerPhone)}</td></tr>`;

    html += `</table>`;

    html +=
      `<h4 style="margin-top:20px; margin-bottom:8px;">Player Uniform Details</h4>`;

    html +=
      `<table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px; border: 1px solid #d1d5db;">`;

    html += `<thead><tr>`;

    html +=
      `<th style="border: 1px solid #d1d5db; padding: 8px; background:#f9fafb; text-align:left;">Player Name</th>`;

    html +=
      `<th style="border: 1px solid #d1d5db; padding: 8px; background:#f9fafb; text-align:left;">Uniform Shirt</th>`;

    html +=
      `<th style="border: 1px solid #d1d5db; padding: 8px; background:#f9fafb; text-align:left;">Uniform Pants</th>`;

    html += `</tr></thead>`;

    html += `<tbody><tr style="background:#ecfeff;">`;

    html +=
      `<td style="border: 1px solid #e5e7eb; padding: 8px;"><strong>${escapeHtml(playerName)}</strong></td>`;

    html +=
      `<td style="border: 1px solid #e5e7eb; padding: 8px;">${escapeHtml(uniformShirt)}</td>`;

    html +=
      `<td style="border: 1px solid #e5e7eb; padding: 8px;">${escapeHtml(uniformPants)}</td>`;

    html += `</tr></tbody>`;
    html += `</table>`;

    html +=
      `<p style="margin-top: 16px; color: #6b7280; font-size: 12px;">`;

    html +=
      `Note: This player was added as a late registration and needs to be provided with team uniform equipment.`;

    html += `</p>`;

    html +=
      `<p>Thank you,<br/>Sayreville Little League</p>`;

    await sendEmail({
      to: equipmentManagerEmail,
      subject,
      text,
      html
    });

    return res.json({
      success: true,
      sent: {
        equipment_manager_name: equipmentManagerName,
        equipment_manager_email: equipmentManagerEmail,
        division_id: team.division_id,
        division_name: divisionName,
        team_id: team.id,
        team_name: team.name,
        manager_name: managerName,
        manager_email: managerEmail,
        manager_phone: managerPhone,
        player_id: newPlayer.id,
        player_name: playerName,
        uniform_shirt: uniformShirt,
        uniform_pants: uniformPants,
      },
    });
  } catch (error) {
    console.error(
      'Error in POST /api/notifications/send-late-add-equipment-manager:',
      error
    );

    return res.status(500).json({
      error: 'Failed to send equipment manager email',
      details: error?.message || String(error),
    });
  }
});

/**
 * POST /api/notifications/send-manager-rosters
 *
 * Body: { season_id: string, division_id?: string }
 *
 * For the given season (and optional division), this:
 *  - Finds all teams
 *  - Loads players + family contacts
 *  - Loads volunteers (to find managers and other roles)
 *  - Sends each team's manager an email with a table roster
 *  - Honors email test mode (via sendEmail)
 */
router.post('/send-manager-rosters', async (req, res) => {
  try {
    const { season_id, division_id } = req.body || {};

    if (!season_id) {
      return res
        .status(400)
        .json({
          error: 'season_id is required to send manager rosters.'
        });
    }

    // 1) Load teams for this season/division
    let teamQuery = supabase
      .from('teams')
      .select(
        `
        id,
        name,
        color,
        season_id,
        division_id,
        division:divisions (name)
      `
      )
      .eq('season_id', season_id)
      .order('name', { ascending: true });

    if (division_id) {
      teamQuery = teamQuery.eq('division_id', division_id);
    }

    const { data: teams, error: teamsError } = await teamQuery;

    if (teamsError) {
      console.error(
        '[Notifications] Error fetching teams for manager rosters:',
        teamsError
      );
      throw teamsError;
    }

    if (!teams || teams.length === 0) {
      return res.json({
        success: true,
        message: 'No teams found for the given season/division.',
        sent: [],
      });
    }

    const teamIds = teams.map((t) => t.id);

    // 2) Load players for these teams, including family contacts + medical
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        gender,
        birth_date,
        is_new_player,
        is_travel_player,
        uniform_shirt_size,
        uniform_pants_size,
        medical_conditions,
        team_id,
        family_id,
        family:families (
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `
      )
      .in('team_id', teamIds);

    if (playersError) {
      console.error(
        '[Notifications] Error fetching players for manager rosters:',
        playersError
      );

      // We still try to continue, but rosters may be empty
    }

    const playersByTeam = {};

    (players || []).forEach((p) => {
      if (!p.team_id) return;

      if (!playersByTeam[p.team_id]) {
        playersByTeam[p.team_id] = [];
      }

      playersByTeam[p.team_id].push(p);
    });

    // 3) Load ALL volunteers for the season.
    //
    // IMPORTANT:
    // We intentionally do NOT restrict this query to team_id.
    //
    // A guardian may have registered only as a volunteer and then been
    // manually linked to the player's family using the Family Link feature.
    //
    // In that situation, family_id is the authoritative relationship even
    // if the person was never stored in families.parent2_*.
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select(
        'id, name, email, phone, team_id, season_id, role, family_id'
      )
      .eq('season_id', season_id);

    if (volunteersError) {
      console.error(
        '[Notifications] Error fetching volunteers for manager rosters:',
        volunteersError
      );

      throw volunteersError;
    }

    const volunteersByTeam = {};
    const volunteersByFamily = {};

    (volunteers || []).forEach((v) => {
      if (v.team_id) {
        if (!volunteersByTeam[v.team_id]) {
          volunteersByTeam[v.team_id] = [];
        }

        volunteersByTeam[v.team_id].push(v);
      }

      if (v.family_id) {
        if (!volunteersByFamily[v.family_id]) {
          volunteersByFamily[v.family_id] = [];
        }

        volunteersByFamily[v.family_id].push(v);
      }
    });

    function samePerson(name, email, volunteer) {
      const nName = normalize(name);
      const nEmail = normalize(email);

      const vName = normalize(volunteer?.name);
      const vEmail = normalize(volunteer?.email);

      return Boolean(
        (nEmail && vEmail && nEmail === vEmail) ||
        (nName && vName && nName === vName)
      );
    }

    // If the family registration has no Guardian 2, use a volunteer who
    // was manually linked to the same family.
    //
    // We prefer a volunteer assigned to this player's team and someone
    // who has an actual draft volunteer role.
    //
    // This is ONLY for constructing the roster email. It does NOT modify
    // the families table or turn the volunteer into Guardian 2 in Supabase.
    function getRosterGuardians(player, teamId) {
      const family = player.family || {};

      const g1 = {
        name: family.primary_contact_name || '',
        email: family.primary_contact_email || '',
        phone: family.primary_contact_phone || '',
      };

      const g2 = {
        name:
          `${family.parent2_first_name || ''} ` +
          `${family.parent2_last_name || ''}`.trim(),
        email: family.parent2_email || '',
        phone: family.parent2_phone || '',
      };

      if (
        !g2.name &&
        !g2.email &&
        !g2.phone &&
        player.family_id
      ) {
        const candidates =
          (volunteersByFamily[player.family_id] || [])
            .filter(
              (v) => !samePerson(g1.name, g1.email, v)
            )
            .filter(
              (v) => v.name || v.email || v.phone
            )
            .sort((a, b) => {
              const score = (v) =>
                (String(v.team_id) === String(teamId) ? 100 : 0) +
                (
                  v.role &&
                  normalize(v.role) !== 'parent'
                    ? 50
                    : 0
                ) +
                (v.email ? 10 : 0) +
                (v.phone ? 5 : 0);

              return score(b) - score(a);
            });

        const linkedGuardian = candidates[0];

        if (linkedGuardian) {
          g2.name = linkedGuardian.name || '';
          g2.email = linkedGuardian.email || '';
          g2.phone = linkedGuardian.phone || '';
        }
      }

      return { g1, g2 };
    }

    // Helper: get manager volunteers for a team
    function getTeamManagers(teamId) {
      const teamVols = volunteersByTeam[teamId] || [];

      return teamVols.filter(
        (v) =>
          v.role &&
          v.role.toLowerCase().includes('manager')
      );
    }

    // Family links are authoritative for volunteer-role association.
    //
    // Name/email matching remains as a fallback for older records that
    // do not have family_id.
    function getVolunteerRolesForPlayer(
      player,
      teamId,
      g1,
      g2
    ) {
      const teamVols = volunteersByTeam[teamId] || [];

      if (!teamVols.length) return '';

      const parts = [];
      const seen = new Set();

      teamVols.forEach((v) => {
        if (
          !v.role ||
          normalize(v.role) === 'parent'
        ) {
          return;
        }

        const familyMatch =
		          Boolean(
            player.family_id &&
            v.family_id &&
            String(player.family_id) === String(v.family_id)
          );

        const matchesG1 = samePerson(
          g1.name,
          g1.email,
          v
        );

        const matchesG2 = samePerson(
          g2.name,
          g2.email,
          v
        );

        let guardianLabel = '';

        if (matchesG1) {
          guardianLabel = 'Guardian 1';
        } else if (matchesG2) {
          guardianLabel = 'Guardian 2';
        } else if (familyMatch) {
          // This volunteer was manually linked to the player's family.
          // If they are not Guardian 1, treat them as Guardian 2 for the
          // roster email.
          guardianLabel = 'Guardian 2';
        } else {
          return;
        }

        const roleText =
          `${guardianLabel}: ${v.role}`;

        if (!seen.has(roleText)) {
          seen.add(roleText);
          parts.push(roleText);
        }
      });

      return parts.join(', ');
    }

    // 4) Send roster to each team's manager(s)
    const sent = [];
    const skipped = [];

    for (const team of teams) {
      const managers = getTeamManagers(team.id);

      if (!managers.length) {
        skipped.push({
          team_id: team.id,
          team_name: team.name,
          reason: 'No manager assigned',
        });

        continue;
      }

      const roster = [...(playersByTeam[team.id] || [])];

      roster.sort((a, b) => {
        const lastCompare =
          (a.last_name || '').localeCompare(b.last_name || '');

        if (lastCompare !== 0) return lastCompare;

        return (a.first_name || '').localeCompare(
          b.first_name || ''
        );
      });

      const divisionName =
        team.division?.name || 'Unknown Division';

      const subject =
        `${divisionName} - ${team.name} Team Roster`;

      let text = '';

      text += `Hello,\n\n`;
      text +=
        `Below is the roster for ${team.name} in the ${divisionName} division.\n\n`;

      if (team.color) {
        text += `Team Color: ${team.color}\n\n`;
      }

      text +=
        `Player Name | Age | Gender | New Player | Travel Player | ` +
        `Guardian 1 | Guardian 1 Email | Guardian 1 Phone | ` +
        `Guardian 2 | Guardian 2 Email | Guardian 2 Phone | ` +
        `Volunteer Role | Medical Conditions\n`;

      text +=
        `--------------------------------------------------------------------------------\n`;

      roster.forEach((p) => {
        const { g1, g2 } =
          getRosterGuardians(p, team.id);

        const playerName =
          `${p.first_name || ''} ${p.last_name || ''}`.trim();

        const age = calculateAge(p.birth_date);

        const volunteerRoles =
          getVolunteerRolesForPlayer(
            p,
            team.id,
            g1,
            g2
          );

        text +=
          `${playerName} | ` +
          `${age} | ` +
          `${p.gender || ''} | ` +
          `${p.is_new_player ? 'Yes' : 'No'} | ` +
          `${p.is_travel_player ? 'Yes' : 'No'} | ` +
          `${g1.name || ''} | ` +
          `${g1.email || ''} | ` +
          `${g1.phone || ''} | ` +
          `${g2.name || ''} | ` +
          `${g2.email || ''} | ` +
          `${g2.phone || ''} | ` +
          `${volunteerRoles || ''} | ` +
          `${p.medical_conditions || ''}\n`;
      });

      let html = '';

      html += `<p>Hello,</p>`;

      html +=
        `<p>Below is the roster for <strong>${escapeHtml(
          team.name
        )}</strong> in the <strong>${escapeHtml(
          divisionName
        )}</strong> division.</p>`;

      if (team.color) {
        html +=
          `<p><strong>Team Color:</strong> ${escapeHtml(
            team.color
          )}</p>`;
      }

      html +=
        `<table style="border-collapse:collapse;width:100%;font-size:12px;">`;

      html += `<thead><tr>`;

      const headers = [
        'Player Name',
        'Age',
        'Gender',
        'New Player',
        'Travel Player',
        'Guardian 1',
        'Guardian 1 Email',
        'Guardian 1 Phone',
        'Guardian 2',
        'Guardian 2 Email',
        'Guardian 2 Phone',
        'Volunteer Role',
        'Medical Conditions',
      ];

      headers.forEach((header) => {
        html +=
          `<th style="border:1px solid #d1d5db;` +
          `padding:6px;background:#f3f4f6;` +
          `text-align:left;vertical-align:top;">` +
          `${escapeHtml(header)}</th>`;
      });

      html += `</tr></thead><tbody>`;

      roster.forEach((p, index) => {
        const { g1, g2 } =
          getRosterGuardians(p, team.id);

        const playerName =
          `${p.first_name || ''} ${p.last_name || ''}`.trim();

        const age = calculateAge(p.birth_date);

        const volunteerRoles =
          getVolunteerRolesForPlayer(
            p,
            team.id,
            g1,
            g2
          );

        const rowBackground =
          index % 2 === 0 ? '#ffffff' : '#f9fafb';

        html +=
          `<tr style="background:${rowBackground};">`;

        const cells = [
          playerName,
          age,
          p.gender || '',
          p.is_new_player ? 'Yes' : 'No',
          p.is_travel_player ? 'Yes' : 'No',
          g1.name || '',
          g1.email || '',
          g1.phone || '',
          g2.name || '',
          g2.email || '',
          g2.phone || '',
          volunteerRoles || '',
          p.medical_conditions || '',
        ];

        cells.forEach((cell) => {
          html +=
            `<td style="border:1px solid #e5e7eb;` +
            `padding:6px;vertical-align:top;">` +
            `${escapeHtml(cell)}</td>`;
        });

        html += `</tr>`;
      });

      html += `</tbody></table>`;

      html +=
        `<p style="margin-top:16px;">Thank you,<br/>` +
        `Sayreville Little League</p>`;

      // A team could theoretically have more than one volunteer whose
      // role contains "manager". Avoid sending duplicate emails when
      // duplicate volunteer records use the same address.
      const managerEmails = [
        ...new Set(
          managers
            .map((manager) => normalize(manager.email))
            .filter(Boolean)
        ),
      ];

      if (!managerEmails.length) {
        skipped.push({
          team_id: team.id,
          team_name: team.name,
          reason: 'Manager has no email address',
        });

        continue;
      }

      for (const managerEmail of managerEmails) {
        try {
          await sendEmail({
            to: managerEmail,
            subject,
            text,
            html,
          });

          sent.push({
            team_id: team.id,
            team_name: team.name,
            division_id: team.division_id,
            division_name: divisionName,
            manager_email: managerEmail,
            player_count: roster.length,
          });
        } catch (emailError) {
          console.error(
            `[Notifications] Failed to send manager roster for ${team.name} to ${managerEmail}:`,
            emailError
          );

          skipped.push({
            team_id: team.id,
            team_name: team.name,
            manager_email: managerEmail,
            reason:
              emailError?.message ||
              'Failed to send manager roster email',
          });
        }
      }
    }

    return res.json({
      success: true,
      message:
        `Manager roster processing complete. ` +
        `${sent.length} email(s) sent.`,
      sent,
      skipped,
    });
  } catch (error) {
    console.error(
      'Error in POST /api/notifications/send-manager-rosters:',
      error
    );

    return res.status(500).json({
      error: 'Failed to send manager roster emails',
      details: error?.message || String(error),
    });
  }
});

/**
 * POST /api/notifications/send-player-agent-rosters
 *
 * Body: { season_id: string, division_id?: string }
 *
 * Sends the Player Agent a roster for each team.
 *
 * This uses the same guardian resolution rules as the manager roster:
 * if Guardian 2 is blank in the family registration but a volunteer
 * was manually linked to the player's family, that linked volunteer
 * can appear as Guardian 2.
 */
router.post('/send-player-agent-rosters', async (req, res) => {
  try {
    const { season_id, division_id } = req.body || {};

    if (!season_id) {
      return res.status(400).json({
        error:
          'season_id is required to send Player Agent rosters.',
      });
    }

    // 1) Get Player Agent contact
    const { data: playerAgent, error: playerAgentError } =
      await supabase
        .from('board_members')
        .select(
          'id, name, first_name, last_name, email, phone'
        )
        .eq('role', 'Player Agent')
        .eq('is_active', true)
        .order('last_name', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (playerAgentError) {
      throw playerAgentError;
    }

    if (!playerAgent) {
      return res.status(404).json({
        error:
          'No active Player Agent found. Please add a Player Agent in the Board Members section.',
      });
    }

    if (!playerAgent.email) {
      return res.status(400).json({
        error:
          'The active Player Agent does not have an email address.',
      });
    }

    const playerAgentName =
      playerAgent.name ||
      `${playerAgent.first_name || ''} ${
        playerAgent.last_name || ''
      }`.trim() ||
      'Player Agent';

    // 2) Load teams
    let teamQuery = supabase
      .from('teams')
      .select(
        `
        id,
        name,
        color,
        season_id,
        division_id,
        division:divisions (name)
      `
      )
      .eq('season_id', season_id)
      .order('name', { ascending: true });

    if (division_id) {
      teamQuery =
        teamQuery.eq('division_id', division_id);
    }

    const { data: teams, error: teamsError } =
      await teamQuery;

    if (teamsError) {
      throw teamsError;
    }

    if (!teams || teams.length === 0) {
      return res.json({
        success: true,
        message:
          'No teams found for the given season/division.',
        sent: [],
      });
    }

    const teamIds = teams.map((team) => team.id);

    // 3) Load players and registered family information
    const { data: players, error: playersError } =
      await supabase
        .from('players')
        .select(
          `
          id,
          first_name,
          last_name,
          gender,
          birth_date,
          is_new_player,
          is_travel_player,
          uniform_shirt_size,
          uniform_pants_size,
          medical_conditions,
          team_id,
          family_id,
          family:families (
            family_id,
            primary_contact_name,
            primary_contact_email,
            primary_contact_phone,
            parent2_first_name,
            parent2_last_name,
            parent2_email,
            parent2_phone
          )
        `
        )
        .in('team_id', teamIds);

    if (playersError) {
      throw playersError;
    }

    const playersByTeam = {};

    (players || []).forEach((player) => {
      if (!player.team_id) return;

      if (!playersByTeam[player.team_id]) {
        playersByTeam[player.team_id] = [];
      }

      playersByTeam[player.team_id].push(player);
    });

    // 4) Load all volunteers for the season.
    //
    // Do not restrict this to team_id because Family Link may have been
    // manually established before/independently of the team assignment.
    const { data: volunteers, error: volunteersError } =
      await supabase
        .from('volunteers')
        .select(
          'id, name, email, phone, team_id, season_id, role, family_id'
        )
        .eq('season_id', season_id);

    if (volunteersError) {
      throw volunteersError;
    }

    const volunteersByTeam = {};
    const volunteersByFamily = {};

    (volunteers || []).forEach((volunteer) => {
      if (volunteer.team_id) {
        if (!volunteersByTeam[volunteer.team_id]) {
          volunteersByTeam[volunteer.team_id] = [];
        }

        volunteersByTeam[volunteer.team_id].push(
          volunteer
        );
      }

      if (volunteer.family_id) {
        if (!volunteersByFamily[volunteer.family_id]) {
          volunteersByFamily[volunteer.family_id] = [];
        }

        volunteersByFamily[volunteer.family_id].push(
          volunteer
        );
      }
    });

    function samePerson(name, email, volunteer) {
      const nName = normalize(name);
      const nEmail = normalize(email);

      const vName = normalize(volunteer?.name);
      const vEmail = normalize(volunteer?.email);

      return Boolean(
        (nEmail && vEmail && nEmail === vEmail) ||
        (nName && vName && nName === vName)
      );
    }

    function getRosterGuardians(player, teamId) {
      const family = player.family || {};

      const g1 = {
        name: family.primary_contact_name || '',
        email: family.primary_contact_email || '',
        phone: family.primary_contact_phone || '',
      };

      const g2 = {
        name:
          `${family.parent2_first_name || ''} ` +
          `${family.parent2_last_name || ''}`.trim(),
        email: family.parent2_email || '',
        phone: family.parent2_phone || '',
      };

      // Only infer Guardian 2 when the registered Guardian 2 is
      // completely blank. We never replace existing registration data.
      if (
        !g2.name &&
        !g2.email &&
        !g2.phone &&
        player.family_id
      ) {
        const candidates =
          (volunteersByFamily[player.family_id] || [])
            .filter(
              (volunteer) =>
                !samePerson(
                  g1.name,
                  g1.email,
                  volunteer
                )
            )
            .filter(
              (volunteer) =>
                volunteer.name ||
                volunteer.email ||
                volunteer.phone
            )
            .sort((a, b) => {
              const score = (volunteer) =>
                (
                  String(volunteer.team_id) ===
                  String(teamId)
                    ? 100
                    : 0
                ) +
                (
                  volunteer.role &&
                  normalize(volunteer.role) !== 'parent'
                    ? 50
                    : 0
                ) +
                (volunteer.email ? 10 : 0) +
                (volunteer.phone ? 5 : 0);

              return score(b) - score(a);
            });

        const linkedGuardian = candidates[0];

        if (linkedGuardian) {
          g2.name = linkedGuardian.name || '';
          g2.email = linkedGuardian.email || '';
          g2.phone = linkedGuardian.phone || '';
        }
      }

      return { g1, g2 };
    }

    function getVolunteerRolesForPlayer(
      player,
      teamId,
      g1,
      g2
    ) {
      const teamVols =
        volunteersByTeam[teamId] || [];

      if (!teamVols.length) {
        return '';
      }

      const parts = [];
      const seen = new Set();

      teamVols.forEach((volunteer) => {
        if (
          !volunteer.role ||
          normalize(volunteer.role) === 'parent'
        ) {
          return;
        }

        const familyMatch =
          Boolean(
            player.family_id &&
            volunteer.family_id &&
            String(player.family_id) ===
              String(volunteer.family_id)
          );

        const matchesG1 =
          samePerson(
            g1.name,
            g1.email,
            volunteer
          );

        const matchesG2 =
          samePerson(
            g2.name,
            g2.email,
            volunteer
          );

        let guardianLabel = '';

        if (matchesG1) {
          guardianLabel = 'Guardian 1';
        } else if (matchesG2) {
          guardianLabel = 'Guardian 2';
        } else if (familyMatch) {
          guardianLabel = 'Guardian 2';
        } else {
          return;
        }

        const roleText =
          `${guardianLabel}: ${volunteer.role}`;

        if (!seen.has(roleText)) {
          seen.add(roleText);
          parts.push(roleText);
        }
      });

      return parts.join(', ');
    }

    const sent = [];
    const skipped = [];

    // Continue building one Player Agent roster email per team.
    for (const team of teams) {
      const roster =
        [...(playersByTeam[team.id] || [])];

      roster.sort((a, b) => {
        const lastCompare =
          (a.last_name || '').localeCompare(
            b.last_name || ''
          );

        if (lastCompare !== 0) {
          return lastCompare;
        }

        return (a.first_name || '').localeCompare(
          b.first_name || ''
        );
      });

      const divisionName =
        team.division?.name || 'Unknown Division';

      const subject =
        `${divisionName} - ${team.name} Team Roster`;

      let text = '';

      text += `Hello ${playerAgentName},\n\n`;

      text +=
        `Below is the roster for ${team.name} in the ${divisionName} division.\n\n`;

      if (team.color) {
        text += `Team Color: ${team.color}\n\n`;
      }

      text +=
        `Player Name | Age | Gender | New Player | Travel Player | ` +
        `Guardian 1 | Guardian 1 Email | Guardian 1 Phone | ` +
        `Guardian 2 | Guardian 2 Email | Guardian 2 Phone | ` +
        `Volunteer Role | Medical Conditions\n`;

      text +=
        `--------------------------------------------------------------------------------\n`;

      roster.forEach((player) => {
        const { g1, g2 } =
          getRosterGuardians(
            player,
            team.id
          );

        const playerName =
          `${player.first_name || ''} ${
            player.last_name || ''
          }`.trim();

        const age =
          calculateAge(player.birth_date);

        const volunteerRoles =
          getVolunteerRolesForPlayer(
            player,
            team.id,
            g1,
            g2
          );

        text +=
          `${playerName} | ` +
          `${age} | ` +
          `${player.gender || ''} | ` +
          `${player.is_new_player ? 'Yes' : 'No'} | ` +
          `${player.is_travel_player ? 'Yes' : 'No'} | ` +
          `${g1.name || ''} | ` +
          `${g1.email || ''} | ` +
          `${g1.phone || ''} | ` +
          `${g2.name || ''} | ` +
          `${g2.email || ''} | ` +
          `${g2.phone || ''} | ` +
          `${volunteerRoles || ''} | ` +
          `${player.medical_conditions || ''}\n`;
      });

      let html = '';

      html +=
        `<p>Hello ${escapeHtml(
          playerAgentName
        )},</p>`;

      html +=
        `<p>Below is the roster for ` +
        `<strong>${escapeHtml(team.name)}</strong> ` +
        `in the <strong>${escapeHtml(
          divisionName
        )}</strong> division.</p>`;

      if (team.color) {
        html +=
          `<p><strong>Team Color:</strong> ` +
          `${escapeHtml(team.color)}</p>`;
      }

      html +=
        `<table style="border-collapse:collapse;` +
        `width:100%;font-size:12px;">`;

      html += `<thead><tr>`;

      const headers = [
        'Player Name',
        'Age',
        'Gender',
        'New Player',
        'Travel Player',
        'Guardian 1',
        'Guardian 1 Email',
        'Guardian 1 Phone',
        'Guardian 2',
        'Guardian 2 Email',
        'Guardian 2 Phone',
        'Volunteer Role',
        'Medical Conditions',
      ];

      headers.forEach((header) => {
        html +=
          `<th style="border:1px solid #d1d5db;` +
          `padding:6px;background:#f3f4f6;` +
          `text-align:left;vertical-align:top;">` +
          `${escapeHtml(header)}</th>`;
      });

      html += `</tr></thead><tbody>`;

      roster.forEach((player, index) => {
        const { g1, g2 } =
          getRosterGuardians(
            player,
            team.id
          );

        const playerName =
          `${player.first_name || ''} ${
            player.last_name || ''
          }`.trim();

        const age =
          calculateAge(player.birth_date);

        const volunteerRoles =
          getVolunteerRolesForPlayer(
            player,
            team.id,
            g1,
            g2
          );

        const rowBackground =
          index % 2 === 0
            ? '#ffffff'
            : '#f9fafb';

        html +=
          `<tr style="background:${rowBackground};">`;

        const cells = [
          playerName,
          age,
          player.gender || '',
          player.is_new_player ? 'Yes' : 'No',
          player.is_travel_player ? 'Yes' : 'No',
          g1.name || '',
          g1.email || '',
          g1.phone || '',
          g2.name || '',
          g2.email || '',
          g2.phone || '',
          volunteerRoles || '',
          player.medical_conditions || '',
        ];

        cells.forEach((cell) => {
          html +=
            `<td style="border:1px solid #e5e7eb;` +
            `padding:6px;vertical-align:top;">` +
            `${escapeHtml(cell)}</td>`;
        });

        html += `</tr>`;
      });

      html += `</tbody></table>`;

      html +=
        `<p style="margin-top:16px;">` +
        `Thank you,<br/>Sayreville Little League</p>`;

      try {
        await sendEmail({
          to: playerAgent.email,
          subject,
          text,
          html,
        });

        sent.push({
          team_id: team.id,
          team_name: team.name,
          division_id: team.division_id,
          division_name: divisionName,
          player_agent_name: playerAgentName,
          player_agent_email: playerAgent.email,
          player_count: roster.length,
        });
      } catch (emailError) {
        console.error(
          `[Notifications] Failed to send Player Agent roster for ${team.name}:`,
          emailError
        );

        skipped.push({
          team_id: team.id,
          team_name: team.name,
          reason:
            emailError?.message ||
            'Failed to send Player Agent roster email',
        });
      }
    }

    return res.json({
      success: true,
      message:
        `Player Agent roster processing complete. ` +
        `${sent.length} email(s) sent.`,
      sent,
      skipped,
    });
  } catch (error) {
    console.error(
      'Error in POST /api/notifications/send-player-agent-rosters:',
      error
    );

    return res.status(500).json({
      error:
        'Failed to send Player Agent roster emails',
      details:
        error?.message || String(error),
    });
  }
});
/**
 * POST /api/notifications/send-late-add-manager
 *
 * Body: { season_id: string, team_id: string, player_id: string }
 *
 * Sends a targeted "late add" email to the Manager for the team,
 * including a "NEW PLAYER ADDED" section and the current roster.
 */
router.post('/send-late-add-manager', async (req, res) => {
  try {
    const { season_id, team_id, player_id } = req.body || {};

    if (!season_id) return res.status(400).json({ error: 'season_id is required.' });
    if (!team_id) return res.status(400).json({ error: 'team_id is required.' });
    if (!player_id) return res.status(400).json({ error: 'player_id is required.' });

    // 1) Load team (and division name)
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(
        `
        id,
        name,
        color,
        season_id,
        division_id,
        division:divisions (id, name, player_agent_name, player_agent_email)
      `
      )
      .eq('id', team_id)
      .maybeSingle();

    if (teamError) throw teamError;
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    if (team.season_id !== season_id) {
      return res.status(400).json({
        error: 'Team does not belong to the provided season_id.'
      });
    }

    const divisionName = team.division?.name || 'Unknown Division';

    // 2) Load team volunteers (to find manager + volunteer role mapping)
    const { data: teamVolunteers, error: volsError } = await supabase
      .from('volunteers')
      .select('id, name, email, phone, team_id, season_id, role, family_id')
      .eq('season_id', season_id)
      .eq('team_id', team_id);

    if (volsError) throw volsError;

    const managers = (teamVolunteers || []).filter(
      (v) => v.role && v.role.toLowerCase().includes('manager')
    );

    if (!managers.length) {
      return res.status(400).json({
        error: `No manager volunteer found for team "${team.name}".`,
      });
    }

    const manager = managers[0];

    if (!manager.email) {
      return res.status(400).json({
        error: `Manager for team "${team.name}" does not have an email address.`,
      });
    }

    // Helper: get volunteer roles for this player's guardians on this team
    function getVolunteerRolesForPlayer(g1Name, g1Email, g2Name, g2Email) {
      const vols = teamVolunteers || [];

      if (!vols.length) return '';

      const nG1Name = normalize(g1Name);
      const nG1Email = normalize(g1Email);
      const nG2Name = normalize(g2Name);
      const nG2Email = normalize(g2Email);

      const parts = [];

      vols.forEach((v) => {
        if (!v.role) return;

        const roleLower = v.role.toLowerCase();

        if (roleLower === 'parent') return;

        const vName = normalize(v.name);
        const vEmail = normalize(v.email);

        let prefix = '';

        if (
          (nG1Name && vName && vName === nG1Name) ||
          (nG1Email && vEmail && vEmail === nG1Email)
        ) {
          prefix = 'Guardian 1: ';
        } else if (
          (nG2Name && vName && vName === nG2Name) ||
          (nG2Email && vEmail && vEmail === nG2Email)
        ) {
          prefix = 'Guardian 2: ';
        } else {
          return;
        }

        parts.push(prefix + v.role);
      });

      return parts.join(', ');
    }

    // 3) Load NEW player (single) + family contacts
    const { data: newPlayer, error: newPlayerError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        gender,
        birth_date,
        is_new_player,
        is_travel_player,
        uniform_shirt_size,
        uniform_pants_size,
        medical_conditions,
        team_id,
        family:families (
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `
      )
      .eq('id', player_id)
      .maybeSingle();

    if (newPlayerError) throw newPlayerError;

    if (!newPlayer) {
      return res.status(404).json({
        error: 'Player not found.'
      });
    }

    if (newPlayer.team_id !== team_id) {
      return res.status(400).json({
        error:
          'This player is not currently assigned to the provided team_id. Please assign the player first, then send the late-add email.',
      });
    }

    // 4) Load full team roster (current)
    const { data: rosterPlayers, error: rosterError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        gender,
        birth_date,
        is_new_player,
        is_travel_player,
        uniform_shirt_size,
        uniform_pants_size,
        medical_conditions,
        team_id,
        family:families (
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `
      )
      .eq('team_id', team_id);

    if (rosterError) {
      console.error(
        '[Notifications] Error fetching roster players for late add manager:',
        rosterError
      );
    }

    const teamPlayers = (rosterPlayers || []).slice();

    // Sort players by last name
    teamPlayers.sort((a, b) => {
      const la = normalize(a.last_name);
      const lb = normalize(b.last_name);

      if (la < lb) return -1;
      if (la > lb) return 1;

      return 0;
    });

    const subject =
      `Roster Update - New Player Added - ${divisionName} - ${team.name}`;

    // Build NEW PLAYER summary row helper
    const buildRow = (p) => {
      const fullName =
        `${p.first_name || ''} ${p.last_name || ''}`.trim();

      const age = calculateAge(p.birth_date);

      const dob = p.birth_date || '';

      const medical =
        p.medical_conditions &&
        p.medical_conditions.trim().length > 0
          ? p.medical_conditions
          : '';

      const family = p.family || {};

      const g1Name =
        family.primary_contact_name || '';

      const g1Email =
        family.primary_contact_email || '';

      const g1Phone =
        family.primary_contact_phone || '';

      const g2Name =
        `${family.parent2_first_name || ''} ` +
        `${family.parent2_last_name || ''}`.trim();

      const g2Email =
        family.parent2_email || '';

      const g2Phone =
        family.parent2_phone || '';

      const volunteerRoles =
        getVolunteerRolesForPlayer(
          g1Name,
          g1Email,
          g2Name,
          g2Email
        );

      return {
        fullName,
        age,
        dob,
        shirt: p.uniform_shirt_size || '',
        pants: p.uniform_pants_size || '',
        medical,
        g1Name,
        g1Email,
        g1Phone,
        g2Name,
        g2Email,
        g2Phone,
        volunteerRoles,
      };
    };

    const newRow = buildRow(newPlayer);

    // Text email
    let text = '';

    text +=
      `Hello ${manager.name || 'Coach'},\n\n`;

    text +=
      `A NEW PLAYER has been added to your team.\n\n`;

    text +=
      `Division: ${divisionName}\n`;

    text +=
      `Team: ${team.name}\n`;

    if (team.color) {
      text += `Color: ${team.color}\n`;
    }

    text += `\nNEW PLAYER ADDED:\n`;

    text +=
      `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;

    text +=
      `${newRow.fullName} | ` +
      `${newRow.age || ''} | ` +
      `${newRow.dob || ''} | ` +
      `${newRow.shirt} | ` +
      `${newRow.pants} | ` +
      `${newRow.medical} | ` +
      `${newRow.g1Name} / ${newRow.g1Email} | ` +
      `${newRow.g2Name} / ${newRow.g2Email} | ` +
      `${newRow.volunteerRoles}\n\n`;

    text += `CURRENT FULL ROSTER:\n`;

    text +=
      `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;

    text +=
      `----------------------------------------------------------------------------\n`;

    // HTML email
    let html = '';

    html +=
      `<p>Hello ${escapeHtml(
        manager.name || 'Coach'
      )},</p>`;

    html +=
      `<p><strong>NEW PLAYER ADDED</strong> to your team.</p>`;

    html +=
      `<p><strong>Division:</strong> ${escapeHtml(
        divisionName
      )}<br/>`;

    html +=
      `<strong>Team:</strong> ${escapeHtml(team.name)}`;

    if (team.color) {
      html +=
        ` &nbsp; <strong>Color:</strong> ${escapeHtml(
          team.color
        )}`;
    }

    html += `</p>`;

    // New player table (single row)
    html +=
      `<h3 style="margin-top:16px; margin-bottom:8px;">New Player Added</h3>`;

    html += `
      <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px;">
        <thead>
          <tr>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Player Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Age</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Date of Birth</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Shirt</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Pants</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Medical Conditions</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Volunteer Role</th>
          </tr>
        </thead>

        <tbody>
          <tr style="background:#ecfeff;">
            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              <strong>${escapeHtml(newRow.fullName)}</strong>
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${newRow.age || ''}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.dob)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.shirt)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.pants)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.medical)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.g1Name)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.g1Email)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.g1Phone)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.g2Name)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.g2Email)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.g2Phone)}
            </td>

            <td style="border: 1px solid #e5e7eb; padding: 6px;">
              ${escapeHtml(newRow.volunteerRoles)}
            </td>
          </tr>
        </tbody>
      </table>
    `;

    // Full roster table
    html +=
      `<h3 style="margin-top:18px; margin-bottom:8px;">Current Full Roster</h3>`;

    html += `
      <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px;">
        <thead>
          <tr>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Player Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Age</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Date of Birth</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Shirt</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Pants</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Medical Conditions</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Volunteer Role</th>
          </tr>
        </thead>

        <tbody>
    `;

    teamPlayers.forEach((p) => {
      const row = buildRow(p);

      text +=
        `${row.fullName} | ` +
        `${row.age || ''} | ` +
        `${row.dob || ''} | ` +
        `${row.shirt} | ` +
        `${row.pants} | ` +
        `${row.medical} | ` +
        `${row.g1Name} / ${row.g1Email} | ` +
        `${row.g2Name} / ${row.g2Email} | ` +
        `${row.volunteerRoles}\n`;

      const highlight =
        p.id === newPlayer.id
          ? 'background:#ecfeff;'
          : '';

      html += `
        <tr style="${highlight}">
          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.fullName)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${row.age || ''}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.dob)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.shirt)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.pants)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.medical)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.g1Name)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.g1Email)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.g1Phone)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.g2Name)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.g2Email)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.g2Phone)}
          </td>

          <td style="border: 1px solid #e5e7eb; padding: 6px;">
            ${escapeHtml(row.volunteerRoles)}
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>

      <p style="margin-top: 16px;">
        If you notice any issues with your roster, please contact the league.
      </p>

      <p>
        Thank you,<br/>
        Sayreville Little League
      </p>
    `;

    await sendEmail({
      to: manager.email,
      subject,
      text,
      html
    });

    return res.json({
      success: true,
      sent: {
        team_id: team.id,
        team_name: team.name,
        division_id: team.division_id,
        division_name: divisionName,
        manager_name: manager.name,
        manager_email: manager.email,
        player_id: newPlayer.id,
        player_name:
          `${newPlayer.first_name || ''} ` +
          `${newPlayer.last_name || ''}`.trim(),
      },
    });
  } catch (error) {
    console.error(
      'Error in POST /api/notifications/send-late-add-manager:',
      error
    );

    return res.status(500).json({
      error: 'Failed to send late-add manager email',
      details: error?.message || String(error),
    });
  }
});

/**
 * POST /api/notifications/send-late-add-player-agent
 *
 * Body: { season_id: string, team_id: string, player_id: string }
 *
 * Sends a targeted "late add" email to the Player Agent for the team's division,
 * including a "NEW PLAYER ADDED" section and the current roster for that team.
 */
 router.post('/send-late-add-player-agent', async (req, res) => {
  try {
    const { season_id, team_id, player_id } = req.body || {};

    if (!season_id) return res.status(400).json({ error: 'season_id is required.' });
    if (!team_id) return res.status(400).json({ error: 'team_id is required.' });
    if (!player_id) return res.status(400).json({ error: 'player_id is required.' });

    // Load team + division (for player agent email)
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select(
        `
        id,
        name,
        color,
        season_id,
        division_id,
        division:divisions (id, name, player_agent_name, player_agent_email)
      `
      )
      .eq('id', team_id)
      .maybeSingle();

    if (teamError) throw teamError;
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    if (team.season_id !== season_id) {
      return res.status(400).json({
        error: 'Team does not belong to the provided season_id.'
      });
    }

    const divisionName = team.division?.name || 'Unknown Division';
    const agentEmail = team.division?.player_agent_email;
    const agentName = team.division?.player_agent_name || 'Player Agent';

    if (!agentEmail) {
      return res.status(400).json({
        error:
          'Player Agent email is not configured for this division. Please set it on the Division configuration page.',
      });
    }

    // Load volunteers for team/season for volunteer role mapping
    const { data: teamVolunteers, error: volsError } = await supabase
      .from('volunteers')
      .select('id, name, email, phone, team_id, season_id, role, family_id')
      .eq('season_id', season_id)
      .eq('team_id', team_id);

    if (volsError) throw volsError;

    function getVolunteerRolesForPlayer(g1Name, g1Email, g2Name, g2Email) {
      const vols = teamVolunteers || [];

      if (!vols.length) return '';

      const nG1Name = normalize(g1Name);
      const nG1Email = normalize(g1Email);
      const nG2Name = normalize(g2Name);
      const nG2Email = normalize(g2Email);

      const parts = [];

      vols.forEach((v) => {
        if (!v.role) return;

        const roleLower = v.role.toLowerCase();

        if (roleLower === 'parent') return;

        const vName = normalize(v.name);
        const vEmail = normalize(v.email);

        let prefix = '';

        if (
          (nG1Name && vName && vName === nG1Name) ||
          (nG1Email && vEmail && vEmail === nG1Email)
        ) {
          prefix = 'Guardian 1: ';
        } else if (
          (nG2Name && vName && vName === nG2Name) ||
          (nG2Email && vEmail && vEmail === nG2Email)
        ) {
          prefix = 'Guardian 2: ';
        } else {
          return;
        }

        parts.push(prefix + v.role);
      });

      return parts.join(', ');
    }

    // Load new player
    const { data: newPlayer, error: newPlayerError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        gender,
        birth_date,
        is_new_player,
        is_travel_player,
        uniform_shirt_size,
        uniform_pants_size,
        medical_conditions,
        team_id,
        family:families (
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `
      )
      .eq('id', player_id)
      .maybeSingle();

    if (newPlayerError) throw newPlayerError;
    if (!newPlayer) {
      return res.status(404).json({
        error: 'Player not found.'
      });
    }

    if (newPlayer.team_id !== team_id) {
      return res.status(400).json({
        error:
          'This player is not currently assigned to the provided team_id. Please assign the player first, then send the late-add email.',
      });
    }

    // Load full roster for the team
    const { data: rosterPlayers, error: rosterError } = await supabase
      .from('players')
      .select(
        `
        id,
        first_name,
        last_name,
        gender,
        birth_date,
        is_new_player,
        is_travel_player,
        uniform_shirt_size,
        uniform_pants_size,
        medical_conditions,
        team_id,
        family:families (
          family_id,
          primary_contact_name,
          primary_contact_email,
          primary_contact_phone,
          parent2_first_name,
          parent2_last_name,
          parent2_email,
          parent2_phone
        )
      `
      )
      .eq('team_id', team_id);

    if (rosterError) {
      console.error(
        '[Notifications] Error fetching roster players for late add player agent:',
        rosterError
      );
    }

    const teamPlayers = (rosterPlayers || []).slice();

    teamPlayers.sort((a, b) => {
      const la = normalize(a.last_name);
      const lb = normalize(b.last_name);

      if (la < lb) return -1;
      if (la > lb) return 1;

      return 0;
    });

    const buildRow = (p) => {
      const fullName =
        `${p.first_name || ''} ${p.last_name || ''}`.trim();

      const age = calculateAge(p.birth_date);
      const dob = p.birth_date || '';

      const medical =
        p.medical_conditions &&
        p.medical_conditions.trim().length > 0
          ? p.medical_conditions
          : '';

      const family = p.family || {};

      const g1Name = family.primary_contact_name || '';
      const g1Email = family.primary_contact_email || '';
      const g1Phone = family.primary_contact_phone || '';

      const g2Name =
        `${family.parent2_first_name || ''} ` +
        `${family.parent2_last_name || ''}`.trim();

      const g2Email = family.parent2_email || '';
      const g2Phone = family.parent2_phone || '';

      const volunteerRoles =
        getVolunteerRolesForPlayer(
          g1Name,
          g1Email,
          g2Name,
          g2Email
        );

      return {
        fullName,
        age,
        dob,
        shirt: p.uniform_shirt_size || '',
        pants: p.uniform_pants_size || '',
        medical,
        g1Name,
        g1Email,
        g1Phone,
        g2Name,
        g2Email,
        g2Phone,
        volunteerRoles,
      };
    };

    const newRow = buildRow(newPlayer);

    const subject =
      `Roster Update - New Player Added - ${divisionName} - ${team.name}`;

    let text = '';

    text += `Hi ${agentName},\n\n`;
    text += `A NEW PLAYER has been added.\n\n`;
    text += `Division: ${divisionName}\n`;
    text += `Team: ${team.name}\n`;

    if (team.color) {
      text += `Color: ${team.color}\n`;
    }

    text += `\nNEW PLAYER ADDED:\n`;

    text +=
      `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;

    text +=
      `${newRow.fullName} | ` +
      `${newRow.age || ''} | ` +
      `${newRow.dob || ''} | ` +
      `${newRow.shirt} | ` +
      `${newRow.pants} | ` +
      `${newRow.medical} | ` +
      `${newRow.g1Name} / ${newRow.g1Email} | ` +
      `${newRow.g2Name} / ${newRow.g2Email} | ` +
      `${newRow.volunteerRoles}\n\n`;

    text += `CURRENT TEAM ROSTER:\n`;

    text +=
      `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;

    text +=
      `----------------------------------------------------------------------------\n`;

    let html = '';

    html +=
      `<p>Hi ${escapeHtml(agentName)},</p>`;

    html +=
      `<p><strong>NEW PLAYER ADDED</strong> to a team in your division.</p>`;

    html +=
      `<p><strong>Division:</strong> ${escapeHtml(
        divisionName
      )}<br/>`;

    html +=
      `<strong>Team:</strong> ${escapeHtml(team.name)}`;

    if (team.color) {
      html +=
        ` &nbsp; <strong>Color:</strong> ${escapeHtml(
          team.color
        )}`;
    }

    html += `</p>`;

    html +=
      `<h3 style="margin-top:16px; margin-bottom:8px;">New Player Added</h3>`;

    html += `
      <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px;">
        <thead>
          <tr>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Player Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Age</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Date of Birth</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Shirt</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Pants</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Medical Conditions</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Volunteer Role</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background:#ecfeff;">
            <td style="border: 1px solid #e5e7eb; padding: 6px;"><strong>${escapeHtml(newRow.fullName)}</strong></td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${newRow.age || ''}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.dob)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.shirt)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.pants)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.medical)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.g1Name)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.g1Email)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.g1Phone)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.g2Name)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.g2Email)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.g2Phone)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(newRow.volunteerRoles)}</td>
          </tr>
        </tbody>
      </table>
    `;

    html +=
      `<h3 style="margin-top:18px; margin-bottom:8px;">Current Team Roster</h3>`;

    html += `
      <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 8px;">
        <thead>
          <tr>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Player Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Age</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Date of Birth</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Shirt</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Uniform Pants</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Medical Conditions</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 1 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Name</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Email</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Guardian 2 Phone</th>
            <th style="border: 1px solid #d1d5db; padding: 6px; background:#f9fafb; text-align:left;">Volunteer Role</th>
          </tr>
        </thead>
        <tbody>
    `;

    teamPlayers.forEach((p) => {
      const row = buildRow(p);

      text +=
        `${row.fullName} | ` +
        `${row.age || ''} | ` +
        `${row.dob || ''} | ` +
        `${row.shirt} | ` +
        `${row.pants} | ` +
        `${row.medical} | ` +
        `${row.g1Name} / ${row.g1Email} | ` +
        `${row.g2Name} / ${row.g2Email} | ` +
        `${row.volunteerRoles}\n`;

      const highlight =
        p.id === newPlayer.id
          ? 'background:#ecfeff;'
          : '';

      html += `
        <tr style="${highlight}">
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.fullName)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${row.age || ''}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.dob)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.shirt)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.pants)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.medical)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.g1Name)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.g1Email)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.g1Phone)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.g2Name)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.g2Email)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.g2Phone)}</td>
          <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(row.volunteerRoles)}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>

      <p style="margin-top: 16px;">
        Thank you,<br/>Sayreville Little League
      </p>
    `;

    await sendEmail({
      to: agentEmail,
      subject,
      text,
      html
    });

    return res.json({
      success: true,
      sent: {
        division_id: team.division_id,
        division_name: divisionName,
        player_agent_name: agentName,
        player_agent_email: agentEmail,
        team_id: team.id,
        team_name: team.name,
        player_id: newPlayer.id,
        player_name:
          `${newPlayer.first_name || ''} ` +
          `${newPlayer.last_name || ''}`.trim(),
      },
    });
  } catch (error) {
    console.error(
      'Error in POST /api/notifications/send-late-add-player-agent:',
      error
    );

    return res.status(500).json({
      error: 'Failed to send late-add player agent email',
      details: error?.message || String(error),
    });
  }
});


module.exports = router;