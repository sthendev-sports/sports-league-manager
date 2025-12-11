// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ element, requiredRoles }) => {
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

  // If specific roles required, check them
  if (requiredRoles && requiredRoles.length > 0) {
    if (!requiredRoles.includes(user.role)) {
      return (
        <div className="p-8">
          <div className="max-w-xl mx-auto bg-white shadow rounded-lg p-6 border border-red-100">
            <h2 className="text-lg font-semibold text-red-700 mb-2">
              Access denied
            </h2>
            <p className="text-sm text-gray-700 mb-2">
              Your account role (<span className="font-mono">{user.role}</span>) does not have
              permission to view this page.
            </p>
            <p className="text-xs text-gray-500">
              If you believe this is a mistake, ask an Administrator or President to adjust your
              permissions.
            </p>
          </div>
        </div>
      );
    }
  }

  // All good → render the page
  return element;
};

export default ProtectedRoute;
