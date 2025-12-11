import React, { useState, useEffect } from 'react';
import { 
  Users, Download, Upload, Filter, Search, Plus, 
  Edit, Trash2, CheckCircle, XCircle, Clock, Link,
  Save, AlertCircle, UserPlus, Unlink, RefreshCw,
  Mail, Phone, Calendar, FileText
} from 'lucide-react';
import Modal from '../components/Modal';
import CSVImport from '../components/CSVImport';
import api, { seasonsAPI, divisionsAPI, familiesAPI } from '../services/api';

const WorkbondManagement = () => {
  const [workbondSummary, setWorkbondSummary] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [families, setFamilies] = useState([]);
  const [unmatchedImports, setUnmatchedImports] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [error, setError] = useState(null);
  const [importResults, setImportResults] = useState(null);
  
  // Modal states
  const [showRequirementsModal, setShowRequirementsModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showUnmatchedModal, setShowUnmatchedModal] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  
  // Manual shift entry
  const [newShift, setNewShift] = useState({
    family_id: '',
    volunteer_id: '',
    shift_date: new Date().toISOString().split('T')[0],
    shift_type: 'Concession Stand',
    hours_worked: 2.5,
    description: '',
    notes: ''
  });

  // Requirement entry
  const [newRequirement, setNewRequirement] = useState({
    division_id: '',
    shifts_required: 2
  });

  // Linking state
  const [linkingRecord, setLinkingRecord] = useState(null);
  const [linkSelections, setLinkSelections] = useState({
    familyId: '',
    volunteerId: ''
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      loadWorkbondData();
    }
  }, [selectedSeason]);

  const loadInitialData = async () => {
  try {
    setLoading(true);
    setError(null);
    await Promise.all([
      loadSeasons(),
      loadDivisions(),
      loadFamilies()
    ]);
  } catch (error) {
    console.error('Error loading initial data:', error);
    setError('Failed to load initial data: ' + error.message);
  } finally {
    setLoading(false);
  }
};

  const loadWorkbondData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadWorkbondSummary(),
        loadRequirements(),
        loadShifts(),
        loadUnmatchedImports()
      ]);
    } catch (error) {
      console.error('Error loading workbond data:', error);
      setError('Failed to load workbond data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSeasons = async () => {
  try {
    const response = await seasonsAPI.getAll();
    const data = response.data;
    setSeasons(Array.isArray(data) ? data : []);
    if (data.length > 0 && !selectedSeason) {
      setSelectedSeason(data[0].id);
    }
  } catch (error) {
    console.error('Error loading seasons:', error);
  }
};

const loadDivisions = async () => {
  try {
    const response = await divisionsAPI.getAll();
    const data = response.data;
    setDivisions(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading divisions:', error);
  }
};

const loadFamilies = async () => {
  try {
    const response = await familiesAPI.getAll();
    const data = response.data;
    setFamilies(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading families:', error);
  }
};


const loadWorkbondSummary = async () => {
  try {
    if (!selectedSeason) return;

    const response = await api.get('/workbond/summary', {
      params: { season_id: selectedSeason },
    });
    const data = response.data;
    setWorkbondSummary(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading workbond summary:', error);
    setWorkbondSummary([]);
  }
};

const loadRequirements = async () => {
  try {
    if (!selectedSeason) return;

    const response = await api.get('/workbond/requirements', {
      params: { season_id: selectedSeason },
    });
    const data = response.data;
    setRequirements(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading requirements:', error);
    setRequirements([]);
  }
};

const loadShifts = async () => {
  try {
    if (!selectedSeason) return;

    const response = await api.get('/workbond/shifts', {
      params: { season_id: selectedSeason },
    });
    const data = response.data;
    setShifts(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading shifts:', error);
    setShifts([]);
  }
};

const loadUnmatchedImports = async () => {
  try {
    if (!selectedSeason) return;

    const response = await api.get('/workbond/unmatched-imports', {
      params: { season_id: selectedSeason },
    });
    const data = response.data;
    setUnmatchedImports(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading unmatched imports:', error);
    setUnmatchedImports([]);
  }
};


  // Handle CSV import
  const handleImportShifts = async (csvText, seasonId) => {
  try {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    const shiftsData = lines
      .slice(1)
      .filter(line => line.trim())
      .map(line => {
        const values = line.split(',').map(v => v.trim());
        const shift = {};
        headers.forEach((header, index) => {
          shift[header] = values[index] || '';
        });
        return shift;
      });

    console.log('Importing shifts:', shiftsData.length);

    const response = await api.post('/workbond/import-shifts', {
      shifts: shiftsData,
      season_id: seasonId,
    });

    const result = response.data;
    console.log('Import result:', result);

    setImportResults(result);
    setUnmatchedImports(result.unmatchedRecords || []);

    await loadWorkbondData();
  } catch (error) {
    throw new Error('Import failed: ' + error.message);
  }
};


  // Handle manual shift entry
  const handleSaveShift = async () => {
  try {
    const shiftData = {
      ...newShift,
      season_id: selectedSeason,
      is_manual_credit: true,
    };

    if (!shiftData.family_id) {
      alert('Please select a family');
      return;
    }

    if (editingShift) {
      await api.put(`/workbond/shifts/${editingShift.id}`, shiftData);
    } else {
      await api.post('/workbond/shifts', shiftData);
    }

    await loadShifts();
    await loadWorkbondSummary();

    // Reset form
    setShowShiftModal(false);
    setNewShift({
      family_id: '',
      volunteer_id: '',
      shift_date: new Date().toISOString().split('T')[0],
      shift_type: 'Concession Stand',
      hours_worked: 2.5,
      description: '',
      notes: '',
    });
    setEditingShift(null);

    alert(editingShift ? 'Shift updated successfully!' : 'Shift added successfully!');
  } catch (error) {
    console.error('Error saving shift:', error);
    alert('Failed to save shift: ' + error.message);
  }
};


  // Handle linking unmatched import to family
  const handleLinkImport = async () => {
  if (!linkingRecord || !linkSelections.familyId) {
    alert('Please select a family to link to');
    return;
  }

  try {
    setLoading(true);

    await api.post(`/workbond/link-import/${linkingRecord.id}`, {
      family_id: linkSelections.familyId,
      season_id: selectedSeason,
    });

    await loadWorkbondData();
    setShowLinkModal(false);
    setLinkingRecord(null);
    setLinkSelections({
      familyId: '',
      volunteerName: '',
      volunteerEmail: '',
    });

    alert('Import record linked successfully!');
  } catch (error) {
    console.error('Error linking import:', error);
    alert('Failed to link import: ' + error.message);
  } finally {
    setLoading(false);
  }
};


  // Handle auto-linking for all unmatched imports
  const handleAutoLinkAll = async () => {
  if (!selectedSeason) {
    alert('Please select a season first');
    return;
  }

  if (!window.confirm('This will attempt to automatically match all unmatched imports to families. Continue?')) {
    return;
  }

  try {
    setLoading(true);

    const response = await api.post('/workbond/auto-link-all', {
      season_id: selectedSeason,
    });

    const result = response.data || {};

    await loadWorkbondData();
    alert(
      `Auto-link completed: ${result.matched || 0} matched, ${result.unmatched || 0} unmatched`
    );
  } catch (error) {
    console.error('Error auto-linking imports:', error);
    alert('Failed to auto-link imports: ' + error.message);
  } finally {
    setLoading(false);
  }
};


  // Filter summary
  const filteredSummary = (Array.isArray(workbondSummary) ? workbondSummary : []).filter(family => {
    const matchesSearch = !searchTerm || 
      family.family_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      family.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      family.family_identifier?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = !statusFilter || family.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'incomplete': return 'bg-yellow-100 text-yellow-800';
      case 'exempt': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'incomplete': return <Clock className="h-4 w-4" />;
      case 'exempt': return <XCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  // Manual Shift Form
  const ManualShiftForm = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Family *
        </label>
        <select
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          value={newShift.family_id}
          onChange={(e) => setNewShift(prev => ({ ...prev, family_id: e.target.value }))}
        >
          <option value="">Select a family...</option>
          {families.map(family => (
            <option key={family.id} value={family.id}>
              {family.primary_contact_name} ({family.family_id})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Shift Date *
        </label>
        <input
          type="date"
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          value={newShift.shift_date}
          onChange={(e) => setNewShift(prev => ({ ...prev, shift_date: e.target.value }))}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Shift Type *
        </label>
        <select
          required
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          value={newShift.shift_type}
          onChange={(e) => setNewShift(prev => ({ ...prev, shift_type: e.target.value }))}
        >
          <option value="Concession Stand">Concession Stand</option>
          <option value="Field Maintenance">Field Maintenance</option>
          <option value="Scorekeeping">Scorekeeping</option>
          <option value="Umpire">Umpire</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Hours Worked
        </label>
        <input
          type="number"
          step="0.5"
          min="0"
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          value={newShift.hours_worked}
          onChange={(e) => setNewShift(prev => ({ ...prev, hours_worked: parseFloat(e.target.value) || 0 }))}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          className="w-full border border-gray-300 rounded-md px-3 py-2"
          rows={3}
          value={newShift.description}
          onChange={(e) => setNewShift(prev => ({ ...prev, description: e.target.value }))}
          placeholder="Enter shift details..."
        />
      </div>
    </div>
  );

  // Manual Shift Modal Footer
  const ManualShiftFooter = (
    <div className="flex justify-end gap-3">
      <button
        onClick={() => setShowShiftModal(false)}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        onClick={handleSaveShift}
        disabled={!newShift.family_id}
        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <Save className="h-4 w-4" />
        {editingShift ? 'Update Shift' : 'Add Shift'}
      </button>
    </div>
  );

  if (loading && activeTab === 'summary') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading workbond data...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Workbond Management</h1>
            <p className="text-gray-600 mt-1">Manage workbond requirements and track shift completion</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Manual Shift Entry Button */}
            <button
              onClick={() => {
                setEditingShift(null);
                setNewShift({
                  family_id: '',
                  volunteer_id: '',
                  shift_date: new Date().toISOString().split('T')[0],
                  shift_type: 'Concession Stand',
                  hours_worked: 2.5,
                  description: '',
                  notes: ''
                });
                setShowShiftModal(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Shift Manually
            </button>
            
            {/* Import CSV Button */}
            <CSVImport
              onImport={handleImportShifts}
              importType="workbond-shifts"
              seasons={seasons}
            />
            
            {/* View Unmatched Imports Button */}
            {unmatchedImports.length > 0 && (
              <button
                onClick={() => setShowUnmatchedModal(true)}
                className="inline-flex items-center px-4 py-2 border border-yellow-300 rounded-md shadow-sm text-sm font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
              >
                <Unlink className="h-4 w-4 mr-2" />
                Unmatched Imports ({unmatchedImports.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Import Results Display */}
      {importResults && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center">
            <FileText className="h-5 w-5 text-blue-400 mr-2" />
            <div className="text-blue-800">
              <strong>Import Results:</strong> {importResults.message}
            </div>
          </div>
          <div className="mt-2 text-sm">
            <p>• Total imported: {importResults.imported}</p>
            <p>• Successfully matched: {importResults.matched}</p>
            <p>• Unmatched (needs linking): {importResults.unmatched}</p>
            <p>• Volunteers created: {importResults.createdVolunteers}</p>
            <p>• Shifts created: {importResults.createdShifts}</p>
          </div>
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
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Season Selector */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Season:</label>
          <select
            className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(e.target.value)}
          >
            <option value="">Select Season</option>
            {seasons.map(season => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>
          {!selectedSeason && (
            <div className="text-sm text-yellow-600">
              Please select a season to view workbond data
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          {['summary', 'requirements', 'shifts'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content (Summary Tab) */}
      {activeTab === 'summary' && (
        <div>
          {/* Filters */}
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search families..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <select
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="incomplete">Incomplete</option>
                <option value="exempt">Exempt</option>
              </select>
            </div>
          </div>

          {/* Summary Table */}
          <div className="bg-white shadow overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Family
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Required
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Completed
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSummary.map((family) => (
                    <tr key={family.family_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {family.family_name}
                        </div>
                        <div className="text-sm text-gray-500">{family.email}</div>
                        <div className="text-xs text-gray-400">{family.family_identifier}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {family.required_shifts} shifts
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {family.completed_shifts} shifts
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(family.status)}`}>
                          {getStatusIcon(family.status)}
                          <span className="ml-1 capitalize">{family.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredSummary.length === 0 && (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No families found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm || statusFilter 
                    ? 'Try adjusting your search terms or filters' 
                    : selectedSeason 
                    ? 'No workbond data available for the selected season'
                    : 'Please select a season to view workbond data'
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Requirements and Shifts tabs remain the same... */}
      {/* (You can keep your existing requirements and shifts tab code here) */}

      {/* Modals */}

      {/* Manual Shift Modal */}
      <Modal
        isOpen={showShiftModal}
        onClose={() => setShowShiftModal(false)}
        title={editingShift ? 'Edit Shift' : 'Add Manual Shift'}
        footer={ManualShiftFooter}
      >
        {ManualShiftForm()}
      </Modal>

      {/* Unmatched Imports Modal */}
      <Modal
        isOpen={showUnmatchedModal}
        onClose={() => setShowUnmatchedModal(false)}
        title="Unmatched Imported Shifts"
        size="xl"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-sm text-gray-600">
                These shifts were imported but couldn't be automatically matched to families.
                Link them manually to create shifts.
              </p>
            </div>
            <button
              onClick={handleAutoLinkAll}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Auto-Link All
            </button>
          </div>

          <div className="overflow-y-auto max-h-96">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Volunteer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Player</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shift Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {unmatchedImports.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 text-sm">
                      {new Date(record.shift_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{record.volunteer_name}</div>
                      <div className="text-gray-500 text-xs">
                        {record.volunteer_email && (
                          <div className="flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {record.volunteer_email}
                          </div>
                        )}
                        {record.volunteer_phone && (
                          <div className="flex items-center">
                            <Phone className="h-3 w-3 mr-1" />
                            {record.volunteer_phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.player_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.shift_type}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => {
                          setLinkingRecord(record);
                          setShowLinkModal(true);
                        }}
                        className="inline-flex items-center px-3 py-1 text-sm text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
                      >
                        <Link className="h-3 w-3 mr-1" />
                        Link to Family
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {unmatchedImports.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto text-green-400 mb-2" />
                <p>All imports have been matched!</p>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Link Import Modal */}
      <Modal
        isOpen={showLinkModal && linkingRecord}
        onClose={() => {
          setShowLinkModal(false);
          setLinkingRecord(null);
          setLinkSelections({ familyId: '', volunteerId: '' });
        }}
        title={`Link ${linkingRecord?.volunteer_name}`}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-md">
            <div className="font-medium">Import Record:</div>
            <div><strong>Volunteer:</strong> {linkingRecord?.volunteer_name}</div>
            <div><strong>Player:</strong> {linkingRecord?.player_name || 'N/A'}</div>
            <div><strong>Email:</strong> {linkingRecord?.volunteer_email || 'N/A'}</div>
            <div><strong>Phone:</strong> {linkingRecord?.volunteer_phone || 'N/A'}</div>
            <div><strong>Shift:</strong> {linkingRecord?.shift_type} on {new Date(linkingRecord?.shift_date).toLocaleDateString()}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Family *
            </label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              value={linkSelections.familyId}
              onChange={(e) => setLinkSelections(prev => ({ ...prev, familyId: e.target.value }))}
            >
              <option value="">Select a family...</option>
              {families.map(family => (
                <option key={family.id} value={family.id}>
                  {family.primary_contact_name} ({family.family_id})
                  {family.primary_contact_email && ` - ${family.primary_contact_email}`}
                </option>
              ))}
            </select>
            
            {/* Show matching families based on email/phone */}
            {linkingRecord?.volunteer_email && (
              <div className="mt-2">
                <p className="text-sm text-gray-600 mb-1">Possible matches by email:</p>
                {families
                  .filter(f => 
                    f.primary_contact_email === linkingRecord.volunteer_email ||
                    f.parent2_email === linkingRecord.volunteer_email
                  )
                  .slice(0, 3) // Show only first 3 matches
                  .map(family => (
                    <button
                      key={family.id}
                      onClick={() => setLinkSelections(prev => ({ ...prev, familyId: family.id }))}
                      className="block w-full text-left p-2 mb-1 text-sm bg-green-50 hover:bg-green-100 rounded-md"
                    >
                      {family.primary_contact_name} ({family.family_id})
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowLinkModal(false);
                setLinkingRecord(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md"
            >
              Cancel
            </button>
            <button
              onClick={handleLinkImport}
              disabled={!linkSelections.familyId}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Link className="h-4 w-4" />
              Link and Create Shift
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WorkbondManagement;