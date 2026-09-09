import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Save, Download, Plus, Trash2, Edit, TestTube, Database, Users, CalendarClock, Layers, CalendarRange } from 'lucide-react';
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

  // Game Duration Configuration per Division
  const [divisionDurations, setDivisionDurations] = useState({});
  const [showDurationModal, setShowDurationModal] = useState(false);

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
  const [durationForm, setDurationForm] = useState({ divisionId: '', durationHours: 2 });

  // Days of week
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const defaultTimes = ['17:45:00', '19:45:00'];
  const defaultFields = ['Field #1', 'Field #2', 'Field #3'];

  // Default game duration in minutes (2 hours)
  const DEFAULT_GAME_DURATION_MINUTES = 120;

  // Slot templates from Excel - UPDATED 12-team template for complete round-robin
  const slotTemplates = {
  2: [
    [1, 2]
  ],

  3: [
    // Week 1
    [2, 3],
    // Week 2
    [1, 3],
    // Week 3
    [1, 2]
  ],

  4: [
    // Week 1
    [1, 4], [2, 3],
    // Week 2
    [3, 1], [4, 2],
    // Week 3
    [1, 2], [3, 4]
  ],

  5: [
    // Week 1
    [2, 5], [3, 4],
    // Week 2
    [1, 5], [2, 3],
    // Week 3
    [4, 1], [5, 3],
    // Week 4
    [3, 1], [4, 2],
    // Week 5
    [1, 2], [5, 4]
  ],

  6: [
    // Week 1
    [1, 6], [2, 5], [3, 4],
    // Week 2
    [5, 1], [4, 6], [2, 3],
    // Week 3
    [1, 4], [3, 5], [6, 2],
    // Week 4
    [1, 3], [4, 2], [5, 6],
    // Week 5
    [2, 1], [6, 3], [4, 5]
  ],

  7: [
    // Week 1
    [2, 7], [3, 6], [4, 5],
    // Week 2
    [1, 7], [5, 2], [3, 4],
    // Week 3
    [6, 1], [7, 5], [2, 3],
    // Week 4
    [5, 1], [4, 6], [7, 3],
    // Week 5
    [1, 4], [3, 5], [6, 2],
    // Week 6
    [1, 3], [2, 4], [6, 7],
    // Week 7
    [2, 1], [4, 7], [5, 6]
  ],

  8: [
    // Week 1
    [1, 8], [2, 7], [3, 6], [4, 5],
    // Week 2
    [7, 1], [6, 8], [5, 2], [3, 4],
    // Week 3
    [1, 6], [5, 7], [8, 4], [2, 3],
    // Week 4
    [1, 5], [4, 6], [7, 3], [8, 2],
    // Week 5
    [4, 1], [3, 5], [6, 2], [7, 8],
    // Week 6
    [1, 3], [2, 4], [5, 8], [6, 7],
    // Week 7
    [2, 1], [8, 3], [4, 7], [5, 6]
  ],

  9: [
    // Week 1
    [2, 9], [3, 8], [4, 7], [5, 6],
    // Week 2
    [1, 9], [7, 2], [6, 3], [4, 5],
    // Week 3
    [8, 1], [9, 7], [2, 5], [3, 4],
    // Week 4
    [1, 7], [6, 8], [5, 9], [2, 3],
    // Week 5
    [1, 6], [7, 5], [8, 4], [9, 3],
    // Week 6
    [5, 1], [4, 6], [3, 7], [8, 2],
    // Week 7
    [1, 4], [3, 5], [6, 2], [9, 8],
    // Week 8
    [1, 3], [2, 4], [6, 9], [7, 8],
    // Week 9
    [2, 1], [4, 9], [8, 5], [7, 6]
  ],

  10: [
    // Week 1
    [1, 10], [2, 9], [3, 8], [4, 7], [5, 6],
    // Week 2
    [9, 1], [8, 10], [7, 2], [6, 3], [4, 5],
    // Week 3
    [1, 8], [7, 9], [10, 6], [2, 5], [3, 4],
    // Week 4
    [1, 7], [8, 6], [5, 9], [10, 4], [3, 2],
    // Week 5
    [6, 1], [5, 7], [4, 8], [9, 3], [2, 10],
    // Week 6
    [1, 5], [6, 4], [7, 3], [8, 2], [9, 10],
    // Week 7
    [4, 1], [3, 5], [2, 6], [10, 7], [8, 9],
    // Week 8
    [1, 3], [2, 4], [5, 10], [6, 9], [7, 8],
    // Week 9
    [1, 2], [10, 3], [9, 4], [5, 8], [6, 7]
  ],

  11: [
    // Week 1
    [2, 11], [3, 10], [4, 9], [5, 8], [6, 7],
    // Week 2
    [1, 11], [9, 2], [8, 3], [7, 4], [5, 6],
    // Week 3
    [10, 1], [11, 9], [2, 7], [3, 6], [4, 5],
    // Week 4
    [1, 9], [8, 10], [7, 11], [2, 5], [4, 3],
    // Week 5
    [1, 8], [9, 7], [6, 10], [5, 11], [3, 2],
    // Week 6
    [7, 1], [6, 8], [9, 5], [10, 4], [11, 3],
    // Week 7
    [1, 6], [5, 7], [8, 4], [3, 9], [10, 2],
    // Week 8
    [1, 5], [4, 6], [7, 3], [2, 8], [11, 10],
    // Week 9
    [4, 1], [3, 5], [6, 2], [8, 11], [9, 10],
    // Week 10
    [1, 3], [2, 4], [11, 6], [10, 7], [8, 9],
    // Week 11
    [2, 1], [11, 4], [5, 10], [6, 9], [7, 8]
  ],

  12: [
    // Week 1
    [1, 12], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7],
    // Week 2
    [11, 1], [10, 12], [9, 2], [8, 3], [7, 4], [5, 6],
    // Week 3
    [1, 10], [9, 11], [12, 8], [2, 7], [3, 6], [4, 5],
    // Week 4
    [1, 9], [8, 10], [7, 11], [6, 12], [5, 2], [3, 4],
    // Week 5
    [8, 1], [7, 9], [10, 6], [11, 5], [12, 4], [2, 3],
    // Week 6
    [1, 7], [6, 8], [9, 5], [4, 10], [3, 11], [12, 2],
    // Week 7
    [6, 1], [5, 7], [8, 4], [9, 3], [10, 2], [11, 12],
    // Week 8
    [1, 5], [4, 6], [7, 3], [2, 8], [12, 9], [10, 11],
    // Week 9
    [4, 1], [3, 5], [6, 2], [7, 12], [11, 8], [9, 10],
    // Week 10
    [1, 3], [2, 4], [5, 12], [11, 6], [10, 7], [8, 9],
    // Week 11
    [2, 1], [12, 3], [4, 11], [5, 10], [6, 9], [7, 8]
  ],

  13: [
    // Week 1
    [2, 13], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8],
    // Week 2
    [1, 13], [11, 2], [10, 3], [9, 4], [8, 5], [6, 7],
    // Week 3
    [12, 1], [13, 11], [2, 9], [3, 8], [4, 7], [5, 6],
    // Week 4
    [1, 11], [10, 12], [9, 13], [7, 2], [3, 6], [5, 4],
    // Week 5
    [1, 10], [11, 9], [8, 12], [13, 7], [2, 5], [4, 3],
    // Week 6
    [9, 1], [8, 10], [7, 11], [12, 6], [13, 5], [2, 3],
    // Week 7
    [1, 8], [7, 9], [10, 6], [5, 11], [12, 4], [3, 13],
    // Week 8
    [1, 7], [6, 8], [9, 5], [4, 10], [11, 3], [2, 12],
    // Week 9
    [6, 1], [5, 7], [8, 4], [3, 9], [10, 2], [12, 13],
    // Week 10
    [1, 5], [4, 6], [7, 3], [8, 2], [13, 10], [11, 12],
    // Week 11
    [4, 1], [3, 5], [2, 6], [13, 8], [9, 12], [10, 11],
    // Week 12
    [1, 3], [2, 4], [6, 13], [12, 7], [11, 8], [9, 10],
    // Week 13
    [1, 2], [13, 4], [5, 12], [6, 11], [7, 10], [8, 9]
  ],

  14: [
    // Week 1
    [1, 14], [2, 13], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8],
    // Week 2
    [13, 1], [12, 14], [11, 2], [10, 3], [9, 4], [8, 5], [6, 7],
    // Week 3
    [1, 12], [11, 13], [14, 10], [2, 9], [3, 8], [4, 7], [5, 6],
    // Week 4
    [1, 11], [10, 12], [9, 13], [8, 14], [7, 2], [3, 6], [5, 4],
    // Week 5
    [10, 1], [9, 11], [12, 8], [13, 7], [6, 14], [2, 5], [4, 3],
    // Week 6
    [1, 9], [8, 10], [11, 7], [12, 6], [13, 5], [14, 4], [2, 3],
    // Week 7
    [8, 1], [7, 9], [6, 10], [5, 11], [4, 12], [3, 13], [14, 2],
    // Week 8
    [7, 1], [6, 8], [9, 5], [10, 4], [11, 3], [12, 2], [13, 14],
    // Week 9
    [1, 6], [5, 7], [4, 8], [3, 9], [2, 10], [14, 11], [12, 13],
    // Week 10
    [1, 5], [6, 4], [7, 3], [8, 2], [9, 14], [10, 13], [11, 12],
    // Week 11
    [4, 1], [3, 5], [2, 6], [14, 7], [13, 8], [9, 12], [11, 10],
    // Week 12
    [1, 3], [2, 4], [5, 14], [13, 6], [12, 7], [8, 11], [10, 9],
    // Week 13
    [1, 2], [14, 3], [4, 13], [5, 12], [6, 11], [7, 10], [8, 9]
  ]
};

  // Helper function to format dates correctly
  const formatDateForDisplay = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper function to parse time string to minutes since midnight
  const timeToMinutes = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Helper function to convert minutes to time string (HH:MM:SS)
  const minutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  };

  // Calculate end time based on next game on same field or division duration
  const calculateEndTimeWithContext = (startTime, field, dateStr, divisionName, allGamesForDate, gameIndex, divisionDurationMinutes = null) => {
    // First, check if there's a division-specific duration set
    let durationMinutes = divisionDurationMinutes || DEFAULT_GAME_DURATION_MINUTES;
    
    // Get all games on the same field for the same date
    const gamesOnSameField = allGamesForDate
      .filter(g => g.Field === field)
      .sort((a, b) => a.StartTime.localeCompare(b.StartTime));
    
    // Find this game's position in the list
    const currentGameIndex = gamesOnSameField.findIndex(g => g.StartTime === startTime);
    
    // If there's a next game on the same field, end time should be the next game's start time
    if (currentGameIndex !== -1 && currentGameIndex + 1 < gamesOnSameField.length) {
      const nextGameStartTime = gamesOnSameField[currentGameIndex + 1].StartTime;
      const startMinutes = timeToMinutes(startTime);
      const nextStartMinutes = timeToMinutes(nextGameStartTime);
      
      // Calculate the duration between games
      const gapMinutes = nextStartMinutes - startMinutes;
      
      // If the gap is less than the default duration, use the gap (back-to-back games)
      if (gapMinutes < durationMinutes) {
        return nextGameStartTime; // End when next game starts
      }
    }
    
    // If no next game or gap is larger than default, use the configured duration
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + durationMinutes;
    return minutesToTime(endMinutes);
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
    const savedDivisionDurations = localStorage.getItem('gameSchedulerDivisionDurations');
    
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
    if (savedDivisionDurations) {
      try {
        setDivisionDurations(JSON.parse(savedDivisionDurations));
      } catch (e) {
        console.error('Error loading division durations:', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('gameSchedulerTestMode', isTestMode.toString());
    if (testDivisionConfig.length > 0) {
      localStorage.setItem('gameSchedulerTestConfig', JSON.stringify(testDivisionConfig));
    }
    localStorage.setItem('gameSchedulerDivisionDurations', JSON.stringify(divisionDurations));
  }, [isTestMode, testDivisionConfig, divisionDurations]);

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

  // Add field with modal - FIXED: Only add slots for existing day/time combinations that already have slots
  const handleAddField = () => {
    if (!newFieldName.trim()) {
      alert('Please enter a field name');
      return;
    }

    // Get existing day/time combinations that have at least one slot
    const existingCombinations = new Set();
    scheduleConfig.forEach(slot => {
      existingCombinations.add(`${slot.day}-${slot.time}`);
    });

    // Create new slots for each existing day/time combination
    const newSlots = Array.from(existingCombinations).map(combo => {
      const [day, time] = combo.split('-');
      return {
        id: `${day}-${time}-${newFieldName}`,
        day,
        time,
        field: newFieldName,
        division: ''
      };
    });
    
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

  // Get division duration
  const getDivisionDuration = (divisionName) => {
    const division = divisions.find(d => d.name === divisionName);
    if (division && divisionDurations[division.id]) {
      return divisionDurations[division.id];
    }
    return DEFAULT_GAME_DURATION_MINUTES;
  };

  // Set division duration
  const setDivisionDuration = (divisionId, durationHours) => {
    setDivisionDurations(prev => ({
      ...prev,
      [divisionId]: durationHours * 60 // Store in minutes
    }));
  };

  // Calculate game counts per team
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

  // Calculate opponent matchup counts for each team
  const getOpponentCountsByTeam = () => {
    const opponentCounts = {};

    generatedGames.forEach(game => {
      if (!opponentCounts[game.HomeTeam]) {
        opponentCounts[game.HomeTeam] = {};
      }
      if (!opponentCounts[game.AwayTeam]) {
        opponentCounts[game.AwayTeam] = {};
      }

      opponentCounts[game.HomeTeam][game.AwayTeam] =
        (opponentCounts[game.HomeTeam][game.AwayTeam] || 0) + 1;

      opponentCounts[game.AwayTeam][game.HomeTeam] =
        (opponentCounts[game.AwayTeam][game.HomeTeam] || 0) + 1;
    });

    return opponentCounts;
  };

  // Get slot counts per division
  const getDivisionSlotCounts = () => {
    const slotCounts = {};
    
    // Initialize all divisions with 0
    divisions.forEach(division => {
      slotCounts[division.name] = 0;
    });
    
    // Count slots assigned to each division
    scheduleConfig.forEach(slot => {
      if (slot.division) {
        slotCounts[slot.division] = (slotCounts[slot.division] || 0) + 1;
      }
    });
    
    return slotCounts;
  };

  // Get division schedule summary
  const getDivisionScheduleSummary = () => {
    const summary = {};
    
    // Group slots by division, then by day, then by time
    scheduleConfig.forEach(slot => {
      if (!slot.division) return;
      
      if (!summary[slot.division]) {
        summary[slot.division] = {};
      }
      
      if (!summary[slot.division][slot.day]) {
        summary[slot.division][slot.day] = {};
      }
      
      if (!summary[slot.division][slot.day][slot.time]) {
        summary[slot.division][slot.day][slot.time] = [];
      }
      
      summary[slot.division][slot.day][slot.time].push(slot.field);
    });
    
    return summary;
  };

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

  // ========== FIXED: No same-day double games with proper day tracking ==========
  // Generate a balanced schedule while preserving the original slot configuration behavior.
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
      const unscheduledMessages = [];
      const gamesByDate = {};
      let sortOrder = 1;

      // Noon avoids daylight-saving and UTC date rollover problems.
      const startDate = new Date(`${seasonStartDate}T12:00:00`);

      const getFirstOccurrenceForDay = (day) => {
        const targetDay = daysOfWeek.indexOf(day); // Monday = 0
        const jsDay = startDate.getDay(); // Sunday = 0
        const startDay = jsDay === 0 ? 6 : jsDay - 1;
        let offset = targetDay - startDay;
        if (offset < 0) offset += 7;

        const result = new Date(startDate);
        result.setDate(startDate.getDate() + offset);
        return result;
      };

      const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

      const shuffle = (items) => {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };

      const dayDifference = (dateA, dateB) => {
        if (!dateA || !dateB) return Number.POSITIVE_INFINITY;
        const a = new Date(`${dateA}T12:00:00`);
        const b = new Date(`${dateB}T12:00:00`);
        return Math.abs(Math.round((a - b) / 86400000));
      };

      Object.entries(teamsByDivision).forEach(([divisionName, divisionTeams]) => {
        const teamCount = divisionTeams.length;
        const divisionSlots = scheduleConfig.filter(
          (slot) => slot.division === divisionName
        );
        const divisionDurationMinutes = getDivisionDuration(divisionName);

        if (divisionSlots.length === 0 || teamCount < 2) return;

        const oneGamePerWeek =
          divisionName === 'T-Ball Division' ||
          divisionName === 'Challenger Division';
        const gamesPerTeamPerWeek = oneGamePerWeek ? 1 : 2;
        const requiredGamesPerWeek = (teamCount * gamesPerTeamPerWeek) / 2;

        if (!Number.isInteger(requiredGamesPerWeek)) {
          unscheduledMessages.push(
            `${divisionName}: ${teamCount} teams cannot all play exactly ${gamesPerTeamPerWeek} game(s) per week without a bye.`
          );
          return;
        }

        if (divisionSlots.length < requiredGamesPerWeek) {
          unscheduledMessages.push(
            `${divisionName}: needs ${requiredGamesPerWeek} slots per week but only ${divisionSlots.length} are assigned.`
          );
          return;
        }

        const slotsByDay = {};
        divisionSlots.forEach((slot) => {
          if (!slotsByDay[slot.day]) slotsByDay[slot.day] = [];
          slotsByDay[slot.day].push(slot);
        });

        Object.values(slotsByDay).forEach((daySlots) => {
          daySlots.sort(
            (a, b) =>
              a.time.localeCompare(b.time) || a.field.localeCompare(b.field)
          );
        });

        const divisionDays = Object.keys(slotsByDay).sort(
          (a, b) => daysOfWeek.indexOf(a) - daysOfWeek.indexOf(b)
        );

        const firstOccurrences = {};
        divisionDays.forEach((day) => {
          firstOccurrences[day] = getFirstOccurrenceForDay(day);
        });

        const teamList = divisionTeams.map((team, index) => ({
          index,
          name: team.name
        }));

        // Season-long trackers. Pair counts are the primary balancing measurement.
        const pairCounts = {};

        // Track which side has been home in each specific matchup. Overall
        // home/away totals are not enough: without this tracker, Team A can
        // be home every time it faces Team B while both teams still finish
        // with balanced season totals against everyone else.
        const pairHomeCounts = {};
        const getPairHomeCount = (home, away) =>
          pairHomeCounts[`${home}>${away}`] || 0;

        const seasonGameCounts = new Array(teamCount).fill(0);
        const homeCounts = new Array(teamCount).fill(0);
        const awayCounts = new Array(teamCount).fill(0);
        const consecutiveHome = new Array(teamCount).fill(0);
        const consecutiveAway = new Array(teamCount).fill(0);
        const lastOpponent = new Array(teamCount).fill(null);
        const lastPlayedDate = new Array(teamCount).fill(null);

        // Field rotation is tracked independently for every team. The scheduler
        // should not keep a team on the same field simply because that field is
        // the first legal slot in the weekly grid. When a division has multiple
        // fields available, prefer the field(s) that team has used the least.
        const divisionFieldNames = [...new Set(divisionSlots.map((slot) => slot.field))].sort();
        const teamFieldCounts = Array.from({ length: teamCount }, () =>
          Object.fromEntries(divisionFieldNames.map((field) => [field, 0]))
        );
        const lastField = new Array(teamCount).fill(null);

        const getPairCount = (a, b) => pairCounts[pairKey(a, b)] || 0;

        // Build true round-robin rounds for even-sized divisions. Each round
        // contains every team exactly once. Selecting two different rounds per
        // week gives every team exactly two games while keeping opponent counts
        // as even as mathematically possible across the entire season.
        const buildRoundRobinRounds = () => {
          if (teamCount % 2 !== 0 || teamCount < 4) return [];

          const rotation = teamList.map((team) => team.index);
          const rounds = [];

          for (let round = 0; round < teamCount - 1; round++) {
            const matchups = [];

            for (let i = 0; i < teamCount / 2; i++) {
              matchups.push([rotation[i], rotation[teamCount - 1 - i]]);
            }

            rounds.push(matchups);

            // Circle method: keep the first team fixed and rotate the rest.
            const fixed = rotation[0];
            const rotating = rotation.slice(1);
            rotating.unshift(rotating.pop());
            rotation.splice(0, rotation.length, fixed, ...rotating);
          }

          return rounds;
        };

        const roundRobinRounds = buildRoundRobinRounds();
        const roundUseCounts = new Array(roundRobinRounds.length).fill(0);

        // Assign a prepared weekly matchup list to actual slots. This function may
        // skip extra slots, but never schedules a team twice on the same date.
        const assignMatchupsToSlots = (matchups, weekSlots) => {
          const orderedMatchups = [...matchups].sort((a, b) => {
            const aRepeat = lastOpponent[a[0]] === a[1] ? 1 : 0;
            const bRepeat = lastOpponent[b[0]] === b[1] ? 1 : 0;
            return bRepeat - aRepeat;
          });

          const usedSlots = new Set();
          const teamsByDate = {};
          const assignments = [];

          // Temporary field usage for this weekly backtracking search. This is
          // necessary because a team may have two games in the same week; the
          // second game should already know which field was assigned to its first.
          const tempFieldAdds = Array.from({ length: teamCount }, () => ({}));

          const getProjectedFieldRange = (teamIndex, candidateField) => {
            if (divisionFieldNames.length <= 1) return 0;

            const counts = divisionFieldNames.map((field) =>
              (teamFieldCounts[teamIndex][field] || 0) +
              (tempFieldAdds[teamIndex][field] || 0) +
              (field === candidateField ? 1 : 0)
            );

            return Math.max(...counts) - Math.min(...counts);
          };

          const recurse = (matchupIndex) => {
            if (matchupIndex === orderedMatchups.length) return true;

            const [teamA, teamB] = orderedMatchups[matchupIndex];

            const candidateSlots = weekSlots
              .map((slot, index) => ({ slot, index }))
              .filter(({ slot, index }) => {
                if (usedSlots.has(index)) return false;
                const usedToday = teamsByDate[slot.dateStr];
                return !usedToday || (!usedToday.has(teamA) && !usedToday.has(teamB));
              })
              .map(({ slot, index }) => {
                let score = index;

                // Prefer avoiding back-to-back calendar dates when possible.
                // This stays a stronger preference than field rotation.
                if (teamCount > 3) {
                  if (dayDifference(lastPlayedDate[teamA], slot.dateStr) === 1) score += 50000;
                  if (dayDifference(lastPlayedDate[teamB], slot.dateStr) === 1) score += 50000;
                }

                // Balance field usage for BOTH teams in the matchup. The range
                // penalty looks at the team's projected season field totals after
                // using this slot, so repeatedly assigning Angels to Field #1, for
                // example, quickly becomes much more expensive than Field #2/#3.
                if (divisionFieldNames.length > 1) {
                  const usageA =
                    (teamFieldCounts[teamA][slot.field] || 0) +
                    (tempFieldAdds[teamA][slot.field] || 0);
                  const usageB =
                    (teamFieldCounts[teamB][slot.field] || 0) +
                    (tempFieldAdds[teamB][slot.field] || 0);

                  score += getProjectedFieldRange(teamA, slot.field) * 5000;
                  score += getProjectedFieldRange(teamB, slot.field) * 5000;
                  score += (usageA + usageB) * 500;

                  // Small tie-breaker to avoid the exact same field as the team's
                  // previous game when another equally balanced field is available.
                  if (lastField[teamA] === slot.field) score += 250;
                  if (lastField[teamB] === slot.field) score += 250;
                }

                return { slot, index, score };
              })
              .sort((a, b) => a.score - b.score);

            for (const candidate of candidateSlots) {
              const { slot, index } = candidate;
              if (!teamsByDate[slot.dateStr]) teamsByDate[slot.dateStr] = new Set();

              usedSlots.add(index);
              teamsByDate[slot.dateStr].add(teamA);
              teamsByDate[slot.dateStr].add(teamB);
              tempFieldAdds[teamA][slot.field] =
                (tempFieldAdds[teamA][slot.field] || 0) + 1;
              tempFieldAdds[teamB][slot.field] =
                (tempFieldAdds[teamB][slot.field] || 0) + 1;
              assignments.push({ teamA, teamB, slot });

              if (recurse(matchupIndex + 1)) return true;

              assignments.pop();
              tempFieldAdds[teamA][slot.field]--;
              tempFieldAdds[teamB][slot.field]--;
              usedSlots.delete(index);
              teamsByDate[slot.dateStr].delete(teamA);
              teamsByDate[slot.dateStr].delete(teamB);
              if (teamsByDate[slot.dateStr].size === 0) {
                delete teamsByDate[slot.dateStr];
              }
            }

            return false;
          };

          return recurse(0) ? assignments : null;
        };

        // Build candidate weekly matchups. Standard divisions use a cycle so
        // every team appears exactly twice. T-Ball/Challenger use a matching.
        const buildWeeklyMatchups = () => {
          const teamIndexes = teamList.map((team) => team.index);

          if (gamesPerTeamPerWeek === 1) {
            const remaining = [...teamIndexes];
            const result = [];

            while (remaining.length > 0) {
              const teamA = remaining.shift();
              const opponentIndex = remaining
                .map((teamB, index) => ({
                  index,
                  score:
                    getPairCount(teamA, teamB) * 10000 +
                    (lastOpponent[teamA] === teamB ? 1000 : 0) +
                    seasonGameCounts[teamB]
                }))
                .sort((a, b) => a.score - b.score)[0]?.index;

              if (opponentIndex === undefined) return null;
              const [teamB] = remaining.splice(opponentIndex, 1);
              result.push([teamA, teamB]);
            }

            return result;
          }

          if (teamCount === 2) {
            return [[0, 1], [0, 1]];
          }

          // Try many possible cycles and retain the one using the least-played
          // pairings. This prevents one opponent from appearing far more often.
          let bestCycle = null;
          let bestScore = Number.POSITIVE_INFINITY;

          for (let attempt = 0; attempt < 500; attempt++) {
            const order = attempt === 0 ? [...teamIndexes] : shuffle(teamIndexes);
            const cycle = [];
            let score = 0;

            for (let i = 0; i < order.length; i++) {
              const teamA = order[i];
              const teamB = order[(i + 1) % order.length];
              cycle.push([teamA, teamB]);
              score += getPairCount(teamA, teamB) * 100000;
              if (lastOpponent[teamA] === teamB || lastOpponent[teamB] === teamA) {
                score += 5000;
              }
              score += seasonGameCounts[teamA] + seasonGameCounts[teamB];
            }

            if (score < bestScore) {
              bestScore = score;
              bestCycle = cycle;
            }
          }

          return bestCycle;
        };

        for (let week = 1; week <= seasonWeeks; week++) {
          const weekSlots = [];

          divisionDays.forEach((day) => {
            const gameDate = new Date(firstOccurrences[day]);
            gameDate.setDate(gameDate.getDate() + (week - 1) * 7);
            const dateStr = formatDateForDisplay(gameDate);

            slotsByDay[day].forEach((slot) => {
              weekSlots.push({ ...slot, dateStr });
            });
          });

          weekSlots.sort(
            (a, b) =>
              a.dateStr.localeCompare(b.dateStr) ||
              a.time.localeCompare(b.time) ||
              a.field.localeCompare(b.field)
          );

          let weeklyAssignments = null;
          let scheduledTarget = requiredGamesPerWeek;
          let selectedRoundIndexes = null;

          // For even-sized one-game-per-week divisions such as T-Ball and
          // Challenger, schedule one complete round-robin round each week.
          // Every team appears exactly once in a round, and no opponent repeats
          // until all round-robin rounds have been used. With 14 teams over a
          // 10-week season, every team therefore faces 10 different opponents.
          if (
            gamesPerTeamPerWeek === 1 &&
            teamCount % 2 === 0 &&
            roundRobinRounds.length > 0
          ) {
            const roundCandidates = roundRobinRounds
              .map((matchups, roundIndex) => {
                const pairCountScore = matchups.reduce(
                  (sum, [teamA, teamB]) => sum + getPairCount(teamA, teamB),
                  0
                );

                const immediateRematchScore = matchups.reduce(
                  (sum, [teamA, teamB]) =>
                    sum +
                    (lastOpponent[teamA] === teamB || lastOpponent[teamB] === teamA
                      ? 1
                      : 0),
                  0
                );

                return {
                  roundIndex,
                  matchups,
                  score:
                    roundUseCounts[roundIndex] * 1000000 +
                    pairCountScore * 10000 +
                    immediateRematchScore * 100
                };
              })
              .sort((a, b) => a.score - b.score);

            for (const candidate of roundCandidates) {
              const assignments = assignMatchupsToSlots(candidate.matchups, weekSlots);
              if (assignments) {
                weeklyAssignments = assignments;
                selectedRoundIndexes = [candidate.roundIndex];
                break;
              }
            }
          }

          // For even-sized standard divisions, schedule two complete round-robin
          // rounds each week. Across the season this guarantees that matchup
          // counts differ by no more than one. For example, eight teams playing
          // 20 games each will face five opponents three times and two opponents
          // twice; no pairing will be scheduled four times.
          if (
            !weeklyAssignments &&
            gamesPerTeamPerWeek === 2 &&
            teamCount % 2 === 0 &&
            teamCount > 2 &&
            roundRobinRounds.length > 0
          ) {
            const roundPairs = [];

            for (let first = 0; first < roundRobinRounds.length; first++) {
              for (let second = first + 1; second < roundRobinRounds.length; second++) {
                const matchups = [
                  ...roundRobinRounds[first],
                  ...roundRobinRounds[second]
                ];

                const pairCountScore = matchups.reduce(
                  (sum, [teamA, teamB]) => sum + getPairCount(teamA, teamB),
                  0
                );

                const immediateRematchScore = matchups.reduce(
                  (sum, [teamA, teamB]) =>
                    sum +
                    (lastOpponent[teamA] === teamB || lastOpponent[teamB] === teamA
                      ? 1
                      : 0),
                  0
                );

                roundPairs.push({
                  first,
                  second,
                  matchups,
                  score:
                    (roundUseCounts[first] + roundUseCounts[second]) * 1000000 +
                    pairCountScore * 10000 +
                    immediateRematchScore * 100
                });
              }
            }

            roundPairs.sort((a, b) => a.score - b.score);

            for (const candidate of roundPairs) {
              const assignments = assignMatchupsToSlots(candidate.matchups, weekSlots);
              if (assignments) {
                weeklyAssignments = assignments;
                selectedRoundIndexes = [candidate.first, candidate.second];
                break;
              }
            }
          }

          // Odd-sized divisions and unusual slot grids retain the flexible cycle
          // fallback. This also protects scheduling if no pair of complete rounds
          // can fit the selected dates.
          for (let attempt = 0; attempt < 300 && !weeklyAssignments; attempt++) {
            const weeklyMatchups = buildWeeklyMatchups();
            if (!weeklyMatchups) break;
            weeklyAssignments = assignMatchupsToSlots(weeklyMatchups, weekSlots);
          }

          // Some grids contain enough total slots but too many on the same day.
          // Example: five teams need five games, but three Saturday slots are not
          // usable because only two games can be played that day without a team
          // playing twice. Instead of dropping the entire division, schedule the
          // maximum legal number of games and rotate the reduced-game teams fairly.
          if (!weeklyAssignments) {
            const dailyLegalCapacity = Object.values(slotsByDay).reduce(
              (total, daySlots) => total + Math.min(daySlots.length, Math.floor(teamCount / 2)),
              0
            );
            const maxLegalGames = Math.min(requiredGamesPerWeek, dailyLegalCapacity, weekSlots.length);

            for (
              let target = maxLegalGames;
              target >= Math.max(1, Math.floor(teamCount / 2)) && !weeklyAssignments;
              target--
            ) {
              let bestPartial = null;
              let bestPartialScore = Number.POSITIVE_INFINITY;

              for (let attempt = 0; attempt < 500; attempt++) {
                const candidateCycle = buildWeeklyMatchups();
                if (!candidateCycle) break;

                const ranked = candidateCycle
                  .map((matchup) => {
                    const [teamA, teamB] = matchup;
                    return {
                      matchup,
                      score:
                        getPairCount(teamA, teamB) * 100000 +
                        (lastOpponent[teamA] === teamB || lastOpponent[teamB] === teamA ? 5000 : 0) +
                        (seasonGameCounts[teamA] + seasonGameCounts[teamB]) * 100
                    };
                  })
                  .sort((a, b) => a.score - b.score);

                // Keep the least-played pairings while favoring teams with fewer
                // total season games. Randomized cycle generation varies which
                // team receives only one game in a constrained week.
                const partialMatchups = ranked.slice(0, target).map((item) => item.matchup);
                const assignments = assignMatchupsToSlots(partialMatchups, weekSlots);
                if (!assignments) continue;

                const projectedCounts = [...seasonGameCounts];
                assignments.forEach(({ teamA, teamB }) => {
                  projectedCounts[teamA]++;
                  projectedCounts[teamB]++;
                });

                const spread = Math.max(...projectedCounts) - Math.min(...projectedCounts);
                const total = projectedCounts.reduce((sum, count) => sum + count, 0);
                const score = spread * 100000 + total;

                if (score < bestPartialScore) {
                  bestPartialScore = score;
                  bestPartial = assignments;
                }
              }

              if (bestPartial) {
                weeklyAssignments = bestPartial;
                scheduledTarget = target;
              }
            }
          }

          if (!weeklyAssignments) {
            unscheduledMessages.push(
              `${divisionName}, week ${week}: no legal games could fit the selected slots without a same-day doubleheader.`
            );
            continue;
          }

          if (selectedRoundIndexes) {
            selectedRoundIndexes.forEach((roundIndex) => {
              roundUseCounts[roundIndex]++;
            });
          }

          if (scheduledTarget < requiredGamesPerWeek) {
            unscheduledMessages.push(
              `${divisionName}, week ${week}: scheduled ${scheduledTarget} of ${requiredGamesPerWeek} requested games. ` +
              `The grid has too many slots on the same day; move at least ${requiredGamesPerWeek - scheduledTarget} slot(s) to another day for every team to play ${gamesPerTeamPerWeek} games.`
            );
          }

          // Home/away orientation is optimized for the entire week at once.
          // This avoids the old greedy behavior where overall home/away totals
          // looked balanced but the SAME team could remain home every time two
          // specific opponents met.
          weeklyAssignments.sort((a, b) =>
            a.slot.dateStr.localeCompare(b.slot.dateStr) ||
            a.slot.time.localeCompare(b.slot.time) ||
            a.slot.field.localeCompare(b.slot.field)
          );

          const chooseWeeklyHomeAway = (assignments) => {
            let best = null;
            let bestScore = Number.POSITIVE_INFINITY;

            const recurse = (
              gameIndex,
              tempHomeCounts,
              tempAwayCounts,
              tempConsecutiveHome,
              tempConsecutiveAway,
              tempPairHomeCounts,
              runningScore,
              orientations
            ) => {
              // All penalties are non-negative, so this branch can no longer
              // beat the best result we already found.
              if (runningScore >= bestScore) return;

              if (gameIndex === assignments.length) {
                // Final weekly tie-breaker: keep each team's season home/away
                // totals as close as possible after satisfying matchup balance
                // and streak rules.
                const seasonBalancePenalty = tempHomeCounts.reduce(
                  (sum, homeCount, teamIndex) =>
                    sum + Math.abs(homeCount - tempAwayCounts[teamIndex]) * 100,
                  0
                );

                const finalScore = runningScore + seasonBalancePenalty;
                if (finalScore < bestScore) {
                  bestScore = finalScore;
                  best = orientations;
                }
                return;
              }

              const { teamA, teamB, slot } = assignments[gameIndex];
              const options = [
                { home: teamA, away: teamB },
                { home: teamB, away: teamA }
              ];

              options.forEach(({ home, away }) => {
                let score = 0;

                // Highest priority: never create a third consecutive home or
                // away game when another orientation can avoid it.
                if (tempConsecutiveHome[home] >= 2) score += 100000000;
                if (tempConsecutiveAway[away] >= 2) score += 100000000;

                // Matchup-level home/away balance. For repeated opponents, the
                // home designation should alternate. An even number of meetings
                // should finish evenly split; an odd number may differ by one.
                const directKey = `${home}>${away}`;
                const reverseKey = `${away}>${home}`;
                const directCount = tempPairHomeCounts[directKey] || 0;
                const reverseCount = tempPairHomeCounts[reverseKey] || 0;
                const projectedPairDifference = Math.abs(
                  (directCount + 1) - reverseCount
                );
                score += projectedPairDifference * 1000000;

                // Secondary season-wide home/away balance.
                score +=
                  Math.abs(
                    (tempHomeCounts[home] + 1) - tempAwayCounts[home]
                  ) * 1000;
                score +=
                  Math.abs(
                    tempHomeCounts[away] - (tempAwayCounts[away] + 1)
                  ) * 1000;

                const nextHomeCounts = [...tempHomeCounts];
                const nextAwayCounts = [...tempAwayCounts];
                const nextConsecutiveHome = [...tempConsecutiveHome];
                const nextConsecutiveAway = [...tempConsecutiveAway];
                const nextPairHomeCounts = { ...tempPairHomeCounts };

                nextHomeCounts[home]++;
                nextAwayCounts[away]++;
                nextPairHomeCounts[directKey] = directCount + 1;

                nextConsecutiveHome[home]++;
                nextConsecutiveAway[home] = 0;
                nextConsecutiveAway[away]++;
                nextConsecutiveHome[away] = 0;

                recurse(
                  gameIndex + 1,
                  nextHomeCounts,
                  nextAwayCounts,
                  nextConsecutiveHome,
                  nextConsecutiveAway,
                  nextPairHomeCounts,
                  runningScore + score,
                  [...orientations, { teamA, teamB, home, away, slot }]
                );
              });
            };

            recurse(
              0,
              [...homeCounts],
              [...awayCounts],
              [...consecutiveHome],
              [...consecutiveAway],
              { ...pairHomeCounts },
              0,
              []
            );

            return best || assignments.map(({ teamA, teamB, slot }) => ({
              teamA,
              teamB,
              home: teamA,
              away: teamB,
              slot
            }));
          };

          const orientedAssignments = chooseWeeklyHomeAway(weeklyAssignments);

          orientedAssignments.forEach(({ teamA, teamB, home, away, slot }) => {
            const game = {
              SortOrder: sortOrder++,
              RoundNo: week,
              HomeTeam: teamList[home].name,
              AwayTeam: teamList[away].name,
              MatchDate: slot.dateStr,
              StartTime: slot.time,
              EndTime: slot.time,
              Location: 'Sayreville Little League',
              Field: slot.field,
              Division: divisionName
            };

            games.push(game);
            if (!gamesByDate[slot.dateStr]) gamesByDate[slot.dateStr] = [];
            gamesByDate[slot.dateStr].push(game);

            pairCounts[pairKey(teamA, teamB)] = getPairCount(teamA, teamB) + 1;
            seasonGameCounts[teamA]++;
            seasonGameCounts[teamB]++;
            homeCounts[home]++;
            awayCounts[away]++;
            pairHomeCounts[`${home}>${away}`] = getPairHomeCount(home, away) + 1;

            consecutiveHome[home]++;
            consecutiveAway[home] = 0;
            consecutiveAway[away]++;
            consecutiveHome[away] = 0;

            lastOpponent[teamA] = teamB;
            lastOpponent[teamB] = teamA;
            lastPlayedDate[teamA] = slot.dateStr;
            lastPlayedDate[teamB] = slot.dateStr;

            teamFieldCounts[teamA][slot.field] =
              (teamFieldCounts[teamA][slot.field] || 0) + 1;
            teamFieldCounts[teamB][slot.field] =
              (teamFieldCounts[teamB][slot.field] || 0) + 1;
            lastField[teamA] = slot.field;
            lastField[teamB] = slot.field;
          });
        }
      });

      // Preserve the original end-time behavior for consecutive games on a field.
      Object.values(gamesByDate).forEach((dateGames) => {
        const gamesByField = {};
        dateGames.forEach((game) => {
          if (!gamesByField[game.Field]) gamesByField[game.Field] = [];
          gamesByField[game.Field].push(game);
        });

        Object.values(gamesByField).forEach((fieldGames) => {
          fieldGames.sort((a, b) => a.StartTime.localeCompare(b.StartTime));

          for (let i = 0; i < fieldGames.length; i++) {
            const game = fieldGames[i];
            const divisionDuration = getDivisionDuration(game.Division);
            const startMinutes = timeToMinutes(game.StartTime);
            const nextGame = fieldGames[i + 1];

            if (nextGame) {
              const nextStartMinutes = timeToMinutes(nextGame.StartTime);
              const gapMinutes = nextStartMinutes - startMinutes;
              game.EndTime =
                gapMinutes <= divisionDuration
                  ? nextGame.StartTime
                  : minutesToTime(startMinutes + divisionDuration);
            } else {
              game.EndTime = minutesToTime(startMinutes + divisionDuration);
            }
          }
        });
      });

      games.sort(
        (a, b) =>
          a.MatchDate.localeCompare(b.MatchDate) ||
          a.StartTime.localeCompare(b.StartTime) ||
          a.Field.localeCompare(b.Field)
      );
      games.forEach((game, index) => {
        game.SortOrder = index + 1;
      });

      setGeneratedGames(games);

      const finalGameCounts = {};
      games.forEach((game) => {
        finalGameCounts[game.HomeTeam] = (finalGameCounts[game.HomeTeam] || 0) + 1;
        finalGameCounts[game.AwayTeam] = (finalGameCounts[game.AwayTeam] || 0) + 1;
      });

      const countsList = Object.entries(finalGameCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([team, count]) => `${team}: ${count} games`)
        .join('\n');

      const warningText = unscheduledMessages.length
        ? `\n\nWarnings:\n${unscheduledMessages.slice(0, 20).join('\n')}`
        : '\n\n✓ No same-day double games were generated.';

      alert(
        `Schedule generated successfully! Created ${games.length} games for ${seasonWeeks} weeks.\n\n` +
        `Game Count Summary:\n${countsList || 'No eligible divisions were found.'}${warningText}`
      );
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

  // Function to reset ALL configuration
  const resetAllConfiguration = () => {
    if (window.confirm('Are you sure you want to reset ALL configuration? This will clear everything.')) {
      localStorage.removeItem('gameSchedulerConfig');
      localStorage.removeItem('gameSchedulerSeasonStart');
      localStorage.removeItem('gameSchedulerSeasonWeeks');
      localStorage.removeItem('gameSchedulerSelectedSeason');
      localStorage.removeItem('gameSchedulerTestMode');
      localStorage.removeItem('gameSchedulerTestConfig');
      localStorage.removeItem('gameSchedulerDivisionDurations');
      
      setSeasonStartDate('');
      setSeasonWeeks(10);
      setSelectedSeason('');
      setIsTestMode(false);
      setTestDivisionConfig([]);
      setIsTestConfigSaved(false);
      setDivisionDurations({});
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
      divisionDurations,
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
        if (configData.divisionDurations) setDivisionDurations(configData.divisionDurations);
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

  // Open duration configuration modal
  const openDurationModal = () => {
    setDurationForm({ divisionId: '', durationHours: 2 });
    setShowDurationModal(true);
  };

  // Save division duration
  const saveDivisionDuration = () => {
    if (!durationForm.divisionId) {
      alert('Please select a division');
      return;
    }
    if (durationForm.durationHours < 0.5 || durationForm.durationHours > 4) {
      alert('Duration must be between 0.5 and 4 hours');
      return;
    }
    setDivisionDuration(durationForm.divisionId, durationForm.durationHours);
    setShowDurationModal(false);
    alert(`Game duration for ${divisions.find(d => d.id === durationForm.divisionId)?.name} set to ${durationForm.durationHours} hours`);
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

  const DurationModalFooter = (
    <div className="flex justify-end space-x-3">
      <button onClick={() => setShowDurationModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={saveDivisionDuration} className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700">Save Duration</button>
    </div>
  );

  // Get player counts for display
  const playerCounts = getRegistrationCount;
  
  // Get game counts for display
  const gameCounts = getGameCountsPerTeam();
  const opponentCountsByTeam = getOpponentCountsByTeam();
  
  // Get division slot counts
  const divisionSlotCounts = getDivisionSlotCounts();
  
  // Get division schedule summary
  const divisionScheduleSummary = getDivisionScheduleSummary();

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

      {/* Game Duration Configuration */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Game Duration Settings</h2>
          <button
            onClick={openDurationModal}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Clock className="h-4 w-4 mr-1" />
            Configure Division Durations
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {divisions.map(division => {
            const durationMinutes = divisionDurations[division.id] || DEFAULT_GAME_DURATION_MINUTES;
            return (
              <div key={division.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                <span className="font-medium text-gray-700">{division.name}</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                  {durationMinutes / 60} {durationMinutes / 60 === 1 ? 'hour' : 'hours'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Default: 2 hours. When games are back-to-back on the same field, the end time will automatically adjust to the next game's start time.
        </p>
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

        {/* Division Slot Counters */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
            <Layers className="h-5 w-5 mr-2 text-blue-600" />
            Division Slot Summary
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {divisions
              .slice()
              .sort((a, b) => {
                const order = [
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
                return order.indexOf(a.name) - order.indexOf(b.name);
              })
              .map(division => {
                const slotCount = divisionSlotCounts[division.name] || 0;
                
                return (
                  <div key={division.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                    <span className="font-medium text-gray-700">{division.name}</span>
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-800">
                      {slotCount} {slotCount === 1 ? 'slot' : 'slots'}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Field Management */}
        <div className="mb-4">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Division Assignments</h3>
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

      {/* Division Schedule Summary */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <CalendarRange className="h-5 w-5 mr-2 text-green-600" />
          Division Schedule Summary
        </h3>
        <div className="space-y-4">
          {Object.entries(divisionScheduleSummary)
            .sort(([aName], [bName]) => {
              const order = [
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
              return order.indexOf(aName) - order.indexOf(bName);
            })
            .map(([divisionName, days]) => (
              <div key={divisionName} className="bg-white rounded-lg p-4 border border-gray-200">
                <h4 className="font-semibold text-gray-800 mb-2">{divisionName}</h4>
                <div className="space-y-2">
                  {Object.entries(days)
                    .sort(([aDay], [bDay]) => daysOfWeek.indexOf(aDay) - daysOfWeek.indexOf(bDay))
                    .map(([day, times]) => (
                      <div key={day} className="flex items-start">
                        <span className="w-24 text-sm font-medium text-gray-600">{day.substring(0,3)} |</span>
                        <div className="flex-1 flex flex-wrap gap-2">
                          {Object.entries(times)
                            .sort(([aTime], [bTime]) => aTime.localeCompare(bTime))
                            .map(([time, fields]) => (
                              <div key={time} className="flex items-center flex-wrap">
                                <span className="text-sm font-medium text-gray-700 mr-1">
                                  {time.substring(0,5)}
                                </span>
                                <span className="text-sm text-gray-500 mr-2">
                                  ({fields.join(', ')})|
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
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

      {/* Duration Config Modal */}
      <Modal isOpen={showDurationModal} onClose={() => setShowDurationModal(false)} title="Configure Game Duration by Division" footer={DurationModalFooter}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Set how long each game should be for each division. When games are back-to-back on the same field, the end time will automatically adjust to the next game's start time.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Division</label>
            <select
              value={durationForm.divisionId}
              onChange={(e) => setDurationForm({ ...durationForm, divisionId: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">Select a division</option>
              {divisions.map(division => (
                <option key={division.id} value={division.id}>{division.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Game Duration (hours)</label>
            <input
              type="number"
              value={durationForm.durationHours}
              onChange={(e) => setDurationForm({ ...durationForm, durationHours: parseFloat(e.target.value) })}
              step="0.5"
              min="0.5"
              max="4"
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-green-500 focus:border-green-500"
            />
            <p className="text-xs text-gray-500 mt-1">Choose between 0.5 and 4 hours (default: 2 hours)</p>
          </div>
          {durationForm.divisionId && (
            <div className="p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-800">
                {divisions.find(d => d.id === durationForm.divisionId)?.name} games will be scheduled for {durationForm.durationHours} hour{durationForm.durationHours !== 1 ? 's' : ''}.
                If another game is scheduled on the same field immediately after, the end time will be the start time of the next game.
              </p>
            </div>
          )}
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

      {/* Team Summary with Game Counts */}
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
            const slotCount = divisionSlotCounts[divisionName] || 0;
            return (
              <div key={divisionName} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg">{divisionName}</h3>
                  <span className="text-sm text-gray-500 flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    {registeredCount} reg
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  {divisionTeams.length} team{divisionTeams.length !== 1 ? 's' : ''} • {slotCount} slot{slotCount !== 1 ? 's' : ''}
                </p>

                <div className="space-y-2">
                  {divisionTeams.map((team, index) => {
                    const gameCount = gameCounts[team.name] || 0;
                    return (
                      <div key={team.id} className="border-b border-gray-100 pb-2 last:border-b-0 last:pb-0">
                        <div className="flex justify-between items-center text-sm">
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

                      </div>
                    );
                  })}
                </div>
                {generatedGames.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-semibold text-gray-800">Matchup Counts</h4>
                      <span className="text-xs text-gray-500">
                        {divisionTeams.reduce((sum, team) => sum + (gameCounts[team.name] || 0), 0) / 2} division games
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-gray-200 rounded-md">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">Team</th>
                            {divisionTeams.map(opponent => (
                              <th
                                key={`header-${divisionName}-${opponent.id}`}
                                className="px-2 py-2 text-center font-semibold text-gray-700 border-b border-gray-200 whitespace-nowrap"
                                title={opponent.name}
                              >
                                {opponent.name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {divisionTeams.map(team => (
                            <tr key={`matrix-${divisionName}-${team.id}`} className="border-b border-gray-100 last:border-b-0">
                              <td className="px-2 py-2 font-medium text-gray-800 whitespace-nowrap">{team.name}</td>
                              {divisionTeams.map(opponent => {
                                const isSameTeam = team.name === opponent.name;
                                const count = opponentCountsByTeam[team.name]?.[opponent.name] || 0;
                                return (
                                  <td
                                    key={`cell-${divisionName}-${team.id}-${opponent.id}`}
                                    className={`px-2 py-2 text-center font-semibold ${
                                      isSameTeam
                                        ? 'bg-gray-100 text-gray-400'
                                        : count > 0
                                          ? 'text-blue-700'
                                          : 'text-red-500'
                                    }`}
                                    title={isSameTeam ? 'Same team' : `${team.name} vs ${opponent.name}: ${count} game${count === 1 ? '' : 's'}`}
                                  >
                                    {isSameTeam ? '—' : count}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

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