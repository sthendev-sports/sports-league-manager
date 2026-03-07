import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Save, Building2, Mail, Phone, Download, 
  Upload, DollarSign, TrendingUp, PieChart, FileText, Copy,
  MapPin, Flag, Award, Calendar, CheckCircle, XCircle, AlertCircle,
  Filter, Eye, EyeOff, X, Settings
} from 'lucide-react';
import Modal from '../components/Modal';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

// Define which roles can access this page
const ALLOWED_ROLES = ['Administrator', 'President', 'Treasurer', 'Equipment Manager'];

// Default fields and locations
const DEFAULT_FIELDS = ['Field 1', 'Field 2', 'Field 3'];
const DEFAULT_STANDALONE_LOCATIONS = ['Batting Cages', 'Bullpen Fence', 'Concession Stand', 'Park Entrance'];
const DEFAULT_LOCATION_OPTIONS = {
  'Field 1': ['Outfield', 'Scoreboard', 'Backstop'],
  'Field 2': ['Outfield', 'Scoreboard', 'Backstop'],
  'Field 3': ['Outfield', 'Scoreboard', 'Backstop'],
  'Batting Cages': ['Structure', 'Fence', 'Lighting'],
  'Bullpen Fence': ['Left Field', 'Right Field', 'Center Field'],
  'Concession Stand': ['Window', 'Roof', 'Pole'],
  'Park Entrance': ['Gate', 'Welcome Sign', 'Directory']
};

// Pricing matrix
const LOCATION_PRICES = {
  'Outfield': 400,
  'Scoreboard': 600,
  'Backstop': 450,
  'Structure': 300,
  'Fence': 250,
  'Lighting': 200,
  'Left Field': 350,
  'Right Field': 350,
  'Center Field': 350,
  'Window': 200,
  'Roof': 300,
  'Pole': 150,
  'Gate': 400,
  'Welcome Sign': 500,
  'Directory': 350
};

const Sponsors = () => {
  const { user } = useAuth();
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState('sponsors'); // sponsors, reports, email
  
  // Filter states
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [showContactedFilter, setShowContactedFilter] = useState('all'); // 'all', 'contacted', 'not-contacted'
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Location management states
  const [fields, setFields] = useState(() => {
    const saved = localStorage.getItem('sponsor_fields');
    return saved ? JSON.parse(saved) : DEFAULT_FIELDS;
  });
  
  const [standaloneLocations, setStandaloneLocations] = useState(() => {
    const saved = localStorage.getItem('sponsor_standalone_locations');
    return saved ? JSON.parse(saved) : DEFAULT_STANDALONE_LOCATIONS;
  });
  
  const [locationOptions, setLocationOptions] = useState(() => {
    const saved = localStorage.getItem('sponsor_location_options');
    return saved ? JSON.parse(saved) : DEFAULT_LOCATION_OPTIONS;
  });
  
  // Location management states
const [locationConfigs, setLocationConfigs] = useState([]);
const [editingLocation, setEditingLocation] = useState(null);
const [showEditLocationModal, setShowEditLocationModal] = useState(false);
const [editLocationForm, setEditLocationForm] = useState({
  id: null,
  field: '',
  location: '',
  price: '',
  is_active: true
});
  
  // Location management modal states
  const [showManageLocationsModal, setShowManageLocationsModal] = useState(false);
  const [newField, setNewField] = useState('');
  const [newStandaloneLocation, setNewStandaloneLocation] = useState('');
  const [newLocationOption, setNewLocationOption] = useState({ field: '', location: '', price: '' });
  
  // Location selections for the form
  const [selectedLocations, setSelectedLocations] = useState([]);
  const [currentField, setCurrentField] = useState('');
  const [currentLocation, setCurrentLocation] = useState('');
  
  // Form data for sponsor
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    phone: '',
    email: '',
    notes: '',
    contacted_this_season: false,
    is_new_sponsor: false,
    is_returning: false,
    has_paid: false,
    years_sponsoring: 1,
    has_website_ad: false,
    has_concession_ad: false,
    purchased_new_sign: false,
    upgraded_location: false,
    downgraded_location: false,
    total_amount: 0,
    is_active: true
  });
  
const handleEditLocation = (config) => {
  console.log('Editing location:', config);
  
  setEditingLocation(config);
  setEditLocationForm({
    id: config.id,
    field: config.field_name,  // Map field_name to field
    location: config.location_name,  // Map location_name to location
    price: config.cost ? config.cost.toString() : '0',  // Use cost, not price
    is_active: config.is_active !== undefined ? config.is_active : true
  });
  setShowEditLocationModal(true);
};

const handleUpdateLocation = async () => {
  try {
    console.log('Updating location with data:', editLocationForm);
    
    // Validate inputs
    if (!editLocationForm.location.trim()) {
      setError('Location name cannot be empty');
      return;
    }
    
    if (!editLocationForm.price || parseFloat(editLocationForm.price) <= 0) {
      setError('Please enter a valid price');
      return;
    }
    
    // Make the API call to update the location
    const response = await api.put(`/sponsors/locations/config/${editLocationForm.id}`, {
      location_name: editLocationForm.location.trim(),
      price: parseFloat(editLocationForm.price),  // API expects 'price'
      is_active: editLocationForm.is_active
    });
    
    console.log('Update response:', response.data);
    
    // Reload location config to get updated data
    await loadLocationConfig();
    
    // Close modal and reset state
    setShowEditLocationModal(false);
    setEditingLocation(null);
    setEditLocationForm({
      id: null,
      field: '',
      location: '',
      price: '',
      is_active: true
    });
    
    // Clear any errors
    setError(null);
    
  } catch (error) {
    console.error('Error updating location:', error);
    
    // Handle specific error messages
    if (error.response) {
      console.error('Error response data:', error.response.data);
      console.error('Error response status:', error.response.status);
      
      if (error.response.status === 400) {
        setError(error.response.data.error || 'Invalid data provided');
      } else if (error.response.status === 404) {
        setError('Location not found');
      } else {
        setError('Failed to update location: ' + (error.response.data.error || error.message));
      }
    } else if (error.request) {
      setError('No response from server. Please check your connection.');
    } else {
      setError('Error: ' + error.message);
    }
  }
};

const handleDeleteLocation = async (id, locationName) => {
  if (!window.confirm(`Are you sure you want to delete "${locationName}"? This cannot be undone.`)) {
    return;
  }
  
  try {
    await api.delete(`/sponsors/locations/config/${id}`);
    await loadLocationConfig();
  } catch (error) {
    console.error('Error deleting location:', error);
    if (error.response?.data?.sponsors) {
      setError(`Cannot delete: Location is used by: ${error.response.data.sponsors.join(', ')}`);
    } else {
      setError('Failed to delete location: ' + error.message);
    }
  }
};



const loadLocationConfig = async () => {
  try {
    const response = await api.get('/sponsors/locations/config');
    const data = response.data;
    
    setFields(data.fields || []);
    setStandaloneLocations(data.standaloneLocations || []);
    setLocationOptions(data.locationOptions || {});
    setLocationConfigs(data.allConfigs || []);
    
    // Update LOCATION_PRICES with data from API
const priceMap = {};
data.allConfigs.forEach(config => {
  // Use cost from database, fallback to price if cost doesn't exist
  priceMap[config.location_name] = config.cost || config.price || 0;
});
Object.assign(LOCATION_PRICES, priceMap);
    
    console.log('Location config loaded:', data);
  } catch (error) {
    console.error('Error loading location config:', error);
  }
};

  // Email templates (stored in localStorage for now)
  const [emailTemplates, setEmailTemplates] = useState(() => {
    const saved = localStorage.getItem('sponsor_email_templates');
    return saved ? JSON.parse(saved) : [
      { 
        id: 1, 
        name: 'Welcome New Sponsor',
        subject: 'Welcome to Our Sponsor Family!',
        body: 'Dear {contact_name},\n\nThank you for becoming a sponsor this season! We are excited to have {company_name} on board.\n\nBest regards,\nThe League Team'
      },
      { 
        id: 2, 
        name: 'Payment Reminder',
        subject: 'Sponsorship Payment Reminder',
        body: 'Dear {contact_name},\n\nThis is a reminder about your sponsorship payment for {company_name}. Please contact us to arrange payment.\n\nThank you,\nThe League Team'
      }
    ];
  });

  // Email template form
  const [templateForm, setTemplateForm] = useState({
    name: '',
    subject: '',
    body: ''
  });
  const [showEmailTemplateModal, setShowEmailTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  // Check if user has access to this page
  const hasAccess = user && ALLOWED_ROLES.includes(user.role);
  
  // Check if user can edit (Administrator or President only for write operations)
  const canEdit = user && (user.role === 'Administrator' || user.role === 'President');
  
  // Check if user can delete (Administrator only)
  const canDelete = user && user.role === 'Administrator';

  useEffect(() => {
    if (hasAccess) {
      loadSponsors();
	  loadLocationConfig();
    } else {
      setLoading(false);
    }
  }, [hasAccess]);

  // Save location data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sponsor_fields', JSON.stringify(fields));
    localStorage.setItem('sponsor_standalone_locations', JSON.stringify(standaloneLocations));
    localStorage.setItem('sponsor_location_options', JSON.stringify(locationOptions));
  }, [fields, standaloneLocations, locationOptions]);

  // Save email templates to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('sponsor_email_templates', JSON.stringify(emailTemplates));
  }, [emailTemplates]);

  const loadSponsors = async () => {
  try {
    setLoading(true);
    setError(null);
    
    const response = await api.get('/sponsors');
    setSponsors(Array.isArray(response.data) ? response.data : []);
  } catch (error) {
    console.error('Error loading sponsors:', error);
    setError('Failed to load sponsors: ' + error.message);
    
    // Fallback to localStorage if API fails
    const saved = localStorage.getItem('sponsors');
    if (saved) {
      setSponsors(JSON.parse(saved));
    }
  } finally {
    setLoading(false);
  }
};

  const saveSponsorsToStorage = (updatedSponsors) => {
    setSponsors(updatedSponsors);
    localStorage.setItem('sponsors', JSON.stringify(updatedSponsors));
  };

  const handleAddLocation = () => {
  if (currentField && currentLocation) {
    // Find the specific location config for this field and location
    const locationConfig = locationConfigs.find(
      c => c.field_name === currentField && c.location_name === currentLocation
    );
    
    // Use the cost from the config, or fallback to the default price
    const price = locationConfig ? locationConfig.cost : (LOCATION_PRICES[currentLocation] || 400);
    
    const newLoc = {
      field: currentField,
      location: currentLocation,
      price: price,
      // Store the location_config_id if needed for future reference
      location_config_id: locationConfig ? locationConfig.id : null
    };
    setSelectedLocations([...selectedLocations, newLoc]);
    setCurrentField('');
    setCurrentLocation('');
  }
};

  const handleRemoveLocation = (index) => {
    setSelectedLocations(selectedLocations.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return selectedLocations.reduce((sum, loc) => sum + loc.price, 0);
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  if (!canEdit) {
    setError('You do not have permission to save sponsors.');
    return;
  }

  if (!formData.company_name) {
    setError('Company name is required.');
    return;
  }

  if (selectedLocations.length === 0) {
    setError('Please select at least one location.');
    return;
  }
  
  try {
    setSaving(true);
    setError(null);
    
    const totalAmount = calculateTotal();
    
    const dataToSend = {
      ...formData,
      total_amount: totalAmount,
      locations: selectedLocations
    };

    if (editingSponsor) {
      // Update existing sponsor
      await api.put(`/sponsors/${editingSponsor.id}`, dataToSend);
    } else {
      // Add new sponsor
      await api.post('/sponsors', dataToSend);
    }
    
    await loadSponsors();
    resetForm();
  } catch (error) {
    console.error('Error saving sponsor:', error);
    setError('Failed to save sponsor: ' + error.message);
  } finally {
    setSaving(false);
  }
};

  const handleEdit = (sponsor) => {
    if (!canEdit) {
      setError('You do not have permission to edit sponsors.');
      return;
    }
    setEditingSponsor(sponsor);
    setFormData({
      company_name: sponsor.company_name || '',
      contact_name: sponsor.contact_name || '',
      phone: sponsor.phone || '',
      email: sponsor.email || '',
      notes: sponsor.notes || '',
      contacted_this_season: sponsor.contacted_this_season || false,
      is_new_sponsor: sponsor.is_new_sponsor || false,
      is_returning: sponsor.is_returning || false,
      has_paid: sponsor.has_paid || false,
      years_sponsoring: sponsor.years_sponsoring || 1,
      has_website_ad: sponsor.has_website_ad || false,
      has_concession_ad: sponsor.has_concession_ad || false,
      purchased_new_sign: sponsor.purchased_new_sign || false,
      upgraded_location: sponsor.upgraded_location || false,
      downgraded_location: sponsor.downgraded_location || false,
      total_amount: sponsor.total_amount || 0,
      is_active: sponsor.is_active !== undefined ? sponsor.is_active : true
    });
    setSelectedLocations(sponsor.locations || []);
    setShowForm(true);
  };

  const handleDelete = async (sponsorId) => {
    if (!canDelete) {
      setError('You do not have permission to delete sponsors.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this sponsor?')) {
      try {
        // Update localStorage
        const updatedSponsors = sponsors.filter(s => s.id !== sponsorId);
        saveSponsorsToStorage(updatedSponsors);
        
        // Try API if available
        try {
          await api.delete(`/sponsors/${sponsorId}`);
        } catch (apiError) {
          console.log('API not available, deleted from local storage only');
        }
      } catch (error) {
        console.error('Error deleting sponsor:', error);
        setError('Failed to delete sponsor: ' + error.message);
      }
    }
  };

  const handleAddField = async () => {
  if (newField && !fields.includes(newField)) {
    try {
      // Add a default location for the new field
      const response = await api.post('/sponsors/locations/config', {
        field_name: newField,
        location_name: 'Outfield',  // Default location
        price: 400  // API expects 'price' in the request
      });
      
      console.log('Field added successfully:', response.data);
      await loadLocationConfig();
      setNewField('');
      setError(null);
    } catch (error) {
      console.error('Error adding field:', error);
      if (error.response) {
        console.error('Server response:', error.response.data);
        setError('Failed to add field: ' + (error.response.data.error || error.message));
      } else {
        setError('Failed to add field: ' + error.message);
      }
    }
  }
};

  const handleAddStandaloneLocation = async () => {
  if (newStandaloneLocation && !standaloneLocations.includes(newStandaloneLocation)) {
    try {
      // Add a location where field_name and location_name are the same for standalone
      const response = await api.post('/sponsors/locations/config', {
        field_name: newStandaloneLocation,
        location_name: newStandaloneLocation,  // Same as field for standalone
        price: 300  // Default price
      });
      
      console.log('Standalone location added successfully:', response.data);
      await loadLocationConfig();
      setNewStandaloneLocation('');
      setError(null);
    } catch (error) {
      console.error('Error adding standalone location:', error);
      if (error.response) {
        console.error('Server response:', error.response.data);
        setError('Failed to add location: ' + (error.response.data.error || error.message));
      } else {
        setError('Failed to add location: ' + error.message);
      }
    }
  }
};

const handleAddLocationOption = async () => {
  if (newLocationOption.field && newLocationOption.location && newLocationOption.price) {
    try {
      const response = await api.post('/sponsors/locations/config', {
        field_name: newLocationOption.field,
        location_name: newLocationOption.location,
        price: parseFloat(newLocationOption.price)
      });
      
      console.log('Location option added successfully:', response.data);
      await loadLocationConfig();
      setNewLocationOption({ field: '', location: '', price: '' });
      setError(null);
    } catch (error) {
      console.error('Error adding location option:', error);
      if (error.response) {
        console.error('Server response:', error.response.data);
        setError('Failed to add location option: ' + (error.response.data.error || error.message));
      } else {
        setError('Failed to add location option: ' + error.message);
      }
    }
  }
};

  const handleSaveTemplate = () => {
    if (!canEdit) {
      setError('You do not have permission to manage email templates.');
      return;
    }
    
    let updatedTemplates;
    if (editingTemplate) {
      updatedTemplates = emailTemplates.map(t => 
        t.id === editingTemplate.id ? { ...templateForm, id: t.id } : t
      );
    } else {
      const newTemplate = {
        ...templateForm,
        id: Date.now()
      };
      updatedTemplates = [...emailTemplates, newTemplate];
    }
    
    setEmailTemplates(updatedTemplates);
    setTemplateForm({ name: '', subject: '', body: '' });
    setEditingTemplate(null);
    setShowEmailTemplateModal(false);
  };

  const handleEditTemplate = (template) => {
    if (!canEdit) {
      setError('You do not have permission to edit email templates.');
      return;
    }
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      subject: template.subject,
      body: template.body
    });
    setShowEmailTemplateModal(true);
  };

  const handleDeleteTemplate = (templateId) => {
    if (!canDelete) {
      setError('You do not have permission to delete email templates.');
      return;
    }
    if (window.confirm('Are you sure you want to delete this template?')) {
      setEmailTemplates(emailTemplates.filter(t => t.id !== templateId));
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      contact_name: '',
      phone: '',
      email: '',
      notes: '',
      contacted_this_season: false,
      is_new_sponsor: false,
      is_returning: false,
      has_paid: false,
      years_sponsoring: 1,
      has_website_ad: false,
      has_concession_ad: false,
      purchased_new_sign: false,
      upgraded_location: false,
      downgraded_location: false,
      total_amount: 0,
      is_active: true
    });
    setSelectedLocations([]);
    setCurrentField('');
    setCurrentLocation('');
    setEditingSponsor(null);
    setShowForm(false);
  };

  // Calculate totals for reports
  const calculateTotals = () => {
    const filteredSponsors = showActiveOnly ? sponsors.filter(s => s.is_active) : sponsors;
    
    const totalSponsors = filteredSponsors.length;
    const totalRevenue = filteredSponsors.reduce((sum, s) => sum + (s.total_amount || 0), 0);
    const newSponsors = filteredSponsors.filter(s => s.is_new_sponsor).length;
    const returningSponsors = filteredSponsors.filter(s => s.is_returning).length;
    const paidSponsors = filteredSponsors.filter(s => s.has_paid).length;
    const unpaidSponsors = filteredSponsors.filter(s => !s.has_paid && s.is_active).length;
    const contactedSponsors = filteredSponsors.filter(s => s.contacted_this_season).length;
    const notContactedSponsors = filteredSponsors.filter(s => !s.contacted_this_season && s.is_active).length;
    
    // Count signs by location
    const locationCounts = {};
    sponsors.forEach(sponsor => {
      (sponsor.locations || []).forEach(loc => {
        const key = `${loc.field} - ${loc.location}`;
        locationCounts[key] = (locationCounts[key] || 0) + 1;
      });
    });
    
    return {
      totalSponsors,
      totalRevenue,
      newSponsors,
      returningSponsors,
      paidSponsors,
      unpaidSponsors,
      contactedSponsors,
      notContactedSponsors,
      locationCounts
    };
  };

  // Filter sponsors based on active/contacted filters
  const getFilteredSponsors = () => {
    return sponsors.filter(sponsor => {
      // Active filter
      if (showActiveOnly && !sponsor.is_active) return false;
      
      // Contacted filter
      if (showContactedFilter === 'contacted' && !sponsor.contacted_this_season) return false;
      if (showContactedFilter === 'not-contacted' && sponsor.contacted_this_season) return false;
      
      return true;
    });
  };

  // Get all emails for current filter
  const getAllEmails = () => {
    return getFilteredSponsors()
      .map(s => s.email)
      .filter(Boolean);
  };

  const handleCopyEmails = async () => {
    const emails = getAllEmails();
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      alert(`Copied ${emails.length} emails to clipboard.`);
    } catch (e) {
      console.error('Copy failed:', e);
      alert('Copy failed. Your browser may block clipboard access.');
    }
  };

  const handleExportCsv = () => {
  const filteredSponsors = getFilteredSponsors();
  
  const rows = [
    ['Company Name', 'Contact Name', 'Email', 'Phone', 'Contacted', 'Locations', 'Amount', 'Paid', 'Status']
  ];
  
  filteredSponsors.forEach(s => {
    const locations = s.locations && Array.isArray(s.locations) ? s.locations : [];
    const locationStr = locations
      .map(loc => `${loc.field} - ${loc.location} ($${loc.price})`)
      .join('; ');
    
    rows.push([
      s.company_name,
      s.contact_name || '',
      s.email || '',
      s.phone || '',
      s.contacted_this_season ? 'Yes' : 'No',
      locationStr,
      `$${s.total_amount || 0}`,
      s.has_paid ? 'Yes' : 'No',
      s.is_active ? 'Active' : 'Inactive'
    ]);
  });
  
  const csv = rows.map(row => 
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sponsors.csv';
  a.click();
  URL.revokeObjectURL(url);
};

  // Modal footers
  const ModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={resetForm}
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
        onClick={handleSubmit}
        disabled={!formData.company_name || selectedLocations.length === 0 || saving || !canEdit}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!formData.company_name || selectedLocations.length === 0 || saving || !canEdit) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!formData.company_name || selectedLocations.length === 0 || saving || !canEdit) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {saving ? 'Saving...' : (editingSponsor ? 'Update Sponsor' : 'Add Sponsor')}
      </button>
    </div>
  );

  const ManageLocationsModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={() => setShowManageLocationsModal(false)}
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
      >
        Close
      </button>
    </div>
  );

  const TemplateModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={() => {
          setShowEmailTemplateModal(false);
          setTemplateForm({ name: '', subject: '', body: '' });
          setEditingTemplate(null);
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
      >
        Cancel
      </button>
      <button
        onClick={handleSaveTemplate}
        disabled={!templateForm.name || !templateForm.subject || !templateForm.body || !canEdit}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!templateForm.name || !templateForm.subject || !templateForm.body || !canEdit) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!templateForm.name || !templateForm.subject || !templateForm.body || !canEdit) ? 'not-allowed' : 'pointer'
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingTemplate ? 'Update Template' : 'Save Template'}
      </button>
    </div>
  );

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gray-50 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg p-8 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You do not have permission to view sponsors.</p>
            <p className="text-sm text-gray-500 mt-2">Required roles: {ALLOWED_ROLES.join(', ')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading sponsors...</span>
      </div>
    );
  }

  const totals = calculateTotals();
  const filteredSponsors = getFilteredSponsors();

  // Combine fields and standalone locations for the dropdown
  const allLocationTypes = [...fields, ...standaloneLocations];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sponsors Management</h1>
            <p className="text-gray-600 mt-1">Manage league sponsors and track contributions</p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Role indicator */}
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-800">
              <span className="font-semibold mr-1">Role:</span>
              {user?.role}
              {canEdit && <span className="ml-1 text-green-600">(Can Edit)</span>}
            </div>
            
            {activeTab === 'sponsors' && canEdit && (
              <>
                <button
                  onClick={() => setShowManageLocationsModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Locations
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Sponsor
                </button>
              </>
            )}
            {activeTab === 'email' && canEdit && (
              <button
                onClick={() => setShowEmailTemplateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Template
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex gap-2 flex-wrap border-b border-gray-200">
          <button
            onClick={() => setActiveTab('sponsors')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'sponsors'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Building2 className="h-4 w-4 inline mr-2" />
            Sponsors ({filteredSponsors.length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'reports'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <TrendingUp className="h-4 w-4 inline mr-2" />
            Reports
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'email'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Mail className="h-4 w-4 inline mr-2" />
            Email
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <p className="text-yellow-700">{error}</p>
          <p className="text-xs text-yellow-600 mt-1">Data is being saved locally in your browser.</p>
        </div>
      )}

      {/* Sponsors Tab */}
      {activeTab === 'sponsors' && (
        <>
          {/* Filters */}
          <div className="mb-6 bg-white rounded-lg shadow p-4 border border-gray-200">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center">
                <Filter className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-700">Filters:</span>
              </div>
              
              {/* Active filter */}
              <button
                onClick={() => setShowActiveOnly(!showActiveOnly)}
                className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  showActiveOnly
                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {showActiveOnly ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {showActiveOnly ? 'Active Only' : 'All Sponsors'}
              </button>
              
              {/* Contacted filter */}
              <select
                value={showContactedFilter}
                onChange={(e) => setShowContactedFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Contact Status</option>
                <option value="contacted">Contacted</option>
                <option value="not-contacted">Not Contacted</option>
              </select>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Sponsors</p>
                  <p className="text-2xl font-semibold">{totals.totalSponsors}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-semibold">${totals.totalRevenue}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100 text-yellow-600 mr-4">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">New/Returning</p>
                  <p className="text-2xl font-semibold">{totals.newSponsors} / {totals.returningSponsors}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600 mr-4">
                  <CheckCircle className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Paid/Unpaid</p>
                  <p className="text-2xl font-semibold">{totals.paidSponsors} / {totals.unpaidSponsors}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-orange-100 text-orange-600 mr-4">
                  <Mail className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Contacted</p>
                  <p className="text-2xl font-semibold">{totals.contactedSponsors} / {totals.notContactedSponsors}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sponsors Table */}
          <div className="bg-white shadow overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contacted
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Locations
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSponsors.map((sponsor) => (
                    <tr key={sponsor.id} className={sponsor.is_active ? '' : 'bg-gray-50'}>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {sponsor.company_name}
                        </div>
                        {sponsor.notes && (
                          <div className="text-xs text-gray-500 mt-1">{sponsor.notes}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{sponsor.contact_name}</div>
                        {sponsor.email && (
                          <div className="text-xs text-gray-500 flex items-center mt-1">
                            <Mail className="h-3 w-3 mr-1" />
                            {sponsor.email}
                          </div>
                        )}
                        {sponsor.phone && (
                          <div className="text-xs text-gray-500 flex items-center mt-1">
                            <Phone className="h-3 w-3 mr-1" />
                            {sponsor.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {sponsor.contacted_this_season ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Contacted
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                            <XCircle className="h-3 w-3 mr-1" />
                            Not Contacted
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
  <div className="text-sm">
    <div className="flex flex-col gap-1">
      {sponsor.locations && Array.isArray(sponsor.locations) && sponsor.locations.map((loc, idx) => (
        <span key={idx} className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
          {loc.field} - {loc.location} (${loc.price})
        </span>
      ))}
    </div>
  </div>
</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          ${sponsor.total_amount || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {sponsor.is_new_sponsor && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">
                              New
                            </span>
                          )}
                          {sponsor.is_returning && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                              Returning
                            </span>
                          )}
                          {sponsor.purchased_new_sign && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                              New Sign
                            </span>
                          )}
                          {sponsor.upgraded_location && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                              Upgraded
                            </span>
                          )}
                          {sponsor.downgraded_location && (
                            <span className="inline-flex items-center px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">
                              Downgraded
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {sponsor.has_paid ? (
                          <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            Paid
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                            Unpaid
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(sponsor)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Edit
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDelete(sponsor.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredSponsors.length === 0 && (
                <div className="text-center py-12">
                  <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No sponsors found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {showActiveOnly ? 'No active sponsors match your filters' : 'Get started by adding your first sponsor'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Sponsor Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Sponsors:</span>
                  <span className="font-semibold">{totals.totalSponsors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">New This Season:</span>
                  <span className="font-semibold text-green-600">{totals.newSponsors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Returning:</span>
                  <span className="font-semibold text-blue-600">{totals.returningSponsors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Paid:</span>
                  <span className="font-semibold text-green-600">{totals.paidSponsors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unpaid:</span>
                  <span className="font-semibold text-red-600">{totals.unpaidSponsors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Contacted:</span>
                  <span className="font-semibold text-blue-600">{totals.contactedSponsors}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Revenue:</span>
                  <span className="font-semibold text-lg">${totals.totalRevenue}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Average per Sponsor:</span>
                  <span className="font-semibold">
                    ${totals.totalSponsors ? (totals.totalRevenue / totals.totalSponsors).toFixed(2) : 0}
                  </span>
                </div>
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Paid Amount:</span>
                    <span className="font-semibold text-green-600">
                      ${sponsors.filter(s => s.has_paid).reduce((sum, s) => sum + (s.total_amount || 0), 0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Unpaid Amount:</span>
                    <span className="font-semibold text-red-600">
                      ${sponsors.filter(s => !s.has_paid && s.is_active).reduce((sum, s) => sum + (s.total_amount || 0), 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Signage Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">New Signs Purchased:</span>
                  <span className="font-semibold">{sponsors.filter(s => s.purchased_new_sign).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Upgraded Locations:</span>
                  <span className="font-semibold">{sponsors.filter(s => s.upgraded_location).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Downgraded Locations:</span>
                  <span className="font-semibold">{sponsors.filter(s => s.downgraded_location).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Website Ads:</span>
                  <span className="font-semibold">{sponsors.filter(s => s.has_website_ad).length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Concession Ads:</span>
                  <span className="font-semibold">{sponsors.filter(s => s.has_concession_ad).length}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Contact Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Contacted:</span>
                  <span className="font-semibold text-green-600">{totals.contactedSponsors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Not Contacted:</span>
                  <span className="font-semibold text-red-600">{totals.notContactedSponsors}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${totals.totalSponsors ? (totals.contactedSponsors / totals.totalSponsors) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Location Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Signs by Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(totals.locationCounts).map(([location, count]) => (
                <div key={location} className="flex justify-between items-center p-2 border-b">
                  <span className="text-gray-600">{location}</span>
                  <span className="font-semibold">{count} signs</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div className="space-y-6">
          {/* Email Actions */}
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Email Communications</h3>
              <div className="flex space-x-3">
                <button
                  onClick={handleCopyEmails}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All Emails ({getAllEmails().length})
                </button>
                <button
                  onClick={handleExportCsv}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </button>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">Email addresses ready to copy:</p>
              <div className="max-h-32 overflow-y-auto bg-white p-3 rounded border border-gray-200 text-sm">
                {getAllEmails().join(', ')}
              </div>
            </div>
          </div>

          {/* Email Templates */}
          <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Email Templates</h3>
            </div>
            <div className="divide-y divide-gray-200">
              {emailTemplates.map(template => (
                <div key={template.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-md font-medium text-gray-900">{template.name}</h4>
                      <p className="text-sm text-gray-600 mt-1">Subject: {template.subject}</p>
                      <p className="text-sm text-gray-500 mt-2 whitespace-pre-line line-clamp-2">
                        {template.body}
                      </p>
                    </div>
                    <div className="flex space-x-3">
                      {canEdit && (
                        <button
                          onClick={() => handleEditTemplate(template)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteTemplate(template.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {emailTemplates.length === 0 && (
                <div className="p-12 text-center">
                  <FileText className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No templates</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Create your first email template
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sponsor Form Modal */}
      {canEdit && (
        <Modal
          isOpen={showForm}
          onClose={resetForm}
          title={editingSponsor ? 'Edit Sponsor' : 'Add New Sponsor'}
          footer={ModalFooter}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  placeholder="Enter company name"
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
                  Contact Name
                </label>
                <input
                  type="text"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Enter contact name"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                    fontSize: '14px'
                  }}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter email"
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
                    fontSize: '14px'
                  }}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter phone"
                />
              </div>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Years Sponsoring
              </label>
              <input
                type="number"
                min="1"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
                value={formData.years_sponsoring}
                onChange={(e) => setFormData({ ...formData, years_sponsoring: parseInt(e.target.value) })}
              />
            </div>

            {/* Contacted This Season */}
            <div className="border-t pt-4">
              <label className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <input
                  type="checkbox"
                  checked={formData.contacted_this_season}
                  onChange={(e) => setFormData({ ...formData, contacted_this_season: e.target.checked })}
                  className="h-5 w-5 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-blue-800">✓ Contacted This Season</span>
              </label>
            </div>

            {/* Location Selection with Cascading Dropdowns */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-medium text-gray-700 mb-3">Add Sign Locations</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
  <label className="block text-xs font-medium text-gray-600 mb-1">Select Field/Location Type</label>
  <select
    value={currentField}
    onChange={(e) => {
      setCurrentField(e.target.value);
      setCurrentLocation('');
    }}
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
  >
    <option value="">Choose...</option>
    {allLocationTypes.map(field => (
      <option key={field} value={field}>{field}</option>
    ))}
  </select>
</div>
                
                <div>
  <label className="block text-xs font-medium text-gray-600 mb-1">Select Specific Location</label>
  <select
    value={currentLocation}
    onChange={(e) => setCurrentLocation(e.target.value)}
    disabled={!currentField}
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm disabled:bg-gray-100"
  >
    <option value="">Choose a location...</option>
    {currentField && locationOptions[currentField]?.map(locationName => {
      // Find the location config to get the price (cost in database)
      const locationConfig = locationConfigs.find(
        c => c.field_name === currentField && c.location_name === locationName
      );
      const price = locationConfig ? locationConfig.cost : 400;
      return (
        <option key={locationName} value={locationName}>
          {locationName} (${price})
        </option>
      );
    })}
  </select>
</div>
                
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddLocation}
                    disabled={!currentField || !currentLocation}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Add Location
                  </button>
                </div>
              </div>

              {/* Selected Locations List */}
              {selectedLocations.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Selected Locations:</h4>
                  <div className="space-y-2">
                    {selectedLocations.map((loc, index) => (
                      <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                        <span className="text-sm">
                          {loc.field} - {loc.location} (${loc.price})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLocation(index)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {/* Total Display */}
                  <div className="mt-3 pt-3 border-t flex justify-between items-center">
                    <span className="font-medium text-gray-700">Total:</span>
                    <span className="text-xl font-bold text-green-600">${calculateTotal()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Status Checkboxes */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.is_new_sponsor}
                    onChange={(e) => setFormData({ ...formData, is_new_sponsor: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">New Sponsor</span>
                </label>
                
                <label className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_returning}
                    onChange={(e) => setFormData({ ...formData, is_returning: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Returning Sponsor</span>
                </label>
                
                <label className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.has_paid}
                    onChange={(e) => setFormData({ ...formData, has_paid: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Has Paid</span>
                </label>
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.has_website_ad}
                    onChange={(e) => setFormData({ ...formData, has_website_ad: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Website Ad</span>
                </label>
                
                <label className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.has_concession_ad}
                    onChange={(e) => setFormData({ ...formData, has_concession_ad: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Concession Ad</span>
                </label>
                
                <label className="flex items-center space-x-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.purchased_new_sign}
                    onChange={(e) => setFormData({ ...formData, purchased_new_sign: e.target.checked })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-sm">Purchased New Sign</span>
                </label>
              </div>
            </div>

            {/* Upgrade/Downgrade */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.upgraded_location}
                  onChange={(e) => setFormData({ ...formData, upgraded_location: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm">Upgraded Location</span>
              </label>
              
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.downgraded_location}
                  onChange={(e) => setFormData({ ...formData, downgraded_location: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm">Downgraded Location</span>
              </label>
            </div>

            {/* Active Status */}
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm">Active Sponsor</span>
              </label>
            </div>

            {/* Notes */}
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
                  minHeight: '80px'
                }}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Enter any notes about this sponsor"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* Manage Locations Modal */}
{canEdit && (
  <Modal
    isOpen={showManageLocationsModal}
    onClose={() => {
      setShowManageLocationsModal(false);
      loadLocationConfig(); // Reload locations when closing
    }}
    title="Manage Fields and Locations"
    footer={ManageLocationsModalFooter}
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
      {/* Add New Field */}
      <div className="border-b pb-4">
        <h3 className="font-medium text-gray-900 mb-3">Add New Field</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            placeholder="e.g., Field 4"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddField}
            disabled={!newField}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
          >
            Add Field
          </button>
        </div>
      </div>

      {/* Add New Standalone Location */}
      <div className="border-b pb-4">
        <h3 className="font-medium text-gray-900 mb-3">Add Standalone Location</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={newStandaloneLocation}
            onChange={(e) => setNewStandaloneLocation(e.target.value)}
            placeholder="e.g., Concession Stand"
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddStandaloneLocation}
            disabled={!newStandaloneLocation}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300"
          >
            Add Location
          </button>
        </div>
      </div>

      {/* Add Location Option for a Field */}
      <div className="border-b pb-4">
        <h3 className="font-medium text-gray-900 mb-3">Add Location Option</h3>
        <div className="space-y-3">
          <select
            value={newLocationOption.field}
            onChange={(e) => setNewLocationOption({ ...newLocationOption, field: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Select Field/Location Type</option>
            {allLocationTypes.map(field => (
              <option key={field} value={field}>{field}</option>
            ))}
          </select>
          <input
            type="text"
            value={newLocationOption.location}
            onChange={(e) => setNewLocationOption({ ...newLocationOption, location: e.target.value })}
            placeholder="Location name e.g., Scoreboard"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={newLocationOption.price}
            onChange={(e) => setNewLocationOption({ ...newLocationOption, price: e.target.value })}
            placeholder="Price $"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={handleAddLocationOption}
            disabled={!newLocationOption.field || !newLocationOption.location || !newLocationOption.price}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:bg-gray-300"
          >
            Add Location Option
          </button>
        </div>
      </div>

{/* Current Configuration with Edit/Delete */}
<div>
  <h3 className="font-medium text-gray-900 mb-3">Current Configuration</h3>
  <div className="space-y-4">
    {allLocationTypes.map(field => {
      // Get locations for this field
      const fieldConfigs = locationConfigs.filter(c => c.field_name === field);
      if (fieldConfigs.length === 0) return null;
      
      return (
        <div key={field} className="border rounded-lg p-3">
          <h4 className="font-medium text-gray-800 mb-2">{field}</h4>
          <div className="space-y-2">
            {fieldConfigs.map((config) => (
              <div key={config.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                <div className="flex items-center space-x-2">
  <span className="text-sm text-gray-700">{config.location_name}</span>
  <span className="text-xs text-gray-500">(${config.cost || config.price || 0})</span>
  {!config.is_active && (
    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">Inactive</span>
  )}
</div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEditLocation(config)}
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteLocation(config.id, config.location_name)}
                    className="text-red-600 hover:text-red-800 text-xs font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    })}
  </div>
</div>
    </div>
  </Modal>
)}
{/* Edit Location Modal */}
{canEdit && (
  <Modal
    isOpen={showEditLocationModal}
    onClose={() => {
      setShowEditLocationModal(false);
      setEditingLocation(null);
      setEditLocationForm({
        id: null,
        field: '',
        location: '',
        price: '',
        is_active: true
      });
    }}
    title="Edit Location"
    footer={
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button
          onClick={() => {
            setShowEditLocationModal(false);
            setEditingLocation(null);
            setEditLocationForm({
              id: null,
              field: '',
              location: '',
              price: '',
              is_active: true
            });
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
          onClick={handleUpdateLocation}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'white',
            backgroundColor: '#2563eb',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#1d4ed8'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#2563eb'}
        >
          <Save style={{ width: '16px', height: '16px' }} />
          Update Location
        </button>
      </div>
    }
  >
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Field
        </label>
        <input
          type="text"
          value={editLocationForm.field}
          disabled
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            backgroundColor: '#f3f4f6',
            color: '#6b7280'
          }}
        />
        <p className="text-xs text-gray-500 mt-1">Field name cannot be changed</p>
      </div>
      <div>
        <label style={{
          display: 'block',
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151',
          marginBottom: '8px'
        }}>
          Location Name
        </label>
        <input
          type="text"
          value={editLocationForm.location}
          onChange={(e) => setEditLocationForm({ ...editLocationForm, location: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px'
          }}
          placeholder="Enter location name"
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
          Price ($)
        </label>
        <input
          type="number"
          min="0"
          step="10"
          value={editLocationForm.price}
          onChange={(e) => setEditLocationForm({ ...editLocationForm, price: e.target.value })}
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px'
          }}
          placeholder="Enter price"
        />
      </div>
      <div>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={editLocationForm.is_active}
            onChange={(e) => setEditLocationForm({ ...editLocationForm, is_active: e.target.checked })}
            className="h-4 w-4 text-blue-600 rounded"
          />
          <span className="text-sm text-gray-700">Active (available for selection)</span>
        </label>
      </div>
    </div>
  </Modal>
)}
      {/* Email Template Modal */}
      {canEdit && (
        <Modal
          isOpen={showEmailTemplateModal}
          onClose={() => {
            setShowEmailTemplateModal(false);
            setTemplateForm({ name: '', subject: '', body: '' });
            setEditingTemplate(null);
          }}
          title={editingTemplate ? 'Edit Email Template' : 'New Email Template'}
          footer={TemplateModalFooter}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Template Name
              </label>
              <input
                type="text"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="e.g., Welcome Email"
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
                Subject Line
              </label>
              <input
                type="text"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
                value={templateForm.subject}
                onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                placeholder="Enter email subject"
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
                Email Body
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Available placeholders: {'{company_name}'}, {'{contact_name}'}
              </p>
              <textarea
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minHeight: '200px',
                  fontFamily: 'monospace'
                }}
                value={templateForm.body}
                onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                placeholder="Dear {contact_name},&#10;&#10;Thank you for supporting our league...&#10;&#10;Best regards,&#10;The League Team"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Sponsors;