import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, Users, Settings, Shield, Calendar, Copy, Mail, Phone, Download, Trash, GraduationCap } from 'lucide-react';
import Modal from '../components/Modal';

const Configuration = () => {
  const [activeTab, setActiveTab] = useState('seasons');
  const [teams, setTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Board members state for player agent dropdown
  const [boardMembers, setBoardMembers] = useState([]);
  
  // Form states
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [showDivisionForm, setShowDivisionForm] = useState(false);
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingDivision, setEditingDivision] = useState(null);
  const [editingSeason, setEditingSeason] = useState(null);
  
  // Form trainings
  const [trainings, setTrainings] = useState([]);
const [showTrainingForm, setShowTrainingForm] = useState(false);
const [editingTraining, setEditingTraining] = useState(null);
const [trainingForm, setTrainingForm] = useState({
  name: '',
  description: '',
  expiration_type: 'none', // 'none', 'days', 'date'
  expires_in_days: '',
  expires_on_date: '',
  category: 'both',
  is_required: false
});
const [clearTrainingForm, setClearTrainingForm] = useState({
  training_id: '',
  target_type: 'all'
});
  
  // Form data
  const [teamForm, setTeamForm] = useState({
    name: '',
    color: 'blue',
    division_id: '',
    season_id: ''
  });
  
  const [divisionForm, setDivisionForm] = useState({
    name: '',
    player_agent_id: '',
    player_agent_name: '',
    player_agent_email: '',
    player_agent_phone: '',
    season_id: ''
  });

  const [seasonForm, setSeasonForm] = useState({
    name: '',
    year: new Date().getFullYear().toString(),
    is_active: false,
    copy_from_season: '' // New field for copying structure
  });

  // Custom color state - separate from teamForm to prevent re-renders
  const [customColor, setCustomColor] = useState('');
  const [usingCustomColor, setUsingCustomColor] = useState(false);

  useEffect(() => {
    loadData();
  }, []);


	  // Training
	  const loadTrainings = async () => {
  try {
    const response = await fetch('/api/trainings');
    if (!response.ok) throw new Error('Trainings API failed');
    const data = await response.json();
    setTrainings(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading trainings:', error);
    setError(prev => prev ? prev + ' | ' + error.message : 'Failed to load trainings: ' + error.message);
  }
};


  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
	  
      const seasonsResponse = await fetch('/api/seasons');
      if (!seasonsResponse.ok) throw new Error('Seasons API failed');
      const seasonsData = await seasonsResponse.json();
      setSeasons(Array.isArray(seasonsData) ? seasonsData : []);

      const divisionsResponse = await fetch('/api/divisions');
      if (!divisionsResponse.ok) throw new Error('Divisions API failed');
      const divisionsData = await divisionsResponse.json();
      setDivisions(Array.isArray(divisionsData) ? divisionsData : []);

      const teamsResponse = await fetch('/api/teams');
      if (!teamsResponse.ok) throw new Error('Teams API failed');
      const teamsData = await teamsResponse.json();
      setTeams(Array.isArray(teamsData) ? teamsData : []);
      
      // Load board members for player agent dropdown
      const boardMembersResponse = await fetch('/api/board-members/player-agents');
      if (boardMembersResponse.ok) {
        const boardMembersData = await boardMembersResponse.json();
        setBoardMembers(boardMembersData);
      }
      
	      // ADD THIS LINE - Load trainings
    await loadTrainings();
	  
      // Default the configuration season filter to the ACTIVE season (fallback: first season)
      if (!selectedSeason && seasonsData.length > 0) {
        const active = seasonsData.find(s => s.is_active);
        setSelectedSeason((active?.id) || seasonsData[0].id);
      }} catch (error) {
      console.error('Error loading configuration data:', error);
      setError('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Season-scoped views for teams/divisions tabs
  const filteredDivisions = selectedSeason ? divisions.filter(d => d.season_id === selectedSeason) : divisions;
  const filteredTeams = selectedSeason ? teams.filter(t => t.season_id === selectedSeason) : teams;

  // Clear season data function
const handleClearSeasonData = async (seasonId) => {
  const season = seasons.find(s => s.id === seasonId);
  if (!season) return;

  const confirmMessage = `WARNING: This will permanently delete ALL data for season "${season.name}" including:\n\n• All players and their registrations\n• All family information\n• All volunteer assignments\n• All team assignments\n\nThis action cannot be undone!\n\nType "DELETE ${season.name}" to confirm:`;
  
  const userInput = prompt(confirmMessage);
  if (userInput !== `DELETE ${season.name}`) {
    alert('Clear season data cancelled. The confirmation text did not match.');
    return;
  }

  try {
    setLoading(true);
    console.log(`Starting data clear for season: ${season.name} (${seasonId})`);
    
    const response = await fetch(`/api/season-export/${seasonId}/clear-data`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Clear data API response not OK:', response.status, errorText);
      throw new Error(errorText);
    }

    const result = await response.json();
    console.log('Clear data result:', result);
    
    alert(`Successfully cleared data for season "${season.name}"`);
    await loadData(); // Reload data to reflect changes
  } catch (error) {
    console.error('Error clearing season data:', error);
    setError('Failed to clear season data: ' + error.message);
    alert(`Clear data failed: ${error.message}\n\nCheck the console for more details.`);
  } finally {
    setLoading(false);
  }
};

 // Export season data function - DYNAMIC FIELD VERSION
// Export season data function - TABBED VERSION
const handleExportSeason = async (seasonId) => {
  const season = seasons.find(s => s.id === seasonId);
  if (!season) return;

  try {
    setLoading(true);
    console.log(`Starting dynamic export for season: ${season.name} (${seasonId})`);
    
    const response = await fetch(`/api/season-export/${seasonId}/export`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Export API response not OK:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Dynamic export data received:', data);
    
    // Create timestamp for filename
    const timestamp = new Date().toISOString().split('T')[0];
    
    // Create a zip file with multiple CSV tabs
    const createTabbedCSV = () => {
      let csvContent = '';
      
      // 1. SEASON INFO TAB
      csvContent += '=== SEASON INFO ===\n';
      csvContent += `Season: ${season.name}\n`;
      csvContent += `Year: ${season.year}\n`;
      csvContent += `Export Date: ${new Date().toLocaleString()}\n`;
      csvContent += `Active: ${season.is_active ? 'Yes' : 'No'}\n\n`;
      
      // 2. DIVISIONS TAB
      csvContent += '=== DIVISIONS ===\n';
      if (data.divisions && data.divisions.length > 0) {
        const divisionFields = Object.keys(data.divisions[0]);
        csvContent += divisionFields.join(',') + '\n';
        
        data.divisions.forEach(division => {
          const row = divisionFields.map(field => {
            const value = division[field];
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No divisions found\n';
      }
      csvContent += '\n';
      
      // 3. TEAMS TAB
      csvContent += '=== TEAMS ===\n';
      if (data.teams && data.teams.length > 0) {
        const teamFields = Object.keys(data.teams[0]);
        const enhancedTeamFields = [...teamFields, 'division_name'];
        csvContent += enhancedTeamFields.join(',') + '\n';
        
        data.teams.forEach(team => {
          const divisionName = data.divisions?.find(d => d.id === team.division_id)?.name || 'No Division';
          const row = enhancedTeamFields.map(field => {
            let value;
            if (field === 'division_name') {
              value = divisionName;
            } else {
              value = team[field];
            }
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No teams found\n';
      }
      csvContent += '\n';
      
      // 4. PLAYERS TAB
      csvContent += '=== PLAYERS ===\n';
      if (data.players && data.players.length > 0) {
        const playerFields = Object.keys(data.players[0]);
        const enhancedPlayerFields = [...playerFields, 'team_name', 'division_name'];
        csvContent += enhancedPlayerFields.join(',') + '\n';
        
        data.players.forEach(player => {
          const teamName = data.teams?.find(t => t.id === player.team_id)?.name || 'Unassigned';
          const divisionName = data.divisions?.find(d => d.id === player.division_id)?.name || 'No Division';
          
          const row = enhancedPlayerFields.map(field => {
            let value;
            if (field === 'team_name') {
              value = teamName;
            } else if (field === 'division_name') {
              value = divisionName;
            } else {
              value = player[field];
            }
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No players found\n';
      }
      csvContent += '\n';
      
      // 5. FAMILIES TAB
      csvContent += '=== FAMILIES ===\n';
      if (data.families && data.families.length > 0) {
        const familyFields = Object.keys(data.families[0]);
        csvContent += familyFields.join(',') + '\n';
        
        data.families.forEach(family => {
          const row = familyFields.map(field => {
            const value = family[field];
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No families found\n';
      }
      csvContent += '\n';
      
      // 6. VOLUNTEERS TAB
      csvContent += '=== VOLUNTEERS ===\n';
      if (data.volunteers && data.volunteers.length > 0) {
        const volunteerFields = Object.keys(data.volunteers[0]);
        const enhancedVolunteerFields = [...volunteerFields, 'team_name', 'division_name'];
        csvContent += enhancedVolunteerFields.join(',') + '\n';
        
        data.volunteers.forEach(volunteer => {
          const teamName = data.teams?.find(t => t.id === volunteer.team_id)?.name || 'Unassigned';
          const divisionName = data.divisions?.find(d => d.id === volunteer.division_id)?.name || 'No Division';
          
          const row = enhancedVolunteerFields.map(field => {
            let value;
            if (field === 'team_name') {
              value = teamName;
            } else if (field === 'division_name') {
              value = divisionName;
            } else {
              value = volunteer[field];
            }
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No volunteers found\n';
      }
      csvContent += '\n';

      // 7. WORKBOND REQUIREMENTS TAB
      csvContent += '=== WORKBOND REQUIREMENTS ===\n';
      if (data.workbond_requirements && data.workbond_requirements.length > 0) {
        const reqFields = Object.keys(data.workbond_requirements[0]);
        const enhancedReqFields = [...reqFields, 'division_name'];
        csvContent += enhancedReqFields.join(',') + '\n';
        
        data.workbond_requirements.forEach(req => {
          const divisionName = data.divisions?.find(d => d.id === req.division_id)?.name || 'No Division';
          const row = enhancedReqFields.map(field => {
            let value;
            if (field === 'division_name') {
              value = divisionName;
            } else {
              value = req[field];
            }
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No workbond requirements found\n';
      }
      csvContent += '\n';

      // 8. WORKBOND SUMMARY TAB (Families tab)
      csvContent += '=== WORKBOND SUMMARY (FAMILIES) ===\n';
      if (data.workbond_summary && data.workbond_summary.length > 0) {
        const headers = ['Family ID', 'Family Name', 'Emails', 'Required', 'Completed', 'Remaining', 'Status', 'Exempt Reason'];
        csvContent += headers.join(',') + '\n';
        
        data.workbond_summary.forEach((r) => {
          const emails = Array.isArray(r.emails) ? r.emails.filter(Boolean).join(' | ') : (r.emails || '');
          const row = [
            r.family_id || '',
            r.family_name || '',
            emails,
            r.required ?? '',
            r.completed ?? '',
            r.remaining ?? '',
            r.status || '',
            r.exempt_reason || ''
          ].map(v => `"${String(v).replace(/"/g, '""')}"`);
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No workbond summary rows found\n';
      }
      csvContent += '\n';

      // 9. WORKBOND SHIFTS TAB (Shift Log)
      csvContent += '=== WORKBOND SHIFTS (SHIFT LOG) ===\n';
      if (data.workbond_shifts && data.workbond_shifts.length > 0) {
        const shiftFields = Object.keys(data.workbond_shifts[0]);
        csvContent += shiftFields.join(',') + '\n';
        
        data.workbond_shifts.forEach((s) => {
          const row = shiftFields.map((field) => {
            const value = s[field];
            return value !== null && value !== undefined ? `"${String(value).replace(/"/g, '""')}"` : '""';
          });
          csvContent += row.join(',') + '\n';
        });
      } else {
        csvContent += 'No workbond shifts found\n';
      }
      csvContent += '\n';

      return csvContent;
    };

    // Generate the tabbed CSV
    const csvContent = createTabbedCSV();
    
    // Create and download CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `COMPREHENSIVE_EXPORT_${season.name.replace(/\s+/g, '_')}_${season.year}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Tabbed export completed successfully');
    
    // Show summary to user
    alert(`Export completed!\n\nExported data includes:\n• Season Info\n• ${data.divisions?.length || 0} divisions\n• ${data.teams?.length || 0} teams\n• ${data.players?.length || 0} players\n• ${data.families?.length || 0} families\n• ${data.volunteers?.length || 0} volunteers\n• ${data.workbond_summary?.length || 0} workbond summaries\n• ${data.workbond_shifts?.length || 0} workbond shifts\n\nAll data organized in tabs within the CSV file.`);
    
  } catch (error) {
    console.error('Error exporting season:', error);
    setError('Failed to export season: ' + error.message);
    alert(`Export failed: ${error.message}\n\nCheck the console for more details.`);
  } finally {
    setLoading(false);
  }
};


const handleTrainingSubmit = async (e) => {
  if (e) e.preventDefault();
  try {
    // Prepare expiration data based on type
    let expirationData = {};
    if (trainingForm.expiration_type === 'days') {
      expirationData = {
        expires_in_days: trainingForm.expires_in_days ? parseInt(trainingForm.expires_in_days) : null,
        expires_on_date: null
      };
    } else if (trainingForm.expiration_type === 'date') {
      expirationData = {
        expires_in_days: null,
        expires_on_date: trainingForm.expires_on_date || null
      };
    } else {
      expirationData = {
        expires_in_days: null,
        expires_on_date: null
      };
    }

    const trainingData = {
      name: trainingForm.name,
      description: trainingForm.description || null,
      ...expirationData,
      category: trainingForm.category,
      is_required: trainingForm.is_required
    };

    const url = editingTraining ? `/api/trainings/${editingTraining.id}` : '/api/trainings';
    const method = editingTraining ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(trainingData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    await loadTrainings();
    resetTrainingForm();
  } catch (error) {
    console.error('Error saving training:', error);
    setError('Failed to save training: ' + error.message);
  }
};

const handleEditTraining = (training) => {
  setEditingTraining(training);
  
  // Determine expiration type
  let expiration_type = 'none';
  if (training.expires_in_days) expiration_type = 'days';
  if (training.expires_on_date) expiration_type = 'date';
  
  setTrainingForm({
    name: training.name,
    description: training.description || '',
    expiration_type: expiration_type,
    expires_in_days: training.expires_in_days || '',
    expires_on_date: training.expires_on_date || '',
    category: training.category || 'both',
    is_required: training.is_required || false
  });
  setShowTrainingForm(true);
};

const handleDeleteTraining = async (trainingId) => {
  if (window.confirm('Are you sure you want to delete this training? This will remove it from all volunteers and board members.')) {
    try {
      const response = await fetch(`/api/trainings/${trainingId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete training');
      await loadTrainings();
    } catch (error) {
      console.error('Error deleting training:', error);
      setError('Failed to delete training. ' + error.message);
    }
  }
};

const handleClearTraining = async () => {
  if (!clearTrainingForm.training_id) {
    alert('Please select a training to clear');
    return;
  }

  const training = trainings.find(t => t.id === clearTrainingForm.training_id);
  if (!training) return;

  const confirmMessage = `This will remove "${training.name}" training from ALL ${clearTrainingForm.target_type === 'all' ? 'volunteers and board members' : clearTrainingForm.target_type}. Continue?`;
  
  if (!window.confirm(confirmMessage)) return;

  try {
    const response = await fetch('/api/trainings/clear-training', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        training_id: clearTrainingForm.training_id,
        target_type: clearTrainingForm.target_type
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    alert(`Successfully cleared training from ${result.cleared_count} records`);
    setClearTrainingForm({ training_id: '', target_type: 'all' });
  } catch (error) {
    console.error('Error clearing training:', error);
    setError('Failed to clear training: ' + error.message);
  }
};

const handleCheckExpirations = async () => {
  if (!window.confirm('Check and update expired trainings for all volunteers and board members?')) {
    return;
  }

  try {
    const response = await fetch('/api/trainings/check-expirations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target_type: 'all'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    alert('Expiration check completed. Expired trainings have been updated.');
  } catch (error) {
    console.error('Error checking expirations:', error);
    setError('Failed to check expirations: ' + error.message);
  }
};

const resetTrainingForm = () => {
  setTrainingForm({
    name: '',
    description: '',
    expiration_type: 'none',
    expires_in_days: '',
    expires_on_date: '',
    category: 'both',
    is_required: false
  });
  setEditingTraining(null);
  setShowTrainingForm(false);
};

// Add Training Modal Footer
const TrainingModalFooter = (
  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
    <button
      onClick={resetTrainingForm}
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
      onClick={handleTrainingSubmit}
      disabled={!trainingForm.name || !trainingForm.category}
      style={{
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: '500',
        color: 'white',
        backgroundColor: (!trainingForm.name || !trainingForm.category) ? '#9ca3af' : '#2563eb',
        border: 'none',
        borderRadius: '6px',
        cursor: (!trainingForm.name || !trainingForm.category) ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
      onMouseOver={(e) => {
        if (trainingForm.name && trainingForm.category) {
          e.target.style.backgroundColor = '#1d4ed8';
        }
      }}
      onMouseOut={(e) => {
        if (trainingForm.name && trainingForm.category) {
          e.target.style.backgroundColor = '#2563eb';
        }
      }}
    >
      <Save style={{ width: '16px', height: '16px' }} />
      {editingTraining ? 'Update Training' : 'Create Training'}
    </button>
  </div>
);



  const handleTeamSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      const finalColor = usingCustomColor ? customColor : teamForm.color;

      const teamData = {
        name: teamForm.name,
        color: finalColor,
        division_id: teamForm.division_id || null,
        season_id: selectedSeason || seasons[0]?.id
      };

      const url = editingTeam ? `/api/teams/${editingTeam.id}` : '/api/teams';
      const method = editingTeam ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(teamData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      await loadData();
      resetTeamForm();
    } catch (error) {
      console.error('Error saving team:', error);
      setError('Failed to save team: ' + error.message);
    }
  };

  const handleDivisionSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      const divisionData = {
        name: divisionForm.name,
        player_agent_name: divisionForm.player_agent_name || null,
        player_agent_email: divisionForm.player_agent_email || null,
        player_agent_phone: divisionForm.player_agent_phone || null,
        board_member_id: divisionForm.player_agent_id || null,
        season_id: selectedSeason || (seasons.length > 0 ? seasons[0].id : null)
      };

      const url = editingDivision ? `/api/divisions/${editingDivision.id}` : '/api/divisions';
      const method = editingDivision ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(divisionData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      await loadData();
      resetDivisionForm();
    } catch (error) {
      console.error('Error saving division:', error);
      setError('Failed to save division: ' + error.message);
    }
  };

  const handleSeasonSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      const isEditing = Boolean(editingSeason?.id);

      // When editing a season, we update it in-place.
      // Only include copy_from_season when creating a brand-new season.
      const seasonData = {
        name: seasonForm.name,
        year: Number(seasonForm.year),
        is_active: Boolean(seasonForm.is_active),
        ...(isEditing ? {} : { copy_from_season: seasonForm.copy_from_season || null })
      };

      console.log(isEditing ? 'Updating season with data:' : 'Creating season with data:', seasonData);

      const url = isEditing ? `/api/seasons/${editingSeason.id}` : '/api/seasons';
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(seasonData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      await loadData();
      resetSeasonForm();
    } catch (error) {
      console.error('Error saving season:', error);
      setError('Failed to save season: ' + error.message);
    }
  };

  // Add this new function to handle copying structure from existing season
  const copySeasonStructure = async (sourceSeasonId, targetSeasonId) => {
    try {
      const response = await fetch('/api/seasons/copy-structure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_season_id: sourceSeasonId,
          target_season_id: targetSeasonId
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to copy structure: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error copying season structure:', error);
      throw error;
    }
  };

  const handleEditTeam = (team) => {
    setEditingTeam(team);
    
    const standardColors = ['red', 'blue', 'green', 'orange', 'purple', 'yellow', 'indigo', 'pink', 'teal', 'gray', 'black', 'white'];
    const isCustomColor = team.color && !standardColors.includes(team.color);
    
    setTeamForm({
      name: team.name,
      color: isCustomColor ? 'custom' : (team.color || 'blue'),
      division_id: team.division_id || '',
      season_id: team.season_id || selectedSeason
    });
    
    if (isCustomColor) {
      setUsingCustomColor(true);
      setCustomColor(team.color);
    } else {
      setUsingCustomColor(false);
      setCustomColor('');
    }
    
    setShowTeamForm(true);
  };

  const handleEditDivision = (division) => {
    setEditingDivision(division);
    setDivisionForm({
      name: division.name,
      player_agent_id: division.board_member_id || '',
      player_agent_name: division.player_agent_name || '',
      player_agent_email: division.player_agent_email || '',
      player_agent_phone: division.player_agent_phone || '',
      season_id: division.season_id || selectedSeason
    });
    setShowDivisionForm(true);
  };

  const handleEditSeason = (season) => {
    setEditingSeason(season);
    setSeasonForm({
      name: season.name,
      year: season.year || new Date().getFullYear().toString(),
      is_active: season.is_active || false,
      copy_from_season: '' // Reset copy option when editing
    });
    setShowSeasonForm(true);
  };

  const handleDeleteTeam = async (teamId) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        const response = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete team');
        await loadData();
      } catch (error) {
        console.error('Error deleting team:', error);
        setError('Failed to delete team. ' + error.message);
      }
    }
  };

  const handleDeleteDivision = async (divisionId) => {
    if (window.confirm('Are you sure you want to delete this division?')) {
      try {
        const response = await fetch(`/api/divisions/${divisionId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete division');
        await loadData();
      } catch (error) {
        console.error('Error deleting division:', error);
        setError('Failed to delete division. ' + error.message);
      }
    }
  };

  const handleDeleteSeason = async (seasonId) => {
    if (window.confirm('Are you sure you want to delete this season? This will also delete all associated teams, divisions, and players.')) {
      try {
        const response = await fetch(`/api/seasons/${seasonId}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Failed to delete season');
        await loadData();
      } catch (error) {
        console.error('Error deleting season:', error);
        setError('Failed to delete season. ' + error.message);
      }
    }
  };

  const resetTeamForm = () => {
    setTeamForm({
      name: '',
      color: 'blue',
      division_id: '',
      season_id: selectedSeason
    });
    setCustomColor('');
    setUsingCustomColor(false);
    setEditingTeam(null);
    setShowTeamForm(false);
  };

  const resetDivisionForm = () => {
    setDivisionForm({
      name: '',
      player_agent_id: '',
      player_agent_name: '',
      player_agent_email: '',
      player_agent_phone: '',
      season_id: selectedSeason
    });
    setEditingDivision(null);
    setShowDivisionForm(false);
  };

  const resetSeasonForm = () => {
    setSeasonForm({
      name: '',
      year: new Date().getFullYear().toString(),
      is_active: false,
      copy_from_season: ''
    });
    setEditingSeason(null);
    setShowSeasonForm(false);
  };

  const getColorClass = (color) => {
    const colorMap = {
      'red': 'bg-red-500',
      'blue': 'bg-blue-500',
      'green': 'bg-green-500',
      'orange': 'bg-orange-500',
      'purple': 'bg-purple-500',
      'yellow': 'bg-yellow-500',
      'indigo': 'bg-indigo-500',
      'pink': 'bg-pink-500',
      'teal': 'bg-teal-500',
      'gray': 'bg-gray-500',
      'black': 'bg-black',
      'white': 'bg-white border border-gray-300'
    };
    return colorMap[color] || 'bg-gray-500';
  };

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
        disabled={!teamForm.name || !teamForm.division_id || (usingCustomColor && !customColor)}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!teamForm.name || !teamForm.division_id || (usingCustomColor && !customColor)) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!teamForm.name || !teamForm.division_id || (usingCustomColor && !customColor)) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (teamForm.name && teamForm.division_id && (!usingCustomColor || customColor)) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (teamForm.name && teamForm.division_id && (!usingCustomColor || customColor)) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingTeam ? 'Update Team' : 'Create Team'}
      </button>
    </div>
  );

  // Division Modal Footer
  const DivisionModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={resetDivisionForm}
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
        onClick={handleDivisionSubmit}
        disabled={!divisionForm.name}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: !divisionForm.name ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: !divisionForm.name ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (divisionForm.name) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (divisionForm.name) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingDivision ? 'Update Division' : 'Create Division'}
      </button>
    </div>
  );

  // Season Modal Footer
  const SeasonModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={resetSeasonForm}
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
        onClick={handleSeasonSubmit}
        disabled={!seasonForm.name || !seasonForm.year}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!seasonForm.name || !seasonForm.year) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!seasonForm.name || !seasonForm.year) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (seasonForm.name && seasonForm.year) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (seasonForm.name && seasonForm.year) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingSeason ? 'Update Season' : 'Create Season'}
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading configuration...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Configuration</h1>
            <p className="text-gray-600 mt-1">Manage system settings, seasons, teams, and divisions</p>
          </div>
          <div className="flex items-center space-x-3">
            <select
              className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              <option value="">All Seasons</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadData}
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {['seasons', 'teams', 'divisions', 'trainings'].map((tab) => (  // Added 'trainings'
  <button
    key={tab}
    onClick={() => setActiveTab(tab)}
    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize ${
      activeTab === tab
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`}
  >
    {tab === 'seasons' && <Calendar className="w-4 h-4 inline mr-2" />}
    {tab === 'teams' && <Users className="w-4 h-4 inline mr-2" />}
    {tab === 'divisions' && <Shield className="w-4 h-4 inline mr-2" />}
    {tab === 'trainings' && <GraduationCap className="w-4 h-4 inline mr-2" />} {/* Added */}
    {tab}
  </button>
))}
        </nav>
      </div>

      {/* Team Modal */}
      <Modal
        isOpen={showTeamForm}
        onClose={resetTeamForm}
        title={editingTeam ? 'Edit Team' : 'Add New Team'}
        footer={TeamModalFooter}
      >
        <form onSubmit={handleTeamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
              value={teamForm.color}
              onChange={(e) => {
                const isCustom = e.target.value === 'custom';
                setTeamForm({ ...teamForm, color: e.target.value });
                setUsingCustomColor(isCustom);
                if (!isCustom) {
                  setCustomColor('');
                }
              }}
            >
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="green">Green</option>
              <option value="orange">Orange</option>
              <option value="purple">Purple</option>
              <option value="yellow">Yellow</option>
              <option value="indigo">Indigo</option>
              <option value="pink">Pink</option>
              <option value="teal">Teal</option>
              <option value="gray">Gray</option>
              <option value="black">Black</option>
              <option value="white">White</option>
              <option value="custom">Custom Color (enter below)</option>
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
                  onChange={(e) => setCustomColor(e.target.value)}
                  placeholder="Enter custom color name (e.g., 'Royal Blue', 'Forest Green')"
                />
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Enter a descriptive name for your custom color
                </p>
              </div>
            )}
          </div>
          
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
              {filteredDivisions.map(division => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </div>
        </form>
      </Modal>

      {/* Division Modal */}
      <Modal
        isOpen={showDivisionForm}
        onClose={resetDivisionForm}
        title={editingDivision ? 'Edit Division' : 'Add New Division'}
        footer={DivisionModalFooter}
      >
        <form onSubmit={handleDivisionSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Division Name *
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
              value={divisionForm.name}
              onChange={(e) => setDivisionForm({ ...divisionForm, name: e.target.value })}
              placeholder="Enter division name"
            />
          </div>

          {/* UPDATED: Player Agent Selection using Board Members */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Player Agent (Board Member)
            </label>
            <select
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white'
              }}
              value={divisionForm.player_agent_id || ''}
              onChange={(e) => {
                const selectedMember = boardMembers.find(member => member.id === e.target.value);
                setDivisionForm({
                  ...divisionForm,
                  player_agent_id: e.target.value,
                  player_agent_name: selectedMember ? selectedMember.name : '',
                  player_agent_email: selectedMember ? selectedMember.email : '',
                  player_agent_phone: selectedMember ? selectedMember.phone : ''
                });
              }}
            >
              <option value="">Select a board member</option>
              {boardMembers.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name} - {member.role}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Select a board member to automatically populate their contact information
            </p>
          </div>

          {/* Display the auto-populated contact information */}
          {(divisionForm.player_agent_name || divisionForm.player_agent_email || divisionForm.player_agent_phone) && (
            <div style={{
              padding: '12px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              border: '1px solid #e5e7eb'
            }}>
              <h4 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Player Agent Information:</h4>
              {divisionForm.player_agent_name && (
                <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>Name:</strong> {divisionForm.player_agent_name}
                </div>
              )}
              {divisionForm.player_agent_email && (
                <div style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>Email:</strong> {divisionForm.player_agent_email}
                </div>
              )}
              {divisionForm.player_agent_phone && (
                <div style={{ fontSize: '14px' }}>
                  <strong>Phone:</strong> {divisionForm.player_agent_phone}
                </div>
              )}
            </div>
          )}

          {/* Manual override fields (hidden when board member is selected) */}
          {!divisionForm.player_agent_id && (
            <>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Player Agent Name
                </label>
                <input
                  type="text"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: 'white'
                  }}
                  value={divisionForm.player_agent_name}
                  onChange={(e) => setDivisionForm({ ...divisionForm, player_agent_name: e.target.value })}
                  placeholder="Enter player agent name"
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Player Agent Email
                </label>
                <input
                  type="email"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: 'white'
                  }}
                  value={divisionForm.player_agent_email}
                  onChange={(e) => setDivisionForm({ ...divisionForm, player_agent_email: e.target.value })}
                  placeholder="Enter player agent email"
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Player Agent Phone
                </label>
                <input
                  type="tel"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: 'white'
                  }}
                  value={divisionForm.player_agent_phone}
                  onChange={(e) => setDivisionForm({ ...divisionForm, player_agent_phone: e.target.value })}
                  placeholder="Enter player agent phone number"
                />
              </div>
            </>
          )}
        </form>
      </Modal>

      {/* Season Modal */}
      <Modal
        isOpen={showSeasonForm}
        onClose={resetSeasonForm}
        title={editingSeason ? 'Edit Season' : 'Add New Season'}
        footer={SeasonModalFooter}
      >
        <form onSubmit={handleSeasonSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Season Name *
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
              value={seasonForm.name}
              onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
              placeholder="e.g., Spring 2024, Fall 2024"
            />
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px'
            }}>
              Year *
            </label>
            <input
              type="number"
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
              value={seasonForm.year}
              onChange={(e) => setSeasonForm({ ...seasonForm, year: e.target.value })}
              placeholder="Enter year (e.g., 2024)"
              min="2000"
              max="2100"
            />
          </div>

          {/* Copy Structure Option - Only show when creating new season */}
          {!editingSeason && seasons.length > 0 && (
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Copy Teams & Divisions From Existing Season
              </label>
              <select
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#374151',
                  backgroundColor: 'white'
                }}
                value={seasonForm.copy_from_season}
                onChange={(e) => setSeasonForm({ ...seasonForm, copy_from_season: e.target.value })}
              >
                <option value="">Create empty season (no teams/divisions)</option>
                {seasons.map(season => (
                  <option key={season.id} value={season.id}>
                    Copy from: {season.name} ({season.year})
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                This will copy all divisions and teams from the selected season. Player assignments will not be copied.
              </p>
            </div>
          )}
          
          <div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                style={{
                  marginRight: '8px'
                }}
                checked={seasonForm.is_active}
                onChange={(e) => setSeasonForm({ ...seasonForm, is_active: e.target.checked })}
              />
              Active Season
            </label>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Active seasons are available for new registrations and team assignments
            </p>
          </div>
        </form>
      </Modal>
{/* Training Modal */}
<Modal
  isOpen={showTrainingForm}
  onClose={resetTrainingForm}
  title={editingTraining ? 'Edit Training' : 'Add New Training'}
  footer={TrainingModalFooter}
>
  <form onSubmit={handleTrainingSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
    {/* Training Name - KEEP THIS */}
    <div>
      <label style={{
        display: 'block',
        fontSize: '14px',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '8px'
      }}>
        Training Name *
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
        value={trainingForm.name}
        onChange={(e) => setTrainingForm({ ...trainingForm, name: e.target.value })}
        placeholder="e.g., Abuse Awareness, Safety Training"
      />
    </div>
    
    {/* Training Description - KEEP THIS */}
    <div>
      <label style={{
        display: 'block',
        fontSize: '14px',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '8px'
      }}>
        Description
      </label>
      <textarea
        style={{
          width: '100%',
          padding: '10px 12px',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#374151',
          backgroundColor: 'white',
          minHeight: '80px',
          resize: 'vertical'
        }}
        value={trainingForm.description}
        onChange={(e) => setTrainingForm({ ...trainingForm, description: e.target.value })}
        placeholder="Describe the training requirements..."
      />
    </div>
    
    {/* NEW: Expiration Type Section - ADD THIS */}
    <div>
      <label style={{
        display: 'block',
        fontSize: '14px',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '8px'
      }}>
        Expiration Type
      </label>
      <div className="space-y-2">
        <div className="flex items-center">
          <input
            type="radio"
            id="expire_none"
            name="expiration_type"
            value="none"
            checked={trainingForm.expiration_type === 'none'}
            onChange={(e) => setTrainingForm({ ...trainingForm, expiration_type: e.target.value })}
            className="h-4 w-4 text-blue-600"
          />
          <label htmlFor="expire_none" className="ml-2 text-sm text-gray-700">
            Never expires
          </label>
        </div>
        
        <div className="flex items-center">
          <input
            type="radio"
            id="expire_days"
            name="expiration_type"
            value="days"
            checked={trainingForm.expiration_type === 'days'}
            onChange={(e) => setTrainingForm({ ...trainingForm, expiration_type: e.target.value })}
            className="h-4 w-4 text-blue-600"
          />
          <label htmlFor="expire_days" className="ml-2 text-sm text-gray-700">
            Expires after X days from completion
          </label>
        </div>
        {trainingForm.expiration_type === 'days' && (
          <div className="ml-6">
            <input
              type="number"
              min="1"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white'
              }}
              value={trainingForm.expires_in_days}
              onChange={(e) => setTrainingForm({ ...trainingForm, expires_in_days: e.target.value })}
              placeholder="Enter number of days (e.g., 365 for 1 year)"
            />
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              Training will expire X days after the completion date
            </p>
          </div>
        )}
        
        <div className="flex items-center">
          <input
            type="radio"
            id="expire_date"
            name="expiration_type"
            value="date"
            checked={trainingForm.expiration_type === 'date'}
            onChange={(e) => setTrainingForm({ ...trainingForm, expiration_type: e.target.value })}
            className="h-4 w-4 text-blue-600"
          />
          <label htmlFor="expire_date" className="ml-2 text-sm text-gray-700">
            Expires on a specific calendar date
          </label>
        </div>
        {trainingForm.expiration_type === 'date' && (
          <div className="ml-6">
            <input
              type="date"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white'
              }}
              value={trainingForm.expires_on_date}
              onChange={(e) => setTrainingForm({ ...trainingForm, expires_on_date: e.target.value })}
            />
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
              All completions of this training will expire on this date (e.g., "All 2024 trainings expire on 12/31/2024")
            </p>
          </div>
        )}
      </div>
    </div>
    
    {/* Category - KEEP THIS */}
    <div>
      <label style={{
        display: 'block',
        fontSize: '14px',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '8px'
      }}>
        Category *
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
        value={trainingForm.category}
        onChange={(e) => setTrainingForm({ ...trainingForm, category: e.target.value })}
      >
        <option value="both">Both Volunteers & Board Members</option>
        <option value="volunteer">Volunteers Only</option>
        <option value="board_member">Board Members Only</option>
      </select>
    </div>
    
    {/* Required Training - KEEP THIS */}
    <div>
      <label style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: '14px',
        fontWeight: '500',
        color: '#374151',
        marginBottom: '8px',
        cursor: 'pointer'
      }}>
        <input
          type="checkbox"
          style={{
            marginRight: '8px'
          }}
          checked={trainingForm.is_required}
          onChange={(e) => setTrainingForm({ ...trainingForm, is_required: e.target.checked })}
        />
        Required Training
      </label>
      <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
        Required trainings must be completed by all applicable volunteers/board members
      </p>
    </div>
  </form>
</Modal>

      {/* Seasons Tab */}
      {activeTab === 'seasons' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">Season Management</h2>
            <button
              onClick={() => setShowSeasonForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Season
            </button>
          </div>

          {/* Seasons Table */}
          <div className="bg-white shadow overflow-hidden rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Season Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Year
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Teams/Divisions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {seasons.map((season) => {
                  const seasonTeams = teams.filter(t => t.season_id === season.id);
                  const seasonDivisions = divisions.filter(d => d.season_id === season.id);
                  
                  return (
                    <tr key={season.id} className={season.is_active ? 'bg-green-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{season.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{season.year}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {seasonDivisions.length} divisions, {seasonTeams.length} teams
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {season.is_active ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleEditSeason(season)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Edit Season"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleExportSeason(season.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Export Season Data"
                        >
                          <Download className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleClearSeasonData(season.id)}
                          className="text-orange-600 hover:text-orange-900"
                          title="Clear Season Data"
                        >
                          <Trash className="h-4 w-4 inline" />
                        </button>
                        <button
                          onClick={() => handleDeleteSeason(season.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete Season"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {seasons.length === 0 && (
              <div className="text-center py-12">
                <Calendar className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No seasons configured</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first season
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Teams Tab */}
      {activeTab === 'teams' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">Team Management</h2>
            <button
              onClick={() => setShowTeamForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Team
            </button>
          </div>

          {/* Teams Grid */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredTeams.map((team) => (
              <div key={team.id} className="bg-white overflow-hidden shadow rounded-lg border border-gray-200">
                <div className={`h-2 ${getColorClass(team.color)}`}></div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">{team.name}</h3>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditTeam(team)}
                        className="text-gray-400 hover:text-blue-600"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Division:</span>
                      <span className="font-medium text-gray-900">
                        {team.division?.name || divisions.find(d => d.id === team.division_id)?.name || 'No Division'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-500">Color:</span>
                      <span className="font-medium text-gray-900 capitalize">
                        {team.color}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-gray-500">Season:</span>
                      <span className="font-medium text-gray-900">
                        {seasons.find(s => s.id === team.season_id)?.name || 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {teams.length === 0 && (
            <div className="text-center py-12 bg-white shadow rounded-lg">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No teams configured</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating your first team
              </p>
            </div>
          )}
        </div>
      )}

      {/* Divisions Tab */}
      {activeTab === 'divisions' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-medium text-gray-900">Division Management</h2>
            <button
              onClick={() => setShowDivisionForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Division
            </button>
          </div>

          {/* Divisions Table */}
          <div className="bg-white shadow overflow-hidden rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Division Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Teams
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Season
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDivisions.map((division) => (
                  <tr key={division.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{division.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {division.player_agent_name ? (
                          <div>
                            <div className="font-medium">{division.player_agent_name}</div>
                            {division.player_agent_email && (
                              <div className="flex items-center text-gray-500 text-xs mt-1">
                                <Mail className="h-3 w-3 mr-1" />
                                {division.player_agent_email}
                              </div>
                            )}
                            {division.player_agent_phone && (
                              <div className="flex items-center text-gray-500 text-xs mt-1">
                                <Phone className="h-3 w-3 mr-1" />
                                {division.player_agent_phone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">Not assigned</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {teams.filter(t => t.division_id === division.id).length} teams
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {seasons.find(s => s.id === division.season_id)?.name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEditDivision(division)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteDivision(division.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {divisions.length === 0 && (
              <div className="text-center py-12">
                <Shield className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No divisions configured</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first division
                </p>
              </div>
            )}
          </div>
        </div>
      )}
{/* Trainings Tab */}
{activeTab === 'trainings' && (
  <div>
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-lg font-medium text-gray-900">Training Management</h2>
      <div className="flex items-center space-x-3">
        <button
          onClick={handleCheckExpirations}
          className="inline-flex items-center px-4 py-2 border border-orange-300 rounded-md shadow-sm text-sm font-medium text-orange-700 bg-white hover:bg-orange-50"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Check Expirations
        </button>
        <button
          onClick={() => setShowTrainingForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Training
        </button>
      </div>
    </div>

    {/* Clear Training Tool */}
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <h3 className="text-md font-medium text-yellow-800 mb-2">Clear Training Tool</h3>
      <p className="text-sm text-yellow-700 mb-3">
        Remove a specific training from all volunteers and/or board members (useful when trainings expire or change).
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          value={clearTrainingForm.training_id}
          onChange={(e) => setClearTrainingForm({ ...clearTrainingForm, training_id: e.target.value })}
        >
          <option value="">Select Training to Clear</option>
          {trainings.map(training => (
            <option key={training.id} value={training.id}>
              {training.name} ({training.category})
            </option>
          ))}
        </select>
        
        <select
          className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
          value={clearTrainingForm.target_type}
          onChange={(e) => setClearTrainingForm({ ...clearTrainingForm, target_type: e.target.value })}
        >
          <option value="all">All Volunteers & Board Members</option>
          <option value="volunteers">Volunteers Only</option>
          <option value="board_members">Board Members Only</option>
        </select>
        
        <button
          onClick={handleClearTraining}
          disabled={!clearTrainingForm.training_id}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            !clearTrainingForm.training_id 
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
              : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          Clear Training
        </button>
      </div>
    </div>

    {/* Trainings Table */}
    <div className="bg-white shadow overflow-hidden rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Training Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Expiration
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Category
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Required
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {trainings.map((training) => (
            <tr key={training.id}>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">{training.name}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm text-gray-900">{training.description || '—'}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
  <div className="text-sm text-gray-900">
    {training.expires_in_days ? (
      <div>
        <span className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full mb-1">
          {training.expires_in_days} days after completion
        </span>
        <div className="text-xs text-gray-500">Days-based expiration</div>
      </div>
    ) : training.expires_on_date ? (
      <div>
        <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full mb-1">
          Expires on: {new Date(training.expires_on_date).toLocaleDateString()}
        </span>
        <div className="text-xs text-gray-500">Calendar date expiration</div>
      </div>
    ) : (
      <span className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
        Never expires
      </span>
    )}
  </div>
</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {training.category === 'both' ? (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                      Both
                    </span>
                  ) : training.category === 'volunteer' ? (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      Volunteers
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded-full">
                      Board Members
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900">
                  {training.is_required ? (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                      Required
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                      Optional
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button
                  onClick={() => handleEditTraining(training)}
                  className="text-blue-600 hover:text-blue-900 mr-4"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteTraining(training.id)}
                  className="text-red-600 hover:text-red-900"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {trainings.length === 0 && (
        <div className="text-center py-12">
          <GraduationCap className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No trainings configured</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating your first training
          </p>
        </div>
      )}
    </div>
  </div>
)}
      {/* Settings Tab */}
      {/*{activeTab === 'settings' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">System Settings</h2>
          <div className="space-y-6">
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Season Settings</h3>
              <p className="text-sm text-gray-500">
                Manage seasons and their configurations. This area will allow you to set up registration periods, fees, and other season-specific settings.
              </p>
            </div>
            
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Registration Settings</h3>
              <p className="text-sm text-gray-500">
                Configure registration fees, payment options, and registration requirements.
              </p>
            </div>
            
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-md font-medium text-gray-900 mb-4">Work Bond Settings</h3>
              <p className="text-sm text-gray-500">
                Set work bond requirements, tracking methods, and completion criteria.
              </p>
            </div>
          </div>
        </div>
      )}*/}
    </div>
  );
};

export default Configuration;