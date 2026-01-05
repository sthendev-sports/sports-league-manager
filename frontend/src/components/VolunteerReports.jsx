import React, { useState, useEffect, useMemo } from 'react';
import { Download, Users, Mail, Phone, CheckCircle, XCircle } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDivisions();
    loadTeams();
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadVolunteers();
    }
  }, [selectedDivision, selectedSeason, selectedTeam]);

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
      const response = await divisionsAPI.getAll();
      const data = response.data;
      setDivisions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading divisions:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await teamsAPI.getAll();
      const data = response.data;
      setTeams(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading teams:', error);
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

  const exportToCSV = () => {
    const headers = [
      'Name',
      'Role',
      'Division',
      'Team',
      'Email',
      'Phone',
      'Address',
      'City',
      'State',
      'Zip Code',
      'Training Completed'
    ];

    const csvData = volunteers.map(volunteer => [
      volunteer.name,
      volunteer.role,
      volunteer.division?.name || 'Any Division',
      volunteer.team?.name || 'Unallocated',
      volunteer.email || '',
      volunteer.phone || '',
      volunteer.address_line_1 || '',
      volunteer.city || '',
      volunteer.state || '',
      volunteer.zip_code || '',
      volunteer.training_completed ? 'Yes' : 'No'
    ]);

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
    volunteers.forEach(volunteer => {
      const role = volunteer.role || 'Parent';
      stats[role] = (stats[role] || 0) + 1;
    });
    return stats;
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

    // Count
    volunteers.forEach(v => {
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
      else {
        // If you have other roles, they aren't part of the requested table.
        // Keeping them out maintains the exact requested layout.
      }
    });

    // Only show the divisions you listed (in that order), plus any others if they exist and are relevant.
    // For your requested view, we prioritize the DIVISION_SORT_ORDER list.
    const ordered = Array.from(byDivision.values()).sort((a, b) => sortDivisionName(a.division, b.division));

    // If you only want the explicit list and nothing else, uncomment:
    // return ordered.filter(r => DIVISION_SORT_ORDER.includes(r.division));

    return ordered;
  }, [volunteers, divisions]);

  // Teams table: Division | Team | Parents | Team Parent | Assistant Coach | Manager
  const teamTableRows = useMemo(() => {
    const byDivTeam = new Map();

    const keyOf = (divName, teamName) => `${divName}|||${teamName}`;

    volunteers.forEach(v => {
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
      // (Coach/Board/etc not included per your requested team table)
    });

    const rows = Array.from(byDivTeam.values());

    rows.sort((a, b) => {
      const d = sortDivisionName(a.division, b.division);
      if (d !== 0) return d;
      return sortTeamNameWithinDivision(a.team, b.team);
    });

    return rows;
  }, [volunteers]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Volunteer Reports</h2>
            <p className="text-gray-600">View and export volunteer information</p>
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

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        </div>
      </div>

      {/* Role Statistics (kept exactly like your existing section) */}
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

      {/* Special Volunteers Report - Managers, Team Parents, Assistant Coaches */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Special Volunteers (Managers, Team Parents, Assistant Coaches)
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Volunteers with assigned roles other than "Parent"
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
              {volunteers
                .filter(v => v.role !== 'Parent' && ['Manager', 'Team Parent', 'Assistant Coach'].includes(v.role))
                .map((volunteer) => (
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
                      {volunteer.training_completed ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800">
                          <XCircle className="h-3 w-3 mr-1" />
                          Pending
                        </span>
                      )}
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
                ))}
            </tbody>
          </table>

          {volunteers.filter(v => v.role !== 'Parent' && ['Manager', 'Team Parent', 'Assistant Coach'].includes(v.role)).length === 0 && (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No special volunteers found</h3>
              <p className="mt-1 text-sm text-gray-500">
                No volunteers with Manager, Team Parent, or Assistant Coach roles
              </p>
            </div>
          )}
        </div>
      </div>

      {/* All Volunteers List (unchanged) */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            All Volunteer Details ({volunteers.length} total)
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
                  Role & Division
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {volunteers.map((volunteer) => (
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
                    <div className="text-sm text-gray-600 mt-1">
                      {volunteer.division?.name || 'Any Division'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {volunteer.team?.name || 'Unallocated'}
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
              ))}
            </tbody>
          </table>

          {volunteers.length === 0 && !loading && (
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