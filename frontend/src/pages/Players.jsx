import React, {useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { Plus, Search, Users, RefreshCw, Mail, Phone, Filter, ChevronDown, ChevronUp, Link, X, Check } from 'lucide-react';
import { playersAPI, seasonsAPI, importAPI, parseCSV, teamsAPI } from '../services/api';
import CSVImport from '../components/CSVImport';
import CSVTemplate from '../components/CSVTemplate';
import Modal from '../components/Modal';

const Players = () => {
  const [players, setPlayers] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [teams, setTeams] = useState([]);

  // Team edit (only team assignment)
  const [showTeamEditModal, setShowTeamEditModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editTeamId, setEditTeamId] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);
  // ADD: Status edit modal
  const [showStatusEditModal, setShowStatusEditModal] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [columnFilters, setColumnFilters] = useState({
    division: '',
    team: '',
    gender: '',
    registrationPaid: '',
    workbondCheck: '',
    guardianName: '',
    medicalConditions: '',
    status: '' // ADD: Status filter
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [showFamilyLinker, setShowFamilyLinker] = useState(false);
  const [unlinkedVolunteers, setUnlinkedVolunteers] = useState([]);
  const [linkSelections, setLinkSelections] = useState({
    volunteerId: '',
    playerId: ''
  });

  // Map family_id -> sibling names for quick visual indicator
  const siblingsByFamily = useMemo(() => {
    const map = new Map();
    for (const p of players || []) {
      const fid = String(p?.family_id || '');
      if (!fid) continue;
      if (!map.has(fid)) map.set(fid, []);
      map.get(fid).push(`${p.first_name || ''} ${p.last_name || ''}`.trim());
    }
    // de-dupe + sort names
    for (const [fid, names] of map.entries()) {
      const uniq = Array.from(new Set(names.filter(Boolean)));
      uniq.sort((a, b) => a.localeCompare(b));
      map.set(fid, uniq);
    }
    return map;
  }, [players]);

  const getSiblingInfo = (player) => {
    const fid = String(player?.family_id || '');
    if (!fid) return { hasSiblings: false, title: '' };
    const names = siblingsByFamily.get(fid) || [];
    if (names.length <= 1) return { hasSiblings: false, title: '' };
    // show all sibling names in tooltip
    return {
      hasSiblings: true,
      title: `Siblings: ${names.join(', ')}`,
    };
  };

  // Prevent race conditions when season changes rapidly
  const playersLoadSeq = useRef(0);

  const playerStats = useMemo(() => {
    const total = players.length;
    let paid = 0;
    let unpaid = 0;
    let workbondCheck = 0;
    let activePlayers = 0;
    let withdrawnPlayers = 0;

    for (const p of players) {
      if (p.payment_received) paid += 1;
      else unpaid += 1;
      if (p.family?.work_bond_check_received) workbondCheck += 1;
      if (p.status === 'active') activePlayers += 1;
      if (p.status === 'withdrawn') withdrawnPlayers += 1;
    }

    return { total, paid, unpaid, workbondCheck, activePlayers, withdrawnPlayers };
  }, [players]);

  useEffect(() => {
    loadSeasons();
  }, []);

  // Debounce global search to keep filtering responsive on large datasets
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(deferredSearchTerm), 200);
    return () => clearTimeout(t);
  }, [deferredSearchTerm]);

  // When filters change, jump back to page 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm, columnFilters, selectedSeason]);

  useEffect(() => {
    // Wait until we have initialized selectedSeason from active season
    if (selectedSeason === null) return;
    loadPlayers();
  }, [selectedSeason]);

  const loadPlayers = async () => {
    const seqId = ++playersLoadSeq.current;
    try {
      setLoading(true);
      setError(null);
      const filters = {};
      if (selectedSeason) filters.season_id = selectedSeason;
      
      const response = await playersAPI.getAll(filters);
      
      // Use the improved volunteer data enhancement
      const playersWithVolunteers = await enhancePlayersWithVolunteerData(response.data || []);
      // Ignore stale responses (e.g., initial "all seasons" load finishing after active-season load)
      if (seqId !== playersLoadSeq.current) return;
      setPlayers(playersWithVolunteers);
    } catch (error) {
      console.error('Error loading players:', error);
      if (seqId !== playersLoadSeq.current) return;
      setError('Failed to load players. ' + error.message);
      setPlayers([]);
    } finally {
      if (seqId === playersLoadSeq.current) {
        setLoading(false);
      }
    }
  };

  const loadTeams = async () => {
    if (!selectedSeason) {
      setTeams([]);
      return;
    }
    try {
      const res = await teamsAPI.getAll({ season_id: selectedSeason });
      setTeams(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error('Error loading teams:', e);
      setTeams([]);
    }
  };

  // Open the "Change Team" modal for a player
  const openTeamEdit = (player) => {
    setEditingPlayer(player);
    // allow blank (unassigned)
    setEditTeamId(player?.team_id || '');
    setShowTeamEditModal(true);
  };
  
  // Add this helper function:
const formatBirthDate = (dateString) => {
  // Assuming date is stored as YYYY-MM-DD
  const [year, month, day] = dateString.split('-');
  return `${month}/${day}/${year}`;
};

  // ADD: Open the "Change Status" modal for a player
  const openStatusEdit = (player) => {
    setEditingPlayer(player);
    setEditStatus(player?.status || 'active');
    setShowStatusEditModal(true);
  };

  // Save only the team change for the selected player
  const handleSaveTeamChange = async () => {
    if (!editingPlayer) return;

    try {
      setSavingTeam(true);

      // empty string => null (unassigned)
      const newTeamId = editTeamId ? editTeamId : null;

      await playersAPI.update(editingPlayer.id, { team_id: newTeamId });

      setShowTeamEditModal(false);
      setEditingPlayer(null);

      // reload players so the UI updates immediately
      await loadPlayers();
    } catch (err) {
      console.error('Error updating player team:', err);
      alert('Failed to update player team. Check the console for details.');
    } finally {
      setSavingTeam(false);
    }
  };

  // ADD: Save only the status change for the selected player
  const handleSaveStatusChange = async () => {
    if (!editingPlayer) return;

    try {
      setSavingStatus(true);

      await playersAPI.update(editingPlayer.id, { status: editStatus });

      setShowStatusEditModal(false);
      setEditingPlayer(null);

      // reload players so the UI updates immediately
      await loadPlayers();
    } catch (err) {
      console.error('Error updating player status:', err);
      alert('Failed to update player status. Check the console for details.');
    } finally {
      setSavingStatus(false);
    }
  };

  useEffect(() => {
    if (selectedSeason) {
      loadTeams();
    }
  }, [selectedSeason]);

  // FIXED: Enhanced volunteer data matching using family_id
  const enhancePlayersWithVolunteerData = async (playersData) => {
    try {
      // Fetch volunteers for the current season
      let url = '/api/volunteers';
      if (selectedSeason) {
        url += `?season_id=${selectedSeason}`;
      }
      
      console.log('Fetching volunteers from:', url);
      const volunteersResponse = await fetch(url);
      if (!volunteersResponse.ok) throw new Error('Failed to fetch volunteers');
      const volunteersData = await volunteersResponse.json();
      
      console.log('Total volunteers found:', volunteersData?.length || 0);

      // Create lookup maps
      const volunteersByFamilyId = new Map();
      const volunteersByEmail = new Map();

      // Organize volunteers by family_id
      for (const volunteer of volunteersData || []) {
        const familyId = volunteer.family_id;
        if (familyId) {
          const key = String(familyId);
          if (!volunteersByFamilyId.has(key)) volunteersByFamilyId.set(key, []);
          volunteersByFamilyId.get(key).push(volunteer);
        }

        // Also index by email for fallback matching
        if (volunteer.email) {
          const emailKey = String(volunteer.email).toLowerCase().trim();
          if (!volunteersByEmail.has(emailKey)) volunteersByEmail.set(emailKey, []);
          volunteersByEmail.get(emailKey).push(volunteer);
        }
      }

      // Enhance each player with their family's volunteers
      return (playersData || []).map((player) => {
        const familyId = player.family_id ? String(player.family_id) : null;
        let playerVolunteers = [];

        // Primary strategy: Match by family_id
        if (familyId && volunteersByFamilyId.has(familyId)) {
          playerVolunteers = [...volunteersByFamilyId.get(familyId)];
          console.log(`Found ${playerVolunteers.length} volunteers for player ${player.first_name} ${player.last_name} via family_id ${familyId}`);
        } 
        // Fallback strategy: Match by email if family_id doesn't work
        else if (player.family) {
          const familyEmails = [
            player.family.primary_contact_email,
            player.family.parent2_email,
          ]
            .filter(Boolean)
            .map((e) => String(e).toLowerCase().trim());

          const emailMatched = [];
          for (const email of familyEmails) {
            if (volunteersByEmail.has(email)) {
              emailMatched.push(...volunteersByEmail.get(email));
            }
          }

          // Deduplicate
          const seenIds = new Set();
          playerVolunteers = emailMatched.filter((v) => {
            if (v.id && !seenIds.has(v.id)) {
              seenIds.add(v.id);
              return true;
            }
            return false;
          });

          if (playerVolunteers.length > 0) {
            console.log(`Found ${playerVolunteers.length} volunteers for player ${player.first_name} ${player.last_name} via email matching`);
          }
        }

        // For debugging the Bartlinski case
        if (player.last_name === 'Bartlinski') {
          console.log('DEBUG - Bartlinski player:', {
            name: `${player.first_name} ${player.last_name}`,
            familyId,
            familyEmails: [
              player.family?.primary_contact_email,
              player.family?.parent2_email
            ],
            foundVolunteers: playerVolunteers.map(v => `${v.name} - ${v.role} (family_id: ${v.family_id})`)
          });
        }

        // Return player with volunteer data
        return {
          ...player,
          volunteers: playerVolunteers,
          // We'll match volunteers to specific guardians in the UI logic
        };
      });
    } catch (error) {
      console.error('Error enhancing players with volunteer data:', error);
      return playersData || [];
    }
  };

  // Helper function to find volunteer for a specific guardian
  const findVolunteerForGuardian = (player, guardianType) => {
    if (!player.volunteers || player.volunteers.length === 0) {
      return null;
    }

    const volunteers = player.volunteers;
    
    if (guardianType === 'primary') {
      // Try to match by name first
      const primaryName = player.family?.primary_contact_name;
      if (primaryName) {
        const nameMatch = volunteers.find(v => 
          v.name && v.name.trim().toLowerCase() === primaryName.trim().toLowerCase()
        );
        if (nameMatch) return nameMatch;
      }
      
      // Try to match by email
      const primaryEmail = player.family?.primary_contact_email;
      if (primaryEmail) {
        const emailMatch = volunteers.find(v => 
          v.email && v.email.trim().toLowerCase() === primaryEmail.trim().toLowerCase()
        );
        if (emailMatch) return emailMatch;
      }
    } 
    else if (guardianType === 'secondary') {
      // Try to match by name
      const secondaryFirstName = player.family?.parent2_first_name;
      const secondaryLastName = player.family?.parent2_last_name;
      if (secondaryFirstName) {
        const secondaryName = `${secondaryFirstName} ${secondaryLastName || ''}`.trim();
        const nameMatch = volunteers.find(v => {
          if (!v.name) return false;
          // Check if volunteer name contains the guardian's first name
          return v.name.toLowerCase().includes(secondaryFirstName.toLowerCase());
        });
        if (nameMatch) return nameMatch;
      }
      
      // Try to match by email
      const secondaryEmail = player.family?.parent2_email;
      if (secondaryEmail) {
        const emailMatch = volunteers.find(v => 
          v.email && v.email.trim().toLowerCase() === secondaryEmail.trim().toLowerCase()
        );
        if (emailMatch) return emailMatch;
      }
    }
    
    return null;
  };

  // Helper function to get volunteer role for a guardian
  const getGuardianVolunteerRole = (player, guardianType) => {
    const volunteer = findVolunteerForGuardian(player, guardianType);
    return volunteer?.role || 'None';
  };

  // Helper function to check if volunteer role is selected/approved
  const isVolunteerSelected = (player, guardianType) => {
    const volunteer = findVolunteerForGuardian(player, guardianType);
    return volunteer?.is_approved || false;
  };

  const loadSeasons = async () => {
    try {
      const [activeRes, allRes] = await Promise.all([
        seasonsAPI.getActive().catch(() => ({ data: null })),
        seasonsAPI.getAll().catch(() => ({ data: [] }))
      ]);

      const active = activeRes?.data || null;
      const all = Array.isArray(allRes?.data) ? allRes.data : [];
      setSeasons(all);

      // Default season filter to ACTIVE season (user can still pick "All Seasons")
      if (selectedSeason === null) {
        setSelectedSeason(active?.id || '');
      }
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
  
  // Parse the date string directly without timezone
  const [year, month, day] = birthDate.split('-').map(Number);
  const birth = new Date(year, month - 1, day); // Month is 0-indexed
  
  const today = new Date();
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

  // ADD: Helper function to get status badge styles
  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return {
          className: 'bg-green-100 text-green-800',
          label: 'Active'
        };
      case 'withdrawn':
        return {
          className: 'bg-red-100 text-red-800',
          label: 'Withdrawn'
        };
      case 'inactive':
        return {
          className: 'bg-gray-100 text-gray-800',
          label: 'Inactive'
        };
      default:
        return {
          className: 'bg-gray-100 text-gray-800',
          label: status || 'Active'
        };
    }
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
      guardianName: '',
      medicalConditions: '',
      status: ''
    });
    setSearchTerm('');
  };

  // Build dropdown options for cleaner filtering (derived from currently loaded players)
  const divisionOptions = useMemo(() => {
    const set = new Set();
    (players || []).forEach((p) => {
      const name = (p?.division?.name || p?.program_title || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [players]);

  const teamOptions = useMemo(() => {
    const set = new Set();
    (players || []).forEach((p) => {
      const name = (p?.team?.name || '').trim();
      if (name) set.add(name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [players]);

  // ADD: Status options
  const statusOptions = useMemo(() => {
    const set = new Set();
    (players || []).forEach((p) => {
      const status = p?.status || 'active';
      set.add(status);
    });
    return Array.from(set).sort();
  }, [players]);

  // Build a light-weight search index once per load for fast filtering
  const searchIndex = useMemo(() => {
    return (players || []).map((p) => {
      const first = String(p?.first_name || '').toLowerCase();
      const last = String(p?.last_name || '').toLowerCase();
      const playerName = `${first} ${last}`.trim();

      const guardian1 = String(p?.family?.primary_contact_name || '').toLowerCase();
      const guardian2 = `${String(p?.family?.parent2_first_name || '').toLowerCase()} ${String(p?.family?.parent2_last_name || '').toLowerCase()}`.trim();
      const guardian = `${guardian1} ${guardian2}`.trim();

      const division = String(p?.division?.name || p?.program_title || '').toLowerCase().trim();
      const team = String(p?.team?.name || '').toLowerCase().trim();
      const gender = String(p?.gender || '').toLowerCase().trim();
      const reg = String(p?.registration_no || '').toLowerCase().trim();
      const familyId = String(p?.family?.family_id || p?.family_id || '').toLowerCase().trim();
      const status = String(p?.status || 'active').toLowerCase().trim(); // ADD: status to search index

      return { playerName, guardian, division, team, gender, reg, familyId, status };
    });
  }, [players]);

  // Memoized filtering for performance (avoid rebuilding strings on each keypress)
  const filteredPlayers = useMemo(() => {
    const nameTerm = String(debouncedSearchTerm || '').trim().toLowerCase();
    const guardianTerm = String(columnFilters.guardianName || '').trim().toLowerCase();

    const divFilter = String(columnFilters.division || '').trim().toLowerCase();
    const teamFilter = String(columnFilters.team || '').trim().toLowerCase();
    const genderFilter = String(columnFilters.gender || '').trim().toLowerCase();
    const statusFilter = String(columnFilters.status || '').trim().toLowerCase(); // ADD: status filter

    return (players || []).filter((player, idx) => {
      const s = searchIndex[idx] || {};

      // Main search: player name only (first/last)
      const matchesName =
        !nameTerm ||
        s.playerName?.includes(nameTerm) ||
        String(player.first_name || '').toLowerCase().includes(nameTerm) ||
        String(player.last_name || '').toLowerCase().includes(nameTerm);

      // Guardian name search (in Filters panel)
      const matchesGuardian =
        !guardianTerm ||
        s.guardian?.includes(guardianTerm);

      // Division (dropdown)
      const matchesDivision = !divFilter || s.division === divFilter;

      // Team (dropdown)
      const matchesTeam = !teamFilter || s.team === teamFilter;

      // Gender
      const matchesGender = !genderFilter || s.gender === genderFilter;

      // Status (ADD: new filter)
      const matchesStatus = !statusFilter || s.status === statusFilter;

      // Registration Paid
      const matchesRegistrationPaid =
        !columnFilters.registrationPaid ||
        (columnFilters.registrationPaid === 'paid' && player.payment_received) ||
        (columnFilters.registrationPaid === 'pending' && !player.payment_received);

      // Workbond Check
      const matchesWorkbondCheck =
        !columnFilters.workbondCheck ||
        (columnFilters.workbondCheck === 'received' && player.family?.work_bond_check_received) ||
        (columnFilters.workbondCheck === 'not_received' && !player.family?.work_bond_check_received);

      // Medical Conditions
      const medical = String(player.medical_conditions || '').trim().toLowerCase();
      const hasMedical = medical && medical !== 'none';
      const matchesMedicalConditions =
        !columnFilters.medicalConditions ||
        (columnFilters.medicalConditions === 'has_medical' && hasMedical) ||
        (columnFilters.medicalConditions === 'no_medical' && !hasMedical);

      return (
        matchesName &&
        matchesGuardian &&
        matchesDivision &&
        matchesTeam &&
        matchesGender &&
        matchesStatus &&
        matchesRegistrationPaid &&
        matchesWorkbondCheck &&
        matchesMedicalConditions
      );
    });
  }, [players, searchIndex, debouncedSearchTerm, columnFilters]);

  const displayedPlayers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredPlayers.slice(start, start + PAGE_SIZE);
  }, [filteredPlayers, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredPlayers.length / PAGE_SIZE)), [filteredPlayers.length]);

  const activeFilterCount = Object.values(columnFilters).filter(value => value !== '').length + (searchTerm ? 1 : 0);
  
  // Debug function to check volunteer data
  const debugVolunteerData = async () => {
    try {
      console.log('=== DEBUG: VOLUNTEER DATA CHECK ===');
      
      const volunteersResponse = await fetch(`/api/volunteers${selectedSeason ? `?season_id=${selectedSeason}` : ''}`);
      const volunteers = await volunteersResponse.json();
      
      console.log('All volunteers with family data:', volunteers);
      
      // Check specific player-volunteer relationships
      players.forEach(player => {
        const playerVolunteers = volunteers.filter(v => v.family_id === player.family_id);
        console.log(`Player ${player.first_name} ${player.last_name} (Family: ${player.family_id}) has ${playerVolunteers.length} volunteers:`, 
          playerVolunteers.map(v => `${v.name} - ${v.role} (family_id: ${v.family_id})`));
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
        <div style={{ marginTop: '12px' }}>
          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
            Unlinked volunteers in this season: <strong>{unlinkedVolunteers.length}</strong>
          </div>
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
              {[...unlinkedVolunteers]
                .sort((a, b) => {
                  const al = String(a?.name || '').trim().split(/\s+/).pop()?.toLowerCase() || '';
                  const bl = String(b?.name || '').trim().split(/\s+/).pop()?.toLowerCase() || '';
                  if (al < bl) return -1;
                  if (al > bl) return 1;
                  return String(a?.name || '').localeCompare(String(b?.name || ''));
                })
                .map((volunteer) => (
                  <option key={volunteer.id} value={volunteer.id}>
                    {volunteer.name} - {volunteer.role}
                  </option>
                ))}
            </select>
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
            <dd className="mt-1 text-3xl font-semibold text-gray-900">{playerStats.total}</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Active Players</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {playerStats.activePlayers}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Withdrawn Players</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {playerStats.withdrawnPlayers}
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">Workbond Check Received</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900">
              {playerStats.workbondCheck}
            </dd>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white shadow rounded-lg p-4 mb-8">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Global Search */}
          <div className="flex-1">
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="text-gray-400 h-4 w-4" />
              </div>
              <input
                type="text"
                placeholder="Search player name (first or last)..."
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
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.division}
                  onChange={(e) => handleFilterChange('division', e.target.value)}
                >
                  <option value="">All Divisions</option>
                  {divisionOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Team Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.team}
                  onChange={(e) => handleFilterChange('team', e.target.value)}
                >
                  <option value="">All Teams</option>
                  {teamOptions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              
              {/* Guardian Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Guardian Name</label>
                <input
                  type="text"
                  placeholder="Search guardian name..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.guardianName}
                  onChange={(e) => handleFilterChange('guardianName', e.target.value)}
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

              {/* ADD: Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={columnFilters.status}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="withdrawn">Withdrawn</option>
                  <option value="inactive">Inactive</option>
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
                <label className="block text-sm font-medium text-gray-500 mb-1">Medical Conditions</label>
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
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="text-sm text-gray-600">
            Showing <span className="font-medium">{displayedPlayers.length}</span> of{' '}
            <span className="font-medium">{filteredPlayers.length}</span> players
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="px-3 py-1 border rounded-md text-sm disabled:opacity-50"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border rounded-md text-sm disabled:opacity-50"
            >
              Prev
            </button>
            <div className="text-sm text-gray-700 px-2">
              Page <span className="font-medium">{page}</span> of{' '}
              <span className="font-medium">{totalPages}</span>
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1 border rounded-md text-sm disabled:opacity-50"
            >
              Next
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="px-3 py-1 border rounded-md text-sm disabled:opacity-50"
            >
              Last
            </button>
          </div>
        </div>

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
                  Status
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
              {displayedPlayers.map((player) => (
                <tr key={player.id} className="hover:bg-gray-50">
                  {/* Player Info Column */}
                  <td className="px-4 py-4">
                    <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                      <span>{player.first_name} {player.last_name}</span>
                      {getSiblingInfo(player).hasSiblings ? (
                        <Users className="h-4 w-4 text-blue-500" title={getSiblingInfo(player).title} />
                      ) : null}
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
                    <div className="flex items-center justify-between gap-3">
                      <div>
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
                      </div>
                      <button
                        type="button"
                        onClick={() => openTeamEdit(player)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                      >
                        Change
                      </button>
                    </div>
                  </td>

                  {/* ADD: Status Column */}
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full font-medium ${getStatusBadge(player.status).className}`}>
                          {getStatusBadge(player.status).label}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openStatusEdit(player)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                      >
                        Change
                      </button>
                    </div>
                  </td>

                  {/* Age/DOB/Gender Column */}
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <div>Age: {calculateAge(player.birth_date)}</div>
                      <div className="text-gray-500">
  {player.birth_date ? formatBirthDate(player.birth_date) : 'N/A'}
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
  {player.family?.work_bond_check_status && player.family.work_bond_check_status.trim() !== '' ? (
    <div>
      {player.family.work_bond_check_status.includes('Exempt') ? (
        <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full mb-1">
          Exempt
        </span>
      ) : player.family.work_bond_check_received ? (
        <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full mb-1">
          Received
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full mb-1">
          Not Received
        </span>
      )}
      <div className="text-xs text-gray-500 whitespace-pre-line">
        {player.family.work_bond_check_status}
      </div>
    </div>
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

                  {/* Primary Guardian Column - UPDATED */}
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
                        {/* Only show volunteer role if this person is actually a volunteer */}
                        {player.volunteers?.some(v => {
                          const volunteerName = v.name || '';
                          const guardianName = player.family.primary_contact_name || '';
                          const volunteerEmail = v.email || '';
                          const guardianEmail = player.family.primary_contact_email || '';
                          
                          // Match by exact name or email
                          return (volunteerName.trim().toLowerCase() === guardianName.trim().toLowerCase()) ||
                                 (volunteerEmail.trim().toLowerCase() === guardianEmail.trim().toLowerCase());
                        }) && (
                          <div className="mt-1">
                            <span className="text-xs font-medium text-gray-500">Volunteer: </span>
                            {player.volunteers
                              .filter(v => {
                                const volunteerName = v.name || '';
                                const guardianName = player.family.primary_contact_name || '';
                                const volunteerEmail = v.email || '';
                                const guardianEmail = player.family.primary_contact_email || '';
                                
                                return (volunteerName.trim().toLowerCase() === guardianName.trim().toLowerCase()) ||
                                       (volunteerEmail.trim().toLowerCase() === guardianEmail.trim().toLowerCase());
                              })
                              .map((volunteer, idx) => (
                                <span key={idx} className={`text-xs ${volunteer.is_approved ? 'text-green-600 font-medium' : 'text-blue-600'}`}>
                                  {volunteer.role}
                                  {volunteer.is_approved && ' (Selected)'}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Not provided</span>
                    )}
                  </td>

                  {/* Secondary Guardian Column - UPDATED */}
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
                        {/* Only show volunteer role if this person is actually a volunteer */}
                        {player.volunteers?.some(v => {
                          const volunteerName = v.name || '';
                          const guardianName = `${player.family.parent2_first_name} ${player.family.parent2_last_name}`.trim();
                          const volunteerEmail = v.email || '';
                          const guardianEmail = player.family.parent2_email || '';
                          
                          // Match by exact name or email
                          return (volunteerName.trim().toLowerCase() === guardianName.trim().toLowerCase()) ||
                                 (volunteerEmail.trim().toLowerCase() === guardianEmail.trim().toLowerCase());
                        }) && (
                          <div className="mt-1">
                            <span className="text-xs font-medium text-gray-500">Volunteer: </span>
                            {player.volunteers
                              .filter(v => {
                                const volunteerName = v.name || '';
                                const guardianName = `${player.family.parent2_first_name} ${player.family.parent2_last_name}`.trim();
                                const volunteerEmail = v.email || '';
                                const guardianEmail = player.family.parent2_email || '';
                                
                                return (volunteerName.trim().toLowerCase() === guardianName.trim().toLowerCase()) ||
                                       (volunteerEmail.trim().toLowerCase() === guardianEmail.trim().toLowerCase());
                              })
                              .map((volunteer, idx) => (
                                <span key={idx} className={`text-xs ${volunteer.is_approved ? 'text-green-600 font-medium' : 'text-blue-600'}`}>
                                  {volunteer.role}
                                  {volunteer.is_approved && ' (Selected)'}
                                </span>
                              ))}
                          </div>
                        )}
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
      {/* Team Edit Modal (only team assignment) */}
      {showTeamEditModal && editingPlayer && (
        <Modal
          isOpen={showTeamEditModal}
          onClose={() => {
            setShowTeamEditModal(false);
            setEditingPlayer(null);
          }}
          title="Change Player Team"
        >
          <div className="space-y-4">
            <div className="text-sm text-gray-700">
              <div className="font-medium text-gray-900">
                {editingPlayer.first_name} {editingPlayer.last_name}
              </div>
              <div className="text-gray-600">
                Division: {editingPlayer.division?.name || editingPlayer.program_title || 'Unknown'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                value={editTeamId}
                onChange={(e) => setEditTeamId(e.target.value)}
              >
                <option value="">No Team</option>
                {(teams || [])
                  .filter(t => {
                    // filter teams by the player's division
                    const playerDivId = editingPlayer.division_id || editingPlayer.division?.id;
                    return !playerDivId || t.division_id === playerDivId;
                  })
                  .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowTeamEditModal(false);
                  setEditingPlayer(null);
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={savingTeam}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveTeamChange}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={savingTeam}
              >
                {savingTeam ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ADD: Status Edit Modal */}
      {showStatusEditModal && editingPlayer && (
        <Modal
          isOpen={showStatusEditModal}
          onClose={() => {
            setShowStatusEditModal(false);
            setEditingPlayer(null);
          }}
          title="Change Player Status"
        >
          <div className="space-y-4">
            <div className="text-sm text-gray-700">
              <div className="font-medium text-gray-900">
                {editingPlayer.first_name} {editingPlayer.last_name}
              </div>
              <div className="text-gray-600">
                Division: {editingPlayer.division?.name || editingPlayer.program_title || 'Unknown'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                • Active: Player is currently participating<br/>
                • Withdrawn: Player dropped out during the season<br/>
                • Inactive: Player is not active for other reasons
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowStatusEditModal(false);
                  setEditingPlayer(null);
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={savingStatus}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveStatusChange}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={savingStatus}
              >
                {savingStatus ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Players;