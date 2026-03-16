import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Save, Download, Plus, Trash2, Edit, TestTube, Database, Users, CalendarClock } from 'lucide-react';
import Modal from '../components/Modal'; // Adjust path as needed
import api, { divisionsAPI, teamsAPI, seasonsAPI, dashboardAPI } from '../services/api';

const GameScheduler = () => {
  // Configuration state
  const [seasonStartDate, setSeasonStartDate] = useState('');
  const [seasonWeeks, setSeasonWeeks] = useState(10);
  const [divisions, setDivisions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');

  // Dashboard stats for registration counts
  const [dashboardStats, setDashboardStats] = useState({
    divisions: [] // This will contain division registration data
  });
  const [loadingStats, setLoadingStats] = useState(false);

  // Test Mode State
  const [isTestMode, setIsTestMode] = useState(false);
  const [testDivisionConfig, setTestDivisionConfig] = useState([]);
  const [showTestConfigModal, setShowTestConfigModal] = useState(false);
  const [isTestConfigSaved, setIsTestConfigSaved] = useState(false);

  // Schedule configuration state
  const [scheduleConfig, setScheduleConfig] = useState([]);
  const [generatedGames, setGeneratedGames] = useState([]);

  // Modal states
  const [showAddTimeModal, setShowAddTimeModal] = useState(false);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  // Form states
  const [newTimeForm, setNewTimeForm] = useState({ day: 'Monday', time: '18:00:00' });
  const [newFieldName, setNewFieldName] = useState('');
  const [editingSlot, setEditingSlot] = useState(null);
  const [editForm, setEditForm] = useState({ day: '', time: '' });

  // Days of week
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const defaultTimes = ['17:45:00', '19:45:00'];
  const defaultFields = ['Field #1', 'Field #2', 'Field #3'];

  // Slot templates from Excel
  const slotTemplates = {
    2: [
      [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1],
      [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1],
      [1, 2], [2, 1], [1, 2], [2, 1], [1, 2], [2, 1]
    ],
  3: [
      [1, 2], [2, 3], [3, 1], [3, 2], [1, 3], [1, 2],
      [3, 1], [1, 2], [2, 3], [2, 1], [3, 2], [1, 3],
      [2, 3], [3, 1], [2, 1], [1, 3], [2, 1], [3, 2]
    ],
    4: [
      [1, 2], [3, 4], [2, 3], [4, 1], [3, 1], [2, 4],
      [1, 4], [3, 2], [4, 2], [1, 3], [2, 1], [4, 3],
      [4, 3], [2, 1], [1, 4], [3, 2], [4, 2], [1, 3],
      [2, 3], [4, 1], [3, 4], [1, 2], [3, 1], [2, 4]
    ],
    5: [
      [1, 2], [3, 4], [5, 1], [2, 3], [4, 5], [1, 3],
      [4, 1], [3, 5], [5, 2], [2, 4], [2, 1], [4, 3],
      [1, 5], [3, 2], [5, 4], [3, 1], [1, 4], [5, 3],
      [5, 2], [4, 2]
    ],
    6: [
      [3, 2], [1, 5], [6, 4], [3, 1], [6, 2], [5, 4],
      [1, 4], [3, 2], [6, 5], [3, 6], [5, 1], [4, 2],
      [5, 3], [6, 4], [1, 2], [2, 5], [4, 3], [1, 6],
      [6, 2], [5, 4], [1, 3], [1, 4], [2, 5], [3, 6]
    ],
    7: [
      [1, 2], [3, 4], [5, 6], [7, 1], [2, 3], [4, 5], [6, 7],
      [5, 3], [4, 1], [7, 2], [3, 6], [4, 7], [1, 6], [2, 5],
      [6, 4], [3, 7], [1, 5], [6, 2], [7, 5], [2, 4], [3, 1]
    ],
    8: [
      [1, 2], [3, 4], [5, 6], [7, 8], [6, 8], [5, 7], [2, 4], [1, 3],
      [5, 4], [1, 8], [7, 3], [2, 6], [3, 6], [7, 2], [1, 5], [8, 4],
      [7, 1], [4, 6], [3, 8], [5, 2], [2, 3], [8, 5], [4, 1], [6, 7]
    ],
	10: [
  [1, 2], [3, 4], [5, 6], [7, 8], [9, 10],
  [2, 3], [4, 5], [6, 7], [8, 9], [10, 1],
  [1, 3], [4, 6], [7, 9], [2, 10], [5, 8],
  [3, 5], [6, 8], [9, 1], [10, 4], [2, 7],
  [4, 1], [5, 7], [8, 10], [3, 9], [6, 2],
  [7, 2], [8, 1], [9, 5], [10, 3], [4, 8],
  [5, 9], [1, 6], [2, 4], [3, 7], [8, 3],
  [9, 4], [10, 5], [6, 1], [7, 3], [4, 9],
  [5, 10], [1, 7], [2, 8], [3, 6], [9, 2],
  [10, 6], [1, 8], [2, 5], [3, 10], [4, 7],
  [6, 3], [7, 4], [8, 5], [9, 6], [10, 7],
  [1, 9], [2, 6], [3, 8], [4, 2], [5, 1],
  [6, 4], [7, 5], [8, 2], [9, 3], [10, 8],
  [1, 4], [2, 9], [3, 1], [4, 10], [5, 3],
  [6, 9], [7, 10], [8, 6], [9, 7], [10, 9]
	],
	12: [
    [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12],
    [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 1],
    [1, 3], [4, 6], [7, 9], [10, 12], [2, 11], [5, 8],
    [3, 5], [6, 8], [9, 11], [12, 2], [1, 10], [4, 7],
    [2, 4], [5, 7], [8, 10], [11, 1], [3, 12], [6, 9],
    [4, 6], [7, 9], [10, 12], [1, 3], [2, 8], [5, 11],
    [3, 7], [8, 12], [1, 5], [6, 10], [11, 4], [2, 9],
    [7, 11], [12, 4], [5, 9], [10, 2], [3, 6], [8, 1],
    [4, 8], [9, 1], [2, 6], [7, 11], [12, 5], [3, 10],
    [8, 12], [1, 5], [6, 10], [11, 3], [4, 9], [2, 7],
    [5, 9], [10, 2], [3, 7], [8, 12], [1, 4], [6, 11],
    [9, 1], [2, 6], [7, 11], [12, 5], [4, 8], [10, 3],
    [6, 10], [11, 3], [4, 8], [9, 1], [2, 5], [7, 12],
    [10, 4], [3, 9], [8, 2], [1, 7], [12, 6], [5, 11],
    [7, 1], [12, 8], [5, 3], [10, 6], [11, 9], [2, 4],
    [1, 8], [2, 9], [3, 10], [4, 11], [5, 12], [6, 7]
  ]
  };

  // Helper function to format dates correctly
  const formatDateForDisplay = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Load dashboard stats for registration counts
  const loadDashboardStats = async (seasonId) => {
    if (!seasonId) return;
    
    try {
      setLoadingStats(true);
      console.log('Loading dashboard stats for season:', seasonId);
      
      // Call the same dashboard API that the dashboard page uses
      const dashboardData = await dashboardAPI.getStatistics(seasonId, '');
      
      console.log('Dashboard stats loaded:', dashboardData);
      setDashboardStats(dashboardData);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Load/Save Test Configuration
  useEffect(() => {
    const savedTestMode = localStorage.getItem('gameSchedulerTestMode');
    const savedTestConfig = localStorage.getItem('gameSchedulerTestConfig');
    
    if (savedTestMode) {
      setIsTestMode(savedTestMode === 'true');
    }
    if (savedTestConfig) {
      try {
        setTestDivisionConfig(JSON.parse(savedTestConfig));
        setIsTestConfigSaved(true);
      } catch (e) {
        console.error('Error loading test config:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('gameSchedulerTestMode', isTestMode.toString());
    if (testDivisionConfig.length > 0) {
      localStorage.setItem('gameSchedulerTestConfig', JSON.stringify(testDivisionConfig));
    }
  }, [isTestMode, testDivisionConfig]);

  // Load ALL data including saved configuration
  useEffect(() => {
    const loadAllData = async () => {
      try {
        // First load the saved configuration
        const savedConfig = localStorage.getItem('gameSchedulerConfig');
        const savedSeasonStart = localStorage.getItem('gameSchedulerSeasonStart');
        const savedSeasonWeeks = localStorage.getItem('gameSchedulerSeasonWeeks');
        const savedSelectedSeason = localStorage.getItem('gameSchedulerSelectedSeason');

        // Set the saved values if they exist
        if (savedSeasonStart) setSeasonStartDate(savedSeasonStart);
        if (savedSeasonWeeks) setSeasonWeeks(parseInt(savedSeasonWeeks));

        // Load seasons first so we can default to ACTIVE season
        const [activeRes, seasonsRes] = await Promise.all([
          seasonsAPI.getActive().catch(() => ({ data: null })),
          seasonsAPI.getAll().catch(() => ({ data: [] }))
        ]);

        const active = activeRes?.data || null;
        const allSeasons = Array.isArray(seasonsRes.data) ? seasonsRes.data : [];
        setSeasons(allSeasons);

        const nextSeasonId = active?.id || allSeasons?.[0]?.id || '';
        setSelectedSeason(nextSeasonId);

        // Set schedule config - use saved if available, otherwise initialize
        if (savedConfig) {
          try {
            const parsedConfig = JSON.parse(savedConfig);
            setScheduleConfig(parsedConfig);
            console.log('Loaded saved schedule configuration');
          } catch (error) {
            console.error('Error loading saved configuration:', error);
            initializeScheduleConfig();
          }
        } else {
          initializeScheduleConfig();
        }

        console.log('All data loaded successfully');
      } catch (error) {
        console.error('Error loading data:', error);
        initializeScheduleConfig();
      }
    };

    loadAllData();
  }, []);

  // Load divisions + teams for the selected season
  useEffect(() => {
    const loadSeasonData = async () => {
      if (!selectedSeason) return;
      try {
        const [divisionsRes, teamsRes] = await Promise.all([
          divisionsAPI.getAll({ season_id: selectedSeason }),
          api.get('/teams/with-details', { params: { season_id: selectedSeason } })
        ]);
        setDivisions(Array.isArray(divisionsRes.data) ? divisionsRes.data : []);
        setTeams(Array.isArray(teamsRes.data) ? teamsRes.data : []);
        
        // Also load dashboard stats
        await loadDashboardStats(selectedSeason);
      } catch (e) {
        console.error('Error loading season-specific divisions/teams:', e);
        setDivisions([]);
        setTeams([]);
      }
    };
    loadSeasonData();
  }, [selectedSeason]);

  // Save ALL configuration whenever anything changes
  useEffect(() => {
    if (scheduleConfig.length > 0) {
      localStorage.setItem('gameSchedulerConfig', JSON.stringify(scheduleConfig));
    }
    if (seasonStartDate) {
      localStorage.setItem('gameSchedulerSeasonStart', seasonStartDate);
    }
    if (seasonWeeks) {
      localStorage.setItem('gameSchedulerSeasonWeeks', seasonWeeks.toString());
    }
    if (selectedSeason) {
      localStorage.setItem('gameSchedulerSelectedSeason', selectedSeason);
    }
    console.log('All settings saved to localStorage');
  }, [scheduleConfig, seasonStartDate, seasonWeeks, selectedSeason]);

  const initializeScheduleConfig = () => {
    const initialConfig = daysOfWeek.map(day => 
      defaultTimes.map(time => 
        defaultFields.map(field => ({
          id: `${day}-${time}-${field}`,
          day,
          time,
          field,
          division: ''
        }))
      ).flat()
    ).flat();
    
    setScheduleConfig(initialConfig);
  };

  // Add time slot with modal
  const handleAddTimeSlot = () => {
    const newSlots = getUniqueFields().map(field => ({
      id: `${newTimeForm.day}-${newTimeForm.time}-${field}`,
      day: newTimeForm.day,
      time: newTimeForm.time,
      field,
      division: ''
    }));
    
    setScheduleConfig(prev => [...prev, ...newSlots]);
    setShowAddTimeModal(false);
    setNewTimeForm({ day: 'Monday', time: '18:00:00' });
  };

  // Add field with modal
  const handleAddField = () => {
    if (!newFieldName.trim()) {
      alert('Please enter a field name');
      return;
    }

    const newSlots = getScheduledDays().map(day => 
      getUniqueTimes().map(time => ({
        id: `${day}-${time}-${newFieldName}`,
        day,
        time,
        field: newFieldName,
        division: ''
      }))
    ).flat();
    
    setScheduleConfig(prev => [...prev, ...newSlots]);
    setShowAddFieldModal(false);
    setNewFieldName('');
  };

  // Delete a specific time slot
  const deleteTimeSlot = (slotId) => {
    if (window.confirm('Are you sure you want to delete this time slot?')) {
      setScheduleConfig(prev => prev.filter(slot => slot.id !== slotId));
    }
  };

  // Delete all slots for a specific day and time
  const deleteDayTimeSlot = (day, time) => {
    if (window.confirm(`Delete all ${day} at ${time} slots?`)) {
      setScheduleConfig(prev => prev.filter(slot => !(slot.day === day && slot.time === time)));
    }
  };

  // Edit a time slot - updates ALL fields for that day/time
  const startEditingSlot = (slot) => {
    setEditingSlot(slot);
    setEditForm({ 
      day: slot.day, 
      time: slot.time,
    });
    setShowEditModal(true);
  };

  const saveEditedSlot = () => {
    if (!editForm.day || !editForm.time) {
      alert('Please fill in all fields');
      return;
    }

    // Update ALL slots that have the old day and time
    setScheduleConfig(prev => prev.map(slot => {
      if (slot.day === editingSlot.day && slot.time === editingSlot.time) {
        return {
          ...slot,
          id: `${editForm.day}-${editForm.time}-${slot.field}`,
          day: editForm.day,
          time: editForm.time,
          // Preserve the division assignment
          division: slot.division
        };
      }
      return slot;
    }));

    setShowEditModal(false);
    setEditingSlot(null);
    setEditForm({ day: '', time: '' });
  };

  // Delete a field (all slots for that field)
  const deleteField = (fieldName) => {
    if (window.confirm(`Delete all slots for ${fieldName}?`)) {
      setScheduleConfig(prev => prev.filter(slot => slot.field !== fieldName));
    }
  };

  // Update division assignment
  const updateDivisionAssignment = (index, division) => {
    const updated = [...scheduleConfig];
    updated[index].division = division;
    setScheduleConfig(updated);
  };

  // Get registration count from dashboard stats
  const getRegistrationCount = (divisionName) => {
    if (!dashboardStats?.divisions) return 0;
    
    const division = dashboardStats.divisions.find(d => d.name === divisionName);
    return division?.current || 0;
  };

  // ========== NEW: Calculate game counts per team ==========
  const getGameCountsPerTeam = () => {
    const gameCounts = {};
    
    generatedGames.forEach(game => {
      // Count home games
      if (!gameCounts[game.HomeTeam]) {
        gameCounts[game.HomeTeam] = 0;
      }
      gameCounts[game.HomeTeam]++;
      
      // Count away games
      if (!gameCounts[game.AwayTeam]) {
        gameCounts[game.AwayTeam] = 0;
      }
      gameCounts[game.AwayTeam]++;
    });
    
    return gameCounts;
  };
  // ========== END NEW ==========

  // Test Mode Functions
  const initializeTestConfig = () => {
    // Define the custom order
    const divisionOrder = [
      'T-Ball Division',
      'Baseball - Coach Pitch Division',
      'Baseball - Rookies Division',
      'Baseball - Minors Division',
      'Baseball - Majors Division',
      'Softball - Rookies Division (Coach Pitch)',
      'Softball - Minors Division',
      'Softball - Majors Division',
      'Challenger Division'
    ];

    // Sort divisions according to the custom order
    const sortedDivisions = [...divisions].sort((a, b) => {
      const indexA = divisionOrder.indexOf(a.name);
      const indexB = divisionOrder.indexOf(b.name);
      
      // If division not found in order, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    const initialConfig = sortedDivisions.map(division => ({
      divisionId: division.id,
      divisionName: division.name,
      teamCount: 0
    }));
    
    setTestDivisionConfig(initialConfig);
    setShowTestConfigModal(true);
  };

  const updateTestDivisionCount = (divisionId, teamCount) => {
    setTestDivisionConfig(prev => 
      prev.map(item => 
        item.divisionId === divisionId 
          ? { ...item, teamCount: parseInt(teamCount) || 0 }
          : item
      )
    );
  };

  const saveTestConfig = () => {
    // Validate that at least one division has teams
    const hasTeams = testDivisionConfig.some(d => d.teamCount > 0);
    if (!hasTeams) {
      alert('Please set at least one division with teams');
      return;
    }
    
    setIsTestConfigSaved(true);
    setShowTestConfigModal(false);
    alert('Test configuration saved! You can now generate a test schedule.');
  };

  // Get teams for test mode - uses real team names but filters by test config
  const getTestModeTeams = () => {
    if (!isTestConfigSaved) return {};

    const result = {};
    
    testDivisionConfig.forEach(config => {
      if (config.teamCount > 0) {
        // Find the division
        const division = divisions.find(d => d.id === config.divisionId);
        if (!division) return;

        // Get real teams from this division that have players
        const realTeams = teams.filter(team => 
          team.division_id === config.divisionId && 
          team.players && 
          team.players.length > 0
        );

        if (realTeams.length === 0) {
          // If no real teams, create placeholder teams
          const placeholderTeams = [];
          for (let i = 1; i <= config.teamCount; i++) {
            placeholderTeams.push({
              id: `test-${config.divisionId}-${i}`,
              name: `${division.name} Team ${i}`,
              division_id: config.divisionId,
              players: [{ id: 'placeholder', name: 'Placeholder' }] // Dummy player to pass filter
            });
          }
          result[division.name] = placeholderTeams;
        } else {
          // Use real teams, but only up to the configured count
          result[division.name] = realTeams.slice(0, config.teamCount);
        }
      }
    });

    return result;
  };

  // Get teams by division (only teams with players)
  const getTeamsByDivision = () => {
    if (isTestMode) {
      return getTestModeTeams();
    }

    const teamsWithPlayers = teams.filter(team => 
      team.players && team.players.length > 0
    );

    const grouped = {};
    teamsWithPlayers.forEach(team => {
      if (team.division_id) {
        const division = divisions.find(d => d.id === team.division_id);
        if (division) {
          const divisionName = division.name;
          if (!grouped[divisionName]) {
            grouped[divisionName] = [];
          }
          grouped[divisionName].push(team);
        }
      }
    });

    return grouped;
  };

  // Get unique times and fields for table display
  const getUniqueTimes = () => {
    return [...new Set(scheduleConfig.map(slot => slot.time))].sort();
  };

  const getUniqueFields = () => {
    return [...new Set(scheduleConfig.map(slot => slot.field))].sort();
  };

  // Get days that have scheduled slots
  const getScheduledDays = () => {
    return [...new Set(scheduleConfig.map(slot => slot.day))].sort((a, b) => 
      daysOfWeek.indexOf(a) - daysOfWeek.indexOf(b)
    );
  };

  // Generate games - FIXED to use all available fields at each time slot
  const generateGames = () => {
    if (!seasonStartDate) {
      alert('Please set the season start date');
      return;
    }

    if (!selectedSeason) {
      alert('Please select a season');
      return;
    }

    if (isTestMode && !isTestConfigSaved) {
      alert('Please configure test teams first using the "Configure Test Teams" button');
      return;
    }

    try {
      const teamsByDivision = getTeamsByDivision();
      const games = [];
      let sortOrder = 1;

      const startDate = new Date(seasonStartDate);
      
      // Process each division
      Object.entries(teamsByDivision).forEach(([divisionName, divisionTeams]) => {
        const teamCount = divisionTeams.length;
        
        if (teamCount < 2) {
          console.log(`Skipping division ${divisionName} - not enough teams`);
          return;
        }

        const template = slotTemplates[teamCount] || slotTemplates[Math.min(teamCount, 8)];
        if (!template) {
          console.log(`No template found for ${teamCount} teams`);
          return;
        }

        const divisionSlots = scheduleConfig.filter(slot => 
          slot.division === divisionName
        );

        if (divisionSlots.length === 0) {
          console.log(`No schedule slots configured for division ${divisionName}`);
          return;
        }

        console.log(`Processing ${divisionName}: ${teamCount} teams, ${divisionSlots.length} slots, template length: ${template.length}`);

        // Get unique days for this division
        const divisionDays = [...new Set(divisionSlots.map(slot => slot.day))];
        
        // Find first occurrence of each day after start date
        const firstOccurrences = {};
        divisionDays.forEach(day => {
          const dayOffset = daysOfWeek.indexOf(day);
          // Convert Sunday (0) to 7 for easier calculation
          const startDay = startDate.getDay() === 0 ? 7 : startDate.getDay();
          const targetDay = dayOffset + 1; // Convert to 1-7 (Mon-Sun)
          
          let daysToAdd = targetDay - startDay;
          if (daysToAdd < 0) daysToAdd += 7;
          
          const firstDate = new Date(startDate);
          firstDate.setDate(startDate.getDate() + daysToAdd);
          firstOccurrences[day] = firstDate;
        });

        // Schedule games for ALL weeks of the season
        let matchupIndex = 0;
        
        for (let week = 1; week <= seasonWeeks; week++) {
          console.log(`\nWeek ${week} for ${divisionName}`);
          let gamesScheduledThisWeek = 0;
          
          for (const day of divisionDays) {
            // Calculate game date for this week
            const firstDate = firstOccurrences[day];
            const gameDate = new Date(firstDate);
            gameDate.setDate(firstDate.getDate() + ((week - 1) * 7));
            
            const dateStr = formatDateForDisplay(gameDate);

            const daySlots = divisionSlots.filter(slot => slot.day === day);
            const uniqueTimes = [...new Set(daySlots.map(slot => slot.time))].sort();
            
            for (const time of uniqueTimes) {
              // Get all available slots for this day/time that haven't been used on this date
              const availableSlots = daySlots.filter(slot => 
                slot.time === time && 
                !games.find(g => 
                  g.MatchDate === dateStr &&
                  g.StartTime === time &&
                  g.Field === slot.field
                )
              );

              if (availableSlots.length === 0) continue;

              // Schedule a game on each available field at this time
              for (const fieldSlot of availableSlots) {
                // If we've used all matchups from the template, cycle back to the beginning
                const currentMatchupIndex = matchupIndex % template.length;
                const match = template[currentMatchupIndex];
                const [homeTeamNum, awayTeamNum] = match;
                
                const homeTeam = divisionTeams[homeTeamNum - 1];
                const awayTeam = divisionTeams[awayTeamNum - 1];

                if (!homeTeam || !awayTeam) {
                  matchupIndex++;
                  continue;
                }

                const endTime = calculateEndTime(time);

                games.push({
                  SortOrder: sortOrder++,
                  RoundNo: week,
                  HomeTeam: `${homeTeam.name}`,
                  AwayTeam: `${awayTeam.name}`,
                  MatchDate: dateStr,
                  StartTime: time,
                  EndTime: endTime,
                  Location: 'Sayreville Little League',
                  Field: fieldSlot.field,
                  Division: divisionName
                });

                console.log(`    Scheduled: ${homeTeam.name} vs ${awayTeam.name} at ${time} on ${fieldSlot.field} (matchup ${currentMatchupIndex + 1}/${template.length})`);
                matchupIndex++;
                gamesScheduledThisWeek++;
              }
            }
          }
          
          console.log(`  Week ${week} completed: ${gamesScheduledThisWeek} games scheduled`);
        }

        console.log(`Completed ${divisionName}: ${matchupIndex} total games scheduled`);
      });

      setGeneratedGames(games);
      alert(`Schedule generated successfully! Created ${games.length} games for ${seasonWeeks} weeks. (${isTestMode ? 'TEST MODE' : 'Live Mode'})`);
      
    } catch (error) {
      console.error('Error generating games:', error);
      alert('Error generating schedule: ' + error.message);
    }
  };

  const getManagerName = (team) => {
    if (team.manager) {
      return team.manager.name.split(' ')[1];
    }
    if (team.volunteers && team.volunteers.length > 0) {
      const manager = team.volunteers.find(v => v.role === 'Manager');
      if (manager) return manager.name.split(' ')[0];
    }
    return 'TBD';
  };

  const calculateEndTime = (startTime) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endHours = hours + 2;
    return `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
  };

  // Function to reset ALL configuration
  const resetAllConfiguration = () => {
    if (window.confirm('Are you sure you want to reset ALL configuration? This will clear everything.')) {
      localStorage.removeItem('gameSchedulerConfig');
      localStorage.removeItem('gameSchedulerSeasonStart');
      localStorage.removeItem('gameSchedulerSeasonWeeks');
      localStorage.removeItem('gameSchedulerSelectedSeason');
      localStorage.removeItem('gameSchedulerTestMode');
      localStorage.removeItem('gameSchedulerTestConfig');
      
      setSeasonStartDate('');
      setSeasonWeeks(10);
      setSelectedSeason('');
      setIsTestMode(false);
      setTestDivisionConfig([]);
      setIsTestConfigSaved(false);
      initializeScheduleConfig();
      
      alert('All configuration reset successfully');
    }
  };

  // Function to export schedule config
  const exportScheduleConfig = () => {
    const configData = {
      scheduleConfig,
      seasonStartDate,
      seasonWeeks,
      selectedSeason: seasons.find(s => s.id === selectedSeason)?.name || selectedSeason,
      isTestMode,
      testDivisionConfig,
      isTestConfigSaved,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Function to import schedule config
  const importScheduleConfig = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const configData = JSON.parse(e.target.result);
        setScheduleConfig(configData.scheduleConfig || []);
        if (configData.seasonStartDate) setSeasonStartDate(configData.seasonStartDate);
        if (configData.seasonWeeks) setSeasonWeeks(configData.seasonWeeks);
        if (configData.isTestMode !== undefined) setIsTestMode(configData.isTestMode);
        if (configData.testDivisionConfig) setTestDivisionConfig(configData.testDivisionConfig);
        if (configData.isTestConfigSaved) setIsTestConfigSaved(configData.isTestConfigSaved);
        alert('Schedule configuration imported successfully!');
      } catch (error) {
        alert('Error importing configuration: ' + error.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['SortOrder', 'RoundNo', 'Division', 'HomeTeam', 'AwayTeam', 'MatchDate', 'StartTime', 'EndTime', 'Location', 'Field'];
    const csvContent = [
      headers.join(','),
      ...generatedGames.map(game => 
        headers.map(header => `"${game[header]}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `game-schedule-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Modal footers
  const AddTimeModalFooter = (
    <div className="flex justify-end space-x-3">
      <button onClick={() => setShowAddTimeModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={handleAddTimeSlot} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Add Time Slot</button>
    </div>
  );

  const AddFieldModalFooter = (
    <div className="flex justify-end space-x-3">
      <button onClick={() => setShowAddFieldModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={handleAddField} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Add Field</button>
    </div>
  );

  const EditModalFooter = (
    <div className="flex justify-end space-x-3">
      <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={saveEditedSlot} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">Save Changes</button>
    </div>
  );

  const TestConfigModalFooter = (
    <div className="flex justify-end space-x-3">
      <button onClick={() => setShowTestConfigModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={saveTestConfig} className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700">Save Test Configuration</button>
    </div>
  );

  // Get player counts for display
  const playerCounts = getRegistrationCount;
  
  // ========== NEW: Get game counts for display ==========
  const gameCounts = getGameCountsPerTeam();
  // ========== END NEW ==========

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Game Scheduler</h1>
        <p className="text-gray-600 mt-2">Configure and generate your league game schedule</p>
        {loadingStats && (
          <p className="text-sm text-blue-600 mt-1">Loading registration data...</p>
        )}
      </div>

      {/* Mode Toggle Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold">Mode:</h2>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsTestMode(false)}
                className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
                  !isTestMode 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Database className="h-4 w-4" />
                <span>Live Mode</span>
              </button>
              <button
                onClick={() => setIsTestMode(true)}
                className={`px-4 py-2 rounded-md flex items-center space-x-2 ${
                  isTestMode 
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <TestTube className="h-4 w-4" />
                <span>Test Mode</span>
              </button>
            </div>
          </div>
          {isTestMode && (
            <div className="flex items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                isTestConfigSaved 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {isTestConfigSaved ? 'Test Config Saved' : 'Not Configured'}
              </span>
              <button
                onClick={initializeTestConfig}
                className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700"
              >
                Configure Test Teams
              </button>
            </div>
          )}
        </div>
        {isTestMode && (
          <p className="text-sm text-gray-600 mt-2">
            Test Mode: Configure how many teams per division to test different schedule scenarios.
            {!isTestConfigSaved && ' Click "Configure Test Teams" to get started.'}
          </p>
        )}
      </div>

      {/* Configuration Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Season Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Season Start Date</label>
            <input
              type="date"
              value={seasonStartDate}
              onChange={(e) => setSeasonStartDate(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Season Weeks</label>
            <input
              type="number"
              value={seasonWeeks}
              onChange={(e) => setSeasonWeeks(parseInt(e.target.value))}
              min="1"
              max="20"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">1-20 weeks</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Active Season</label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Season</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Division Assignment Table */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Division Schedule Configuration</h2>
          <div className="flex space-x-2">
            <button onClick={() => setShowAddTimeModal(true)} className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              <Plus className="h-4 w-4 mr-1" /> Add Day/Time
            </button>
            <button onClick={() => setShowAddFieldModal(true)} className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              <Plus className="h-4 w-4 mr-1" /> Add Field
            </button>
          </div>
        </div>

        {/* Field Management */}
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Fields</h3>
          <div className="flex flex-wrap gap-2">
            {getUniqueFields().map(field => (
              <div key={field} className="flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                <MapPin className="h-3 w-3 mr-1" />
                {field}
                <button onClick={() => deleteField(field)} className="ml-2 text-blue-600 hover:text-blue-800">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-2 text-left">Day / Time</th>
                {getUniqueFields().map(field => (
                  <th key={field} className="border border-gray-300 px-4 py-2 text-center">{field}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getScheduledDays().map(day => (
                <React.Fragment key={day}>
                  {getUniqueTimes().map(time => {
                    const slotsForThisTime = scheduleConfig.filter(slot => slot.day === day && slot.time === time);
                    if (slotsForThisTime.length === 0) return null;

                    return (
                      <tr key={`${day}-${time}`} className="hover:bg-gray-50">
                        <td className="border border-gray-300 px-4 py-2 font-medium">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                              {day}
                            </div>
                            <div className="flex items-center text-sm text-gray-500">
                              <Clock className="h-3 w-3 mr-1" />
                              {time}
                            </div>
                            <div className="flex space-x-1">
                              <button onClick={() => startEditingSlot(slotsForThisTime[0])} className="text-gray-400 hover:text-blue-600" title="Edit this time slot">
                                <Edit className="h-3 w-3" />
                              </button>
                              <button onClick={() => deleteDayTimeSlot(day, time)} className="text-gray-400 hover:text-red-600" title="Delete this time slot">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                        {getUniqueFields().map(field => {
                          const slot = slotsForThisTime.find(s => s.field === field);
                          return (
                            <td key={field} className="border border-gray-300 px-4 py-2">
                              {slot ? (
                                <select
                                  value={slot.division}
                                  onChange={(e) => {
                                    const slotIndex = scheduleConfig.findIndex(s => s.id === slot.id);
                                    updateDivisionAssignment(slotIndex, e.target.value);
                                  }}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Select Division</option>
                                  {divisions.map(division => (
                                    <option key={division.id} value={division.name}>{division.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-gray-400 text-sm">No slot</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Time Modal */}
      <Modal isOpen={showAddTimeModal} onClose={() => setShowAddTimeModal(false)} title="Add New Time Slot" footer={AddTimeModalFooter}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
            <select value={newTimeForm.day} onChange={(e) => setNewTimeForm({ ...newTimeForm, day: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              {daysOfWeek.map(day => <option key={day} value={day}>{day}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time (HH:MM:SS)</label>
            <input type="text" value={newTimeForm.time} onChange={(e) => setNewTimeForm({ ...newTimeForm, time: e.target.value })} placeholder="18:00:00" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
            <p className="text-xs text-gray-500 mt-1">Format: HH:MM:SS (24-hour format)</p>
          </div>
        </div>
      </Modal>

      {/* Add Field Modal */}
      <Modal isOpen={showAddFieldModal} onClose={() => setShowAddFieldModal(false)} title="Add New Field" footer={AddFieldModalFooter}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Field Name</label>
          <input type="text" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} placeholder="Field #4" className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
          <p className="text-xs text-gray-500 mt-1">This will create time slots for this field on all existing days and times.</p>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Time Slot" footer={EditModalFooter}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
            <select
              value={editForm.day}
              onChange={(e) => setEditForm({ ...editForm, day: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {daysOfWeek.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time (HH:MM:SS)</label>
            <input
              type="text"
              value={editForm.time}
              onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
              placeholder="17:45:00"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </Modal>

      {/* Test Config Modal with Registration Counts */}
      <Modal isOpen={showTestConfigModal} onClose={() => setShowTestConfigModal(false)} title="Configure Test Teams" footer={TestConfigModalFooter}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set how many teams you want in each division for testing. The system will use real team names if available, or create placeholder names.
          </p>
          {loadingStats && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading registration data...</p>
            </div>
          )}
          {!loadingStats && (
            <div className="max-h-96 overflow-y-auto">
              {testDivisionConfig.map((config) => {
                const division = divisions.find(d => d.id === config.divisionId);
                const realTeamCount = teams.filter(t => t.division_id === config.divisionId && t.players?.length > 0).length;
                const registeredCount = getRegistrationCount(config.divisionName);
                const estimatedTeams = registeredCount > 0 ? Math.ceil(registeredCount / 12) : 0; // Assuming ~12 players per team
                
                return (
                  <div key={config.divisionId} className="mb-4 p-4 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <label className="font-medium text-gray-700">{config.divisionName}</label>
                      <div className="flex items-center space-x-3">
                        <span className="text-sm text-gray-500 flex items-center">
                          <Users className="h-3 w-3 mr-1" />
                          {registeredCount} registered
                        </span>
                        {registeredCount > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Est. {estimatedTeams} teams
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={config.teamCount}
                        onChange={(e) => updateTestDivisionCount(config.divisionId, e.target.value)}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="Number of teams for testing"
                      />
                      {realTeamCount > 0 && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {realTeamCount} real teams
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {config.teamCount > realTeamCount 
                        ? `Will create ${config.teamCount - realTeamCount} placeholder team(s)`
                        : config.teamCount > 0 ? 'Using real teams only' : 'No teams selected'}
                    </p>
                    {registeredCount > 0 && config.teamCount > 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        ~{Math.round(registeredCount / config.teamCount)} players per team
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* ========== UPDATED: Team Summary with Game Counts ========== */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Team Summary {isTestMode && '(Test Mode)'}
          {generatedGames.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({Object.keys(gameCounts).length} teams, {generatedGames.length} total games)
            </span>
          )}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(getTeamsByDivision()).map(([divisionName, divisionTeams]) => {
            const registeredCount = getRegistrationCount(divisionName);
            return (
              <div key={divisionName} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{divisionName}</h3>
                  <span className="text-sm text-gray-500 flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    {registeredCount} registered
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">{divisionTeams.length} team{divisionTeams.length !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {divisionTeams.map((team, index) => {
                    const gameCount = gameCounts[team.name] || 0;
                    return (
                      <div key={team.id} className="flex justify-between items-center text-sm">
                        <span className="flex items-center">
                          <span className="font-medium mr-2">{index + 1}.</span>
                          {team.name}
                          {generatedGames.length > 0 && (
                            <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              gameCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                            }`}>
                              <CalendarClock className="h-3 w-3 mr-1" />
                              {gameCount} {gameCount === 1 ? 'game' : 'games'}
                            </span>
                          )}
                        </span>
                        <span className="text-gray-500">
                          {team.id.toString().startsWith('test-') ? '🔄 Placeholder' : `${team.players?.length || 0} players`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* ========== NEW: Division game count summary ========== */}
                {generatedGames.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center text-xs text-gray-500">
                      <span>Division games:</span>
                      <span className="font-medium">
                        {divisionTeams.reduce((sum, team) => sum + (gameCounts[team.name] || 0), 0) / 2} games
                      </span>
                    </div>
                  </div>
                )}
                {/* ========== END NEW ========== */}
              </div>
            );
          })}
        </div>
      </div>
      {/* ========== END UPDATED ========== */}

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4 mb-6">
        <button 
          onClick={generateGames} 
          className={`inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white ${
            isTestMode 
              ? 'bg-purple-600 hover:bg-purple-700' 
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          <Save className="h-5 w-5 mr-2" /> 
          {isTestMode ? 'Generate Test Schedule' : 'Generate Schedule'}
        </button>
        {generatedGames.length > 0 && (
          <button onClick={exportToCSV} className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700">
            <Download className="h-5 w-5 mr-2" /> Export to CSV
          </button>
        )}
      </div>

      {/* Configuration Management Buttons */}
      <div className="flex justify-center space-x-4 mb-6">
        <button onClick={exportScheduleConfig} className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
          <Download className="h-4 w-4 mr-2" /> Export Config
        </button>
        <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
          <Save className="h-4 w-4 mr-2" /> Import Config
          <input type="file" accept=".json" onChange={importScheduleConfig} className="hidden" />
        </label>
        <button onClick={resetAllConfiguration} className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50">
          <Trash2 className="h-4 w-4 mr-2" /> Reset All
        </button>
      </div>

      {/* Generated Schedule */}
      {generatedGames.length > 0 && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">
            Generated Schedule {isTestMode && '(Test Mode)'}
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2">SortOrder</th>
                  <th className="border border-gray-300 px-4 py-2">RoundNo</th>
                  <th className="border border-gray-300 px-4 py-2">Division</th>
                  <th className="border border-gray-300 px-4 py-2">HomeTeam</th>
                  <th className="border border-gray-300 px-4 py-2">AwayTeam</th>
                  <th className="border border-gray-300 px-4 py-2">MatchDate</th>
                  <th className="border border-gray-300 px-4 py-2">StartTime</th>
                  <th className="border border-gray-300 px-4 py-2">EndTime</th>
                  <th className="border border-gray-300 px-4 py-2">Location</th>
                  <th className="border border-gray-300 px-4 py-2">Field</th>
                </tr>
              </thead>
              <tbody>
                {generatedGames.map(game => (
                  <tr key={game.SortOrder} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2 text-center">{game.SortOrder}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">{game.RoundNo}</td>
                    <td className="border border-gray-300 px-4 py-2">{game.Division || ''}</td>
                    <td className="border border-gray-300 px-4 py-2">{game.HomeTeam}</td>
                    <td className="border border-gray-300 px-4 py-2">{game.AwayTeam}</td>
                    <td className="border border-gray-300 px-4 py-2">{game.MatchDate}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">{game.StartTime}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">{game.EndTime}</td>
                    <td className="border border-gray-300 px-4 py-2">{game.Location}</td>
                    <td className="border border-gray-300 px-4 py-2 text-center">{game.Field}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameScheduler;