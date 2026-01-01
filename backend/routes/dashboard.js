const express = require('express');
const router = express.Router();
const supabase = require('../config/database');

// Get comprehensive dashboard statistics
router.get('/statistics', async (req, res) => {
  try {
    const { season_id, compare_season_id } = req.query;
    
    if (!season_id) {
      return res.status(400).json({ error: 'Season ID is required' });
    }

    console.log('Loading dashboard statistics for season:', season_id, 'compare to:', compare_season_id);

    // Get current season data
    const currentSeason = await getCurrentSeason(season_id);
    if (!currentSeason) {
      return res.status(404).json({ error: 'Season not found' });
    }

    // Get comparison season data
    let comparisonSeason = null;
    if (compare_season_id && compare_season_id !== '' && compare_season_id !== 'none') {
      console.log('Using provided comparison season ID:', compare_season_id);
      comparisonSeason = await getSeasonById(compare_season_id);
      if (!comparisonSeason) {
        console.log('Provided comparison season not found, will use previous year');
        comparisonSeason = await getPreviousSeason(currentSeason.year);
      }
    } else {
      console.log('No comparison season provided, using previous year');
      comparisonSeason = await getPreviousSeason(currentSeason.year);
    }
    
    console.log('Comparison season determined as:', comparisonSeason?.name || 'none');
    
    // Load all data in parallel for better performance
    const [
      registrationStats,
      divisionStats,
      volunteerStats,
      workBondStats,
      volunteerByDivision
    ] = await Promise.all([
      getRegistrationStatistics(season_id, comparisonSeason?.id),
      getDivisionStatistics(season_id, comparisonSeason?.id),
      getVolunteerStatistics(season_id),
      getWorkBondStatistics(season_id),
      getVolunteerByDivision(season_id) // FIXED: Changed seasonId to season_id
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
      
      // Volunteer breakdown by division
      volunteerByDivision: volunteerByDivision,
      
      // Season Info
      currentSeason: currentSeason,
      previousSeason: comparisonSeason
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

// Helper function to get any season by ID
async function getSeasonById(seasonId) {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', seasonId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      console.log(`Season with ID ${seasonId} not found`);
      return null;
    }
    throw error;
  }
  return data;
}

// Helper function to get previous season (fallback)
async function getPreviousSeason(currentYear) {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', currentYear - 1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || null;
}

// Get registration statistics
async function getRegistrationStatistics(currentSeasonId, comparisonSeasonId) {
  // Current season players
  const { data: currentPlayers, error: currentError } = await supabase
    .from('players')
    .select('id, is_new_player, team_id, payment_received, status')
    .eq('season_id', currentSeasonId);

  if (currentError) throw currentError;

  // Comparison season players
  let comparisonPlayers = [];
  if (comparisonSeasonId) {
    const { data: compData, error: compError } = await supabase
      .from('players')
      .select('id')
      .eq('season_id', comparisonSeasonId);

    if (compError) throw compError;
    comparisonPlayers = compData || [];
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
  const withdrawnPlayers = currentPlayers.filter(p => p.status === 'withdrawn').length;

  return {
    totalRegistered: currentPlayers.length,
    pendingRegistrations: pendingRegistrations,
    totalWithPending: currentPlayers.length,
    playersNotReturning: withdrawnPlayers,
    newPlayers: newPlayers,
    returningPlayers: returningPlayers,
    totalTeams: teams.length
  };
}

// Get division statistics with trends - using program_title
async function getDivisionStatistics(currentSeasonId, comparisonSeasonId) {
  console.log('Fetching division stats: current season', currentSeasonId, 'comparison season', comparisonSeasonId);
  
  // Get players with their program_title for current season
  const { data: currentPlayers, error: currentError } = await supabase
    .from('players')
    .select('id, is_new_player, program_title, team_id, status')
    .eq('season_id', currentSeasonId);

  if (currentError) throw currentError;

  // Get players with program_title for comparison season
  let comparisonPlayers = [];
  if (comparisonSeasonId) {
    console.log('Fetching comparison players for season:', comparisonSeasonId);
    const { data: compData, error: compError } = await supabase
      .from('players')
      .select('id, is_new_player, program_title, team_id, status')
      .eq('season_id', comparisonSeasonId);

    if (compError) throw compError;
    comparisonPlayers = compData || [];
    console.log('Found', comparisonPlayers.length, 'comparison players');
  } else {
    console.log('No comparison season ID provided');
  }

  // Group current players by program_title (division)
  const currentDivisionMap = {};
  currentPlayers.forEach(player => {
    const divisionName = player.program_title || 'Unassigned';
    if (!currentDivisionMap[divisionName]) {
      currentDivisionMap[divisionName] = {
        players: [],
        newPlayers: 0,
        returningPlayers: 0,
        withdrawnPlayers: 0
      };
    }
    currentDivisionMap[divisionName].players.push(player);
    
    // Count withdrawn players
    if (player.status === 'withdrawn') {
      currentDivisionMap[divisionName].withdrawnPlayers++;
    }
    
    // Count new vs returning players
    if (player.is_new_player) {
      currentDivisionMap[divisionName].newPlayers++;
    } else {
      currentDivisionMap[divisionName].returningPlayers++;
    }
  });

  // Group comparison players by program_title (division)
  const comparisonDivisionMap = {};
  comparisonPlayers.forEach(player => {
    const divisionName = player.program_title || 'Unassigned';
    if (!comparisonDivisionMap[divisionName]) {
      comparisonDivisionMap[divisionName] = {
        players: [],
        newPlayers: 0,
        returningPlayers: 0,
        withdrawnPlayers: 0
      };
    }
    comparisonDivisionMap[divisionName].players.push(player);
    
    // Count withdrawn players for comparison season too
    if (player.status === 'withdrawn') {
      comparisonDivisionMap[divisionName].withdrawnPlayers++;
    }
    
    // Count new vs returning players for comparison season
    if (player.is_new_player) {
      comparisonDivisionMap[divisionName].newPlayers++;
    } else {
      comparisonDivisionMap[divisionName].returningPlayers++;
    }
  });

  // Count teams per division based on program_title for current season
  const currentTeamsPerDivision = {};
  currentPlayers.forEach(player => {
    if (player.team_id && player.program_title) {
      const divisionName = player.program_title;
      if (!currentTeamsPerDivision[divisionName]) {
        currentTeamsPerDivision[divisionName] = new Set();
      }
      currentTeamsPerDivision[divisionName].add(player.team_id);
    }
  });

  // Count teams per division based on program_title for comparison season
  const comparisonTeamsPerDivision = {};
  comparisonPlayers.forEach(player => {
    if (player.team_id && player.program_title) {
      const divisionName = player.program_title;
      if (!comparisonTeamsPerDivision[divisionName]) {
        comparisonTeamsPerDivision[divisionName] = new Set();
      }
      comparisonTeamsPerDivision[divisionName].add(player.team_id);
    }
  });

  // Convert sets to counts
  const currentTeamsPerDivisionCount = {};
  Object.keys(currentTeamsPerDivision).forEach(divisionName => {
    currentTeamsPerDivisionCount[divisionName] = currentTeamsPerDivision[divisionName].size;
  });

  const comparisonTeamsPerDivisionCount = {};
  Object.keys(comparisonTeamsPerDivision).forEach(divisionName => {
    comparisonTeamsPerDivisionCount[divisionName] = comparisonTeamsPerDivision[divisionName].size;
  });

  // Create division stats array
  const divisionStats = [];

  // Add divisions with current players
  Object.keys(currentDivisionMap).forEach(divisionName => {
    const currentData = currentDivisionMap[divisionName];
    const comparisonData = comparisonDivisionMap[divisionName] || {
      players: [],
      newPlayers: 0,
      returningPlayers: 0,
      withdrawnPlayers: 0
    };
    
    const currentCount = currentData.players.length;
    const comparisonCount = comparisonData.players.length;
    
    // Calculate active counts (excluding withdrawn) for BOTH seasons
    const activeCurrentCount = currentCount - currentData.withdrawnPlayers;
    const activeComparisonCount = comparisonCount - comparisonData.withdrawnPlayers;
    
    // Calculate trend based on active players (not withdrawn)
    const trend = activeCurrentCount > activeComparisonCount ? 'up' : 
                 activeCurrentCount < activeComparisonCount ? 'down' : 'neutral';

    divisionStats.push({
      name: divisionName,
      current: activeCurrentCount, // Current season: active players (excluding withdrawn)
      previous: activeComparisonCount, // Comparison season: ALSO active players (excluding withdrawn)
      trend: trend,
      newPlayers: currentData.newPlayers,
      returningPlayers: currentData.returningPlayers,
      teams: currentTeamsPerDivisionCount[divisionName] || 0,
      withdrawnPlayers: currentData.withdrawnPlayers,
      totalRegistered: currentCount
    });
  });

  // Add divisions that only existed in comparison season (with 0 current players)
  Object.keys(comparisonDivisionMap).forEach(divisionName => {
    if (!currentDivisionMap[divisionName]) {
      const comparisonData = comparisonDivisionMap[divisionName];
      const comparisonCount = comparisonData.players.length;
      const activeComparisonCount = comparisonCount - comparisonData.withdrawnPlayers;
      
      divisionStats.push({
        name: divisionName,
        current: 0,
        previous: activeComparisonCount, // Comparison season: active players (excluding withdrawn)
        trend: 'down',
        newPlayers: 0,
        returningPlayers: 0,
        teams: 0,
        withdrawnPlayers: 0,
        totalRegistered: 0
      });
    }
  });

  // Sort divisions by current count (descending)
  divisionStats.sort((a, b) => b.current - a.current);

  console.log('Division stats generated with', divisionStats.length, 'entries');
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

// Get volunteer breakdown by division
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
      return [];
    }

    console.log(`Found ${volunteers?.length || 0} volunteers`);

    // Group volunteers by division and role
    const divisionMap = {};
    
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

    defaultDivisions.forEach(divisionName => {
      divisionMap[divisionName] = {
        name: divisionName,
        teamManagers: 0,
        assistantCoaches: 0,
        teamParents: 0,
        divisionTotal: 0
      };
    });

    volunteers.forEach(volunteer => {
      const divisionName = volunteer.division?.name || 'Unassigned';
      
      if (!divisionMap[divisionName]) {
        divisionMap[divisionName] = {
          name: divisionName,
          teamManagers: 0,
          assistantCoaches: 0,
          teamParents: 0,
          divisionTotal: 0
        };
      }

      if (volunteer.role === 'Manager') {
        divisionMap[divisionName].teamManagers++;
      } else if (volunteer.role === 'Assistant Coach' || volunteer.role === 'Coach') {
        divisionMap[divisionName].assistantCoaches++;
      } else if (volunteer.role === 'Team Parent') {
        divisionMap[divisionName].teamParents++;
      }
      
      divisionMap[divisionName].divisionTotal++;
    });

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
    return [];
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