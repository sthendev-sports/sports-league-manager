import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Edit2, Save, X } from 'lucide-react';
import { seasonsAPI, dashboardAPI } from '../services/api';

const DIVISION_ORDER = [
  "T-Ball Division",
  "Baseball - Coach Pitch Division",
  "Baseball - Rookies Division",
  "Baseball - Minors Division",
  "Baseball - Majors Division",
  "Softball - Rookies Division (Coach Pitch)",
  "Softball - Minors Division",
  "Softball - Majors Division",
  "Softball - Junior Division",
  "Challenger Division",
];

const divisionOrderIndex = (name) => {
  const idx = DIVISION_ORDER.indexOf(name);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

const sortDivisionObjects = (a, b) => {
  const ai = divisionOrderIndex(a?.name);
  const bi = divisionOrderIndex(b?.name);
  if (ai !== bi) return ai - bi;
  return String(a?.name || "").localeCompare(String(b?.name || ""));
};


const Dashboard = () => {
  const [stats, setStats] = useState({
    totalRegistered: 0,
    playersNotReturning: 0,
    newPlayers: 0,
    returningPlayers: 0,
    totalTeams: 0,
    familiesPendingWorkBond: 0,
    divisions: [],
    totalVolunteers: 0,
    volunteerBreakdown: {
      teamManagers: 0,
      assistantCoaches: 0,
      teamParents: 0
    },
    volunteerByDivision: [] // New field for volunteer breakdown by division
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [currentSeason, setCurrentSeason] = useState(null);
  const [editingDivision, setEditingDivision] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedSeasonId) {
      loadDashboardData(selectedSeasonId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeasonId]);

  const loadDashboardData = async (seasonIdOverride) => {
  try {
    setLoading(true);
    setError(null);

    // Load seasons list + active season (used for default filter)
    const [activeRes, allRes] = await Promise.all([
      seasonsAPI.getActive().catch(() => ({ data: null })),
      seasonsAPI.getAll().catch(() => ({ data: [] }))
    ]);

    const activeSeason = activeRes?.data || null;
    const all = Array.isArray(allRes?.data) ? allRes.data : [];
    setSeasons(all);

    const resolvedSeasonId = seasonIdOverride || selectedSeasonId || activeSeason?.id || all?.[0]?.id;
    if (!resolvedSeasonId) throw new Error('No season found');

    // Set initial dropdown default once
    if (!selectedSeasonId) setSelectedSeasonId(resolvedSeasonId);

    const seasonObj = all.find(s => s.id === resolvedSeasonId) || activeSeason || null;
    setCurrentSeason(seasonObj);

    // Load dashboard statistics for the selected season
    const dashboardData = await dashboardAPI.getStatistics(resolvedSeasonId);
    setStats(dashboardData);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    setError(error.message || 'Failed to load dashboard data');
  } finally {
    setLoading(false);
  }
};


  // Calculate totals for division breakdown
  const divisionTotals = {
    current: stats.divisions.reduce((sum, division) => sum + division.current, 0),
    previous: stats.divisions.reduce((sum, division) => sum + division.previous, 0),
    newPlayers: stats.divisions.reduce((sum, division) => sum + division.newPlayers, 0),
    returningPlayers: stats.divisions.reduce((sum, division) => sum + division.returningPlayers, 0),
    teams: stats.divisions.reduce((sum, division) => sum + division.teams, 0)
  };

  // Calculate totals for volunteer breakdown
  const volunteerTotals = {
    teamManagers: stats.volunteerByDivision.reduce((sum, division) => sum + division.teamManagers, 0),
    assistantCoaches: stats.volunteerByDivision.reduce((sum, division) => sum + division.assistantCoaches, 0),
    teamParents: stats.volunteerByDivision.reduce((sum, division) => sum + division.teamParents, 0),
    divisionTotal: stats.volunteerByDivision.reduce((sum, division) => sum + division.divisionTotal, 0)
  };

  const handleEditClick = (division, value) => {
    setEditingDivision(division.name);
    setEditValue(value.toString());
  };

  const handleSaveEdit = (divisionName) => {
    const updatedDivisions = stats.divisions.map(division => {
      if (division.name === divisionName) {
        const previousValue = parseInt(editValue) || 0;
        const currentValue = division.current;
        const trend = currentValue > previousValue ? 'up' : 
                     currentValue < previousValue ? 'down' : 'neutral';
        
        return {
          ...division,
          previous: previousValue,
          trend: trend
        };
      }
      return division;
    });

    setStats(prev => ({
      ...prev,
      divisions: updatedDivisions
    }));
    
    setEditingDivision(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingDivision(null);
    setEditValue('');
  };

  // Helper function to get trend styles
  const getTrendStyles = (trend) => {
    switch (trend) {
      case 'up':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          arrow: 'text-green-600',
          symbol: '▲'
        };
      case 'down':
        return {
          bg: 'bg-red-100', 
          text: 'text-red-800',
          arrow: 'text-red-600',
          symbol: '▼'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          arrow: 'text-gray-600',
          symbol: '→'
        };
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading dashboard data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">League Dashboard</h1>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <div className="text-red-800">
              <strong>Error loading dashboard:</strong> {error}
            </div>
          </div>
          <button
            onClick={loadDashboardData}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">League Dashboard</h1>
          {currentSeason?.name && (
            <p className="text-sm text-gray-600 mt-1">Showing: <span className="font-medium">{currentSeason.name}</span></p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
            value={selectedSeasonId}
            onChange={(e) => setSelectedSeasonId(e.target.value)}
          >
            {seasons.map(season => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>

          <button
            onClick={() => loadDashboardData(selectedSeasonId)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Registration Totals - Stacked and Compact */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Registration Totals</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900 w-40">Total Registration:</span>
              <span className="text-lg font-bold text-gray-900">{stats.totalRegistered}</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900 w-40">Players Not Returning:</span>
              <span className="text-lg font-bold text-gray-900">{stats.playersNotReturning}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Division Registration Breakdown - Now with New/Returning Players */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Division Registration Breakdown</h2>
          </div>
          <div className="p-4">
            {stats.divisions.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <p>No division data available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Current</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Previous</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Trend</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">New</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Returning</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Teams</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.divisions.slice().sort(sortDivisionObjects).map((division) => {
                      const trendStyles = getTrendStyles(division.trend);
                      return (
                        <tr key={division.name} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{division.name}</td>
                          <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{division.current}</td>
                          <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                            {editingDivision === division.name ? (
                              <div className="flex items-center justify-center space-x-1">
                                <input
                                  type="number"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className="w-16 px-1 py-1 text-sm border border-gray-300 rounded text-center"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveEdit(division.name)}
                                  className="text-green-600 hover:text-green-800"
                                >
                                  <Save className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-center space-x-1">
                                <span className="text-gray-500">{division.previous}</span>
                                <button
                                  onClick={() => handleEditClick(division, division.previous)}
                                  className="text-gray-400 hover:text-blue-600 ml-1"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                            <div className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium ${trendStyles.bg} ${trendStyles.text}`}>
                              <span className={trendStyles.arrow}>
                                {trendStyles.symbol}
                              </span>
                              <span className="ml-0.5">
                                {Math.abs(division.current - division.previous)}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap font-medium">{division.newPlayers}</td>
                          <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap font-medium">{division.returningPlayers}</td>
                          <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{division.teams}</td>
                        </tr>
                      );
                    })}
                    {/* Total Row */}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-2 py-2 text-sm text-gray-900 whitespace-nowrap">Total</td>
                      <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{divisionTotals.current}</td>
                      <td className="px-2 py-2 text-sm text-gray-500 text-center whitespace-nowrap">{divisionTotals.previous}</td>
                      <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                        <div className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium ${
                          divisionTotals.current > divisionTotals.previous ? 'bg-green-100 text-green-800' :
                          divisionTotals.current < divisionTotals.previous ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          <span className={divisionTotals.current > divisionTotals.previous ? 'text-green-600' : divisionTotals.current < divisionTotals.previous ? 'text-red-600' : 'text-gray-600'}>
                            {divisionTotals.current > divisionTotals.previous ? '▲' : divisionTotals.current < divisionTotals.previous ? '▼' : '→'}
                          </span>
                          <span className="ml-0.5">
                            {Math.abs(divisionTotals.current - divisionTotals.previous)}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap">{divisionTotals.newPlayers}</td>
                      <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap">{divisionTotals.returningPlayers}</td>
                      <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{divisionTotals.teams}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Volunteer Breakdown by Division */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Volunteer Breakdown by Division</h2>
          </div>
          <div className="p-4">
            {stats.volunteerByDivision.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <p>No volunteer data available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Team Manager</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Assistant Coach</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Team Parent</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division Total</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.volunteerByDivision.slice().sort(sortDivisionObjects).map((division) => (
                      <tr key={division.name} className="hover:bg-gray-50">
                        <td className="px-2 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{division.name}</td>
                        <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap font-medium">{division.teamManagers}</td>
                        <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap font-medium">{division.assistantCoaches}</td>
                        <td className="px-2 py-2 text-sm text-purple-600 text-center whitespace-nowrap font-medium">{division.teamParents}</td>
                        <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap font-semibold">{division.divisionTotal}</td>
                      </tr>
                    ))}
                    {/* Total Row */}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-2 py-2 text-sm text-gray-900 whitespace-nowrap">Total Registered</td>
                      <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap">{volunteerTotals.teamManagers}</td>
                      <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap">{volunteerTotals.assistantCoaches}</td>
                      <td className="px-2 py-2 text-sm text-purple-600 text-center whitespace-nowrap">{volunteerTotals.teamParents}</td>
                      <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{volunteerTotals.divisionTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Work Bond Status */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Work Bond Status</h2>
        </div>
        <div className="p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{stats.familiesPendingWorkBond}</div>
            <div className="text-sm text-gray-600 mt-1">Families Pending Work Bond Deposit</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;