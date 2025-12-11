import React, { useState, useEffect } from 'react';
import { Plus, Search, Users, RefreshCw, Mail, Phone, Filter, ChevronDown, ChevronUp, Link } from 'lucide-react';
import { playersAPI, seasonsAPI, importAPI, parseCSV } from '../services/api';
import CSVImport from '../components/CSVImport';
import CSVTemplate from '../components/CSVTemplate';
import Modal from '../components/Modal';

const Players = () => {
  const [players, setPlayers] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    division: '',
    team: '',
    gender: '',
    registrationPaid: '',
    workbondCheck: '',
    medicalConditions: ''
  });
  const [showFamilyLinker, setShowFamilyLinker] = useState(false);
  const [unlinkedVolunteers, setUnlinkedVolunteers] = useState([]);
  const [linkSelections, setLinkSelections] = useState({
    volunteerId: '',
    playerId: ''
  });

  useEffect(() => {
    loadPlayers();
    loadSeasons();
  }, [selectedSeason]);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      setError(null);
      const filters = {};
      if (selectedSeason) filters.season_id = selectedSeason;
      
      const response = await playersAPI.getAll(filters);
      
      // Use the improved volunteer data enhancement
      const playersWithVolunteers = await enhancePlayersWithVolunteerData(response.data || []);
      setPlayers(playersWithVolunteers);
    } catch (error) {
      console.error('Error loading players:', error);
      setError('Failed to load players. ' + error.message);
      setPlayers([]);
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Improved volunteer data enhancement with direct family_id matching
  const enhancePlayersWithVolunteerData = async (playersData) => {
    try {
      console.log('=== ENHANCING PLAYERS WITH VOLUNTEER DATA ===');
      console.log('Players data received:', playersData.length, 'players');
      
      // Fetch volunteers WITH family relationships included
      const volunteersResponse = await fetch('/api/volunteers?include=family');
      if (!volunteersResponse.ok) throw new Error('Failed to fetch volunteers');
      const volunteersData = await volunteersResponse.json();
      
      console.log('Volunteers data loaded:', volunteersData.length, 'volunteers');
      
      // Log family_id relationships for debugging
      playersData.forEach(player => {
        console.log(`Player: ${player.first_name} ${player.last_name}, Family ID: ${player.family_id}`);
      });
      
      volunteersData.forEach(volunteer => {
        console.log(`Volunteer: ${volunteer.name}, Family ID: ${volunteer.family_id}, Role: ${volunteer.role}`);
      });

      // Find unlinked volunteers for the family linker tool
      const unlinked = volunteersData.filter(volunteer => !volunteer.family_id);
      setUnlinkedVolunteers(unlinked);
      console.log('Unlinked volunteers found:', unlinked.length);

      // Enhance players with volunteer information using direct family_id matching
      return playersData.map(player => {
        if (!player.family_id) {
          console.log(`Player ${player.first_name} ${player.last_name} has no family_id`);
          return {
            ...player,
            shirt_size: player.uniform_shirt_size,
            pants_size: player.uniform_pants_size,
            volunteers: [],
            primary_guardian_volunteer: null,
            secondary_guardian_volunteer: null
          };
        }

        // STRATEGY 1: Find volunteers by exact family_id match (MOST RELIABLE)
        const familyVolunteers = volunteersData.filter(volunteer => 
          volunteer.family_id === player.family_id
        );
        
        console.log(`Player ${player.first_name} ${player.last_name} (family: ${player.family_id}) has ${familyVolunteers.length} volunteers by family_id match`);

        // STRATEGY 2: If no family_id matches, try email matching as fallback
        let additionalVolunteers = [];
        if (familyVolunteers.length === 0 && player.family) {
          const familyEmails = [
            player.family.primary_contact_email?.toLowerCase(),
            player.family.parent2_email?.toLowerCase()
          ].filter(Boolean);
          
          additionalVolunteers = volunteersData.filter(volunteer => 
            volunteer.email && familyEmails.includes(volunteer.email.toLowerCase())
          );
          
          if (additionalVolunteers.length > 0) {
            console.log(`Found ${additionalVolunteers.length} volunteers by email match for ${player.first_name} ${player.last_name}`);
          }
        }

        // Combine both strategies
        const allVolunteers = [...familyVolunteers, ...additionalVolunteers];
        
        // For primary guardian volunteer - look for exact matches first
        const primaryGuardianVolunteer = allVolunteers.find(volunteer => {
          // Direct family_id match is primary indicator
          if (volunteer.family_id === player.family_id) {
            return true;
          }
          
          // Email match with primary contact
          if (player.family?.primary_contact_email && volunteer.email) {
            return volunteer.email.toLowerCase() === player.family.primary_contact_email.toLowerCase();
          }
          
          return false;
        });

        // For secondary guardian volunteer - look for other volunteers in the same family
        const secondaryGuardianVolunteer = allVolunteers.find(volunteer => 
          volunteer !== primaryGuardianVolunteer
        );

        // Log the results for debugging
        if (allVolunteers.length > 0) {
          console.log(`>>> VOLUNTEERS ASSIGNED to ${player.first_name} ${player.last_name}:`, 
            allVolunteers.map(v => `${v.name} (${v.role})`));
        }

        return {
          ...player,
          shirt_size: player.uniform_shirt_size,
          pants_size: player.uniform_pants_size,
          volunteers: allVolunteers,
          primary_guardian_volunteer: primaryGuardianVolunteer,
          secondary_guardian_volunteer: secondaryGuardianVolunteer
        };
      });
    } catch (error) {
      console.error('Error enhancing players with volunteer data:', error);
      // Return players without volunteer data if there's an error
      return playersData.map(player => ({
        ...player,
        shirt_size: player.uniform_shirt_size,
        pants_size: player.uniform_pants_size,
        volunteers: [],
        primary_guardian_volunteer: null,
        secondary_guardian_volunteer: null
      }));
    }
  };

  // NEW: Function to link volunteer to family
  const linkVolunteerToFamily = async (volunteerId, familyId) => {
    try {
      console.log(`Linking volunteer ${volunteerId} to family ${familyId}`);
      
      const response = await fetch(`/api/volunteers/${volunteerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          family_id: familyId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to link volunteer to family');
      }

      const result = await response.json();
      console.log('Volunteer linked successfully:', result);
      
      // Reload players to see the updated volunteer data
      await loadPlayers();
      
      alert('Volunteer successfully linked to family!');
      return true;
    } catch (error) {
      console.error('Error linking volunteer:', error);
      alert(`Error linking volunteer: ${error.message}`);
      return false;
    }
  };

  const loadSeasons = async () => {
    try {
      const response = await seasonsAPI.getAll();
      setSeasons(response.data || []);
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  };

  const handleImportPlayers = async (csvText, seasonId) => {
    try {
      const parsedData = parseCSV(csvText);
      const response = await importAPI.players(parsedData, seasonId);
      
      await loadPlayers();
      
      return {
        success: true,
        message: response.data.message,
        data: response.data.data
      };
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message);
    }
  };

  // Calculate age from birth date
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

  const getColorClass = (color) => {
    const colorMap = {
      'red': 'bg-red-500',
      'blue': 'bg-blue-500',
      'green': 'bg-green-500',
      'orange': 'bg-orange-500',
      'purple': 'bg-purple-500',
      'yellow': 'bg-yellow-500',
      'indigo': 'bg-indigo-500',
      'pink': 'bg-pink-500',
      'teal': 'bg-teal-500',
      'gray': 'bg-gray-500'
    };
    return colorMap[color] || 'bg-gray-500';
  };

  const handleFilterChange = (column, value) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearAllFilters = () => {
    setColumnFilters({
      division: '',
      team: '',
      gender: '',
      registrationPaid: '',
      workbondCheck: '',
      medicalConditions: ''
    });
    setSearchTerm('');
  };

  // Helper function to get volunteer role for a guardian
  const getGuardianVolunteerRole = (player, guardianType) => {
    if (guardianType === 'primary') {
      return player.primary_guardian_volunteer?.role || 'None';
    } else {
      return player.secondary_guardian_volunteer?.role || 'None';
    }
  };

  // Helper function to check if volunteer role is selected/approved
  const isVolunteerSelected = (player, guardianType) => {
    if (guardianType === 'primary') {
      return player.primary_guardian_volunteer?.is_approved || false;
    } else {
      return player.secondary_guardian_volunteer?.is_approved || false;
    }
  };

  const filteredPlayers = players.filter(player => {
    // Global search
    const matchesSearch = !searchTerm || 
      player.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.family?.primary_contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.family?.parent2_first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.registration_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      player.family?.family_id?.toLowerCase().includes(searchTerm.toLowerCase());

    // Column filters - FIXED
    const matchesDivision = !columnFilters.division || 
      (player.division?.name?.toLowerCase().includes(columnFilters.division.toLowerCase()) ||
       player.program_title?.toLowerCase().includes(columnFilters.division.toLowerCase()));
    
    const matchesTeam = !columnFilters.team || 
      (player.team?.name?.toLowerCase().includes(columnFilters.team.toLowerCase()));
    
    const matchesGender = !columnFilters.gender || 
      player.gender?.toLowerCase() === columnFilters.gender.toLowerCase();
    
    const matchesRegistrationPaid = !columnFilters.registrationPaid || 
      (columnFilters.registrationPaid === 'paid' && player.payment_received) ||
      (columnFilters.registrationPaid === 'pending' && !player.payment_received);
    
    const matchesWorkbondCheck = !columnFilters.workbondCheck || 
      (columnFilters.workbondCheck === 'received' && player.family?.work_bond_check_received) ||
      (columnFilters.workbondCheck === 'not_received' && !player.family?.work_bond_check_received);
    
    const matchesMedicalConditions = !columnFilters.medicalConditions || 
      (columnFilters.medicalConditions === 'has_medical' && player.medical_conditions && player.medical_conditions !== 'None' && player.medical_conditions !== 'none') ||
      (columnFilters.medicalConditions === 'no_medical' && (!player.medical_conditions || player.medical_conditions === 'None' || player.medical_conditions === 'none'));

    return matchesSearch && matchesDivision && matchesTeam && matchesGender && 
           matchesRegistrationPaid && matchesWorkbondCheck && matchesMedicalConditions;
  });

  const activeFilterCount = Object.values(columnFilters).filter(value => value !== '').length + (searchTerm ? 1 : 0);
  
  // Debug function to check volunteer data
  const debugVolunteerData = async () => {
    try {
      console.log('=== DEBUG: VOLUNTEER DATA CHECK ===');
      
      const volunteersResponse = await fetch('/api/volunteers?include=family');
      const volunteers = await volunteersResponse.json();
      
      console.log('All volunteers with family data:', volunteers);
      
      // Check specific player-volunteer relationships
      players.forEach(player => {
        const playerVolunteers = volunteers.filter(v => v.family_id === player.family_id);
        console.log(`Player ${player.first_name} ${player.last_name} (Family: ${player.family_id}) has ${playerVolunteers.length} volunteers:`, 
          playerVolunteers.map(v => `${v.name} - ${v.role}`));
      });
    } catch (error) {
      console.error('Debug error:', error);
    }
  };

  // Handle linking volunteer
  const handleLinkVolunteer = async () => {
    if (!linkSelections.volunteerId || !linkSelections.playerId) {
      alert('Please select both a volunteer and a player');
      return;
    }

    const volunteer = unlinkedVolunteers.find(v => v.id === linkSelections.volunteerId);
    const player = players.find(p => p.id === linkSelections.playerId);

    if (!volunteer || !player) {
      alert('Invalid selection');
      return;
    }

    const success = await linkVolunteerToFamily(volunteer.id, player.family_id);
    if (success) {
      setLinkSelections({ volunteerId: '', playerId: '' });
      setShowFamilyLinker(false);
    }
  };

  // Family Linker Modal Footer
  const FamilyLinkerFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={() => {
          setShowFamilyLinker(false);
          setLinkSelections({ volunteerId: '', playerId: '' });
        }}
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
        Cancel
      </button>
      <button
        onClick={handleLinkVolunteer}
        disabled={!linkSelections.volunteerId || !linkSelections.playerId}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!linkSelections.volunteerId || !linkSelections.playerId) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!linkSelections.volunteerId || !linkSelections.playerId) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (linkSelections.volunteerId && linkSelections.playerId) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (linkSelections.volunteerId && linkSelections.playerId) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Link style={{ width: '16px', height: '16px' }} />
        Link Volunteer to Family
      </button>
    </div>
  );

  // Family Linker Form Content
  const FamilyLinkerFormContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <p className="text-sm text-gray-600 mb-4">
          These volunteers don't have family associations. Link them to players to display their roles correctly.
        </p>
        
        <div>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}>
            Select Volunteer *
          </label>
          <select
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#374151',
              backgroundColor: 'white'
            }}
            value={linkSelections.volunteerId}
            onChange={(e) => setLinkSelections(prev => ({ ...prev, volunteerId: e.target.value }))}
          >
            <option value="">Choose a volunteer...</option>
            {unlinkedVolunteers.map(volunteer => (
              <option key={volunteer.id} value={volunteer.id}>
                {volunteer.name} - {volunteer.role} {volunteer.email ? `(${volunteer.email})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}>
            Select Player to Link To *
          </label>
          <select
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '8px',
              fontSize: '14px',
              color: '#374151',
              backgroundColor: 'white'
            }}
            value={linkSelections.playerId}
            onChange={(e) => setLinkSelections(prev => ({ ...prev, playerId: e.target.value }))}
          >
            <option value="">Choose a player...</option>
            {players.map(player => (
              <option key={player.id} value={player.id}>
                {player.first_name} {player.last_name} (Family: {player.family_id?.substring(0, 8)}...)
              </option>
            ))}
          </select>
        </div>
      </div>

      {unlinkedVolunteers.length > 0 && (
        <div>
          <h4 className="font-medium mb-2" style={{ fontSize: '14px', fontWeight: '600' }}>All Unlinked Volunteers:</h4>
          <div className="bg-gray-50 rounded-md p-3 max-h-40 overflow-y-auto">
            {unlinkedVolunteers.map(volunteer => (
              <div key={volunteer.id} className="text-sm py-1 border-b border-gray-200 last:border-b-0">
                <strong>{volunteer.name}</strong> - {volunteer.role} 
                {volunteer.email && ` (${volunteer.email})`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Players</h1>
        <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadPlayers}
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Players</h1>
            <p className="text-gray-600 mt-1">Manage player registrations and information</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <CSVTemplate />
            <CSVImport 
              onImport={handleImportPlayers}
              importType="players"
              seasons={seasons}
            />
            <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Player
            </button>
            {/* Debug buttons */}
            <button 
              onClick={debugVolunteerData}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Debug Volunteers
            </button>
            <button 
              onClick={() => setShowFamilyLinker(true)}
              className="inline-flex items-center px-4 py-2 border border-yellow-300 rounded-md shadow-sm text-sm font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
            >
              <Link className="h-4 w-4 mr-2" />
              Fix Family Links
            </button>
          </div>
        </div>
      </div>

      {/* Family Linker Modal */}
      <Modal
        isOpen={showFamilyLinker}
        onClose={() => {
          setShowFamilyLinker(false);
          setLinkSelections({ volunteerId: '', playerId: '' });
        }}
        title="Fix Volunteer Family Links"
        footer={FamilyLinkerFooter}
      >
        {FamilyLinkerFormContent}
      </Modal>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Total Players</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{players.length}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">With Teams</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {players.filter(p => p.team_id).length}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Paid</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {players.filter(p => p.payment_received).length}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Workbond Check Received</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {players.filter(p => p.family?.work_bond_check_received).length}
            </dd>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white shadow rounded-lg p-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Global Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search players, parents, registration numbers, or family IDs..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Season Filter */}
          <div className="sm:w-48">
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              <option value="">All Seasons</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-blue-600 rounded-full">
                {activeFilterCount}
              </span>
            )}
            {showFilters ? (
              <ChevronUp className="h-4 w-4 ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-2" />
            )}
          </button>

          {/* Clear Filters Button */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Expandable Filter Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Division Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                <input
                  type="text"
                  placeholder="Filter by division..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.division}
                  onChange={(e) => handleFilterChange('division', e.target.value)}
                />
              </div>

              {/* Team Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <input
                  type="text"
                  placeholder="Filter by team..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.team}
                  onChange={(e) => handleFilterChange('team', e.target.value)}
                />
              </div>

              {/* Gender Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.gender}
                  onChange={(e) => handleFilterChange('gender', e.target.value)}
                >
                  <option value="">All Genders</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              {/* Registration Paid Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Paid</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.registrationPaid}
                  onChange={(e) => handleFilterChange('registrationPaid', e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              {/* Workbond Check Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Workbond Check</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.workbondCheck}
                  onChange={(e) => handleFilterChange('workbondCheck', e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="received">Received</option>
                  <option value="not_received">Not Received</option>
                </select>
              </div>

              {/* Medical Conditions Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medical Conditions</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.medicalConditions}
                  onChange={(e) => handleFilterChange('medicalConditions', e.target.value)}
                >
                  <option value="">All Players</option>
                  <option value="has_medical">Has Medical Conditions</option>
                  <option value="no_medical">No Medical Conditions</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Players Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Player Info
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Division
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Age/DOB/Gender
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Uniform Sizes
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Workbond Check
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Medical
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Primary Guardian
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Secondary Guardian
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPlayers.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  {/* Player Info Column */}
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {player.first_name} {player.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {player.is_new_player ? 'New' : 'Returning'}
                      {player.is_travel_player && ' • Travel'}
                    </div>
                  </td>

                  {/* Division Column */}
                  <td className="px-4 py-4">
                    <div className="text-sm text-gray-900">
                      {player.division?.name || player.program_title || 'N/A'}
                    </div>
                  </td>

                  {/* Team Column */}
                  <td className="px-4 py-4">
                    {player.team ? (
                      <div className="flex items-center">
                        <div 
                          className={`w-3 h-3 rounded-full mr-2 ${getColorClass(player.team.color)}`}
                        ></div>
                        <span className="text-sm text-gray-700">{player.team.name}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No Team</span>
                    )}
                  </td>

                  {/* Age/DOB/Gender Column */}
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <div>Age: {calculateAge(player.birth_date)}</div>
                      <div className="text-gray-500">
                        {player.birth_date ? new Date(player.birth_date).toLocaleDateString() : 'N/A'}
                      </div>
                      <div className="text-gray-500">{player.gender || 'N/A'}</div>
                    </div>
                  </td>

                  {/* Uniform Sizes Column - Now using data from players table */}
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <div>Shirt: {player.shirt_size || player.uniform_shirt_size || 'N/A'}</div>
                      <div>Pants: {player.pants_size || player.uniform_pants_size || 'N/A'}</div>
                    </div>
                  </td>

                  {/* Registration Status Column */}
                  <td className="px-4 py-4">
                    {player.payment_received ? (
                      <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                        Pending
                      </span>
                    )}
                  </td>

                  {/* Workbond Check Status Column */}
                  <td className="px-4 py-4">
                    {player.family?.work_bond_check_received ? (
                      <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                        Received
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                        Not Received
                      </span>
                    )}
                  </td>

                  {/* Medical Conditions Column */}
                  <td className="px-4 py-4">
                    {player.medical_conditions && player.medical_conditions !== 'None' && player.medical_conditions !== 'none' ? (
                      <div className="text-sm">
                        <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full mr-1">
                          ⚕️
                        </span>
                        <span className="text-gray-700 text-xs">{player.medical_conditions}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">None</span>
                    )}
                  </td>

                  {/* Primary Guardian Column */}
                  <td className="px-4 py-4">
                    {player.family?.primary_contact_name ? (
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">
                          {player.family.primary_contact_name}
                        </div>
                        {player.family.primary_contact_email && (
                          <div className="flex items-center text-gray-500 mt-1">
                            <Mail className="h-3 w-3 mr-1" />
                            <span className="text-xs">{player.family.primary_contact_email}</span>
                          </div>
                        )}
                        {player.family.primary_contact_phone && (
                          <div className="flex items-center text-gray-500 mt-1">
                            <Phone className="h-3 w-3 mr-1" />
                            <span className="text-xs">{player.family.primary_contact_phone}</span>
                          </div>
                        )}
                        <div className="mt-1">
                          <span className="text-xs font-medium text-gray-500">Volunteer: </span>
                          <span className={`text-xs ${
                            isVolunteerSelected(player, 'primary') 
                              ? 'text-green-600 font-medium' 
                              : 'text-blue-600'
                          }`}>
                            {getGuardianVolunteerRole(player, 'primary')}
                            {isVolunteerSelected(player, 'primary') && ' (Selected)'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not provided</span>
                    )}
                  </td>

                  {/* Secondary Guardian Column */}
                  <td className="px-4 py-4">
                    {player.family?.parent2_first_name ? (
                      <div className="text-sm">
                        <div className="font-medium text-gray-900">
                          {player.family.parent2_first_name} {player.family.parent2_last_name}
                        </div>
                        {player.family.parent2_email && (
                          <div className="flex items-center text-gray-500 mt-1">
                            <Mail className="h-3 w-3 mr-1" />
                            <span className="text-xs">{player.family.parent2_email}</span>
                          </div>
                        )}
                        {player.family.parent2_phone && (
                          <div className="flex items-center text-gray-500 mt-1">
                            <Phone className="h-3 w-3 mr-1" />
                            <span className="text-xs">{player.family.parent2_phone}</span>
                          </div>
                        )}
                        <div className="mt-1">
                          <span className="text-xs font-medium text-gray-500">Volunteer: </span>
                          <span className={`text-xs ${
                            isVolunteerSelected(player, 'secondary') 
                              ? 'text-green-600 font-medium' 
                              : 'text-blue-600'
                          }`}>
                            {getGuardianVolunteerRole(player, 'secondary')}
                            {isVolunteerSelected(player, 'secondary') && ' (Selected)'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not provided</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredPlayers.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No players found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchTerm || Object.values(columnFilters).some(filter => filter) 
                ? 'Try adjusting your search terms or filters' 
                : 'Get started by downloading the template and importing players'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Players;