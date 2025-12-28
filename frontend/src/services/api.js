import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT token (if present) to every request
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('slm_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

const dashboardAPI = {
  getStatistics: async (seasonId) => {
    const response = await api.get('/dashboard/statistics', {
      params: { season_id: seasonId },
    });
    return response.data;
  },
};

// API methods for seasons
export const seasonsAPI = {
  getAll: () => api.get('/seasons'),
  getActive: () => api.get('/seasons/active'),
  create: (seasonData) => api.post('/seasons', seasonData),
  update: (id, seasonData) => api.put(`/seasons/${id}`, seasonData),
  getStatistics: (id) => api.get(`/seasons/${id}/statistics`),
};

// API methods for players
export const playersAPI = {
  getAll: (filters = {}) => api.get('/players', { params: filters }),
  getById: (id) => api.get(`/players/${id}`),
  create: (playerData) => api.post('/players', playerData),
  update: (id, playerData) => api.put(`/players/${id}`, playerData),
  delete: (id) => api.delete(`/players/${id}`),
  getDraftablePlayers: (seasonId, divisionId) =>
    api.get('/players/draftable', { params: { season_id: seasonId, division_id: divisionId } }),
};

// API methods for teams
export const teamsAPI = {
  getAll: (filters = {}) => api.get('/teams', { params: filters }),
  getById: (id) => api.get(`/teams/${id}`),
  create: (teamData) => api.post('/teams', teamData),
  update: (id, teamData) => api.put(`/teams/${id}`, teamData),
  delete: (id) => api.delete(`/teams/${id}`),
  getWithDetails: (filters = {}) => api.get('/teams/with-details', { params: filters }),
};

// Volunteers API
export const volunteersAPI = {
  getAll: (filters = {}) => api.get('/volunteers', { params: filters }),
  getUnlinked: () => api.get('/volunteers/unlinked'),
  create: (volunteerData) => api.post('/volunteers', volunteerData),
  update: (id, volunteerData) => api.put(`/volunteers/${id}`, volunteerData),
  delete: (id) => api.delete(`/volunteers/${id}`),
};

// Families API
export const familiesAPI = {
  getAll: (filters = {}) => api.get('/families', { params: filters }),
  getById: (id) => api.get(`/families/${id}`),
  updateFamilyLink: (familyId, data) => api.put(`/families/${familyId}/link`, data),
};

// Board Members API
export const boardMembersAPI = {
  getAll: () => api.get('/board-members'),
  create: (data) => api.post('/board-members', data),
  update: (id, data) => api.put(`/board-members/${id}`, data),
  delete: (id) => api.delete(`/board-members/${id}`),
};

// Draft API
export const draftAPI = {
  startDraft: (data) => api.post('/draft/start', data),
  getDraft: (id) => api.get(`/draft/${id}`),
  makePick: (id, data) => api.post(`/draft/${id}/pick`, data),
  commitDraft: (id) => api.post(`/draft/${id}/commit`),
};

// Games API
export const gamesAPI = {
  getAll: (filters = {}) => api.get('/games', { params: filters }),
  create: (data) => api.post('/games', data),
  update: (id, data) => api.put(`/games/${id}`, data),
  delete: (id) => api.delete(`/games/${id}`),
};

// Users API ✅ (this fixes your Users.jsx error)
export const usersAPI = {
  getAll: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Email Settings API
export const emailSettingsAPI = {
  get: () => api.get('/email-settings'),
  update: (data) => api.put('/email-settings', data),
  testSend: (data = {}) => api.post('/email-settings/test-send', data),
};

// Notifications API (new)
export const notificationsAPI = {
  sendManagerRosters: (data) => api.post('/notifications/send-manager-rosters', data),
};

// CSV parsing helpers
export const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = i < line.length - 1 ? line[i + 1] : null;

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

const cleanHeaderName = (header) => {
  const headerMap = {
    // Player fields
    'registrationno': 'registration_no',
    'registration no': 'registration_no',
    'firstname': 'first_name',
    'first name': 'first_name',
    'lastname': 'last_name',
    'last name': 'last_name',
    'birthdate': 'birth_date',
    'birth date': 'birth_date',
    'programtitle': 'program_title',
    'program title': 'program_title',
    'family id': 'family_id',
    'familyid': 'family_id',
    'medical conditions': 'medical_conditions',
    'medical release form': 'medical_release_form',
    'new or returning': 'new_or_returning',
    'travel player': 'travel_player',
    'uniform shirt size': 'uniform_shirt_size',
    'uniform shirt color': 'uniform_shirt_color',
    'uniform pant size': 'uniform_pant_size',
    'uniform pant color': 'uniform_pant_color',
    'workbond check status': 'workbond_check_status',
    'paymentstatus': 'payment_status',
    'payment status': 'payment_status',
    'team name': 'team_name',
    'division name': 'division_name',
    'guardian1 first name': 'primary_guardian_first_name',
    'guardian1 last name': 'primary_guardian_last_name',
    'guardian1 email': 'primary_guardian_email',
    'guardian1 phone': 'primary_guardian_phone',
    'guardian2 first name': 'secondary_guardian_first_name',
    'guardian2 last name': 'secondary_guardian_last_name',
    'guardian2 email': 'secondary_guardian_email',
    'guardian2 phone': 'secondary_guardian_phone',

    // Volunteer fields (if any)
    'volunteer name': 'volunteer_name',
    'volunteer email': 'volunteer_email',
    'volunteer phone': 'volunteer_phone',
    'volunteer role': 'volunteer_role',
  };

  const normalized = header.trim().toLowerCase();
  return headerMap[normalized] || normalized.replace(/\s+/g, '_');
};

// Robust CSV row parser that supports commas, quotes, and NEWLINES inside quoted fields.
// Returns rows as arrays of strings (already unescaped for double quotes).
const parseCSVRows = (csvText) => {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  // Normalize newlines to \n
  const s = (csvText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      // If we're inside quotes and the next char is also a quote, it's an escaped quote.
      if (inQuotes && s[i + 1] === '"') {
        field += '"';
        i++; // skip the escaped quote
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n' && !inQuotes) {
      row.push(field);
      field = '';
      // Avoid pushing a trailing completely empty row at EOF
      if (row.length > 1 || row.some((v) => (v || '').trim() !== '')) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += ch;
  }

  // Flush last field/row
  row.push(field);
  if (row.length > 1 || row.some((v) => (v || '').trim() !== '')) {
    rows.push(row);
  }

  return rows;
};

export const parseCSVData = (csvContent) => {
  if (!csvContent) return [];

  const rows = parseCSVRows(csvContent);
  if (rows.length < 2) return [];

  const rawHeaders = rows[0].map((h) => (h ?? '').toString());
  const cleanHeaders = rawHeaders.map((h) => cleanHeaderName(h));

  // Build a map: cleanHeader -> list of column indices where it appears.
  const headerIndexMap = {};
  cleanHeaders.forEach((h, idx) => {
    if (!headerIndexMap[h]) headerIndexMap[h] = [];
    headerIndexMap[h].push(idx);
  });

  // Preserve a stable output header list in the order headers first appear (de-duped).
  const uniqueHeaders = [];
  cleanHeaders.forEach((h) => {
    if (!uniqueHeaders.includes(h)) uniqueHeaders.push(h);
  });

  return rows.slice(1).map((values) => {
    const rowObj = {};

    uniqueHeaders.forEach((h) => {
      const indices = headerIndexMap[h] || [];

      // Merge duplicates for this row: take the first non-empty value among duplicate columns.
      let merged = '';
      for (const i of indices) {
        const v = (values[i] ?? '').toString().trim();
        if (v !== '') {
          merged = v;
          break;
        }
      }

      rowObj[h] = merged;
    });

    return rowObj;
  });
};

// Backwards-compatible: some pages use parseCSV from here
export const parseCSV = (csvContent) => parseCSVData(csvContent);

// CSV import helper for backend endpoints (players/volunteers)
export const importAPI = {
  // Players import (JSON) - used by Players page
  players: (playersData, seasonId) => api.post('/players/import', { players: playersData, season_id: seasonId }),

  uploadPlayersCSV: (file, seasonId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('season_id', seasonId);
    return api.post('/players/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadVolunteersCSV: (file, seasonId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('season_id', seasonId);
    return api.post('/volunteers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Health check
export const healthCheck = () => api.get('/health');

// Division API
export const divisionsAPI = {
  getAll: (filters = {}) => api.get('/divisions', { params: filters }),
  getById: (id) => api.get(`/divisions/${id}`),
  create: (data) => api.post('/divisions', data),
  update: (id, data) => api.put(`/divisions/${id}`, data),
  delete: (id) => api.delete(`/divisions/${id}`),
};

export { dashboardAPI };
export default api;
