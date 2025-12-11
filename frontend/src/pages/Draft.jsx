import React, { useState, useEffect } from 'react';
import { Users, Download, Mail, Filter, Trophy, AlertCircle, Printer } from 'lucide-react';
import DraftGrid from '../components/DraftGrid';
import PrintableDraftSheet from '../components/PrintableDraftSheet';

const Draft = () => {
  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [draftData, setDraftData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [divisionsError, setDivisionsError] = useState(null);
  const [draftStarted, setDraftStarted] = useState(false);
  
  // New states for printable draft sheet
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);

  useEffect(() => {
    loadSeasons();
    loadDivisions();
  }, []);

  useEffect(() => {
    if (selectedDivision && selectedSeason) {
      loadDraftData();
    } else {
      setDraftData(null);
    }
  }, [selectedDivision, selectedSeason]);

  const loadSeasons = async () => {
    try {
      const response = await fetch('/api/seasons');
      if (!response.ok) throw new Error('Failed to load seasons');
      const data = await response.json();
      setSeasons(data);
      if (data.length > 0) setSelectedSeason(data[0].id);
    } catch (error) {
      console.error('Error loading seasons:', error);
      setError('Failed to load seasons');
    }
  };

  const loadDivisions = async () => {
    try {
      console.log('Loading divisions from /api/divisions');
      const response = await fetch('/api/divisions');
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Divisions loaded successfully:', data);
      setDivisions(data);
      setDivisionsError(null);
    } catch (error) {
      console.error('Error loading divisions:', error);
      setDivisionsError(`Failed to load divisions: ${error.message}. Using fallback data.`);
      setDivisions([
        { id: 'b9c26039-fb03-4338-a750-1a00d8bf88de', name: 'Baseball - Majors Division' },
        { id: '38a95432-1974-4036-b97d-d1b76cf14690', name: 'Baseball - Minors Division' },
        { id: '41552f38-d89e-49b4-a081-4698f733030c', name: 'Rookies' }
      ]);
    }
  };

  const loadDraftData = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Loading draft data for:', { selectedDivision, selectedSeason });
      
      const response = await fetch(`/api/players/draft/${selectedDivision}?season_id=${selectedSeason}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Draft data loaded successfully:', data);
      
      // Ensure data has the expected structure
      if (!data) {
        throw new Error('No data returned from server');
      }
      
      // Ensure players is always an array
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
      // Set empty draft data to prevent further errors
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

  // New function for loading print data
  const loadPrintData = async (divisionId, seasonId) => {
    try {
      setPrintLoading(true);
      console.log('Loading print data for:', { divisionId, seasonId });
      
      const response = await fetch(`/api/players/draft/${divisionId}?season_id=${seasonId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Print data loaded successfully:', data);
      
      // Ensure data has the expected structure
      if (!data) {
        throw new Error('No data returned from server');
      }
      
      // Ensure players is always an array and add draft numbers
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

  // Check if division/season can be switched during draft
  const canSwitchDivision = () => {
    if (draftStarted) {
      const confirmSwitch = window.confirm(
        'Draft is currently in progress. Switching divisions or seasons will cancel the current draft. All progress will be lost. Continue?'
      );
      
      if (confirmSwitch) {
        // Cancel the draft
        setDraftStarted(false);
        return true;
      }
      return false;
    }
    return true;
  };

  const handleDivisionChange = (newDivisionId) => {
    if (!canSwitchDivision()) {
      // Reset to previous value
      const selectElement = document.querySelector('select[value="' + selectedDivision + '"]');
      if (selectElement) {
        selectElement.value = selectedDivision;
      }
      return;
    }
    setSelectedDivision(newDivisionId);
  };

  const handleSeasonChange = (newSeasonId) => {
    if (!canSwitchDivision()) {
      // Reset to previous value
      const selectElement = document.querySelector('select[value="' + selectedSeason + '"]');
      if (selectElement) {
        selectElement.value = selectedSeason;
      }
      return;
    }
    setSelectedSeason(newSeasonId);
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

  // Handle when picks are updated in the draft grid
  const handlePicksUpdate = (playerId, managerId) => {
    console.log('Player assigned:', playerId, 'to manager:', managerId);
    // Here you can save the picks to your database
    // You might want to implement an API call to save the draft picks
  };

  // Handle draft start from child component
  const handleDraftStart = () => {
    setDraftStarted(true);
  };

  // Handle draft completion or cancellation
  const handleDraftComplete = () => {
    setDraftStarted(false);
  };

  // SAFER check for draft data
  const hasDraftData = draftData && Array.isArray(draftData.players);

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Draft System</h1>
        <p className="text-gray-600 mt-1">Manage player drafts and team assignments</p>
        
        {/* Draft Status Indicator */}
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

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="text-red-800">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Divisions Error Warning */}
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

      {/* Printable Draft Sheet Button */}
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

      {/* Filters */}
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
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2 text-gray-600">Loading draft data...</span>
        </div>
      )}

      {/* No Selection State */}
      {!selectedDivision || !selectedSeason ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <Trophy className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Select Season and Division</h3>
          <p className="text-yellow-700">Please select a season and division to view draft data.</p>
        </div>
      ) : hasDraftData ? (
        <DraftGrid 
          draftData={draftData}
          divisionId={selectedDivision}
          seasonId={selectedSeason}
          onPicksUpdate={handlePicksUpdate}
          onDraftStart={handleDraftStart}
          onDraftComplete={handleDraftComplete}
        />
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

      {/* Printable Draft Sheet Modal */}
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

// New modal component for print selection
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

  // Reset form when closing
  const handleClose = () => {
    setSelectedDivision('');
    setSelectedSeason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">Generate Draft Sheet</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
        
        <div className="p-6">
          {!printData ? (
            <>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                  <select
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
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
                    onChange={(e) => setSelectedDivision(e.target.value)}
                  >
                    <option value="">Select Division</option>
                    {divisions.map(division => (
                      <option key={division.id} value={division.id}>{division.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={printLoading || !selectedDivision || !selectedSeason}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {printLoading ? 'Generating...' : 'Generate Sheet'}
                </button>
              </div>
            </>
          ) : (
            <PrintableDraftSheet
              divisionName={printData.divisionName}
              seasonName={printData.seasonName}
              players={printData.players}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Draft;