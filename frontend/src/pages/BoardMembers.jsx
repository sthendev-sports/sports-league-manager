import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, Users, Mail, Phone, Download, Upload, Shield } from 'lucide-react';
import Modal from '../components/Modal';
import api, { boardMembersAPI } from '../services/api';


const BoardMembers = () => {
  const [boardMembers, setBoardMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'Board Member',
    spouse_first_name: '',
    spouse_last_name: '',
    spouse_email: '',
    abuse_awareness_completed: false,
    is_active: true,
    notes: ''
  });

  // Import data
  const [importData, setImportData] = useState({
    csvData: '',
    mapping: {}
  });

  useEffect(() => {
    loadBoardMembers();
  }, []);

  const loadBoardMembers = async () => {
  try {
    setLoading(true);
    setError(null);

    const response = await boardMembersAPI.getAll();
    const data = response.data;
    setBoardMembers(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error loading board members:', error);
    setError('Failed to load board members: ' + error.message);
  } finally {
    setLoading(false);
  }
};

  const handleResetCompliance = async () => {
    const ok = window.confirm(
      'This will clear Abuse Awareness Training and Background Check for ALL active board members. Continue?'
    );
    if (!ok) return;

    try {
      await boardMembersAPI.resetCompliance(true);
      await loadBoardMembers();
    } catch (error) {
      console.error('Error resetting compliance:', error);
      setError('Failed to reset compliance statuses. ' + error.message);
    }
  };



  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    try {
      const url = editingMember ? `/api/board-members/${editingMember.id}` : '/api/board-members';
      const method = editingMember ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      await loadBoardMembers();
      resetForm();
    } catch (error) {
      console.error('Error saving board member:', error);
      setError('Failed to save board member: ' + error.message);
    }
  };

  const handleEdit = (member) => {
    setEditingMember(member);
    setFormData({
      first_name: member.first_name || '',
      last_name: member.last_name || '',
      email: member.email || '',
      phone: member.phone || '',
      role: member.role || 'Board Member',
      spouse_first_name: member.spouse_first_name || '',
      spouse_last_name: member.spouse_last_name || '',
      spouse_email: member.spouse_email || '',
      abuse_awareness_completed: member.abuse_awareness_completed || false,
	  background_check_completed: member.background_check_completed || false,
      is_active: member.is_active !== undefined ? member.is_active : true,
      notes: member.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (memberId) => {
  if (window.confirm('Are you sure you want to delete this board member?')) {
    try {
      await boardMembersAPI.delete(memberId);
      await loadBoardMembers();
    } catch (error) {
      console.error('Error deleting board member:', error);
      setError('Failed to delete board member. ' + error.message);
    }
  }
};


  const handleImportSubmit = async (e) => {
    e.preventDefault();
    try {
      // Parse CSV data and convert to board member format
      const rows = importData.csvData.split('\n').filter(row => row.trim());
      const headers = rows[0].split(',').map(h => h.trim());
      const boardMembersData = rows.slice(1).map(row => {
        const values = row.split(',').map(v => v.trim());
        const member = {};
        headers.forEach((header, index) => {
          member[header.toLowerCase().replace(/\s+/g, '_')] = values[index] || '';
        });
        return member;
      });

      // Transform to match our expected format
      const transformedData = boardMembersData.map(member => ({
        first_name: member.first_name || member['first name'] || '',
        last_name: member.last_name || member['last name'] || '',
        email: member.email || member['email_address'] || member['email address'] || '',
        phone: member.phone || member['phone_number'] || member['phone number'] || '',
        role: member.role || member['executive_board'] || 'Board Member',
        spouse_first_name: member.spouse_first_name || member['spouse_first name'] || member['spouse first name'] || '',
        spouse_last_name: member.spouse_last_name || member['spouse_last name'] || member['spouse last name'] || '',
        spouse_email: member.spouse_email || member['spouse_email'] || '',
        abuse_awareness_completed: member.abuse_awareness_completed === 'Y' || member['abuse_awareness_completed'] === 'Y',
		background_check_completed: member.background_check_completed === 'Y' || member['background_check_completed'] === 'Y' || member['verification status'] === 'Y'
      }));

      const response = await api.post('/board-members/import', {
  boardMembers: transformedData,
});

const result = response.data;

      await loadBoardMembers();
      setShowImportModal(false);
      setImportData({ csvData: '', mapping: {} });
      
      alert(`Import completed: ${result.message}`);
    } catch (error) {
      console.error('Error importing board members:', error);
      setError('Failed to import board members: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      role: 'Board Member',
      spouse_first_name: '',
      spouse_last_name: '',
      spouse_email: '',
      abuse_awareness_completed: false,
      is_active: true,
      notes: ''
    });
    setEditingMember(null);
    setShowForm(false);
  };

  // Board Member Modal Footer
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
        disabled={!formData.first_name || !formData.last_name || !formData.email}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: (!formData.first_name || !formData.last_name || !formData.email) ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: (!formData.first_name || !formData.last_name || !formData.email) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (formData.first_name && formData.last_name && formData.email) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (formData.first_name && formData.last_name && formData.email) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Save style={{ width: '16px', height: '16px' }} />
        {editingMember ? 'Update Board Member' : 'Create Board Member'}
      </button>
    </div>
  );

  // Import Modal Footer
  const ImportModalFooter = (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
      <button
        onClick={() => setShowImportModal(false)}
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
        onClick={handleImportSubmit}
        disabled={!importData.csvData}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          fontWeight: '500',
          color: 'white',
          backgroundColor: !importData.csvData ? '#9ca3af' : '#2563eb',
          border: 'none',
          borderRadius: '6px',
          cursor: !importData.csvData ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => {
          if (importData.csvData) {
            e.target.style.backgroundColor = '#1d4ed8';
          }
        }}
        onMouseOut={(e) => {
          if (importData.csvData) {
            e.target.style.backgroundColor = '#2563eb';
          }
        }}
      >
        <Upload style={{ width: '16px', height: '16px' }} />
        Import Board Members
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        <span className="ml-4">Loading board members...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Board Members</h1>
            <p className="text-gray-600 mt-1">Manage league board members and their information</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import
            </button>
            <button
              onClick={handleResetCompliance}
              className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
            >
              <Shield className="h-4 w-4 mr-2" />
              Clear Training + Background
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Board Member
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadBoardMembers}
            className="mt-2 inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Board Members Table */}
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Spouse
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Training
              </th>
			  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
      Background Check
    </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {boardMembers.map((member) => (
              <tr key={member.id} className={member.is_active ? '' : 'bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {member.first_name} {member.last_name}
                  </div>
                  {member.family && (
                    <div className="text-xs text-gray-500">
                      Family: {member.family.family_id}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {member.email && (
                      <div className="flex items-center text-gray-500">
                        <Mail className="h-3 w-3 mr-1" />
                        {member.email}
                      </div>
                    )}
                    {member.phone && (
                      <div className="flex items-center text-gray-500 mt-1">
                        <Phone className="h-3 w-3 mr-1" />
                        {member.phone}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{member.role}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {member.spouse_first_name && (
                      <div>
                        {member.spouse_first_name} {member.spouse_last_name}
                        {member.spouse_email && (
                          <div className="text-xs text-gray-500">{member.spouse_email}</div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {member.abuse_awareness_completed ? (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      Completed
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      Pending
                    </span>
                  )}
                </td>
				<td className="px-6 py-4 whitespace-nowrap">
  {member.background_check_completed ? (
    <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
      Completed
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
      Pending
    </span>
  )}
</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {member.is_active ? (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleEdit(member)}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {boardMembers.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No board members</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding your first board member
            </p>
          </div>
        )}
      </div>

      {/* Board Member Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={editingMember ? 'Edit Board Member' : 'Add New Board Member'}
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
                First Name *
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
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="Enter first name"
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
                Last Name *
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
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Enter last name"
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
              Email *
            </label>
            <input
              type="email"
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
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
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
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="Enter phone number"
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
              Role
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
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
            >
              <option value="Board Member">Board Member</option>
              <option value="President">President</option>
              <option value="Vice President">Vice President</option>
              <option value="Vice President - Baseball">Vice President - Baseball</option>
              <option value="Vice President - Softball">Vice President - Softball</option>
              <option value="Secretary">Secretary</option>
              <option value="Treasurer">Treasurer</option>
              <option value="Information Officer">Information Officer</option>
			  <option value="Equipment Manager">Equipment Manager</option>
			  <option value="Safety Officer">Safety Officer</option>
            </select>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-md font-medium text-gray-900 mb-4">Spouse Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  marginBottom: '8px'
                }}>
                  Spouse First Name
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
                  value={formData.spouse_first_name}
                  onChange={(e) => setFormData({ ...formData, spouse_first_name: e.target.value })}
                  placeholder="Enter spouse first name"
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
                  Spouse Last Name
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
                  value={formData.spouse_last_name}
                  onChange={(e) => setFormData({ ...formData, spouse_last_name: e.target.value })}
                  placeholder="Enter spouse last name"
                />
              </div>
            </div>
            <div className="mt-4">
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                marginBottom: '8px'
              }}>
                Spouse Email
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
                value={formData.spouse_email}
                onChange={(e) => setFormData({ ...formData, spouse_email: e.target.value })}
                placeholder="Enter spouse email"
              />
            </div>
          </div>

          <div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                style={{
                  marginRight: '8px'
                }}
                checked={formData.abuse_awareness_completed}
                onChange={(e) => setFormData({ ...formData, abuse_awareness_completed: e.target.checked })}
              />
              Abuse Awareness Training Completed
            </label>
          </div>
<div>
  <label style={{
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    fontWeight: '500',
    color: '#374151',
    marginBottom: '8px',
    cursor: 'pointer'
  }}>
    <input
      type="checkbox"
      style={{
        marginRight: '8px'
      }}
      checked={formData.background_check_completed}
      onChange={(e) => setFormData({ ...formData, background_check_completed: e.target.checked })}
    />
    Background Check Completed
  </label>
</div>
          <div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              marginBottom: '8px',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                style={{
                  marginRight: '8px'
                }}
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              Active Board Member
            </label>
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
                minHeight: '80px'
              }}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Enter any notes about this board member"
            />
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import Board Members"
        footer={ImportModalFooter}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <p className="text-sm text-gray-600 mb-4">
              Paste CSV data below. The first row should contain headers. Expected columns: 
              First Name, Last Name, Email, Phone, Role, Spouse First Name, Spouse Last Name, 
              Spouse Email, Abuse Awareness Completed (Y/N)
            </p>
            <textarea
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                color: '#374151',
                backgroundColor: 'white',
                minHeight: '200px',
                fontFamily: 'monospace'
              }}
              value={importData.csvData}
              onChange={(e) => setImportData({ ...importData, csvData: e.target.value })}
              placeholder="Paste CSV data here..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BoardMembers;