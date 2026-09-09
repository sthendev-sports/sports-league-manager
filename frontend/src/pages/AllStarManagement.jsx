import React, { useState, useEffect, useMemo } from 'react';
import { 
  Trophy, Users, UserPlus, Settings, Mail, 
  Plus, Edit, Trash2, Save, X, Search, Filter,
  Download, Calendar, User, Phone, Mail as MailIcon,
  CheckCircle, XCircle, AlertCircle, RefreshCw,
  ArrowRight, ChevronDown, ChevronRight, Star,
  ClipboardCheck, DollarSign
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../services/api';
import { getLeagueAgeDisplay, getLeagueAgeValue, determineSportFromDivision, getAvailableAgeGroups } from '../utils/ageCalculator';

const AllStarManagement = () => {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Season creation state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSeason, setNewSeason] = useState({
    name: '',
    year: new Date().getFullYear().toString(),
    source_season_id: '',
    import_option: 'empty',
    shifts_required: 2
  });
  const [regularSeasons, setRegularSeasons] = useState([]);

  // Team management state
  const [teams, setTeams] = useState([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({
    sport: 'baseball',
    age_group: '10U',
    manager_id: ''
  });
  const [managers, setManagers] = useState([]);

  // Player import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [sourcePlayers, setSourcePlayers] = useState([]);
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [importFilters, setImportFilters] = useState({
    sport: 'all',
    league_age: 'all',
    division_id: '',
    travel: 'all',
    search: ''
  });
  const [divisions, setDivisions] = useState([]);
  const [importLoading, setImportLoading] = useState(false);

  // Player assignment state
  const [players, setPlayers] = useState([]);
  const [unassignedPlayers, setUnassignedPlayers] = useState([]);

  // Player details state
  const [playerDetails, setPlayerDetails] = useState([]);
  const [detailsFilters, setDetailsFilters] = useState({
    team_id: '',
    sport: 'all',
    age_group: 'all',
    search: ''
  });

  // Workbond modal state
  const [showWorkbondModal, setShowWorkbondModal] = useState(false);
  const [workbondPlayer, setWorkbondPlayer] = useState(null);
  const [workbondDetails, setWorkbondDetails] = useState({
    check_number: '',
    amount: '',
    notes: '',
    date_received: new Date().toISOString().split('T')[0]
  });

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentPlayer, setPaymentPlayer] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
    payment_method: 'cash'
  });

  // Send Roster modal state
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [sendingRosters, setSendingRosters] = useState(false);

  // Uniform sizes
  const uniformSizes = [
    'Youth X-Small',
    'Youth Small',
    'Youth Medium',
    'Youth Large',
    'Youth X-Large',
    'Adult Small',
    'Adult Medium',
    'Adult Large',
    'Adult X-Large'
  ];
  const pantSizes = [
    'Youth X-Small',
    'Youth Small',
    'Youth Medium',
    'Youth Large',
    'Youth X-Large',
    'Adult Small',
    'Adult Medium',
    'Adult Large',
    'Adult X-Large'
  ];

  // Stats
  const [stats, setStats] = useState({
    teams: 0,
    players: 0,
    volunteers: 0,
    unassigned: 0
  });

  // ============================================
  // Load Data
  // ============================================

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeasonId) {
      loadSeasonData();
      loadTeams();
      loadPlayers();
      loadManagers();
      loadStats();
    }
  }, [selectedSeasonId]);

  // Load divisions when import tab is opened
  useEffect(() => {
    if (activeTab === 'import' && selectedSeasonId) {
      loadSourceDivisions();
    }
  }, [activeTab, selectedSeasonId]);

  const loadSeasons = async () => {
    try {
      setLoading(true);
      
      const allStarRes = await api.get('/all-stars/seasons');
      setSeasons(allStarRes.data || []);
      
      const regularRes = await api.get('/seasons');
      setRegularSeasons((regularRes.data || []).filter(s => s.season_type === 'regular' || !s.season_type));
      
      if (allStarRes.data && allStarRes.data.length > 0) {
        setSelectedSeasonId(allStarRes.data[0].id);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
      setError('Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  const loadSeasonData = async () => {
    try {
      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}`);
      setSelectedSeason(res.data);
    } catch (error) {
      console.error('Error loading season data:', error);
    }
  };

  const loadTeams = async () => {
    try {
      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}/teams`);
      setTeams(res.data || []);
    } catch (error) {
      console.error('Error loading teams:', error);
    }
  };

  const loadPlayers = async () => {
    try {
      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}/players`);
      const playersData = res.data || [];
      setPlayers(playersData);
      setUnassignedPlayers(playersData.filter(p => !p.team_id));
      setPlayerDetails(playersData.filter(p => p.team_id));
    } catch (error) {
      console.error('Error loading players:', error);
    }
  };

  const loadManagers = async () => {
    try {
      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}/managers`);
      setManagers(res.data || []);
    } catch (error) {
      console.error('Error loading managers:', error);
    }
  };

  const loadStats = async () => {
    try {
      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}/summary`);
      setStats(res.data || { teams: 0, players: 0, volunteers: 0, unassigned: 0 });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const loadSourceDivisions = async () => {
    try {
      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}/source-divisions`);
      setDivisions(res.data || []);
    } catch (error) {
      console.error('Error loading source divisions:', error);
    }
  };

  const loadSourcePlayers = async () => {
    try {
      setImportLoading(true);
      
      await loadSourceDivisions();
      
      const params = new URLSearchParams();
      if (importFilters.sport && importFilters.sport !== 'all') params.append('sport', importFilters.sport);
      if (importFilters.league_age && importFilters.league_age !== 'all') params.append('league_age', importFilters.league_age);
      if (importFilters.division_id) params.append('division_id', importFilters.division_id);
      if (importFilters.travel && importFilters.travel !== 'all') params.append('travel', importFilters.travel);
      if (importFilters.search) params.append('search', importFilters.search);

      const res = await api.get(`/all-stars/seasons/${selectedSeasonId}/source-players?${params}`);
      setSourcePlayers(res.data || []);
      setSelectedPlayers([]);
    } catch (error) {
      console.error('Error loading source players:', error);
      setError('Failed to load source players');
    } finally {
      setImportLoading(false);
    }
  };

  // ============================================
  // Season Creation
  // ============================================

  const handleCreateSeason = async () => {
    try {
      setLoading(true);
      const res = await api.post('/all-stars/seasons', newSeason);
      
      await loadSeasons();
      setSelectedSeasonId(res.data.season.id);
      setShowCreateModal(false);
      setNewSeason({
        name: '',
        year: new Date().getFullYear().toString(),
        source_season_id: '',
        import_option: 'empty',
        shifts_required: 2
      });
    } catch (error) {
      console.error('Error creating season:', error);
      setError(error.response?.data?.error || 'Failed to create season');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Team Management
  // ============================================

  const handleCreateTeam = async () => {
    try {
      setLoading(true);
      const res = await api.post(`/all-stars/seasons/${selectedSeasonId}/teams`, teamForm);
      
      await loadTeams();
      setShowTeamModal(false);
      setTeamForm({ sport: 'baseball', age_group: '10U', manager_id: '' });
    } catch (error) {
      console.error('Error creating team:', error);
      setError(error.response?.data?.error || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId) => {
    if (!window.confirm('Are you sure you want to delete this team?')) return;
    
    try {
      await api.delete(`/all-stars/teams/${teamId}`);
      await loadTeams();
    } catch (error) {
      console.error('Error deleting team:', error);
      setError(error.response?.data?.error || 'Failed to delete team');
    }
  };

  // ============================================
  // Player Import
  // ============================================

  const handleImportPlayers = async () => {
    if (selectedPlayers.length === 0) {
      alert('Please select at least one player to import');
      return;
    }

    try {
      setLoading(true);
      const res = await api.post(`/all-stars/seasons/${selectedSeasonId}/import-players`, {
        player_ids: selectedPlayers
      });
      
      await loadPlayers();
      await loadStats();
      setShowImportModal(false);
      setSelectedPlayers([]);
      
      const msg = `Imported ${res.data.imported_count || 0} new players, updated ${res.data.updated_count || 0} existing players`;
      alert(msg);
    } catch (error) {
      console.error('Error importing players:', error);
      setError(error.response?.data?.error || 'Failed to import players');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // Player Removal
  // ============================================

  const handleRemovePlayerFromSeason = async (playerId) => {
    if (!window.confirm('Remove this player from the All-Star season entirely? This will delete their All-Star record.')) return;
    
    try {
      await api.delete(`/all-stars/remove/${playerId}`);
      await loadPlayers();
      await loadStats();
      alert('Player removed from All-Star season');
    } catch (error) {
      console.error('Error removing player:', error);
      setError(error.response?.data?.error || 'Failed to remove player');
    }
  };

  const toggleSelectAll = () => {
    if (selectedPlayers.length === sourcePlayers.length) {
      setSelectedPlayers([]);
    } else {
      setSelectedPlayers(sourcePlayers.map(p => p.id));
    }
  };

  const toggleSelectPlayer = (playerId) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  // ============================================
  // Player Assignment
  // ============================================

  const handleAssignPlayer = async (playerId, teamId) => {
    try {
      const res = await api.post(`/all-stars/seasons/${selectedSeasonId}/assign`, {
        player_id: playerId,
        team_id: teamId
      });
      await loadPlayers();
      await loadStats();
    } catch (error) {
      console.error('Error assigning player:', error);
      setError(error.response?.data?.error || 'Failed to assign player');
    }
  };

  const handleRemovePlayer = async (playerId) => {
    if (!window.confirm('Remove this player from their team?')) return;
    
    try {
      await api.delete(`/all-stars/assign/${playerId}`);
      await loadPlayers();
      await loadStats();
    } catch (error) {
      console.error('Error removing player:', error);
      setError(error.response?.data?.error || 'Failed to remove player');
    }
  };

  // ============================================
  // Player Details Update
  // ============================================

  const handleUpdatePlayer = async (playerId, updates) => {
    try {
      const res = await api.put(`/all-stars/players/${playerId}`, updates);
      
      if (res.data.siblings_updated && res.data.siblings_updated.length > 0) {
        const siblingNames = res.data.siblings_updated.map(s => s.name).join(', ');
        alert(`Workbond check synced with siblings: ${siblingNames}`);
      }
      
      await loadPlayers();
      return res;
    } catch (error) {
      console.error('Error updating player:', error);
      setError(error.response?.data?.error || 'Failed to update player');
      throw error;
    }
  };

  // ============================================
  // Workbond Modal Functions
  // ============================================

  const getWorkbondStatusDisplay = (player) => {
    if (player.is_board_member || player.has_exempt_volunteer) {
      return { status: 'exempt', label: 'Exempt', className: 'bg-gray-100 text-gray-800' };
    }
    
    const status = player.workbond_check_status || 'not_received';
    if (status === 'received') {
      return { status: 'received', label: 'Received', className: 'bg-green-100 text-green-800' };
    }
    return { status: 'not_received', label: 'Not Received', className: 'bg-yellow-100 text-yellow-800' };
  };

  const openWorkbondModal = (player) => {
    if (player.is_board_member || player.has_exempt_volunteer) {
      alert('This player is exempt from workbond requirements (Board Member or Volunteer role).');
      return;
    }
    
    setWorkbondPlayer(player);
    
    const existingDetails = player.workbond_check_details || {};
    
    setWorkbondDetails({
      check_number: existingDetails.check_number || '',
      amount: existingDetails.amount || '',
      notes: existingDetails.notes || '',
      date_received: existingDetails.date_received || new Date().toISOString().split('T')[0]
    });
    
    setShowWorkbondModal(true);
  };

  const handleWorkbondSubmit = async () => {
    if (!workbondPlayer) return;
    
    try {
      const updateData = {
        workbond_check_status: 'received',
        workbond_check_details: workbondDetails
      };
      
      await handleUpdatePlayer(workbondPlayer.id, updateData);
      
      setShowWorkbondModal(false);
      setWorkbondPlayer(null);
      alert('Workbond check updated successfully');
    } catch (error) {
      console.error('Error updating workbond:', error);
      alert('Failed to update workbond status');
    }
  };

  // ============================================
  // Payment Modal Functions
  // ============================================

  const getPaymentStatusDisplay = (player) => {
    const status = player.all_star_payment_status || 'not_received';
    if (status === 'received') {
      return { status: 'received', label: 'Received', className: 'bg-green-100 text-green-800' };
    }
    return { status: 'not_received', label: 'Not Received', className: 'bg-yellow-100 text-yellow-800' };
  };

  const openPaymentModal = (player) => {
    setPaymentPlayer(player);
    
    const existingDetails = player.all_star_payment_details || {};
    
    setPaymentDetails({
      amount: existingDetails.amount || '',
      payment_date: existingDetails.payment_date || new Date().toISOString().split('T')[0],
      notes: existingDetails.notes || '',
      payment_method: existingDetails.payment_method || 'cash'
    });
    
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentPlayer) return;
    
    try {
      const updateData = {
        all_star_payment_status: 'received',
        all_star_payment_details: paymentDetails
      };
      
      await handleUpdatePlayer(paymentPlayer.id, updateData);
      
      setShowPaymentModal(false);
      setPaymentPlayer(null);
      alert('Payment updated successfully');
    } catch (error) {
      console.error('Error updating payment:', error);
      alert('Failed to update payment status');
    }
  };

  // ============================================
  // Roster Email Functions (NEW)
  // ============================================

  const openRosterModal = () => {
    // Pre-select all teams by default
    setSelectedTeamIds(teams.map(t => t.id));
    setShowRosterModal(true);
  };

  const toggleTeamSelection = (teamId) => {
    setSelectedTeamIds(prev => {
      if (prev.includes(teamId)) {
        return prev.filter(id => id !== teamId);
      } else {
        return [...prev, teamId];
      }
    });
  };

  const toggleAllTeams = () => {
    if (selectedTeamIds.length === teams.length) {
      setSelectedTeamIds([]);
    } else {
      setSelectedTeamIds(teams.map(t => t.id));
    }
  };

  const handleSendRosters = async () => {
  if (selectedTeamIds.length === 0) {
    alert('Please select at least one team to send rosters to.');
    return;
  }

  try {
    setSendingRosters(true);
    
    let sentCount = 0;
    let errors = [];
    
    // If all teams are selected, use the bulk endpoint (sends all at once)
    if (selectedTeamIds.length === teams.length) {
      try {
        const res = await api.post(`/all-stars/seasons/${selectedSeasonId}/send-rosters`);
        sentCount = res.data.sent_count || teams.length;
      } catch (error) {
        console.error('Error sending all rosters:', error);
        errors.push({ error: error.message });
      }
    } else {
      // Send to each selected team individually
      for (const teamId of selectedTeamIds) {
        try {
          const res = await api.post(`/all-stars/seasons/${selectedSeasonId}/send-rosters`, { team_id: teamId });
          sentCount++;
        } catch (teamError) {
          const team = teams.find(t => t.id === teamId);
          errors.push({ team: team?.name || teamId, error: teamError.message });
        }
      }
    }

    setShowRosterModal(false);
    setSelectedTeamIds([]);
    
    if (errors.length > 0) {
      alert(`Sent ${sentCount} roster emails with ${errors.length} errors. Check console for details.`);
    } else {
      alert(`Sent ${sentCount} roster emails successfully!`);
    }
  } catch (error) {
    console.error('Error sending rosters:', error);
    alert(error.response?.data?.error || 'Failed to send roster emails');
  } finally {
    setSendingRosters(false);
  }
};

  // ============================================
  // Render: Tabs
  // ============================================

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: Trophy },
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'import', label: 'Import Players', icon: UserPlus },
    { id: 'assign', label: 'Assign Players', icon: ArrowRight },
    { id: 'details', label: 'Player Details', icon: MailIcon }
  ];

  // ============================================
  // Render: Dashboard Tab (UPDATED - Send Rosters button added)
  // ============================================

  const renderDashboard = () => (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Teams</p>
              <p className="text-2xl font-semibold">{stats.teams}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-full">
              <Trophy className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Players Assigned</p>
              <p className="text-2xl font-semibold">{stats.players}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-full">
              <User className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Volunteers</p>
              <p className="text-2xl font-semibold">{stats.volunteers}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-100 rounded-full">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-500">Unassigned Players</p>
              <p className="text-2xl font-semibold">{stats.unassigned}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <button
            onClick={() => setActiveTab('import')}
            className="flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Import Players
          </button>
          <button
            onClick={() => setActiveTab('teams')}
            className="flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
          >
            <Users className="h-4 w-4 mr-2" />
            Manage Teams
          </button>
          <button
            onClick={() => setActiveTab('assign')}
            className="flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Assign Players
          </button>
          <button
            onClick={() => setActiveTab('details')}
            className="flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
          >
            <MailIcon className="h-4 w-4 mr-2" />
            Player Details
          </button>
          <button
            onClick={openRosterModal}
            className="flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
          >
            <Mail className="h-4 w-4 mr-2" />
            Send Rosters
          </button>
          <button
            onClick={() => window.location.href = '/workbond-management'}
            className="flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700"
          >
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Workbond
          </button>
        </div>
      </div>
    </div>
  );

  // ============================================
  // Render: Teams Tab
  // ============================================

  const renderTeams = () => (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-medium text-gray-900">All-Star Teams</h2>
        <button
          onClick={() => setShowTeamModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Create Team
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No All-Star Teams</h3>
          <p className="text-gray-500">Create your first All-Star team to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map(team => (
            <div key={team.id} className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{team.name}</h3>
                  <p className="text-sm text-gray-600">
                    {team.sport?.charAt(0).toUpperCase() + team.sport?.slice(1)} • {team.age_group}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteTeam(team.id)}
                  className="text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {team.manager_name && (
                <div className="mt-3 text-sm">
                  <span className="text-gray-500">Manager:</span>
                  <span className="ml-2 font-medium text-gray-900">{team.manager_name}</span>
                </div>
              )}
              <div className="mt-3 text-sm">
                <span className="text-gray-500">Players:</span>
                <span className="ml-2 font-medium text-gray-900">{team.players?.length || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ============================================
  // Render: Import Tab
  // ============================================

  const renderImport = () => (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-medium text-gray-900">Import Players from Regular Season</h2>
        <button
          onClick={loadSourcePlayers}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Load Players
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Sport</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={importFilters.sport}
              onChange={(e) => setImportFilters({ ...importFilters, sport: e.target.value })}
            >
              <option value="all">All</option>
              <option value="baseball">Baseball</option>
              <option value="softball">Softball</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">League Age</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={importFilters.league_age}
              onChange={(e) => setImportFilters({ ...importFilters, league_age: e.target.value })}
            >
              <option value="all">All</option>
              {getAvailableAgeGroups().map(age => (
                <option key={age} value={age}>{age}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Division</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={importFilters.division_id}
              onChange={(e) => setImportFilters({ ...importFilters, division_id: e.target.value })}
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
            <label className="block text-sm font-medium text-gray-700">Travel</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={importFilters.travel}
              onChange={(e) => setImportFilters({ ...importFilters, travel: e.target.value })}
            >
              <option value="all">All</option>
              <option value="true">Travel</option>
              <option value="false">Non-Travel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Search</label>
            <div className="flex mt-1">
              <input
                type="text"
                className="flex-1 border border-gray-300 rounded-l-md px-3 py-2"
                placeholder="Search players..."
                value={importFilters.search}
                onChange={(e) => setImportFilters({ ...importFilters, search: e.target.value })}
              />
              <button
                onClick={loadSourcePlayers}
                className="px-3 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {importLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : sourcePlayers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No players found. Click "Load Players" to search.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
              <span className="text-sm text-gray-600">
                {sourcePlayers.length} players found
              </span>
              <button
                onClick={toggleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedPlayers.length === sourcePlayers.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <input
                        type="checkbox"
                        checked={selectedPlayers.length === sourcePlayers.length && sourcePlayers.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">League Age</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sport</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Division</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Travel</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shirt Size</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pant Size</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sourcePlayers.map(player => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedPlayers.includes(player.id)}
                          onChange={() => toggleSelectPlayer(player.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.last_name}, {player.first_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.league_age_display || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.sport?.charAt(0).toUpperCase() + player.sport?.slice(1) || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.division_name || player.program_title || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.is_travel_player ? '✓' : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.uniform_shirt_size || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.uniform_pants_size || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={handleImportPlayers}
                disabled={selectedPlayers.length === 0}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  selectedPlayers.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                Import {selectedPlayers.length} Players
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // ============================================
  // Render: Assign Tab
  // ============================================

  const renderAssign = () => (
    <div>
      <h2 className="text-lg font-medium text-gray-900 mb-6">Assign Players to Teams</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-md font-medium text-gray-900 mb-4">
            Unassigned Players ({unassignedPlayers.length})
          </h3>
          {unassignedPlayers.length === 0 ? (
            <p className="text-gray-500 text-center py-8">All players are assigned</p>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {unassignedPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="font-medium text-gray-900">
                      {player.last_name}, {player.first_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {player.league_age ? `${player.league_age}U` : 'N/A'} • {player.sport || 'N/A'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <select
                      className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAssignPlayer(player.id, e.target.value);
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="">Assign to...</option>
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemovePlayerFromSeason(player.id)}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title="Remove player from All-Star season entirely"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-md font-medium text-gray-900 mb-4">Team Rosters</h3>
          {teams.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No teams created yet</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {teams.map(team => {
                const teamPlayers = players.filter(p => p.team_id === team.id);
                return (
                  <div key={team.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-medium text-gray-900">{team.name}</h4>
                        {team.manager_name && (
                          <p className="text-sm text-gray-500">Manager: {team.manager_name}</p>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">{teamPlayers.length} players</span>
                    </div>
                    {teamPlayers.length === 0 ? (
                      <p className="text-sm text-gray-400">No players assigned</p>
                    ) : (
                      <div className="space-y-1">
                        {teamPlayers.map(p => (
                          <div key={p.id} className="flex justify-between items-center text-sm border-l-2 border-blue-400 pl-2 py-1">
                            <span>{p.last_name}, {p.first_name} {p.league_age ? `(${p.league_age}U)` : ''}</span>
                            <button
                              onClick={() => handleRemovePlayer(p.id)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ============================================
  // Render: Player Details Tab
  // ============================================

  const renderDetails = () => (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-medium text-gray-900">Player Details</h2>
        <div className="flex items-center space-x-4">
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            value={detailsFilters.team_id}
            onChange={(e) => setDetailsFilters({ ...detailsFilters, team_id: e.target.value })}
          >
            <option value="">All Teams</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
          <input
            type="text"
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-48"
            placeholder="Search players..."
            value={detailsFilters.search}
            onChange={(e) => setDetailsFilters({ ...detailsFilters, search: e.target.value })}
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">League Age</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jersey #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shirt Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pant Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Primary Guardian</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Secondary Guardian</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Emails</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phones</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workbond Check</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {playerDetails
                .filter(p => {
                  if (detailsFilters.team_id && p.team_id !== detailsFilters.team_id) return false;
                  if (detailsFilters.search) {
                    const search = detailsFilters.search.toLowerCase();
                    const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
                    if (!fullName.includes(search)) return false;
                  }
                  return true;
                })
                .map(player => {
                  const statusInfo = getWorkbondStatusDisplay(player);
                  const paymentInfo = getPaymentStatusDisplay(player);
                  
                  return (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.last_name}, {player.first_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.team?.name || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {player.league_age ? `${player.league_age}U` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <input
                          type="number"
                          className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm"
                          value={player.all_star_jersey_number || ''}
                          onChange={(e) => {
                            const value = e.target.value ? parseInt(e.target.value) : null;
                            handleUpdatePlayer(player.id, { all_star_jersey_number: value });
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>
                          <select
                            className="w-28 border border-gray-300 rounded-md px-2 py-1 text-sm"
                            value={player.uniform_shirt_size || ''}
                            onChange={(e) => {
                              handleUpdatePlayer(player.id, { uniform_shirt_size: e.target.value || null });
                            }}
                          >
                            <option value="">Select</option>
                            {uniformSizes.map(size => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                          <div className="text-xs text-blue-600 mt-1">
                            {player.source_shirt_size ? `Source Season: ${player.source_shirt_size}` : ''}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div>
                          <select
                            className="w-28 border border-gray-300 rounded-md px-2 py-1 text-sm"
                            value={player.uniform_pants_size || ''}
                            onChange={(e) => {
                              handleUpdatePlayer(player.id, { uniform_pants_size: e.target.value || null });
                            }}
                          >
                            <option value="">Select</option>
                            {pantSizes.map(size => (
                              <option key={size} value={size}>{size}</option>
                            ))}
                          </select>
                          <div className="text-xs text-blue-600 mt-1">
                            {player.source_pants_size ? `Source Season: ${player.source_pants_size}` : ''}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{player.family?.primary_contact_name || 'N/A'}</div>
                        {player.family?.primary_contact_email && (
                          <div className="text-xs text-gray-500">{player.family.primary_contact_email}</div>
                        )}
                        {player.family?.primary_contact_phone && (
                          <div className="text-xs text-gray-500">{player.family.primary_contact_phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">
                          {player.family?.parent2_name || player.family?.parent2_first_name ? 
                            `${player.family.parent2_first_name || ''} ${player.family.parent2_last_name || ''}`.trim() || 'N/A' 
                            : 'N/A'}
                        </div>
                        {player.family?.parent2_email && (
                          <div className="text-xs text-gray-500">{player.family.parent2_email}</div>
                        )}
                        {player.family?.parent2_phone && (
                          <div className="text-xs text-gray-500">{player.family.parent2_phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div>
                          {player.family?.primary_contact_email && <div className="text-xs">{player.family.primary_contact_email}</div>}
                          {player.family?.parent2_email && <div className="text-xs">{player.family.parent2_email}</div>}
                          {!player.family?.primary_contact_email && !player.family?.parent2_email && 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div>
                          {player.family?.primary_contact_phone && <div className="text-xs">{player.family.primary_contact_phone}</div>}
                          {player.family?.parent2_phone && <div className="text-xs">{player.family.parent2_phone}</div>}
                          {!player.family?.primary_contact_phone && !player.family?.parent2_phone && 'N/A'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col items-start">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${paymentInfo.className}`}>
                            {paymentInfo.label}
                          </span>
                          {player.all_star_payment_details?.amount && (
                            <div className="text-xs text-gray-500 mt-1">
                              ${player.all_star_payment_details.amount}
                            </div>
                          )}
                          <button
                            onClick={() => openPaymentModal(player)}
                            className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Change
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-col items-start">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                          {player.workbond_check_details?.check_number && (
                            <div className="text-xs text-gray-500 mt-1">
                              #{player.workbond_check_details.check_number}
                            </div>
                          )}
                          <button
                            onClick={() => openWorkbondModal(player)}
                            className="mt-1 text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Change
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {playerDetails.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                    No assigned players found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ============================================
  // Render: Main
  // ============================================

  if (loading && !selectedSeason && seasons.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4 text-gray-600">Loading All-Star Management...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 flex items-center">
              <Star className="h-6 w-6 mr-2 text-yellow-500" />
              All-Star Management
            </h1>
            <p className="text-gray-600 mt-1">Manage All-Star seasons, teams, and players</p>
          </div>
          <div className="flex items-center space-x-3">
            <select
              className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              <option value="">Select All-Star Season</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.year})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Season
            </button>
          </div>
        </div>
        {selectedSeason && (
          <div className="mt-2 text-sm text-gray-500">
            Source: {selectedSeason.source_season?.name || 'N/A'} • 
            Status: {selectedSeason.is_active ? 'Active' : 'Inactive'}
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      {selectedSeason && (
        <>
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm capitalize flex items-center ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'teams' && renderTeams()}
            {activeTab === 'import' && renderImport()}
            {activeTab === 'assign' && renderAssign()}
            {activeTab === 'details' && renderDetails()}
          </div>
        </>
      )}

      {!selectedSeason && seasons.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Star className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No All-Star Seasons</h3>
          <p className="text-gray-500 mb-4">Create your first All-Star season to get started.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create All-Star Season
          </button>
        </div>
      )}

      {/* Create Season Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create All-Star Season"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowCreateModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateSeason}
              disabled={!newSeason.name || !newSeason.source_season_id}
              className={`px-4 py-2 rounded-md text-white ${
                !newSeason.name || !newSeason.source_season_id
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              Create Season
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Season Name *</label>
            <input
              type="text"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={newSeason.name}
              onChange={(e) => setNewSeason({ ...newSeason, name: e.target.value })}
              placeholder="e.g., 2026 All-Stars"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Year *</label>
            <input
              type="number"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={newSeason.year}
              onChange={(e) => setNewSeason({ ...newSeason, year: e.target.value })}
              placeholder="2026"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Source Season *</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={newSeason.source_season_id}
              onChange={(e) => setNewSeason({ ...newSeason, source_season_id: e.target.value })}
            >
              <option value="">Select source season</option>
              {regularSeasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.year})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Import Option</label>
            <div className="mt-1 space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="empty"
                  checked={newSeason.import_option === 'empty'}
                  onChange={(e) => setNewSeason({ ...newSeason, import_option: e.target.value })}
                  className="mr-2"
                />
                Start empty (import players later)
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="all"
                  checked={newSeason.import_option === 'all'}
                  onChange={(e) => setNewSeason({ ...newSeason, import_option: e.target.value })}
                  className="mr-2"
                />
                Import all active players from source season
              </label>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Workbond Shifts Required</label>
            <input
              type="number"
              min="0"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={newSeason.shifts_required}
              onChange={(e) => setNewSeason({ ...newSeason, shifts_required: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-gray-500 mt-1">Default: 2 shifts</p>
          </div>
        </div>
      </Modal>

      {/* Create Team Modal */}
      <Modal
        isOpen={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        title="Create All-Star Team"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowTeamModal(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateTeam}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create Team
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Sport *</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={teamForm.sport}
              onChange={(e) => setTeamForm({ ...teamForm, sport: e.target.value })}
            >
              <option value="baseball">Baseball</option>
              <option value="softball">Softball</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Age Group *</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={teamForm.age_group}
              onChange={(e) => setTeamForm({ ...teamForm, age_group: e.target.value })}
            >
              {getAvailableAgeGroups().map(age => (
                <option key={age} value={age}>{age}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Manager</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={teamForm.manager_id}
              onChange={(e) => setTeamForm({ ...teamForm, manager_id: e.target.value })}
            >
              <option value="">Select a manager</option>
              {managers.map(manager => (
                <option key={manager.id} value={manager.id}>
                  {manager.name} {manager.role ? `(${manager.role})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Workbond Check Modal */}
      <Modal
        isOpen={showWorkbondModal}
        onClose={() => {
          setShowWorkbondModal(false);
          setWorkbondPlayer(null);
        }}
        title="Workbond Check"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowWorkbondModal(false);
                setWorkbondPlayer(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleWorkbondSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Player</label>
            <div className="mt-1 text-sm text-gray-900">
              {workbondPlayer?.last_name}, {workbondPlayer?.first_name}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Family</label>
            <div className="mt-1 text-sm text-gray-900">
              {workbondPlayer?.family?.primary_contact_name || 'N/A'}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Check Number</label>
            <input
              type="text"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={workbondDetails.check_number}
              onChange={(e) => setWorkbondDetails({ ...workbondDetails, check_number: e.target.value })}
              placeholder="Enter check number"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount</label>
            <input
              type="text"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={workbondDetails.amount}
              onChange={(e) => setWorkbondDetails({ ...workbondDetails, amount: e.target.value })}
              placeholder="$0.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Date Received</label>
            <input
              type="date"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={workbondDetails.date_received}
              onChange={(e) => setWorkbondDetails({ ...workbondDetails, date_received: e.target.value })}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              rows="3"
              value={workbondDetails.notes}
              onChange={(e) => setWorkbondDetails({ ...workbondDetails, notes: e.target.value })}
              placeholder="Additional notes..."
            />
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Marking this workbond check as received does NOT exempt the family.
              Exemptions are only granted for volunteer roles (Manager, Coach, Team Parent) and Board Members.
            </p>
          </div>
        </div>
      </Modal>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentPlayer(null);
        }}
        title="All-Star Payment"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowPaymentModal(false);
                setPaymentPlayer(null);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePaymentSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Player</label>
            <div className="mt-1 text-sm text-gray-900">
              {paymentPlayer?.last_name}, {paymentPlayer?.first_name}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Family</label>
            <div className="mt-1 text-sm text-gray-900">
              {paymentPlayer?.family?.primary_contact_name || 'N/A'}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount</label>
            <input
              type="text"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={paymentDetails.amount}
              onChange={(e) => setPaymentDetails({ ...paymentDetails, amount: e.target.value })}
              placeholder="$0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <select
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={paymentDetails.payment_method}
              onChange={(e) => setPaymentDetails({ ...paymentDetails, payment_method: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="credit_card">Credit Card</option>
              <option value="venmo">Venmo</option>
              <option value="paypal">PayPal</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Date</label>
            <input
              type="date"
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              value={paymentDetails.payment_date}
              onChange={(e) => setPaymentDetails({ ...paymentDetails, payment_date: e.target.value })}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2"
              rows="3"
              value={paymentDetails.notes}
              onChange={(e) => setPaymentDetails({ ...paymentDetails, notes: e.target.value })}
              placeholder="Additional notes..."
            />
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Marking payment as received confirms the family has paid for the All-Star season.
            </p>
          </div>
        </div>
      </Modal>

      {/* Send Rosters Modal (NEW) */}
      <Modal
        isOpen={showRosterModal}
        onClose={() => {
          setShowRosterModal(false);
          setSelectedTeamIds([]);
        }}
        title="Send Rosters"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowRosterModal(false);
                setSelectedTeamIds([]);
              }}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={sendingRosters}
            >
              Cancel
            </button>
            <button
              onClick={handleSendRosters}
              disabled={selectedTeamIds.length === 0 || sendingRosters}
              className={`px-4 py-2 rounded-md text-white ${
                selectedTeamIds.length === 0 || sendingRosters
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {sendingRosters ? 'Sending...' : `Send to ${selectedTeamIds.length} Team${selectedTeamIds.length > 1 ? 's' : ''}`}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select which teams to send roster emails to. Team managers will receive an email with their full roster.
          </p>

          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-700">Select Teams</span>
              <button
                onClick={toggleAllTeams}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {selectedTeamIds.length === teams.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="space-y-2">
              {teams.length === 0 ? (
                <div className="text-sm text-gray-500">No teams available to send rosters to.</div>
              ) : (
                teams.map(team => (
                  <label key={team.id} className="flex items-center space-x-3 p-2 bg-white rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(team.id)}
                      onChange={() => toggleTeamSelection(team.id)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{team.name}</div>
                      <div className="text-xs text-gray-500">
                        {team.players?.length || 0} players • {team.sport ? team.sport.charAt(0).toUpperCase() + team.sport.slice(1) : 'N/A'} • {team.age_group || 'N/A'}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {team.manager_email ? '✓ Manager set' : '⚠️ No manager email'}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="text-xs text-gray-500">
            <strong>Note:</strong> Only teams with a manager email address will receive the roster. 
            Teams without a manager email will be skipped.
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AllStarManagement;