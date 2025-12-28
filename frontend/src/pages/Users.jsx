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
} from 'lucide-react';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ALL_ROLES = [
  'Administrator',
  'President',
  'Treasurer',
  'Equipment Manager',
  'Player Agent',
  'Work Bond Manager',
];

const Users = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'Administrator',
    password: '',
    confirmPassword: '',
  });
  const [creating, setCreating] = useState(false);

  // Password reset (Admin only)
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1=new password, 2=enter code
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetWorking, setResetWorking] = useState(false);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleValue, setRoleValue] = useState('');
  const [roleWorking, setRoleWorking] = useState(false);


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

  useEffect(() => {
    loadUsers();
  }, []);

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


  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <UsersIcon className="h-6 w-6 mr-2 text-blue-600" />
              User Management
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Create and manage user accounts and their access roles.
            </p>
          </div>
          <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs text-blue-800">
            <Shield className="h-3 w-3 mr-1.5" />
            <span>
              Only <span className="font-semibold">Administrator</span> and{' '}
              <span className="font-semibold">President</span> can manage users
            </span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Layout: Create form + list */}
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

      {/* Reset Password Modal (Administrator only) */}
      {resetModalOpen && resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-lg">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Reset Password
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {resetTarget.name} ({resetTarget.email})
                </p>
              </div>
              <button
                onClick={closeResetPassword}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {!canEditPasswords ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                  Only Administrators can reset passwords.
                </div>
              ) : (
                <>
                  {resetStep === 1 && (
                    <>
                      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
                        Step 1: Enter the new password. We will email a 6-digit verification code to <span className="font-medium">{currentUser?.email}</span>.
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          New Password
                        </label>
                        <input
                          type="password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="Repeat new password"
                        />
                      </div>
                    </>
                  )}

                  {resetStep === 2 && (
                    <>
                      <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
                        Step 2: Enter the 6-digit verification code we emailed to <span className="font-medium">{currentUser?.email}</span>.
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Verification Code
                        </label>
                        <input
                          type="text"
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                          placeholder="123456"
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
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
          </div>
        </div>
      )}


      {/* Edit Role Modal (Administrator only) */}
      {roleModalOpen && roleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-lg">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Edit User Role
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {roleTarget.name} ({roleTarget.email})
                </p>
              </div>
              <button
                onClick={closeRoleModal}
                className="text-gray-500 hover:text-gray-700"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {isSelf(roleTarget.id) ? (
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

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
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
                disabled={roleWorking || isSelf(roleTarget.id)}
              >
                {roleWorking ? 'Saving...' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}


      </div>
    </div>
  );
};

export default Users;