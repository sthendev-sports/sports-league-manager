// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield } from 'lucide-react'; // Import Shield icon for access denied

// Map frontend routes to permission resources (MUST match backend RESOURCE_BY_BASEURL)
const PAGE_TO_RESOURCE = {
  '/': 'dashboard',
  '/players': 'players',
  '/teams': 'teams',
  '/draft': 'draft',
  '/team-uniforms': 'uniforms', // Assuming uniforms are part of teams
  '/games': 'game_scheduler',
  '/workbond-management': 'workbond_management',
  '/volunteers': 'volunteers',
  '/requests': 'requests',
  '/mailing-list': 'mailing_list',
  '/boardmembers': 'board_members',
  '/users': 'users',
  '/email-settings': 'email_settings',
  '/configuration': 'configuration',
  '/volunteer-import': 'volunteers', // If you have this page
  // Add other pages as needed
};

// Helper to normalize permission values
const normalizePermission = (value) => {
  if (!value) return 'none';
  const v = String(value).toLowerCase();
  if (v === 'none' || v === 'read' || v === 'write') return v;
  if (v === 'r') return 'read';
  if (v === 'rw') return 'write';
  if (v === 'x') return 'none';
  return 'none';
};

const ProtectedRoute = ({ element, requiredRoles, requiredPermission = 'read' }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // While we're checking token / restoring session
  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-gray-500">
        <div className="flex items-center">
          <svg
            className="animate-spin h-5 w-5 mr-3 text-blue-600"
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
          <span>Checking permissions…</span>
        </div>
      </div>
    );
  }

  // Not logged in → go to login
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname || '/' }}
      />
    );
  }

  // ===== OPTION 1: Check requiredRoles (backward compatibility) =====
  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(user.role)) {
      return (
        <div className="flex justify-center items-center min-h-screen bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
            <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              Your role "<span className="font-semibold">{user.role}</span>" does not have permission to access this page.
            </p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }
  }

  // ===== OPTION 2: Check resource-based permissions (NEW SYSTEM) =====
  const resource = PAGE_TO_RESOURCE[location.pathname];
  
  if (resource) {
    // Get user's permission for this resource
    const userPermission = user.permissions?.[resource];
    const normalizedUserPermission = normalizePermission(userPermission);
    const normalizedRequired = normalizePermission(requiredPermission);
    
    // Permission hierarchy: none < read < write
    const permissionOrder = { 'none': 0, 'read': 1, 'write': 2 };
    const userLevel = permissionOrder[normalizedUserPermission] || 0;
    const requiredLevel = permissionOrder[normalizedRequired] || 0;
    
    if (userLevel < requiredLevel) {
      // User doesn't have required permission level
      const permissionText = {
        'none': 'No access',
        'read': 'View-only access',
        'write': 'Edit access'
      };
      
      return (
        <div className="flex justify-center items-center min-h-screen bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-8 text-center">
            <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-2">
              You need <span className="font-semibold">{permissionText[normalizedRequired]}</span> to this page.
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Your current permission: <span className="font-semibold">{permissionText[normalizedUserPermission] || 'None'}</span>
            </p>
            <button
              onClick={() => window.history.back()}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }
  }

  // All good → render the page
  return element;
};

export default ProtectedRoute;