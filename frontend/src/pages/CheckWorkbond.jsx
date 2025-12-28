import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
//import DOMPurify from 'dompurify';

// Move ALL helper functions OUTSIDE the component
function looksLikeJwt(token) {
  if (!token || typeof token !== 'string') return false;
  const t = token.trim().replace(/^Bearer\s+/i, '');
  // Very common JWT shape: three base64url-ish segments.
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(t);
}

function findTokenInObject(obj) {
  if (!obj) return null;
  if (typeof obj === 'string') {
    const s = obj.trim().replace(/^"+|"+$/g, '');
    return looksLikeJwt(s) ? s : null;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = findTokenInObject(v);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === 'object') {
    // Common token field names
    const tokenKeys = ['token', 'access_token', 'accessToken', 'jwt', 'id_token', 'idToken'];
    for (const k of tokenKeys) {
      if (obj[k] && typeof obj[k] === 'string' && looksLikeJwt(obj[k])) return obj[k];
    }
    // Recurse through nested objects
    for (const k of Object.keys(obj)) {
      const found = findTokenInObject(obj[k]);
      if (found) return found;
    }
  }
  return null;
}

function getAuthToken() {
  // 1) Direct keys first (fast path)
  const directKeys = ['token', 'authToken', 'accessToken', 'access_token', 'jwt', 'idToken', 'id_token'];
  for (const k of directKeys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) {
      const s = String(v).trim().replace(/^"+|"+$/g, '');
      if (looksLikeJwt(s)) return s.replace(/^Bearer\s+/i, '');
    }
  }

  // 2) Scan ALL storage keys for a JWT (covers userData/session blobs, Supabase keys, etc.)
  const storages = [localStorage, sessionStorage];
  for (const storage of storages) {
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;

        const trimmed = String(raw).trim();
        // Raw JWT stored directly
        const unquoted = trimmed.replace(/^"+|"+$/g, '');
        if (looksLikeJwt(unquoted)) return unquoted.replace(/^Bearer\s+/i, '');

        // JSON blob
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          try {
            const parsed = JSON.parse(trimmed);
            const found = findTokenInObject(parsed);
            if (found) return String(found).trim().replace(/^Bearer\s+/i, '');
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  return null;
}

function normalizePhone(value) {
  return (value || '').replace(/\D/g, '');
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry = payload.exp * 1000; // Convert to milliseconds
    return Date.now() >= expiry;
  } catch (e) {
    return true;
  }
}

// Enhanced HTML sanitizer configuration - also moved outside
const getSanitizerConfig = () => ({
  ALLOWED_TAGS: [
    'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'blockquote',
    'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'title', 'class', 'style',
    'align', 'valign', 'border', 'cellpadding', 'cellspacing'
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout'],
  ADD_ATTR: ['target'],
  ADD_TAGS: [],
  SAFE_FOR_TEMPLATES: false,
  SAFE_FOR_JQUERY: false,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  RETURN_DOM_IMPORT: false,
  FORCE_BODY: true,
  SANITIZE_DOM: true,
  KEEP_CONTENT: true,
  IN_PLACE: true,
  ALLOW_ARIA_ATTR: false,
  ALLOW_DATA_ATTR: false,
  USE_PROFILES: {
    html: true
  }
});

export default function CheckWorkbond() {
  const navigate = useNavigate();
  const { user: currentUser, logout } = useAuth();
  
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [players, setPlayers] = useState([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  const [contact, setContact] = useState('');
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const [message, setMessage] = useState('');
  const [allowHtml, setAllowHtml] = useState(false);
  const [editingMessage, setEditingMessage] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [messageSaveError, setMessageSaveError] = useState('');

  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('');

  // Function to ensure links have proper attributes for cross-browser compatibility
  const processHtmlForDisplay = (html) => {
    if (!html) return '';
    
    // Check if we're in a browser environment
    if (typeof document === 'undefined') return html;
    
    // Create a temporary div to process the HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Add target="_blank" and rel="noopener noreferrer" to all links for security
    const links = tempDiv.querySelectorAll('a[href]');
    links.forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      
      // Ensure mailto links work properly
      if (link.getAttribute('href')?.startsWith('mailto:')) {
        link.setAttribute('target', '_self');
      }
    });
    
    return tempDiv.innerHTML;
  };

  // Check if user is admin/president
  useEffect(() => {
    const checkAdminStatus = () => {
      // First check if we have currentUser from auth context (most reliable)
      if (currentUser) {
        setUserRole(currentUser.role);
        setIsAdmin(['Administrator', 'President', 'Admin'].includes(currentUser.role));
        return;
      }
      
      // Fallback to token check
      const token = getAuthToken();
      if (token) {
        // Check if token is expired
        if (isTokenExpired(token)) {
          console.warn('Token is expired');
          setIsAdmin(false);
          setUserRole('');
          // Clear expired tokens
          localStorage.removeItem('token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('accessToken');
          return;
        }

        try {
          // Try to decode the token to get user info
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload?.role) {
            setUserRole(payload.role);
            setIsAdmin(['Administrator', 'President', 'Admin'].includes(payload.role));
            return;
          }
        } catch (e) {
          // Token parsing failed
          console.warn('Failed to parse token:', e);
        }
      }
      
      // Not admin
      setIsAdmin(false);
      setUserRole('');
    };
    
    checkAdminStatus();
  }, [currentUser]);

  // Load players list
  useEffect(() => {
    const load = async () => {
      try {
        setLoadingPlayers(true);
        const res = await axios.get('/api/public/checkworkbond/players');
        setPlayers(res.data?.players || []);
      } catch (e) {
        console.error('Error loading players for public workbond lookup', e);
        setError('Unable to load players right now. Please try again later.');
      } finally {
        setLoadingPlayers(false);
      }
    };
    load();
  }, []);

  // Load message from server
  useEffect(() => {
    const loadMessage = async () => {
      try {
        const res = await axios.get('/api/public/checkworkbond/message');
        setMessage(res.data?.message || '');
        setAllowHtml(res.data?.allow_html || false);
      } catch (e) {
        // Non-fatal - just log it
        console.warn('Unable to load public message', e?.message || e);
      }
    };
    loadMessage();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Keep this small for UX
    return players
      .filter((p) => {
        const name = (p.player_name || '').toLowerCase();
        const division = (p.division_name || '').toLowerCase();
        const team = (p.team_name || '').toLowerCase();
        return name.includes(q) || division.includes(q) || team.includes(q);
      })
      .slice(0, 20);
  }, [players, query]);

  const selectPlayer = (p) => {
    setSelected(p);
    setQuery(p.player_name);
    setStatus(null);
    setError('');
  };

  const onSearch = async (e) => {
    e.preventDefault();
    setError('');
    setStatus(null);

    if (!selected?.player_id) {
      setError('Please search for and select a player.');
      return;
    }
    const c = contact.trim();
    if (!c) {
      setError('Please enter a phone number or email address.');
      return;
    }

    setLoadingStatus(true);
    try {
      const res = await axios.post('/api/public/checkworkbond/status', {
        player_id: selected.player_id,
        contact: c
      });
      setStatus(res.data);
    } catch (err) {
      console.error('Error checking workbond status', err);
      const errorData = err?.response?.data;
      const msg = errorData?.error || 
                  errorData?.message ||
                  'Unable to verify. Please confirm the phone/email and try again.';
      setError(msg);
    } finally {
      setLoadingStatus(false);
    }
  };

  const saveMessage = async () => {
    setMessageSaveError('');
    setSavingMessage(true);
    try {
      // Get the current auth token
      const token = getAuthToken();
      if (!token) {
        setMessageSaveError('No authentication token found. Please log in first.');
        setSavingMessage(false);
        return;
      }
      
      // Check if token is expired
      if (isTokenExpired(token)) {
        setMessageSaveError('Your session has expired. Please log in again.');
        setSavingMessage(false);
        
        // Clear expired tokens
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('accessToken');
        
        // Call logout if available
        if (logout) logout();
        
        // Redirect to login
        setTimeout(() => {
          navigate('/login');
        }, 1000);
        return;
      }
      
      // Make the API request with proper headers
      const response = await axios.put(
        '/api/public/checkworkbond/message', 
        { 
          message, 
          allow_html: allowHtml
        }, 
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (response.data?.success) {
        setEditingMessage(false);
        setMessageSaveError('');
      } else {
        setMessageSaveError('Failed to save message. Please try again.');
      }
    } catch (err) {
      console.error('Error saving public workbond message', err);
      
      if (err.response?.status === 401 || err.response?.status === 403) {
        if (err.response?.data?.error?.includes('expired') || err.response?.data?.error?.includes('jwt')) {
          setMessageSaveError('Your session has expired. Please log in again.');
          // Clear tokens and redirect
          localStorage.removeItem('token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('accessToken');
          if (logout) logout();
          setTimeout(() => {
            navigate('/login');
          }, 1000);
        } else {
          setMessageSaveError('Access denied. Please make sure you are logged in as Admin/President.');
        }
      } else {
        const errorMsg = err?.response?.data?.error || 
                        err?.response?.data?.message ||
                        'Unable to save message. Please make sure you are logged in as Admin/President.';
        setMessageSaveError(errorMsg);
      }
    } finally {
      setSavingMessage(false);
    }
  };

  // Function to safely render HTML or plain text with cross-browser support
  const renderMessage = () => {
    if (!message) return null;
    
    if (allowHtml) {
      try {
        // Sanitize HTML for safety with enhanced configuration
        const sanitizedHtml = DOMPurify.sanitize(message, getSanitizerConfig());
        
        // Process HTML for cross-browser compatibility
        const processedHtml = processHtmlForDisplay(sanitizedHtml);
        
        // Create styles for better cross-browser compatibility
        const containerStyles = {
          marginTop: '1rem',
          backgroundColor: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '0.375rem',
          padding: '0.75rem',
          fontSize: '0.875rem',
          color: '#374151',
          // Ensure proper rendering in all browsers
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          whiteSpace: 'pre-wrap'
        };
        
        // Create a style tag for consistent link styling
        const linkStyles = `
          .workbond-message a {
            color: #2563eb;
            text-decoration: underline;
            transition: color 0.2s;
          }
          .workbond-message a:hover {
            color: #1d4ed8;
          }
          .workbond-message a[href^="mailto:"] {
            color: #059669;
          }
          .workbond-message a[href^="mailto:"]:hover {
            color: #047857;
          }
          .workbond-message p {
            margin-bottom: 0.5rem;
          }
          .workbond-message ul, .workbond-message ol {
            margin-left: 1.5rem;
            margin-bottom: 0.5rem;
          }
          .workbond-message li {
            margin-bottom: 0.25rem;
          }
          .workbond-message strong, .workbond-message b {
            font-weight: 600;
          }
          .workbond-message em, .workbond-message i {
            font-style: italic;
          }
        `;
        
        return (
          <>
            <style>{linkStyles}</style>
            <div 
              className="workbond-message"
              style={containerStyles}
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          </>
        );
      } catch (error) {
        console.error('Error rendering HTML message:', error);
        // Fallback to plain text if HTML rendering fails
        return (
          <div className="mt-4 bg-gray-50 border rounded p-3 text-sm text-gray-700 whitespace-pre-line">
            <div className="font-medium mb-1">Message:</div>
            {message}
          </div>
        );
      }
    } else {
      // Plain text with line breaks
      return (
        <div className="mt-4 bg-gray-50 border rounded p-3 text-sm text-gray-700 whitespace-pre-line">
          <div className="font-medium mb-1">Message:</div>
          {message}
        </div>
      );
    }
  };

  // Function to render message in admin panel preview
  const renderAdminPreview = () => {
    if (!message) return 'No message configured.';
    
    if (allowHtml) {
      try {
        const sanitizedHtml = DOMPurify.sanitize(message, getSanitizerConfig());
        const processedHtml = processHtmlForDisplay(sanitizedHtml);
        
        const previewStyles = `
          .workbond-preview a {
            color: #2563eb;
            text-decoration: underline;
          }
          .workbond-preview a:hover {
            color: #1d4ed8;
          }
          .workbond-preview p {
            margin-bottom: 0.5rem;
          }
        `;
        
        return (
          <>
            <style>{previewStyles}</style>
            <div 
              className="workbond-preview"
              dangerouslySetInnerHTML={{ __html: processedHtml }}
            />
          </>
        );
      } catch (error) {
        console.error('Error rendering admin preview:', error);
        return message;
      }
    } else {
      return message;
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Check Work Bond Status</h1>
      <p className="text-gray-600 mb-6">
        Search for your player, then verify with an email address or phone number on file.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <form onSubmit={onSearch} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Player search</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder={loadingPlayers ? 'Loading players…' : 'Type player name…'}
              aria-label="Player search"
              disabled={loadingPlayers}
            />
            {filtered.length > 0 && !selected && (
              <div className="border rounded mt-2 max-h-64 overflow-auto">
                {filtered.map((p) => (
                  <button
                    type="button"
                    key={p.player_id}
                    onClick={() => selectPlayer(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50"
                  >
                    <div className="font-medium">{p.player_name}</div>
                    <div className="text-xs text-gray-600">
                      {p.division_name}{p.team_name ? ` • ${p.team_name}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <div className="text-sm text-gray-700 mt-2">
                Selected: <span className="font-medium">{selected.player_name}</span>
                {' '}• {selected.division_name}{selected.team_name ? ` • ${selected.team_name}` : ''}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email or phone</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Enter an email address or phone number on file"
              aria-label="Email or phone"
            />
            <div className="text-xs text-gray-500 mt-1">
              Use any email or phone number associated with this player's family.
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60"
            disabled={loadingPlayers || loadingStatus}
          >
            {loadingStatus ? 'Checking…' : 'Check Status'}
          </button>
        </form>
      </div>

      {status && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-semibold mb-2">Work Bond Summary</h2>
          
          {status.exempt && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded p-3">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 360 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {/*<span className="font-medium text-green-800">Exempt from Work Bond</span>*/}
              </div>
              {status.exempt_reason && (
                <p className="text-sm text-green-700 mt-1">Reason: {status.exempt_reason}</p>
              )}
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Required</div>
              <div className="text-2xl font-bold">{status.required_shifts}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Completed</div>
              <div className="text-2xl font-bold">{status.completed_shifts}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-gray-500">Remaining</div>
              <div className={`text-2xl font-bold ${status.remaining_shifts === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {status.remaining_shifts}
              </div>
            </div>
          </div>

          {(status.player?.player_name || selected?.player_name) && (
            <div className="mt-4 text-sm text-gray-700">
              Player: <span className="font-medium">{status.player?.player_name || selected?.player_name}</span>
              {status.player?.division_name ? ` • ${status.player.division_name}` : selected?.division_name ? ` • ${selected.division_name}` : ''}
              {status.player?.team_name ? ` • ${status.player.team_name}` : selected?.team_name ? ` • ${selected.team_name}` : ''}
            </div>
          )}

          {renderMessage()}
        </div>
      )}

      {/* Admin/President message editor */}
      {isAdmin && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Message (Admin/President)</h2>
            {userRole && (
              <div className="text-sm text-gray-500">
                Logged in as: {userRole}
              </div>
            )}
          </div>
          
          <div className="mb-3">
            <button
              type="button"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => setEditingMessage(v => !v)}
            >
              {editingMessage ? 'Close' : 'Edit message'}
            </button>
          </div>

          {editingMessage ? (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Message Content
                </label>
                <textarea
                  className="w-full border rounded px-3 py-2 min-h-[120px] font-mono text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  aria-label="Public workbond message"
                  placeholder="Enter your message here..."
                />
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="allow-html"
                  checked={allowHtml}
                  onChange={(e) => setAllowHtml(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <label htmlFor="allow-html" className="ml-2 text-sm text-gray-700">
                  Allow HTML formatting (for links, bold text, etc.)
                </label>
              </div>
              
              {allowHtml && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                  <p className="font-medium mb-1">HTML Examples:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Link: <code className="bg-blue-100 px-1 rounded">&lt;a href="https://example.com"&gt;Click here&lt;/a&gt;</code></li>
                    <li>Email: <code className="bg-blue-100 px-1 rounded">&lt;a href="mailto:email@example.com"&gt;Email us&lt;/a&gt;</code></li>
                    <li>Bold: <code className="bg-blue-100 px-1 rounded">&lt;strong&gt;Important&lt;/strong&gt;</code></li>
                    <li>Line break: <code className="bg-blue-100 px-1 rounded">&lt;br&gt;</code></li>
                    <li>List: <code className="bg-blue-100 px-1 rounded">&lt;ul&gt;&lt;li&gt;Item 1&lt;/li&gt;&lt;/ul&gt;</code></li>
                  </ul>
                  <p className="mt-2 text-xs">
                    Note: For security, only basic HTML tags are allowed. Links will open in new tabs.
                  </p>
                </div>
              )}
              
              <div className="bg-gray-50 border border-gray-200 rounded p-3">
                <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                <div className="text-sm text-gray-700 p-2 bg-white border rounded min-h-[60px]">
                  {renderAdminPreview()}
                </div>
              </div>
              
              {messageSaveError && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded p-3 text-sm">
                  {messageSaveError}
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  type="button"
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-60"
                  onClick={saveMessage}
                  disabled={savingMessage}
                >
                  {savingMessage ? 'Saving…' : 'Save Message'}
                </button>
                <button
                  type="button"
                  className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
                  onClick={() => setEditingMessage(false)}
                >
                  Cancel
                </button>
              </div>
              <div className="text-xs text-gray-500">
                This save requires a valid login token and Admin/President role.
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="text-sm text-gray-700 border rounded p-3 bg-gray-50 min-h-[60px]">
                {renderAdminPreview()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}