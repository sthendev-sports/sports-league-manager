import React from 'react';

const PrintableDraftSheet = ({ divisionName, seasonName, players, teammateRequests = [], onClose }) => {
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
    return player.volunteers.map(v => {
      // Get the role name
      const role = v.derived_role || v.role || 'Volunteer';
      
      // Get the volunteer's name
      const fName = v.name || v.volunteer_name || '';
      const volunteerName = `${fName}`.trim();
      
      // If we have a name, include it with the role
      if (volunteerName) {
        return `${role} - ${volunteerName}`;
      } else {
        return role;
      }
    }).join(', ');
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

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'approved': return { bg: '#d1fae5', text: '#065f46' };
      case 'denied': return { bg: '#fee2e2', text: '#991b1b' };
      default: return { bg: '#fef3c7', text: '#92400e' };
    }
  };

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
                
                // Build teammate requests HTML if they exist
                let teammateRequestsHTML = '';
                if (teammateRequests.length > 0) {
  teammateRequestsHTML = `
    <div style="page-break-before: always; margin-top: 40px;">
      <h2 style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
        Teammate Requests - ${divisionName}
      </h2>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: bold; width: 10%;">Draft #</th>
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: bold; width: 30%;">Requesting Player</th>
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: bold; width: 30%;">Requested Teammate</th>
            <th style="border: 1px solid #ccc; padding: 8px; text-align: left; font-weight: bold; width: 30%;">Notes</th>
          </tr>
        </thead>
        <tbody>
          ${teammateRequests.map(request => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${request.draftNumber}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${request.requestingPlayerName || 'Unknown Player'}</td>
              <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold;">${request.requested_teammate_name || 'Not specified'}</td>
              <td style="border: 1px solid #ccc; padding: 8px;">${request.comments || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div style="font-size: 12px; color: #666; margin-top: 20px; font-style: italic; border-top: 1px solid #eee; padding-top: 10px;">
        <p><strong>Note to Managers:</strong> These are player requests to be on the same team as the listed teammate. 
        Please consider these requests during the draft when making your selections.</p>
      </div>
    </div>
  `;
}

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
                        .col-name { width: 16%; }
                        .col-gender { width: 5%; }
                        .col-travel { width: 5%; }
                        .col-status { width: 9%; }
                        .col-age { width: 5%; }
                        .col-birthday { width: 10%; }
                        .col-volunteers { width: 16%; }
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
                            <th class="col-gender">Gender</th>
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
                              <td class="col-gender" style="text-align: center;">${player.gender ? player.gender.charAt(0).toUpperCase() : ''}</td>
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
                      
                      ${teammateRequestsHTML}
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
              {teammateRequests.length > 0 && (
                <p className="text-sm text-blue-600 font-medium">
                  Teammate Requests: {teammateRequests.length} (will appear on printed sheet)
                </p>
              )}
            </div>

            <table className="w-full border-collapse border border-gray-300 text-sm mb-8">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 p-1 text-left w-12">#</th>
                  <th className="border border-gray-300 p-1 text-left w-36">Player Name</th>
                  <th className="border border-gray-300 p-1 text-left w-12">Gender</th>
                  <th className="border border-gray-300 p-1 text-left w-16">Travel</th>
                  <th className="border border-gray-300 p-1 text-left w-24">New/Return</th>
                  <th className="border border-gray-300 p-1 text-left w-12">Age</th>
                  <th className="border border-gray-300 p-1 text-left w-24">Birthday</th>
                  <th className="border border-gray-300 p-1 text-left w-36">Parent Volunteers</th>
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
                    <td className="border border-gray-300 p-1 text-center">
                      {player.gender ? player.gender.charAt(0).toUpperCase() : ''}
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

            {/* Teammate Requests Preview */}
            {teammateRequests.length > 0 && (
              <div className="mt-10 pt-8 border-t border-gray-300">
                <h3 className="text-xl font-bold text-center mb-6 pb-2 border-b border-gray-300">
                  Teammate Requests - {divisionName}
                </h3>
                
                <table className="w-full border-collapse border border-gray-300 text-sm mb-4">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-2 text-left w-16">Draft #</th>
                      <th className="border border-gray-300 p-2 text-left">Requesting Player</th>
                      <th className="border border-gray-300 p-2 text-left">Requested Teammate</th>
                      {/*<th className="border border-gray-300 p-2 text-left w-20">Status</th> */}
                      <th className="border border-gray-300 p-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teammateRequests.map((request) => {
                      const statusColors = getStatusColor(request.status);
                      return (
                        <tr key={request.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="border border-gray-300 p-2 text-center font-semibold">
                            {request.draftNumber}
                          </td>
                          <td className="border border-gray-300 p-2">
                            {request.requestingPlayerName || 'Unknown Player'}
                          </td>
                          <td className="border border-gray-300 p-2 font-medium">
                            {request.requested_teammate_name || 'Not specified'}
                          </td>
                          <td className="border border-gray-300 p-2">
                            <span 
                              className="px-2 py-1 rounded-full text-xs font-bold"
                              style={{
                                backgroundColor: statusColors.bg,
                                color: statusColors.text
                              }}
                            >
                              {/*{request.status || 'Pending'} */}
                            </span>
                          </td>
                          <td className="border border-gray-300 p-2 text-xs">
                            {request.comments || ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                
                <div className="text-xs text-gray-600 italic p-3 bg-gray-50 rounded border border-gray-200">
                  <p className="font-semibold mb-1">Note to Managers:</p>
                  <p>These are player requests to be on the same team as the listed teammate. Please consider these requests during the draft when making your selections. "Approved" requests should be prioritized.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrintableDraftSheet;