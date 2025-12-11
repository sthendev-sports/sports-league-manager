import React from 'react';

const PrintableDraftSheet = ({ divisionName, seasonName, players, onClose }) => {
  const calculateAge = (birthDate) => {
    if (!birthDate) return 'N/A';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const formatBirthday = (birthDate) => {
    if (!birthDate) return 'N/A';
    const date = new Date(birthDate);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  };

  const getVolunteerRoles = (player) => {
    if (!player.volunteers || player.volunteers.length === 0) return '';
    return player.volunteers.map(v => v.role).join(', ');
  };

  const getSiblingGroups = (players) => {
    const groups = {};
    players.forEach(player => {
      if (player.family_id) {
        if (!groups[player.family_id]) {
          groups[player.family_id] = [];
        }
        groups[player.family_id].push(player);
      }
    });
    return Object.values(groups).filter(group => group.length > 1);
  };

  const siblingGroups = getSiblingGroups(players);
  const playersWithSiblingInfo = players.map(player => ({
    ...player,
    hasSiblings: siblingGroups.some(group => 
      group.some(p => p.id === player.id)
    )
  }));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">Printable Draft Sheet Preview</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Create a new window for printing
                const printWindow = window.open('', '_blank');
                printWindow.document.write(`
                  <html>
                    <head>
                      <title>Draft Sheet - ${divisionName}</title>
                      <style>
                        body { 
                          font-family: Arial, sans-serif; 
                          margin: 20px;
                        }
                        table { 
                          width: 100%; 
                          border-collapse: collapse; 
                          margin-top: 20px;
                          table-layout: fixed;
                        }
                        th, td { 
                          border: 1px solid #000; 
                          padding: 6px; 
                          text-align: left; 
                          vertical-align: top;
                        }
                        th { 
                          background-color: #f0f0f0; 
                          font-size: 12px;
                        }
                        td {
                          font-size: 11px;
                        }
                        .header { 
                          text-align: center; 
                          margin-bottom: 20px; 
                        }
                        .sibling-row { 
                          background-color: #fefce8 !important; 
                        }
                        .sibling-icon { 
                          font-weight: bold; 
                          margin-left: 3px;
                        }
                        .instructions {
                          margin-top: 20px;
                          font-size: 11px;
                          color: #666;
                        }
                        /* Optimized column widths */
                        .col-number { width: 4%; }
                        .col-name { width: 18%; }
                        .col-travel { width: 6%; }
                        .col-status { width: 10%; }
                        .col-age { width: 5%; }
                        .col-birthday { width: 10%; }
                        .col-volunteers { width: 17%; }
                        .col-notes { width: 30%; }
                      </style>
                    </head>
                    <body>
                      <div class="header">
                        <h1>${divisionName} - Draft Sheet</h1>
                        <h2>${seasonName}</h2>
                        <p>Total Players: ${players.length}</p>
                      </div>
                      <table>
                        <thead>
                          <tr>
                            <th class="col-number">#</th>
                            <th class="col-name">Player Name</th>
                            <th class="col-travel">Travel</th>
                            <th class="col-status">New/Return</th>
                            <th class="col-age">Age</th>
                            <th class="col-birthday">Birthday</th>
                            <th class="col-volunteers">Parent Volunteers</th>
                            <th class="col-notes">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${playersWithSiblingInfo.map(player => `
                            <tr class="${player.hasSiblings ? 'sibling-row' : ''}">
                              <td class="col-number">${player.draftNumber}</td>
                              <td class="col-name">
                                ${player.first_name} ${player.last_name}
                                ${player.hasSiblings ? '<span class="sibling-icon">👥</span>' : ''}
                              </td>
                              <td class="col-travel" style="text-align: center;">${player.is_travel_player ? '✓' : ''}</td>
                              <td class="col-status">${player.is_new_player ? 'New' : 'Returning'}</td>
                              <td class="col-age" style="text-align: center;">${calculateAge(player.birth_date)}</td>
                              <td class="col-birthday">${formatBirthday(player.birth_date)}</td>
                              <td class="col-volunteers">${getVolunteerRoles(player)}</td>
                              <td class="col-notes">&nbsp;</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                      <div class="instructions">
                        <p><strong>Instructions:</strong> Call out player numbers during the draft. Players with 👥 have siblings - picking them automatically drafts their siblings.</p>
                        <p><strong>Note:</strong> Highlighted rows indicate players with siblings in the division.</p>
                      </div>
                    </body>
                  </html>
                `);
                printWindow.document.close();
                printWindow.print();
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
        
        <div className="overflow-auto p-6">
          {/* Preview content */}
          <div className="bg-white p-6">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">{divisionName} - Draft Sheet</h1>
              <p className="text-lg">{seasonName}</p>
              <p className="text-sm">Total Players: {players.length}</p>
            </div>

            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-1 text-left w-12">#</th>
                  <th className="border border-gray-300 p-1 text-left w-40">Player Name</th>
                  <th className="border border-gray-300 p-1 text-left w-16">Travel</th>
                  <th className="border border-gray-300 p-1 text-left w-24">New/Return</th>
                  <th className="border border-gray-300 p-1 text-left w-12">Age</th>
                  <th className="border border-gray-300 p-1 text-left w-24">Birthday</th>
                  <th className="border border-gray-300 p-1 text-left w-40">Parent Volunteers</th>
                  <th className="border border-gray-300 p-1 text-left w-48">Notes</th>
                </tr>
              </thead>
              <tbody>
                {playersWithSiblingInfo.map((player) => (
                  <tr 
                    key={player.id} 
                    className={`${player.hasSiblings ? 'bg-yellow-50' : ''}`}
                  >
                    <td className="border border-gray-300 p-1 text-center">{player.draftNumber}</td>
                    <td className="border border-gray-300 p-1">
                      <div className="flex items-center">
                        {player.first_name} {player.last_name}
                        {player.hasSiblings && (
                          <span 
                            className="ml-1 text-yellow-600 font-bold"
                            title="This player has siblings in the draft"
                          >
                            👥
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border border-gray-300 p-1 text-center">{player.is_travel_player ? '✓' : ''}</td>
                    <td className="border border-gray-300 p-1">{player.is_new_player ? 'New' : 'Returning'}</td>
                    <td className="border border-gray-300 p-1 text-center">{calculateAge(player.birth_date)}</td>
                    <td className="border border-gray-300 p-1">{formatBirthday(player.birth_date)}</td>
                    <td className="border border-gray-300 p-1 text-xs">{getVolunteerRoles(player)}</td>
                    <td className="border border-gray-300 p-1">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-xs text-gray-500">
              <p><strong>Instructions:</strong> Call out player numbers during the draft. Players with 👥 have siblings - picking them automatically drafts their siblings.</p>
              <p><strong>Note:</strong> Highlighted rows indicate players with siblings in the division.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableDraftSheet;