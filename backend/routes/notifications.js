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
        .json({ error: 'season_id is required to send manager rosters.' });
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
      if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = [];
      playersByTeam[p.team_id].push(p);
    });

    // 3) Load ALL volunteers for these teams/season (not just managers)
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, name, email, phone, team_id, season_id, role, family_id')
      .eq('season_id', season_id)
      .in('team_id', teamIds);

    if (volunteersError) {
      console.error(
        '[Notifications] Error fetching volunteers for manager rosters:',
        volunteersError
      );
      throw volunteersError;
    }

    const volunteersByTeam = {};
    (volunteers || []).forEach((v) => {
      if (!v.team_id) return;
      if (!volunteersByTeam[v.team_id]) volunteersByTeam[v.team_id] = [];
      volunteersByTeam[v.team_id].push(v);
    });

    // Helper: get manager volunteers for a team
    function getTeamManagers(teamId) {
      const teamVols = volunteersByTeam[teamId] || [];
      return teamVols.filter(
        (v) => v.role && v.role.toLowerCase().includes('manager')
      );
    }

    // Helper: get volunteer roles for this player's guardians on a team
    // IMPORTANT: This uses volunteers.role (assigned during draft) and matches by guardian name/email.
    function getVolunteerRolesForPlayer(teamId, g1Name, g1Email, g2Name, g2Email) {
      const vols = volunteersByTeam[teamId] || [];
      if (!vols.length) return '';

      const nG1Name = normalize(g1Name);
      const nG1Email = normalize(g1Email);
      const nG2Name = normalize(g2Name);
      const nG2Email = normalize(g2Email);

      const parts = [];

      vols.forEach((v) => {
        if (!v.role) return;
        const roleLower = v.role.toLowerCase();
        if (roleLower === 'parent') return; // skip plain Parent

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
          return; // only include roles for this player's guardians
        }

        parts.push(prefix + v.role);
      });

      return parts.join(', ');
    }

    // 4) Build and send emails (one per team manager)
    const sent = [];

    for (const team of teams) {
      const teamPlayers = (playersByTeam[team.id] || []).slice();
      const teamManagers = getTeamManagers(team.id);

      if (teamManagers.length === 0) {
        console.warn(
          `[Notifications] Team "${team.name}" has no manager volunteer. Skipping.`
        );
        continue;
      }

      const manager = teamManagers[0]; // first manager per team
      if (!manager.email) {
        console.warn(
          `[Notifications] Manager for team "${team.name}" has no email. Skipping.`
        );
        continue;
      }

      if (teamPlayers.length === 0) {
        console.warn(
          `[Notifications] Team "${team.name}" has no players. Skipping email.`
        );
        continue;
      }

      const divisionName = team.division?.name || 'Unknown Division';

      const subject = `Team Roster - ${divisionName} - ${team.name}`;

      // Sort players by last name for a nicer table
      teamPlayers.sort((a, b) => {
        const la = normalize(a.last_name);
        const lb = normalize(b.last_name);
        if (la < lb) return -1;
        if (la > lb) return 1;
        return 0;
      });

      // Text fallback (simple pipe-separated summary)
      let text = '';
      text += `Hello ${manager.name || 'Coach'},\n\n`;
      text += `Here is your team roster for the ${divisionName} division.\n\n`;
      text += `Team: ${team.name}\n`;
      if (team.color) text += `Color: ${team.color}\n`;
      text += `\nColumns: Player Name | Age | Date of Birth | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;
      text += `----------------------------------------------------------------------------\n`;

      // HTML table
      let html = '';
      html += `<p>Hello ${escapeHtml(manager.name || 'Coach')},</p>`;
      html += `<p>Here is your team roster for the <strong>${escapeHtml(
        divisionName
      )}</strong> division.</p>`;
      html += `<p><strong>Team:</strong> ${escapeHtml(team.name)}`;
      if (team.color) {
        html += ` &nbsp; <strong>Color:</strong> ${escapeHtml(team.color)}`;
      }
      html += `</p>`;

      html += `
        <table style="border-collapse: collapse; width: 100%; font-size: 13px; margin-top: 12px;">
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
        const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        const age = calculateAge(p.birth_date);
        const dob = p.birth_date || '';
        const medical =
          p.medical_conditions && p.medical_conditions.trim().length > 0
            ? p.medical_conditions
            : '';

        const family = p.family || {};
        const g1Name = family.primary_contact_name || '';
        const g1Email = family.primary_contact_email || '';
        const g1Phone = family.primary_contact_phone || '';
        const g2Name = `${family.parent2_first_name || ''} ${
          family.parent2_last_name || ''
        }`.trim();
        const g2Email = family.parent2_email || '';
        const g2Phone = family.parent2_phone || '';

        const volunteerRoles = getVolunteerRolesForPlayer(
          team.id,
          g1Name,
          g1Email,
          g2Name,
          g2Email
        );

        // Text fallback row
        text += `${fullName} | ${age || ''} | ${dob || ''} | ${
          p.uniform_shirt_size || ''
        } | ${p.uniform_pants_size || ''} | ${medical} | ${g1Name} / ${
          g1Email
        } | ${g2Name} / ${g2Email} | ${volunteerRoles}\n`;

        // HTML row
        html += `
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              fullName
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${
              age || ''
            }</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              dob
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              p.uniform_shirt_size || ''
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              p.uniform_pants_size || ''
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              medical
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              g1Name
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              g1Email
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              g1Phone
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              g2Name
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              g2Email
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              g2Phone
            )}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(
              volunteerRoles
            )}</td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
        <p style="margin-top: 16px;">
          If you notice any issues with your roster, please contact the league.
        </p>
        <p>Thank you,<br/>Sports League Manager</p>
      `;

      await sendEmail({
        to: manager.email,
        subject,
        text,
        html,
      });

      sent.push({
        team_id: team.id,
        team_name: team.name,
        manager_name: manager.name,
        manager_email: manager.email,
      });
    }

    return res.json({
      success: true,
      sent,
    });
  } catch (error) {
    console.error(
      'Error in POST /api/notifications/send-manager-rosters:',
      error
    );
    return res
      .status(500)
      .json({ error: 'Failed to send manager roster emails', details: error?.message || String(error) });
  }
});

/**
 * POST /api/notifications/send-player-agent-rosters
 *
 * Body: { season_id: string, division_id: string }
 *
 * Sends ONE email to the Player Agent for the division containing all rosters grouped by team.
 * - Uses the SAME columns and volunteer-role logic as the manager roster email.
 * - Honors Email Settings Test Mode automatically (via sendEmail).
 * - Only includes teams that have at least 1 player assigned.
 */
router.post('/send-player-agent-rosters', async (req, res) => {
  try {
    const { season_id, division_id } = req.body || {};

    if (!season_id) {
      return res.status(400).json({ error: 'season_id is required.' });
    }
    if (!division_id) {
      return res.status(400).json({ error: 'division_id is required.' });
    }

    // Load division to find Player Agent
    const { data: division, error: divisionError } = await supabase
      .from('divisions')
      .select('id, name, player_agent_name, player_agent_email')
      .eq('id', division_id)
      .maybeSingle();

    if (divisionError) {
      console.error('[Notifications] Error fetching division for player agent rosters:', divisionError);
      throw divisionError;
    }

    const agentEmail = division?.player_agent_email;
    const agentName = division?.player_agent_name || 'Player Agent';
    const divisionName = division?.name || 'Unknown Division';

    if (!agentEmail) {
      return res.status(400).json({
        error: 'Player Agent email is not configured for this division. Please set it on the Division configuration page.',
      });
    }

    // 1) Load teams for this season/division
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select(
        `
        id,
        name,
        color,
        season_id,
        division_id
      `
      )
      .eq('season_id', season_id)
      .eq('division_id', division_id)
      .order('name', { ascending: true });

    if (teamsError) {
      console.error('[Notifications] Error fetching teams for player agent rosters:', teamsError);
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
      console.error('[Notifications] Error fetching players for player agent rosters:', playersError);
      // continue; email may be empty
    }

    const playersByTeam = {};
    (players || []).forEach((p) => {
      if (!p.team_id) return;
      if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = [];
      playersByTeam[p.team_id].push(p);
    });

    // 3) Load ALL volunteers for these teams/season
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, name, email, phone, team_id, season_id, role, family_id')
      .eq('season_id', season_id)
      .in('team_id', teamIds);

    if (volunteersError) {
      console.error('[Notifications] Error fetching volunteers for player agent rosters:', volunteersError);
      throw volunteersError;
    }

    const volunteersByTeam = {};
    (volunteers || []).forEach((v) => {
      if (!v.team_id) return;
      if (!volunteersByTeam[v.team_id]) volunteersByTeam[v.team_id] = [];
      volunteersByTeam[v.team_id].push(v);
    });

    // Same helper as manager email (match by guardian name/email)
    function getVolunteerRolesForPlayer(teamId, g1Name, g1Email, g2Name, g2Email) {
      const vols = volunteersByTeam[teamId] || [];
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

    // Only include teams with players
    const teamsWithPlayers = teams.filter((t) => (playersByTeam[t.id] || []).length > 0);

    if (teamsWithPlayers.length === 0) {
      return res.json({
        success: true,
        message: 'No teams with players assigned yet. Player Agent email not sent.',
        sent: [],
      });
    }

    const subject = `Division Rosters - ${divisionName}`;

    let text = '';
    text += `Hi ${agentName},\n\n`;
    text += `Here are the full division rosters, grouped by team.\n\n`;

    let html = '';
    html += `<p>Hi ${escapeHtml(agentName)},</p>`;
    html += `<p>Here are the full division rosters, grouped by team.</p>`;

    teamsWithPlayers.forEach((team) => {
      const teamPlayers = (playersByTeam[team.id] || []).slice();

      // Sort players by last name (same as manager email)
      teamPlayers.sort((a, b) => {
        const la = normalize(a.last_name);
        const lb = normalize(b.last_name);
        if (la < lb) return -1;
        if (la > lb) return 1;
        return 0;
      });

      // Team heading
      text += `Team ${team.name}\n`;
      html += `<h3 style="margin-top:18px; margin-bottom:8px;">Team ${escapeHtml(team.name)}</h3>`;

      // Table header (same columns as manager email)
      text += `Player Name\tAge\tDate of Birth\tUniform Shirt\tUniform Pants\tMedical Conditions\tGuardian 1 Name\tGuardian 1 Email\tGuardian 1 Phone\tGuardian 2 Name\tGuardian 2 Email\tGuardian 2 Phone\tVolunteer Role\n`;

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
        const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
        const age = calculateAge(p.birth_date);
        const dob = p.birth_date || '';
        const medical =
          p.medical_conditions && p.medical_conditions.trim().length > 0
            ? p.medical_conditions
            : '';

        const family = p.family || {};
        const g1Name = family.primary_contact_name || '';
        const g1Email = family.primary_contact_email || '';
        const g1Phone = family.primary_contact_phone || '';
        const g2Name = `${family.parent2_first_name || ''} ${family.parent2_last_name || ''}`.trim();
        const g2Email = family.parent2_email || '';
        const g2Phone = family.parent2_phone || '';

        const volunteerRoles = getVolunteerRolesForPlayer(
          team.id,
          g1Name,
          g1Email,
          g2Name,
          g2Email
        );

        text += `${fullName}\t${age || ''}\t${dob || ''}\t${p.uniform_shirt_size || ''}\t${p.uniform_pants_size || ''}\t${medical}\t${g1Name}\t${g1Email}\t${g1Phone}\t${g2Name}\t${g2Email}\t${g2Phone}\t${volunteerRoles}\n`;

        html += `
          <tr>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(fullName)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${age || ''}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(dob)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(p.uniform_shirt_size || '')}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(p.uniform_pants_size || '')}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(medical)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(g1Name)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(g1Email)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(g1Phone)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(g2Name)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(g2Email)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(g2Phone)}</td>
            <td style="border: 1px solid #e5e7eb; padding: 6px;">${escapeHtml(volunteerRoles)}</td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;

      text += '\n';
    });

    html += `
      <p style="margin-top: 16px; font-size: 12px; color: #6b7280;">
        Note: Volunteer Role is based on the assigned role from the draft (volunteers.role).
      </p>
      <p>Thank you,<br/>Sports League Manager</p>
    `;

    await sendEmail({
      to: agentEmail,
      subject,
      text,
      html,
    });

    return res.json({
      success: true,
      sent: [
        {
          division_id,
          division_name: divisionName,
          player_agent_name: agentName,
          player_agent_email: agentEmail,
          team_count: teamsWithPlayers.length,
        },
      ],
    });
  } catch (error) {
    console.error('Error in POST /api/notifications/send-player-agent-rosters:', error);
    return res.status(500).json({
      error: 'Failed to send player agent roster email',
      details: error?.message || String(error),
    });
  }
});


/**
 * POST /api/notifications/send-late-add-manager
 *
 * Body: { season_id: string, team_id: string, player_id: string }
 *
 * Sends a targeted "late add" email to ONLY the manager of the given team,
 * including a "NEW PLAYER ADDED" section and the current full roster.
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
      return res.status(400).json({ error: 'Team does not belong to the provided season_id.' });
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
    if (!newPlayer) return res.status(404).json({ error: 'Player not found.' });
    if (newPlayer.team_id !== team_id) {
      return res.status(400).json({
        error: 'This player is not currently assigned to the provided team_id. Please assign the player first, then send the late-add email.',
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
      console.error('[Notifications] Error fetching roster players for late add manager:', rosterError);
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

    const subject = `Roster Update - New Player Added - ${divisionName} - ${team.name}`;

    // Build NEW PLAYER summary row helper
    const buildRow = (p) => {
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const age = calculateAge(p.birth_date);
      const dob = p.birth_date || '';
      const medical =
        p.medical_conditions && p.medical_conditions.trim().length > 0
          ? p.medical_conditions
          : '';

      const family = p.family || {};
      const g1Name = family.primary_contact_name || '';
      const g1Email = family.primary_contact_email || '';
      const g1Phone = family.primary_contact_phone || '';
      const g2Name = `${family.parent2_first_name || ''} ${family.parent2_last_name || ''}`.trim();
      const g2Email = family.parent2_email || '';
      const g2Phone = family.parent2_phone || '';

      const volunteerRoles = getVolunteerRolesForPlayer(g1Name, g1Email, g2Name, g2Email);

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
    text += `Hello ${manager.name || 'Coach'},\n\n`;
    text += `A NEW PLAYER has been added to your team.\n\n`;
    text += `Division: ${divisionName}\n`;
    text += `Team: ${team.name}\n`;
    if (team.color) text += `Color: ${team.color}\n`;
    text += `\nNEW PLAYER ADDED:\n`;
    text += `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;
    text += `${newRow.fullName} | ${newRow.age || ''} | ${newRow.dob || ''} | ${newRow.shirt} | ${newRow.pants} | ${newRow.medical} | ${newRow.g1Name} / ${newRow.g1Email} | ${newRow.g2Name} / ${newRow.g2Email} | ${newRow.volunteerRoles}\n\n`;
    text += `CURRENT FULL ROSTER:\n`;
    text += `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;
    text += `----------------------------------------------------------------------------\n`;

    // HTML email
    let html = '';
    html += `<p>Hello ${escapeHtml(manager.name || 'Coach')},</p>`;
    html += `<p><strong>NEW PLAYER ADDED</strong> to your team.</p>`;
    html += `<p><strong>Division:</strong> ${escapeHtml(divisionName)}<br/>`;
    html += `<strong>Team:</strong> ${escapeHtml(team.name)}`;
    if (team.color) html += ` &nbsp; <strong>Color:</strong> ${escapeHtml(team.color)}`;
    html += `</p>`;

    // New player table (single row)
    html += `<h3 style="margin-top:16px; margin-bottom:8px;">New Player Added</h3>`;
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

    // Full roster table
    html += `<h3 style="margin-top:18px; margin-bottom:8px;">Current Full Roster</h3>`;
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

      text += `${row.fullName} | ${row.age || ''} | ${row.dob || ''} | ${row.shirt} | ${row.pants} | ${row.medical} | ${row.g1Name} / ${row.g1Email} | ${row.g2Name} / ${row.g2Email} | ${row.volunteerRoles}\n`;

      const highlight = p.id === newPlayer.id ? 'background:#ecfeff;' : '';
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
        If you notice any issues with your roster, please contact the league.
      </p>
      <p>Thank you,<br/>Sports League Manager</p>
    `;

    await sendEmail({ to: manager.email, subject, text, html });

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
        player_name: `${newPlayer.first_name || ''} ${newPlayer.last_name || ''}`.trim(),
      },
    });
  } catch (error) {
    console.error('Error in POST /api/notifications/send-late-add-manager:', error);
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
      return res.status(400).json({ error: 'Team does not belong to the provided season_id.' });
    }

    const divisionName = team.division?.name || 'Unknown Division';
    const agentEmail = team.division?.player_agent_email;
    const agentName = team.division?.player_agent_name || 'Player Agent';

    if (!agentEmail) {
      return res.status(400).json({
        error: 'Player Agent email is not configured for this division. Please set it on the Division configuration page.',
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
    if (!newPlayer) return res.status(404).json({ error: 'Player not found.' });
    if (newPlayer.team_id !== team_id) {
      return res.status(400).json({
        error: 'This player is not currently assigned to the provided team_id. Please assign the player first, then send the late-add email.',
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
      console.error('[Notifications] Error fetching roster players for late add player agent:', rosterError);
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
      const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim();
      const age = calculateAge(p.birth_date);
      const dob = p.birth_date || '';
      const medical =
        p.medical_conditions && p.medical_conditions.trim().length > 0
          ? p.medical_conditions
          : '';

      const family = p.family || {};
      const g1Name = family.primary_contact_name || '';
      const g1Email = family.primary_contact_email || '';
      const g1Phone = family.primary_contact_phone || '';
      const g2Name = `${family.parent2_first_name || ''} ${family.parent2_last_name || ''}`.trim();
      const g2Email = family.parent2_email || '';
      const g2Phone = family.parent2_phone || '';

      const volunteerRoles = getVolunteerRolesForPlayer(g1Name, g1Email, g2Name, g2Email);

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

    const subject = `Roster Update - New Player Added - ${divisionName} - ${team.name}`;

    let text = '';
    text += `Hi ${agentName},\n\n`;
    text += `A NEW PLAYER has been added.\n\n`;
    text += `Division: ${divisionName}\n`;
    text += `Team: ${team.name}\n`;
    if (team.color) text += `Color: ${team.color}\n`;
    text += `\nNEW PLAYER ADDED:\n`;
    text += `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;
    text += `${newRow.fullName} | ${newRow.age || ''} | ${newRow.dob || ''} | ${newRow.shirt} | ${newRow.pants} | ${newRow.medical} | ${newRow.g1Name} / ${newRow.g1Email} | ${newRow.g2Name} / ${newRow.g2Email} | ${newRow.volunteerRoles}\n\n`;
    text += `CURRENT TEAM ROSTER:\n`;
    text += `Player Name | Age | DOB | Shirt | Pants | Medical | Guardian1 | Guardian2 | Volunteer Role\n`;
    text += `----------------------------------------------------------------------------\n`;

    let html = '';
    html += `<p>Hi ${escapeHtml(agentName)},</p>`;
    html += `<p><strong>NEW PLAYER ADDED</strong> to a team in your division.</p>`;
    html += `<p><strong>Division:</strong> ${escapeHtml(divisionName)}<br/>`;
    html += `<strong>Team:</strong> ${escapeHtml(team.name)}`;
    if (team.color) html += ` &nbsp; <strong>Color:</strong> ${escapeHtml(team.color)}`;
    html += `</p>`;

    html += `<h3 style="margin-top:16px; margin-bottom:8px;">New Player Added</h3>`;
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

    html += `<h3 style="margin-top:18px; margin-bottom:8px;">Current Team Roster</h3>`;
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

      text += `${row.fullName} | ${row.age || ''} | ${row.dob || ''} | ${row.shirt} | ${row.pants} | ${row.medical} | ${row.g1Name} / ${row.g1Email} | ${row.g2Name} / ${row.g2Email} | ${row.volunteerRoles}\n`;

      const highlight = p.id === newPlayer.id ? 'background:#ecfeff;' : '';
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
        Thank you,<br/>Sports League Manager
      </p>
    `;

    await sendEmail({ to: agentEmail, subject, text, html });

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
        player_name: `${newPlayer.first_name || ''} ${newPlayer.last_name || ''}`.trim(),
      },
    });
  } catch (error) {
    console.error('Error in POST /api/notifications/send-late-add-player-agent:', error);
    return res.status(500).json({
      error: 'Failed to send late-add player agent email',
      details: error?.message || String(error),
    });
  }
});


module.exports = router;
