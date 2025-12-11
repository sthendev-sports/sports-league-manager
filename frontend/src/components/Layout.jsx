// frontend/src/components/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  Trophy,
  DraftingCompass,
  Calendar,
  Mail,
  Menu,
  X,
  Settings,
  HandHelping,
  Shirt,
  CalendarDays,
  UserCheck,
  ClipboardCheck,
  Shield,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  // Hide layout on login page
  if (location.pathname === '/login') {
    return <>{children}</>;
  }

  // Navigation items (roles = which roles can see it; no roles = everyone)
  const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Players', href: '/players', icon: Users },
    { name: 'Teams', href: '/teams', icon: Trophy },
    { name: 'Draft', href: '/draft', icon: DraftingCompass },
    { name: 'Team Uniforms', href: '/team-uniforms', icon: Shirt },
    { name: 'Board Members', href: '/boardmembers', icon: UserCheck },
    {
      name: 'Workbond Management',
      href: '/workbond-management',
      icon: ClipboardCheck,
      roles: ['Administrator', 'President', 'Work Bond Manager'],
    },
    { name: 'Seasons', href: '/seasons', icon: Calendar },
    {
      name: 'Game Scheduler',
      href: '/games',
      icon: CalendarDays,
    },
    { name: 'Mailing List', href: '/mailing-list', icon: Mail },
    { name: 'Configuration', href: '/configuration', icon: Settings },
    { name: 'Volunteers', href: '/volunteers', icon: HandHelping },
    {
      name: 'Users',
      href: '/users',
      icon: Shield,
      roles: ['Administrator', 'President'],
    },
    {
      name: 'Email Settings',
      href: '/email-settings',
      icon: Mail,
      roles: ['Administrator', 'President'],
    },
  ];

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    logout();
  };

  const canSeeNavItem = (item) => {
    if (!item.roles) return true;
    if (!user) return false;
    return item.roles.includes(user.role);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col flex-1 bg-white border-r border-gray-200">
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              {/* Logo / title */}
              <div className="flex items-center flex-shrink-0 px-6 mb-8">
                <h1 className="text-xl font-bold text-gray-800">
                  League Manager
                </h1>
              </div>

              {/* Navigation */}
              <nav className="flex-1 px-4 space-y-2">
                {navigation.map((item) => {
                  if (!canSeeNavItem(item)) return null;
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;

                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`group flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="mr-3 h-5 w-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>

              {/* User info + logout (desktop sidebar) */}
              {user && (
                <div className="mt-6 px-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 mr-2">
                        {user.name
                          ? user.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                          : 'U'}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-gray-900">
                          {user.name || user.email}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {user.role}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium text-gray-600 hover:bg-gray-100"
                    >
                      <LogOut className="h-3 w-3 mr-1" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-gray-200 shadow-sm z-30">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 p-1 rounded-md"
            >
              <Menu className="h-6 w-6" />
            </button>

            <h1 className="text-lg font-semibold text-gray-800">
              League Manager
            </h1>

            {/* Small user / logout on mobile header */}
            <div className="flex items-center space-x-2">
              {user && (
                <>
                  <span className="text-xs text-gray-600 hidden xs:inline">
                    {user.name || user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-xs text-gray-500 hover:text-gray-800"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none bg-gray-50">
          <div className="py-6">
            <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile overlay menu */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            display: 'flex',
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
            }}
            onClick={() => setSidebarOpen(false)}
          />

          {/* Slide-in menu panel */}
          <div
            style={{
              position: 'relative',
              width: '300px',
              maxWidth: '80%',
              height: '100%',
              backgroundColor: 'white',
              boxShadow: '2px 0 10px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Menu header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e5e7eb',
                backgroundColor: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#1f2937',
                  margin: 0,
                }}
              >
                Navigation Menu
              </h2>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  color: '#6b7280',
                  background: 'none',
                  border: 'none',
                  padding: '4px',
                  cursor: 'pointer',
                }}
              >
                <X style={{ width: '24px', height: '24px' }} />
              </button>
            </div>

            {/* Navigation items */}
            <nav
              style={{
                flex: 1,
                padding: '20px 16px',
                overflowY: 'auto',
              }}
            >
              {navigation.map((item) => {
                if (!canSeeNavItem(item)) return null;
                const Icon = item.icon;
                const isActive = location.pathname === item.href;

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px 16px',
                      marginBottom: '8px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      fontSize: '16px',
                      fontWeight: '500',
                      backgroundColor: isActive ? '#dbeafe' : 'transparent',
                      color: isActive ? '#1d4ed8' : '#374151',
                      borderLeft: isActive ? '4px solid #3b82f6' : 'none',
                      boxShadow: isActive
                        ? '0 1px 3px rgba(0, 0, 0, 0.1)'
                        : 'none',
                    }}
                  >
                    <Icon
                      style={{
                        width: '20px',
                        height: '20px',
                        marginRight: '12px',
                        color: isActive ? '#1d4ed8' : '#6b7280',
                      }}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Footer with user + logout + version */}
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid #e5e7eb',
                backgroundColor: 'white',
              }}
            >
              {user && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#111827',
                        margin: 0,
                      }}
                    >
                      {user.name || user.email}
                    </p>
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        margin: 0,
                      }}
                    >
                      {user.role}
                    </p>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '6px 10px',
                      borderRadius: '9999px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: 'white',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: '#4b5563',
                      cursor: 'pointer',
                    }}
                  >
                    <LogOut
                      style={{
                        width: '14px',
                        height: '14px',
                        marginRight: '4px',
                      }}
                    />
                    Logout
                  </button>
                </div>
              )}
              <p
                style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  margin: 0,
                }}
              >
                League Manager v1.0
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
