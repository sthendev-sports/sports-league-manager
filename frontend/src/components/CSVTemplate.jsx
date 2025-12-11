import React from 'react';
import { Download } from 'lucide-react';

const CSVTemplate = ({ templateType, headers }) => {
  const getVolunteerTemplate = () => {
    const volunteerHeaders = [
      'Division Name', 
      'Volunteer Role',
      'Team Name',
      'Volunteer First Name',
      'Volunteer Last Name', 
      'Volunteer Email Address',
      'Volunteer Cellphone'
    ];
    
    const sampleData = [
      'Baseball - Majors Division',
      'Assistant Coach',
      'Unallocated',
      'John',
      'Doe',
      'john.doe@email.com',
      '732-555-1234'
    ];
    
    return [volunteerHeaders, sampleData].map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');
  };

  const getPlayerTemplate = () => {
    // Your existing player template logic
    const playerHeaders = headers || [
      'first_name',
      'last_name',
      'birth_date',
      'gender',
      'is_new_player',
      'is_travel_player',
      'program_title',
      'primary_contact_name',
      'primary_contact_email',
      'primary_contact_phone'
    ];
    
    const sampleData = [
      'John',
      'Doe',
      '2015-03-15',
      'Male',
      'true',
      'false',
      'Baseball - Majors Division',
      'Jane Doe',
      'jane.doe@email.com',
      '555-123-4567'
    ];
    
    return [playerHeaders, sampleData].map(row => 
      row.map(field => `"${field}"`).join(',')
    ).join('\n');
  };

  const downloadTemplate = () => {
    let csvContent = '';
    let filename = '';
    
    if (templateType === 'volunteers') {
      csvContent = getVolunteerTemplate();
      filename = 'volunteer_import_template.csv';
    } else {
      csvContent = getPlayerTemplate();
      filename = `${templateType}-template.csv`;
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={downloadTemplate}
      className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
    >
      <Download className="h-4 w-4 mr-2" />
      Download {templateType === 'volunteers' ? 'Volunteer Import' : 'Player'} Template
    </button>
  );
};

export default CSVTemplate;