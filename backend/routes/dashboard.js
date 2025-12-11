const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get comprehensive dashboard statistics
router.get('/statistics', async (req, res) => {
  try {
    const { season_id } = req.query;
    
    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    console.log('Loading dashboard statistics for season:', season_id);

    // Get current season data
    const currentSeason = await getCurrentSeason(season_id);
    if (!currentSeason) {
      return res.status(404).json({ error: 'Season not found' });
    }

    // Get previous season data for comparison
    const previousSeason = await getPreviousSeason(currentSeason.year);
    
    // Load all data in parallel for better performance
    const [
      registrationStats,
      divisionStats,
      volunteerStats,
      workBondStats,
      volunteerByDivision
    ] = await Promise.all([
      getRegistrationStatistics(season_id, previousSeason?.id),
      getDivisionStatistics(season_id, previousSeason?.id),
      getVolunteerStatistics(season_id),
      getWorkBondStatistics(season_id),
      getVolunteerByDivision(season_id) // NEW: Get volunteer breakdown by division
    ]);

    const dashboardData = {
      // Registration Totals
      totalRegistered: registrationStats.totalRegistered,
      pendingRegistrations: registrationStats.pendingRegistrations,
      totalWithPending: registrationStats.totalWithPending,
      playersNotReturning: registrationStats.playersNotReturning,
      
      // Player Breakdown
      newPlayers: registrationStats.newPlayers,
      returningPlayers: registrationStats.returningPlayers,
      totalTeams: registrationStats.totalTeams,
      
      // Work Bond Status
      familiesPendingWorkBond: workBondStats.pendingCount,
      
      // Division Breakdown
      divisions: divisionStats,
      
      // Volunteer Statistics
      totalVolunteers: volunteerStats.totalVolunteers,
      volunteerBreakdown: volunteerStats.breakdown,
      
      // NEW: Volunteer breakdown by division
      volunteerByDivision: volunteerByDivision,
      
      // Season Info
      currentSeason: currentSeason,
      previousSeason: previousSeason
    };

    console.log('Dashboard statistics loaded successfully');
    res.json(dashboardData);
  } catch (error) {
    console.error('Error loading dashboard statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get current season
async function getCurrentSeason(seasonId) {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', seasonId)
    .single();

  if (error) throw error;
  return data;
}

// Helper function to get previous season
async function getPreviousSeason(currentYear) {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', currentYear - 1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
    throw error;
  }
  return data || null;
}

// Get registration statistics
async function getRegistrationStatistics(currentSeasonId, previousSeasonId) {
  // Current season players
  const { data: currentPlayers, error: currentError } = await supabase
    .from('players')
    .select('id, is_new_player, team_id, payment_received')
    .eq('season_id', currentSeasonId);

  if (currentError) throw currentError;

  // Previous season players for comparison
  let previousPlayers = [];
  if (previousSeasonId) {
    const { data: prevData, error: prevError } = await supabase
      .from('players')
      .select('id')
      .eq('season_id', previousSeasonId);

    if (prevError) throw prevError;
    previousPlayers = prevData || [];
  }

  // Current season teams
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .eq('season_id', currentSeasonId);

  if (teamsError) throw teamsError;

  const newPlayers = currentPlayers.filter(p => p.is_new_player).length;
  const returningPlayers = currentPlayers.filter(p => !p.is_new_player).length;
  const pendingRegistrations = currentPlayers.filter(p => !p.payment_received).length;

  return {
    totalRegistered: currentPlayers.length,
    pendingRegistrations: pendingRegistrations,
    totalWithPending: currentPlayers.length, // Same as total since pending are included
    playersNotReturning: previousSeasonId ? 
      Math.max(0, previousPlayers.length - returningPlayers) : 0,
    newPlayers: newPlayers,
    returningPlayers: returningPlayers,
    totalTeams: teams.length
  };
}

// Get division statistics with trends - using program_title
async function getDivisionStatistics(currentSeasonId, previousSeasonId) {
  // Get players with their program_title for current season
  const { data: currentPlayers, error: currentError } = await supabase
    .from('players')
    .select('id, is_new_player, program_title, team_id')
    .eq('season_id', currentSeasonId);

  if (currentError) throw currentError;

  // Get players with program_title for previous season
  let previousPlayers = [];
  if (previousSeasonId) {
    const { data: prevData, error: prevError } = await supabase
      .from('players')
      .select('id, program_title')
      .eq('season_id', previousSeasonId);

    if (prevError) throw prevError;
    previousPlayers = prevData || [];
  }

  // Get teams count per division for current season
  const { data: divisionTeams, error: teamsError } = await supabase
    .from('teams')
    .select('division_id, division:divisions (name)')
    .eq('season_id', currentSeasonId);

  if (teamsError) throw teamsError;

  // Group current players by program_title (division)
  const currentDivisionMap = {};
  currentPlayers.forEach(player => {
    const divisionName = player.program_title || 'Unassigned';
    if (!currentDivisionMap[divisionName]) {
      currentDivisionMap[divisionName] = {
        players: [],
        newPlayers: 0,
        returningPlayers: 0
      };
    }
    currentDivisionMap[divisionName].players.push(player);
    if (player.is_new_player) {
      currentDivisionMap[divisionName].newPlayers++;
    } else {
      currentDivisionMap[divisionName].returningPlayers++;
    }
  });

  // Group previous players by program_title (division)
  const previousDivisionMap = {};
  previousPlayers.forEach(player => {
    const divisionName = player.program_title || 'Unassigned';
    if (!previousDivisionMap[divisionName]) {
      previousDivisionMap[divisionName] = [];
    }
    previousDivisionMap[divisionName].push(player);
  });

  // Count teams per division based on program_title
  const teamsPerDivision = {};
  // Since teams don't have program_title, we'll estimate teams per division
  // by counting unique team_ids per division in players table
  currentPlayers.forEach(player => {
    if (player.team_id && player.program_title) {
      const divisionName = player.program_title;
      if (!teamsPerDivision[divisionName]) {
        teamsPerDivision[divisionName] = new Set();
      }
      teamsPerDivision[divisionName].add(player.team_id);
    }
  });

  // Convert sets to counts
  const teamsPerDivisionCount = {};
  Object.keys(teamsPerDivision).forEach(divisionName => {
    teamsPerDivisionCount[divisionName] = teamsPerDivision[divisionName].size;
  });

  // Create division stats array
  const divisionStats = [];

  // Add divisions with current players
  Object.keys(currentDivisionMap).forEach(divisionName => {
    const currentData = currentDivisionMap[divisionName];
    const previousData = previousDivisionMap[divisionName] || [];
    
    const currentCount = currentData.players.length;
    const previousCount = previousData.length;
    
    const trend = currentCount > previousCount ? 'up' : 
                 currentCount < previousCount ? 'down' : 'neutral';

    divisionStats.push({
      name: divisionName,
      current: currentCount,
      previous: previousCount,
      trend: trend,
      newPlayers: currentData.newPlayers,
      returningPlayers: currentData.returningPlayers,
      teams: teamsPerDivisionCount[divisionName] || 0
    });
  });

  // Add divisions that only existed in previous season (with 0 current players)
  Object.keys(previousDivisionMap).forEach(divisionName => {
    if (!currentDivisionMap[divisionName]) {
      const previousCount = previousDivisionMap[divisionName].length;
      divisionStats.push({
        name: divisionName,
        current: 0,
        previous: previousCount,
        trend: 'down',
        newPlayers: 0,
        returningPlayers: 0,
        teams: 0
      });
    }
  });

  // Sort divisions by current count (descending)
  divisionStats.sort((a, b) => b.current - a.current);

  return divisionStats;
}

// Get volunteer statistics
async function getVolunteerStatistics(seasonId) {
  const { data: volunteers, error } = await supabase
    .from('volunteers')
    .select('role, team_id')
    .eq('season_id', seasonId)
    .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

  if (error) throw error;

  const breakdown = {
    teamManagers: volunteers.filter(v => v.role === 'Manager').length,
    assistantCoaches: volunteers.filter(v => v.role === 'Assistant Coach' || v.role === 'Coach').length,
    teamParents: volunteers.filter(v => v.role === 'Team Parent').length
  };

  return {
    totalVolunteers: volunteers.length,
    breakdown: breakdown
  };
}

// NEW: Get volunteer breakdown by division
async function getVolunteerByDivision(seasonId) {
  try {
    console.log('Loading volunteer breakdown by division for season:', seasonId);
    
    // Get volunteers with their division information
    const { data: volunteers, error } = await supabase
      .from('volunteers')
      .select(`
        id,
        role,
        division_id,
        division:divisions (name)
      `)
      .eq('season_id', seasonId)
      .in('role', ['Manager', 'Assistant Coach', 'Team Parent', 'Coach']);

    if (error) {
      console.error('Error fetching volunteers:', error);
      return []; // Return empty array instead of throwing
    }

    console.log(`Found ${volunteers?.length || 0} volunteers`);

    // Group volunteers by division and role
    const divisionMap = {};
    
    // Initialize with all divisions from your spreadsheet to ensure they appear
    const defaultDivisions = [
      'T-Ball Division',
      'Baseball - Coach Pitch Division', 
      'Baseball - Rookies Division',
      'Baseball - Minors Division',
      'Baseball - Majors Division',
      'Softball - Rookies Division (Coach Pitch)',
      'Softball - Minors Division',
      'Softball - Majors Division',
      'Challenger Division',
      'Softball - Junior Division'
    ];

    // Initialize all divisions with zero counts
    defaultDivisions.forEach(divisionName => {
      divisionMap[divisionName] = {
        name: divisionName,
        teamManagers: 0,
        assistantCoaches: 0,
        teamParents: 0,
        divisionTotal: 0
      };
    });

    // Count volunteers by division and role
    volunteers.forEach(volunteer => {
      const divisionName = volunteer.division?.name || 'Unassigned';
      
      // If this division isn't in our map yet, add it
      if (!divisionMap[divisionName]) {
        divisionMap[divisionName] = {
          name: divisionName,
          teamManagers: 0,
          assistantCoaches: 0,
          teamParents: 0,
          divisionTotal: 0
        };
      }

      // Count by role
      if (volunteer.role === 'Manager') {
        divisionMap[divisionName].teamManagers++;
      } else if (volunteer.role === 'Assistant Coach' || volunteer.role === 'Coach') {
        divisionMap[divisionName].assistantCoaches++;
      } else if (volunteer.role === 'Team Parent') {
        divisionMap[divisionName].teamParents++;
      }
      
      // Update division total
      divisionMap[divisionName].divisionTotal++;
    });

    // Convert to array and sort by division name
    const result = Object.values(divisionMap).sort((a, b) => {
      const divisionOrder = {
        'T-Ball Division': 1,
        'Baseball - Coach Pitch Division': 2,
        'Baseball - Rookies Division': 3,
        'Baseball - Minors Division': 4,
        'Baseball - Majors Division': 5,
        'Softball - Rookies Division (Coach Pitch)': 6,
        'Softball - Minors Division': 7,
        'Softball - Majors Division': 8,
        'Challenger Division': 9,
        'Softball - Junior Division': 10
      };
      
      const orderA = divisionOrder[a.name] || 999;
      const orderB = divisionOrder[b.name] || 999;
      return orderA - orderB;
    });

    console.log('Volunteer by division data processed successfully');
    return result;

  } catch (error) {
    console.error('Error in getVolunteerByDivision:', error);
    return []; // Return empty array on error
  }
}

// Get work bond statistics
async function getWorkBondStatistics(seasonId) {
  // Get families with players in current season that are missing work bonds
  const { data: families, error } = await supabase
    .from('families')
    .select(`
      id,
      work_bond_check_received,
      players:players!inner (id)
    `)
    .eq('players.season_id', seasonId)
    .eq('work_bond_check_received', false);

  if (error) throw error;

  return {
    pendingCount: families?.length || 0,
    families: families || []
  };
}

module.exports = router;