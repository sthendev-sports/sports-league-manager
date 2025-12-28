
import React, { useEffect, useMemo, useState } from 'react';
import { Save, Users, Mail, Phone, Trophy, Plus, X, Hash, Undo, Edit, Users as UsersIcon, Shield, Star, MapPin } from 'lucide-react';
import Modal from './Modal';
import api from '../services/api';



// --- Helpers: volunteer interest roles (for Draft volunteer prompt) ---
const ASSIGNABLE_ROLES = ['Manager', 'Assistant Coach', 'Team Parent'];

function parseInterestedRoles(volunteer) {
  const raw = String(
    volunteer?.interested_roles ??
    volunteer?.interested_role ??
    volunteer?.preferred_role ??
    ''
  ).trim();

  if (!raw) return [];
  return raw
    .split(/[,;|\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const lower = s.toLowerCase();
      if (lower === 'coach') return 'Assistant Coach';
      if (lower === 'assistant coach') return 'Assistant Coach';
      if (lower === 'team parent') return 'Team Parent';
      if (lower === 'manager') return 'Manager';
      return s;
    });
}

function getVolunteerInterestedRoles(volunteer) {
  const roles = new Set();

  // Get roles from interested_roles
  for (const r of parseInterestedRoles(volunteer)) {
    if (ASSIGNABLE_ROLES.includes(r)) roles.add(r);
  }
  
  // Also respect existing assignment (completed draft)
  const current = String(volunteer?.role || '').trim();
  if (ASSIGNABLE_ROLES.includes(current)) roles.add(current);
  if (String(current).toLowerCase() === 'coach') roles.add('Assistant Coach');

  return Array.from(roles);
}

function getEligibleAssignmentRoles(volunteer) {
  // Return ALL assignable roles so draft manager can choose any
  return [...ASSIGNABLE_ROLES];
}

function playerHasEligibleVolunteers(player) {
  const vols = Array.isArray(player?.volunteers) ? player.volunteers : [];
  return vols.some((v) => getVolunteerInterestedRoles(v).length > 0);
}

function getVolunteerBadgeText(volunteer) {
  const interestedRoles = getVolunteerInterestedRoles(volunteer);
  if (interestedRoles.length) return interestedRoles.join(', ');
  return String(volunteer?.role || 'Volunteer');
}
// --- end helpers ---

const DraftGrid = ({ draftData, divisionId, seasonId, onPicksUpdate, onDraftStart, onDraftComplete }) => {
  const [managers, setManagers] = useState([]);
  const [draftPicks, setDraftPicks] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [draftStarted, setDraftStarted] = useState(false);
  const [draftComplete, setDraftComplete] = useState(false);
  // When draftComplete becomes true, keep the user on the draft board so they can review/edit.
  // We only move to the team assignment/commit step after an explicit "Proceed" click.
  const [showTeamAssignments, setShowTeamAssignments] = useState(false);

  // Email sending (restored from DraftGrid_old)
  const [draftCommitted, setDraftCommitted] = useState(false);
  const [sendManagersEmail, setSendManagersEmail] = useState(true);
  const [sendPlayerAgentEmail, setSendPlayerAgentEmail] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  const [teamAssignments, setTeamAssignments] = useState({});
  const [saving, setSaving] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState([]);

  // Derived values for performance & correctness
  const draftedCount = useMemo(() => managers.reduce((sum, m) => sum + (m.picks?.length || 0), 0), [managers]);
  const allPlayersDrafted = draftStarted && availablePlayers.length === 0;

  // Keep draftComplete in sync with remaining players (handles partial last round)
  useEffect(() => {
    if (!draftStarted) return;
    setDraftComplete(allPlayersDrafted);
  }, [allPlayersDrafted, draftStarted]);

  const [showVolunteerModal, setShowVolunteerModal] = useState(false);
  const [currentPlayerWithVolunteers, setCurrentPlayerWithVolunteers] = useState(null);
  const [pickInputs, setPickInputs] = useState({});
  const [draftBoard, setDraftBoard] = useState([]);
  const [showVolunteerReassignmentModal, setShowVolunteerReassignmentModal] = useState(false);
  const [pendingPlayerMove, setPendingPlayerMove] = useState(null);

  // Initialize managers and available players
  useEffect(() => {
    if (draftData && draftData.players) {
      console.log('Draft data received:', draftData);
      
      // Initialize available players with numbers
      const playersWithNumbers = draftData.players.map((player, index) => ({
        ...player,
        draftNumber: index + 1
      }));
      setAvailablePlayers(playersWithNumbers);

      // Initialize managers from existing teams or create empty
      if (draftData.teams && draftData.teams.length > 0) {
        const initialManagers = draftData.teams.map(team => ({
          id: team.id,
          name: team.manager_name || `Manager ${team.name}`,
          teamId: team.id,
          teamName: team.name,
          picks: [],
          volunteers: {
            manager: null,
            assistantCoaches: [],
            teamParent: null
          }
        }));
        setManagers(initialManagers);
      } else {
        // If no teams exist, start with empty managers array
        setManagers([]);
      }
    }
  }, [draftData]);

  // Initialize draft board when managers are set
  useEffect(() => {
    if (managers.length > 0 && draftStarted) {
      initializeDraftBoard();
    }
  }, [managers, draftStarted]);

  // NOTE:
  // We intentionally do NOT auto-redirect to the post-draft team assignment step.
  // The draft is marked complete from handlePickEntry when the last player is drafted.

  const initializeDraftBoard = () => {
    // Create empty draft board with rounds
    const rounds = Math.ceil(draftData.players.length / managers.length) + 2; // Extra rounds for buffer
    const board = [];
    
    for (let round = 1; round <= rounds; round++) {
      const roundData = { round, picks: {} };
      managers.forEach(manager => {
        roundData.picks[manager.id] = null;
      });
      board.push(roundData);
    }
    
    setDraftBoard(board);
    
    // Initialize pick inputs
    const initialInputs = {};
    managers.forEach(manager => {
      initialInputs[manager.id] = '';
    });
    setPickInputs(initialInputs);
  };

  // Find siblings of a player
  const findSiblings = (player) => {
    if (!player.family_id) return [];
    
    const siblings = availablePlayers.filter(p => 
      p.family_id === player.family_id && 
      p.id !== player.id
    );
    
    console.log(`Found ${siblings.length} siblings for ${player.first_name} ${player.last_name} (Family ID: ${player.family_id})`);
    return siblings;
  };

  // Get snake draft order for a round
  const getRoundOrder = (round) => {
    const managerIds = managers.map(m => m.id);
    if (round % 2 === 1) {
      // Odd rounds: normal order
      return managerIds;
    } else {
      // Even rounds: reverse order
      return [...managerIds].reverse();
    }
  };

  // Get player status (returning/new)
  const getPlayerStatus = (player) => {
    // You might need to adjust this based on your actual data structure
    if (player.is_returning) return 'Returning';
    if (player.previous_team_id) return 'Returning';
    return 'New';
  };

  // Get player preview with full information
  const getPlayerPreview = (playerNumber) => {
    if (!playerNumber) return { name: '', details: '' };
    const player = availablePlayers.find(p => p.draftNumber === parseInt(playerNumber));
    if (!player) return { name: 'Player not found', details: '' };
    
    const status = getPlayerStatus(player);
    const hasVolunteers = playerHasEligibleVolunteers(player);
    
    return {
      name: `${player.first_name} ${player.last_name}`,
      details: `${status} • Age: ${calculateAge(player.birth_date)} • ${player.gender}`,
      hasVolunteers: hasVolunteers,
      volunteers: player.volunteers || [],
      travelPlayer: player.is_travel_player,
      status: status,
      player: player
    };
  };

  // Volunteer Assignment Modal Component
  const VolunteerAssignmentModal = ({ isOpen, onClose, player, managerId, onAssign }) => {
    const [assignments, setAssignments] = useState({});

    const handleAssignment = (volunteerId, role) => {
      setAssignments(prev => ({
        ...prev,
        [volunteerId]: role
      }));
    };

    const handleSubmit = () => {
      Object.entries(assignments).forEach(([volunteerId, role]) => {
        if (role) {
          onAssign(volunteerId, role, managerId);
        }
      });
      onClose();
    };

    const VolunteerModalFooter = (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={onClose}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            backgroundColor: 'white',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#f9fafb'}
          onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
        >
          Skip
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'white',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
        >
          <Save style={{ width: '16px', height: '16px' }} />
          Assign Volunteers
        </button>
      </div>
    );

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Assign Volunteers for ${player?.first_name} ${player?.last_name}`}
        footer={VolunteerModalFooter}
      >
        <div className="space-y-4">
          {player?.volunteers?.map(volunteer => {
            const interestedRoles = getVolunteerInterestedRoles(volunteer);
            return (
              <div key={volunteer.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-gray-900">{volunteer.name}</div>
                    {interestedRoles.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Interested in: {interestedRoles.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  {volunteer.email && (
                    <div className="flex items-center">
                      <Mail className="h-3 w-3 mr-2" />
                      {volunteer.email}
                    </div>
                  )}
                  {volunteer.phone && (
                    <div className="flex items-center">
                      <Phone className="h-3 w-3 mr-2" />
                      {volunteer.phone}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign as:
                  </label>
                  <select
  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
  value={assignments[volunteer.id] || ''}
  onChange={(e) => handleAssignment(volunteer.id, e.target.value)}
>
  <option value="">No assignment</option>
  <option value="Manager">Manager</option>
  <option value="Assistant Coach">Assistant Coach</option>
  <option value="Team Parent">Team Parent</option>
</select>
                  <div className="text-xs text-gray-500 mt-1">
                    Checkmark ✓ indicates role they expressed interest in
                  </div>
                </div>
              </div>
            );
          })}
          
          {(!player?.volunteers || player.volunteers.length === 0) && (
            <div className="text-center py-4 text-gray-500">
              No volunteers available for assignment
            </div>
          )}
        </div>
      </Modal>
    );
  };

  // Volunteer Reassignment Modal Component (for moved players)
  const VolunteerReassignmentModal = ({ isOpen, onClose, player, fromManagerId, toManagerId, onReassign }) => {
    const [assignments, setAssignments] = useState({});

    // Get current volunteer assignments from the source manager
    const getCurrentAssignments = () => {
      const fromManager = managers.find(m => m.id === fromManagerId);
      if (!fromManager || !player?.volunteers) return {};

      const currentAssignments = {};
      player.volunteers.forEach(volunteer => {
        if (fromManager.volunteers.manager?.id === volunteer.id) {
          currentAssignments[volunteer.id] = 'Manager';
        } else if (fromManager.volunteers.teamParent?.id === volunteer.id) {
          currentAssignments[volunteer.id] = 'Team Parent';
        } else if (fromManager.volunteers.assistantCoaches.find(c => c.id === volunteer.id)) {
          currentAssignments[volunteer.id] = 'Assistant Coach';
        }
      });
      return currentAssignments;
    };

    useEffect(() => {
      if (isOpen) {
        setAssignments(getCurrentAssignments());
      }
    }, [isOpen]);

    const handleAssignment = (volunteerId, role) => {
      setAssignments(prev => ({
        ...prev,
        [volunteerId]: role
      }));
    };

    const handleSubmit = () => {
      onReassign(assignments);
      onClose();
    };

    const handleUnassignAll = () => {
      const unassigned = {};
      player?.volunteers?.forEach(volunteer => {
        unassigned[volunteer.id] = '';
      });
      onReassign(unassigned);
      onClose();
    };

    const ReassignmentModalFooter = (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
        <button
          onClick={handleUnassignAll}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#dc2626',
            backgroundColor: 'white',
            border: '1px solid #dc2626',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#fef2f2'}
          onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
        >
          Unassign All
        </button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#f9fafb'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
          >
            Cancel Move
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '500',
              color: 'white',
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
        >
            <Save style={{ width: '16px', height: '16px' }} />
            Move Player & Volunteers
          </button>
        </div>
      </div>
    );

    const toManager = managers.find(m => m.id === toManagerId);
    const fromManager = managers.find(m => m.id === fromManagerId);

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={`Move ${player?.first_name} ${player?.last_name} to ${toManager?.name}`}
        footer={ReassignmentModalFooter}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              This player has parent volunteers currently assigned to {fromManager?.name}. 
              How would you like to handle their volunteer assignments?
            </p>
          </div>

          {player?.volunteers?.map(volunteer => {
            const currentRole = getCurrentAssignments()[volunteer.id];
            const interestedRoles = getVolunteerInterestedRoles(volunteer);
            
            return (
              <div key={volunteer.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-gray-900">{volunteer.name}</div>
                    {interestedRoles.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Interested in: {interestedRoles.join(', ')}
                      </div>
                    )}
                    <div className="text-sm text-gray-600">
                      Current: <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs ${getRoleColor(currentRole)}`}>
                        {currentRole || 'Not Assigned'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-gray-600 space-y-1 mb-3">
                  {volunteer.email && (
                    <div className="flex items-center">
                      <Mail className="h-3 w-3 mr-2" />
                      {volunteer.email}
                    </div>
                  )}
                  {volunteer.phone && (
                    <div className="flex items-center">
                      <Phone className="h-3 w-3 mr-2" />
                      {volunteer.phone}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign to {toManager?.name} as:
                  </label>
                  <select
  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
  value={assignments[volunteer.id] || ''}
  onChange={(e) => handleAssignment(volunteer.id, e.target.value)}
>
  <option value="">No assignment</option>
  <option value="Manager">Manager</option>
  <option value="Assistant Coach">Assistant Coach</option>
  <option value="Team Parent">Team Parent</option>
</select>
                  <div className="text-xs text-gray-500 mt-1">
                    Checkmark ✓ indicates role they expressed interest in
                  </div>
                </div>
              </div>
            );
          })}
          
          {(!player?.volunteers || player.volunteers.length === 0) && (
            <div className="text-center py-4 text-gray-500">
              No volunteers associated with this player
            </div>
          )}
        </div>
      </Modal>
    );
  };

  // Handle manual pick entry
  const handlePickEntry = (managerId, playerNumber) => {
    if (!draftStarted || draftComplete) return;

    const player = availablePlayers.find(p => p.draftNumber === parseInt(playerNumber));
    if (!player) {
      alert(`Player #${playerNumber} not found or already drafted`);
      return;
    }

    // Check if this manager has already picked in this round
    const currentRoundData = draftBoard[currentRound - 1];
    if (currentRoundData.picks[managerId]) {
      alert(`${managers.find(m => m.id === managerId).name} has already picked in round ${currentRound}`);
      return;
    }

    // Find siblings of this player
    const siblings = findSiblings(player);
    
    // Create picks for the main player and all siblings
    const allPlayersToPick = [player, ...siblings];
    const newPicks = [];

    allPlayersToPick.forEach(playerToPick => {
      const pick = {
        playerId: playerToPick.id,
        playerName: `${playerToPick.first_name} ${playerToPick.last_name}`,
        playerNumber: playerToPick.draftNumber,
        managerId: managerId,
        managerName: managers.find(m => m.id === managerId).name,
        pickNumber: draftPicks.length + newPicks.length + 1,
        timestamp: Date.now(),
        playerData: playerToPick,
        isSiblingPick: playerToPick.id !== player.id,
        round: currentRound
      };
      newPicks.push(pick);
    });

    // Update draft picks
    setDraftPicks([...draftPicks, ...newPicks]);
    // Any change after commit invalidates the saved draft
    if (draftCommitted) setDraftCommitted(false);
    
    // Update manager's picks
    const updatedManagers = [...managers];
    const managerIndex = updatedManagers.findIndex(m => m.id === managerId);
    updatedManagers[managerIndex].picks.push(...newPicks);
    setManagers(updatedManagers);

    // Update draft board
    const updatedDraftBoard = [...draftBoard];
    updatedDraftBoard[currentRound - 1].picks[managerId] = {
      player: player,
      siblings: siblings
    };
    setDraftBoard(updatedDraftBoard);

    // Keep draftPicks in sync so drafted count and pick order stay correct
    setDraftPicks(prev => prev.filter(p => p.playerNumber !== playerNumber));

    // Any change after commit invalidates the saved draft
    if (draftCommitted) setDraftCommitted(false);

    // Remove all picked players (main player + siblings) from available players
    const playerNumbersToRemove = allPlayersToPick.map(p => p.draftNumber);
    const updatedAvailablePlayers = availablePlayers.filter(p => !playerNumbersToRemove.includes(p.draftNumber));
    setAvailablePlayers(updatedAvailablePlayers);

    // Clear the input
    setPickInputs({
      ...pickInputs,
      [managerId]: ''
    });

    // Show volunteer assignment modal for the main player (and siblings if they have volunteers)
    const playersWithVolunteers = allPlayersToPick.filter(p => playerHasEligibleVolunteers(p));
    
    if (playersWithVolunteers.length > 0) {
      console.log('Players with volunteers, showing assignment modal:', playersWithVolunteers);
      setCurrentPlayerWithVolunteers({
        player: playersWithVolunteers[0],
        managerId: managerId,
        pickNumber: draftPicks.length + 1,
        allPlayersWithVolunteers: playersWithVolunteers
      });
      setShowVolunteerModal(true);
    }

    // Show alert if siblings were auto-drafted
    if (siblings.length > 0) {
      const siblingNames = siblings.map(s => `${s.first_name} ${s.last_name} (#${s.draftNumber})`).join(', ');
      alert(`Sibling auto-draft: ${player.first_name} ${player.last_name} was drafted along with sibling(s): ${siblingNames}`);
    }

    // Check if round is complete
    const roundComplete = checkRoundComplete(currentRound);
    if (roundComplete) {
      if (updatedAvailablePlayers.length === 0) {
        setDraftComplete(true);
        if (onDraftComplete) {
          onDraftComplete();
        }
      } else {
        setCurrentRound(currentRound + 1);
      }
    }
  };

  // Check if all managers have picked in the current round
  const checkRoundComplete = (round) => {
    const roundData = draftBoard[round - 1];
    if (!roundData) return false;
    
    return managers.every(manager => roundData.picks[manager.id] !== null);
  };

  const handleVolunteerAssignment = (volunteerId, role, managerId) => {
    const updatedManagers = [...managers];
    const managerIndex = updatedManagers.findIndex(m => m.id === managerId);
    
    if (managerIndex !== -1) {
      const volunteer = currentPlayerWithVolunteers.player.volunteers.find(v => v.id === volunteerId);
      
      if (role === 'Team Parent') {
        updatedManagers[managerIndex].volunteers.teamParent = volunteer;
        console.log(`Assigned ${volunteer.name} as Team Parent for ${updatedManagers[managerIndex].name}`);
      } else if (role === 'Assistant Coach') {
        if (!updatedManagers[managerIndex].volunteers.assistantCoaches.find(v => v.id === volunteerId)) {
          updatedManagers[managerIndex].volunteers.assistantCoaches.push(volunteer);
          console.log(`Assigned ${volunteer.name} as Assistant Coach for ${updatedManagers[managerIndex].name}`);
        }
      } else if (role === 'Manager') {
        updatedManagers[managerIndex].volunteers.manager = volunteer;
        updatedManagers[managerIndex].name = volunteer.name;
        console.log(`Assigned ${volunteer.name} as Manager for team`);
      }
      
      setManagers(updatedManagers);
    }
    
    // Check if there are more players with volunteers to assign
    if (currentPlayerWithVolunteers.allPlayersWithVolunteers && 
        currentPlayerWithVolunteers.allPlayersWithVolunteers.length > 1) {
      const remainingPlayers = currentPlayerWithVolunteers.allPlayersWithVolunteers.slice(1);
      setCurrentPlayerWithVolunteers({
        player: remainingPlayers[0],
        managerId: currentPlayerWithVolunteers.managerId,
        pickNumber: currentPlayerWithVolunteers.pickNumber,
        allPlayersWithVolunteers: remainingPlayers
      });
    } else {
      setShowVolunteerModal(false);
      setCurrentPlayerWithVolunteers(null);
    }
  };

  // Remove player from team
  const removePlayerFromTeam = (managerId, playerNumber) => {
    console.log('removePlayerFromTeam called:', { managerId, playerNumber });
    
    const managerIndex = managers.findIndex(m => m.id === managerId);
    if (managerIndex === -1) {
      console.log('Manager not found');
      return;
    }

    const manager = managers[managerIndex];
    const playerPick = manager.picks.find(p => p.playerNumber === playerNumber);
    
    if (!playerPick) {
      console.log('Player pick not found in manager picks');
      return;
    }

    const player = playerPick.playerData || draftData.players.find(p => p.draftNumber === playerNumber);
    
    if (!player) {
      console.log('Player data not found');
      return;
    }

    // Check if player has siblings on the same team
    const siblingsOnTeam = player.family_id ? 
      manager.picks.filter(p => 
        p.playerData?.family_id === player.family_id && 
        p.playerNumber !== playerNumber
      ) : [];

    // Check if player has volunteers that need handling
    const hasVolunteers = playerHasEligibleVolunteers(player);
    const hasAssignedVolunteers = hasVolunteers && (
      manager.volunteers.manager && player.volunteers.some(v => v.id === manager.volunteers.manager?.id) ||
      manager.volunteers.teamParent && player.volunteers.some(v => v.id === manager.volunteers.teamParent?.id) ||
      manager.volunteers.assistantCoaches.some(coach => 
        player.volunteers.some(v => v.id === coach.id)
      )
    );

    let confirmMessage = `Remove ${player.first_name} ${player.last_name} from ${manager.name}?`;
    
    if (siblingsOnTeam.length > 0) {
      const siblingNames = siblingsOnTeam.map(s => `${s.playerName} (#${s.playerNumber})`).join(', ');
      confirmMessage += `\n\nNOTE: This player has sibling(s) on the same team: ${siblingNames}\nOnly this player will be removed.`;
    }
    
    if (hasAssignedVolunteers) {
      const volunteerNames = [];
      if (manager.volunteers.manager && player.volunteers.some(v => v.id === manager.volunteers.manager.id)) {
        volunteerNames.push(`${manager.volunteers.manager.name} (Manager)`);
      }
      if (manager.volunteers.teamParent && player.volunteers.some(v => v.id === manager.volunteers.teamParent.id)) {
        volunteerNames.push(`${manager.volunteers.teamParent.name} (Team Parent)`);
      }
      manager.volunteers.assistantCoaches.forEach(coach => {
        if (player.volunteers.some(v => v.id === coach.id)) {
          volunteerNames.push(`${coach.name} (Assistant Coach)`);
        }
      });
      
      confirmMessage += `\n\nThis player has volunteers assigned:\n${volunteerNames.join('\n')}\nThese volunteers will be removed from the team.`;
    }
    
    confirmMessage += '\n\nContinue?';
    
    if (!window.confirm(confirmMessage)) {
      console.log('User cancelled removal');
      return;
    }

    // Remove from manager
    const updatedManagers = [...managers];
    updatedManagers[managerIndex].picks = updatedManagers[managerIndex].picks.filter(
      p => p.playerNumber !== playerNumber
    );

    // Remove associated volunteers
    if (hasVolunteers) {
      player.volunteers.forEach(volunteer => {
        // Remove from manager role
        if (updatedManagers[managerIndex].volunteers.manager?.id === volunteer.id) {
          updatedManagers[managerIndex].volunteers.manager = null;
        }
        
        // Remove from team parent role
        if (updatedManagers[managerIndex].volunteers.teamParent?.id === volunteer.id) {
          updatedManagers[managerIndex].volunteers.teamParent = null;
        }
        
        // Remove from assistant coaches
        updatedManagers[managerIndex].volunteers.assistantCoaches = 
          updatedManagers[managerIndex].volunteers.assistantCoaches.filter(
            coach => coach.id !== volunteer.id
          );
      });
    }

    setManagers(updatedManagers);

    // Add back to available players (with volunteers intact)
    if (player) {
      setAvailablePlayers(prev => {
        const newAvailable = [...prev, player].sort((a, b) => a.draftNumber - b.draftNumber);
        return newAvailable;
      });
    }

    // Remove from draft board
    const updatedDraftBoard = [...draftBoard];
    for (let round of updatedDraftBoard) {
      for (let managerId in round.picks) {
        const pick = round.picks[managerId];
        if (pick && pick.player.draftNumber === playerNumber) {
          round.picks[managerId] = null;
          break;
        }
      }
    }
    setDraftBoard(updatedDraftBoard);

    // Keep draftPicks in sync so drafted count and pick order stay correct
    setDraftPicks(prev => prev.filter(p => p.playerNumber !== playerNumber));

    // Any change after commit invalidates the saved draft
    if (draftCommitted) setDraftCommitted(false);
  };

  // Move player to another team
  const movePlayer = (fromManagerId, toManagerId, playerNumber) => {
    console.log('movePlayer called:', { fromManagerId, toManagerId, playerNumber });
    
    const fromManagerIndex = managers.findIndex(m => m.id === fromManagerId);
    const toManagerIndex = managers.findIndex(m => m.id === toManagerId);
    
    if (fromManagerIndex === -1 || toManagerIndex === -1) {
      console.log('Managers not found');
      return;
    }

    const fromManager = managers[fromManagerIndex];
    const playerPick = fromManager.picks.find(p => p.playerNumber === playerNumber);
    
    if (!playerPick) {
      console.log('Player pick not found in fromManager picks');
      return;
    }

    const player = playerPick.playerData || draftData.players.find(p => p.draftNumber === playerNumber);
    
    if (!player) {
      console.log('Player data not found');
      return;
    }

    // Check if player has volunteers that need reassignment
    const hasVolunteers = playerHasEligibleVolunteers(player);
    const hasAssignedVolunteers = hasVolunteers && (
      fromManager.volunteers.manager && player.volunteers.some(v => v.id === fromManager.volunteers.manager?.id) ||
      fromManager.volunteers.teamParent && player.volunteers.some(v => v.id === fromManager.volunteers.teamParent?.id) ||
      fromManager.volunteers.assistantCoaches.some(coach => 
        player.volunteers.some(v => v.id === coach.id)
      )
    );

    if (hasAssignedVolunteers) {
      // Show volunteer reassignment modal
      setPendingPlayerMove({
        fromManagerId,
        toManagerId,
        playerNumber,
        player
      });
      setShowVolunteerReassignmentModal(true);
    } else {
      // No volunteers to reassign, proceed with move
      executePlayerMove(fromManagerId, toManagerId, playerNumber, {});
    }
  };

  const executePlayerMove = (fromManagerId, toManagerId, playerNumber, volunteerAssignments) => {
    const fromManagerIndex = managers.findIndex(m => m.id === fromManagerId);
    const toManagerIndex = managers.findIndex(m => m.id === toManagerId);
    
    if (fromManagerIndex === -1 || toManagerIndex === -1) return;

    const updatedManagers = [...managers];
    const fromManager = updatedManagers[fromManagerIndex];
    const playerPick = fromManager.picks.find(p => p.playerNumber === playerNumber);
    
    if (!playerPick) return;

    const player = playerPick.playerData || draftData.players.find(p => p.draftNumber === playerNumber);

    // Remove from original manager
    updatedManagers[fromManagerIndex].picks = updatedManagers[fromManagerIndex].picks.filter(
      p => p.playerNumber !== playerNumber
    );

    // Remove volunteers from original manager
    if (player?.volunteers) {
      player.volunteers.forEach(volunteer => {
        // Remove from manager role
        if (updatedManagers[fromManagerIndex].volunteers.manager?.id === volunteer.id) {
          updatedManagers[fromManagerIndex].volunteers.manager = null;
        }
        
        // Remove from team parent role
        if (updatedManagers[fromManagerIndex].volunteers.teamParent?.id === volunteer.id) {
          updatedManagers[fromManagerIndex].volunteers.teamParent = null;
        }
        
        // Remove from assistant coaches
        updatedManagers[fromManagerIndex].volunteers.assistantCoaches = 
          updatedManagers[fromManagerIndex].volunteers.assistantCoaches.filter(
            coach => coach.id !== volunteer.id
          );
      });
    }

    // Add to new manager
    updatedManagers[toManagerIndex].picks.push({
      ...playerPick,
      managerId: toManagerId,
      managerName: updatedManagers[toManagerIndex].name
    });

    // Assign volunteers to new manager based on assignments
    if (player?.volunteers) {
      Object.entries(volunteerAssignments).forEach(([volunteerId, role]) => {
        const volunteer = player.volunteers.find(v => v.id === volunteerId);
        if (volunteer && role) {
          if (role === 'Manager') {
            updatedManagers[toManagerIndex].volunteers.manager = volunteer;
            updatedManagers[toManagerIndex].name = volunteer.name;
          } else if (role === 'Team Parent') {
            updatedManagers[toManagerIndex].volunteers.teamParent = volunteer;
          } else if (role === 'Assistant Coach') {
            if (!updatedManagers[toManagerIndex].volunteers.assistantCoaches.find(v => v.id === volunteer.id)) {
              updatedManagers[toManagerIndex].volunteers.assistantCoaches.push(volunteer);
            }
          }
        }
      });
    }

    setManagers(updatedManagers);
    setPendingPlayerMove(null);
  };

  const handleVolunteerReassignment = (assignments) => {
    if (pendingPlayerMove) {
      executePlayerMove(
        pendingPlayerMove.fromManagerId,
        pendingPlayerMove.toManagerId,
        pendingPlayerMove.playerNumber,
        assignments
      );
    }
    setShowVolunteerReassignmentModal(false);
  };

  const addManager = () => {
    const newManager = {
      id: `temp-${Date.now()}`,
      name: '',
      teamId: null,
      teamName: '',
      picks: [],
      volunteers: {
        manager: null,
        assistantCoaches: [],
        teamParent: null
      }
    };
    setManagers([...managers, newManager]);
  };

  const updateManager = (index, field, value) => {
    const updatedManagers = [...managers];
    updatedManagers[index][field] = value;
    setManagers(updatedManagers);
  };

  const removeManager = (index) => {
    const updatedManagers = managers.filter((_, i) => i !== index);
    setManagers(updatedManagers);
  };

  const startDraft = () => {
    if (managers.length === 0) {
      alert('Please add at least one manager');
      return;
    }
    
    const unnamedManager = managers.find(m => !m.name.trim());
    if (unnamedManager) {
      alert('Please enter a name for all managers');
      return;
    }
    
    setDraftStarted(true);
    setDraftCommitted(false);
    setCurrentRound(1);
    setShowTeamAssignments(false);
    
    if (onDraftStart) {
      onDraftStart();
    }
  };

  const proceedToTeamAssignments = () => {
    setShowTeamAssignments(true);
  };

  const backToDraftBoard = () => {
    // Allow edits after completion (move/remove + re-draft)
    setShowTeamAssignments(false);
    setDraftComplete(false);
  };

  const assignTeamToManager = (managerId, teamId) => {
    const team = draftData.teams.find(t => t.id === teamId);
    if (!team) return;

    setTeamAssignments({
      ...teamAssignments,
      [managerId]: teamId
    });
  };

  // ✅ Send roster emails (restored)
  // Uses the authenticated axios "api" client; backend honors Email Settings Test Mode automatically.
  const sendRosterEmails = async () => {
    if (!draftCommitted) {
      alert('Please click "Commit Draft Results" first. Emails are generated from saved teams.');
      return;
    }

    if (!sendManagersEmail && !sendPlayerAgentEmail) {
      alert('Please select at least one email option (Managers and/or Player Agent).');
      return;
    }

    setEmailBusy(true);
    try {
      const payload = { season_id: seasonId, division_id: divisionId };

      if (sendManagersEmail) {
        await api.post('/notifications/send-manager-rosters', payload);
      }

      if (sendPlayerAgentEmail) {
        await api.post('/notifications/send-player-agent-rosters', payload);
      }

      alert('Roster emails sent! If Email Settings Test Mode is ON, they went to the test email.');
    } catch (err) {
      const msg =
        err?.response?.data?.details ||
        err?.response?.data?.error ||
        err?.message ||
        String(err);

      console.error('Error sending roster emails:', err);
      alert(`Error sending roster emails: ${msg}`);
    } finally {
      setEmailBusy(false);
    }
  };


  const commitDraft = async () => {
    const unassignedManagers = managers.filter(manager => !teamAssignments[manager.id]);
    if (unassignedManagers.length > 0) {
      const managerNames = unassignedManagers.map(m => m.name).join(', ');
      alert(`Please assign teams to the following managers before submitting: ${managerNames}`);
      return;
    }

    setSaving(true);
    try {
      console.log('Starting draft commit process...');
      
      for (const manager of managers) {
        const teamId = teamAssignments[manager.id];
        if (!teamId) {
          console.error(`No team assigned for manager: ${manager.name}`);
          continue;
        }

        console.log(`Processing manager: ${manager.name}, team: ${teamId}`);
        
        // Update players
        for (const pick of manager.picks) {
          console.log(`Updating player ${pick.playerName} to team ${teamId}`);
          const response = await fetch(`/api/players/${pick.playerId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              team_id: teamId
            })
          });

          if (!response.ok) {
            throw new Error(`Failed to update player ${pick.playerName}`);
          }
        }

        // Update volunteer assignments
        if (manager.volunteers.manager) {
          await fetch(`/api/volunteers/${manager.volunteers.manager.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              team_id: teamId,
              role: 'Manager'
            })
          });
        }

        if (manager.volunteers.teamParent) {
          await fetch(`/api/volunteers/${manager.volunteers.teamParent.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              team_id: teamId,
              role: 'Team Parent'
            })
          });
        }

        for (const coach of manager.volunteers.assistantCoaches) {
          await fetch(`/api/volunteers/${coach.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              team_id: teamId,
              role: 'Assistant Coach'
            })
          });
        }

        // Update team with manager information
        await fetch(`/api/teams/${teamId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            manager_name: manager.name,
            volunteer_manager_id: manager.volunteers.manager?.id || null
          })
        });
      }

      console.log('Draft commit completed successfully');
      setDraftCommitted(true);
        setDraftCommitted(true);
        alert('Draft committed successfully! All players and volunteers have been assigned to teams.');
      
      if (onDraftComplete) {
        onDraftComplete();
      }
      
    } catch (error) {
      console.error('Error committing draft:', error);
      alert(`Error committing draft: ${error.message}. Please try again.`);
    } finally {
      setSaving(false);
    }
  };

  const cancelDraft = () => {
    if (window.confirm('Are you sure you want to cancel the draft? All progress will be lost.')) {
      setDraftStarted(false);
      setCurrentRound(1);
      setShowTeamAssignments(false);
      setDraftPicks([]);
      setDraftCommitted(false);
      setDraftBoard([]);
      
      const playersWithNumbers = draftData.players.map((player, index) => ({
        ...player,
        draftNumber: index + 1
      }));
      setAvailablePlayers(playersWithNumbers);
      
      const resetManagers = managers.map(manager => ({
        ...manager,
        picks: [],
        volunteers: {
          manager: null,
          assistantCoaches: [],
          teamParent: null
        }
      }));
      setManagers(resetManagers);
      
      if (onDraftComplete) {
        onDraftComplete();
      }
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      'Manager': 'bg-blue-100 text-blue-800 border border-blue-200',
      'Coach': 'bg-green-100 text-green-800 border border-green-200',
      'Assistant Coach': 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      'Team Parent': 'bg-purple-100 text-purple-800 border border-purple-200',
      'Parent': 'bg-gray-100 text-gray-800 border border-gray-200'
    };
    return colors[role] || 'bg-gray-100 text-gray-800 border border-gray-200';
  };

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

  if (!draftData || !draftData.players) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
        <UsersIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-800 mb-2">No Draft Data</h3>
        <p className="text-gray-600">Unable to load draft data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Volunteer Assignment Modal */}
      <VolunteerAssignmentModal
        isOpen={showVolunteerModal}
        onClose={() => {
          setShowVolunteerModal(false);
          setCurrentPlayerWithVolunteers(null);
        }}
        player={currentPlayerWithVolunteers?.player}
        managerId={currentPlayerWithVolunteers?.managerId}
        onAssign={handleVolunteerAssignment}
      />

      {/* Volunteer Reassignment Modal */}
      <VolunteerReassignmentModal
        isOpen={showVolunteerReassignmentModal}
        onClose={() => {
          setShowVolunteerReassignmentModal(false);
          setPendingPlayerMove(null);
        }}
        player={pendingPlayerMove?.player}
        fromManagerId={pendingPlayerMove?.fromManagerId}
        toManagerId={pendingPlayerMove?.toManagerId}
        onReassign={handleVolunteerReassignment}
      />

      {/* Setup Phase - Before Draft Starts */}
      {!draftStarted && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Draft Setup</h2>
          
          {/* Managers Setup */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Managers</h3>
              <button
                onClick={addManager}
                className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Manager
              </button>
            </div>
            
            <div className="space-y-3">
              {managers.map((manager, index) => (
                <div key={manager.id} className="flex items-center space-x-4 p-3 border border-gray-200 rounded-lg">
                  <input
                    type="text"
                    placeholder="Manager Name"
                    value={manager.name}
                    onChange={(e) => updateManager(index, 'name', e.target.value)}
                    className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {managers.length > 1 && (
                    <button
                      onClick={() => removeManager(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Available Teams Info */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Available Teams</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {draftData.teams && draftData.teams.length > 0 ? (
                draftData.teams.map(team => (
                  <div key={team.id} className="border border-gray-200 rounded-lg p-3 text-center">
                    <div className="font-medium text-gray-900">{team.name} - {team.color}</div>
                  </div>
                ))
              ) : (
                <div className="col-span-full text-center py-4 text-gray-500">
                  No teams available for this division
                </div>
              )}
            </div>
          </div>

          {/* Start Draft Button */}
          <div className="flex justify-center">
            <button
              onClick={startDraft}
              disabled={managers.length === 0}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              <Trophy className="h-5 w-5 mr-2" />
              Start Draft
            </button>
          </div>
        </div>
      )}

      {/* Draft Phase - Table Layout */}
      {draftStarted && (!draftComplete || !showTeamAssignments) && (
        <div className="space-y-6">
          {/* Draft Complete (review/edit) banner + navigation */}
          {(draftComplete || allPlayersDrafted) && !showTeamAssignments && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <Trophy className="h-8 w-8 text-green-500 mr-3" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-800">Draft Complete! 🎉</h3>
                    <p className="text-green-700">
                      All players have been drafted. You can still go back and edit (move/remove players),
                      then proceed when you’re ready.
                    </p>
                  </div>
                </div>

                <button
                  onClick={proceedToTeamAssignments}
                  className="inline-flex items-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  <Save className="h-5 w-5 mr-2" />
                  Proceed to Team Assignments
                </button>
              </div>
            </div>
          )}
          {/* Draft Status */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Draft Board - Round {currentRound}</h2>
              <div className="text-sm text-gray-600">
                {availablePlayers.length} players remaining • {draftedCount} players drafted
              </div>
            </div>

            {/* Draft Order Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="text-lg font-semibold text-blue-900 mb-2">Current Round Order</h3>
              <div className="flex space-x-4 overflow-x-auto">
                {getRoundOrder(currentRound).map((managerId, index) => {
                  const manager = managers.find(m => m.id === managerId);
                  const hasPicked = draftBoard[currentRound - 1]?.picks[managerId];
                  return (
                    <div
                      key={managerId}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg ${
                        hasPicked ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      <div className="font-medium">
                        {index + 1}. {manager.name}
                      </div>
                      <div className="text-sm">
                        {hasPicked ? '✓ Picked' : 'Waiting...'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Draft Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-3 font-semibold text-gray-900">Round</th>
                    {managers.map(manager => (
                      <th key={manager.id} className="border border-gray-300 px-4 py-3 font-semibold text-gray-900">
                        <div>{manager.name}</div>
                        <div className="text-sm font-normal text-gray-600">
                          {manager.picks.length} players
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draftBoard.slice(0, currentRound).map((roundData, roundIndex) => (
                    <tr key={roundData.round} className={roundData.round === currentRound ? 'bg-blue-50' : ''}>
                      <td className="border border-gray-300 px-4 py-3 text-center font-medium">
                        Round {roundData.round}
                      </td>
                      {managers.map(manager => {
                        const pick = roundData.picks[manager.id];
                        return (
                          <td key={manager.id} className="border border-gray-300 px-4 py-3">
                            {pick ? (
                              <div className="text-center">
                                <div className="font-semibold">
                                  #{pick.player.draftNumber} - {pick.player.first_name} {pick.player.last_name}
                                </div>
                                {pick.siblings.length > 0 && (
                                  <div className="text-xs text-purple-600 mt-1">
                                    + {pick.siblings.length} sibling(s) auto-drafted
                                  </div>
                                )}
                              </div>
                            ) : roundData.round === currentRound ? (
                              <div className="space-y-2">
                                <input
                                  type="number"
                                  placeholder="Enter player #"
                                  value={pickInputs[manager.id] || ''}
                                  onChange={(e) => setPickInputs({
                                    ...pickInputs,
                                    [manager.id]: e.target.value
                                  })}
                                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                  min="1"
                                  max={draftData.players.length}
                                />
                                {pickInputs[manager.id] && (
                                  <div className="text-xs bg-gray-50 p-2 rounded border">
                                    <div className="font-medium text-gray-900">
                                      {getPlayerPreview(pickInputs[manager.id]).name}
                                    </div>
                                    <div className="text-gray-600 mt-1">
                                      {getPlayerPreview(pickInputs[manager.id]).details}
                                      {getPlayerPreview(pickInputs[manager.id]).travelPlayer && (
                                        <span className="ml-2 bg-yellow-100 text-yellow-800 px-1 rounded text-xs">
                                          Travel
                                        </span>
                                      )}
                                    </div>
                                    {getPlayerPreview(pickInputs[manager.id]).hasVolunteers && (
                                      <div className="mt-2">
                                        <div className="text-xs font-medium text-gray-700 mb-1">Parent Volunteers:</div>
                                        {getPlayerPreview(pickInputs[manager.id]).volunteers.map((volunteer, idx) => {
                                          const interestedRoles = getVolunteerInterestedRoles(volunteer);
                                          return (
                                            <div key={idx} className="text-xs text-gray-600 flex items-center">
                                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded mr-1 ${getRoleColor(volunteer.derived_role || volunteer.role)}`}>
                                                {getVolunteerBadgeText(volunteer)}
                                              </span>
                                              {volunteer.name}
                                              {interestedRoles.length > 0 && (
                                                <span className="text-blue-500 ml-1">
                                                  ({interestedRoles.join(', ')})
                                                </span>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <button
                                  onClick={() => handlePickEntry(manager.id, pickInputs[manager.id])}
                                  disabled={!pickInputs[manager.id]}
                                  className="w-full bg-blue-600 text-white rounded px-2 py-1 text-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                >
                                  Draft Player
                                </button>
                              </div>
                            ) : (
                              <div className="text-center text-gray-400">-</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Available Players Quick Reference */}
            <div className="mt-6">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Available Players Quick Reference</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-60 overflow-y-auto">
                {availablePlayers.map(player => {
                  const status = getPlayerStatus(player);
                  const hasVolunteers = playerHasEligibleVolunteers(player);
                  
                  return (
                    <div
                      key={player.id}
                      className="border border-gray-200 rounded p-2 text-sm hover:bg-gray-50"
                    >
                      <div className="font-medium">#{player.draftNumber}</div>
                      <div className="font-semibold">{player.first_name} {player.last_name}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        <div className="flex items-center justify-between">
                          <span className={`px-1 rounded ${
                            status === 'Returning' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {status}
                          </span>
                          {player.is_travel_player && (
                            <span className="bg-yellow-100 text-yellow-800 px-1 rounded">
                              Travel
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          Age: {calculateAge(player.birth_date)} | {player.gender}
                        </div>
                        {hasVolunteers && (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-gray-700">Parent Volunteers:</div>
                            {player.volunteers.map((volunteer, index) => {
                              const interestedRoles = getVolunteerInterestedRoles(volunteer);
                              return (
                                <div key={index} className="text-xs text-gray-600 flex items-center">
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded mr-1 ${getRoleColor(volunteer.derived_role || volunteer.role)}`}>
                                    {getVolunteerBadgeText(volunteer)}
                                  </span>
                                  {volunteer.name}
                                  {interestedRoles.length > 0 && (
                                    <span className="text-blue-500 ml-1">
                                      ({interestedRoles.join(', ')})
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cancel Draft Button */}
            <div className="flex justify-center mt-6">
              <button
                onClick={cancelDraft}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel Draft
              </button>
            </div>
          </div>

          {/* Current Team Rosters with Move/Remove Options */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Team Rosters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {managers.map(manager => (
                <div key={manager.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900">{manager.name}</h4>
                    <div className="text-sm text-gray-500">
                      {manager.picks.length} players
                    </div>
                  </div>

                  {/* Volunteers Assigned */}
                  {(manager.volunteers.manager || manager.volunteers.teamParent || manager.volunteers.assistantCoaches.length > 0) && (
                    <div className="mb-3 p-2 bg-gray-50 rounded">
                      <div className="text-xs font-medium text-gray-700 mb-1">Volunteers:</div>
                      {manager.volunteers.manager && (
                        <div className="text-xs">Manager: {manager.volunteers.manager.name}</div>
                      )}
                      {manager.volunteers.teamParent && (
                        <div className="text-xs">Team Parent: {manager.volunteers.teamParent.name}</div>
                      )}
                      {manager.volunteers.assistantCoaches.map((coach, index) => (
                        <div key={index} className="text-xs">Asst Coach: {coach.name}</div>
                      ))}
                    </div>
                  )}

                  {/* Players List with Move/Remove Options */}
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {manager.picks.map((pick, index) => {
                      const player = pick.playerData || draftData.players.find(p => p.draftNumber === pick.playerNumber);
                      const status = player ? getPlayerStatus(player) : 'Unknown';
                      const hasVolunteers = player?.volunteers && player.volunteers.length > 0;
                      
                      return (
                        <div key={index} className="flex items-center justify-between text-sm border-l-2 border-blue-500 pl-2 py-1">
                          <div className="flex-1">
                            <div className="text-gray-600">
                              #{pick.playerNumber} - {pick.playerName}
                              {pick.isSiblingPick && (
                                <span className="ml-1 text-xs text-purple-600" title="Auto-drafted sibling">👥</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center space-x-2 mt-1">
                              <span className={`px-1 rounded ${
                                status === 'Returning' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {status}
                              </span>
                              {player?.is_travel_player && (
                                <span className="bg-yellow-100 text-yellow-800 px-1 rounded">
                                  Travel
                                </span>
                              )}
                            </div>
                            {hasVolunteers && (
                              <div className="mt-1">
                                <div className="text-xs font-medium text-gray-700">Parent Volunteers:</div>
                                {player.volunteers.map((volunteer, idx) => {
                                  const interestedRoles = getVolunteerInterestedRoles(volunteer);
                                  return (
                                    <div key={idx} className="text-xs text-gray-600 flex items-center">
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded mr-1 ${getRoleColor(volunteer.derived_role || volunteer.role)}`}>
                                        {getVolunteerBadgeText(volunteer)}
                                      </span>
                                      {volunteer.name}
                                      {interestedRoles.length > 0 && (
                                        <span className="text-blue-500 ml-1">
                                          ({interestedRoles.join(', ')})
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex space-x-1 ml-2">
                            {/* Move to other teams */}
                            <select
                              className="text-xs border border-gray-300 rounded px-1 py-0.5"
                              onChange={(e) => {
                                if (e.target.value) {
                                  movePlayer(manager.id, e.target.value, pick.playerNumber);
                                  e.target.value = ''; // Reset the select
                                }
                              }}
                              defaultValue=""
                            >
                              <option value="">Move to...</option>
                              {managers
                                .filter(m => m.id !== manager.id)
                                .map(otherManager => (
                                  <option key={otherManager.id} value={otherManager.id}>
                                    {otherManager.name}
                                  </option>
                                ))
                              }
                            </select>
                            {/* Remove from team */}
                            <button
                              onClick={() => removePlayerFromTeam(manager.id, pick.playerNumber)}
                              className="text-xs text-red-600 hover:text-red-800 p-1"
                              title="Remove player from team"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {manager.picks.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-2">No players drafted yet</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Draft Results - After Draft Complete */}
      {(draftComplete || allPlayersDrafted) && showTeamAssignments && (
        <div className="space-y-6">
          {/* Success Banner */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center">
              <Trophy className="h-8 w-8 text-green-500 mr-3" />
              <div>
                <h3 className="text-lg font-semibold text-green-800">Draft Complete! 🎉</h3>
                <p className="text-green-700">
                  All players have been drafted. Now assign each manager to their team.
                </p>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={backToDraftBoard}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <Undo className="h-4 w-4 mr-2" />
                Back to Draft Board
              </button>
            </div>
          </div>

          {/* Team Assignments */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Assign Teams to Managers</h2>
            <p className="text-gray-600 mb-4">Now that the draft is complete, assign each manager to a team.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {managers.map(manager => {
                const assignedTeamId = teamAssignments[manager.id];
                const assignedTeam = draftData.teams.find(t => t.id === assignedTeamId);
                
                return (
                  <div key={manager.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="mb-3">
                      <h3 className="font-semibold text-gray-900 text-lg">{manager.name}</h3>
                      <div className="text-sm text-gray-600">
                        Drafted {manager.picks.length} players
                      </div>
                    </div>
                    
                    <select
                      value={assignedTeamId || ''}
                      onChange={(e) => assignTeamToManager(manager.id, e.target.value)}
                      className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select Team...</option>
                      {draftData.teams.map(team => (
                        <option key={team.id} value={team.id}>{team.name} - {team.color}</option>
                      ))}
                    </select>
                    
                    {assignedTeam && (
                      <div className="text-sm text-green-600 mt-2">
                        ✓ Assigned to: {assignedTeam.name}
                      </div>
                    )}
                    
                    <div className="mt-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">Drafted Players:</div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {manager.picks.map((pick, index) => {
                          const player = pick.playerData || draftData.players.find(p => p.draftNumber === pick.playerNumber);
                          const status = player ? getPlayerStatus(player) : 'Unknown';
                          
                          return (
                            <div key={index} className="text-xs text-gray-600 border-l-2 border-blue-500 pl-2 py-1">
                              <div>#{pick.playerNumber} - {pick.playerName}</div>
                              <div className="flex items-center space-x-2 mt-1">
                                <span className={`px-1 rounded ${
                                  status === 'Returning' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {status}
                                </span>
                                {player?.is_travel_player && (
                                  <span className="bg-yellow-100 text-yellow-800 px-1 rounded">
                                    Travel
                                  </span>
                                )}
                                {pick.isSiblingPick && (
                                  <span className="text-purple-600" title="Auto-drafted sibling">👥</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Commit Draft Button */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Commit Draft Results</h3>
                <p className="text-sm text-gray-600">
                  Save all team assignments, player placements, and volunteer assignments to the database
                </p>
                {Object.keys(teamAssignments).length !== managers.length && (
                  <p className="text-sm text-red-600 mt-2">
                    Please assign a team to every manager before committing.
                    {managers.length - Object.keys(teamAssignments).length} manager(s) still need team assignments.
                  </p>
                )}
              </div>
              <button
                onClick={commitDraft}
                disabled={saving || Object.keys(teamAssignments).length !== managers.length}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Save className="h-5 w-5 mr-2" />
                {saving ? 'Saving...' : 'Submit Draft & Save All Assignments'}
              </button>
            </div>
          </div>


          {/* Send Roster Emails */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Send Roster Emails</h3>
            <p className="text-sm text-gray-600 mb-4">
              Choose who to email. Emails are only available after you commit/save the draft.
            </p>

            <div className="space-y-2 mb-4">
              <label className="flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={sendManagersEmail}
                  onChange={(e) => setSendManagersEmail(e.target.checked)}
                />
                <span>Managers</span>
              </label>

              <label className="flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={sendPlayerAgentEmail}
                  onChange={(e) => setSendPlayerAgentEmail(e.target.checked)}
                />
                <span>Player Agent</span>
              </label>
            </div>

            <button
              onClick={sendRosterEmails}
              disabled={emailBusy || !draftCommitted || (!sendManagersEmail && !sendPlayerAgentEmail)}
              className={`inline-flex items-center px-4 py-2 rounded-md text-white text-sm font-medium ${
                (emailBusy || !draftCommitted || (!sendManagersEmail && !sendPlayerAgentEmail))
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              title={!draftCommitted ? 'Commit the draft first to enable emails' : ''}
            >
              <Mail className="h-4 w-4 mr-2" />
              {emailBusy ? 'Sending...' : 'Send Emails'}
            </button>
          </div>


        </div>
      )}

      {/* Draft Summary */}
      {(draftStarted || draftComplete) && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Draft Summary</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {managers.map(manager => (
              <div key={manager.id} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">{manager.name}</h3>
                <div className="text-sm text-gray-600">
                  Players: {manager.picks.length}
                </div>
                {teamAssignments[manager.id] && (
                  <div className="text-sm text-green-600 font-medium">
                    Team: {draftData.teams.find(t => t.id === teamAssignments[manager.id])?.name}
                  </div>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  Picks: {manager.picks.map(p => p.playerNumber).join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftGrid;