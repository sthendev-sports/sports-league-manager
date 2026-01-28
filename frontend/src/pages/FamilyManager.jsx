// frontend/src/pages/FamilyManager.jsx - Updated with deselected start
import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, Merge, AlertCircle, Check, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import api from '../services/api';

const FamilyManager = () => {
  const [duplicates, setDuplicates] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  
  // New state for merge configuration
  const [mergeConfigs, setMergeConfigs] = useState({});
  const [expandedGroup, setExpandedGroup] = useState(null);

  useEffect(() => {
    loadSeasons();
  }, []);

  const loadSeasons = async () => {
    try {
      const response = await api.get('/seasons');
      setSeasons(response.data);
      if (response.data.length > 0) {
        setSelectedSeason(response.data[0].id);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  };

  const loadDuplicates = async () => {
    if (!selectedSeason) return;
    
    try {
      setLoading(true);
      const response = await api.get(`/families/merge-tool?season_id=${selectedSeason}`);
      setDuplicates(response.data.duplicates || []);
      // Reset all configs
      setMergeConfigs({});
      setExpandedGroup(null);
    } catch (error) {
      console.error('Error loading duplicates:', error);
      alert('Failed to load family duplicates');
    } finally {
      setLoading(false);
    }
  };

  // Initialize merge configuration for a group - Start with NOTHING selected
  const initMergeConfig = (groupIndex) => {
    const group = duplicates[groupIndex];
    if (!group || group.length < 2) return;
    
    // Start with NO selections at all
    setMergeConfigs(prev => ({
      ...prev,
      [groupIndex]: {
        primaryFamilyId: '', // No primary selected yet
        sourceFamilyIds: [], // No sources selected yet
        fieldSelections: {} // No field selections yet
      }
    }));
    
    setExpandedGroup(groupIndex);
  };

  // Set primary family
  const setPrimaryFamily = (groupIndex, familyId) => {
    setMergeConfigs(prev => {
      const currentConfig = prev[groupIndex] || {};
      
      return {
        ...prev,
        [groupIndex]: {
          ...currentConfig,
          primaryFamilyId: familyId,
          // If this family was previously a source, remove it from sources
          sourceFamilyIds: currentConfig.sourceFamilyIds.filter(id => id !== familyId),
          // Initialize field selections to use the primary family for all fields
          fieldSelections: {
            primary_contact_name: familyId,
            primary_contact_email: familyId,
            primary_contact_phone: familyId,
            parent2_first_name: familyId,
            parent2_last_name: familyId,
            parent2_email: familyId,
            parent2_phone: familyId
          }
        }
      };
    });
  };

  // Toggle source family selection
  const toggleSourceFamily = (groupIndex, familyId) => {
    setMergeConfigs(prev => {
      const currentConfig = prev[groupIndex] || {};
      const isSelected = currentConfig.sourceFamilyIds?.includes(familyId);
      
      if (isSelected) {
        // Remove from sources
        const newSourceIds = currentConfig.sourceFamilyIds.filter(id => id !== familyId);
        
        return {
          ...prev,
          [groupIndex]: {
            ...currentConfig,
            sourceFamilyIds: newSourceIds
          }
        };
      } else {
        // Add to sources
        const newSourceIds = [...(currentConfig.sourceFamilyIds || []), familyId];
        return {
          ...prev,
          [groupIndex]: {
            ...currentConfig,
            sourceFamilyIds: newSourceIds
          }
        };
      }
    });
  };

  // Update which family's data to use for a specific field
  const updateFieldSelection = (groupIndex, field, familyId) => {
    setMergeConfigs(prev => ({
      ...prev,
      [groupIndex]: {
        ...prev[groupIndex],
        fieldSelections: {
          ...(prev[groupIndex]?.fieldSelections || {}),
          [field]: familyId
        }
      }
    }));
  };

  // Clear all selections for a group
  const clearSelections = (groupIndex) => {
    setMergeConfigs(prev => ({
      ...prev,
      [groupIndex]: {
        primaryFamilyId: '',
        sourceFamilyIds: [],
        fieldSelections: {}
      }
    }));
  };

  // Get field value for display
  const getFieldValue = (family, field) => {
    switch (field) {
      case 'primary_contact_name':
        return family.primary_contact_name;
      case 'primary_contact_email':
        return family.primary_contact_email;
      case 'primary_contact_phone':
        return family.primary_contact_phone;
      case 'parent2_first_name':
        return family.parent2_first_name;
      case 'parent2_last_name':
        return family.parent2_last_name;
      case 'parent2_email':
        return family.parent2_email;
      case 'parent2_phone':
        return family.parent2_phone;
      default:
        return '';
    }
  };

  // Get preview of merged family
  const getMergedPreview = (groupIndex) => {
    const config = mergeConfigs[groupIndex];
    const group = duplicates[groupIndex];
    if (!config || !config.primaryFamilyId || !group) return null;
    
    const allFamilies = group.filter(f => 
      f.id === config.primaryFamilyId || config.sourceFamilyIds.includes(f.id)
    );
    
    const preview = {};
    
    // For each field, get the value from the selected family
    Object.entries(config.fieldSelections || {}).forEach(([field, selectedFamilyId]) => {
      const family = allFamilies.find(f => f.id === selectedFamilyId);
      if (family) {
        preview[field] = getFieldValue(family, field);
      }
    });
    
    // Combine players and volunteers
    preview.players = allFamilies.flatMap(f => f.players || []);
    preview.volunteers = allFamilies.flatMap(f => f.volunteers || []);
    preview.primaryFamilyId = config.primaryFamilyId;
    preview.sourceFamilyIds = config.sourceFamilyIds;
    
    return preview;
  };

  const handleMerge = async (groupIndex) => {
    const config = mergeConfigs[groupIndex];
    const group = duplicates[groupIndex];
    
    if (!config || !config.primaryFamilyId || config.sourceFamilyIds.length === 0) {
      alert('Please select:\n1. One family as PRIMARY (radio button)\n2. At least one family to merge INTO it (checkboxes)');
      return;
    }

    const primaryFamily = group.find(f => f.id === config.primaryFamilyId);
    const sourceFamilies = group.filter(f => config.sourceFamilyIds.includes(f.id));
    
    const preview = getMergedPreview(groupIndex);
    
    // Show detailed confirmation
    const confirmationMessage = `
MERGE CONFIRMATION

Primary Family (Will Keep):
${primaryFamily.primary_contact_name || 'Unnamed Family'}
ID: ${primaryFamily.id.substring(0, 8)}...

Source Families (Will Be Merged & Deleted):
${sourceFamilies.map(f => `- ${f.primary_contact_name || 'Unnamed Family'} (ID: ${f.id.substring(0, 8)}...)`).join('\n')}

Players to Move: ${preview.players.length}
Volunteers to Move: ${preview.volunteers.length}

Field Selections:
- Primary Contact: ${preview.primary_contact_name || 'None'} 
- Primary Email: ${preview.primary_contact_email || 'None'} 
- Primary Phone: ${preview.primary_contact_phone || 'None'}

This action cannot be undone. All players and volunteers from source families will be moved to the primary family. Source families will be deleted.

Proceed with merge?
    `.trim();

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    try {
      setMerging(true);
      
      // First, update the primary family with selected field values
      const primaryFamilyUpdate = {};
      Object.entries(config.fieldSelections || {}).forEach(([field, selectedFamilyId]) => {
        const sourceFamily = group.find(f => f.id === selectedFamilyId);
        if (sourceFamily && sourceFamily.id !== config.primaryFamilyId) {
          primaryFamilyUpdate[field] = getFieldValue(sourceFamily, field);
        }
      });
      
      // Only update if there are changes
      if (Object.keys(primaryFamilyUpdate).length > 0) {
        await api.put(`/families/${config.primaryFamilyId}`, primaryFamilyUpdate);
      }
      
      // Then merge the families (move players and volunteers)
      const response = await api.post('/families/merge', {
        targetFamilyId: config.primaryFamilyId,
        sourceFamilyIds: config.sourceFamilyIds
      });
      
      alert(`✅ Success! ${response.data.message}`);
      loadDuplicates(); // Refresh the list
    } catch (error) {
      console.error('Merge error:', error);
      alert(`❌ Merge failed: ${error.response?.data?.error || error.message}`);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="w-full p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Advanced Family Merge Tool</h1>
      <p className="text-gray-600 mb-6">Select families to merge, choose which is primary, and customize which data to keep from each family.</p>

      {/* Season Selector */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
            >
              <option value="">Select Season</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={loadDuplicates}
            disabled={!selectedSeason || loading}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Loading...
              </>
            ) : (
              <>
                <Users className="h-4 w-4" />
                Find Duplicates
              </>
            )}
          </button>
        </div>
      </div>

      {/* Instructions Banner */}
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-yellow-900 mb-1">How to Merge Families</h3>
            <ol className="text-sm text-yellow-800 list-decimal ml-4 space-y-1">
              <li>Click <strong>"Configure Merge"</strong> on a duplicate group</li>
              <li>Select <strong>ONE family as PRIMARY</strong> (radio button) - this family will be kept</li>
              <li>Select <strong>which families to merge</strong> (checkboxes) - these will be merged INTO the primary family</li>
              <li>Optional: Choose which family's data to keep for each field</li>
              <li>Click <strong>"Merge X Families"</strong> to confirm</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Duplicates List */}
      <div className="space-y-4">
        {duplicates.map((group, groupIndex) => {
          const config = mergeConfigs[groupIndex];
          const isExpanded = expandedGroup === groupIndex;
          const preview = getMergedPreview(groupIndex);
          
          return (
            <div key={groupIndex} className="bg-white shadow rounded-lg border border-gray-200">
              {/* Group Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Group {groupIndex + 1} - {group.length} Potential Duplicates
                    </h3>
                    <p className="text-sm text-gray-500">
                      Found {group.length} families with similar contact information
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {!config ? (
                      <button
                        onClick={() => initMergeConfig(groupIndex)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Configure Merge
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => clearSelections(groupIndex)}
                          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                        >
                          Clear Selections
                        </button>
                        <button
                          onClick={() => setExpandedGroup(isExpanded ? null : groupIndex)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-2"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-4 w-4" />
                              Hide Details
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              Show Details
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Merge Configuration Panel (when expanded) */}
              {isExpanded && config && (
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                  {/* Selection Status */}
                  <div className="mb-4 p-3 bg-white rounded border">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-700">Primary Family:</div>
                        <div className={`text-sm ${config.primaryFamilyId ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                          {config.primaryFamilyId 
                            ? group.find(f => f.id === config.primaryFamilyId)?.primary_contact_name || 'Selected'
                            : 'Not selected'}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-700">Families to Merge:</div>
                        <div className={`text-sm ${config.sourceFamilyIds.length > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {config.sourceFamilyIds.length} selected
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Family Selection */}
                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Step 1: Select Families</h4>
                    <div className="space-y-2">
                      {group.map((family) => {
                        const isPrimary = family.id === config.primaryFamilyId;
                        const isSource = config.sourceFamilyIds.includes(family.id);
                        
                        return (
                          <div key={family.id} className="flex items-center gap-4 p-3 bg-white rounded border hover:bg-gray-50">
                            <div className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`primary-${groupIndex}`}
                                checked={isPrimary}
                                onChange={() => setPrimaryFamily(groupIndex, family.id)}
                                className="h-4 w-4 text-blue-600"
                              />
                              <span className="text-sm font-medium">Primary</span>
                            </div>
                            
                            <div className="flex-1">
                              <div className="font-medium">
                                {family.primary_contact_name || 'Unnamed Family'}
                                {isPrimary && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">Primary</span>}
                              </div>
                              <div className="text-sm text-gray-500">
                                {family.primary_contact_email || 'No email'} • {family.primary_contact_phone || 'No phone'}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {family.players?.length || 0} players, {family.volunteers?.length || 0} volunteers
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSource}
                                onChange={() => toggleSourceFamily(groupIndex, family.id)}
                                disabled={isPrimary}
                                className={`h-4 w-4 ${isPrimary ? 'text-gray-300' : 'text-green-600'}`}
                              />
                              <span className="text-sm">Merge into Primary</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Field Mapping Section (only show if we have a primary and sources) */}
                  {config.primaryFamilyId && config.sourceFamilyIds.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-3">Step 2: Choose Which Data to Keep (Optional)</h4>
                      <div className="bg-white rounded border overflow-hidden">
                        <table className="min-w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">Field</th>
                              {group.map((family, idx) => (
                                <th key={family.id} className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                                  <div className="flex items-center gap-2">
                                    {family.id === config.primaryFamilyId ? (
                                      <span className="text-green-600">★ Primary</span>
                                    ) : config.sourceFamilyIds.includes(family.id) ? (
                                      <span className="text-blue-600">✓ Merging</span>
                                    ) : (
                                      <span className="text-gray-400">Not Selected</span>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {[
                              { key: 'primary_contact_name', label: 'Primary Contact Name' },
                              { key: 'primary_contact_email', label: 'Primary Email' },
                              { key: 'primary_contact_phone', label: 'Primary Phone' },
                              { key: 'parent2_first_name', label: 'Secondary First Name' },
                              { key: 'parent2_last_name', label: 'Secondary Last Name' },
                              { key: 'parent2_email', label: 'Secondary Email' },
                              { key: 'parent2_phone', label: 'Secondary Phone' },
                            ].map((field) => (
                              <tr key={field.key}>
                                <td className="px-4 py-3 text-sm font-medium text-gray-700">{field.label}</td>
                                {group.map((family) => {
                                  const value = getFieldValue(family, field.key);
                                  const isSelected = config.fieldSelections?.[field.key] === family.id;
                                  const isSelectable = family.id === config.primaryFamilyId || 
                                                       config.sourceFamilyIds.includes(family.id);
                                  
                                  return (
                                    <td key={family.id} className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="radio"
                                          name={`field-${field.key}-${groupIndex}`}
                                          checked={isSelected}
                                          onChange={() => updateFieldSelection(groupIndex, field.key, family.id)}
                                          className="h-3 w-3"
                                          disabled={!isSelectable}
                                        />
                                        <div 
                                          className={`text-sm truncate max-w-[180px] ${
                                            !isSelectable ? 'text-gray-400' : 'text-gray-600'
                                          }`} 
                                          title={value || 'Empty'}
                                        >
                                          {value || '(empty)'}
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        By default, all fields use the Primary family's data. Use radio buttons to choose different data from other families.
                      </p>
                    </div>
                  )}

                  {/* Merge Preview */}
                  {preview && (
                    <div className="mb-6 p-4 bg-blue-50 rounded border border-blue-100">
                      <h4 className="font-medium text-blue-900 mb-2">Merge Preview</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="font-medium text-blue-800">Primary Contact:</div>
                          <div>{preview.primary_contact_name || 'None'}</div>
                          <div className="text-blue-600">{preview.primary_contact_email || 'No email'}</div>
                          <div className="text-blue-600">{preview.primary_contact_phone || 'No phone'}</div>
                        </div>
                        <div>
                          <div className="font-medium text-blue-800">Secondary Contact:</div>
                          <div>{preview.parent2_first_name || 'None'} {preview.parent2_last_name || ''}</div>
                          <div className="text-blue-600">{preview.parent2_email || 'No email'}</div>
                          <div className="text-blue-600">{preview.parent2_phone || 'No phone'}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm text-blue-700">
                        Will merge {config.sourceFamilyIds.length} family/families into the primary family, 
                        moving {preview.players.length} player{preview.players.length !== 1 ? 's' : ''} and {preview.volunteers.length} volunteer{preview.volunteers.length !== 1 ? 's' : ''}.
                      </div>
                    </div>
                  )}

                  {/* Merge Action */}
                  <div className="flex justify-between items-center">
                    <div>
                      {(!config.primaryFamilyId || config.sourceFamilyIds.length === 0) && (
                        <div className="text-sm text-red-600">
                          {!config.primaryFamilyId && '⚠ Select a Primary family (radio button)'}
                          {config.primaryFamilyId && config.sourceFamilyIds.length === 0 && '⚠ Select at least one family to merge (checkboxes)'}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => clearSelections(groupIndex)}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => handleMerge(groupIndex)}
                        disabled={merging || !config.primaryFamilyId || config.sourceFamilyIds.length === 0}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        <Merge className="h-4 w-4" />
                        {merging ? 'Merging...' : `Merge ${config.sourceFamilyIds.length} Families`}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Simple Family List (collapsed view) */}
              {!isExpanded && (
                <div className="p-4">
                  <div className="space-y-2">
                    {group.slice(0, 3).map((family) => (
                      <div key={family.id} className="text-sm text-gray-600 p-2 bg-gray-50 rounded">
                        {family.primary_contact_name || 'Unnamed Family'} • {family.primary_contact_email || 'No email'} • {family.players?.length || 0} players
                      </div>
                    ))}
                    {group.length > 3 && (
                      <div className="text-sm text-gray-500 italic">
                        ...and {group.length - 3} more families
                      </div>
                    )}
                  </div>
                  {config && (
                    <div className="mt-3 text-sm">
                      {config.primaryFamilyId ? (
                        <span className="text-green-600">
                          ✓ {config.sourceFamilyIds.length} family/families selected to merge into primary
                        </span>
                      ) : (
                        <span className="text-yellow-600">
                          ⚠ Merge configuration started - select families above
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {duplicates.length === 0 && !loading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Family Duplicates Found</h3>
          <p className="text-gray-600 max-w-md mx-auto">
            {selectedSeason 
              ? 'All families appear to be properly linked in this season.'
              : 'Select a season to check for family duplicates.'
            }
          </p>
        </div>
      )}

      {loading && duplicates.length === 0 && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Searching for duplicate families...</p>
        </div>
      )}
    </div>
  );
};

export default FamilyManager;