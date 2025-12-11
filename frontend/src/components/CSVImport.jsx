import React, { useState } from 'react';
import { Upload, X, CheckCircle, AlertCircle, FileText } from 'lucide-react';

const CSVImport = ({ onImport, importType, seasons }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      alert('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    previewCSV(selectedFile);
  };

  const previewCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      const lines = csvText.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        alert('CSV file is empty');
        return;
      }
      
      const headers = lines[0].split(',').map(h => h.trim());
      const preview = lines.slice(1, 6).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });
      setPreviewData(preview);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!file || !selectedSeason) {
      alert('Please select both a file and a season');
      return;
    }

    setLoading(true);
    try {
      const csvText = await readFileAsText(file);
      const result = await onImport(csvText, selectedSeason);
      setResult(result);
      if (result.success) {
        setTimeout(() => {
          setIsOpen(false);
          setResult(null);
          setFile(null);
          setPreviewData([]);
          setSelectedSeason('');
        }, 3000);
      }
    } catch (error) {
      setResult({
        success: false,
        message: `Import failed: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  const getImportTitle = () => {
    switch (importType) {
      case 'players':
        return 'Import Players';
      case 'payment-data':
        return 'Import Payment Data';
      default:
        return 'Import Data';
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
    setFile(null);
    setPreviewData([]);
    setSelectedSeason('');
  };

  // Prevent background scrolling when modal is open
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
      >
        <Upload className="h-4 w-4 mr-2" />
        Import CSV
      </button>

      {isOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          {/* Backdrop - Completely covers the screen */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)'
            }}
            onClick={handleClose}
          />
          
          {/* Modal Container */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            backgroundColor: 'white',
            borderRadius: '12px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e5e7eb',
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <FileText style={{ width: '24px', height: '24px', color: '#2563eb', marginRight: '12px' }} />
                <h2 style={{ 
                  fontSize: '20px', 
                  fontWeight: '600', 
                  color: '#1f2937',
                  margin: 0
                }}>
                  {getImportTitle()}
                </h2>
              </div>
              <button
                onClick={handleClose}
                style={{
                  color: '#6b7280',
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  borderRadius: '6px'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
              >
                <X style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            {/* Scrollable Content */}
            <div style={{
              flex: 1,
              padding: '24px',
              overflowY: 'auto',
              maxHeight: '60vh'
            }}>
              {!result ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Step 1: Season Selection */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      1. Select Season *
                    </label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: '#374151',
                        backgroundColor: 'white'
                      }}
                    >
                      <option value="">Choose a season</option>
                      {seasons.map(season => (
                        <option key={season.id} value={season.id}>
                          {season.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Step 2: File Upload */}
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '8px'
                    }}>
                      2. Upload CSV File *
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                      <label style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '120px',
                        border: '2px dashed #d1d5db',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        backgroundColor: '#f9fafb',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                      onMouseOut={(e) => e.target.style.backgroundColor = '#f9fafb'}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <Upload style={{ width: '32px', height: '32px', color: '#9ca3af', marginBottom: '12px' }} />
                          <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 4px 0' }}>
                            <span style={{ fontWeight: '600' }}>Click to upload</span>
                          </p>
                          <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>CSV files only</p>
                        </div>
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          accept=".csv"
                          onChange={handleFileSelect}
                        />
                      </label>
                    </div>
                    {file && (
                      <div style={{
                        marginTop: '12px',
                        padding: '12px',
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: '6px'
                      }}>
                        <p style={{ fontSize: '14px', color: '#166534', fontWeight: '500', margin: '0 0 4px 0' }}>
                          ✅ File selected: {file.name}
                        </p>
                        <p style={{ fontSize: '12px', color: '#166534', margin: 0 }}>
                          ✓ CSV file ready for import
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Preview */}
                  {previewData.length > 0 && (
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '12px'
                      }}>
                        3. Data Preview (first 5 rows)
                      </label>
                      <div style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ 
                            width: '100%', 
                            borderCollapse: 'collapse',
                            fontSize: '12px'
                          }}>
                            <thead style={{ backgroundColor: '#f9fafb' }}>
                              <tr>
                                {Object.keys(previewData[0]).map(header => (
                                  <th key={header} style={{
                                    padding: '8px 12px',
                                    textAlign: 'left',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    color: '#6b7280',
                                    textTransform: 'uppercase',
                                    borderBottom: '1px solid #e5e7eb',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.map((row, index) => (
                                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#fafafa' }}>
                                  {Object.values(row).map((value, cellIndex) => (
                                    <td key={cellIndex} style={{
                                      padding: '8px 12px',
                                      borderBottom: '1px solid #f3f4f6',
                                      color: '#374151',
                                      whiteSpace: 'nowrap',
                                      maxWidth: '200px',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}>
                                      {value}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <p style={{ fontSize: '12px', color: '#6b7280', margin: '8px 0 0 0' }}>
                        📋 Showing first 5 rows. {previewData[0] && `Total columns: ${Object.keys(previewData[0]).length}`}
                      </p>
                      <p style={{ fontSize: '12px', color: '#2563eb', fontWeight: '500', margin: '4px 0 0 0' }}>
                        💡 Make sure your CSV includes headers (column names) in the first row
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Result Display */
                <div style={{
                  padding: '24px',
                  borderRadius: '8px',
                  border: '2px solid',
                  borderColor: result.success ? '#bbf7d0' : '#fecaca',
                  backgroundColor: result.success ? '#f0fdf4' : '#fef2f2'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0 }}>
                      {result.success ? (
                        <CheckCircle style={{ width: '24px', height: '24px', color: '#22c55e' }} />
                      ) : (
                        <AlertCircle style={{ width: '24px', height: '24px', color: '#ef4444' }} />
                      )}
                    </div>
                    <div style={{ marginLeft: '16px' }}>
                      <h3 style={{ 
                        fontSize: '18px', 
                        fontWeight: '600', 
                        color: result.success ? '#166534' : '#991b1b',
                        margin: '0 0 8px 0'
                      }}>
                        {result.success ? 'Import Successful!' : 'Import Failed'}
                      </h3>
                      <div style={{ 
                        color: result.success ? '#166534' : '#991b1b'
                      }}>
                        <p style={{ margin: '0 0 8px 0' }}>{result.message}</p>
                        {result.data && (
                          <p style={{ fontWeight: '500', margin: '8px 0' }}>
                            ✅ Successfully imported {result.data.length} records
                          </p>
                        )}
                        <p style={{ 
                          fontSize: '14px', 
                          opacity: 0.75, 
                          margin: '12px 0 0 0'
                        }}>
                          {result.success 
                            ? 'This window will close automatically...'
                            : 'Please check your CSV format and try again.'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer with Actions - Always visible */}
            {!result && (
              <div style={{
                padding: '24px',
                borderTop: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px'
                }}>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    {file ? 'Ready to import data' : 'Select a CSV file to continue'}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleClose}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#374151',
                        backgroundColor: 'white',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        minWidth: '80px'
                      }}
                      onMouseOver={(e) => e.target.style.backgroundColor = '#f9fafb'}
                      onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={!file || !selectedSeason || loading}
                      style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: 'white',
                        backgroundColor: (!file || !selectedSeason || loading) ? '#9ca3af' : '#2563eb',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (!file || !selectedSeason || loading) ? 'not-allowed' : 'pointer',
                        minWidth: '120px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                      onMouseOver={(e) => {
                        if (!(!file || !selectedSeason || loading)) {
                          e.target.style.backgroundColor = '#1d4ed8';
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!(!file || !selectedSeason || loading)) {
                          e.target.style.backgroundColor = '#2563eb';
                        }
                      }}
                    >
                      {loading ? (
                        <>
                          <div style={{
                            width: '16px',
                            height: '16px',
                            border: '2px solid transparent',
                            borderTop: '2px solid white',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                          }} />
                          Importing...
                        </>
                      ) : (
                        'Import Data'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default CSVImport;