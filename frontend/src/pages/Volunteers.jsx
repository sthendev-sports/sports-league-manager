import React, { useState, useEffect } from 'react';
import { Users, Plus, Search, Download, Upload, Filter, Mail, Phone, Edit, Trash2, Save, AlertCircle, CheckCircle } from 'lucide-react';
import CSVImport from '../components/CSVImport';
import CSVTemplate from '../components/CSVTemplate';
import VolunteerReports from '../components/VolunteerReports';
import Modal from '../components/Modal';
import api, { divisionsAPI, teamsAPI, seasonsAPI, volunteersAPI } from '../services/api';


const Volunteers = () => {
  const [volunteers, setVolunteers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [teams, setTeams] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedSeason, setSelectedSeason] = useState('');
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVolunteer, setEditingVolunteer] = useState(null);
  const [activeTab, setActiveTab] = useState('manage');
  const [newVolunteer, setNewVolunteer] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'Parent',
    division_id: '',
    season_id: '',
    team_id: '',
    notes: ''
  });
  // Add import results state
  const [importResults, setImportResults] = useState(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedSeason || selectedDivision) {
      loadVolunteers();
    }
  }, [selectedDivision, selectedSeason]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadVolunteers(),
        loadDivisions(),
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
    
    // Add include parameter to get related data
    //params.append('include', 'division,team,season');
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    console.log('Loading volunteers from:', url);
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Loaded volunteers with relationships:', data);
    setVolunteers(data || []);
  } catch (error) {
    console.error('Error loading volunteers:', error);
    setError('Failed to load volunteers. ' + error.message);
    setVolunteers([]);
  }
};

  const loadDivisions = async () => {
  try {
    console.log('Loading divisions...');
    const response = await divisionsAPI.getAll();
    const data = response.data;
    console.log('Loaded divisions:', data);
    setDivisions(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading divisions:', error);
    setError(prev => prev ? prev + ' | ' + error.message : 'Failed to load divisions: ' + error.message);
    setDivisions([]);
  }
};

const loadTeams = async () => {
  try {
    console.log('Loading teams...');
    const response = await teamsAPI.getAll();
    const data = response.data;
    console.log('Loaded teams:', data);
    setTeams(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading teams:', error);
    setError(prev => prev ? prev + ' | ' + error.message : 'Failed to load teams: ' + error.message);
    setTeams([]);
  }
};

const loadSeasons = async () => {
  try {
    console.log('Loading seasons...');
    const response = await seasonsAPI.getAll();
    const data = response.data;
    console.log('Loaded seasons:', data);
    setSeasons(Array.isArray(data) ? data : []);

    if (data.length > 0 && !selectedSeason) {
      setSelectedSeason(data[0].id);
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

    const response = await api.post('/volunteers/import', {
      volunteers: parsedData,
      season_id: seasonId,
    });

    const result = response.data;
    console.log('Import result:', result);
    await loadVolunteers();
  } catch (error) {
    throw new Error(error.message);
  }
};


  const handleAddVolunteer = async (e) => {
  if (e) e.preventDefault();

  try {
    // Are we editing an existing volunteer or creating new?
    const isEditing = !!editingVolunteer;
    const source = isEditing ? editingVolunteer : newVolunteer;

    console.log('Submitting volunteer data:', source);
    console.log('Editing mode:', isEditing);

    // Strip relational objects that should not be sent
    const {
      division,
      season,
      team,
      ...cleanSource
    } = source || {};

    // Build data matching backend schema, with safe defaults
    const volunteerData = {
      ...cleanSource,
      name: (cleanSource.name || '').trim(),
      email: cleanSource.email ? cleanSource.email.trim() : null,
      phone: cleanSource.phone ? cleanSource.phone.trim() : null,
      // Required fields
      role: cleanSource.role || 'Parent',
      division_id: cleanSource.division_id || selectedDivision || null,
      season_id:
        cleanSource.season_id ||
        selectedSeason ||
        seasons[0]?.id ||
        null,
      team_id: cleanSource.team_id || null,
      notes: cleanSource.notes || null,
      // Workbond / flags (defaults)
      background_check_completed: !!cleanSource.background_check_completed,
      background_check_complete: !!cleanSource.background_check_complete,
      is_approved: !!cleanSource.is_approved,
      shifts_completed: cleanSource.shifts_completed || 0,
      shifts_required: cleanSource.shifts_required || 0,
      can_pickup: !!cleanSource.can_pickup,
      family_id: cleanSource.family_id || null,
      player_id: cleanSource.player_id || null,
    };

    // Basic validation (frontend)
    if (!volunteerData.name) {
      throw new Error('Name is required');
    }
    if (!volunteerData.role) {
      throw new Error('Role is required');
    }
    if (!volunteerData.season_id) {
      throw new Error('Season is required');
    }
    if (!volunteerData.division_id) {
      throw new Error('Division is required');
    }

    const url = isEditing
      ? `/api/volunteers/${editingVolunteer.id}`
      : '/api/volunteers';
    const method = isEditing ? 'PUT' : 'POST';

    console.log(`Making ${method} request to: ${url}`);
    console.log('Volunteer payload being sent:', volunteerData);

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(volunteerData),
    });

    console.log('Response status:', res.status);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Server error response:', errorText);
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    const result = await res.json();
    console.log('Success response:', result);

    // Reload the volunteers list
    await loadVolunteers();

    // Reset the form
    resetVolunteerForm();

    // Clear any previous error
    setError(null);

    alert(
      isEditing
        ? 'Volunteer updated successfully!'
        : 'Volunteer added successfully!'
    );
  } catch (error) {
    console.error('Error saving volunteer:', error);
    setError('Failed to save volunteer: ' + error.message);
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
      notes: ''
    });
    setEditingVolunteer(null);
    setShowAddForm(false);
  };

  const handleEditVolunteer = (volunteer) => {
    console.log('Editing volunteer:', volunteer);
    setEditingVolunteer({
      ...volunteer,
      // Ensure we have all required fields
      division_id: volunteer.division_id || '',
      season_id: volunteer.season_id || seasons[0]?.id || '',
      team_id: volunteer.team_id || ''
    });
    setShowAddForm(true);
  };

  const handleDeleteVolunteer = async (volunteerId) => {
  if (!confirm('Are you sure you want to delete this volunteer?')) return;

  try {
    await volunteersAPI.delete(volunteerId);
    await loadVolunteers();
  } catch (error) {
    setError(error.message);
  }
};


  // Add this debug function temporarily
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
        notes: "Test volunteer from debug"
      };

      console.log('Testing API with:', testData);

      const response = await volunteersAPI.create(testData);
console.log('API test successful:', response.data);


      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
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

  const filteredVolunteers = volunteers.filter(volunteer => {
    const matchesSearch = !searchTerm || 
      volunteer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      volunteer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      volunteer.role?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
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
            <option key={team.id} value={team.id}>{team.name} - {team.division?.name || 'No Division'}</option>
          ))}
        </select>
        {teams.length === 0 && (
          <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '4px' }}>
            <AlertCircle style={{ width: '12px', height: '12px', display: 'inline', marginRight: '4px' }} />
            No teams available. Please create teams first.
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
                  headers={['Signup Date', 'Division Name', 'Volunteer Role', 'Team Name', 'Volunteer First Name', 'Volunteer Last Name', 'Volunteer Email Address', 'Volunteer Cellphone']}
                />
                <CSVImport 
                  onImport={async (csvText, seasonId) => {
                    try {
                      const result = await handleImportVolunteers(csvText, seasonId);
                      setImportResults(result);
                      return result;
                    } catch (error) {
                      throw error;
                    }
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
                {/* Temporary debug button - remove after testing */}
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
          {importResults.data && (
            <div className="mt-2 text-sm">
              <p>Shifts processed: {importResults.data.shifts?.length || 0}</p>
              <p>Volunteers created: {importResults.data.volunteers?.length || 0}</p>
            </div>
          )}
          {importResults.warnings && importResults.warnings.length > 0 && (
            <div className="mt-2">
              <p className="text-yellow-700 font-medium">Warnings:</p>
              <ul className="text-yellow-600 text-sm list-disc list-inside">
                {importResults.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
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

      {/* Tab Content */}
      {activeTab === 'manage' ? (
        <>
          {/* Search and Filter Bar */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Global Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search volunteers by name, email, or role..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Division Filter */}
              <div className="sm:w-48">
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

              {/* Season Filter */}
              <div className="sm:w-48">
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
                      Role
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
                        {volunteer.division?.name || 'Any Division'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {volunteer.team?.name || 'Unallocated'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {volunteer.season?.name || 'N/A'}
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
                  {searchTerm || selectedDivision || selectedSeason 
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