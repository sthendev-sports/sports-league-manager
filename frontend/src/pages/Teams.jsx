import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, Users, Shield, AlertCircle, Mail, Phone, ChevronDown, ChevronUp, Download } from 'lucide-react'; // Added Download import
import Modal from '../components/Modal';
import api, { teamsAPI, divisionsAPI, seasonsAPI } from '../services/api';


const Teams = () => {
  const [teams, setTeams] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTeam, setExpandedTeam] = useState(null);
  
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

  useEffect(() => {
    loadData();
  }, [selectedSeason, selectedDivision]);

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

      const teamsData = Array.isArray(teamsRes.data) ? teamsRes.data : [];
      const divisionsData = Array.isArray(divisionsRes.data) ? divisionsRes.data : [];
      const seasonsData = Array.isArray(seasonsRes.data) ? seasonsRes.data : [];
      
      // Filter teams by selected season and division if applicable
      let filteredTeams = teamsData;
      
      if (selectedSeason) {
        filteredTeams = filteredTeams.filter(team => team.season_id === selectedSeason);
      }
      
      if (selectedDivision) {
        filteredTeams = filteredTeams.filter(team => team.division_id === selectedDivision);
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

        // Get division name
        const divisionName = team.division?.name || getDivisionName(team.division_id);

        // For each manager, create a row
        managers.forEach(manager => {
          // Get manager's last name
          const managerLastName = getLastName(manager.name);
          
          // Create team name with manager's last name: "TeamName - LastName"
          const teamNameWithManager = managerLastName 
            ? `${team.name || ''} - ${managerLastName}`
            : team.name || '';

          const row = [
            teamNameWithManager, // TeamName with manager's last name
            '', // PlayerID (leave blank)
            manager.volunteer_id || '', // VolunteerID
            manager.volunteer_type_id || '', // VolunteerTypeID
            '', // Player Name (leave blank)
            manager.name || '', // Team Personnel Name
            manager.role || '', // Team Personnel Role
            divisionName || '' // Division
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
    setTeamForm({
      name: team.name || '',
      color: team.color || 'blue',
      division_id: team.division_id || '',
      season_id: team.season_id || selectedSeason || seasons[0]?.id || '',
    });
    setCustomColor(team.color || '');
    setUsingCustomColor(!!team.color && !['blue', 'red', 'green', 'yellow'].includes(team.color));
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
      setError('Failed to save team: ' + error.message);
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
        setError('Failed to delete team. ' + error.message);
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

  // Team Modal Footer
  const TeamModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
      <button
        type="button"
        onClick={resetTeamForm}
        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        onClick={handleTeamSubmit}
        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
      >
        <Save className="h-4 w-4 mr-2" />
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
                        <div className="flex flex-wrap items-center text-xs text-gray-500 space-x-2">
                          <span>Division: {team.division?.name || getDivisionName(team.division_id)}</span>
                          <span>Season: {getSeasonName(team.season_id)}</span>
                          <span>Players: {team.player_count || 0}</span>
                          <span>Volunteers: {team.volunteers?.length || 0}</span>
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
                            {team.players.map(player => (
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

                                {/* Player Attributes */}
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Program</p>
                                    <p className="font-medium text-gray-900">{player.program_title || 'N/A'}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Travel</p>
                                    <p className="font-medium text-gray-900">
                                      {player.travel_player === 'Yes' ? 'Travel Player' : 'Rec Only'}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Payment Status</p>
                                    <p className="font-medium text-gray-900">
                                      {player.payment_status || 'Unknown'}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Workbond Check</p>
                                    <p className="font-medium text-gray-900">
                                      {player.workbond_check_status || 'Unknown'}
                                    </p>
                                  </div>
                                </div>

                                {/* Uniform Info */}
                                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Shirt</p>
                                    <p className="font-medium text-gray-900">
                                      {player.uniform_shirt_size || 'N/A'}{' '}
                                      {player.uniform_shirt_color ? `(${player.uniform_shirt_color})` : ''}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-gray-500">Pants</p>
                                    <p className="font-medium text-gray-900">
                                      {player.uniform_pant_size || 'N/A'}{' '}
                                      {player.uniform_pant_color ? `(${player.uniform_pant_color})` : ''}
                                    </p>
                                  </div>
                                </div>

                                {/* Medical & Notes */}
                                <div className="text-xs space-y-1">
                                  {player.medical_conditions && (
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
                            ))}
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

  const teamHasPlayers = (team) => {
    if (Array.isArray(team.players)) return team.players.length > 0;
    const cnt =
      typeof team.player_count === 'number'
        ? team.player_count
        : parseInt(team.player_count || '0', 10);
    return Number.isFinite(cnt) && cnt > 0;
  };

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
                      {teams.length} teams,{' '}
                      {teams.reduce((sum, team) => sum + (team.player_count || 0), 0)} players
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

      {/* Team Modal */}
      <Modal
        isOpen={showTeamForm}
        title={editingTeam ? 'Edit Team' : 'Add New Team'}
        onClose={resetTeamForm}
        footer={TeamModalFooter}
      >
        <form onSubmit={handleTeamSubmit} className="space-y-4">
          {/* Team Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Name</label>
            <input
              type="text"
              name="name"
              value={teamForm.name}
              onChange={handleTeamFormChange}
              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Enter team name"
              required
            />
          </div>

          {/* Season Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
            <select
              name="season_id"
              value={teamForm.season_id}
              onChange={handleTeamFormChange}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
            <select
              name="division_id"
              value={teamForm.division_id}
              onChange={handleTeamFormChange}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Color</label>
            <div className="flex items-center space-x-3">
              <select
                name="color"
                value={usingCustomColor ? 'custom' : teamForm.color}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'custom') {
                    setUsingCustomColor(true);
                    // Keep existing custom color or blank
                  } else {
                    setUsingCustomColor(false);
                    setTeamForm((prev) => ({ ...prev, color: value }));
                  }
                }}
                className="block w-48 pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="custom">Custom...</option>
              </select>

              {usingCustomColor && (
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={customColor || '#0000ff'}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomColor(value);
                      setTeamForm((prev) => ({ ...prev, color: value }));
                    }}
                    className="h-10 w-10 rounded-full border border-gray-300"
                  />
                  <input
                    type="text"
                    value={customColor}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCustomColor(value);
                      setTeamForm((prev) => ({ ...prev, color: value }));
                    }}
                    placeholder="#0000ff"
                    className="block w-32 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Teams;
