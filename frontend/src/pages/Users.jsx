// frontend/src/pages/Users.jsx
import React, { useEffect, useState } from 'react';
import {
  UserPlus,
  Users as UsersIcon,
  Trash2,
  AlertCircle,
  Shield,
  Mail,
  Lock,
  Settings,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Lock as LockWrite,
  ChevronDown,
  ChevronRight,
  CheckCircle
} from 'lucide-react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const ALL_ROLES = [
  'Administrator',
  'President',
  'Treasurer',
  'Equipment Manager',
  'Player Agent',
  'Work Bond Manager',
];

// Resource categories for permissions
const RESOURCE_CATEGORIES = {
  management: {
    name: 'Management',
    resources: [
      { key: 'dashboard', name: 'Dashboard' },
      { key: 'players', name: 'Players' },
      { key: 'teams', name: 'Teams' },
	  { key: 'uniforms', name: 'Team Uniforms' },
      { key: 'draft', name: 'Draft' },
      { key: 'game_scheduler', name: 'Game Scheduler' },
	  { key: 'families', name: 'Family Manager' },
      { key: 'workbond_management', name: 'Workbond Management' },
      { key: 'volunteers', name: 'Volunteers' },
      { key: 'mailing_list', name: 'Mailing List' }
    ]
  },
  administration: {
    name: 'Administration',
    resources: [
      { key: 'board_members', name: 'Board Members' },
      { key: 'users', name: 'Users' },
      { key: 'email_settings', name: 'Email Settings' },
      { key: 'configuration', name: 'Configuration' }
    ]
  },
  other: {
    name: 'Other',
    resources: [
      { key: 'requests', name: 'Requests' }
    ]
  }
};

// Access level options
const ACCESS_LEVELS = [
  { value: 'none', label: 'No Access', icon: EyeOff, color: 'text-gray-400', bgColor: 'bg-gray-100' },
  { value: 'read', label: 'Read Only', icon: Eye, color: 'text-blue-500', bgColor: 'bg-blue-50' },
  { value: 'write', label: 'Read/Write', icon: LockWrite, color: 'text-green-500', bgColor: 'bg-green-50' }
];

const Users = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); // 'users' or 'permissions'

  // User management states
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'Administrator',
    password: '',
    confirmPassword: '',
  });
  const [creating, setCreating] = useState(false);

  // Password reset states
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetWorking, setResetWorking] = useState(false);
  
  // Role edit states
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleValue, setRoleValue] = useState('');
  const [roleWorking, setRoleWorking] = useState(false);

  // Role Permissions states
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [savingPermissions, setSavingPermissions] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [selectedPermissionRole, setSelectedPermissionRole] = useState('');
  const [permissionsMessage, setPermissionsMessage] = useState({ type: '', text: '' });

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await usersAPI.getAll();
      setUsers(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error loading users:', err);
      const msg =
        err.response?.data?.error || err.message || 'Failed to load users';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const loadRolePermissions = async () => {
    try {
      // Using the same API endpoint we'll create
      const response = await fetch('/api/role-permissions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('slm_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load role permissions');
      }
      
      const roleData = await response.json();
      setRoles(roleData);
      
      // Convert to permissions map
      const permMap = {};
      roleData.forEach(role => {
        permMap[role.role] = role.permissions || {};
      });
      
      setPermissions(permMap);
      
      // Select first role by default
      if (roleData.length > 0 && !selectedPermissionRole) {
        setSelectedPermissionRole(roleData[0].role);
      }
      
    } catch (err) {
      console.error('Error loading role permissions:', err);
      setPermissionsMessage({
        type: 'error',
        text: err.message || 'Failed to load role permissions'
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'permissions' && currentUser?.role === 'Administrator') {
      loadRolePermissions();
    }
  }, [activeTab, currentUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      role: 'Administrator',
      password: '',
      confirmPassword: '',
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError(null);

    const { name, email, role, password, confirmPassword } = form;

    if (!name || !email || !role || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setCreating(true);
      await usersAPI.create({ name, email, role, password });
      await loadUsers();
      resetForm();
    } catch (err) {
      console.error('Error creating user:', err);
      const msg =
        err.response?.data?.error || err.message || 'Failed to create user';
      setError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await usersAPI.delete(id);
      await loadUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      const msg =
        err.response?.data?.error || err.message || 'Failed to delete user';
      setError(msg);
    }
  };

  const isSelf = (id) => currentUser && currentUser.id === id;

  const canEditPasswords = currentUser?.role === 'Administrator';
  const canManageRoles = currentUser?.role === 'Administrator';

  const openRoleEdit = (user) => {
    setError(null);
    setRoleTarget(user);
    setRoleValue(user?.role || 'President');
    setRoleModalOpen(true);
  };

  const closeRoleModal = () => {
    setRoleModalOpen(false);
    setRoleTarget(null);
    setRoleValue('');
    setRoleWorking(false);
  };

  const handleSaveRole = async () => {
    if (!roleTarget) return;

    if (isSelf(roleTarget.id)) {
      setError('You cannot change your own role.');
      return;
    }

    try {
      setRoleWorking(true);
      setError(null);

      await usersAPI.updateRole(roleTarget.id, roleValue);
      await loadUsers();
      closeRoleModal();
    } catch (err) {
      console.error('Error updating role:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to update role';
      setError(msg);
      setRoleWorking(false);
    }
  };

  const openResetPassword = (u) => {
    setError(null);
    setResetTarget(u);
    setResetPassword('');
    setResetConfirmPassword('');
    setResetCode('');
    setResetStep(1);
    setResetModalOpen(true);
  };

  const closeResetPassword = () => {
    setResetModalOpen(false);
    setResetTarget(null);
    setResetPassword('');
    setResetConfirmPassword('');
    setResetCode('');
    setResetStep(1);
  };

  const handleRequestResetCode = async () => {
    if (!resetTarget) return;

    if (!resetPassword || !resetConfirmPassword) {
      setError('Please enter the new password and confirm it.');
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (resetPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    try {
      setResetWorking(true);
      setError(null);
      await usersAPI.requestPasswordReset(resetTarget.id);
      setResetStep(2);
    } catch (err) {
      console.error('Error requesting reset code:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to send verification code';
      setError(msg);
    } finally {
      setResetWorking(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetTarget) return;
    if (!resetCode) {
      setError('Please enter the verification code from your email.');
      return;
    }

    try {
      setResetWorking(true);
      setError(null);
      await usersAPI.confirmPasswordReset(resetTarget.id, {
        code: resetCode,
        new_password: resetPassword,
      });
      closeResetPassword();
    } catch (err) {
      console.error('Error confirming password reset:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to update password';
      setError(msg);
    } finally {
      setResetWorking(false);
    }
  };

  // Role Permissions Functions
  const toggleCategory = (categoryKey) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryKey]: !prev[categoryKey]
    }));
  };

  const handlePermissionChange = (role, resource, accessLevel) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [resource]: accessLevel
      }
    }));
  };

  const handleSavePermissions = async () => {
    if (!selectedPermissionRole) return;
    
    try {
      setSavingPermissions(true);
      setPermissionsMessage({ type: '', text: '' });
      
      const rolePerms = permissions[selectedPermissionRole] || {};
      
      const response = await fetch(`/api/role-permissions/${selectedPermissionRole}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('slm_token')}`
        },
        body: JSON.stringify({
          permissions: rolePerms
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save permissions');
      }
      
      setPermissionsMessage({ 
        type: 'success', 
        text: `Permissions saved for ${selectedPermissionRole} role` 
      });
      
      // Reload permissions
      await loadRolePermissions();
      
    } catch (err) {
      console.error('Error saving permissions:', err);
      setPermissionsMessage({ 
        type: 'error', 
        text: err.message || 'Failed to save permissions' 
      });
    } finally {
      setSavingPermissions(false);
    }
  };

  const handleResetPermissions = async () => {
    if (!selectedPermissionRole || !window.confirm(`Reset ${selectedPermissionRole} to default permissions?`)) {
      return;
    }
    
    try {
      setSavingPermissions(true);
      setPermissionsMessage({ type: '', text: '' });
      
      const response = await fetch(`/api/role-permissions/${selectedPermissionRole}/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('slm_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to reset permissions');
      }
      
      setPermissionsMessage({ 
        type: 'success', 
        text: `${selectedPermissionRole} permissions reset to defaults` 
      });
      
      await loadRolePermissions();
      
    } catch (err) {
      console.error('Error resetting permissions:', err);
      setPermissionsMessage({ 
        type: 'error', 
        text: err.message || 'Failed to reset permissions' 
      });
    } finally {
      setSavingPermissions(false);
    }
  };

  const getAccessLevel = (role, resource) => {
    return permissions[role]?.[resource] || 'none';
  };

  const getAccessIcon = (accessLevel) => {
    const level = ACCESS_LEVELS.find(l => l.value === accessLevel);
    const Icon = level?.icon || EyeOff;
    return <Icon className={`h-4 w-4 ${level?.color || 'text-gray-400'}`} />;
  };

  const canManagePermissions = currentUser?.role === 'Administrator';

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <UsersIcon className="h-6 w-6 mr-2 text-blue-600" />
                User Management
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Manage user accounts and role permissions
              </p>
            </div>
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-800">
              <Shield className="h-3 w-3 mr-1.5" />
              <span>
                Only <span className="font-semibold">Administrator</span> can manage users and permissions
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('users')}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <UsersIcon className="h-4 w-4 inline mr-2" />
              Users
            </button>
            {canManagePermissions && (
              <button
                onClick={() => setActiveTab('permissions')}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'permissions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Settings className="h-4 w-4 inline mr-2" />
                Role Permissions
              </button>
            )}
          </nav>
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
          </div>
        )}

        {/* Users Tab Content */}
        {activeTab === 'users' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create user form */}
            <div className="lg:col-span-1">
              <div className="bg-white shadow rounded-lg p-5">
                <div className="flex items-center mb-4">
                  <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 mr-2">
                    <UserPlus className="h-4 w-4 text-blue-600" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900">
                    Create New User
                  </h2>
                </div>

                <form onSubmit={handleCreateUser} className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="Full name"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <Mail className="h-3 w-3 text-gray-400" />
                      </div>
                      <input
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        className="block w-full pl-7 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="user@example.com"
                      />
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Role <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      {ALL_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                        <Lock className="h-3 w-3 text-gray-400" />
                      </div>
                      <input
                        type="password"
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        className="block w-full pl-7 border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      name="confirmPassword"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                      placeholder="Repeat password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full inline-flex justify-center items-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                  >
                    {creating ? 'Creating...' : 'Create User'}
                  </button>
                </form>
              </div>
            </div>

            {/* Users list */}
            <div className="lg:col-span-2">
              <div className="bg-white shadow rounded-lg p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center">
                    <UsersIcon className="h-4 w-4 mr-2 text-gray-500" />
                    Existing Users
                  </h2>
                  <p className="text-xs text-gray-500">
                    Total: <span className="font-semibold">{users.length}</span>
                  </p>
                </div>

                {loading ? (
                  <div className="py-6 flex items-center justify-center text-gray-500 text-sm">
                    <svg
                      className="animate-spin h-4 w-4 mr-2 text-blue-600"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                      ></path>
                    </svg>
                    Loading users...
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-6 text-sm text-gray-500 text-center">
                    No users found yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="text-gray-900 text-sm">
                                {u.name || '—'}
                              </div>
                              {isSelf(u.id) && (
                                <div className="text-[11px] text-green-600">
                                  (You)
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {u.email}
                              </div>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-800">
                                {u.role}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                              {u.created_at
                                ? new Date(u.created_at).toLocaleDateString()
                                : '—'}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-right text-sm">
                              <div className="inline-flex items-center gap-2 justify-end">
                                {canManageRoles && (
                                  <button
                                    onClick={() => openRoleEdit(u)}
                                    className="inline-flex items-center px-2 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                                    title="Edit role"
                                  >
                                    <Shield className="h-3 w-3 mr-1" />
                                    Role
                                  </button>
                                )}
                                {canEditPasswords && (
                                  <button
                                    onClick={() => openResetPassword(u)}
                                    className="inline-flex items-center px-2 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50"
                                    title="Reset password"
                                  >
                                    <Lock className="h-3 w-3 mr-1" />
                                    Reset Password
                                  </button>
                                )}

                                <button
                                  disabled={isSelf(u.id)}
                                  onClick={() => handleDeleteUser(u.id)}
                                  className="inline-flex items-center px-2 py-1 border border-red-200 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                                  title={
                                    isSelf(u.id)
                                      ? 'You cannot delete your own account'
                                      : 'Delete user'
                                  }
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Role Permissions Tab Content */
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {!canManagePermissions ? (
              <div className="p-8 text-center">
                <Shield className="h-12 w-12 mx-auto text-gray-400" />
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  Access Denied
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Only Administrators can manage role permissions
                </p>
              </div>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        Role Permissions Configuration
                      </h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Configure what each role can access in the system
                      </p>
                    </div>
                    
                    {selectedPermissionRole && (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSavePermissions}
                          disabled={savingPermissions}
                          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {savingPermissions ? 'Saving...' : 'Save Changes'}
                        </button>
                        
                        <button
                          onClick={handleResetPermissions}
                          disabled={savingPermissions}
                          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Permissions Message */}
                {permissionsMessage.text && (
                  <div className={`mx-6 mt-4 rounded-lg p-3 ${
                    permissionsMessage.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' :
                    permissionsMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' :
                    'bg-blue-50 border border-blue-200 text-blue-700'
                  }`}>
                    <div className="flex items-center">
                      {permissionsMessage.type === 'error' ? (
                        <AlertCircle className="h-4 w-4 mr-2" />
                      ) : permissionsMessage.type === 'success' ? (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      ) : null}
                      <span className="text-sm">{permissionsMessage.text}</span>
                    </div>
                  </div>
                )}
				{/* Selected Role Banner */}
{selectedPermissionRole && (
  <div className="mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <Shield className="h-5 w-5 text-blue-600 mr-3" />
        <div>
          <h3 className="font-medium text-blue-900">
            Configuring: <span className="font-bold">{selectedPermissionRole}</span>
          </h3>
          <p className="text-sm text-blue-700">
            Click buttons below to change access levels for this role
          </p>
        </div>
      </div>
      <div className="text-sm text-blue-800">
        {roles.find(r => r.role === selectedPermissionRole)?.description || ''}
      </div>
    </div>
  </div>
)}

                <div className="p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Role Selection Sidebar */}
                    <div className="lg:col-span-1">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">
                          Select Role
                        </h3>
                        <div className="space-y-2">
                          {roles.map(role => (
                            <button
                              key={role.role}
                              onClick={() => setSelectedPermissionRole(role.role)}
                              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                                selectedPermissionRole === role.role
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{role.role}</span>
                                {role.is_system && (
                                  <span className="text-xs text-gray-500">System</span>
                                )}
                              </div>
                              {role.description && (
                                <p className="text-xs text-gray-500 mt-1 truncate">
                                  {role.description}
                                </p>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Permissions Matrix */}
                    <div className="lg:col-span-3">
                      {selectedPermissionRole ? (
                        <div>
                          {Object.entries(RESOURCE_CATEGORIES).map(([categoryKey, category]) => (
                            <div key={categoryKey} className="mb-8 last:mb-0">
                              <button
                                onClick={() => toggleCategory(categoryKey)}
                                className="flex items-center justify-between w-full text-left mb-3"
                              >
                                <h3 className="text-md font-medium text-gray-900">
                                  {category.name}
                                </h3>
                                {expandedCategories[categoryKey] ? (
                                  <ChevronDown className="h-4 w-4 text-gray-500" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-500" />
                                )}
                              </button>

                              {expandedCategories[categoryKey] !== false && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {category.resources.map(resource => {
                                    const currentAccess = getAccessLevel(selectedPermissionRole, resource.key);
                                    const level = ACCESS_LEVELS.find(l => l.value === currentAccess);
                                    
                                    return (
                                      <div 
                                        key={resource.key}
                                        className={`border rounded-lg p-4 ${level?.bgColor || 'bg-gray-50'} border-gray-200`}
                                      >
                                        <div className="flex items-center justify-between mb-3">
                                          <div>
                                            <h4 className="font-medium text-gray-900">
                                              {resource.name}
                                            </h4>
                                            <p className="text-xs text-gray-500 mt-1">
                                              Resource key: {resource.key}
                                            </p>
                                          </div>
                                          <div className={`text-sm ${level?.color || 'text-gray-700'}`}>
                                            {getAccessIcon(currentAccess)}
                                          </div>
                                        </div>

                                        <div className="flex space-x-2">
                                          {ACCESS_LEVELS.map(level => (
                                            <button
                                              key={level.value}
                                              onClick={() => handlePermissionChange(
                                                selectedPermissionRole, 
                                                resource.key, 
                                                level.value
                                              )}
                                              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-md text-xs font-medium ${
                                                currentAccess === level.value
                                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                  : 'text-gray-700 hover:bg-gray-100 border border-gray-200'
                                              }`}
                                            >
                                              <level.icon className={`h-3 w-3 mr-1 ${level.color}`} />
                                              {level.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Legend */}
                          <div className="mt-8 pt-6 border-t border-gray-200">
                            <h4 className="text-sm font-medium text-gray-900 mb-3">Access Levels</h4>
                            <div className="flex flex-wrap gap-4">
                              {ACCESS_LEVELS.map(level => (
                                <div key={level.value} className="flex items-center">
                                  <level.icon className={`h-4 w-4 mr-2 ${level.color}`} />
                                  <span className="text-sm text-gray-700">{level.label}</span>
                                  <span className="text-xs text-gray-500 ml-2">
                                    ({level.value === 'none' ? 'Page hidden' : 
                                      level.value === 'read' ? 'View only' : 
                                      'Full access'})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                          <Settings className="h-12 w-12 mx-auto text-gray-400" />
                          <h3 className="mt-4 text-sm font-medium text-gray-900">
                            No Role Selected
                          </h3>
                          <p className="mt-1 text-sm text-gray-500">
                            Select a role from the sidebar to configure permissions
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Reset Password Modal */}
        <Modal
          isOpen={resetModalOpen}
          onClose={closeResetPassword}
          title="Reset Password"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {resetTarget?.name} ({resetTarget?.email})
            </p>

            {!canEditPasswords ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                Only Administrators can reset passwords.
              </div>
            ) : (
              <>
                {resetStep === 1 && (
                  <>
                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
                      Step 1: Enter the new password. We will email a 6-digit verification code to{' '}
                      <span className="font-medium">{currentUser?.email}</span>.
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="At least 8 characters"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={resetConfirmPassword}
                        onChange={(e) => setResetConfirmPassword(e.target.value)}
                        className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Repeat new password"
                      />
                    </div>
                  </>
                )}

                {resetStep === 2 && (
                  <>
                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
                      Step 2: Enter the 6-digit verification code we emailed to{' '}
                      <span className="font-medium">{currentUser?.email}</span>.
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Verification Code
                      </label>
                      <input
                        type="text"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                        placeholder="123456"
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <button
              onClick={closeResetPassword}
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={resetWorking}
            >
              Cancel
            </button>

            {canEditPasswords && resetStep === 1 && (
              <button
                onClick={handleRequestResetCode}
                className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={resetWorking}
              >
                {resetWorking ? 'Sending code...' : 'Send Verification Code'}
              </button>
            )}

            {canEditPasswords && resetStep === 2 && (
              <button
                onClick={handleConfirmPasswordReset}
                className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                disabled={resetWorking}
              >
                {resetWorking ? 'Saving...' : 'Confirm & Update Password'}
              </button>
            )}
          </div>
        </Modal>

        {/* Edit Role Modal */}
        <Modal
          isOpen={roleModalOpen}
          onClose={closeRoleModal}
          title="Edit User Role"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {roleTarget?.name} ({roleTarget?.email})
            </p>

            {isSelf(roleTarget?.id) ? (
              <div className="text-sm text-red-600">
                You cannot change your own role.
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <select
                  value={roleValue}
                  onChange={(e) => setRoleValue(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  Role changes take effect immediately.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <button
              onClick={closeRoleModal}
              className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              disabled={roleWorking}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveRole}
              className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={roleWorking || isSelf(roleTarget?.id)}
            >
              {roleWorking ? 'Saving...' : 'Save Role'}
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default Users;