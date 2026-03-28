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
    const unscheduledSlots = [];
    let sortOrder = 1;

    const startDate = new Date(seasonStartDate);

    const getFirstOccurrenceForDay = (day) => {
      const dayOffset = daysOfWeek.indexOf(day);
      const startDayOfWeek = startDate.getDay(); // 0=Sun
      const startDayMapped = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Mon=0...Sun=6

      let daysToAdd = dayOffset - startDayMapped;
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }

      const firstDate = new Date(startDate);
      firstDate.setDate(startDate.getDate() + daysToAdd);
      return firstDate;
    };

    const getPairKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join('-');

    // Store games for each date to calculate end times later
    const gamesByDate = {};

    Object.entries(teamsByDivision).forEach(([divisionName, divisionTeams]) => {
      const teamCount = divisionTeams.length;
      const divisionSlots = scheduleConfig.filter(slot => slot.division === divisionName);
      const divisionDurationMinutes = getDivisionDuration(divisionName);

      if (divisionSlots.length === 0) {
        console.log(`No slots assigned for ${divisionName}, skipping`);
        return;
      }

      if (teamCount < 2) {
        console.log(`Not enough teams in ${divisionName}, skipping`);
        return;
      }

      const template = slotTemplates[teamCount];
      if (!template || template.length === 0) {
        console.log(`No slot template found for ${teamCount} teams in ${divisionName}, skipping`);
        return;
      }

      const slotsPerWeek = divisionSlots.length;
      const totalGamesNeeded = slotsPerWeek * seasonWeeks;
      const expectedGamesPerTeam = (totalGamesNeeded * 2) / teamCount;

      console.log(`\n${divisionName}:`);
      console.log(`  Teams: ${teamCount}`);
      console.log(`  Slots per week: ${slotsPerWeek}`);
      console.log(`  Total weeks: ${seasonWeeks}`);
      console.log(`  Expected games per team: ${expectedGamesPerTeam}`);
      console.log(`  Template games per cycle: ${template.length}`);
      console.log(`  Game Duration: ${divisionDurationMinutes / 60} hours`);

      // Group slots by day
      const slotsByDay = {};
      divisionSlots.forEach(slot => {
        if (!slotsByDay[slot.day]) {
          slotsByDay[slot.day] = [];
        }
        slotsByDay[slot.day].push(slot);
      });

      Object.keys(slotsByDay).forEach(day => {
        slotsByDay[day].sort((a, b) => a.time.localeCompare(b.time));
      });

      const divisionDays = Object.keys(slotsByDay).sort(
        (a, b) => daysOfWeek.indexOf(a) - daysOfWeek.indexOf(b)
      );

      const firstOccurrences = {};
      divisionDays.forEach(day => {
        firstOccurrences[day] = getFirstOccurrenceForDay(day);
      });

      const teams = divisionTeams.map((team, idx) => ({
        id: idx,
        name: team.name
      }));

      // Trackers
      const seasonGameCounts = new Array(teamCount).fill(0);
      const weeklyGameCounts = new Array(teamCount).fill(0);
      const homeCounts = new Array(teamCount).fill(0);
      const awayCounts = new Array(teamCount).fill(0);
      const consecutiveHome = new Array(teamCount).fill(0);
      const consecutiveAway = new Array(teamCount).fill(0);

      const lastOpponent = new Array(teamCount).fill(null);

      // Build template queue once, then keep cycling through it.
      // Every other cycle, reverse home/away to help balance home/away totals.
      const buildTemplateCycle = (reverseHomeAway = false) => {
        return template.map(([homeSeed, awaySeed]) => {
          const home = homeSeed - 1;
          const away = awaySeed - 1;

          if (!reverseHomeAway) {
            return { home, away };
          }

          return { home: away, away: home };
        });
      };

      let cycleNumber = 0;
      let templateQueue = buildTemplateCycle(false);

      const getNextTemplateCandidates = () => {
        // Make sure queue always has enough options to look ahead
        while (templateQueue.length < 20) {
          cycleNumber++;
          const reverse = cycleNumber % 2 === 1;
          templateQueue.push(...buildTemplateCycle(reverse));
        }
      };

      for (let week = 1; week <= seasonWeeks; week++) {
        console.log(`\nWeek ${week} for ${divisionName}`);

        // Reset weekly game counts each week
        for (let i = 0; i < teamCount; i++) {
          weeklyGameCounts[i] = 0;
        }

        const teamsPlayedByDate = {};

        const weekSlots = [];
        divisionDays.forEach(day => {
          const firstDate = firstOccurrences[day];
          const gameDate = new Date(firstDate);
          gameDate.setDate(firstDate.getDate() + ((week - 1) * 7));
          const dateStr = formatDateForDisplay(gameDate);

          slotsByDay[day].forEach(slot => {
            weekSlots.push({
              ...slot,
              dateStr
            });
          });
        });

        weekSlots.sort((a, b) => {
          if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
          return a.time.localeCompare(b.time);
        });

        for (const slot of weekSlots) {
          if (!teamsPlayedByDate[slot.dateStr]) {
            teamsPlayedByDate[slot.dateStr] = new Set();
          }

          const playedToday = teamsPlayedByDate[slot.dateStr];

          getNextTemplateCandidates();

          let selectedMatchup = null;
          let selectedIndex = -1;

          // Look ahead a limited amount so we mostly preserve template order
          const LOOKAHEAD = Math.min(12, templateQueue.length);

          const scoredCandidates = [];

          for (let i = 0; i < LOOKAHEAD; i++) {
            const matchup = templateQueue[i];
            const { home, away } = matchup;

            // Cannot play twice on same day
            if (playedToday.has(home) || playedToday.has(away)) {
              continue;
            }

            const pairKey = getPairKey(home, away);

            let score = 0;

            // Prefer template order: earlier items are better
            score += i * 100;

            // Prefer teams with fewer weekly games
            score += (weeklyGameCounts[home] + weeklyGameCounts[away]) * 1000;

            // Prefer teams with fewer season games
            score += (seasonGameCounts[home] + seasonGameCounts[away]) * 100;

            // Avoid 3rd straight home or away if possible
            const nextHomeStreak = consecutiveHome[home] + 1;
            const nextAwayStreak = consecutiveAway[away] + 1;

            if (nextHomeStreak >= 3) score += 5000;
            if (nextAwayStreak >= 3) score += 5000;
            if (nextHomeStreak >= 4) score += 20000;
            if (nextAwayStreak >= 4) score += 20000;

            // Balance total home/away counts
            score += Math.abs((homeCounts[home] + 1) - awayCounts[home]) * 40;
            score += Math.abs(homeCounts[away] - (awayCounts[away] + 1)) * 40;

            // Strongly avoid immediate rematch from each team's previous game
            if (lastOpponent[home] === away || lastOpponent[away] === home) {
              score += 12000;
            }

            scoredCandidates.push({
              matchup,
              index: i,
              score
            });
          }

          if (scoredCandidates.length > 0) {
            scoredCandidates.sort((a, b) => a.score - b.score);
            selectedMatchup = scoredCandidates[0].matchup;
            selectedIndex = scoredCandidates[0].index;
          }

          if (!selectedMatchup) {
            unscheduledSlots.push(
              `${divisionName} - Week ${week} - ${slot.dateStr} ${slot.time} ${slot.field} (no legal template matchup available)`
            );
            continue;
          }

          // Remove selected matchup from queue
          templateQueue.splice(selectedIndex, 1);

          const homeTeam = teams[selectedMatchup.home];
          const awayTeam = teams[selectedMatchup.away];

          const game = {
            SortOrder: sortOrder++,
            RoundNo: week,
            HomeTeam: homeTeam.name,
            AwayTeam: awayTeam.name,
            MatchDate: slot.dateStr,
            StartTime: slot.time,
            EndTime: slot.time, // Placeholder, will calculate after all games are created
            Location: 'Sayreville Little League',
            Field: slot.field,
            Division: divisionName
          };

          games.push(game);

          // Group by date for end time calculation
          if (!gamesByDate[slot.dateStr]) {
            gamesByDate[slot.dateStr] = [];
          }
          gamesByDate[slot.dateStr].push(game);

          // Update trackers
          playedToday.add(selectedMatchup.home);
          playedToday.add(selectedMatchup.away);

          weeklyGameCounts[selectedMatchup.home]++;
          weeklyGameCounts[selectedMatchup.away]++;

          seasonGameCounts[selectedMatchup.home]++;
          seasonGameCounts[selectedMatchup.away]++;

          homeCounts[selectedMatchup.home]++;
          awayCounts[selectedMatchup.away]++;

          consecutiveHome[selectedMatchup.home]++;
          consecutiveAway[selectedMatchup.home] = 0;

          consecutiveAway[selectedMatchup.away]++;
          consecutiveHome[selectedMatchup.away] = 0;

          lastOpponent[selectedMatchup.home] = selectedMatchup.away;
          lastOpponent[selectedMatchup.away] = selectedMatchup.home;
        }

        console.log(`  Weekly game counts:`);
        teams.forEach((team, idx) => {
          console.log(
            `    ${team.name}: ${weeklyGameCounts[idx]} games | Home ${homeCounts[idx]} | Away ${awayCounts[idx]}`
          );
        });
      }

      console.log(`\nFinal game counts for ${divisionName}:`);
      teams.forEach((team, idx) => {
        console.log(
          `  ${team.name}: ${seasonGameCounts[idx]} games | Home ${homeCounts[idx]} | Away ${awayCounts[idx]}`
        );
      });

      const minCount = Math.min(...seasonGameCounts);
      const maxCount = Math.max(...seasonGameCounts);

      console.log(`  Min: ${minCount}, Max: ${maxCount}, Difference: ${maxCount - minCount}`);
      console.log(`  Expected per team: ${expectedGamesPerTeam}`);

      Object.entries(slotsByDay).forEach(([day, slots]) => {
        const maxGamesPossibleThatDay = Math.floor(teamCount / 2);
        if (slots.length > maxGamesPossibleThatDay) {
          console.warn(
            `${divisionName}: ${day} has ${slots.length} slot(s), but with ${teamCount} teams you can only schedule ${maxGamesPossibleThatDay} game(s) that day without a same-day doubleheader.`
          );
        }
      });
    });

    // Calculate end times for all games based on consecutive games on same field
    Object.values(gamesByDate).forEach(dateGames => {
      // Sort games by start time for each field
      const gamesByField = {};
      dateGames.forEach(game => {
        if (!gamesByField[game.Field]) {
          gamesByField[game.Field] = [];
        }
        gamesByField[game.Field].push(game);
      });

      // Sort each field's games by start time
      Object.values(gamesByField).forEach(fieldGames => {
        fieldGames.sort((a, b) => a.StartTime.localeCompare(b.StartTime));
        
        // Calculate end times
        for (let i = 0; i < fieldGames.length; i++) {
          const game = fieldGames[i];
          const divisionDuration = getDivisionDuration(game.Division);
          
          // Check if there's a next game on the same field
          if (i + 1 < fieldGames.length) {
            const nextGame = fieldGames[i + 1];
            const startMinutes = timeToMinutes(game.StartTime);
            const nextStartMinutes = timeToMinutes(nextGame.StartTime);
            const gapMinutes = nextStartMinutes - startMinutes;
            
            // If the gap is less than or equal to the division duration, use the next start time as end time
            if (gapMinutes <= divisionDuration) {
              game.EndTime = nextGame.StartTime;
            } else {
              // Otherwise use the division duration
              const endMinutes = startMinutes + divisionDuration;
              game.EndTime = minutesToTime(endMinutes);
            }
          } else {
            // Last game on field - use division duration
            const startMinutes = timeToMinutes(game.StartTime);
            const endMinutes = startMinutes + divisionDuration;
            game.EndTime = minutesToTime(endMinutes);
          }
        }
      });
    });

    setGeneratedGames(games);

    const finalGameCounts = {};
    games.forEach(game => {
      finalGameCounts[game.HomeTeam] = (finalGameCounts[game.HomeTeam] || 0) + 1;
      finalGameCounts[game.AwayTeam] = (finalGameCounts[game.AwayTeam] || 0) + 1;
    });

    const countsList = Object.entries(finalGameCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([team, count]) => `${team}: ${count} games`)
      .join('\n');

    const counts = Object.values(finalGameCounts);
    const minGames = counts.length ? Math.min(...counts) : 0;
    const maxGames = counts.length ? Math.max(...counts) : 0;
    const difference = maxGames - minGames;

    const sameDayIssues = [];
    const gameMap = {};

    games.forEach(game => {
      if (!gameMap[game.MatchDate]) {
        gameMap[game.MatchDate] = [];
      }
      gameMap[game.MatchDate].push(game);
    });

    Object.entries(gameMap).forEach(([date, dayGames]) => {
      const teamCounts = {};
      dayGames.forEach(game => {
        teamCounts[game.HomeTeam] = (teamCounts[game.HomeTeam] || 0) + 1;
        teamCounts[game.AwayTeam] = (teamCounts[game.AwayTeam] || 0) + 1;
      });

      Object.entries(teamCounts).forEach(([team, count]) => {
        if (count > 1) {
          sameDayIssues.push(`${team} played ${count} times on ${date}`);
        }
      });
    });

    const unscheduledMessage =
      unscheduledSlots.length > 0
        ? `\n\n⚠️ ${unscheduledSlots.length} slot(s) could not be scheduled.\n\nExamples:\n${unscheduledSlots.slice(0, 10).join('\n')}${unscheduledSlots.length > 10 ? '\n...' : ''}`
        : '';

    alert(
      `Schedule generated successfully! Created ${games.length} games for ${seasonWeeks} weeks.\n\n` +
      `Game Count Summary:\n${countsList}\n\n` +
      `Min: ${minGames} games | Max: ${maxGames} games | Difference: ${difference} games\n\n` +
      `${sameDayIssues.length > 0 ? '⚠️ Same-day double games detected:\n' + sameDayIssues.join('\n') : '✓ No same-day double games!'}${unscheduledMessage}`
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