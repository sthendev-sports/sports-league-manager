// frontend/src/pages/Dashboard.jsx - Simplified version
import React, { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, Edit2, Save, X, Download } from 'lucide-react';
import { seasonsAPI, dashboardAPI } from '../services/api';
import { getPermissionErrorMessage } from '../utils/permissionHelpers';

// PDF libraries - added imports
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const DIVISION_ORDER = [
  "T-Ball Division",
  "Baseball - Coach Pitch Division",
  "Baseball - Rookies Division",
  "Baseball - Minors Division",
  "Baseball - Majors Division",
  "Softball - Rookies Division (Coach Pitch)",
  "Softball - Minors Division",
  "Softball - Majors Division",
  "Softball - Junior Division",
  "Challenger Division",
];

const divisionOrderIndex = (name) => {
  const idx = DIVISION_ORDER.indexOf(name);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

const sortDivisionObjects = (a, b) => {
  const ai = divisionOrderIndex(a?.name);
  const bi = divisionOrderIndex(b?.name);
  if (ai !== bi) return ai - bi;
  return String(a?.name || "").localeCompare(String(b?.name || ""));
};

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalRegistered: 0,
    playersNotReturning: 0,
    newPlayers: 0,
    returningPlayers: 0,
    totalTeams: 0,
    familiesPendingWorkBond: 0,
    divisions: [],
    totalVolunteers: 0,
    volunteerBreakdown: {
      teamManagers: 0,
      assistantCoaches: 0,
      teamParents: 0,
    },
    monthlyTrends: [],
    volunteerByDivision: []
  });
  
  const [selectedMonthView, setSelectedMonthView] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedCompareSeasonId, setSelectedCompareSeasonId] = useState('');
  const [currentSeason, setCurrentSeason] = useState(null);
  const [editingDivision, setEditingDivision] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [activeVolunteerTab, setActiveVolunteerTab] = useState('assigned');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false); // New state for PDF generation

  // Load seasons on component mount
  useEffect(() => {
    const loadSeasons = async () => {
      try {
        const [activeRes, allRes] = await Promise.all([
          seasonsAPI.getActive().catch(() => ({ data: null })),
          seasonsAPI.getAll().catch(() => ({ data: [] }))
        ]);

        const activeSeason = activeRes?.data || null;
        const all = Array.isArray(allRes?.data) ? allRes.data : [];
        setSeasons(all);

        // Set default season
        const defaultSeasonId = activeSeason?.id || all?.[0]?.id;
        if (defaultSeasonId) {
          setSelectedSeasonId(defaultSeasonId);
        }
      } catch (error) {
        console.error('Error loading seasons:', error);
        setError('Failed to load seasons data');
      }
    };

    loadSeasons();
  }, []);

  // Load dashboard data whenever season or comparison changes
  useEffect(() => {
    if (selectedSeasonId) {
      loadDashboardData();
    }
  }, [selectedSeasonId, selectedCompareSeasonId]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('Loading dashboard with:', {
        currentSeasonId: selectedSeasonId,
        compareSeasonId: selectedCompareSeasonId || 'none'
      });

      // Get current season object
      const seasonObj = seasons.find(s => s.id === selectedSeasonId);
      if (!seasonObj) {
        throw new Error('Current season not found');
      }
      setCurrentSeason(seasonObj);

      // Load dashboard statistics with comparison season
      const dashboardData = await dashboardAPI.getStatistics(
        selectedSeasonId, 
        selectedCompareSeasonId || ''
      );
      
      console.log('Dashboard data loaded');
      setStats(dashboardData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      // Use the helper function for better error messages
      const errorMessage = getPermissionErrorMessage(
        error,
        'Failed to load dashboard data. You may not have permission to view this information.'
      );
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // NEW FUNCTION: Generate PDF Report
const generatePDFReport = async () => {
  try {
    setIsGeneratingPDF(true);
    
    // Create PDF in landscape mode
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    // Title and metadata
    const title = 'League Dashboard Report';
    const subtitle = currentSeason?.name || 'Current Season';
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    let page = 1;
    let yPosition = 20;
    
    // Function to add a new page
    const addNewPage = () => {
      pdf.addPage();
      page++;
      yPosition = 25;
    };
    
    // Helper function to split text into multiple lines if too long
    const splitTextToFit = (text, maxWidth, fontSize) => {
      const lines = [];
      let currentLine = '';
      
      // Calculate width of a character (approximate)
      const charWidth = fontSize * 0.15; // Approximate mm per character
      const maxCharsPerLine = Math.floor(maxWidth / charWidth);
      
      if (text.length <= maxCharsPerLine) {
        return [text];
      }
      
      // Split by words
      const words = text.split(' ');
      for (const word of words) {
        if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) lines.push(currentLine);
          // If a single word is longer than max line, split the word
          if (word.length > maxCharsPerLine) {
            for (let i = 0; i < word.length; i += maxCharsPerLine) {
              lines.push(word.substring(i, i + maxCharsPerLine));
            }
            currentLine = '';
          } else {
            currentLine = word;
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      return lines;
    };
    
    // Helper function to draw a table with headers
    const drawTable = (headers, data, startY, options = {}) => {
      const { 
        startX = 20, 
        columnWidths = null,
        showTotal = false,
        totalData = null,
        rowHeight = 10
      } = options;
      
      let currentY = startY;
      
      // Calculate column widths if not provided
      let colWidths;
      if (columnWidths) {
        colWidths = columnWidths;
      } else {
        // Find the longest division name to set first column width
        let maxDivisionLength = 0;
        const allDivisionNames = [
          ...data.map(row => row[0] || ''),
          ...(showTotal && totalData ? [totalData[0] || ''] : [])
        ];
        
        allDivisionNames.forEach(name => {
          maxDivisionLength = Math.max(maxDivisionLength, name.length);
        });
        
        // First column width based on content, minimum 60mm for long names
        const firstColWidth = Math.min(80, Math.max(60, maxDivisionLength * 1.2));
        
        // Remaining width for other columns
        const remainingWidth = pdfWidth - startX * 2 - firstColWidth;
        const otherColCount = headers.length - 1;
        const otherColWidth = Math.max(15, remainingWidth / otherColCount);
        
        colWidths = [firstColWidth, ...Array(otherColCount).fill(otherColWidth)];
        
        // Adjust if total width exceeds page
        const totalWidth = colWidths.reduce((a, b) => a + b, 0);
        if (totalWidth > pdfWidth - startX * 2) {
          const scale = (pdfWidth - startX * 2) / totalWidth;
          colWidths = colWidths.map(width => width * scale);
        }
      }
      
      // Add spacing before table
      currentY += 5;
      
      // Draw table headers
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'bold');
      
      let currentX = startX;
      const headerRowHeight = 10;
      
      for (let i = 0; i < headers.length; i++) {
        // Draw header cell with light gray background
        pdf.setFillColor(240, 240, 240);
        pdf.rect(currentX, currentY, colWidths[i], headerRowHeight, 'F');
        
        // Draw border
        pdf.setDrawColor(200, 200, 200);
        pdf.rect(currentX, currentY, colWidths[i], headerRowHeight, 'S');
        
        // Draw header text - center aligned
        const headerText = headers[i];
        pdf.text(headerText, currentX + colWidths[i] / 2, currentY + 6, { align: 'center' });
        
        currentX += colWidths[i];
      }
      
      currentY += headerRowHeight;
      
      // Draw data rows
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'normal');
      
      data.forEach((row, rowIndex) => {
        // Calculate row height needed for wrapped text
        let maxLines = 1;
        const cellLines = [];
        
        for (let i = 0; i < row.length; i++) {
          const cellValue = row[i] !== undefined ? row[i].toString() : '';
          const lines = splitTextToFit(cellValue, colWidths[i] - 6, 9);
          cellLines.push(lines);
          maxLines = Math.max(maxLines, lines.length);
        }
        
        let actualRowHeight = Math.max(rowHeight, maxLines * 4 + 4); // 4mm per line
        
        // Check if we need a new page
        if (currentY + actualRowHeight > pdfHeight - 20) {
          addNewPage();
          currentY = 25;
          // Redraw headers on new page
          currentX = startX;
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'bold');
          for (let i = 0; i < headers.length; i++) {
            pdf.setFillColor(240, 240, 240);
            pdf.rect(currentX, currentY, colWidths[i], headerRowHeight, 'F');
            pdf.setDrawColor(200, 200, 200);
            pdf.rect(currentX, currentY, colWidths[i], headerRowHeight, 'S');
            pdf.text(headers[i], currentX + colWidths[i] / 2, currentY + 6, { align: 'center' });
            currentX += colWidths[i];
          }
          currentY += headerRowHeight;
          pdf.setFontSize(9);
          pdf.setFont(undefined, 'normal');
          
          // Recalculate for new page - FIXED: Use let instead of const
          maxLines = 1;
          cellLines.length = 0;
          for (let i = 0; i < row.length; i++) {
            const cellValue = row[i] !== undefined ? row[i].toString() : '';
            const lines = splitTextToFit(cellValue, colWidths[i] - 6, 9);
            cellLines.push(lines);
            maxLines = Math.max(maxLines, lines.length);
          }
          actualRowHeight = Math.max(rowHeight, maxLines * 4 + 4);
        }
        
        // Alternate row background
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(255, 255, 255);
        } else {
          pdf.setFillColor(248, 248, 248);
        }
        pdf.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), actualRowHeight, 'F');
        
        // Draw cell borders and content
        currentX = startX;
        for (let i = 0; i < headers.length; i++) {
          pdf.setDrawColor(200, 200, 200);
          pdf.rect(currentX, currentY, colWidths[i], actualRowHeight, 'S');
          
          // Draw cell content
          const lines = cellLines[i];
          const lineHeight = 4;
          const startTextY = currentY + (actualRowHeight - (lines.length * lineHeight)) / 2 + 3;
          
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            
            // Right-align numeric columns (except first column)
            if (i === 0) {
              // Left align for division names
              pdf.text(line, currentX + 3, startTextY + (lineIndex * lineHeight));
            } else {
              // Check if it's a number
              const isNumber = !isNaN(line) && line !== '' && !isNaN(parseFloat(line));
              if (isNumber) {
                pdf.text(line, currentX + colWidths[i] - 3, startTextY + (lineIndex * lineHeight), { align: 'right' });
              } else {
                pdf.text(line, currentX + colWidths[i] / 2, startTextY + (lineIndex * lineHeight), { align: 'center' });
              }
            }
          }
          
          currentX += colWidths[i];
        }
        
        currentY += actualRowHeight;
      });
      
      // Draw total row if needed
      if (showTotal && totalData) {
        if (currentY > pdfHeight - 30) {
          addNewPage();
          currentY = 25;
        }
        
        currentY += 8; // Extra spacing before total row
        
        const totalRowHeight = 10;
        
        // Draw total row background
        pdf.setFillColor(230, 230, 230);
        pdf.rect(startX, currentY, colWidths.reduce((a, b) => a + b, 0), totalRowHeight, 'F');
        
        // Draw total row borders and content
        currentX = startX;
        pdf.setFont(undefined, 'bold');
        
        for (let i = 0; i < headers.length; i++) {
          pdf.setDrawColor(150, 150, 150);
          pdf.rect(currentX, currentY, colWidths[i], totalRowHeight, 'S');
          
          const cellValue = totalData[i] !== undefined ? totalData[i].toString() : '';
          
          if (i === 0) {
            pdf.text(cellValue, currentX + 3, currentY + 6);
          } else {
            const isNumber = !isNaN(cellValue) && cellValue !== '' && !isNaN(parseFloat(cellValue));
            if (isNumber) {
              pdf.text(cellValue, currentX + colWidths[i] - 3, currentY + 6, { align: 'right' });
            } else {
              pdf.text(cellValue, currentX + colWidths[i] / 2, currentY + 6, { align: 'center' });
            }
          }
          
          currentX += colWidths[i];
        }
        
        currentY += totalRowHeight + 8; // Spacing after total row
        pdf.setFont(undefined, 'normal');
      } else {
        currentY += 8; // Spacing after table
      }
      
      return currentY;
    };
    
    // Add header
    pdf.setFontSize(16);
    pdf.setTextColor(0, 0, 0);
    pdf.text(title, pdfWidth / 2, yPosition, { align: 'center' });
    
    pdf.setFontSize(12);
    pdf.setTextColor(100, 100, 100);
    pdf.text(subtitle, pdfWidth / 2, yPosition + 8, { align: 'center' });
    
    if (selectedCompareSeasonId) {
      const compareSeason = seasons.find(s => s.id === selectedCompareSeasonId);
      pdf.text(`Comparing to: ${compareSeason?.name || 'Previous Season'}`, pdfWidth / 2, yPosition + 16, { align: 'center' });
    }
    
    pdf.setFontSize(10);
    pdf.text(`Generated on: ${date}`, pdfWidth / 2, yPosition + 24, { align: 'center' });
    
    yPosition += 40;
    
    // 1. Registration Totals
    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Registration Totals', 20, yPosition);
    yPosition += 15;
    
    pdf.setFontSize(11);
    pdf.setTextColor(80, 80, 80);
    pdf.text(`Total Registration: ${stats.totalRegistered}`, 25, yPosition);
    yPosition += 7;
    pdf.text(`Players Not Returning: ${stats.playersNotReturning}`, 25, yPosition);
    yPosition += 20;
    
    // 2. Division Breakdown
    if (stats.divisions.length > 0) {
      pdf.setFontSize(14);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Division Registration Breakdown', 20, yPosition);
      yPosition += 10;
      
      const headers = ['Division', 'Current', 'New', 'Returning', 'Travel', 'Withdrawn', 'Teams'];
      const data = stats.divisions
        .slice()
        .sort(sortDivisionObjects)
        .map(division => [
          division.name,
          division.current,
          division.newPlayers,
          division.returningPlayers,
          division.travelPlayers || 0,
          division.withdrawnPlayers || 0,
          division.teams
        ]);
      
      const totalData = [
        'TOTAL',
        divisionTotals.current,
        divisionTotals.newPlayers,
        divisionTotals.returningPlayers,
        divisionTotals.travelPlayers,
        divisionTotals.withdrawnPlayers,
        divisionTotals.teams
      ];
      
      // Custom column widths with very wide first column
      const colWidths = [65, 20, 20, 25, 20, 25, 20]; // First column 65mm for full division names
      
      yPosition = drawTable(headers, data, yPosition, {
        showTotal: true,
        totalData: totalData,
        columnWidths: colWidths
      });
      
      yPosition += 10;
    }
    
    // 3. Monthly Trends
    if (selectedCompareSeasonId && stats.monthlyTrends && stats.monthlyTrends.length > 0) {
  if (yPosition > pdfHeight - 60) {
    addNewPage();
    yPosition = 25;
  }
  
  pdf.setFontSize(14);
  pdf.setTextColor(0, 0, 0);
  pdf.text('Monthly Registration Trends', 20, yPosition);
  yPosition += 15;
  
  const filteredMonths = stats.monthlyTrends.filter(month => {
    if (selectedMonthView === 'quarter') {
      return month.monthNumber <= 3;
    }
    return true;
  });
  
  // Remove "Trend" from headers and adjust column widths
  const headers = ['Month', 'Current', getComparisonColumnHeader(), 'Change'];
  const data = filteredMonths.map(month => {
    // Calculate the actual numeric change
    const numericChange = month.current - month.previous;
    
    // Format the change as just the number with + or - sign
    const changeDisplay = (numericChange > 0 ? '+' : '') + numericChange;
    
    return [
      month.month,
      month.current,
      month.previous,
      changeDisplay // This will show like "+98" or "-25"
    ];
  });
  
  // Adjust column widths since we removed the Trend column
  const trendColWidths = [25, 25, 30, 30]; // Wider Change column instead of Trend
  
  yPosition = drawTable(headers, data, yPosition, {
    columnWidths: trendColWidths
  });
  
  yPosition += 15;
}
    
    // 4. Volunteer Breakdown
    if (yPosition > pdfHeight - 60) {
      addNewPage();
      yPosition = 25;
    }
    
    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Volunteer Breakdown', 20, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`View: ${activeVolunteerTab === 'assigned' ? 'Assigned Roles' : 'Interested Roles'}`, 25, yPosition);
    yPosition += 10;
    
    if (activeVolunteerTab === 'assigned') {
      if (stats.volunteerByDivision.length > 0) {
        const headers = ['Division', 'Team Manager', 'Assistant Coach', 'Team Parent', 'Total'];
        const data = stats.volunteerByDivision
          .slice()
          .sort(sortDivisionObjects)
          .map(division => [
            division.name,
            division.teamManagers,
            division.assistantCoaches,
            division.teamParents,
            division.divisionTotal
          ]);
        
        const totalData = [
          'TOTAL',
          volunteerTotals.teamManagers,
          volunteerTotals.assistantCoaches,
          volunteerTotals.teamParents,
          volunteerTotals.divisionTotal
        ];
        
        // Wider first column for division names
        const colWidths = [65, 25, 25, 25, 20];
        
        yPosition = drawTable(headers, data, yPosition, {
          showTotal: true,
          totalData: totalData,
          columnWidths: colWidths
        });
      } else {
        pdf.setFontSize(11);
        pdf.setTextColor(150, 150, 150);
        pdf.text('No assigned volunteer data available', 25, yPosition);
        yPosition += 20;
      }
    } else {
      if (stats.interestedRolesByDivision && stats.interestedRolesByDivision.length > 0) {
        const filteredInterested = stats.interestedRolesByDivision
          .filter(division => division.total > 0)
          .sort((a, b) => sortDivisionObjects(a, b));
        
        if (filteredInterested.length > 0) {
          const headers = ['Division', 'Manager', 'Assistant Coach', 'Team Parent', 'Total'];
          const data = filteredInterested.map(division => [
            division.name,
            division.Manager || 0,
            division['Assistant Coach'] || 0,
            division['Team Parent'] || 0,
            division.total
          ]);
          
          // Calculate totals
          const totals = filteredInterested.reduce((acc, division) => {
            acc.Manager += division.Manager || 0;
            acc['Assistant Coach'] += division['Assistant Coach'] || 0;
            acc['Team Parent'] += division['Team Parent'] || 0;
            acc.total += division.total;
            return acc;
          }, { Manager: 0, 'Assistant Coach': 0, 'Team Parent': 0, total: 0 });
          
          const totalData = [
            'TOTAL',
            totals.Manager,
            totals['Assistant Coach'],
            totals['Team Parent'],
            totals.total
          ];
          
          // Wider first column for division names
          const colWidths = [65, 20, 25, 20, 15];
          
          yPosition = drawTable(headers, data, yPosition, {
            showTotal: true,
            totalData: totalData,
            columnWidths: colWidths
          });
        } else {
          pdf.setFontSize(11);
          pdf.setTextColor(150, 150, 150);
          pdf.text('No interested roles data available', 25, yPosition);
          yPosition += 20;
        }
      } else {
        pdf.setFontSize(11);
        pdf.setTextColor(150, 150, 150);
        pdf.text('No interested roles data available', 25, yPosition);
        yPosition += 20;
      }
    }
    
    // 5. Work Bond Status
    if (yPosition > pdfHeight - 50) {
      addNewPage();
      yPosition = 25;
    }
    
    yPosition += 10;
    
    pdf.setFontSize(14);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Work Bond Status', 20, yPosition);
    yPosition += 15;
    
    pdf.setFontSize(24);
    pdf.setTextColor(220, 38, 38);
    pdf.text(stats.familiesPendingWorkBond.toString(), 25, yPosition);
    
    pdf.setFontSize(12);
    pdf.setTextColor(80, 80, 80);
    pdf.text('Families Pending Work Bond Deposit', 50, yPosition);
    
    // Add page numbers
    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(10);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`Page ${i} of ${totalPages}`, pdfWidth - 30, pdfHeight - 10);
    }
    
    // Save the PDF
    const fileName = `League-Dashboard-${currentSeason?.name?.replace(/\s+/g, '-') || 'Report'}-${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(fileName);
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Failed to generate PDF report. Please try again.');
  } finally {
    setIsGeneratingPDF(false);
  }
};

  // Calculate totals for division breakdown
  const divisionTotals = {
    current: stats.divisions.reduce((sum, division) => sum + division.current, 0),
    previous: stats.divisions.reduce((sum, division) => sum + division.previous, 0),
    newPlayers: stats.divisions.reduce((sum, division) => sum + division.newPlayers, 0),
    returningPlayers: stats.divisions.reduce((sum, division) => sum + division.returningPlayers, 0),
    travelPlayers: stats.divisions.reduce((sum, division) => sum + (division.travelPlayers || 0), 0),
    teams: stats.divisions.reduce((sum, division) => sum + division.teams, 0),
    withdrawnPlayers: stats.divisions.reduce((sum, division) => sum + (division.withdrawnPlayers || 0), 0)
  };

  // Calculate totals for volunteer breakdown
  const volunteerTotals = {
    teamManagers: stats.volunteerByDivision.reduce((sum, division) => sum + division.teamManagers, 0),
    assistantCoaches: stats.volunteerByDivision.reduce((sum, division) => sum + division.assistantCoaches, 0),
    teamParents: stats.volunteerByDivision.reduce((sum, division) => sum + division.teamParents, 0),
    divisionTotal: stats.volunteerByDivision.reduce((sum, division) => sum + division.divisionTotal, 0)
  };

  const handleEditClick = (division, value) => {
    setEditingDivision(division.name);
    setEditValue(value.toString());
  };

  const handleSaveEdit = async (divisionName) => {
    try {
      // Update locally
      const updatedDivisions = stats.divisions.map(division => {
        if (division.name === divisionName) {
          const previousValue = parseInt(editValue) || 0;
          const currentValue = division.current;
          const trend = currentValue > previousValue ? 'up' : 
                       currentValue < previousValue ? 'down' : 'neutral';
          
          return {
            ...division,
            previous: previousValue,
            trend: trend
          };
        }
        return division;
      });

      setStats(prev => ({
        ...prev,
        divisions: updatedDivisions
      }));
      
      setEditingDivision(null);
      setEditValue('');
      
      alert('Division data updated successfully!');
      
    } catch (error) {
      console.error('Error updating division data:', error);
      
      const errorMessage = getPermissionErrorMessage(
        error,
        'Failed to update division data. You may not have permission to edit this information.'
      );
      
      alert(errorMessage);
    }
  };

  const handleCancelEdit = () => {
    setEditingDivision(null);
    setEditValue('');
  };

  // Helper function to get trend styles
  const getTrendStyles = (trend) => {
    switch (trend) {
      case 'up':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          arrow: 'text-green-600',
          symbol: '▲'
        };
      case 'down':
        return {
          bg: 'bg-red-100', 
          text: 'text-red-800',
          arrow: 'text-red-600',
          symbol: '▼'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          arrow: 'text-gray-600',
          symbol: '→'
        };
    }
  };

  // Get comparison column header name
  const getComparisonColumnHeader = () => {
    if (selectedCompareSeasonId) {
      const compareSeason = seasons.find(s => s.id === selectedCompareSeasonId);
      return compareSeason?.name || 'Previous';
    }
    return 'Previous';
  };

  // Get comparison season name for display
  const getComparisonSeasonName = () => {
    if (selectedCompareSeasonId) {
      const compareSeason = seasons.find(s => s.id === selectedCompareSeasonId);
      return compareSeason?.name || 'Comparison Season';
    }
    return 'None Selected';
  };

  if (loading && !stats.divisions.length) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading dashboard data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">League Dashboard</h1>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <div className="text-red-800">
              <strong>Error loading dashboard:</strong> {error}
            </div>
          </div>
          <button
            onClick={loadDashboardData}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  return (
  <div className="space-y-6">
    {/* Header with refresh button and PDF download */}
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">League Dashboard</h1>
        {currentSeason?.name && (
          <p className="text-sm text-gray-600 mt-1">Showing: <span className="font-medium">{currentSeason.name}</span></p>
        )}
        <p className="text-sm text-gray-600 mt-1">Comparing to: <span className="font-medium">{getComparisonSeasonName()}</span></p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Current Season</label>
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              value={selectedSeasonId}
              onChange={(e) => setSelectedSeasonId(e.target.value)}
            >
              {seasons.map(season => (
                <option key={season.id} value={season.id}>{season.name}</option>
              ))}
            </select>
          </div>
          
          {/* Compare To Dropdown - NO AUTO OPTION */}
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">Compare To</label>
            <select
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500 min-w-[200px]"
              value={selectedCompareSeasonId}
              onChange={(e) => setSelectedCompareSeasonId(e.target.value)}
            >
              <option value="">-- Select Season --</option>
              {seasons
                .filter(season => season.id !== selectedSeasonId)
                .map(season => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
            </select>
          </div>
        </div>
        
        <div className="flex gap-2 mt-6 sm:mt-0">
          <button
            onClick={loadDashboardData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          
          {/* NEW: PDF Download Button */}
          <button
            data-pdf-button
            onClick={generatePDFReport}
            disabled={isGeneratingPDF}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingPDF ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating PDF...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>
    </div>

    {/* Dashboard content wrapped for PDF capture */}
    <div id="dashboard-content">
      {/* Registration Totals */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Registration Totals</h2>
        </div>
        <div className="p-6">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900 w-40">Total Registration:</span>
              <span className="text-lg font-bold text-gray-900">{stats.totalRegistered}</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-gray-900 w-40">Players Not Returning:</span>
              <span className="text-lg font-bold text-gray-900">{stats.playersNotReturning}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Division Registration Breakdown */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Division Registration Breakdown</h2>
          </div>
          <div className="p-4">
            {stats.divisions.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <p>No division data available</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Current</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Withdrawn</th>
                      {selectedCompareSeasonId && (
                        <>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" title={getComparisonSeasonName()}>
                            {getComparisonColumnHeader()}
                          </th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Trend</th>
                        </>
                      )}
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">New</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Returning</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Travel</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Teams</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.divisions.slice().sort(sortDivisionObjects).map((division) => {
                      const trendStyles = getTrendStyles(division.trend);
                      return (
                        <tr key={division.name} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{division.name}</td>
                          <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap font-bold">
                            {division.current}
                          </td>
                          <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                            {division.withdrawnPlayers > 0 ? (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                                {division.withdrawnPlayers}
                              </span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                          {selectedCompareSeasonId && (
                            <>
                              <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                                {editingDivision === division.name ? (
                                  <div className="flex items-center justify-center space-x-1">
                                    <input
                                      type="number"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="w-16 px-1 py-1 text-sm border border-gray-300 rounded text-center"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleSaveEdit(division.name)}
                                      className="text-green-600 hover:text-green-800"
                                    >
                                      <Save className="h-3 w-3" />
                                    </button>
                                    <button
                                      onClick={handleCancelEdit}
                                      className="text-red-600 hover:text-red-800"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                              ) : (
                                <div className="flex items-center justify-center space-x-1">
                                  <span className="text-gray-500">{division.previous}</span>
                                  <button
                                    onClick={() => handleEditClick(division, division.previous)}
                                    className="text-gray-400 hover:text-blue-600 ml-1"
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                              <div className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium ${trendStyles.bg} ${trendStyles.text}`}>
                                <span className={trendStyles.arrow}>
                                  {trendStyles.symbol}
                                </span>
                                <span className="ml-0.5">
                                  {Math.abs(division.current - division.previous)}
                                </span>
                              </div>
                            </td>
                            </>
                          )}
                          <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap font-medium">{division.newPlayers}</td>
                          <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap font-medium">{division.returningPlayers}</td>
                          <td className="px-2 py-2 text-sm text-yellow-600 text-center whitespace-nowrap font-medium">{division.travelPlayers || 0}</td>
                          <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{division.teams}</td>
                        </tr>
                      );
                    })}
                    {/* Total Row */}
                    <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                      <td className="px-2 py-2 text-sm text-gray-900 whitespace-nowrap">Total</td>
                      <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">
                        {divisionTotals.current}
                      </td>
                      <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                        {divisionTotals.withdrawnPlayers > 0 ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            {divisionTotals.withdrawnPlayers}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      {selectedCompareSeasonId && (
                        <>
                          <td className="px-2 py-2 text-sm text-gray-500 text-center whitespace-nowrap">{divisionTotals.previous}</td>
                          <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                            <div className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium ${
                              divisionTotals.current > divisionTotals.previous ? 'bg-green-100 text-green-800' :
                              divisionTotals.current < divisionTotals.previous ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              <span className={divisionTotals.current > divisionTotals.previous ? 'text-green-600' : divisionTotals.current < divisionTotals.previous ? 'text-red-600' : 'text-gray-600'}>
                                {divisionTotals.current > divisionTotals.previous ? '▲' : divisionTotals.current < divisionTotals.previous ? '▼' : '→'}
                              </span>
                              <span className="ml-0.5">
                                {Math.abs(divisionTotals.current - divisionTotals.previous)}
                              </span>
                            </div>
                          </td>
                        </>
                      )}
                      <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap">{divisionTotals.newPlayers}</td>
                      <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap">{divisionTotals.returningPlayers}</td>
                      <td className="px-2 py-2 text-sm text-yellow-600 text-center whitespace-nowrap">{divisionTotals.travelPlayers}</td>
                      <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{divisionTotals.teams}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Monthly Registration Trends - Only show if comparing */}
        {selectedCompareSeasonId && stats.monthlyTrends && stats.monthlyTrends.length > 0 && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Monthly Registration Trends</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedMonthView('all')}
                    className={`px-3 py-1 text-sm rounded ${selectedMonthView === 'all' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    All Months
                  </button>
                  <button
                    onClick={() => setSelectedMonthView('quarter')}
                    className={`px-3 py-1 text-sm rounded ${selectedMonthView === 'quarter' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    Jan-Mar
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Month</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Current Season</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" title={getComparisonSeasonName()}>
                        {getComparisonColumnHeader()}
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Change</th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Trend</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {stats.monthlyTrends
                      .filter(month => {
                        if (selectedMonthView === 'quarter') {
                          return month.monthNumber <= 3; // Jan-Mar
                        }
                        return true;
                      })
                      .map((month) => {
                        const change = month.current - month.previous;
                        const trend = month.trend;
                        const trendStyles = getTrendStyles(trend);
                        
                        return (
                          <tr key={month.month} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                              {month.month}
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap font-bold">
                              {month.current}
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-500 text-center whitespace-nowrap">
                              {month.previous}
                            </td>
                            <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                              <span className={`font-medium ${change > 0 ? 'text-green-600' : change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                {change > 0 ? '+' : ''}{change}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-sm text-center whitespace-nowrap">
                              <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${trendStyles.bg} ${trendStyles.text}`}>
                                <span className={trendStyles.arrow}>
                                  {trendStyles.symbol}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Volunteer Breakdown by Division with Tabs */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Volunteer Breakdown by Division</h2>
            </div>
            
            {/* Tab Navigation */}
            <div className="mt-4 border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveVolunteerTab('assigned')}
                  className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                    activeVolunteerTab === 'assigned'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Assigned Roles
                </button>
                <button
                  onClick={() => setActiveVolunteerTab('interested')}
                  className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                    activeVolunteerTab === 'interested'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Interested Roles
                </button>
              </nav>
            </div>
          </div>
          
          <div className="p-4">
            {/* Assigned Roles Tab Content */}
            {activeVolunteerTab === 'assigned' && (
              <>
                {stats.volunteerByDivision.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    <p>No assigned volunteer data available</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Team Manager</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Assistant Coach</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Team Parent</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.volunteerByDivision.slice().sort(sortDivisionObjects).map((division) => (
                          <tr key={division.name} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{division.name}</td>
                            <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap font-medium">{division.teamManagers}</td>
                            <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap font-medium">{division.assistantCoaches}</td>
                            <td className="px-2 py-2 text-sm text-purple-600 text-center whitespace-nowrap font-medium">{division.teamParents}</td>
                            <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap font-semibold">{division.divisionTotal}</td>
                          </tr>
                        ))}
                        {/* Total Row */}
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                          <td className="px-2 py-2 text-sm text-gray-900 whitespace-nowrap">Total Registered</td>
                          <td className="px-2 py-2 text-sm text-blue-600 text-center whitespace-nowrap">{volunteerTotals.teamManagers}</td>
                          <td className="px-2 py-2 text-sm text-green-600 text-center whitespace-nowrap">{volunteerTotals.assistantCoaches}</td>
                          <td className="px-2 py-2 text-sm text-purple-600 text-center whitespace-nowrap">{volunteerTotals.teamParents}</td>
                          <td className="px-2 py-2 text-sm text-gray-900 text-center whitespace-nowrap">{volunteerTotals.divisionTotal}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            
            {/* Interested Roles Tab Content */}
            {activeVolunteerTab === 'interested' && (
              <>
                {stats.interestedRolesByDivision && stats.interestedRolesByDivision.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Division</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Manager</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Assistant Coach</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Team Parent</th>
                          <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {stats.interestedRolesByDivision
                          .filter(division => division.total > 0 || 
                            ['T-Ball Division', 'Baseball - Coach Pitch Division', 'Baseball - Rookies Division', 
                             'Baseball - Minors Division', 'Baseball - Majors Division', 
                             'Softball - Rookies Division (Coach Pitch)', 'Softball - Minors Division', 
                             'Softball - Majors Division', 'Challenger Division'].includes(division.name))
                          .map((division) => (
                          <tr key={division.name} className="hover:bg-gray-50">
                            <td className="px-2 py-2 text-sm font-medium text-gray-900 whitespace-nowrap">{division.name}</td>
                            <td className="px-2 py-2 text-sm text-gray-900 text-center">
                              {division.Manager > 0 ? division.Manager : ''}
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-900 text-center">
                              {division['Assistant Coach'] > 0 ? division['Assistant Coach'] : ''}
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-900 text-center">
                              {division['Team Parent'] > 0 ? division['Team Parent'] : ''}
                            </td>
                            <td className="px-2 py-2 text-sm text-gray-900 text-center font-semibold">
                              {division.total}
                            </td>
                          </tr>
                        ))}
                        
                        {/* Total Row */}
                        {(() => {
                          const totals = stats.interestedRolesByDivision.reduce((acc, division) => {
                            acc.Manager += division.Manager;
                            acc['Assistant Coach'] += division['Assistant Coach'];
                            acc['Team Parent'] += division['Team Parent'];
                            acc.total += division.total;
                            return acc;
                          }, { Manager: 0, 'Assistant Coach': 0, 'Team Parent': 0, total: 0 });
                          
                          return (
                            <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                              <td className="px-2 py-2 text-sm text-gray-900 whitespace-nowrap">Total</td>
                              <td className="px-2 py-2 text-sm text-gray-900 text-center">{totals.Manager > 0 ? totals.Manager : ''}</td>
                              <td className="px-2 py-2 text-sm text-gray-900 text-center">{totals['Assistant Coach'] > 0 ? totals['Assistant Coach'] : ''}</td>
                              <td className="px-2 py-2 text-sm text-gray-900 text-center">{totals['Team Parent'] > 0 ? totals['Team Parent'] : ''}</td>
                              <td className="px-2 py-2 text-sm text-gray-900 text-center">{totals.total}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-2">No interested roles data available</div>
                    <div className="text-sm text-gray-500">
                      Volunteers can specify roles they're interested in on their profile
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Work Bond Status */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Work Bond Status</h2>
        </div>
        <div className="p-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{stats.familiesPendingWorkBond}</div>
            <div className="text-sm text-gray-600 mt-1">Families Pending Work Bond Deposit</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
};

export default Dashboard;