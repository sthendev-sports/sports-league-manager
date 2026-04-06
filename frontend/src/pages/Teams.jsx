import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, Users, Shield, AlertCircle, Mail, Phone, ChevronDown, ChevronUp, Download } from 'lucide-react';
import Modal from '../components/Modal';
import api, { teamsAPI, divisionsAPI, seasonsAPI } from '../services/api';
import { getPermissionErrorMessage } from '../utils/permissionHelpers';

const Teams = () => {
  const [teams, setTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [boardMembers, setBoardMembers] = useState([]); // ADDED: Board members state
  
  // Export modal states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportOption, setExportOption] = useState('current'); // 'current' or 'all'
  
  // Form states
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    color: 'blue',
    division_id: '',
    season_id: ''
  });
  const [customColor, setCustomColor] = useState('');
  const [usingCustomColor, setUsingCustomColor] = useState(false);

  // Helper function to get uniform shirt size from multiple possible field names
  const getUniformShirtSize = (player) => {
    const possibleFields = [
      player.uniform_shirt_size,
      player.uniform_shirt,
      player.shirt_size,
      player.shirt
    ];
    
    for (const field of possibleFields) {
      if (field && field !== 'N/A' && field !== '' && field !== 'None') {
        return field;
      }
    }
    return 'N/A';
  };

  // Helper function to get uniform pants size from multiple possible field names
  const getUniformPantsSize = (player) => {
    const possibleFields = [
      player.uniform_pant_size,
      player.uniform_pants_size,
      player.uniform_pants,
      player.pants_size,
      player.pant_size,
      player.pants
    ];
    
    for (const field of possibleFields) {
      if (field && field !== 'N/A' && field !== '' && field !== 'None') {
        return field;
      }
    }
    return 'N/A';
  };

  // Helper function to get uniform shirt color
  const getUniformShirtColor = (player) => {
    return player.uniform_shirt_color || '';
  };

  // Helper function to get uniform pants color
  const getUniformPantsColor = (player) => {
    return player.uniform_pant_color || '';
  };

  // Helper function to get payment status display
  const getPaymentStatus = (player) => {
    if (player.payment_received === true) {
      return { label: 'Paid', className: 'bg-green-100 text-green-800' };
    } else if (player.payment_received === false) {
      return { label: 'Pending', className: 'bg-red-100 text-red-800' };
    }
    return { label: 'Unknown', className: 'bg-gray-100 text-gray-800' };
  };

  // Helper function to get workbond check status display - MATCHES PLAYERS.JSX LOGIC
  const getWorkbondStatus = (player) => {
    // First, check if this family has any board members
    const hasBoardMember = boardMembers.some(bm => bm.family_id === player.family_id);
    
    // If board member family, show EXEMPT regardless of workbond status
    if (hasBoardMember) {
      return { 
        label: 'Board Member - Exempt', 
        className: 'bg-purple-100 text-purple-800',
        notes: player.season_workbond?.notes || ''
      };
    }
    
    // Check if workbond data exists
    if (player.season_workbond) {
      // Check if notes contain "Exempt" (case insensitive)
      const notes = player.season_workbond.notes || '';
      if (notes.toLowerCase().includes('exempt')) {
        return { 
          label: 'Exempt', 
          className: 'bg-purple-100 text-purple-800',
          notes: notes
        };
      }
      
      // Check if received is true
      if (player.season_workbond.received === true) {
        return { 
          label: 'Received', 
          className: 'bg-green-100 text-green-800',
          notes: notes
        };
      }
      
      // Has notes but not received
      if (notes && notes.trim() !== '') {
        return { 
          label: 'Not Received', 
          className: 'bg-yellow-100 text-yellow-800',
          notes: notes
        };
      }
      
      // No notes and not received
      return { 
        label: 'Not Received', 
        className: 'bg-yellow-100 text-yellow-800',
        notes: ''
      };
    }
    
    return { label: 'Not Received', className: 'bg-yellow-100 text-yellow-800', notes: '' };
  };

  // ADDED: Function to load board members
  const loadBoardMembers = async () => {
    try {
      console.log('Loading board members...');
      const token = localStorage.getItem('slm_token');
      const response = await fetch('/api/board-members', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const responseData = await response.json();
        let boardMembersData = [];
        
        if (Array.isArray(responseData)) {
          boardMembersData = responseData;
        } else if (responseData.data && Array.isArray(responseData.data)) {
          boardMembersData = responseData.data;
        }
        
        // Filter to only active board members with family_ids
        const activeBoardMembers = boardMembersData.filter(bm => 
          bm.is_active === true && bm.family_id
        );
        
        console.log('Active board members with family_ids:', activeBoardMembers.length);
        setBoardMembers(activeBoardMembers);
      }
    } catch (error) {
      console.error('Error loading board members:', error);
    }
  };

  // ADDED: Function to fetch workbond data for players
  const enhancePlayersWithWorkbond = async (playersData, seasonId) => {
    if (!playersData || playersData.length === 0 || !seasonId) return playersData;
    
    try {
      // Get family IDs from players
      const familyIds = playersData.map(p => p.family_id).filter(Boolean);
      if (familyIds.length === 0) return playersData;
      
      // Fetch workbond data
      const token = localStorage.getItem('slm_token');
      const response = await fetch(`/api/family-season-workbond/batch`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          family_ids: familyIds,
          season_id: seasonId 
        })
      });
      
      if (!response.ok) {
        console.error('Failed to fetch workbond data');
        return playersData;
      }
      
      const workbondRecords = await response.json();
      
      // Create lookup map
      const workbondMap = new Map();
      workbondRecords.forEach(record => {
        workbondMap.set(record.family_id, record);
      });
      
      // Enhance players with workbond data
      return playersData.map(player => ({
        ...player,
        season_workbond: workbondMap.get(player.family_id) || {
          received: false,
          notes: ''
        }
      }));
      
    } catch (error) {
      console.error('Error enhancing players with workbond:', error);
      return playersData;
    }
  };

  useEffect(() => {
    loadData();
    loadBoardMembers(); // Load board members
  }, [selectedSeason, selectedDivision, selectedTeam]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading teams data...');
      
      // Load teams with enhanced details including players and volunteers
      const [teamsRes, divisionsRes, seasonsRes] = await Promise.all([
        api.get('/teams/with-details'),
        divisionsAPI.getAll(),
        seasonsAPI.getAll(),
      ]);

      let teamsData = Array.isArray(teamsRes.data) ? teamsRes.data : [];
      const divisionsData = Array.isArray(divisionsRes.data) ? divisionsRes.data : [];
      const seasonsData = Array.isArray(seasonsRes.data) ? seasonsRes.data : [];
      
      // If a season is selected, enhance players with workbond data for that season
      if (selectedSeason) {
        // Enhance each team's players with workbond data
        const enhancedTeams = await Promise.all(
          teamsData.map(async (team) => {
            if (team.players && team.players.length > 0) {
              const enhancedPlayers = await enhancePlayersWithWorkbond(team.players, selectedSeason);
              return { ...team, players: enhancedPlayers };
            }
            return team;
          })
        );
        teamsData = enhancedTeams;
      }
      
      // Filter teams by selected season and division if applicable
      let filteredTeams = teamsData;
      
      if (selectedSeason) {
        filteredTeams = filteredTeams.filter(team => team.season_id === selectedSeason);
      }
      
      if (selectedDivision) {
        filteredTeams = filteredTeams.filter(team => team.division_id === selectedDivision);
      }
      
	  if (selectedTeam) {
		filteredTeams = filteredTeams.filter(team => team.id === selectedTeam);
	  }
      console.log('Filtered teams:', filteredTeams);
      
      setTeams(filteredTeams);
      setDivisions(divisionsData);
      setSeasons(seasonsData);
      
      // Set first season as default if none selected
      if (!selectedSeason && Array.isArray(seasonsData) && seasonsData.length > 0) {
        setSelectedSeason(seasonsData[0].id);
      }
      
    } catch (error) {
      console.error('Error loading teams data:', error);
      setError('Failed to load data: ' + error.message);
      setTeams([]);
      setDivisions([]);
      setSeasons([]);
    } finally {
      setLoading(false);
    }
  };

  // NEW FUNCTION: Export team data
  const exportTeamData = () => {
    try {
      console.log('Exporting team data...');
      
      // Determine which teams to export
      let teamsToExport = [];
      
      if (exportOption === 'current') {
        // Export currently filtered teams
        teamsToExport = teams;
      } else {
        // Export all teams (with current season filter if applicable)
        teamsToExport = teams;
      }
      
      if (teamsToExport.length === 0) {
        alert('No teams found to export. Please check your filters.');
        return;
      }
      
      console.log(`Exporting ${teamsToExport.length} teams`);
      
      // Prepare CSV data
      const csvData = [];
      
      // Add header row
      csvData.push('Division Name,Team Name,Player Name,Volunteer Name,Volunteer Role');
      
      // Define division order for sorting
      const divisionOrder = [
        'T-Ball',
        'Baseball Coach Pitch',
        'Softball Rookies',
        'Baseball Rookies',
        'Baseball Minors',
        'Softball Minors',
        'Softball Majors',
        'Baseball Majors',
        'Challenger'
      ];
      
      // Sort teams by division order, then alphabetically by team name
      const sortedTeams = [...teamsToExport].sort((a, b) => {
        const divisionA = a.division?.name || getDivisionName(a.division_id) || '';
        const divisionB = b.division?.name || getDivisionName(b.division_id) || '';
        
        // Find index in division order
        let indexA = divisionOrder.findIndex(d => divisionA.toLowerCase().includes(d.toLowerCase()));
        let indexB = divisionOrder.findIndex(d => divisionB.toLowerCase().includes(d.toLowerCase()));
        
        // If not found in order, put at the end
        if (indexA === -1) indexA = divisionOrder.length;
        if (indexB === -1) indexB = divisionOrder.length;
        
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        
        // Same division, sort by team name alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });
      
      // Process each team
      sortedTeams.forEach(team => {
        const divisionName = team.division?.name || getDivisionName(team.division_id) || 'Unassigned';
        const teamName = team.name || 'Unnamed Team';
        
        // Get all players for this team
        const players = team.players || [];
        
        // Get all volunteers for this team
        const volunteers = team.volunteers || [];
        
        // If there are no players and no volunteers, still add a row with just division and team
        if (players.length === 0 && volunteers.length === 0) {
          const row = [
            divisionName,
            teamName,
            '', // Player Name
            '', // Volunteer Name
            ''  // Volunteer Role
          ].map(field => {
            if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          }).join(',');
          
          csvData.push(row);
        } else {
          // Get the maximum length between players and volunteers for row generation
          const maxRows = Math.max(players.length, volunteers.length);
          
          for (let i = 0; i < maxRows; i++) {
            const player = players[i];
            const volunteer = volunteers[i];
            
            const playerName = player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() : '';
            const volunteerName = volunteer ? volunteer.name || '' : '';
            const volunteerRole = volunteer ? volunteer.role || 'Parent' : '';
            
            const row = [
              divisionName,
              teamName,
              playerName,
              volunteerName,
              volunteerRole
            ].map(field => {
              if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
                return `"${field.replace(/"/g, '""')}"`;
              }
              return field;
            }).join(',');
            
            csvData.push(row);
          }
        }
      });
      
      // Create CSV blob
      const csvContent = csvData.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().split('T')[0];
      const fileType = exportOption === 'current' ? 'filtered' : 'all';
      link.setAttribute('href', url);
      link.setAttribute('download', `team-export-${fileType}-${timestamp}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`Export complete! ${sortedTeams.length} teams exported`);
      alert(`Team data exported successfully! Exported ${sortedTeams.length} teams.`);
      
      // Close the modal
      setShowExportModal(false);
      
    } catch (error) {
      console.error('Error exporting team data:', error);
      alert('Error exporting team data: ' + error.message);
    }
  };

  const generateSCImportFile = () => {
    try {
      console.log('Generating SC Team Import File...');
      
      // Filter teams that have managers
      const teamsWithManagers = teams.filter(team => {
        if (!team.volunteers || !Array.isArray(team.volunteers)) return false;
        
        // Check if team has at least one manager
        const hasManager = team.volunteers.some(volunteer => 
          volunteer.role === 'Manager'
        );
        
        return hasManager;
      });

      if (teamsWithManagers.length === 0) {
        alert('No teams with managers found. Please ensure teams have managers assigned before exporting.');
        return;
      }

      console.log(`Found ${teamsWithManagers.length} teams with managers`);

      // Prepare CSV data
      const csvData = [];
      
      // Add header row
      csvData.push('TeamName,PlayerID,VolunteerID,VolunteerTypeID,Player Name,Team Personnel Name,Team Personnel Role,Division');

      // Process each team
      teamsWithManagers.forEach(team => {
        // Get managers for this team
        const managers = team.volunteers.filter(volunteer => 
          volunteer.role === 'Manager'
        );

        // For each manager, create a row
        managers.forEach(manager => {
          // Get division name - try multiple sources
          let divisionName = 'Unassigned';
          
          // 1. First try: team.division object (if relationship is loaded)
          if (team.division && team.division.name) {
            divisionName = team.division.name;
          }
          // 2. Second try: manager's division (if manager has division data)
          else if (manager.division && manager.division.name) {
            divisionName = manager.division.name;
          }
          // 3. Third try: getDivisionName helper
          else if (team.division_id) {
            divisionName = getDivisionName(team.division_id);
          }
          // 4. Fourth try: check if division is in the divisions array
          else if (divisions && divisions.length > 0 && team.division_id) {
            const division = divisions.find(d => d.id === team.division_id);
            if (division) {
              divisionName = division.name;
            }
          }

          const row = [
            team.name || '', // TeamName
            '', // PlayerID (leave blank)
            manager.volunteer_id || '', // VolunteerID
            manager.volunteer_type_id || '', // VolunteerTypeID
            '', // Player Name (leave blank)
            manager.name || '', // Team Personnel Name
            manager.role || '', // Team Personnel Role
            divisionName // Division
          ].map(field => {
            // Escape fields with commas or quotes
            if (typeof field === 'string' && (field.includes(',') || field.includes('"') || field.includes('\n'))) {
              return `"${field.replace(/"/g, '""')}"`;
            }
            return field;
          }).join(',');

          csvData.push(row);
        });
      });

      // Create CSV blob
      const csvContent = csvData.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sc-team-import-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log(`Exported ${teamsWithManagers.length} teams with managers`);
      alert(`SC Team Import File created! Exported ${teamsWithManagers.length} teams with managers.`);
    } catch (error) {
      console.error('Error generating SC Team Import File:', error);
      alert('Error generating export file: ' + error.message);
    }
  };


  const handleTeamFormChange = (e) => {
    const { name, value } = e.target;
    setTeamForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSeasonChange = (e) => {
    const seasonId = e.target.value;
    setSelectedSeason(seasonId);
    // Also reset division when season changes
    setSelectedDivision('');
  };

  const handleDivisionChange = (e) => {
    const divisionId = e.target.value;
    setSelectedDivision(divisionId);
  };

  const handleAddTeamClick = () => {
    setEditingTeam(null);
    setTeamForm({
      name: '',
      color: 'blue',
      division_id: '',
      season_id: selectedSeason || seasons[0]?.id || '',
    });
    setCustomColor('');
    setUsingCustomColor(false);
    setShowTeamForm(true);
  };

  const handleEditTeamClick = (team) => {
  setEditingTeam(team);
  
  // Get all unique colors from existing teams
  const existingColors = [...new Set(teams.map(t => t.color).filter(Boolean))];
  const standardColors = ['blue', 'red', 'green', 'yellow'];
  const allColors = [...new Set([...standardColors, ...existingColors])];
  
  setTeamForm({
    name: team.name || '',
    color: team.color || 'blue',
    division_id: team.division_id || '',
    season_id: team.season_id || selectedSeason || seasons[0]?.id || '',
  });
  setCustomColor(team.color || '');
  setUsingCustomColor(!!team.color && !standardColors.includes(team.color));
  setShowTeamForm(true);
};

  const handleTeamSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      // Use custom color if we're using one, otherwise use the selected color
      const finalColor = usingCustomColor ? customColor : teamForm.color;

      const teamData = {
        name: teamForm.name,
        color: finalColor,
        division_id: teamForm.division_id || null,
        season_id: selectedSeason || seasons[0]?.id || null
      };

      console.log('Sending team data:', teamData);

      if (editingTeam) {
        await teamsAPI.update(editingTeam.id, teamData);
      } else {
        await teamsAPI.create(teamData);
      }
      
      await loadData();
      resetTeamForm();
      alert(editingTeam ? 'Team updated successfully!' : 'Team created successfully!');
    } catch (error) {
  console.error('Error saving team:', error);

  const apiMessage =
    error?.response?.data?.error ||
    'Your role does not have permission to update teams.';

  alert(apiMessage);              // <-- guarantees you see it
  setError(apiMessage);           // <-- keeps it for any on-page banner
}
  };

  const handleDeleteTeam = async (teamId) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        await teamsAPI.delete(teamId);
        await loadData();
        alert('Team deleted successfully!');
      } catch (error) {
  console.error('Error deleting team:', error);

  const apiMessage =
    error?.response?.data?.error ||
    'Your role does not have permission to delete teams.';

  alert(apiMessage);
  setError(apiMessage);
}
    }
  };

  const resetTeamForm = () => {
    setTeamForm({
      name: '',
      color: 'blue',
      division_id: '',
      season_id: selectedSeason,
    });
    setCustomColor('');
    setUsingCustomColor(false);
    setEditingTeam(null);
    setShowTeamForm(false);
  };

  const getDivisionName = (divisionId) => {
    const division = divisions.find((d) => d.id === divisionId);
    return division ? division.name : 'Unassigned';
  };

  const getSeasonName = (seasonId) => {
    const season = seasons.find((s) => s.id === seasonId);
    return season ? season.name : 'Unknown Season';
  };

  // Utility function to get age from birthdate
  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };
  
   const getLastName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1] || '';
  };

  // Get divisions filtered by selected season
  const getFilteredDivisions = () => {
    if (!selectedSeason) return divisions;
    return divisions.filter(division => division.season_id === selectedSeason);
  };

  // Helper function to check if a division is Challenger division
  const isChallengerDivision = (divisionId) => {
    const division = divisions.find(d => d.id === divisionId);
    if (!division) return false;
    const divisionName = division.name.toLowerCase();
    return divisionName === 'challenger' || divisionName.includes('challenger');
  };

  // Helper function to check if a team has players (rostered)
  const teamHasPlayers = (team) => {
    if (Array.isArray(team.players)) return team.players.length > 0;
    const cnt =
      typeof team.player_count === 'number'
        ? team.player_count
        : parseInt(team.player_count || '0', 10);
    return Number.isFinite(cnt) && cnt > 0;
  };

  // Calculate rostered teams count (teams with players, excluding Challenger division)
  const getRosteredTeamsCount = () => {
    return teams.filter(team => {
      const hasPlayers = teamHasPlayers(team);
      const isChallenger = isChallengerDivision(team.division_id);
      return hasPlayers && !isChallenger;
    }).length;
  };

  // Calculate total players count (only from rostered, non-Challenger teams)
  const getRosteredPlayersCount = () => {
    let totalPlayers = 0;
    teams.forEach(team => {
      const hasPlayers = teamHasPlayers(team);
      const isChallenger = isChallengerDivision(team.division_id);
      if (hasPlayers && !isChallenger) {
        totalPlayers += (team.player_count || team.players?.length || 0);
      }
    });
    return totalPlayers;
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      'Manager': 'bg-blue-100 text-blue-800',
      'Assistant Coach': 'bg-green-100 text-green-800',
      'Team Parent': 'bg-purple-100 text-purple-800',
      'Parent': 'bg-gray-100 text-gray-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getRoleTextColor = (role) => {
    const colors = {
      'Manager': 'text-blue-700',
      'Assistant Coach': 'text-green-700',
      'Team Parent': 'text-purple-700',
      'Parent': 'text-gray-700'
    };
    return colors[role] || 'text-gray-700';
  };

  const toggleTeamExpansion = (teamId) => {
    setExpandedTeam(expandedTeam === teamId ? null : teamId);
  };

  // Export Modal Footer
  const ExportModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={() => setShowExportModal(false)}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          backgroundColor: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          cursor: 'pointer'
        }}
        onMouseOver={(e) => e.target.style.backgroundColor = '#f9fafb'}
        onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
      >
        Cancel
      </button>
      <button
        onClick={exportTeamData}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
        onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
      >
        <Download style={{ width: '16px', height: '16px' }} />
        Export Data
      </button>
    </div>
  );

  // Team Modal Footer
  const TeamModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={resetTeamForm}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          backgroundColor: 'white',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          cursor: 'pointer'
        }}
        onMouseOver={(e) => e.target.style.backgroundColor = '#f9fafb'}
        onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
      >
        Cancel
      </button>
      <button
        onClick={handleTeamSubmit}
        disabled={!teamForm.name || !teamForm.division_id || !teamForm.season_id || (usingCustomColor && !customColor)}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!teamForm.name || !teamForm.division_id || !teamForm.season_id || (usingCustomColor && !customColor)) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!teamForm.name || !teamForm.division_id || !teamForm.season_id || (usingCustomColor && !customColor)) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (teamForm.name && teamForm.division_id && teamForm.season_id && (!usingCustomColor || customColor)) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (teamForm.name && teamForm.division_id && teamForm.season_id && (!usingCustomColor || customColor)) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingTeam ? 'Update Team' : 'Create Team'}
      </button>
    </div>
  );

  const renderTeamCard = (team) => (
              <div key={team.id} className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-3">
                      <div
                        className="h-8 w-8 rounded-full border border-gray-200 flex items-center justify-center text-sm font-semibold"
                        style={{ backgroundColor: team.color || '#e5e7eb' }}
                      >
                        {team.name ? team.name.charAt(0).toUpperCase() : '?'}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{team.name || 'Unnamed Team'}</h3>
<div className="text-xs text-gray-500 flex flex-wrap items-center">
  <span>Division: {team.division?.name || getDivisionName(team.division_id)}</span>
  <span>&nbsp;||&nbsp;Season: {getSeasonName(team.season_id)}</span>
  <span className="inline-flex items-center">
    <span>&nbsp;||&nbsp;Color:&nbsp;</span>
    <span 
      className="inline-block w-3 h-3 rounded-full mr-1" 
      style={{ backgroundColor: team.color || '#e5e7eb' }}
    ></span>
    <span>{team.color || 'Not set'}</span>
  </span>
  <span>&nbsp;||&nbsp;Players: {team.player_count || 0}</span>
  <span>&nbsp;||&nbsp;Volunteers: {team.volunteers?.length || 0}</span>
</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => toggleTeamExpansion(team.id)}
                      className="text-gray-400 hover:text-blue-600"
                    >
                      {expandedTeam === team.id ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleEditTeamClick(team)}
                      className="inline-flex items-center p-2 border border-gray-200 rounded-full text-gray-500 hover:text-blue-600 hover:border-blue-300"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTeam(team.id)}
                      className="inline-flex items-center p-2 border border-gray-200 rounded-full text-gray-500 hover:text-red-600 hover:border-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedTeam === team.id && (
                  <div className="px-4 sm:px-6 py-4 bg-gray-50">
                    {/* Roster */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Volunteers */}
                      <div>
                        <h4 className="text-lg font-medium text-gray-900 mb-4">Volunteers ({team.volunteers?.length || 0})</h4>
                        {team.volunteers && team.volunteers.length > 0 ? (
                          <div className="space-y-3">
                            {team.volunteers.map(volunteer => (
                              <div key={volunteer.id} className="bg-white border border-gray-200 rounded-lg p-3">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="font-semibold text-gray-900">{volunteer.name}</p>
                                    <p className={`text-xs ${getRoleTextColor(volunteer.role)} font-medium`}>
                                      {volunteer.role || 'Parent'}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 text-[11px] rounded-full ${getRoleBadgeColor(volunteer.role)}`}
                                  >
                                    {volunteer.role || 'Parent'}
                                  </span>
                                </div>
                                <div className="mt-2 text-xs space-y-1">
                                  {volunteer.email && (
                                    <a
                                      href={`mailto:${volunteer.email}`}
                                      className="inline-flex items-center text-blue-600 hover:text-blue-800"
                                    >
                                      <Mail className="h-3 w-3 mr-1" />
                                      <span className="truncate">{volunteer.email}</span>
                                    </a>
                                  )}
                                  {volunteer.phone && (
                                    <div className="flex items-center text-gray-700">
                                      <Phone className="h-3 w-3 mr-1" />
                                      <span>{volunteer.phone}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No volunteers assigned.</p>
                        )}
                      </div>

                      {/* Players detailed information */}
                      <div className="lg:col-span-2">
                        <h4 className="text-lg font-medium text-gray-900 mb-4">Players ({team.player_count || 0})</h4>
                        {team.players && team.players.length > 0 ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {team.players.map(player => {
                              const paymentStatus = getPaymentStatus(player);
                              const workbondStatus = getWorkbondStatus(player);
                              
                              return (
                              <div key={player.id} className="bg-white border border-gray-200 rounded-lg p-4">
                                {/* Player Basic Info */}
                                <div className="mb-3">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-semibold text-gray-900">
                                        {player.first_name} {player.last_name}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        {player.gender ? `${player.gender} • ` : ''}
                                        {player.birth_date ? `Age ${calculateAge(player.birth_date)}` : ''}
                                      </p>
                                    </div>
                                    {player.new_or_returning && (
                                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                        {player.new_or_returning === 'New' ? 'New Player' : 'Returning'}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Player Attributes - UPDATED with correct field names */}
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Program</p>
                                    <p className="font-medium text-gray-900">{player.program_title || 'N/A'}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Travel</p>
                                    <p className="font-medium text-gray-900">
                                      {player.travel_player === 'Yes' || player.is_travel_player === true ? 'Travel Player' : 'Rec Only'}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Payment Status</p>
                                    <p className="font-medium">
                                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${paymentStatus.className}`}>
                                        {paymentStatus.label}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Workbond Check</p>
                                    <div>
                                      <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${workbondStatus.className}`}>
                                        {workbondStatus.label}
                                      </span>
                                      {workbondStatus.notes && (
                                        <p className="text-xs text-gray-500 mt-1">{workbondStatus.notes}</p>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Uniform Info */}
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Shirt</p>
                                    <p className="font-medium text-gray-900">
                                      {getUniformShirtSize(player)}{' '}
                                      {getUniformShirtColor(player) ? `(${getUniformShirtColor(player)})` : ''}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Pants</p>
                                    <p className="font-medium text-gray-900">
                                      {getUniformPantsSize(player)}{' '}
                                      {getUniformPantsColor(player) ? `(${getUniformPantsColor(player)})` : ''}
                                    </p>
                                  </div>
                                </div>

                                {/* Medical & Notes */}
                                <div className="text-xs space-y-1">
                                  {player.medical_conditions && player.medical_conditions !== 'None' && player.medical_conditions !== 'none' && (
                                    <div>
                                      <p className="text-gray-500">Medical Conditions</p>
                                      <p className="text-gray-900">{player.medical_conditions}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Family Contacts */}
                                {player.family && (
                                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs">
                                    <p className="font-semibold text-gray-900 mb-1">Family Contacts</p>
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="text-gray-700">{player.family.primary_contact_name}</span>
                                        <span className="text-gray-500 text-[11px]">Primary</span>
                                      </div>
                                      {player.family.primary_contact_email && (
                                        <a
                                          href={`mailto:${player.family.primary_contact_email}`}
                                          className="inline-flex items-center text-blue-600 hover:text-blue-800"
                                        >
                                          <Mail className="h-3 w-3 mr-1" />
                                          <span className="truncate">{player.family.primary_contact_email}</span>
                                        </a>
                                      )}
                                      {player.family.primary_contact_phone && (
                                        <div className="flex items-center text-gray-700">
                                          <Phone className="h-3 w-3 mr-1" />
                                          <span>{player.family.primary_contact_phone}</span>
                                        </div>
                                      )}
                                      {player.family.parent2_first_name && (
                                        <div className="mt-2">
                                          <div className="flex items-center justify-between">
                                            <span className="text-gray-700">
                                              {player.family.parent2_first_name} {player.family.parent2_last_name}
                                            </span>
                                            <span className="text-gray-500 text-[11px]">Secondary</span>
                                          </div>
                                          {player.family.parent2_email && (
                                            <a
                                              href={`mailto:${player.family.parent2_email}`}
                                              className="inline-flex items-center text-blue-600 hover:text-blue-800"
                                            >
                                              <Mail className="h-3 w-3 mr-1" />
                                              <span className="truncate">{player.family.parent2_email}</span>
                                            </a>
                                          )}
                                          {player.family.parent2_phone && (
                                            <div className="flex items-center text-gray-700">
                                              <Phone className="h-3 w-3 mr-1" />
                                              <span>{player.family.parent2_phone}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No players assigned to this team.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
  );

  const { rosteredGroups, nonRosteredTeams } = React.useMemo(() => {
    const map = new Map();
    const nonRostered = [];

    const getDivisionLabel = (team) =>
      team.division?.name || getDivisionName(team.division_id) || 'No Division';

    teams.forEach((team) => {
      const divisionName = getDivisionLabel(team);
      const key = divisionName;

      if (!map.has(key)) {
        map.set(key, { divisionName, rostered: [] });
      }

      if (teamHasPlayers(team)) {
        map.get(key).rostered.push(team);
      } else {
        nonRostered.push({ team, divisionName });
      }
    });

    const groups = Array.from(map.values());

    // Sort divisions and teams alphabetically (case-insensitive)
    groups.sort((a, b) =>
      a.divisionName.localeCompare(b.divisionName, undefined, { sensitivity: 'base', numeric: true })
    );

    groups.forEach((g) => {
      g.rostered.sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true })
      );
    });

    nonRostered.sort((a, b) => {
      const nameCmp = (a.team?.name || '').localeCompare(b.team?.name || '', undefined, {
        sensitivity: 'base',
        numeric: true,
      });
      if (nameCmp !== 0) return nameCmp;
      return (a.divisionName || '').localeCompare(b.divisionName || '', undefined, {
        sensitivity: 'base',
        numeric: true,
      });
    });

    return {
      rosteredGroups: groups,
      nonRosteredTeams: nonRostered,
    };
  }, [teams, divisions]);

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Users className="h-6 w-6 mr-2 text-blue-600" />
              Team Management
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              View and manage teams, rosters, and volunteers across seasons and divisions.
            </p>
          </div>
          
         <div className="flex space-x-3">
  <button
    onClick={() => setShowExportModal(true)}
    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
  >
    <Download className="h-4 w-4 mr-2" />
    Export Team Data
  </button>
  <button
    onClick={generateSCImportFile}
    className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
  >
    <Download className="h-4 w-4 mr-2" />
    SC Team Import File
  </button>
  <button
    onClick={handleAddTeamClick}
    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
  >
    <Plus className="h-4 w-4 mr-2" />
    Add Team
  </button>
</div>
        </div>

        {/* Filters */}
        <div className="bg-white shadow rounded-lg mb-6 p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Season Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Season
              </label>
              <select
                value={selectedSeason}
                onChange={handleSeasonChange}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All Seasons</option>
                {seasons.map(season => (
                  <option key={season.id} value={season.id}>
                    {season.name || `Season ${season.year}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Division Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Division
              </label>
              <select
                value={selectedDivision}
                onChange={handleDivisionChange}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="">All Divisions</option>
                {getFilteredDivisions().map(division => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>
			 {/* Team Filter */}
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Team
      </label>
      <select
        value={selectedTeam}
        onChange={(e) => setSelectedTeam(e.target.value)}
        className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
      >
        <option value="">All Teams</option>
        {teams
          .filter(team => {
            // Only show teams that match current season/division filters
            let match = true;
            if (selectedSeason && team.season_id !== selectedSeason) match = false;
            if (selectedDivision && team.division_id !== selectedDivision) match = false;
            return match;
          })
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .map(team => (
            <option key={team.id} value={team.id}>
              {team.name} ({team.division?.name || getDivisionName(team.division_id)})
            </option>
          ))
        }
      </select>
	   </div>

            {/* Summary */}
            <div className="flex items-center">
              <div className="w-full bg-blue-50 border border-blue-100 rounded-lg p-3">
                <div className="flex items-center">
                  <div className="p-2 rounded-full bg-blue-100 mr-3">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-800 uppercase tracking-wide">
                      Current View Summary
                    </p>
                    <p className="text-sm text-blue-900">
                      {teams.length} total teams,{' '}
                      {teams.reduce((sum, team) => sum + (team.player_count || 0), 0)} total players
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      🏆 Rostered Teams (excl. Challenger): {getRosteredTeamsCount()} teams, {getRosteredPlayersCount()} players
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 flex">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
            <div className="flex-1 text-sm text-red-700">
              <p className="font-semibold">Error loading teams</p>
              <p>{error}</p>
              <button
                onClick={loadData}
                className="mt-2 inline-flex items-center px-3 py-1 border border-red-300 rounded-md text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Teams list */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white shadow rounded-lg p-6 flex items-center justify-center">
              <div className="flex items-center text-gray-500">
                <svg className="animate-spin h-5 w-5 mr-3 text-blue-600" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  ></path>
                </svg>
                <span>Loading teams...</span>
              </div>
            </div>
          ) : teams.length === 0 ? (
            <div className="bg-white shadow rounded-lg p-6 text-center">
              <p className="text-sm text-gray-500">
                No teams found for the selected filters. Try adjusting your season or division.
              </p>
            </div>
          ) : (
            <>
              {rosteredGroups.map((group) => (
                <div key={group.divisionName} className="space-y-4">
                <div className="px-1">
                  <h2 className="text-base font-semibold text-gray-900">{group.divisionName}</h2>
                  <p className="text-xs text-gray-500">
                    Rostered teams: {group.rostered.length}
                  </p>
                </div>

                {group.rostered.length > 0 ? (
                  group.rostered.map((team) => renderTeamCard(team))
                ) : (
                  <div className="bg-white shadow rounded-lg p-6 text-center">
                    <p className="text-sm text-gray-500">No rostered teams in this division.</p>
                  </div>
                )}
                </div>
              ))}

              {nonRosteredTeams.length > 0 && (
                <div className="mt-10 space-y-3">
                  <div className="px-1">
                    <h2 className="text-lg font-semibold text-gray-900">Non-rostered teams</h2>
                    <p className="text-sm text-gray-500">
                      Teams with no players (shown at the bottom so rostered teams are easier to scan).
                    </p>
                  </div>

                  {nonRosteredTeams.map(({ team }) => renderTeamCard(team))}
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Team Data"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
            Choose what data to export:
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                value="current"
                checked={exportOption === 'current'}
                onChange={(e) => setExportOption(e.target.value)}
                style={{ marginRight: '12px', cursor: 'pointer' }}
              />
              <div>
                <span style={{ fontWeight: '500', color: '#374151' }}>Current Filtered View</span>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  {selectedTeam ? `Export data for selected team only` : 
                   selectedDivision ? `Export data for ${getDivisionName(selectedDivision)} division` :
                   `Export data for all teams matching current filters (${teams.length} teams)`}
                </p>
              </div>
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                value="all"
                checked={exportOption === 'all'}
                onChange={(e) => setExportOption(e.target.value)}
                style={{ marginRight: '12px', cursor: 'pointer' }}
              />
              <div>
                <span style={{ fontWeight: '500', color: '#374151' }}>All Teams (No Filters)</span>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  Export all teams regardless of current filters
                </p>
              </div>
            </label>
          </div>
          
          <div style={{ 
            marginTop: '12px', 
            padding: '12px', 
            backgroundColor: '#f3f4f6', 
            borderRadius: '8px',
            fontSize: '13px',
            color: '#4b5563'
          }}>
            <p style={{ fontWeight: '500', marginBottom: '8px' }}>📋 Export includes:</p>
            <ul style={{ marginLeft: '20px', listStyle: 'disc' }}>
              <li>Division Name</li>
              <li>Team Name</li>
              <li>Player Names</li>
              <li>Volunteer Names</li>
              <li>Volunteer Roles</li>
            </ul>
            <p style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
              Data will be sorted by division order (T-Ball, Baseball Coach Pitch, Softball Rookies, etc.) 
              and then alphabetically by team name.
            </p>
          </div>
          
          {ExportModalFooter}
        </div>
      </Modal>

      {/* Team Modal */}
      <Modal
        isOpen={showTeamForm}
        onClose={resetTeamForm}
        title={editingTeam ? 'Edit Team' : 'Add New Team'}
      >
        <form onSubmit={handleTeamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Team Name */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Team Name *
            </label>
            <input
              type="text"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white'
              }}
              value={teamForm.name}
              onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              placeholder="Enter team name"
            />
          </div>

          {/* Season Selection */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Season *
            </label>
            <select
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white'
              }}
              value={teamForm.season_id}
              onChange={(e) => setTeamForm({ ...teamForm, season_id: e.target.value })}
            >
              <option value="">Select a season</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name || `Season ${season.year}`}
                </option>
              ))}
            </select>
          </div>

          {/* Division Selection */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Division *
            </label>
            <select
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white'
              }}
              value={teamForm.division_id}
              onChange={(e) => setTeamForm({ ...teamForm, division_id: e.target.value })}
            >
              <option value="">Select a division</option>
              {getFilteredDivisions().map(division => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </div>

                    {/* Color selection */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Team Color
            </label>
            <select
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white',
                marginBottom: '10px'
              }}
              value={usingCustomColor ? 'custom' : teamForm.color}
              onChange={(e) => {
                const isCustom = e.target.value === 'custom';
                if (isCustom) {
                  setUsingCustomColor(true);
                } else {
                  setUsingCustomColor(false);
                  setTeamForm({ ...teamForm, color: e.target.value });
                  setCustomColor('');
                }
              }}
            >
              {/* Standard colors group */}
              <optgroup label="Standard Colors">
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
              </optgroup>
              
              {/* Existing custom colors from database */}
              {teams.length > 0 && (
                <optgroup label="Previously Used Colors">
                  {[...new Set(teams.map(t => t.color).filter(Boolean))]
                    .filter(color => !['blue', 'red', 'green', 'yellow'].includes(color))
                    .map(color => (
                      <option key={color} value={color}>{color}</option>
                    ))
                  }
                </optgroup>
              )}
              
              <option value="custom">✨ Create New Custom Color</option>
            </select>
            
            {usingCustomColor && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Custom Color Name *
                </label>
                <input
                  type="text"
                  required={usingCustomColor}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: 'white'
                  }}
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setTeamForm({ ...teamForm, color: e.target.value });
                  }}
                  placeholder="Enter custom color name (e.g., 'Royal Blue', 'Forest Green')"
                />
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Enter a descriptive name for your custom color
                </p>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          {TeamModalFooter}
        </form>
      </Modal>
    </div>
  );
};

export default Teams;