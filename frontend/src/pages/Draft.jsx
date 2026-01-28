import React, { useState, useEffect } from 'react';
import { Users, Download, Mail, Filter, Trophy, AlertCircle, Printer, UserPlus } from 'lucide-react';
import DraftGrid from '../components/DraftGrid';
import PrintableDraftSheet from '../components/PrintableDraftSheet'; // Keep this import
import Modal from '../components/Modal';
import api from '../services/api';
import { getPermissionErrorMessage } from '../utils/permissionHelpers';

const Draft = () => {

  // Uses the authenticated axios client (api) so the Authorization header is included.
  const sendRosterEmail = async (endpoint, payload) => {
    const res = await api.post(endpoint, payload);
    return res.data;
  };

  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [draftData, setDraftData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [divisionsError, setDivisionsError] = useState(null);
  const [draftStarted, setDraftStarted] = useState(false);
  const [showTeammateModal, setShowTeammateModal] = useState(false);
  const [teammateRequests, setTeammateRequests] = useState([]);

  // NEW: Draft mode vs "Add Player To Team" mode (late registrations)
  const [mode, setMode] = useState('draft'); // 'draft' | 'add'

  // New states for printable draft sheet - now using Modal component
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [printSeason, setPrintSeason] = useState('');
  const [printDivision, setPrintDivision] = useState('');
  const [showPrintableSheet, setShowPrintableSheet] = useState(false); // NEW: Control when to show printable sheet

  useEffect(() => {
    loadSeasons();
    // divisions depend on season; will load after season selected
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadDivisions(selectedSeason);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  useEffect(() => {
    if (selectedDivision && selectedSeason) {
      loadDraftData();
    } else {
      setDraftData(null);
    }
  }, [selectedDivision, selectedSeason]);

const loadSeasons = async () => {
  try {
    const [activeRes, allRes] = await Promise.all([
      api.get('/seasons/active').catch(() => ({ data: null })),
      api.get('/seasons').catch(() => ({ data: [] }))
    ]);

    const active = activeRes?.data || null;
    const all = allRes?.data || [];
    
    setSeasons(Array.isArray(all) ? all : []);
    const nextDefault = active?.id || (Array.isArray(all) ? all?.[0]?.id : '') || '';
    if (nextDefault) setSelectedSeason(nextDefault);
  } catch (error) {
    console.error('Error loading seasons:', error);
    
    const errorMessage = getPermissionErrorMessage(
      error,
      'Failed to load seasons. You may not have permission to view draft data.'
    );
    
    setError(errorMessage);
  }
};

  const loadDivisions = async (seasonId) => {
  try {
    console.log('Loading divisions from /api/divisions');
    const response = await api.get(`/divisions?season_id=${seasonId}`);
    
    console.log('Divisions loaded successfully:', response.data);
    setDivisions(response.data);
    // If currently selectedDivision isn't in this season, clear it
    if (selectedDivision && Array.isArray(response.data) && !response.data.find(d => d.id === selectedDivision)) {
      setSelectedDivision('');
    }
    setDivisionsError(null);
  } catch (error) {
    console.error('Error loading divisions:', error);
    
    const errorMessage = getPermissionErrorMessage(
      error,
      `Failed to load divisions: ${error.message}. You may not have permission to view draft data.`
    );
    
    setDivisionsError(errorMessage);
    setDivisions([]);
  }
};
  
    const getVolunteerRoles = (player) => {
    if (!player.volunteers || player.volunteers.length === 0) return '';
    return player.volunteers.map(v => v.derived_role || v.role || 'Volunteer').join(', ');
  };

  const loadDraftData = async () => {
  try {
    setLoading(true);
    setError(null);
    console.log('Loading draft data for:', { selectedDivision, selectedSeason });
    
    const response = await api.get(`/draft/data?division_id=${selectedDivision}&season_id=${selectedSeason}`);
    
    console.log('Draft data loaded successfully:', response.data);
    
    if (!response.data) {
      throw new Error('No data returned from server');
    }
    
    const safeData = {
      players: Array.isArray(response.data.players) ? response.data.players : [],
      teams: Array.isArray(response.data.teams) ? response.data.teams : [],
      playerAgent: response.data.playerAgent || null,
      division: response.data.division || 'Unknown Division'
    };
    
    console.log('Safe draft data:', safeData);
    setDraftData(safeData);
  } catch (error) {
    console.error('Error loading draft data:', error);
    
    const errorMessage = getPermissionErrorMessage(
      error,
      `Failed to load draft data: ${error.message}. You may not have permission to view draft data.`
    );
    
    setError(errorMessage);
    setDraftData({
      players: [],
      teams: [],
      playerAgent: null,
      division: 'Error'
    });
  } finally {
    setLoading(false);
  }
};

  const loadPrintData = async (divisionId, seasonId) => {
  try {
    setPrintLoading(true);
    console.log('Loading print data for:', { divisionId, seasonId });
    
    // Load draft data
    const response = await api.get(`/draft/data?division_id=${divisionId}&season_id=${seasonId}`);
    
    console.log('Print data loaded successfully:', response.data);
    
    if (!response.data) {
      throw new Error('No data returned from server');
    }
    
    const playersWithNumbers = Array.isArray(response.data.players) 
      ? response.data.players.map((player, index) => ({
          ...player,
          draftNumber: index + 1
        }))
      : [];

    // Load teammate requests for this division
    let teammateRequests = [];
    try {
      const requestsResponse = await api.get(`/requests?season_id=${seasonId}`);
      
      if (requestsResponse.data) {
        const filtered = (requestsResponse.data || []).filter(r => 
          r.type === 'Teammate Request' && r.current_division_id === divisionId
        );
        
        // Enhance with draft numbers
        teammateRequests = filtered.map(req => {
          const player = playersWithNumbers.find(p => p.id === req.player_id);
          return {
            ...req,
            draftNumber: player ? player.draftNumber : 'Not assigned',
            requestingPlayerName: req.requesting_player ? 
              `${req.requesting_player.last_name || ''}, ${req.requesting_player.first_name || ''}` : 
              'Unknown Player'
          };
        });
        console.log('Loaded teammate requests:', teammateRequests.length);
      }
    } catch (reqError) {
      console.error('Error loading teammate requests:', reqError);
      // Continue without teammate requests if there's an error
    }

    const safeData = {
      players: playersWithNumbers,
      divisionName: divisions.find(d => d.id === divisionId)?.name || 'Unknown Division',
      seasonName: seasons.find(s => s.id === seasonId)?.name || 'Unknown Season',
      teammateRequests: teammateRequests
    };
    
    console.log('Safe print data with teammate requests:', safeData);
    setPrintData(safeData);
  } catch (error) {
    console.error('Error loading print data:', error);
    
    const errorMessage = getPermissionErrorMessage(
      error,
      `Failed to load draft data for printing: ${error.message}. You may not have permission to view this data.`
    );
    
    alert(errorMessage);
  } finally {
    setPrintLoading(false);
  }
};

  const handlePrintClick = () => {
    setPrintSeason('');
    setPrintDivision('');
    setPrintData(null);
    setShowPrintableSheet(false);
    setShowPrintModal(true);
  };

  const handleGeneratePreview = () => {
    if (!printSeason || !printDivision) {
      alert('Please select both season and division');
      return;
    }
    loadPrintData(printDivision, printSeason);
  };

  const handleGeneratePrintableSheet = () => {
    setShowPrintableSheet(true);
  };

  const canSwitchDivision = () => {
    if (draftStarted) {
      const confirmSwitch = window.confirm(
        'Draft is currently in progress. Switching divisions or seasons will cancel the current draft. All progress will be lost. Continue?'
      );
      
      if (confirmSwitch) {
        setDraftStarted(false);
        return true;
      }
      return false;
    }
    return true;
  };

  const handleDivisionChange = (newDivisionId) => {
    if (!canSwitchDivision()) return;
    setSelectedDivision(newDivisionId);
  };

  const handleSeasonChange = (newSeasonId) => {
    if (!canSwitchDivision()) return;
    setSelectedSeason(newSeasonId);
  };

  const handlePicksUpdate = (playerId, managerId) => {
    console.log('Player assigned:', playerId, 'to manager:', managerId);
  };

  const handleDraftStart = () => {
    setDraftStarted(true);
  };

  const handleDraftComplete = () => {
    setDraftStarted(false);
  };

  const openTeammateRequests = async () => {
    try {
      const res = await api.get('/requests', { params: { season_id: selectedSeason } });
      const filtered = (res.data || []).filter(r => 
        r.type === 'Teammate Request' && r.current_division_id === selectedDivision
      );
      
      // Enhance with draft numbers
      const enhancedRequests = filtered.map(req => {
        const player = draftData?.players?.find(p => p.id === req.player_id);
        return {
          ...req,
          draftNumber: player ? draftData.players.indexOf(player) + 1 : 'Not assigned'
        };
      });
      
      setTeammateRequests(enhancedRequests);
      setShowTeammateModal(true);
    } catch (e) {
      console.error(e);
      alert('Failed to load teammate requests');
    }
  };

  const hasDraftData = draftData && Array.isArray(draftData.players);

  // If we're showing the printable sheet, render it instead of the normal content
if (showPrintableSheet && printData) {
  return (
    <PrintableDraftSheet
      players={printData.players}
      divisionName={printData.divisionName}
      seasonName={printData.seasonName}
      teammateRequests={printData.teammateRequests || []} // ADD THIS LINE
      onClose={() => {
        setShowPrintableSheet(false);
        setShowPrintModal(false);
        setPrintData(null);
        setPrintSeason('');
        setPrintDivision('');
      }}
    />
  );
}

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Draft System</h1>
        <p className="text-gray-600 mt-1">Manage player drafts and team assignments</p>
        
        {draftStarted && (
          <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
              <span className="text-yellow-800 font-medium">Draft in Progress</span>
            </div>
            <p className="text-yellow-700 text-sm mt-1">
              Switching divisions or seasons will cancel the current draft.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="text-red-800">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {divisionsError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
            <div className="text-yellow-800">
              <strong>Note:</strong> {divisionsError}
            </div>
          </div>
        </div>
      )}

      {/* Printable Draft Sheet Card - UPDATED */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Printable Draft Sheet</h2>
            <p className="text-sm text-gray-600">Generate a printable draft sheet for managers</p>
          </div>
          <button
            onClick={handlePrintClick}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Printer className="h-4 w-4 mr-2" />
            Generate Draft Sheet
          </button>
        </div>
      </div>

      {/* Teammate Requests Card */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Teammate Requests</h2>
            <p className="text-sm text-gray-600">View teammate requests for this division</p>
          </div>
          <button
            onClick={openTeammateRequests}
            disabled={!selectedDivision || !selectedSeason}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400"
          >
            <Users className="h-4 w-4 mr-2" />
            View Teammate Requests
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedSeason}
              onChange={(e) => handleSeasonChange(e.target.value)}
            >
              <option value="">Select Season</option>
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
              onChange={(e) => handleDivisionChange(e.target.value)}
            >
              <option value="">Select Division</option>
              {divisions.map(division => (
                <option key={division.id} value={division.id}>{division.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mode toggle (does not change any existing draft behavior) */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('draft')}
            className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium border ${
              mode === 'draft'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Trophy className="h-4 w-4 mr-2" />
            Standard Draft
          </button>

          <button
            type="button"
            onClick={() => setMode('add')}
            className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium border ${
              mode === 'add'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Player To Team
          </button>

          <div className="text-sm text-gray-500">
            Use <strong>Add Player To Team</strong> for late registrations (only shows players not yet on a team).
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading draft data...</span>
        </div>
      )}

      {!selectedDivision || !selectedSeason ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Select Season and Division</h3>
          <p className="text-yellow-700">Please select a season and division to view draft data.</p>
        </div>
      ) : hasDraftData ? (
        mode === 'add' ? (
          <LatePlayerAssignment
            draftData={draftData}
            divisionId={selectedDivision}
            seasonId={selectedSeason}
            onRefresh={loadDraftData}
          />
        ) : (
          <DraftGrid 
            draftData={draftData}
            divisionId={selectedDivision}
            seasonId={selectedSeason}
            onPicksUpdate={handlePicksUpdate}
            onDraftStart={handleDraftStart}
            onDraftComplete={handleDraftComplete}
          />
        )
      ) : !loading && draftData && Array.isArray(draftData.players) && draftData.players.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">No Players Found</h3>
          <p className="text-gray-600">
            No players found for {divisions.find(d => d.id === selectedDivision)?.name} division in {seasons.find(s => s.id === selectedSeason)?.name} season.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Check if players are assigned to this division and season.
          </p>
        </div>
      ) : !loading && selectedDivision && selectedSeason && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Data Loading Issue</h3>
          <p className="text-red-700">Unable to load player data. Please check the console for details.</p>
          <p className="text-sm text-red-600 mt-2">
            Draft data: {draftData ? JSON.stringify(draftData) : 'No data loaded'}
          </p>
        </div>
      )}

      {/* Printable Draft Sheet Modal - UPDATED to use Modal component */}
      <Modal
        isOpen={showPrintModal}
        onClose={() => {
          setShowPrintModal(false);
          setPrintData(null);
          setPrintSeason('');
          setPrintDivision('');
        }}
        title="Generate Printable Draft Sheet"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowPrintModal(false);
                setPrintData(null);
                setPrintSeason('');
                setPrintDivision('');
              }}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            {!printData && (
              <button
                onClick={handleGeneratePreview}
                disabled={!printSeason || !printDivision || printLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {printLoading ? 'Loading...' : 'Preview Draft Sheet'}
              </button>
            )}
            {printData && (
              <button
                onClick={handleGeneratePrintableSheet}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Generate Printable Sheet
              </button>
            )}
          </div>
        }
      >
        {!printData ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              Select a season and division to preview the draft sheet.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                <select
                  value={printSeason}
                  onChange={(e) => setPrintSeason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Season</option>
                  {seasons.map(season => (
                    <option key={season.id} value={season.id}>{season.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                <select
                  value={printDivision}
                  onChange={(e) => setPrintDivision(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Division</option>
                  {divisions.map(division => (
                    <option key={division.id} value={division.id}>{division.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 mb-4">
              Preview for <span className="font-semibold">{printData.seasonName}</span> - <span className="font-semibold">{printData.divisionName}</span>
            </div>
            
            {/* Player List Preview - Show all columns that your PrintableDraftSheet shows */}
            <div className="overflow-auto max-h-96 border border-gray-200 rounded-md">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">#</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Last Name</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">First Name</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Age</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Travel</th>
					<th className="px-3 py-2 font-medium text-gray-700 text-left">Volunteer</th>
                    {/*<th className="px-3 py-2 font-medium text-gray-700 text-left">School</th> */}
                    {/*<th className="px-3 py-2 font-medium text-gray-700 text-left">Status</th> */}
                  </tr>
                </thead>
                <tbody>
                  {printData.players.map((player) => (
                    <tr key={player.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-center">{player.draftNumber}</td>
                      <td className="px-3 py-2">{player.last_name || ''}</td>
                      <td className="px-3 py-2">{player.first_name || ''}</td>
                      <td className="px-3 py-2 text-center">
                        {player.birth_date ? calculateAge(player.birth_date) : 'N/A'}
                      </td>
                      {/*<td className="px-3 py-2">{player.program_title || ''}</td>  */}
					  <td className="px-3 py-2">{player.is_travel_player ? '✓' : ''}</td>
				      <td className="px-3 py-2">{getVolunteerRoles(player)}</td>							  
                      {/*<td className="px-3 py-2">{player.school || ''}</td> */}
                      {/* <td className="px-3 py-2 text-center">
                        {player.team_id ? (
                          <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                            Drafted
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                            Available
                          </span>
                        )}
                      </td>*/}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Teammate Requests Preview */}
{printData.teammateRequests && printData.teammateRequests.length > 0 && (
  <div className="mt-6 pt-6 border-t border-gray-300">
    <h3 className="text-lg font-semibold text-gray-900 mb-3">Teammate Requests ({printData.teammateRequests.length})</h3>
    <div className="overflow-auto max-h-64 border border-gray-200 rounded-md">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 font-medium text-gray-700 text-left">Draft #</th>
            <th className="px-3 py-2 font-medium text-gray-700 text-left">Requesting Player</th>
            <th className="px-3 py-2 font-medium text-gray-700 text-left">Requested Teammate</th>
            {/* <th className="px-3 py-2 font-medium text-gray-700 text-left">Status</th> */}
          </tr>
        </thead>
        <tbody>
          {printData.teammateRequests.map((request) => (
            <tr key={request.id} className="border-t hover:bg-gray-50">
              <td className="px-3 py-2 font-semibold">{request.draftNumber}</td>
              <td className="px-3 py-2">{request.requestingPlayerName}</td>
              <td className="px-3 py-2 font-medium">{request.requested_teammate_name || 'Not specified'}</td>
              <td className="px-3 py-2">
               {/* <span className={`px-2 py-1 rounded-full text-xs ${
                  request.status === 'Approved' ? 'bg-green-100 text-green-800' :
                  request.status === 'Denied' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                   {request.status || 'Pending'} 
                </span>*/}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="text-xs text-gray-500 mt-2 italic">
      These requests will be included at the bottom of the printable draft sheet for manager reference.
    </p>
  </div>
)}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Total players: <span className="font-semibold">{printData.players.length}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Teammate Requests Modal */}
      <Modal
        isOpen={showTeammateModal}
        onClose={() => setShowTeammateModal(false)}
        title="Teammate Requests"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setShowTeammateModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        }
      >
        {teammateRequests.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No teammate requests found for {divisions.find(d => d.id === selectedDivision)?.name || 'this division'}.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 font-medium text-gray-700 text-left">Draft #</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-left">Requesting Player</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-left">Requested Teammate</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-left">Status</th>
                  <th className="px-3 py-2 font-medium text-gray-700 text-left">Comments</th>
                </tr>
              </thead>
              <tbody>
                {teammateRequests.map((req) => {
                  const requestingPlayer = req.requesting_player || {};
                  
                  return (
                    <tr key={req.id} className="border-t">
                      <td className="px-3 py-2 font-semibold">
                        {req.draftNumber}
                      </td>
                      <td className="px-3 py-2">
                        {requestingPlayer.last_name || ''}, {requestingPlayer.first_name || ''}
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {req.requested_teammate_name || 'Not specified'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          req.status === 'Approved' ? 'bg-green-100 text-green-800' :
                          req.status === 'Denied' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {req.status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2">{req.comments || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};

// Helper function to calculate age
function calculateAge(birthDateStr) {
  if (!birthDateStr) return '';
  const dob = new Date(birthDateStr);
  if (Number.isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// NEW: Assign late-registered (undrafted) players to an existing team
const LatePlayerAssignment = ({ draftData, divisionId, seasonId, onRefresh }) => {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendManagersEmail, setSendManagersEmail] = useState(true);
  const [sendPlayerAgentEmail, setSendPlayerAgentEmail] = useState(true);
  const [sendEquipmentManagerEmail, setSendEquipmentManagerEmail] = useState(true);

  const teams = Array.isArray(draftData?.teams) ? draftData.teams : [];
  const undraftedPlayers = (Array.isArray(draftData?.players) ? draftData.players : [])
    .filter(p => !p.team_id)
    .sort((a, b) => {
      const al = (a.last_name || '').toLowerCase();
      const bl = (b.last_name || '').toLowerCase();
      if (al < bl) return -1;
      if (al > bl) return 1;
      const af = (a.first_name || '').toLowerCase();
      const bf = (b.first_name || '').toLowerCase();
      return af.localeCompare(bf);
    });

  const assignPlayer = async () => {
  if (!selectedTeamId) {
    alert('Please select a team.');
    return;
  }
  if (!selectedPlayerId) {
    alert('Please select a player.');
    return;
  }

  setBusy(true);
  try {
    // 1) Assign player to team
    await api.put(`/players/${selectedPlayerId}`, { team_id: selectedTeamId });

    // 2) Send targeted late-add emails (only the selected team)
    const payload = { season_id: seasonId, team_id: selectedTeamId, player_id: selectedPlayerId };

    if (sendManagersEmail) {
      await api.post('/notifications/send-late-add-manager', payload);
    }
    if (sendPlayerAgentEmail) {
      await api.post('/notifications/send-late-add-player-agent', payload);
    }
    if (sendEquipmentManagerEmail) {
      await api.post('/notifications/send-late-add-equipment-manager', payload);
    }
    alert('Player added to team. Emails sent based on your selections.');

    // Reset + refresh data so the player disappears from the undrafted list
    setSelectedPlayerId('');
    if (typeof onRefresh === 'function') {
      await onRefresh();
    }
  } catch (err) {
    console.error('Late player assignment error:', err);
    const details = err?.response?.data?.details || err?.response?.data?.error;
    const msg = details ? (typeof details === 'string' ? details : JSON.stringify(err.response.data)) : (err?.message || 'Failed to add player to team.');
    alert(msg);
  } finally {
    setBusy(false);
  }
};

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Add Player To Team</h2>
          <p className="text-sm text-gray-600 mt-1">
            Shows players in this division/season who are not on a team yet (late registrations).
          </p>
        </div>
        <div className="text-sm text-gray-500">
          Undrafted players: <strong>{undraftedPlayers.length}</strong>
        </div>
      </div>

      {undraftedPlayers.length === 0 ? (
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
          <Users className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <div className="text-gray-800 font-medium">No undrafted players found</div>
          <div className="text-sm text-gray-600 mt-1">
            If you just imported a late player, click back to Standard Draft and return here, or refresh.
          </div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Team</option>
              {teams
                .slice()
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Undrafted Player</label>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select Player</option>
              {undraftedPlayers.map(p => (
                <option key={p.id} value={p.id}>
                  {(p.last_name || '').trim()}, {(p.first_name || '').trim()}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
  <div className="flex flex-wrap items-center gap-4">
    <label className="inline-flex items-center text-sm text-gray-700">
      <input
        type="checkbox"
        className="mr-2"
        checked={sendManagersEmail}
        onChange={(e) => setSendManagersEmail(e.target.checked)}
      />
      Email Managers
    </label>

    <label className="inline-flex items-center text-sm text-gray-700">
      <input
        type="checkbox"
        className="mr-2"
        checked={sendPlayerAgentEmail}
        onChange={(e) => setSendPlayerAgentEmail(e.target.checked)}
      />
      Email Player Agent
    </label>

    {/* NEW: Equipment Manager email checkbox */}
    <label className="inline-flex items-center text-sm text-gray-700">
      <input
        type="checkbox"
        className="mr-2"
        checked={sendEquipmentManagerEmail}
        onChange={(e) => setSendEquipmentManagerEmail(e.target.checked)}
      />
      Email Equipment Manager
    </label>
  </div>

  <div className="mt-4">
    <button
      type="button"
      disabled={busy}
      onClick={assignPlayer}
      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
    >
      {busy ? 'Adding...' : 'Add Player To Team'}
    </button>
  </div>

  <div className="mt-3 text-xs text-gray-500">
    Emails use the existing roster email endpoints. If Email Settings Test Mode is ON, messages go to the test email.
  </div>
</div>
        </div>
      )}
    </div>
  );
};

export default Draft;