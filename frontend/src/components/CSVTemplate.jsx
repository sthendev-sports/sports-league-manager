import React from 'react';
import { Download } from 'lucide-react';

const CSVTemplate = ({ templateType = 'players', headers }) => {
  const getVolunteerTemplate = () => {
  const volunteerHeaders = [
    'Division Name', 
    'Volunteer Role',
    'Team Name',
    'Volunteer First Name',
    'Volunteer Last Name', 
    'Volunteer Email Address',
    'Volunteer Cellphone',
    'Volunteer Id', // ADDED
    'Volunteer Type Id' // ADDED
  ];
  
  const sampleData = [
    'Baseball - Majors Division',
    'Assistant Coach',
    'Unallocated',
    'John',
    'Doe',
    'john.doe@email.com',
    '732-555-1234',
    'V12345', // ADDED: Sample Volunteer ID
    'VT001' // ADDED: Sample Volunteer Type ID
  ];
  
  return [volunteerHeaders, sampleData].map(row => 
    row.map(field => `"${field}"`).join(',')
  ).join('\n');
};

  const getPlayerTemplate = () => {
    // Updated headers to include new columns
    const playerHeaders = headers || [
      'registration_no',
      'program_title',
      'first_name',
      'last_name',
      'birth_date',
      'gender',
      'medical_conditions',
      'medical_release_form',
      'new_or_returning',
      'travel_player',
      'uniform_shirt_size',
      'uniform_pants_size',
      'parent1_firstname',
      'parent1_lastname',
      'parent1_email',
      'parent1_phone1',
      'parent2_firstname',
      'parent2_lastname',
      'parent2_email',
      'parent2_phone1',
      'payment_status',
      'workbond_check_status',
      'order_date',           // NEW: Order Date column
      'player_street',        // NEW: Player Street column
      'player_city',          // NEW: Player City column
      'player_state',         // NEW: Player State column
      'player_postal_code'    // NEW: Player Postal Code column
    ];
    
    // Updated sample data with new columns
    const sampleData = [
      '12345',
      'Baseball - Majors Division',
      'John',
      'Doe',
      '2015-03-15',
      'Male',
      'None',
      'true',
      'New',
      'false',
      'Youth Medium',
      'Youth Medium',
      'Jane',
      'Doe',
      'jane.doe@email.com',
      '555-123-4567',
      'Bob',
      'Doe',
      'bob.doe@email.com',
      '555-987-6543',
      'Paid',
      'Not Received',
      '2024-01-15',          // NEW: Order Date sample
      '123 Main St',         // NEW: Player Street sample
      'Anytown',             // NEW: Player City sample
      'CA',                  // NEW: Player State sample
      '12345'                // NEW: Player Postal Code sample
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