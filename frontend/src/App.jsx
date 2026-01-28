import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import Teams from './pages/Teams';
import Draft from './pages/Draft';
import Seasons from './pages/Seasons';
import MailingList from './pages/MailingList';
import Configuration from './pages/Configuration';
import Volunteers from './pages/Volunteers';
import TeamUniforms from './pages/TeamUniforms';
import Requests from './pages/Requests';
import GameScheduler from './pages/GameScheduler';
import BoardMembers from './pages/BoardMembers';
import WorkbondManagement from './pages/WorkbondManagement';
import Login from './pages/Login';
import Users from './pages/Users';
import EmailSettings from './pages/EmailSettings';
import FamilyManager from './pages/FamilyManager';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import CheckWorkbond from './pages/CheckWorkbond';

function App() {
  // Wake up the Render backend (free tier may spin down when idle).
  // Uses a simple GET so the first user action (like Login POST) doesn't fail during cold start.
  useEffect(() => {
    fetch('/api/health').catch(() => {});
  }, []);

  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-100">
          <Layout>
            <ErrorBoundary>
              <Routes>
                {/* Public routes: Layout component will hide navigation for these */}
                <Route path="/checkworkbond" element={<CheckWorkbond />} />
                <Route path="/login" element={<Login />} />

                {/* Protected routes (any logged-in user) */}
                <Route
                  path="/"
                  element={<ProtectedRoute element={<Dashboard />} />}
                />
                <Route
                  path="/players"
                  element={<ProtectedRoute element={<Players />} />}
                />
                <Route
                  path="/teams"
                  element={<ProtectedRoute element={<Teams />} />}
                />

                <Route
                  path="/requests"
                  element={
                    <ProtectedRoute
                      element={<Requests />}
                      requiredRoles={['Administrator', 'President']}
                    />
                  }
                />
} />}
                />
                <Route path="/draft" element={
  <ProtectedRoute 
    element={<Draft />} 
    requiredPermission="read" // Minimum: read access
  />
} />
                <Route
                  path="/seasons"
                  element={<ProtectedRoute element={<Seasons />} />}
                />
                <Route
                  path="/mailing-list"
                  element={<ProtectedRoute element={<MailingList />} />}
                />
                <Route
                  path="/configuration"
                  element={<ProtectedRoute element={<Configuration />} />}
                />
                <Route
                  path="/volunteers"
                  element={<ProtectedRoute element={<Volunteers />} />}
                />
                <Route
                  path="/team-uniforms"
                  element={<ProtectedRoute element={<TeamUniforms />} />}
                />
                <Route
                  path="/games"
                  element={<ProtectedRoute element={<GameScheduler />} />}
                />
                <Route
                  path="/boardmembers"
                  element={<ProtectedRoute element={<BoardMembers />} />}
                />
<Route path="/family-manager" element={
  <ProtectedRoute element={<FamilyManager />} requiredPermission="write" />
} />
                {/* Workbond management: restricted roles */}
                <Route
                  path="/workbond-management"
                  element={
                    <ProtectedRoute
                      element={<WorkbondManagement />}
                      requiredRoles={[
                        'Administrator',
                        'President',
                        'Work Bond Manager',
                      ]}
                    />
                  }
                />

                {/* Users management: Admin / President only */}
                <Route
                  path="/users"
                  element={
                    <ProtectedRoute
                      element={<Users />}
                      requiredRoles={['Administrator', 'President']}
                    />
                  }
                />

                {/* Email settings: Admin / President only */}
                <Route
                  path="/email-settings"
                  element={
                    <ProtectedRoute
                      element={<EmailSettings />}
                      requiredRoles={['Administrator', 'President']}
                    />
                  }
                />
              </Routes>
            </ErrorBoundary>
          </Layout>

          <Toaster position="top-right" />
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;