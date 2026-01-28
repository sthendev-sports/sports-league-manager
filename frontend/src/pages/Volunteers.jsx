import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Download, Upload, Filter, Mail, Phone, Edit, Trash2, Save, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import CSVImport from '../components/CSVImport';
import CSVTemplate from '../components/CSVTemplate';
import VolunteerReports from '../components/VolunteerReports';
import Modal from '../components/Modal';
import { getPermissionErrorMessage } from '../utils/permissionHelpers';

function getLastName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

const Volunteers = () => {
  const [volunteers, setVolunteers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [trainingFilter, setTrainingFilter] = useState('');
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState(null);
  const [activeTab, setActiveTab] = useState('manage');
  const [volunteerTrainings, setVolunteerTrainings] = useState([]);
  const [availableVolunteerTrainings, setAvailableVolunteerTrainings] = useState([]);
  const [newVolunteer, setNewVolunteer] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Parent',
    division_id: '',
    season_id: '',
    team_id: '',
    notes: '',
    training_completed: false,
    volunteer_id: '', // ADDED
    volunteer_type_id: '' // ADDED
  });
  // Add import results state
  const [importResults, setImportResults] = useState(null);

  // ✅ Helper: fetch that automatically includes your login token
  const authFetch = (url, options = {}) => {
    const token = localStorage.getItem('slm_token');

    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  // ✅ Helper: produce a clear message for 401/403 (no token vs no permission)
  const buildAuthErrorMessage = async (response, fallback = 'Request failed') => {
    const status = response?.status;

    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch (e) {
      bodyText = '';
    }

    if (status === 401) {
      return 'You are not logged in (401). Please log in again and retry.';
    }

    if (status === 403) {
      // Prefer server-provided error if it exists
      try {
        const parsed = bodyText ? JSON.parse(bodyText) : null;
        if (parsed?.error) return parsed.error;
      } catch (e) {}
      return 'Your role is not allowed to perform this action (403).';
    }

    // Other errors
    return `${fallback}. HTTP ${status}${bodyText ? `: ${bodyText}` : ''}`;
  };

  useEffect(() => {
    loadInitialData();
    loadAvailableVolunteerTrainings();
  }, []);

  useEffect(() => {
    // Load divisions when season changes
    if (selectedSeason) {
      loadDivisions();
    }
  }, [selectedSeason]);

  useEffect(() => {
    // Only load volunteers once a season is selected (default is Active season)
    if (selectedSeason) {
      loadVolunteers();
    }
  }, [selectedDivision, selectedSeason]);

  // When editing a volunteer and their division/season changes, reload teams for those filters
  useEffect(() => {
    if (editingVolunteer && showAddForm) {
      const loadTeamsForCurrentDivision = async () => {
        const divisionId = editingVolunteer.division_id;
        const seasonId = editingVolunteer.season_id;

        if (divisionId && seasonId) {
          await loadTeams({ division_id: divisionId, season_id: seasonId });
        } else if (divisionId) {
          await loadTeams({ division_id: divisionId });
        } else if (seasonId) {
          await loadTeams({ season_id: seasonId });
        } else {
          await loadTeams(); // Load all teams
        }
      };

      loadTeamsForCurrentDivision();
    }
  }, [editingVolunteer?.division_id, editingVolunteer?.season_id, showAddForm]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        // Removed loadDivisions() from here - it will be loaded when season is selected
        loadTeams(),
        loadSeasons()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load initial data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadVolunteers = async () => {
    try {
      setError(null);

      let url = '/api/volunteers';
      const params = new URLSearchParams();

      if (selectedDivision) params.append('division_id', selectedDivision);
      if (selectedSeason) params.append('season_id', selectedSeason);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      console.log('Loading volunteers from:', url);

      const response = await authFetch(url);
      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to load volunteers'));
      }

      const data = await response.json();
      console.log('Loaded volunteers with relationships:', data);
      setVolunteers(
        (data || []).slice().sort((a, b) => {
          const al = getLastName(a?.name);
          const bl = getLastName(b?.name);
          if (al < bl) return -1;
          if (al > bl) return 1;
          return String(a?.name || '').localeCompare(String(b?.name || ''));
        })
      );
    } catch (error) {
      console.error('Error loading volunteers:', error);
      setError(error.message || ('Failed to load volunteers.'));
      setVolunteers([]);
    }
  };

  const loadAvailableVolunteerTrainings = async () => {
    try {
      const response = await authFetch('/api/trainings?category=volunteer');
      if (response.ok) {
        const data = await response.json();
        setAvailableVolunteerTrainings(data || []);
      } else {
        // Don't hard-fail the page if trainings can't load
        console.warn('Failed to load volunteer trainings:', response.status);
      }
    } catch (error) {
      console.error('Error loading volunteer trainings:', error);
    }
  };

  const loadDivisions = async () => {
    try {
      console.log('Loading divisions for season:', selectedSeason);
      let url = '/api/divisions';

      // Add season filter if a season is selected
      if (selectedSeason) {
        url += `?season_id=${selectedSeason}`;
      }

      const response = await authFetch(url);
      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to load divisions'));
      }
      const data = await response.json();
      console.log('Loaded divisions:', data);
      setDivisions(data || []);
    } catch (error) {
      console.error('Error loading divisions:', error);
      setError(prev => prev ? prev + ' | ' + error.message : 'Failed to load divisions: ' + error.message);
      setDivisions([]);
    }
  };

  const loadTeams = async (filters = {}) => {
    try {
      console.log('Loading teams with filters:', filters);

      let url = '/api/teams';
      const params = new URLSearchParams();

      // Only add filters if they exist and are not empty
      if (filters.division_id) params.append('division_id', filters.division_id);
      if (filters.season_id) params.append('season_id', filters.season_id);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await authFetch(url);
      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to load teams'));
      }
      const data = await response.json();
      console.log('Loaded teams:', data.length, 'teams');
      setTeams(data || []);
    } catch (error) {
      console.error('Error loading teams:', error);
      setTeams([]);
    }
  };

  const loadSeasons = async () => {
    try {
      console.log('Loading seasons...');
      const response = await authFetch('/api/seasons');
      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to load seasons'));
      }
      const data = await response.json();
      console.log('Loaded seasons:', data);
      setSeasons(data || []);

      // Set default season if none selected
      if (data.length > 0 && !selectedSeason) {
        setSelectedSeason(data[0].id);
        // Also set in new volunteer form
        setNewVolunteer(prev => ({ ...prev, season_id: data[0].id }));
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
      setError(prev => prev ? prev + ' | ' + error.message : 'Failed to load seasons: ' + error.message);
      setSeasons([]);
    }
  };

  const parseCSV = (csvText) => {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

    return lines.slice(1).filter(line => line.trim()).map(line => {
      const values = line.split(',').map(v => v.trim());
      const volunteer = {};

      headers.forEach((header, index) => {
        volunteer[header] = values[index] || '';
      });

      return volunteer;
    });
  };

  const handleImportVolunteers = async (csvText, seasonId) => {
    try {
      const parsedData = parseCSV(csvText);
      const response = await authFetch('/api/volunteers/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          volunteers: parsedData,
          season_id: seasonId
        })
      });

      if (!response.ok) {
        // keep your original pattern but with clearer auth messages
        throw new Error(await buildAuthErrorMessage(response, 'Failed to import volunteers'));
      }

      const responseJson = await response.json();

      await loadVolunteers();

      return {
        success: true,
        message: 'Volunteers imported successfully',
        data: responseJson
      };
    } catch (error) {
  console.error('Error importing volunteers:', error);
  
  // Use the shared helper function
  const errorMessage = getPermissionErrorMessage(
    error,
    'Your role does not have permission to import volunteers.'
  );
  
  throw new Error(errorMessage);
}
  };



  const handleAddVolunteer = async (e) => {
    if (e) e.preventDefault();
    try {
      // Determine which data to use - editing existing or creating new
      const isEditing = !!editingVolunteer;
      const volunteerData = isEditing
        ? { ...editingVolunteer }
        : { ...newVolunteer };

      console.log('Submitting volunteer data:', volunteerData);
      console.log('Editing mode:', isEditing);

      // Validate required fields
      if (!volunteerData.name) throw new Error('Name is required');
      if (!volunteerData.role) throw new Error('Role is required');
      if (!volunteerData.division_id) throw new Error('Division is required');
      if (!volunteerData.season_id) throw new Error('Season is required');

      // Remove relationship objects that shouldn't be sent to the API
      const cleanVolunteerData = { ...volunteerData };
      delete cleanVolunteerData.division;
      delete cleanVolunteerData.season;
      delete cleanVolunteerData.team;

      // Ensure we have all required fields for your schema
      const completeVolunteerData = {
        ...cleanVolunteerData,
        background_check_completed: 'pending',
        background_check_complete: false,
        is_approved: false,
        shifts_completed: 0,
        shifts_required: 0,
        can_pickup: false,
        family_id: null,
        player_id: null
      };

      // Remove empty team_id if it's an empty string
      if (completeVolunteerData.team_id === '') {
        completeVolunteerData.team_id = null;
      }

      const url = isEditing ? `/api/volunteers/${editingVolunteer.id}` : '/api/volunteers';
      const method = isEditing ? 'PUT' : 'POST';

      console.log(`Making ${method} request to: ${url}`);
      console.log('Complete volunteer data (cleaned):', completeVolunteerData);

      const response = await authFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(completeVolunteerData)
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to save volunteer'));
      }

      const result = await response.json();
      console.log('Success response:', result);

      // Reload the volunteers list
      await loadVolunteers();

      // Reset the form AND close the modal
      resetVolunteerForm();
      setShowAddForm(false);

      // Show success message
      setError(null);
      alert(isEditing ? 'Volunteer updated successfully!' : 'Volunteer added successfully!');
    } catch (error) {
  console.error('Error saving volunteer:', error);
  
  // Use the shared helper function
  const errorMessage = getPermissionErrorMessage(
    error,
    'Your role does not have permission to update volunteers.'
  );
  
  // Show popup alert
  alert(errorMessage);
  
  // Also show in the UI error area
  setError(errorMessage);
}
  };

  const resetVolunteerForm = () => {
    setNewVolunteer({
      name: '',
      email: '',
      phone: '',
      role: 'Parent',
      division_id: '',
      season_id: seasons[0]?.id || '',
      team_id: '',
      notes: '',
      training_completed: false,
      volunteer_id: '', // ADDED
      volunteer_type_id: '' // ADDED
    });
    setEditingVolunteer(null);
    setShowAddForm(false);
  };

  const handleEditVolunteer = async (volunteer) => {
    console.log('Editing volunteer:', volunteer);

    // Extract division_id from volunteer object (could be direct property or nested in division object)
    const divisionId = volunteer.division_id || volunteer.division?.id || '';
    const seasonId = volunteer.season_id || volunteer.season?.id || seasons[0]?.id || '';

    setEditingVolunteer({
      ...volunteer,
      division_id: divisionId,
      season_id: seasonId,
      team_id: volunteer.team_id || '',
      training_completed: volunteer.training_completed || false
    });

    // Load teams - handle different scenarios
    if (divisionId && seasonId) {
      await loadTeams({ division_id: divisionId, season_id: seasonId });
    } else if (divisionId) {
      await loadTeams({ division_id: divisionId });
    } else if (seasonId) {
      await loadTeams({ season_id: seasonId });
    } else {
      await loadTeams();
    }

    // Load volunteer's trainings
    if (volunteer.id) {
      try {
        const response = await authFetch(`/api/trainings/volunteer/${volunteer.id}`);
        if (response.ok) {
          const data = await response.json();
          setVolunteerTrainings(data || []);
        } else {
          console.warn('Failed to load volunteer trainings:', response.status);
        }
      } catch (error) {
        console.error('Error loading volunteer trainings:', error);
      }
    }

    setShowAddForm(true);
  };

  const handleVolunteerTrainingChange = async (trainingId, completed, date) => {
    try {
      const response = await authFetch(`/api/trainings/volunteer/${editingVolunteer.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trainings: availableVolunteerTrainings.map(training => {
            const existing = volunteerTrainings.find(t => t.training_id === training.id);
            if (training.id === trainingId) {
              return {
                training_id: trainingId,
                completed_date: completed ? (date || new Date().toISOString().split('T')[0]) : null,
                status: completed ? 'completed' : 'pending'
              };
            }
            return existing ? {
              training_id: existing.training_id,
              completed_date: existing.completed_date,
              status: existing.status
            } : {
              training_id: training.id,
              completed_date: null,
              status: 'pending'
            };
          })
        })
      });

      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to update training'));
      }

      const updatedTrainings = await response.json();
      setVolunteerTrainings(updatedTrainings);
    } catch (error) {
  console.error('Error updating volunteer training:', error);
  
  // Use the shared helper function
  const errorMessage = getPermissionErrorMessage(
    error,
    'Your role does not have permission to update volunteer trainings.'
  );
  
  // Show popup alert
  alert(errorMessage);
  
  // Also show in the UI error area
  setError(errorMessage);
}
  };

  const handleDeleteVolunteer = async (volunteerId) => {
    if (!confirm('Are you sure you want to delete this volunteer?')) return;

    try {
      const response = await authFetch(`/api/volunteers/${volunteerId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'Failed to delete volunteer'));
      }

      await loadVolunteers();
    } catch (error) {
  console.error('Error deleting volunteer:', error);
  
  // Use the shared helper function
  const errorMessage = getPermissionErrorMessage(
    error,
    'Your role does not have permission to delete volunteers.'
  );
  
  // Show popup alert
  alert(errorMessage);
  
  // Also show in the UI error area
  setError(errorMessage);
}
  };

  // (left in place from your existing file)
  const testVolunteerAPI = async () => {
    try {
      const testData = {
        name: "Test Volunteer",
        email: "test@example.com",
        phone: "555-123-4567",
        role: "Parent",
        division_id: divisions[0]?.id,
        season_id: seasons[0]?.id,
        team_id: teams[0]?.id,
        notes: "Test volunteer from debug",
        training_completed: false
      };

      console.log('Testing API with:', testData);

      const response = await authFetch('/api/volunteers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      if (!response.ok) {
        throw new Error(await buildAuthErrorMessage(response, 'API test failed'));
      }

      const result = await response.json();
      console.log('API test successful:', result);
      alert('Test volunteer created successfully!');
      await loadVolunteers();
    } catch (error) {
      console.error('API test failed:', error);
      alert('API test failed: ' + error.message);
    }
  };

  // ✅ UPDATED: search includes interested_roles and training filter
  const filteredVolunteers = volunteers.filter(volunteer => {
    const term = searchTerm.toLowerCase();

    const matchesSearch = !searchTerm ||
      volunteer.name?.toLowerCase().includes(term) ||
      volunteer.email?.toLowerCase().includes(term) ||
      volunteer.role?.toLowerCase().includes(term) ||
      volunteer.interested_roles?.toLowerCase().includes(term);

    const matchesTraining = !trainingFilter ||
      (trainingFilter === 'completed' && volunteer.training_completed) ||
      (trainingFilter === 'pending' && !volunteer.training_completed);

    return matchesSearch && matchesTraining;
  });

  const roleColors = {
    'Manager': 'bg-blue-100 text-blue-800',
    'Coach': 'bg-green-100 text-green-800',
    'Assistant Coach': 'bg-emerald-100 text-emerald-800',
    'Team Parent': 'bg-purple-100 text-purple-800',
    'Umpire': 'bg-orange-100 text-orange-800',
    'Field Maintenance': 'bg-amber-100 text-amber-800',
    'Concession': 'bg-pink-100 text-pink-800',
    'Board Member': 'bg-indigo-100 text-indigo-800',
    'Parent': 'bg-gray-100 text-gray-800'
  };

  // Volunteer Modal Footer
  const VolunteerModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={resetVolunteerForm}
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
        onClick={handleAddVolunteer}
        disabled={
          editingVolunteer
            ? !editingVolunteer.name || !editingVolunteer.division_id || !editingVolunteer.season_id
            : !newVolunteer.name || !newVolunteer.division_id || !newVolunteer.season_id
        }
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (
            editingVolunteer
              ? (!editingVolunteer.name || !editingVolunteer.division_id || !editingVolunteer.season_id)
              : (!newVolunteer.name || !newVolunteer.division_id || !newVolunteer.season_id)
          ) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (
            editingVolunteer
              ? (!editingVolunteer.name || !editingVolunteer.division_id || !editingVolunteer.season_id)
              : (!newVolunteer.name || !newVolunteer.division_id || !newVolunteer.season_id)
          ) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          const isDisabled = editingVolunteer
            ? (!editingVolunteer.name || !editingVolunteer.division_id || !editingVolunteer.season_id)
            : (!newVolunteer.name || !newVolunteer.division_id || !newVolunteer.season_id);

          if (!isDisabled) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          const isDisabled = editingVolunteer
            ? (!editingVolunteer.name || !editingVolunteer.division_id || !editingVolunteer.season_id)
            : (!newVolunteer.name || !newVolunteer.division_id || !newVolunteer.season_id);

          if (!isDisabled) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingVolunteer ? 'Update Volunteer' : 'Add Volunteer'}
      </button>
    </div>
  );

  // Volunteer Form Content
  const VolunteerFormContent = (
    <form onSubmit={handleAddVolunteer} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Name *
        </label>
        <input
          type="text"
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
          value={editingVolunteer ? editingVolunteer.name : newVolunteer.name}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, name: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, name: e.target.value }))
          }
          placeholder="Enter volunteer name"
        />
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Email
        </label>
        <input
          type="email"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? editingVolunteer.email : newVolunteer.email}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, email: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, email: e.target.value }))
          }
          placeholder="volunteer@email.com"
        />
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Phone
        </label>
        <input
          type="tel"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? editingVolunteer.phone : newVolunteer.phone}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, phone: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, phone: e.target.value }))
          }
          placeholder="(555) 123-4567"
        />
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Role *
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
          value={editingVolunteer ? editingVolunteer.role : newVolunteer.role}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, role: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, role: e.target.value }))
          }
        >
          <option value="Parent">Parent</option>
          <option value="Manager">Manager</option>
          <option value="Coach">Coach</option>
          <option value="Assistant Coach">Assistant Coach</option>
          <option value="Team Parent">Team Parent</option>
          <option value="Umpire">Umpire</option>
          <option value="Field Maintenance">Field Maintenance</option>
          <option value="Concession">Concession</option>
          <option value="Board Member">Board Member</option>
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
          Interested Roles
        </label>
        <input
          type="text"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? editingVolunteer.interested_roles || '' : newVolunteer.interested_roles || ''}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, interested_roles: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, interested_roles: e.target.value }))
          }
          placeholder="Manager, Assistant Coach, Team Parent"
        />
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          Enter comma-separated roles (e.g., "Manager, Assistant Coach, Team Parent")
        </p>
      </div>

      {/* ADDED: Volunteer ID Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Volunteer ID
        </label>
        <input
          type="text"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? editingVolunteer.volunteer_id || '' : newVolunteer.volunteer_id || ''}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, volunteer_id: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, volunteer_id: e.target.value }))
          }
          placeholder="Volunteer ID from external system"
        />
      </div>

      {/* ADDED: Volunteer Type ID Field */}
      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Volunteer Type ID
        </label>
        <input
          type="text"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? editingVolunteer.volunteer_type_id || '' : newVolunteer.volunteer_type_id || ''}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, volunteer_type_id: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, volunteer_type_id: e.target.value }))
          }
          placeholder="Volunteer Type ID from external system"
        />
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Division *
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
          value={editingVolunteer ? editingVolunteer.division_id : newVolunteer.division_id}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, division_id: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, division_id: e.target.value }))
          }
        >
          <option value="">Select Division</option>
          {divisions.map(division => (
            <option key={division.id} value={division.id}>{division.name}</option>
          ))}
        </select>
        {divisions.length === 0 && (
          <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
            <AlertCircle style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} />
            No divisions available. Please create divisions first.
          </div>
        )}
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Season *
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
          value={editingVolunteer ? editingVolunteer.season_id : newVolunteer.season_id}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, season_id: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, season_id: e.target.value }))
          }
        >
          <option value="">Select Season</option>
          {seasons.map(season => (
            <option key={season.id} value={season.id}>{season.name}</option>
          ))}
        </select>
        {seasons.length === 0 && (
          <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
            <AlertCircle style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} />
            No seasons available. Please create seasons first.
          </div>
        )}
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Team Assignment
        </label>
        <select
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? editingVolunteer.team_id : newVolunteer.team_id}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, team_id: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, team_id: e.target.value }))
          }
        >
          <option value="">Unallocated (No Team)</option>
          {teams.map(team => (
            <option key={team.id} value={team.id}>
              {team.name} - {team.division?.name || 'No Division'}
            </option>
          ))}
        </select>
        {teams.length === 0 && (
          <div style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px' }}>
            No teams available for this division/season combination.
            {(!editingVolunteer?.division_id && !newVolunteer.division_id) && (
              <span> Select a division first to see teams.</span>
            )}
          </div>
        )}
      </div>

      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Notes
        </label>
        <textarea
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white',
            minHeight: '80px',
            resize: 'vertical'
          }}
          value={editingVolunteer ? editingVolunteer.notes : newVolunteer.notes}
          onChange={(e) => editingVolunteer
            ? setEditingVolunteer(prev => ({ ...prev, notes: e.target.value }))
            : setNewVolunteer(prev => ({ ...prev, notes: e.target.value }))
          }
          placeholder="Additional notes about this volunteer..."
        />
      </div>

      <div>
        <label
          htmlFor="background_check_completed"
          style={{
            display: 'block',
            fontSize: '14px',
            fontWeight: '500',
            color: '#374151',
            marginBottom: '8px'
          }}
        >
          Background Check Status
        </label>
        <input
          id="background_check_completed"
          type="text"
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            color: '#374151',
            backgroundColor: 'white'
          }}
          value={editingVolunteer ? (editingVolunteer.background_check_completed || '') : (newVolunteer.background_check_completed || '')}
          onChange={(e) =>
            editingVolunteer
              ? setEditingVolunteer(prev => ({ ...prev, background_check_completed: e.target.value }))
              : setNewVolunteer(prev => ({ ...prev, background_check_completed: e.target.value }))
          }
          placeholder="pending / completed / etc"
        />
        <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
          This is populated from the CSV column "verification status" during import.
        </p>
      </div>

      {/* Trainings Section */}
      <div>
        <h3 className="text-md font-medium text-gray-900 mb-4">Volunteer Trainings</h3>
        <div className="space-y-3">
          {availableVolunteerTrainings.map(training => {
            const volunteerTraining = volunteerTrainings.find(t => t.training_id === training.id);
            const isCompleted = volunteerTraining?.status === 'completed';
            const isExpired = volunteerTraining?.status === 'expired';
            const completionDate = volunteerTraining?.completed_date;

            return (
              <div key={training.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center">
                    <div className="font-medium text-gray-900">{training.name}</div>
                    {training.is_required && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        *Required
                      </span>
                    )}
                  </div>
                  {training.description && (
                    <div className="text-sm text-gray-500 mt-1">{training.description}</div>
                  )}
                  {training.expires_in_days && (
                    <div className="text-xs text-gray-400 mt-1">
                      Expires {training.expires_in_days} days after completion
                    </div>
                  )}
                  {training.expires_on_date && (
                    <div className="text-xs text-gray-400 mt-1">
                      All completions expire on: {training.expires_on_date}
                    </div>
                  )}

                  {completionDate && (
                    <div className={`text-xs mt-1 ${isExpired ? 'text-red-600' : 'text-green-600'}`}>
                      {isExpired ? 'Expired: ' : 'Completed: '}{completionDate}
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {isCompleted && !isExpired && (
                    <span className="text-xs text-green-600">✓</span>
                  )}
                  {isExpired && (
                    <span className="text-xs text-red-600">✗</span>
                  )}
                  <input
                    type="checkbox"
                    checked={isCompleted && !isExpired}
                    onChange={(e) => {
                      if (editingVolunteer && editingVolunteer.id) {
                        if (e.target.checked) {
                          const today = new Date();
                          const mm = String(today.getMonth() + 1).padStart(2, '0');
                          const dd = String(today.getDate()).padStart(2, '0');
                          const yyyy = today.getFullYear();
                          const defaultDate = `${mm}/${dd}/${yyyy}`;

                          const dateInput = window.prompt(
                            `Enter completion date for "${training.name}" (MM/DD/YYYY):`,
                            defaultDate
                          );

                          if (dateInput !== null) {
                            const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
                            if (!dateRegex.test(dateInput)) {
                              alert('Please enter date in MM/DD/YYYY format (e.g., 01/15/2024)');
                              return;
                            }

                            const [month, day, year] = dateInput.split('/');
                            const dbDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

                            handleVolunteerTrainingChange(training.id, true, dbDate);
                          }
                        } else {
                          if (window.confirm(`Mark "${training.name}" as not completed?`)) {
                            handleVolunteerTrainingChange(training.id, false);
                          }
                        }
                      } else {
                        alert('Please save the volunteer first before managing trainings');
                      }
                    }}
                    className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    disabled={!editingVolunteer || !editingVolunteer.id}
                    title={!editingVolunteer || !editingVolunteer.id ? "Save volunteer first" : `Mark ${training.name} as completed`}
                  />
                </div>
              </div>
            );
          })}

          {availableVolunteerTrainings.length === 0 && (
            <div className="text-center py-4 text-gray-500 border border-gray-200 rounded-lg">
              No volunteer trainings configured. Add trainings in the Configuration page.
            </div>
          )}
        </div>
      </div>
    </form>
  );

  if (loading && activeTab === 'manage') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading volunteers...</span>
      </div>
    );
  }

  // Helper: render interested roles as small pills (or blank)
  const renderInterestedRoles = (text) => {
    if (!text) return null;

    const roles = text
      .split(/[;,/]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (roles.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {roles.map((roleName, idx) => (
          <span
            key={idx}
            className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
          >
            {roleName}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Volunteers</h1>
            <p className="text-gray-600 mt-1">Manage parent volunteers for teams</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {activeTab === 'manage' && (
              <>
                <CSVTemplate
                  templateType="volunteers"
                  headers={[
                    'Signup Date',
                    'Division Name',
                    'Volunteer Role',
                    'Team Name',
                    'Volunteer First Name',
                    'Volunteer Last Name',
                    'Volunteer Email Address',
                    'Volunteer Cellphone'
                  ]}
                />

                <CSVImport
                  onImport={async (csvText, seasonId) => {
                    const result = await handleImportVolunteers(csvText, seasonId);
                    setImportResults(result);
                    return result;
                  }}
                  importType="volunteers"
                  seasons={seasons}
                />

                <button
                  onClick={() => {
                    setEditingVolunteer(null);
                    setShowAddForm(true);
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Volunteer
                </button>

                <button
                  onClick={testVolunteerAPI}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  Test API
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <div className="text-red-800">
              <strong>Error:</strong> {error}
            </div>
          </div>
          <button
            onClick={loadInitialData}
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            Retry Loading Data
          </button>
        </div>
      )}

      {/* Import Results Display */}
      {importResults && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
            <div className="text-green-800">
              <strong>Import Successful!</strong> {importResults.message}
            </div>
          </div>
          <button
            onClick={() => setImportResults(null)}
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('manage')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'manage'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Manage Volunteers
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Reports
          </button>
        </nav>
      </div>

      {/* Volunteer Modal */}
      <Modal
        isOpen={showAddForm}
        onClose={resetVolunteerForm}
        title={editingVolunteer ? 'Edit Volunteer' : 'Add New Volunteer'}
        footer={VolunteerModalFooter}
      >
        {VolunteerFormContent}
      </Modal>

      {/* Manage Tab */}
      {activeTab === 'manage' ? (
        <>
          {/* Filters */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-md pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Search name, email, role, interested..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Division</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value)}
                >
                  <option value="">All Divisions</option>
                  {divisions.map(division => (
                    <option key={division.id} value={division.id}>{division.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                >
                  <option value="">All Seasons</option>
                  {seasons.map(season => (
                    <option key={season.id} value={season.id}>{season.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Training Status</label>
                <select
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  value={trainingFilter}
                  onChange={(e) => setTrainingFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
            </div>
          </div>

          {/* Volunteers Table */}
          <div className="bg-white shadow overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Volunteer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Interested Roles
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Division
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Team
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Season
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Training Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Background Check
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVolunteers.map((volunteer) => (
                    <tr key={volunteer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {volunteer.name}
                            </div>
                            {volunteer.email && (
                              <div className="flex items-center text-sm text-gray-500 mt-1">
                                <Mail className="h-3 w-3 mr-1" />
                                {volunteer.email}
                              </div>
                            )}
                            {volunteer.phone && (
                              <div className="flex items-center text-sm text-gray-500 mt-1">
                                <Phone className="h-3 w-3 mr-1" />
                                {volunteer.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleColors[volunteer.role] || 'bg-gray-100 text-gray-800'}`}>
                          {volunteer.role}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-900">
                        {renderInterestedRoles(volunteer.interested_roles)}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-900">
                        {volunteer.division?.name || 'Any Division'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {volunteer.team?.name || 'Unallocated'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {volunteer.season?.name || 'N/A'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {volunteer.trainings_summary && volunteer.trainings_summary.total > 0 ? (
                            <>
                              <div className="flex items-center">
                                <div className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${
                                  volunteer.trainings_summary.all_required_completed
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {volunteer.trainings_summary.completed}/{volunteer.trainings_summary.total} trainings
                                </div>
                              </div>
                              {volunteer.trainings_summary.required > 0 && (
                                <div className="text-xs text-gray-600">
                                  Required: {volunteer.trainings_summary.completed_required}/{volunteer.trainings_summary.required}
                                </div>
                              )}
                              {volunteer.trainings_summary.expired > 0 && (
                                <div className="text-xs text-red-600">
                                  {volunteer.trainings_summary.expired} expired
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-xs text-gray-500">No trainings</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {volunteer.background_check_completed || 'pending'}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <button
                          onClick={() => handleEditVolunteer(volunteer)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          <Edit className="h-4 w-4 inline mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteVolunteer(volunteer.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4 inline mr-1" />
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredVolunteers.length === 0 && (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No volunteers found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm || selectedDivision || selectedSeason || trainingFilter
                    ? 'Try adjusting your search terms or filters'
                    : 'Get started by adding volunteers manually or importing from CSV'
                  }
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <VolunteerReports />
      )}
    </div>
  );
};

export default Volunteers;
