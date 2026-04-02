import React, { useState, useEffect } from 'react';
import { playersAPI, teamsAPI, divisionsAPI, seasonsAPI } from '../services/api';
import Modal from '../components/Modal'; // Import the Modal component

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
  
  // Print modal state - using the same pattern as Draft page
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printDivisionFilter, setPrintDivisionFilter] = useState('');
  const [printTeamFilter, setPrintTeamFilter] = useState('');
  const [printData, setPrintData] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);

  // Custom size order from smallest to largest
  const getSizeOrder = (size) => {
    const sizeOrderMap = {
      'Youth X-Small': 1,
      'Youth Small': 2,
      'Youth Medium': 3,
      'Youth Large': 4,
      'Youth X-Large': 5,
      'Adult Small': 6,
      'Adult Medium': 7,
      'Adult Large': 8,
      'Adult X-Large': 9
    };
    return sizeOrderMap[size] || 999; // Unknown sizes go to the end
  };

  // Sort sizes array by custom order
  const sortSizes = (sizes) => {
    return [...sizes].sort((a, b) => getSizeOrder(a) - getSizeOrder(b));
  };

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

  // Calculate pants counts for ALL active players (not withdrawn) regardless of team
  const getAllActivePlayersPantsCounts = () => {
    // Filter to only active players (exclude withdrawn)
    const activePlayers = (players || []).filter(p => p.status !== 'withdrawn');
    
    // Get unique pants sizes from active players and sort by custom order
    const allPantsSizes = sortSizes(
      Array.from(new Set(activePlayers.map(p => p.uniform_pants_size).filter(Boolean)))
    );

    // Count pants by size for all active players
    const pantsCountsBySize = allPantsSizes.reduce((acc, size) => {
      acc[size] = activePlayers.filter(p => p.uniform_pants_size === size).length;
      return acc;
    }, {});

    return {
      allActivePlayersPantsCounts: pantsCountsBySize,
      allActivePlayersTotal: activePlayers.length,
      allPantsSizes
    };
  };

  // NEW: Calculate shirt counts by division
  const getShirtCountsByDivision = () => {
    // Only count drafted players (players assigned to a team)
    const draftedPlayers = (players || []).filter(p => p.team_id && p.status !== 'withdrawn');
    
    // Get all unique shirt sizes and sort by custom order
    const shirtSizes = sortSizes(
      Array.from(new Set(draftedPlayers.map(p => p.uniform_shirt_size).filter(Boolean)))
    );

    // Custom division display order
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

    const divisionRankMap = new Map(divisionOrder.map((name, idx) => [name, idx]));
    const getDivisionRank = (name) => (divisionRankMap.has(name) ? divisionRankMap.get(name) : 999);

    // Group players by division
    const divisionShirtDetails = divisions.map(division => {
      // Find all teams in this division
      const teamsInDivision = teams.filter(t => t.division_id === division.id);
      const teamIdsInDivision = teamsInDivision.map(t => t.id);
      
      // Find all drafted players in this division's teams
      const playersInDivision = draftedPlayers.filter(p => teamIdsInDivision.includes(p.team_id));

      // Count shirts by size for this division
      const shirtCountsBySize = shirtSizes.reduce((acc, size) => {
        acc[size] = playersInDivision.filter(p => p.uniform_shirt_size === size).length;
        return acc;
      }, {});

      return {
        division: division.name,
        shirtCounts: shirtCountsBySize,
        totalShirts: playersInDivision.length
      };
    }).filter(d => d.totalShirts > 0); // Only include divisions with players

    // Sort divisions by custom order
    divisionShirtDetails.sort((a, b) => {
      const d = getDivisionRank(a.division) - getDivisionRank(b.division);
      if (d !== 0) return d;
      return (a.division || '').localeCompare(b.division || '');
    });

    return {
      divisionShirtDetails,
      shirtSizes
    };
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
  const colors = getUniqueColors();

  // Calculate comprehensive uniform counts using FILTERED data
  const getAllUniformCounts = () => {
    // Only count drafted players (players assigned to a team)
    const draftedPlayers = (filteredPlayers || []).filter(p => p.team_id);

    // Build size columns dynamically from the CURRENT season's drafted player data
    // Sort sizes by custom order
    const shirtSizes = sortSizes(
      Array.from(new Set(draftedPlayers.map(p => p.uniform_shirt_size).filter(Boolean)))
    );

    const pantsSizes = sortSizes(
      Array.from(new Set(draftedPlayers.map(p => p.uniform_pants_size).filter(Boolean)))
    );

    // Overall shirt counts by size (using filtered players)
    const overallShirtCounts = shirtSizes.reduce((acc, size) => {
      acc[size] = draftedPlayers.filter(p => p.uniform_shirt_size === size).length;
      return acc;
    }, {});

    // Overall pants counts by size (using filtered players)
    const overallPantsCounts = pantsSizes.reduce((acc, size) => {
      acc[size] = draftedPlayers.filter(p => p.uniform_pants_size === size).length;
      return acc;
    }, {});

    // Shirt counts by color and size for each team (using filtered teams)
    const teamsWithPlayers = filteredTeams.filter(t => draftedPlayers.some(p => p.team_id === t.id));

    // Custom division display order (division name must match exactly)
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

    const divisionRankMap = new Map(divisionOrder.map((name, idx) => [name, idx]));
    const getDivisionRank = (name) => (divisionRankMap.has(name) ? divisionRankMap.get(name) : 999);

    const teamShirtDetails = teamsWithPlayers.map(team => {
      const teamPlayersList = draftedPlayers.filter(p => p.team_id === team.id);
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

    // Sort teams by division order, then team name
    teamShirtDetails.sort((a, b) => {
      const d = getDivisionRank(a.division) - getDivisionRank(b.division);
      if (d !== 0) return d;
      return (a.team || '').localeCompare(b.team || '');
    });

    // Pants counts by size for each team (using filtered teams)
    const teamPantsDetails = teamsWithPlayers.map(team => {
      const teamPlayersList = draftedPlayers.filter(p => p.team_id === team.id);
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

    // Sort teams by division order, then team name
    teamPantsDetails.sort((a, b) => {
      const d = getDivisionRank(a.division) - getDivisionRank(b.division);
      if (d !== 0) return d;
      return (a.team || '').localeCompare(b.team || '');
    });

    // Color distribution across all shirts (using filtered data)
    const colorDistribution = colors.reduce((acc, color) => {
      acc[color] = draftedPlayers.filter(p => {
        const playerTeam = teamsWithPlayers.find(t => t.id === p.team_id);
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

  // Get the pants counts for all active players
  const { allActivePlayersPantsCounts, allActivePlayersTotal, allPantsSizes } = getAllActivePlayersPantsCounts();
  
  // Get shirt counts by division
  const { divisionShirtDetails, shirtSizes: divisionShirtSizes } = getShirtCountsByDivision();

  // Export to CSV function
  const exportToCSV = () => {
    // Get current season name
    const currentSeason = seasons.find(s => s.id === selectedSeason)?.name || 'Unknown Season';
    
    // Create CSV content
    let csvContent = "DATA EXPORT - Team Uniforms\n";
    csvContent += `Season: ${currentSeason}\n`;
    csvContent += `Export Date: ${new Date().toLocaleDateString()}\n`;
    csvContent += `Filters Applied: ${selectedDivision ? 'Division: ' + divisions.find(d => d.id === selectedDivision)?.name : 'All Divisions'}, ${selectedTeam ? 'Team: ' + teams.find(t => t.id === selectedTeam)?.name : 'All Teams'}\n\n`;
    
    // SECTION 1: All Active Players Pants Summary
    csvContent += "=== ALL ACTIVE PLAYERS PANTS SUMMARY (Excluding Withdrawn) ===\n";
    csvContent += `Total Active Players,${allActivePlayersTotal}\n`;
    csvContent += "Pants Size,Count\n";
    allPantsSizes.forEach(size => {
      csvContent += `${size},${allActivePlayersPantsCounts[size] || 0}\n`;
    });
    csvContent += "\n";
    
    // SECTION 2: Shirt Counts by Division
    csvContent += "=== SHIRT COUNTS BY DIVISION ===\n";
    csvContent += "Division," + divisionShirtSizes.join(",") + ",Total\n";
    divisionShirtDetails.forEach(division => {
      const row = [division.division];
      divisionShirtSizes.forEach(size => {
        row.push(division.shirtCounts[size] || 0);
      });
      row.push(division.totalShirts);
      csvContent += row.join(",") + "\n";
    });
    csvContent += "\n";
    
    // SECTION 3: Uniform Shirts Summary by Size and Color
    csvContent += "=== UNIFORM SHIRTS SUMMARY ===\n";
    csvContent += "Size,Total Count," + colors.join(",") + "\n";
    shirtSizes.forEach(size => {
      const row = [size, overallShirtCounts[size] || 0];
      colors.forEach(color => {
        const count = teamShirtDetails
          .filter(team => team.color === color)
          .reduce((sum, team) => sum + (team.shirtCounts[size] || 0), 0);
        row.push(count);
      });
      csvContent += row.join(",") + "\n";
    });
    
    // Totals row for shirts
    const shirtTotalRow = ["Totals", Object.values(overallShirtCounts).reduce((sum, count) => sum + count, 0)];
    colors.forEach(color => {
      shirtTotalRow.push(colorDistribution[color] || 0);
    });
    csvContent += shirtTotalRow.join(",") + "\n\n";
    
    // SECTION 4: Team Shirt Distribution
    csvContent += "=== TEAM SHIRT DISTRIBUTION ===\n";
    csvContent += "Division,Team,Color," + shirtSizes.join(",") + ",Total\n";
    teamShirtDetails.forEach(team => {
      const row = [team.division, team.team, team.color];
      shirtSizes.forEach(size => {
        row.push(team.shirtCounts[size] || 0);
      });
      row.push(team.totalShirts);
      csvContent += row.join(",") + "\n";
    });
    csvContent += "\n";
    
    // SECTION 5: Uniform Pants Summary
    csvContent += "=== UNIFORM PANTS SUMMARY ===\n";
    csvContent += "Size,Total Count\n";
    pantsSizes.forEach(size => {
      csvContent += `${size},${overallPantsCounts[size] || 0}\n`;
    });
    csvContent += `Totals,${Object.values(overallPantsCounts).reduce((sum, count) => sum + count, 0)}\n\n`;
    
    // SECTION 6: Team Pants Distribution
    csvContent += "=== TEAM PANTS DISTRIBUTION ===\n";
    csvContent += "Division,Team," + pantsSizes.join(",") + ",Total\n";
    teamPantsDetails.forEach(team => {
      const row = [team.division, team.team];
      pantsSizes.forEach(size => {
        row.push(team.pantsCounts[size] || 0);
      });
      row.push(team.totalPants);
      csvContent += row.join(",") + "\n";
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `uniforms_${currentSeason.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Function to load print data - groups players by team
  const loadPrintData = () => {
    setPrintLoading(true);
    
    // Get all active players (not withdrawn and assigned to a team)
    const activePlayers = (players || []).filter(p => p.status !== 'withdrawn' && p.team_id);
    
    // Create a map for quick team and division lookup
    const teamMap = new Map();
    teams.forEach(team => {
      const division = divisions.find(d => d.id === team.division_id);
      teamMap.set(team.id, {
        teamName: team.name,
        teamColor: team.color,
        divisionName: division?.name || 'N/A',
        divisionId: team.division_id
      });
    });
    
    // Group players by team
    const playersByTeam = new Map();
    
    activePlayers.forEach(player => {
      const teamInfo = teamMap.get(player.team_id);
      if (teamInfo) {
        if (!playersByTeam.has(player.team_id)) {
          playersByTeam.set(player.team_id, {
            teamId: player.team_id,
            teamName: teamInfo.teamName,
            teamColor: teamInfo.teamColor,
            divisionName: teamInfo.divisionName,
            divisionId: teamInfo.divisionId,
            players: []
          });
        }
        
        playersByTeam.get(player.team_id).players.push({
          id: player.id,
          name: `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player',
          shirtSize: player.uniform_shirt_size || 'Not Assigned',
          pantsSize: player.uniform_pants_size || 'Not Assigned'
        });
      }
    });
    
    // Convert map to array and sort by division order, then team name
    const teamsArray = Array.from(playersByTeam.values());
    
    // Custom division display order
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
    
    const divisionRankMap = new Map(divisionOrder.map((name, idx) => [name, idx]));
    const getDivisionRank = (name) => (divisionRankMap.has(name) ? divisionRankMap.get(name) : 999);
    
    teamsArray.sort((a, b) => {
      const d = getDivisionRank(a.divisionName) - getDivisionRank(b.divisionName);
      if (d !== 0) return d;
      return (a.teamName || '').localeCompare(b.teamName || '');
    });
    
    // Sort players within each team by name
    teamsArray.forEach(team => {
      team.players.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    const seasonName = seasons.find(s => s.id === selectedSeason)?.name || 'Unknown Season';
    
    setPrintData({
      teams: teamsArray,
      seasonName: seasonName,
      totalTeams: teamsArray.length,
      totalPlayers: activePlayers.length
    });
    
    setPrintLoading(false);
  };

  // Function to open print modal
  const handlePrintClick = () => {
    setPrintDivisionFilter('');
    setPrintTeamFilter('');
    setPrintData(null);
    setShowPrintModal(true);
  };

  // Function to generate preview
  const handleGeneratePreview = () => {
    loadPrintData();
  };

  // Function to get filtered teams for printing
  const getFilteredTeams = () => {
    if (!printData) return [];
    
    let filteredTeams = [...printData.teams];
    
    if (printDivisionFilter) {
      filteredTeams = filteredTeams.filter(team => team.divisionName === printDivisionFilter);
    }
    
    if (printTeamFilter) {
      filteredTeams = filteredTeams.filter(team => team.teamName === printTeamFilter);
    }
    
    return filteredTeams;
  };

  // Function to generate HTML for a single team
  const generateTeamHTML = (team, index, totalTeams, seasonName) => {
    return `
      <div class="team-page" style="page-break-after: ${index < totalTeams - 1 ? 'always' : 'auto'};">
        <div class="team-header">
          <h1>Uniform Order Roster</h1>
          <div class="header-info">
            <p><strong>Season:</strong> ${seasonName}</p>
            <p><strong>Division:</strong> ${team.divisionName}</p>
            <p><strong>Team:</strong> ${team.teamName} ${team.teamColor ? `(${team.teamColor})` : ''}</p>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player Name</th>
              <th>Uniform Shirt Size</th>
              <th>Uniform Pant Size</th>
            </tr>
          </thead>
          <tbody>
            ${team.players.map((player, playerIndex) => `
              <tr>
                <td>${playerIndex + 1}</td>
                <td>${player.name}</td>
                <td>${player.shirtSize}</td>
                <td>${player.pantsSize}</td>
              </tr>
            `).join('')}
            ${team.players.length === 0 ? `
              <tr>
                <td colspan="4" style="text-align: center;">No players assigned to this team.</td>
              </tr>
            ` : ''}
          </tbody>
        </table>
        
        <div class="footer">
          <p>Total Players: ${team.players.length}</p>
        </div>
      </div>
    `;
  };

  // Function to handle printing with multiple pages
  const handlePrint = () => {
    if (!printData) return;
    
    const filteredTeams = getFilteredTeams();
    const seasonName = printData.seasonName;
    
    if (filteredTeams.length === 0) {
      alert('No teams found for the selected filters.');
      return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Uniform Order Roster - ${seasonName}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: white;
            }
            
            .team-page {
              margin-bottom: 20px;
              page-break-after: always;
            }
            
            .team-page:last-child {
              page-break-after: auto;
            }
            
            .team-header {
              margin-bottom: 30px;
              text-align: center;
            }
            
            h1 {
              text-align: center;
              margin-bottom: 10px;
              color: #333;
              font-size: 24px;
            }
            
            .header-info {
              text-align: center;
              margin-bottom: 20px;
              color: #555;
              line-height: 1.6;
            }
            
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            
            th, td {
              border: 1px solid #ddd;
              padding: 10px;
              text-align: left;
            }
            
            th {
              background-color: #4CAF50;
              color: white;
              font-weight: bold;
            }
            
            tr:nth-child(even) {
              background-color: #f9f9f9;
            }
            
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 12px;
              color: #777;
            }
            
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
              
              .team-page {
                page-break-after: always;
              }
              
              .team-page:last-child {
                page-break-after: auto;
              }
              
              th {
                background-color: #4CAF50;
                color: white;
              }
              
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          ${filteredTeams.map((team, index) => generateTeamHTML(team, index, filteredTeams.length, seasonName)).join('')}
          
          <div class="no-print" style="text-align: center; margin-top: 20px; position: fixed; bottom: 20px; left: 0; right: 0; background: white; padding: 10px; z-index: 1000;">
            <button onclick="window.print();" style="padding: 10px 20px; margin: 10px; font-size: 16px; cursor: pointer;">Print</button>
            <button onclick="window.close();" style="padding: 10px 20px; margin: 10px; font-size: 16px; cursor: pointer;">Close</button>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Get unique divisions for print filter
  const getUniqueDivisionsForPrint = () => {
    if (!printData) return [];
    const divisionsSet = new Set(printData.teams.map(team => team.divisionName));
    return Array.from(divisionsSet).sort();
  };

  // Get unique teams for print filter based on selected division
  const getUniqueTeamsForPrint = () => {
    if (!printData) return [];
    let filteredTeams = printData.teams;
    if (printDivisionFilter) {
      filteredTeams = filteredTeams.filter(team => team.divisionName === printDivisionFilter);
    }
    const teamsSet = new Set(filteredTeams.map(team => team.teamName));
    return Array.from(teamsSet).sort();
  };

  // Get preview data (first few teams for preview)
  const getPreviewTeams = () => {
    if (!printData) return [];
    let filteredTeams = getFilteredTeams();
    return filteredTeams.slice(0, 3); // Show first 3 teams in preview
  };

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Team Uniforms</h1>
        
        <div className="flex space-x-3">
          {/* Print Roster Button */}
          <button
            onClick={handlePrintClick}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Roster
          </button>
          
          {/* Export CSV Button */}
          <button
            onClick={exportToCSV}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
          >
            <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export to CSV
          </button>
        </div>
      </div>
      
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

      {/* SECTION 1: All Active Players Pants Count (Before Team Assignment) */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">ALL ACTIVE PLAYERS - PANTS SUMMARY (Before Team Assignment)</h2>
        <p className="text-sm text-gray-600 mb-4">
          Total Active Players (excluding withdrawn): {allActivePlayersTotal}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Pants Size</th>
                <th className="border border-gray-300 p-2 text-center">Count</th>
                </tr>
            </thead>
            <tbody>
              {allPantsSizes.map(size => (
                <tr key={size}>
                  <td className="border border-gray-300 p-2 font-medium">{size}</td>
                  <td className="border border-gray-300 p-2 text-center">
                    {allActivePlayersPantsCounts[size] || 0}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-bold">
                <td className="border border-gray-300 p-2">TOTAL</td>
                <td className="border border-gray-300 p-2 text-center">
                  {allActivePlayersTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: NEW - Shirt Counts by Division */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">SHIRT COUNTS BY DIVISION</h2>
        <p className="text-sm text-gray-600 mb-4">
          Shirt distribution across divisions (drafted players only, excluding withdrawn)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300 text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">Division</th>
                {divisionShirtSizes.map(size => (
                  <th key={size} className="border border-gray-300 p-2 text-center">{size}</th>
                ))}
                <th className="border border-gray-300 p-2 text-center">Total</th>
               </tr>
            </thead>
            <tbody>
              {divisionShirtDetails.map((division, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border border-gray-300 p-2 font-medium">{division.division}</td>
                  {divisionShirtSizes.map(size => (
                    <td key={size} className="border border-gray-300 p-2 text-center">
                      {division.shirtCounts[size] || 0}
                    </td>
                  ))}
                  <td className="border border-gray-300 p-2 text-center font-bold">
                    {division.totalShirts}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-100 font-bold">
                <td className="border border-gray-300 p-2">TOTALS</td>
                {divisionShirtSizes.map(size => {
                  const total = divisionShirtDetails.reduce((sum, div) => sum + (div.shirtCounts[size] || 0), 0);
                  return (
                    <td key={size} className="border border-gray-300 p-2 text-center">
                      {total}
                    </td>
                  );
                })}
                <td className="border border-gray-300 p-2 text-center">
                  {divisionShirtDetails.reduce((sum, div) => sum + div.totalShirts, 0)}
                </td>
              </tr>
            </tbody>
          </table>
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

      {/* Print Modal - Using the same Modal component as Draft page */}
      <Modal
        isOpen={showPrintModal}
        onClose={() => {
          setShowPrintModal(false);
          setPrintData(null);
          setPrintDivisionFilter('');
          setPrintTeamFilter('');
        }}
        title="Print Uniform Roster"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowPrintModal(false);
                setPrintData(null);
                setPrintDivisionFilter('');
                setPrintTeamFilter('');
              }}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            {!printData && (
              <button
                onClick={handleGeneratePreview}
                disabled={printLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {printLoading ? 'Loading...' : 'Preview Roster'}
              </button>
            )}
            {printData && (
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Print Roster ({getFilteredTeams().length} {getFilteredTeams().length === 1 ? 'team' : 'teams'})
              </button>
            )}
          </div>
        }
      >
        {!printData ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              Generate a printable roster with player names and uniform sizes. Each team will print on a separate page.
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800 text-sm">
                Click "Preview Roster" to load all players grouped by team.
                You can then filter by division and/or team before printing.
                Each team will appear on its own page when printed.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              Preview for <span className="font-semibold">{printData.seasonName}</span>
              <br />
              Total: <span className="font-semibold">{printData.totalTeams}</span> teams, <span className="font-semibold">{printData.totalPlayers}</span> players
            </div>
            
            {/* Division and Team Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by Division
                </label>
                <select
                  value={printDivisionFilter}
                  onChange={(e) => {
                    setPrintDivisionFilter(e.target.value);
                    setPrintTeamFilter('');
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Divisions</option>
                  {getUniqueDivisionsForPrint().map(division => (
                    <option key={division} value={division}>
                      {division}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filter by Team
                </label>
                <select
                  value={printTeamFilter}
                  onChange={(e) => setPrintTeamFilter(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={!printDivisionFilter && getUniqueTeamsForPrint().length === 0}
                >
                  <option value="">All Teams</option>
                  {getUniqueTeamsForPrint().map(team => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Team Preview Cards */}
            <div className="text-sm font-medium text-gray-700 mb-2">
              Preview (first {Math.min(3, getFilteredTeams().length)} of {getFilteredTeams().length} {getFilteredTeams().length === 1 ? 'team' : 'teams'}):
            </div>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {getPreviewTeams().map((team, idx) => (
                <div key={team.teamId} className="border border-gray-200 rounded-md p-3 bg-gray-50">
                  <div className="font-semibold text-blue-700 mb-2">
                    {team.divisionName} - {team.teamName} {team.teamColor ? `(${team.teamColor})` : ''}
                    <span className="text-gray-500 text-sm ml-2">({team.players.length} players)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="px-2 py-1 text-left">#</th>
                          <th className="px-2 py-1 text-left">Player Name</th>
                          <th className="px-2 py-1 text-left">Shirt</th>
                          <th className="px-2 py-1 text-left">Pant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.players.slice(0, 5).map((player, pIdx) => (
                          <tr key={player.id} className="border-t">
                            <td className="px-2 py-1">{pIdx + 1}</td>
                            <td className="px-2 py-1">{player.name}</td>
                            <td className="px-2 py-1">{player.shirtSize}</td>
                            <td className="px-2 py-1">{player.pantsSize}</td>
                          </tr>
                        ))}
                        {team.players.length > 5 && (
                          <tr className="border-t">
                            <td colSpan="4" className="px-2 py-1 text-gray-500 text-center">
                              ... and {team.players.length - 5} more players
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            
            {getFilteredTeams().length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No teams found for the selected filters.
              </div>
            )}
            
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                {getFilteredTeams().length === 0 ? (
                  <span>No teams match your filters</span>
                ) : (
                  <span>
                    Will print <span className="font-semibold">{getFilteredTeams().length}</span> {getFilteredTeams().length === 1 ? 'team' : 'teams'} 
                    on <span className="font-semibold">{getFilteredTeams().length}</span> {getFilteredTeams().length === 1 ? 'page' : 'pages'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TeamUniforms;