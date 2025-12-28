import React, { useState, useEffect } from 'react';
import { Users, Target, CheckCircle, XCircle, Clock, User, AlertCircle } from 'lucide-react';
import api from '../services/api';

const VOLUNTEER_ASSIGN_ROLES = ['Manager', 'Assistant Coach', 'Team Parent'];

const parseInterestedRoles = (v) => {
  const raw = String(v?.interested_roles || '').trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n|\s*;\s*|\s*,\s*|\s*\|\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);
};

const volunteerEligibleRoles = (v) => {
  const roles = parseInterestedRoles(v);
  return VOLUNTEER_ASSIGN_ROLES.filter((r) =>
    roles.some((x) => x.toLowerCase() === r.toLowerCase())
  );
};




// Helper function to calculate age
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

const DraftInterface = ({ draftData, divisionId, seasonId, onPickMade }) => {
  const [draftSession, setDraftSession] = useState(null);
  const [currentPick, setCurrentPick] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showVolunteerRoleModal, setShowVolunteerRoleModal] = useState(false);
  const [volunteerAssignmentContext, setVolunteerAssignmentContext] = useState(null);
  const [selectedVolunteerId, setSelectedVolunteerId] = useState('');
  const [selectedVolunteerRole, setSelectedVolunteerRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  // Ensure draftData has safe defaults
  const safeDraftData = {
    players: Array.isArray(draftData?.players) ? draftData.players : [],
    teams: Array.isArray(draftData?.teams) ? draftData.teams : [],
    playerAgent: draftData?.playerAgent || null
  };

  useEffect(() => {
    if (divisionId && seasonId) {
      loadDraftSession();
    }
  }, [divisionId, seasonId]);

  const loadDraftSession = async () => {
    try {
      setLoading(true);
      setSessionError(null);
      console.log('Loading draft session from:', `/api/draft/session/${divisionId}?season_id=${seasonId}`);
      
      const response = await fetch(`/api/draft/session/${divisionId}?season_id=${seasonId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load draft session');
      }
      const data = await response.json();
      console.log('Draft session API response:', data);
      
      // Debug the structure
      console.log('Session data:', data.session);
      console.log('Session ordered_teams:', data.session?.ordered_teams);
      console.log('Session ordered_managers:', data.session?.ordered_managers);
      console.log('Picks data:', data.picks);
      
      setDraftSession(data);
      setCurrentPick(data.session?.current_pick || 0);
    } catch (error) {
      console.error('Error loading draft session:', error);
      setSessionError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Create a safe session with fallbacks
  const safeSession = {
    session: {
      ordered_managers: draftSession?.session?.ordered_managers || 
                       draftSession?.session?.ordered_teams?.map(team => ({
                         id: team.id,
                         name: team.name,
                         role: 'Manager'
                       })) || 
                       safeDraftData.teams.map(team => ({
                         id: team.id,
                         name: team.name,
                         role: 'Manager'
                       })),
      teams: draftSession?.session?.teams || safeDraftData.teams,
      current_pick: draftSession?.session?.current_pick || currentPick
    },
    picks: Array.isArray(draftSession?.picks) ? draftSession.picks : []
  };

  const makePick = async (playerId) => {
    if (!selectedPlayer) return;

    try {
      setLoading(true);
      const pickNumber = currentPick + 1;
      
      // Get the current manager based on pick number
      const managers = safeSession.session.ordered_managers;
      const managerIndex = pickNumber % (managers.length || 1);
      const currentManager = managers[managerIndex];
      
      // Use the first team as fallback
      const teamId = currentManager?.id || safeDraftData.teams[0]?.id;

      if (!teamId) {
        throw new Error('No team available for draft');
      }

      const response = await api.post('/draft/pick', {
  draft_session_id: draftSession?.session?.id || 'temp-session',
  team_id: teamId,
  player_id: selectedPlayer.id,
  pick_number: pickNumber,
});

const pick = response.data;

      
      // If drafted player has linked volunteers with interested draft roles, prompt to assign role
      const draftedPlayer = selectedPlayer;
      const draftedTeamId = teamId;
      const candidates = (draftedPlayer?.volunteers || [])
        .filter((v) => volunteerEligibleRoles(v).length > 0);

      if (candidates.length > 0) {
        setVolunteerAssignmentContext({ player: draftedPlayer, teamId: draftedTeamId, candidates });
        setSelectedVolunteerId(String(candidates[0].id || ''));
        const eligible = volunteerEligibleRoles(candidates[0]);
        setSelectedVolunteerRole(eligible[0] || '');
        setShowVolunteerRoleModal(true);
      }
setCurrentPick(pickNumber);
      setSelectedPlayer(null);
      
      if (onPickMade) {
        onPickMade(pick);
      }

      // Reload session to get updated state
      await loadDraftSession();
    } catch (error) {
      console.error('Error making pick:', error);
      alert(`Error making pick: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getNextManager = () => {
    const managers = safeSession.session.ordered_managers;
    if (!managers || managers.length === 0) return null;
    const managerIndex = currentPick % managers.length;
    return managers[managerIndex];
  };

  const isPlayerDrafted = (playerId) => {
    return safeSession.picks.some(pick => pick.player_id === playerId);
  };

  const availablePlayers = safeDraftData.players.filter(player => !isPlayerDrafted(player.id));
  const nextManager = getNextManager();

  const submitVolunteerRoleAssignment = async () => {
    try {
      if (!volunteerAssignmentContext?.teamId) return setShowVolunteerRoleModal(false);
      if (!selectedVolunteerId || !selectedVolunteerRole) return;
      setLoading(true);

      await api.put(`/volunteers/${selectedVolunteerId}`, {
        role: selectedVolunteerRole,
        team_id: volunteerAssignmentContext.teamId,
        division_id: safeSession.session.division_id,
        season_id: safeSession.session.season_id,
      });

      await loadDraftSession();
      setShowVolunteerRoleModal(false);
      setVolunteerAssignmentContext(null);
    } catch (e) {
      console.error('Error assigning volunteer role:', e);
      alert('Failed to assign volunteer role. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Session Error */}
      {sessionError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-400 mr-2" />
            <div className="text-yellow-800">
              <strong>Draft Session Note:</strong> {sessionError}. Using fallback data.
            </div>
          </div>
        </div>
      )}

      {/* Draft Status Bar */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Draft Status</h3>
            <p className="text-sm text-gray-600">
              Pick {currentPick + 1} of {safeDraftData.players.length}
            </p>
          </div>
          
          {nextManager && (
            <div className="text-right">
              <div className="flex items-center justify-end space-x-2">
                <User className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium text-gray-700">Next Pick:</span>
              </div>
              <div className="text-lg font-bold text-gray-900">
                {nextManager.name}
              </div>
              <div className="text-sm text-gray-600">{nextManager.role}</div>
            </div>
          )}
        </div>

        {/* Draft Order */}
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Draft Order:</h4>
          <div className="flex space-x-2 overflow-x-auto">
            {safeSession.session.ordered_managers.map((manager, index) => {
              const isCurrent = index === (currentPick % safeSession.session.ordered_managers.length);
              return (
                <div
                  key={manager.id}
                  className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium ${
                    isCurrent 
                      ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-500 ring-offset-2' 
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {manager.name}
                  {isCurrent && <Clock className="h-3 w-3 inline ml-1" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading...</span>
        </div>
      )}

      {/* Draft Board */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Available Players */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Available Players ({availablePlayers.length})
                </h3>
              </div>
              <div className="overflow-y-auto max-h-96">
                {availablePlayers.length > 0 ? (
                  availablePlayers.map((player, index) => (
                    <div
                      key={player.id}
                      className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                        selectedPlayer?.id === player.id ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                      onClick={() => setSelectedPlayer(player)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900">
                            {index + 1}. {player.first_name} {player.last_name}
                          </div>
                          <div className="text-sm text-gray-600">
                            Age: {calculateAge(player.birth_date)} • {player.gender}
                            {player.is_travel_player && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                Travel
                              </span>
                            )}
                          </div>
                          {player.family && (
                            <div className="text-xs text-gray-500 mt-1">
                              Guardian: {player.family.primary_contact_name}
                            </div>
                          )}
                        </div>
                        {selectedPlayer?.id === player.id && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <Users className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                    <p>No players available for draft.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selection Panel */}
          <div className="space-y-6">
            {/* Selected Player */}
            {selectedPlayer && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Selected Player</h3>
                <div className="space-y-3">
                  <div>
                    <strong>Name:</strong> {selectedPlayer.first_name} {selectedPlayer.last_name}
                  </div>
                  <div>
                    <strong>Age:</strong> {calculateAge(selectedPlayer.birth_date)}
                  </div>
                  <div>
                    <strong>Gender:</strong> {selectedPlayer.gender}
                  </div>
                  <div>
                    <strong>Travel:</strong> {selectedPlayer.is_travel_player ? 'Yes' : 'No'}
                  </div>
                  {selectedPlayer.family && (
                    <>
                      <div>
                        <strong>Guardian:</strong> {selectedPlayer.family.primary_contact_name}
                      </div>
                      {selectedPlayer.volunteers && selectedPlayer.volunteers.length > 0 && (
                        <div>
                          <strong>Volunteer:</strong>{' '}
                          {selectedPlayer.volunteers.map(v => `${v.role}: ${v.name}`).join(', ')}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={() => makePick(selectedPlayer.id)}
                  disabled={loading}
                  className="w-full mt-4 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? 'Making Pick...' : `Draft to ${nextManager?.name || 'Team'}`}
                </button>
              </div>
            )}

            {/* Recent Picks */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Picks</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {safeSession.picks.slice(-5).reverse().map(pick => (
                  <div key={pick.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div>
                      <div className="font-medium">
                        {pick.player?.first_name} {pick.player?.last_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        Pick #{pick.pick_number}
                      </div>
                    </div>
                    <div className="text-sm font-medium px-2 py-1 rounded bg-gray-200 text-gray-700">
                      {pick.team?.name || 'Team'}
                    </div>
                  </div>
                ))}
                {safeSession.picks.length === 0 && (
                  <div className="text-center text-gray-500 py-4">
                    No picks made yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {showVolunteerRoleModal && volunteerAssignmentContext && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Assign Volunteer Role</h3>
            <p className="text-sm text-gray-600 mb-4">
              {volunteerAssignmentContext.player?.first_name} {volunteerAssignmentContext.player?.last_name} has a parent volunteer who expressed interest in a draft role. Choose the assignment for this team.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Volunteer</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  value={selectedVolunteerId}
                  onChange={(e) => {
                    const vid = e.target.value;
                    setSelectedVolunteerId(vid);
                    const v = (volunteerAssignmentContext.candidates || []).find(
                      (x) => String(x.id) === String(vid)
                    );
                    const eligible = volunteerEligibleRoles(v);
                    setSelectedVolunteerRole(eligible[0] || '');
                  }}
                >
                  {(volunteerAssignmentContext.candidates || []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({volunteerEligibleRoles(v).join(', ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign as</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  value={selectedVolunteerRole}
                  onChange={(e) => setSelectedVolunteerRole(e.target.value)}
                >
                  {VOLUNTEER_ASSIGN_ROLES.map((r) => (
                    <option
                      key={r}
                      value={r}
                      disabled={
                        !volunteerEligibleRoles(
                          (volunteerAssignmentContext.candidates || []).find(
                            (x) => String(x.id) === String(selectedVolunteerId)
                          )
                        ).includes(r)
                      }
                    >
                      {r}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-gray-500 mt-1">
                  Based on the volunteer&apos;s Interested Roles from import.
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setShowVolunteerRoleModal(false);
                  setVolunteerAssignmentContext(null);
                }}
                disabled={loading}
              >
                Skip
              </button>
              <button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={submitVolunteerRoleAssignment}
                disabled={loading || !selectedVolunteerId || !selectedVolunteerRole}
              >
                {loading ? 'Saving...' : 'Assign Role'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DraftInterface;