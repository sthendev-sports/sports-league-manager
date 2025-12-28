import React, { useState, useEffect } from 'react';
import { Users, Download, Mail, Filter, Trophy, AlertCircle, Printer, UserPlus } from 'lucide-react';
import DraftGrid from '../components/DraftGrid';
import PrintableDraftSheet from '../components/PrintableDraftSheet';
import api from '../services/api';

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

  // NEW: Draft mode vs "Add Player To Team" mode (late registrations)
  const [mode, setMode] = useState('draft'); // 'draft' | 'add'

  // New states for printable draft sheet
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);

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
        fetch('/api/seasons/active').catch(() => null),
        fetch('/api/seasons').catch(() => null)
      ]);

      const active = activeRes && activeRes.ok ? await activeRes.json() : null;
      const all = allRes && allRes.ok ? await allRes.json() : [];

      setSeasons(Array.isArray(all) ? all : []);
      const nextDefault = active?.id || (Array.isArray(all) ? all?.[0]?.id : '') || '';
      if (nextDefault) setSelectedSeason(nextDefault);
    } catch (error) {
      console.error('Error loading seasons:', error);
      setError('Failed to load seasons');
    }
  };

  const loadDivisions = async (seasonId) => {
    try {
      console.log('Loading divisions from /api/divisions');
      const response = await fetch(`/api/divisions?season_id=${seasonId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Divisions loaded successfully:', data);
      setDivisions(data);
      // If currently selectedDivision isn't in this season, clear it
      if (selectedDivision && Array.isArray(data) && !data.find(d => d.id === selectedDivision)) {
        setSelectedDivision('');
      }
      setDivisionsError(null);
    } catch (error) {
      console.error('Error loading divisions:', error);
      setDivisionsError(`Failed to load divisions: ${error.message}.`);
      setDivisions([]);
    }
  };

  const loadDraftData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading draft data for:', { selectedDivision, selectedSeason });
      
      //const response = await fetch(`/api/players/draft/${selectedDivision}?season_id=${selectedSeason}`);
      const response = await fetch(`/api/draft/data?division_id=${selectedDivision}&season_id=${selectedSeason}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Draft data loaded successfully:', data);
      
      if (!data) {
        throw new Error('No data returned from server');
      }
      
      const safeData = {
        players: Array.isArray(data.players) ? data.players : [],
        teams: Array.isArray(data.teams) ? data.teams : [],
        playerAgent: data.playerAgent || null,
        division: data.division || 'Unknown Division'
      };
      
      console.log('Safe draft data:', safeData);
      setDraftData(safeData);
    } catch (error) {
      console.error('Error loading draft data:', error);
      setError(`Failed to load draft data: ${error.message}`);
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
      
      //const response = await fetch(`/api/players/draft/${divisionId}?season_id=${seasonId}`);
      const response = await fetch(`/api/draft/data?division_id=${divisionId}&season_id=${seasonId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Print data loaded successfully:', data);
      
      if (!data) {
        throw new Error('No data returned from server');
      }
      
      const playersWithNumbers = Array.isArray(data.players) 
        ? data.players.map((player, index) => ({
            ...player,
            draftNumber: index + 1
          }))
        : [];

      const safeData = {
        players: playersWithNumbers,
        divisionName: divisions.find(d => d.id === divisionId)?.name || 'Unknown Division',
        seasonName: seasons.find(s => s.id === seasonId)?.name || 'Unknown Season'
      };
      
      console.log('Safe print data:', safeData);
      setPrintData(safeData);
    } catch (error) {
      console.error('Error loading print data:', error);
      alert(`Failed to load draft data for printing: ${error.message}`);
    } finally {
      setPrintLoading(false);
    }
  };

  const handlePrintClick = () => {
    setShowPrintModal(true);
  };

  const handleGeneratePrintSheet = (divisionId, seasonId) => {
    loadPrintData(divisionId, seasonId);
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

  const hasDraftData = draftData && Array.isArray(draftData.players);

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

      {showPrintModal && (
        <PrintableDraftSheetModal
          seasons={seasons}
          divisions={divisions}
          onGenerate={handleGeneratePrintSheet}
          onClose={() => {
            setShowPrintModal(false);
            setPrintData(null);
          }}
          printData={printData}
          printLoading={printLoading}
        />
      )}
    </div>
  );
};

// NEW: Assign late-registered (undrafted) players to an existing team
const LatePlayerAssignment = ({ draftData, divisionId, seasonId, onRefresh }) => {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [sendManagersEmail, setSendManagersEmail] = useState(true);
  const [sendPlayerAgentEmail, setSendPlayerAgentEmail] = useState(true);

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

const PrintableDraftSheetModal = ({ seasons, divisions, onGenerate, onClose, printData, printLoading }) => {
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');

  const handleGenerate = () => {
    if (!selectedDivision || !selectedSeason) {
      alert('Please select both season and division');
      return;
    }
    onGenerate(selectedDivision, selectedSeason);
  };

  const handleClose = () => {
    setSelectedDivision('');
    setSelectedSeason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Generate Printable Draft Sheet</h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {!printData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
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
                    value={selectedDivision}
                    onChange={(e) => setSelectedDivision(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">Select Division</option>
                    {divisions.map(division => (
                      <option key={division.id} value={division.id}>{division.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={printLoading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
              >
                {printLoading ? 'Loading...' : 'Generate Draft Sheet'}
              </button>
            </div>
          ) : (
            <PrintableDraftSheet
              players={printData.players}
              divisionName={printData.divisionName}
              seasonName={printData.seasonName}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Draft;