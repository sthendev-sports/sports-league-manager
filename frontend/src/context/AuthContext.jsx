// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Key where we store the JWT in localStorage
const TOKEN_KEY = 'slm_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);      // { id, email, name, role }
  const [token, setToken] = useState(null);    // JWT string
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // On first load, try to restore token from localStorage
  useEffect(() => {
    const existingToken = typeof window !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;

    if (!existingToken) {
      setLoading(false);
      return;
    }

    // Validate token by calling /api/auth/me
    (async () => {
      try {
        setLoading(true);
        setAuthError(null);
        // token will be attached by axios interceptor
        const response = await api.get('/auth/me');
        const data = response.data;
        setUser(data.user);
        setToken(existingToken);
      } catch (err) {
        console.error('Failed to restore auth session:', err);
        // Token may be invalid/expired – clear it
        if (typeof window !== 'undefined') {
          localStorage.removeItem(TOKEN_KEY);
        }
        setUser(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Login function
  const login = async (email, password) => {
    try {
      setAuthError(null);
      const response = await api.post('/auth/login', { email, password });
      const { token: newToken, user: userPayload } = response.data;

      if (typeof window !== 'undefined') {
        localStorage.setItem(TOKEN_KEY, newToken);
      }

      setToken(newToken);
      setUser(userPayload);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      const message =
        err.response?.data?.error ||
        err.message ||
        'Login failed';
      setAuthError(message);
      return { success: false, error: message };
    }
  };

  // Logout function
  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
    setUser(null);
    setToken(null);
  };

  const value = {
    user,
    token,
    loading,
    authError,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Convenience hook for components to use auth
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
