import React, { useState, useEffect, useMemo } from 'react';
import { Download, Users, Mail, Phone, CheckCircle, XCircle, AlertCircle, GraduationCap, Filter } from 'lucide-react';
import api, { divisionsAPI, teamsAPI, seasonsAPI } from '../services/api';

const DIVISION_SORT_ORDER = [
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

const sortDivisionName = (a, b) => {
  const ai = DIVISION_SORT_ORDER.indexOf(a);
  const bi = DIVISION_SORT_ORDER.indexOf(b);
  const aIn = ai !== -1;
  const bIn = bi !== -1;
  if (aIn && bIn) return ai - bi;
  if (aIn) return -1;
  if (bIn) return 1;
  return String(a).localeCompare(String(b));
};

const sortTeamNameWithinDivision = (a, b) => {
  // non-empty team names first, then empty last
  const aEmpty = !a;
  const bEmpty = !b;
  if (aEmpty && !bEmpty) return 1;
  if (!aEmpty && bEmpty) return -1;
  return String(a).localeCompare(String(b));
};

const VolunteerReports = () => {
  const [volunteers, setVolunteers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedTrainingStatus, setSelectedTrainingStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableTrainings, setAvailableTrainings] = useState([]);

  useEffect(() => {
    // Don't load divisions and teams here - they'll be loaded when season is selected
    loadSeasons();
    loadAvailableTrainings();
  }, []);

  useEffect(() => {
  if (selectedSeason) {
    // Reset division and team filters when season changes
    setSelectedDivision('');
    setSelectedTeam('');
    // Load volunteers for the new season
    loadVolunteers();
  }
}, [selectedSeason]);

useEffect(() => {
  if (selectedSeason) {
    // Load divisions and teams for the new season
    loadDivisions();
    loadTeams();
  }
}, [selectedSeason]);

// This effect handles division and team filter changes
useEffect(() => {
  if (selectedSeason) {
    loadVolunteers();
  }
}, [selectedDivision, selectedTeam]);

  const loadVolunteers = async () => {
    try {
      setLoading(true);

      const params = {};
      if (selectedDivision) params.division_id = selectedDivision;
      if (selectedSeason) params.season_id = selectedSeason;

      const response = await api.get('/volunteers', { params });
      let data = Array.isArray(response.data) ? response.data : [];

      // Keep existing behavior: team filter is applied client-side
      if (selectedTeam) {
        data = data.filter(volunteer => volunteer.team_id === selectedTeam);
      }

      setVolunteers(data || []);
    } catch (error) {
      console.error('Error loading volunteers:', error);
      setVolunteers([]);
    } finally {
      setLoading(false);
    }
  };

   const loadDivisions = async () => {
    try {
      let url = '/api/divisions';
      // Add season filter if a season is selected
      if (selectedSeason) {
        url += `?season_id=${selectedSeason}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load divisions`);
      }
      const data = await response.json();
      setDivisions(data || []);
    } catch (error) {
      console.error('Error loading divisions:', error);
      setDivisions([]);
    }
  };

  const loadTeams = async () => {
    try {
      // For teams, we need to filter by season through the API
      // or we can get all teams and filter client-side
      const response = await fetch('/api/teams');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: Failed to load teams`);
      }
      const allTeams = await response.json();
      
      // Filter teams by selected season if a season is selected
      let filteredTeams = allTeams || [];
      if (selectedSeason) {
        filteredTeams = filteredTeams.filter(team => 
          team.season_id === selectedSeason
        );
      }
      
      setTeams(filteredTeams);
    } catch (error) {
      console.error('Error loading teams:', error);
      setTeams([]);
    }
  };

  const loadSeasons = async () => {
    try {
      const response = await seasonsAPI.getAll();
      const data = response.data;
      setSeasons(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) setSelectedSeason(data[0].id);
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  };

  const loadAvailableTrainings = async () => {
    try {
      const response = await fetch('/api/trainings?category=volunteer');
      if (response.ok) {
        const data = await response.json();
        setAvailableTrainings(data || []);
      }
    } catch (error) {
      console.error('Error loading trainings:', error);
    }
  };

  // Get unique roles for filter dropdown
  const uniqueRoles = useMemo(() => {
    const roles = new Set();
    volunteers.forEach(v => {
      if (v.role) roles.add(v.role);
    });
    return Array.from(roles).sort();
  }, [volunteers]);

  // Filter volunteers based on selected filters
  const filteredVolunteers = useMemo(() => {
    return volunteers.filter(volunteer => {
      // Role filter
      if (selectedRole && volunteer.role !== selectedRole) return false;
      
      // Training status filter
      if (selectedTrainingStatus) {
        const summary = volunteer.trainings_summary || {};
        switch (selectedTrainingStatus) {
          case 'compliant':
            if (!summary.all_required_completed) return false;
            break;
          case 'non_compliant':
            if (summary.all_required_completed) return false;
            break;
          case 'completed_any':
            if (!summary.completed || summary.completed === 0) return false;
            break;
          case 'completed_none':
            if (summary.completed && summary.completed > 0) return false;
            break;
          default:
            break;
        }
      }
      
      return true;
    });
  }, [volunteers, selectedRole, selectedTrainingStatus]);

  // Helper function to get missing required trainings for a volunteer
  const getMissingTrainings = (volunteer) => {
    const trainingSummary = volunteer.trainings_summary || {};
    const volunteerTrainings = volunteer.trainings || [];
    
    if (trainingSummary.required === 0) {
      return [];
    }
    
    const requiredTrainings = availableTrainings.filter(t => t.is_required);
    const missing = requiredTrainings.filter(requiredTraining => {
      const volunteerTraining = volunteerTrainings.find(t => 
        t.training && t.training.id === requiredTraining.id
      );
      
      // Missing if no training record or status is not 'completed'
      return !volunteerTraining || volunteerTraining.status !== 'completed';
    });
    
    return missing.map(t => t.name);
  };

  const exportToCSV = () => {
    const headers = [
      'Name',
      'Role',
      'Division',
      'Team',
      'Email',
      'Phone',
      'Total Trainings',
      'Completed Trainings',
      'Expired Trainings',
      'Required Trainings',
      'Completed Required Trainings',
      'All Required Completed',
      'Missing Required Trainings',
      'Training Details'
    ];

    const csvData = filteredVolunteers.map(volunteer => {
      const trainingSummary = volunteer.trainings_summary || {};
      const volunteerTrainings = volunteer.trainings || [];
      const missingTrainings = getMissingTrainings(volunteer);
      
      const trainingDetails = volunteerTrainings.map(t => 
        `${t.training?.name || 'Unknown'}: ${t.status}${t.completed_date ? ` (${t.completed_date})` : ''}`
      ).join('; ');
      
      return [
        volunteer.name,
        volunteer.role,
        volunteer.division?.name || 'Any Division',
        volunteer.team?.name || 'Unallocated',
        volunteer.email || '',
        volunteer.phone || '',
        trainingSummary.total || 0,
        trainingSummary.completed || 0,
        trainingSummary.expired || 0,
        trainingSummary.required || 0,
        trainingSummary.completed_required || 0,
        trainingSummary.all_required_completed ? 'Yes' : 'No',
        missingTrainings.join('; '),
        trainingDetails
      ];
    });

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteers-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const getRoleStats = () => {
    const stats = {};
    filteredVolunteers.forEach(volunteer => {
      const role = volunteer.role || 'Parent';
      stats[role] = (stats[role] || 0) + 1;
    });
    return stats;
  };

  const getTrainingComplianceStats = () => {
    let compliant = 0;
    let nonCompliant = 0;
    
    filteredVolunteers.forEach(volunteer => {
      const summary = volunteer.trainings_summary || {};
      if (summary.all_required_completed) {
        compliant++;
      } else if (summary.required > 0) {
        nonCompliant++;
      }
    });
    
    return { compliant, nonCompliant };
  };

  // Division table: Division | Parents | Team Parent | Assistant Coach | Manager | Coach | Board Member
  const divisionTableRows = useMemo(() => {
    const roleKeys = {
      parents: 'Parent',
      teamParent: 'Team Parent',
      assistantCoach: 'Assistant Coach',
      manager: 'Manager',
      coach: 'Coach',
      boardMember: 'Board Member'
    };

    const byDivision = new Map();

    // Seed rows using known division list so they always appear (even if 0)
    const allDivisionNames = new Set();
    DIVISION_SORT_ORDER.forEach(d => allDivisionNames.add(d));
    divisions.forEach(d => {
      if (d?.name) allDivisionNames.add(d.name);
    });

    // Initialize
    for (const divName of allDivisionNames) {
      byDivision.set(divName, {
        division: divName,
        parents: 0,
        teamParent: 0,
        assistantCoach: 0,
        manager: 0,
        coach: 0,
        boardMember: 0
      });
    }

    // Count using filtered volunteers
    filteredVolunteers.forEach(v => {
      const divName = v.division?.name || 'Any Division';
      if (!byDivision.has(divName)) {
        byDivision.set(divName, {
          division: divName,
          parents: 0,
          teamParent: 0,
          assistantCoach: 0,
          manager: 0,
          coach: 0,
          boardMember: 0
        });
      }
      const row = byDivision.get(divName);
      const role = v.role || 'Parent';

      if (role === roleKeys.parents) row.parents += 1;
      else if (role === roleKeys.teamParent) row.teamParent += 1;
      else if (role === roleKeys.assistantCoach) row.assistantCoach += 1;
      else if (role === roleKeys.manager) row.manager += 1;
      else if (role === roleKeys.coach) row.coach += 1;
      else if (role === roleKeys.boardMember) row.boardMember += 1;
    });

    const ordered = Array.from(byDivision.values()).sort((a, b) => sortDivisionName(a.division, b.division));
    return ordered;
  }, [filteredVolunteers, divisions]);

  // Teams table: Division | Team | Parents | Team Parent | Assistant Coach | Manager
  const teamTableRows = useMemo(() => {
    const byDivTeam = new Map();

    const keyOf = (divName, teamName) => `${divName}|||${teamName}`;

    filteredVolunteers.forEach(v => {
      const divName = v.division?.name || 'Any Division';
      const teamName = v.team?.name || ''; // blank cell like your example for unallocated
      const key = keyOf(divName, teamName);

      if (!byDivTeam.has(key)) {
        byDivTeam.set(key, {
          division: divName,
          team: teamName,
          parents: 0,
          teamParent: 0,
          assistantCoach: 0,
          manager: 0
        });
      }

      const row = byDivTeam.get(key);
      const role = v.role || 'Parent';

      if (role === 'Parent') row.parents += 1;
      else if (role === 'Team Parent') row.teamParent += 1;
      else if (role === 'Assistant Coach') row.assistantCoach += 1;
      else if (role === 'Manager') row.manager += 1;
    });

    const rows = Array.from(byDivTeam.values());

    rows.sort((a, b) => {
      const d = sortDivisionName(a.division, b.division);
      if (d !== 0) return d;
      return sortTeamNameWithinDivision(a.team, b.team);
    });

    return rows;
  }, [filteredVolunteers]);

  const roleColors = {
    'Manager': 'bg-blue-100 text-blue-800',
    'Coach': 'bg-green-100 text-green-800',
    'Assistant Coach': 'bg-emerald-100 text-emerald-800',
    'Team Parent': 'bg-purple-100 text-purple-800',
    'Umpire': 'bg-orange-100 text-orange-800',
    'Field Maintenance': 'bg-amber-100 text-amber-800',
    'Concession': 'bg-pink-100 text-pink-800',
    'Board Member': 'bg-indigo-100 text-indigo-800',
    'Parent': 'bg-gray-100 text-gray-800'
  };

  const roleStats = getRoleStats();
  const trainingStats = getTrainingComplianceStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Volunteer Reports</h2>
            <p className="text-gray-600">View and export volunteer information including training compliance</p>
          </div>
          <button
            onClick={exportToCSV}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
          >
            <Download className="h-4 w-4 mr-2" />
            Export to CSV
          </button>
        </div>
      </div>

      {/* Filters - UPDATED WITH ROLE AND TRAINING FILTERS */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              <option value="">All Seasons</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
            >
              <option value="">All Divisions</option>
              {divisions.map(division => (
                <option key={division.id} value={division.id}>{division.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
            >
              <option value="">All Teams</option>
              {teams.map(team => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="">All Roles</option>
              {uniqueRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Training Status</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedTrainingStatus}
              onChange={(e) => setSelectedTrainingStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="compliant">Compliant (All Required Completed)</option>
              <option value="non_compliant">Non-Compliant (Missing Required)</option>
              <option value="completed_any">Any Training Completed</option>
              <option value="completed_none">No Trainings Completed</option>
            </select>
          </div>
        </div>
        
        {/* Clear filters button */}
        {(selectedRole || selectedTrainingStatus) && (
          <div className="mt-4">
            <button
              onClick={() => {
                setSelectedRole('');
                setSelectedTrainingStatus('');
              }}
              className="inline-flex items-center px-3 py-1 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              <Filter className="h-3 w-3 mr-1" />
              Clear Role/Training Filters
            </button>
            <span className="ml-3 text-sm text-gray-500">
              Showing {filteredVolunteers.length} of {volunteers.length} volunteers
            </span>
          </div>
        )}
      </div>

      {/* Training Compliance Summary */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Training Compliance Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-700">{trainingStats.compliant}</div>
            <div className="text-sm font-medium text-green-800">Compliant Volunteers</div>
            <div className="text-xs text-green-600 mt-1">All required trainings completed</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-700">{trainingStats.nonCompliant}</div>
            <div className="text-sm font-medium text-red-800">Non-Compliant Volunteers</div>
            <div className="text-xs text-red-600 mt-1">Missing required trainings</div>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-700">{filteredVolunteers.length}</div>
            <div className="text-sm font-medium text-gray-800">Total Volunteers</div>
            <div className="text-xs text-gray-600 mt-1">In current view</div>
          </div>
        </div>
      </div>

            {/* Role Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Volunteers by Role</h3>
        <div className="space-y-3">
          {Object.entries(roleStats).map(([role, count]) => (
            <div key={role} className="flex items-center">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[role] || 'bg-gray-100 text-gray-800'} mr-3`}
              >
                {role}
              </span>
              <span className="text-sm font-medium text-gray-900">- {count}</span>
            </div>
          ))}
        </div>
      </div>

             {/* Interested Roles by Division - Table Format */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Interested Roles by Division</h3>
          <p className="text-sm text-gray-500 mt-1">
            Count of volunteers interested in each role, organized by division
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assistant Coach
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team Parent
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(() => {
                // Initialize structure to track interested roles by division
                const divisionData = new Map();
                const allRoles = new Set(['Manager', 'Assistant Coach', 'Team Parent']);
                
                // Initialize all divisions with zero counts
                filteredVolunteers.forEach(volunteer => {
                  const divisionName = volunteer.division?.name || 'Any Division';
                  
                  if (!divisionData.has(divisionName)) {
                    divisionData.set(divisionName, {
                      Manager: 0,
                      'Assistant Coach': 0,
                      'Team Parent': 0,
                      total: 0
                    });
                  }
                });
                
                // Count interested roles for each division
                filteredVolunteers.forEach(volunteer => {
                  if (volunteer.interested_roles) {
                    const divisionName = volunteer.division?.name || 'Any Division';
                    const divisionCounts = divisionData.get(divisionName);
                    
                    // Split interested roles by common delimiters
                    const roles = volunteer.interested_roles
                      .split(/[;,/]+/)
                      .map(r => r.trim())
                      .filter(Boolean);
                    
                    roles.forEach(role => {
                      // Normalize role names to match our columns
                      let normalizedRole = '';
                      
                      // Check for Team Manager or Manager
                      if (role.toLowerCase().includes('team manager') || 
                          role.toLowerCase().includes('manager') ||
                          role === 'TM') {
                        normalizedRole = 'Manager';
                      }
                      // Check for Assistant Coach
                      else if (role.toLowerCase().includes('assistant') || 
                               role.toLowerCase().includes('assistant coach') ||
                               role === 'AC') {
                        normalizedRole = 'Assistant Coach';
                      }
                      // Check for Team Parent
                      else if (role.toLowerCase().includes('team parent') || 
                               role.toLowerCase().includes('parent') ||
                               role === 'TP') {
                        normalizedRole = 'Team Parent';
                      }
                      
                      if (normalizedRole && allRoles.has(normalizedRole) && divisionCounts) {
                        divisionCounts[normalizedRole] += 1;
                        divisionCounts.total += 1;
                      }
                    });
                  }
                });
                
                // Convert to array and sort by division order
                const divisionArray = Array.from(divisionData.entries())
                  .map(([divisionName, counts]) => ({ divisionName, ...counts }))
                  .sort((a, b) => sortDivisionName(a.divisionName, b.divisionName));
                
                // Calculate totals
                const totals = {
                  divisionName: 'Total',
                  Manager: 0,
                  'Assistant Coach': 0,
                  'Team Parent': 0,
                  total: 0
                };
                
                divisionArray.forEach(division => {
                  totals.Manager += division.Manager;
                  totals['Assistant Coach'] += division['Assistant Coach'];
                  totals['Team Parent'] += division['Team Parent'];
                  totals.total += division.total;
                });
                
                // Filter to only show divisions in DIVISION_SORT_ORDER
                const filteredDivisions = divisionArray.filter(division => 
                  DIVISION_SORT_ORDER.includes(division.divisionName)
                );
                
                if (filteredDivisions.length === 0) {
                  return (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center">
                        <div className="text-gray-400 mb-2">No interested roles data available</div>
                        <div className="text-sm text-gray-500">Volunteers can specify roles they're interested in on their profile</div>
                      </td>
                    </tr>
                  );
                }
                
                return (
                  <>
                    {filteredDivisions.map((division) => (
                      <tr key={division.divisionName} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {division.divisionName}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-center">
                          {division.Manager > 0 ? division.Manager : ''}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-center">
                          {division['Assistant Coach'] > 0 ? division['Assistant Coach'] : ''}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-center">
                          {division['Team Parent'] > 0 ? division['Team Parent'] : ''}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-900 text-center font-semibold">
                          {division.total}
                        </td>
                      </tr>
                    ))}
                    
                    {/* Total Row */}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-6 py-3 text-sm text-gray-900 whitespace-nowrap">Total</td>
                      <td className="px-6 py-3 text-sm text-gray-900 text-center">{totals.Manager > 0 ? totals.Manager : ''}</td>
                      <td className="px-6 py-3 text-sm text-gray-900 text-center">{totals['Assistant Coach'] > 0 ? totals['Assistant Coach'] : ''}</td>
                      <td className="px-6 py-3 text-sm text-gray-900 text-center">{totals['Team Parent'] > 0 ? totals['Team Parent'] : ''}</td>
                      <td className="px-6 py-3 text-sm text-gray-900 text-center">{totals.total}</td>
                    </tr>
                  </>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Training Compliance Details - UPDATED WITH MISSING TRAININGS */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Training Compliance Details</h3>
          <p className="text-sm text-gray-500 mt-1">
            Volunteers with their training completion status and missing required trainings
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Volunteer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Required Trainings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Completed Trainings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Compliance Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Missing Required Trainings
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVolunteers.map((volunteer) => {
                const trainingSummary = volunteer.trainings_summary || {};
                const isCompliant = trainingSummary.all_required_completed;
                const missingTrainings = getMissingTrainings(volunteer);
                
                return (
                  <tr key={volunteer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {volunteer.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {volunteer.email || 'No email'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[volunteer.role] || 'bg-gray-100 text-gray-800'}`}>
                        {volunteer.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {volunteer.division?.name || 'Any Division'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {trainingSummary.required || 0} required
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {trainingSummary.completed || 0}/{trainingSummary.total || 0} completed
                      </div>
                      {trainingSummary.expired > 0 && (
                        <div className="text-xs text-red-600">
                          {trainingSummary.expired} expired
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {isCompliant ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Compliant
                        </span>
                      ) : missingTrainings.length > 0 ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Missing {missingTrainings.length}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                          No required trainings
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {missingTrainings.length > 0 ? (
                        <div className="space-y-1">
                          {missingTrainings.map((trainingName, index) => (
                            <div key={index} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                              • {trainingName}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500">None</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredVolunteers.length === 0 && !loading && (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No volunteers found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or import volunteer data
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Volunteers by Division (table layout like your screenshot) */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Volunteers by Division</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parents
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team Parent
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assistant Coach
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Manager
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coach
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Board
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {divisionTableRows
                .filter(r => DIVISION_SORT_ORDER.includes(r.division)) // show only your requested divisions
                .map((r) => (
                  <tr key={r.division} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {r.division}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.parents || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.teamParent || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.assistantCoach || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.manager || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.coach || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.boardMember || ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Volunteers by Teams (table layout like your screenshot) */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Volunteers by Teams</h3>
          <p className="text-sm text-gray-500 mt-1">
            Sorted by your division order, then by team name (blank team rows are unallocated for that division).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parents
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team Parent
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assistant Coach
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Manager
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {teamTableRows
                .filter(r => DIVISION_SORT_ORDER.includes(r.division)) // keep to requested divisions
                .map((r, idx) => (
                  <tr key={`${r.division}|||${r.team}|||${idx}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {r.division}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900">
                      {r.team /* blank is allowed per your example */}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.parents || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.teamParent || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.assistantCoach || ''}</td>
                    <td className="px-6 py-3 text-sm text-gray-900 text-center">{r.manager || ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* All Volunteers List - SIMPLIFIED VERSION */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            All Volunteer Details ({filteredVolunteers.length} total)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Volunteer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Training Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVolunteers.map((volunteer) => {
                const trainingSummary = volunteer.trainings_summary || {};
                const missingTrainings = getMissingTrainings(volunteer);
                
                return (
                  <tr key={volunteer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {volunteer.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[volunteer.role] || 'bg-gray-100 text-gray-800'}`}>
                        {volunteer.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {volunteer.division?.name || 'Any Division'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {volunteer.team?.name || 'Unallocated'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                          trainingSummary.all_required_completed 
                            ? 'bg-green-100 text-green-800' 
                            : missingTrainings.length > 0
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {trainingSummary.completed || 0}/{trainingSummary.total || 0} trainings
                        </div>
                        {missingTrainings.length > 0 && (
                          <div className="text-xs text-red-600">
                            Missing: {missingTrainings.length}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {volunteer.email && (
                        <div className="flex items-center text-sm text-gray-600 mb-1">
                          <Mail className="h-3 w-3 mr-2" />
                          {volunteer.email}
                        </div>
                      )}
                      {volunteer.phone && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="h-3 w-3 mr-2" />
                          {volunteer.phone}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredVolunteers.length === 0 && !loading && (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No volunteers found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or import volunteer data
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VolunteerReports;