import React, { useState, useEffect } from 'react';
import { playersAPI, teamsAPI, divisionsAPI, seasonsAPI } from '../services/api';

const TeamUniforms = () => {
  const [divisions, setDivisions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadData();
    }
  }, [selectedSeason]);

  const loadSeasons = async () => {
    try {
      const response = await seasonsAPI.getAll();
      setSeasons(response.data || []);
      if (response.data && response.data.length > 0) {
        setSelectedSeason(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
      setError('Failed to load seasons');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [divisionsResponse, teamsResponse, playersResponse] = await Promise.all([
        divisionsAPI.getAll({ season_id: selectedSeason }),
        teamsAPI.getAll({ season_id: selectedSeason }),
        playersAPI.getAll({ season_id: selectedSeason })
      ]);

      setDivisions(divisionsResponse.data || []);
      setTeams(teamsResponse.data || []);
      setPlayers(playersResponse.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load uniform data');
    } finally {
      setLoading(false);
    }
  };

  // Get unique colors from actual teams
  const getUniqueColors = () => {
    const colors = [...new Set(teams.map(team => team.color).filter(color => color))];
    return colors;
  };

  // Filter data based on selections
  const getFilteredData = () => {
    let filteredTeamsData = teams;
    let filteredPlayersData = players;

    // Apply division filter
    if (selectedDivision) {
      filteredTeamsData = filteredTeamsData.filter(team => team.division_id === selectedDivision);
      const teamIdsInDivision = filteredTeamsData.map(team => team.id);
      filteredPlayersData = filteredPlayersData.filter(player => 
        teamIdsInDivision.includes(player.team_id)
      );
    }

    // Apply team filter
    if (selectedTeam) {
      filteredTeamsData = filteredTeamsData.filter(team => team.id === selectedTeam);
      filteredPlayersData = filteredPlayersData.filter(player => player.team_id === selectedTeam);
    }

    return {
      filteredTeams: filteredTeamsData,
      filteredPlayers: filteredPlayersData
    };
  };

  const { filteredTeams, filteredPlayers } = getFilteredData();
  const colors = getUniqueColors(); // Renamed from uniqueColors to avoid conflict

  // Calculate comprehensive uniform counts using FILTERED data
  const getAllUniformCounts = () => {
    const shirtSizes = [
      'Youth-XS', 'Youth-Small', 'Youth-Medium', 'Youth-Large', 'Youth X-Large',
      'Adult-Small', 'Adult-Medium', 'Adult-Large', 'Adult X-Large'
    ];

    const pantsSizes = [
      'Youth-XS', 'Youth-Small', 'Youth-Medium', 'Youth-Large', 'Youth X-Large',
      'Adult-Small', 'Adult-Medium', 'Adult-Large', 'Adult X-Large'
    ];

    // Overall shirt counts by size (using filtered players)
    const overallShirtCounts = shirtSizes.reduce((acc, size) => {
      acc[size] = filteredPlayers.filter(p => p.uniform_shirt_size === size).length;
      return acc;
    }, {});

    // Overall pants counts by size (using filtered players)
    const overallPantsCounts = pantsSizes.reduce((acc, size) => {
      acc[size] = filteredPlayers.filter(p => p.uniform_pants_size === size).length;
      return acc;
    }, {});

    // Shirt counts by color and size for each team (using filtered teams)
    const teamShirtDetails = filteredTeams.map(team => {
      const teamPlayersList = filteredPlayers.filter(p => p.team_id === team.id);
      const division = divisions.find(d => d.id === team.division_id);
      
      const shirtCountsBySize = shirtSizes.reduce((acc, size) => {
        acc[size] = teamPlayersList.filter(p => p.uniform_shirt_size === size).length;
        return acc;
      }, {});

      return {
        division: division?.name || 'N/A',
        team: team.name,
        color: team.color,
        shirtCounts: shirtCountsBySize,
        totalShirts: teamPlayersList.length
      };
    });

    // Pants counts by size for each team (using filtered teams)
    const teamPantsDetails = filteredTeams.map(team => {
      const teamPlayersList = filteredPlayers.filter(p => p.team_id === team.id);
      const division = divisions.find(d => d.id === team.division_id);
      
      const pantsCountsBySize = pantsSizes.reduce((acc, size) => {
        acc[size] = teamPlayersList.filter(p => p.uniform_pants_size === size).length;
        return acc;
      }, {});

      return {
        division: division?.name || 'N/A',
        team: team.name,
        pantsCounts: pantsCountsBySize,
        totalPants: teamPlayersList.length
      };
    });

    // Color distribution across all shirts (using filtered data)
    const colorDistribution = colors.reduce((acc, color) => {
      acc[color] = filteredPlayers.filter(p => {
        const playerTeam = filteredTeams.find(t => t.id === p.team_id);
        return playerTeam?.color === color;
      }).length;
      return acc;
    }, {});

    return {
      overallShirtCounts,
      overallPantsCounts,
      teamShirtDetails,
      teamPantsDetails,
      colorDistribution,
      shirtSizes,
      pantsSizes
    };
  };

  const {
    overallShirtCounts,
    overallPantsCounts,
    teamShirtDetails,
    teamPantsDetails,
    colorDistribution,
    shirtSizes,
    pantsSizes
  } = getAllUniformCounts();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Team Uniforms</h1>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadData}
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Team Uniforms</h1>
      
      {/* Season Filter */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Season
            </label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Division
            </label>
            <select
              value={selectedDivision}
              onChange={(e) => {
                setSelectedDivision(e.target.value);
                setSelectedTeam('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Divisions</option>
              {divisions.map(division => (
                <option key={division.id} value={division.id}>
                  {division.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Team
            </label>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!selectedDivision && filteredTeams.length === 0}
            >
              <option value="">All Teams</option>
              {filteredTeams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.color})
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Active Filters Info */}
        <div className="mt-4 text-sm text-gray-600">
          <p>
            Showing: {filteredTeams.length} teams, {filteredPlayers.length} players
            {selectedDivision && ` in selected division`}
            {selectedTeam && ` on selected team`}
          </p>
        </div>
      </div>

      {/* Main Uniform Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
        
        {/* UNIFORM SHIRTS TABLE */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-center">UNIFORM SHIRTS</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-1 text-left">Shirts Count</th>
                  <th className="border border-gray-300 p-1 text-center">Total Count</th>
                  {colors.map(color => (
                    <th key={color} className="border border-gray-300 p-1 text-center">{color}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shirtSizes.map(size => (
                  <tr key={size}>
                    <td className="border border-gray-300 p-1 font-medium">{size}</td>
                    <td className="border border-gray-300 p-1 text-center font-bold">
                      {overallShirtCounts[size] || 0}
                    </td>
                    {colors.map(color => {
                      const count = teamShirtDetails
                        .filter(team => team.color === color)
                        .reduce((sum, team) => sum + (team.shirtCounts[size] || 0), 0);
                      return (
                        <td key={color} className="border border-gray-300 p-1 text-center">
                          {count || 0}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-1">Totals</td>
                  <td className="border border-gray-300 p-1 text-center">
                    {Object.values(overallShirtCounts).reduce((sum, count) => sum + count, 0)}
                  </td>
                  {colors.map(color => (
                    <td key={color} className="border border-gray-300 p-1 text-center">
                      {colorDistribution[color] || 0}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Team Shirt Details */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Team Shirt Distribution</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-1 text-left">Divisions</th>
                    <th className="border border-gray-300 p-1 text-left">Teams</th>
                    <th className="border border-gray-300 p-1 text-left">Colors</th>
                    {shirtSizes.map(size => (
                      <th key={size} className="border border-gray-300 p-1 text-center">{size}</th>
                    ))}
                    <th className="border border-gray-300 p-1 text-center">Totals</th>
                  </tr>
                </thead>
                <tbody>
                  {teamShirtDetails.map((team, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 p-1">{team.division}</td>
                      <td className="border border-gray-300 p-1 font-medium">{team.team}</td>
                      <td className="border border-gray-300 p-1">{team.color}</td>
                      {shirtSizes.map(size => (
                        <td key={size} className="border border-gray-300 p-1 text-center">
                          {team.shirtCounts[size] || 0}
                        </td>
                      ))}
                      <td className="border border-gray-300 p-1 text-center font-bold">
                        {team.totalShirts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* UNIFORM PANTS TABLE */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-center">UNIFORM PANTS</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-1 text-left">Pants Count</th>
                  <th className="border border-gray-300 p-1 text-center">Total Count</th>
                  {[...Array(colors.length)].map((_, i) => (
                    <th key={i} className="border border-gray-300 p-1 text-center"></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pantsSizes.map(size => (
                  <tr key={size}>
                    <td className="border border-gray-300 p-1 font-medium">{size}</td>
                    <td className="border border-gray-300 p-1 text-center font-bold">
                      {overallPantsCounts[size] || 0}
                    </td>
                    {[...Array(colors.length)].map((_, i) => (
                      <td key={i} className="border border-gray-300 p-1 text-center"></td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 p-1">Totals</td>
                  <td className="border border-gray-300 p-1 text-center">
                    {Object.values(overallPantsCounts).reduce((sum, count) => sum + count, 0)}
                  </td>
                  {[...Array(colors.length)].map((_, i) => (
                    <td key={i} className="border border-gray-300 p-1 text-center"></td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Team Pants Details */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Team Pants Distribution</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-1 text-left">Divisions</th>
                    <th className="border border-gray-300 p-1 text-left">Teams</th>
                    {pantsSizes.map(size => (
                      <th key={size} className="border border-gray-300 p-1 text-center">{size}</th>
                    ))}
                    <th className="border border-gray-300 p-1 text-center">Totals</th>
                  </tr>
                </thead>
                <tbody>
                  {teamPantsDetails.map((team, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 p-1">{team.division}</td>
                      <td className="border border-gray-300 p-1 font-medium">{team.team}</td>
                      {pantsSizes.map(size => (
                        <td key={size} className="border border-gray-300 p-1 text-center">
                          {team.pantsCounts[size] || 0}
                        </td>
                      ))}
                      <td className="border border-gray-300 p-1 text-center font-bold">
                        {team.totalPants}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamUniforms;