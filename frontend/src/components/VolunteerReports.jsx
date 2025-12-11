import React, { useState, useEffect } from 'react';
import { Download, Users, Filter, Mail, Phone, MapPin, Target } from 'lucide-react';
import api, { divisionsAPI, teamsAPI, seasonsAPI } from '../services/api';


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

    if (selectedTeam) {
      data = data.filter(volunteer => volunteer.team_id === selectedTeam);
    }

    console.log('Loaded volunteers for reports:', data);
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
    if (data.length > 0) setSelectedSeason(data[0].id);
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
      'Zip Code'
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
      volunteer.zip_code || ''
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
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
      stats[volunteer.role] = (stats[volunteer.role] || 0) + 1;
    });
    return stats;
  };

  const getDivisionStats = () => {
    const stats = {};
    volunteers.forEach(volunteer => {
      const divisionName = volunteer.division?.name || 'Any Division';
      stats[divisionName] = (stats[divisionName] || 0) + 1;
    });
    return stats;
  };

  const getTeamStats = () => {
    const stats = {};
    volunteers.forEach(volunteer => {
      const teamName = volunteer.team?.name || 'Unallocated';
      stats[teamName] = (stats[teamName] || 0) + 1;
    });
    return stats;
  };

  const getVolunteersByTeam = () => {
    const byTeam = {};
    volunteers.forEach(volunteer => {
      const teamName = volunteer.team?.name || 'Unallocated';
      if (!byTeam[teamName]) {
        byTeam[teamName] = [];
      }
      byTeam[teamName].push(volunteer);
    });
    return byTeam;
  };

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
  const divisionStats = getDivisionStats();
  const teamStats = getTeamStats();
  const volunteersByTeam = getVolunteersByTeam();

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

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Role Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Volunteers by Role</h3>
          <div className="space-y-3">
            {Object.entries(roleStats).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between">
                <div className="flex items-center">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[role] || 'bg-gray-100 text-gray-800'} mr-3`}>
                    {role}
                  </span>
                  <span className="text-sm font-medium text-gray-900">- {count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Division Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Volunteers by Division</h3>
          <div className="space-y-3">
            {Object.entries(divisionStats).map(([division, count]) => (
              <div key={division} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{division}</span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Team Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Volunteers by Team</h3>
          <div className="space-y-3">
            {Object.entries(teamStats).map(([team, count]) => (
              <div key={team} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{team}</span>
                <span className="text-sm font-medium text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Volunteers by Team Breakdown */}
      {Object.keys(volunteersByTeam).length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Volunteers by Team
            </h3>
          </div>
          
          <div className="divide-y divide-gray-200">
            {Object.entries(volunteersByTeam).map(([teamName, teamVolunteers]) => (
              <div key={teamName} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-md font-semibold text-gray-900 flex items-center">
                    <Target className="h-4 w-4 mr-2 text-blue-500" />
                    {teamName} ({teamVolunteers.length} volunteers)
                  </h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamVolunteers.map((volunteer) => (
                    <div key={volunteer.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{volunteer.name}</div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${roleColors[volunteer.role] || 'bg-gray-100 text-gray-800'}`}>
                            {volunteer.role}
                          </span>
                          
                          {volunteer.email && (
                            <div className="flex items-center text-sm text-gray-600 mt-2">
                              <Mail className="h-3 w-3 mr-1" />
                              {volunteer.email}
                            </div>
                          )}
                          
                          {volunteer.phone && (
                            <div className="flex items-center text-sm text-gray-600 mt-1">
                              <Phone className="h-3 w-3 mr-1" />
                              {volunteer.phone}
                            </div>
                          )}
                          
                          <div className="text-xs text-gray-500 mt-2">
                            Division: {volunteer.division?.name || 'Any Division'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Volunteers List */}
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