import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Copy, Download, Filter } from 'lucide-react';

const VOLUNTEER_ROLE_OPTIONS = [
  'All Roles',
  'Manager',
  'Assistant Coach',
  'Team Parent',
];

const WORKBOND_CHECK_OPTIONS = ['All', 'Received', 'Not Received'];

function getLastName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts[parts.length - 1] || '').toLowerCase();
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((r) => r.map(csvEscape).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const Tabs = {
  GUARDIANS: 'Guardians',
  ASSIGNED_VOLUNTEERS: 'Assigned Volunteers',
  WORKBOND_INCOMPLETE: 'Workbond Incomplete',
};

export default function MailingList() {
  const [activeTab, setActiveTab] = useState(Tabs.GUARDIANS);

  const [seasons, setSeasons] = useState([]);
  const [divisions, setDivisions] = useState([]);

  const divisionNameById = useMemo(() => {
    const m = new Map();
    for (const d of divisions || []) {
      const name = d?.name || d?.division_name || d?.label || '';
      if (d?.id && name) m.set(String(d.id), name);
    }
    return m;
  }, [divisions]);

  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState('all');
  const [selectedVolunteerRole, setSelectedVolunteerRole] = useState('All Roles');
  const [selectedWorkbondCheck, setSelectedWorkbondCheck] = useState('All');

  const [players, setPlayers] = useState([]);
  const [volunteers, setVolunteers] = useState([]);
  const [workbondSummary, setWorkbondSummary] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // -------------------- LOAD SEASONS (default active) --------------------
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setError('');
        const { data } = await axios.get('/api/seasons');
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setSeasons(list);

        const active = list.find((s) => s.is_active) || list[0];
        if (active) setSelectedSeasonId(active.id);
      } catch (e) {
        console.error('Error loading seasons:', e);
        if (!mounted) return;
        setError('Failed to load seasons');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // -------------------- LOAD DIVISIONS FOR SEASON --------------------
  useEffect(() => {
    if (!selectedSeasonId) return;
    let mounted = true;
    (async () => {
      try {
        const { data } = await axios.get('/api/divisions', {
          params: { season_id: selectedSeasonId },
        });
        if (!mounted) return;
        setDivisions(Array.isArray(data) ? data : []);
        setSelectedDivisionId('all');
      } catch (e) {
        console.error('Error loading divisions:', e);
        if (!mounted) return;
        setDivisions([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedSeasonId]);

// Update the season dropdown handler to properly reset
const handleSeasonChange = (seasonId) => {
  // Clear all data immediately
  setPlayers([]);
  setVolunteers([]);
  setWorkbondSummary([]);
  setSelectedDivisionId('all');
  setSelectedSeasonId(seasonId);
  setLoading(true);
};

// -------------------- LOAD DATA FOR SEASON/DIVISION --------------------
useEffect(() => {
  if (!selectedSeasonId) return;
  
  let mounted = true;
  
  (async () => {
    try {
      console.log(`=== LOADING DATA FOR SEASON ${selectedSeasonId} ===`);
      setLoading(true);
      setError('');
      
      // Clear data
      setPlayers([]);
      setVolunteers([]);
      setWorkbondSummary([]);
      
      // 1. Fetch players
      console.log('Fetching players...');
      const playersRes = await axios.get('/api/players', {
        params: { season_id: selectedSeasonId }
      });
      
      if (!mounted) return;
      
      const allPlayers = Array.isArray(playersRes.data) ? playersRes.data : [];
      const activePlayers = allPlayers.filter(p => 
        String(p.status || '').toLowerCase() !== 'withdrawn'
      );
      
      console.log(`Found ${activePlayers.length} active players`);
      
      if (activePlayers.length === 0) {
        setLoading(false);
        return;
      }
      
      // 2. Get family IDs
      const activeFamilyIds = [...new Set(activePlayers.map(p => p.family_id).filter(Boolean))];
      console.log(`Found ${activeFamilyIds.length} unique family IDs`);
      
      // 3. Fetch all other data in parallel
      console.log('Fetching parallel data...');
      const [volunteersRes, workbondRes, workbondBatchRes] = await Promise.allSettled([
        axios.get('/api/volunteers', { params: { season_id: selectedSeasonId } }),
        axios.get('/api/workbond/summary', { params: { season_id: selectedSeasonId } }),
        axios.post('/api/family-season-workbond/batch', {
          season_id: selectedSeasonId,
          family_ids: activeFamilyIds
        })
      ]);
      
      if (!mounted) return;
      
      // 4. Process workbond data
      const familyWorkbondMap = new Map();
      
      if (workbondBatchRes.status === 'fulfilled' && 
          workbondBatchRes.value.data && 
          Array.isArray(workbondBatchRes.value.data)) {
        
        console.log(`Got ${workbondBatchRes.value.data.length} season workbond records`);
        
        workbondBatchRes.value.data.forEach(record => {
          if (record.family_id) {
            familyWorkbondMap.set(record.family_id, {
              received: record.received || false,
              notes: record.notes || '',
              isExempt: record.notes?.toLowerCase().includes('exempt') || false
            });
          }
        });
      }
      
      // 5. Enhance players
      const enhancedPlayers = activePlayers.map(player => {
        const familyId = player.family_id;
        const seasonWorkbond = familyWorkbondMap.get(familyId);
        
        const enhancedFamily = player.family ? { ...player.family } : {};
        
        if (seasonWorkbond) {
          enhancedFamily.work_bond_check_received = seasonWorkbond.received;
          enhancedFamily.work_bond_check_status = seasonWorkbond.notes;
          enhancedFamily.is_exempt = seasonWorkbond.isExempt;
        } else {
          // No season-specific record
          enhancedFamily.work_bond_check_received = false;
          enhancedFamily.work_bond_check_status = '';
          enhancedFamily.is_exempt = false;
        }
        
        return {
          ...player,
          family: enhancedFamily
        };
      });
      
      // 6. Set state
      if (mounted) {
        setPlayers(enhancedPlayers);
        setVolunteers(
          volunteersRes.status === 'fulfilled' && Array.isArray(volunteersRes.value.data) 
            ? volunteersRes.value.data 
            : []
        );
        setWorkbondSummary(
          workbondRes.status === 'fulfilled' && Array.isArray(workbondRes.value.data)
            ? workbondRes.value.data
            : []
        );
        
        console.log(`=== DATA LOADED FOR SEASON ${selectedSeasonId} ===`);
        console.log(`Players: ${enhancedPlayers.length}`);
        console.log(`Volunteers: ${volunteersRes.status === 'fulfilled' ? volunteersRes.value.data?.length || 0 : 0}`);
        console.log(`Workbond Summary: ${workbondRes.status === 'fulfilled' ? workbondRes.value.data?.length || 0 : 0}`);
      }
      
    } catch (error) {
      console.error('Error loading mailing list data:', error);
      if (mounted) {
        setError(`Failed to load data: ${error.message}`);
      }
    } finally {
      if (mounted) {
        setLoading(false);
      }
    }
  })();
  
  return () => {
    mounted = false;
  };
}, [selectedSeasonId]);

const debugData = () => {
  console.log('=== DEBUG DATA ===');
  console.log('Selected Season ID:', selectedSeasonId);
  console.log('Total Players:', players.length);
  
  // Sample first 5 players with workbond info
  players.slice(0, 5).forEach((p, i) => {
    console.log(`Player ${i+1}:`, {
      name: `${p.first_name} ${p.last_name}`,
      season_id: p.season_id,
      family_id: p.family_id,
      workbond_received: p.family?.work_bond_check_received,
      workbond_status: p.family?.work_bond_check_status,
      is_exempt: p.family?.is_exempt
    });
  });
  
  // Check workbond sources
  const withSeasonWorkbond = players.filter(p => 
    p.family?.work_bond_check_status && 
    !p.family?.work_bond_check_status.includes('Legacy')
  ).length;
  
  console.log(`Players with season-specific workbond: ${withSeasonWorkbond}/${players.length}`);
};

  // -------------------- DERIVED: FAMILY IDS PARTICIPATING IN FILTER --------------------
  const filteredFamilyIds = useMemo(() => {
    const ids = new Set();
    for (const p of players) {
      if (p?.family_id) ids.add(String(p.family_id));
      if (p?.family?.id) ids.add(String(p.family.id));
      if (p?.family?.family_id) ids.add(String(p.family.family_id));
    }
    return ids;
  }, [players]);

  // -------------------- DERIVED: division(s) per family (from players) --------------------
  // NOTE: Depending on your schema/history, "family_id" can sometimes be stored as:
  //  - families.id (uuid) OR
  //  - families.family_id (human-readable id)
  // To stay robust, we index divisions by multiple possible keys.
  const familyDivisionsById = useMemo(() => {
    const map = new Map();

    const add = (key, divName) => {
      const k = String(key || '').trim();
      if (!k || !divName) return;
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(divName);
    };

    for (const p of players) {
      // Skip withdrawn players (already filtered, but double-check)
      if (String(p.status || '').toLowerCase() === 'withdrawn') continue;
      
      // Display division uses program_title first (your schema)
      const divName =
        (p?.program_title || '').trim() ||
        divisionNameById.get(String(p?.division_id || '')) ||
        '';

      if (!divName) continue;

      // Add under multiple possible family identifiers
      add(p?.family_id, divName);
      add(p?.family?.id, divName);
      add(p?.family?.family_id, divName);
    }
    return map;
  }, [players, divisionNameById]);

  const getFamilyDivisionText = (familyId) => {
    const key = String(familyId || '').trim();
    if (!key) return '';
    const set = familyDivisionsById.get(key);
    if (!set) return '';
    return Array.from(set).join('; ');
  };

  // -------------------- NEW: division filter should match program_title --------------------
  const norm = (v) => String(v || '').trim().toLowerCase();

  const selectedDivisionName = useMemo(() => {
    if (selectedDivisionId === 'all') return '';
    return norm(divisionNameById.get(String(selectedDivisionId)) || '');
  }, [selectedDivisionId, divisionNameById]);

  // familyId -> Set(normalized program_title)
  const familyProgramTitlesById = useMemo(() => {
    const map = new Map();

    const add = (key, title) => {
      const k = String(key || '').trim();
      const t = norm(title);
      if (!k || !t) return;
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(t);
    };

    for (const p of players) {
      // Skip withdrawn players
      if (String(p.status || '').toLowerCase() === 'withdrawn') continue;
      
      const title = p?.program_title; // source of truth for division text
      if (!title) continue;
      add(p?.family_id, title);
      add(p?.family?.id, title);
      add(p?.family?.family_id, title);
    }

    return map;
  }, [players]);

  const familyMatchesSelectedDivision = (familyId) => {
    if (selectedDivisionId === 'all') return true;
    const key = String(familyId || '').trim();
    if (!key) return false;
    const set = familyProgramTitlesById.get(key);
    if (!set) return false;
    if (!selectedDivisionName) return false;

    // Exact match on normalized strings
    if (set.has(selectedDivisionName)) return true;

    // Fallback: if program_title contains the division name or vice versa (handles minor naming variations)
    for (const t of set) {
      if (t.includes(selectedDivisionName) || selectedDivisionName.includes(t)) return true;
    }
    return false;
  };

  // -------------------- DERIVED: guardian names per family (from players -> family) --------------------
  const familyGuardiansById = useMemo(() => {
    const map = new Map();
    for (const p of players) {
      // Skip withdrawn players
      if (String(p.status || '').toLowerCase() === 'withdrawn') continue;
      
      const fam = p?.family;
      const fid = String(fam?.id || p?.family_id || '');
      if (!fid) continue;

      const primary = (fam?.primary_contact_name || '').trim();
      const parent2 = `${fam?.parent2_first_name || ''} ${fam?.parent2_last_name || ''}`.trim();

      if (!map.has(fid)) {
        map.set(fid, {
          primary,
          parent2: parent2 || '',
        });
      }
    }
    return map;
  }, [players]);

  const getFamilyGuardianText = (familyId) => {
    const g = familyGuardiansById.get(String(familyId));
    if (!g) return '';
    const names = [g.primary, g.parent2].filter(Boolean);
    return names.join(' & ');
  };

  // -------------------- DERIVED: volunteer roles per family --------------------
  const volunteerRolesByFamily = useMemo(() => {
    const map = new Map();
    for (const v of volunteers) {
      // Skip volunteers associated with families that only have withdrawn players
      // We'll check this by seeing if the family is in filteredFamilyIds
      const familyId = String(v.family_id || '');
      if (!filteredFamilyIds.has(familyId)) continue;
      
      if (!map.has(familyId)) map.set(familyId, []);
      map.get(familyId).push(v);
    }
    return map;
  }, [volunteers, filteredFamilyIds]);

// -------------------- TAB 1: GUARDIANS --------------------
const guardianRows = useMemo(() => {
  const rows = [];
  const seen = new Set();

  for (const p of players) {
    // DOUBLE CHECK: Ensure player belongs to selected season
    if (String(p.season_id) !== String(selectedSeasonId)) {
      console.warn(`Player ${p.id} has season_id ${p.season_id}, expected ${selectedSeasonId}`);
      continue;
    }
    
    if (String(p.status || '').toLowerCase() === 'withdrawn') continue;
    
    const fam = p.family;
    if (!fam?.id) continue;
    
    const famId = String(fam.id); // ADD THIS LINE - was missing!
    
    // Division filter
    if (selectedDivisionId !== 'all' && !familyMatchesSelectedDivision(famId)) continue;

    const famVols = volunteerRolesByFamily.get(famId) || [];
    const assignedRoles = Array.from(
      new Set(
        famVols
          .map((v) => v?.role)
          .filter((r) => ['Manager', 'Assistant Coach', 'Team Parent'].includes(r))
      )
    );

    if (
      selectedVolunteerRole !== 'All Roles' &&
      !assignedRoles.includes(selectedVolunteerRole)
    ) {
      continue;
    }

    // UPDATED: Get workbond status from enhanced family object
    const checkReceived = !!fam.work_bond_check_received;
    const isExempt = fam.is_exempt || fam.work_bond_check_status?.includes('Exempt');
    
    // Apply workbond filter
    if (selectedWorkbondCheck === 'Received' && !checkReceived && !isExempt) continue;
    if (selectedWorkbondCheck === 'Not Received' && (checkReceived || isExempt)) continue;

    const guardians = [
      {
        label: 'Primary',
        name: fam.primary_contact_name,
        email: fam.primary_contact_email,
		phone: fam.primary_contact_phone,
      },
      {
        label: 'Parent 2',
        name: `${fam.parent2_first_name || ''} ${fam.parent2_last_name || ''}`.trim() || null,
        email: fam.parent2_email,
		phone: fam.parent2_phone,
      },
    ].filter((g) => g.email);

    for (const g of guardians) {
      const key = `${famId}:${String(g.email).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        family_id: fam.family_id,
        family_uuid: famId,
        guardian_type: g.label,
        guardian_name: g.name || '',
        guardian_email: g.email,
		guardian_phone: g.phone,
        division: getFamilyDivisionText(famId) || getFamilyDivisionText(fam?.family_id) || '',
        work_bond_check_received: checkReceived,
        work_bond_check_status: fam.work_bond_check_status || '',
        is_exempt: isExempt,
        assigned_roles: assignedRoles,
      });
    }
  }

  // stable sort by guardian last name, then first name, then email
  rows.sort((a, b) => {
    const al = getLastName(a.guardian_name);
    const bl = getLastName(b.guardian_name);
    if (al < bl) return -1;
    if (al > bl) return 1;

    const an = String(a.guardian_name || '').toLowerCase();
    const bn = String(b.guardian_name || '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;

    return String(a.guardian_email || '')
      .toLowerCase()
      .localeCompare(String(b.guardian_email || '').toLowerCase());
  });

  return rows;
}, [
  players, 
  selectedSeasonId, 
  selectedDivisionId,
  volunteerRolesByFamily,
  selectedVolunteerRole,
  selectedWorkbondCheck,
  familyMatchesSelectedDivision,
  getFamilyDivisionText
]);


  // -------------------- TAB 2: ASSIGNED VOLUNTEERS --------------------
  const assignedVolunteerRows = useMemo(() => {
    const rows = (volunteers || [])
      .filter((v) => {
        if (!v?.family_id) return false;
        
        // Skip volunteers from families with only withdrawn players
        const familyId = String(v.family_id);
        if (!filteredFamilyIds.has(familyId)) return false;
        
        if (!['Manager', 'Assistant Coach', 'Team Parent'].includes(v.role)) return false;
        if (selectedVolunteerRole !== 'All Roles' && v.role !== selectedVolunteerRole) return false;
        // If division filter is set, match volunteer.division_id OR team.division? (not always present)
        if (selectedDivisionId !== 'all') {
          return String(v.division_id || '') === String(selectedDivisionId);
        }
        return true;
      })
      .map((v) => ({
        name: v.name,
        email: v.email,
		phone: v.phone,
        role: v.role,
        team: v.team?.name || '',
        division: v.division?.name || '',
        family_id: v.family_id,
      }));

    rows.sort((a, b) => {
      const al = getLastName(a.name);
      const bl = getLastName(b.name);
      if (al < bl) return -1;
      if (al > bl) return 1;
      const an = String(a.name || '').toLowerCase();
      const bn = String(b.name || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return String(a.role || '').localeCompare(String(b.role || ''));
    });
    return rows;
  }, [volunteers, filteredFamilyIds, selectedVolunteerRole, selectedDivisionId]);

  // -------------------- TAB 3: WORKBOND INCOMPLETE --------------------
  const workbondIncompleteRows = useMemo(() => {
    const rows = (workbondSummary || [])
      .filter((f) => {
        if (!f?.family_id) return false;

        // ✅ Division filter by program_title (matches what we display)
        if (selectedDivisionId !== 'all' && !familyMatchesSelectedDivision(f.family_id)) return false;

        const status = String(f.status || '').toLowerCase();
        return status === 'incomplete';
      })
      .map((f) => ({
        family_id: f.family_id,
        guardians: getFamilyGuardianText(f.family_id),
        division: getFamilyDivisionText(f.family_id),
        primary_email: f.email || '',
        parent2_email: f.parent2_email || '',
        required: f.required_shifts ?? '',
        completed: f.completed_shifts ?? '',
        status: (f.status || 'incomplete').toUpperCase(),
      }));

    rows.sort((a, b) => {
      const al = getLastName(a.guardians);
      const bl = getLastName(b.guardians);
      if (al < bl) return -1;
      if (al > bl) return 1;
      return String(a.guardians || '').toLowerCase().localeCompare(String(b.guardians || '').toLowerCase());
    });
    return rows;
  }, [workbondSummary, selectedDivisionId, filteredFamilyIds, familyGuardiansById, familyDivisionsById, familyProgramTitlesById, selectedDivisionName]);

  // -------------------- Email actions --------------------
  const currentEmails = useMemo(() => {
    let emails = [];
    if (activeTab === Tabs.GUARDIANS) emails = guardianRows.map((r) => r.guardian_email);
    if (activeTab === Tabs.ASSIGNED_VOLUNTEERS) emails = assignedVolunteerRows.map((r) => r.email).filter(Boolean);
    if (activeTab === Tabs.WORKBOND_INCOMPLETE) {
      emails = workbondIncompleteRows
        .flatMap((r) => [r.primary_email, r.parent2_email])
        .filter(Boolean);
    }
    // unique, keep stable order
    const seen = new Set();
    return emails.filter((e) => {
      const k = String(e).trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [activeTab, guardianRows, assignedVolunteerRows, workbondIncompleteRows]);

  const handleCopyEmails = async () => {
    try {
      await navigator.clipboard.writeText(currentEmails.join(', '));
      alert(`Copied ${currentEmails.length} emails to clipboard.`);
    } catch (e) {
      console.error('Copy failed:', e);
      alert('Copy failed. Your browser may block clipboard access.');
    }
  };

const handleExportCsv = () => {
  if (activeTab === Tabs.GUARDIANS) {
    downloadCsv('guardians.csv', [
      [
        //'Family ID', 
        'Guardian Type', 
        'Guardian Name', 
        'Guardian Email', 
		'Guardian Phone',
        'Division', 
        'Workbond Status', 
        'Workbond Details', 
        'Is Exempt', 
        'Assigned Volunteer Roles',
        //'Family UUID',
        'Player Count'
      ],
      ...guardianRows.map((r) => [
        //r.family_id || '',
        r.guardian_type || '',
        r.guardian_name || '',
        r.guardian_email || '',
		r.guardian_phone || '',
        r.division || '',
        // Workbond status - combine received and exempt
        r.is_exempt 
          ? 'Exempt' 
          : (r.work_bond_check_received ? 'Received' : 'Not Received'),
        r.work_bond_check_status || '',
        r.is_exempt ? 'Yes' : 'No',
        (r.assigned_roles || []).join(' | '),
        //r.family_uuid || '',
        // Count players in this family (optional)
        players.filter(p => p.family_id === r.family_uuid).length
      ]),
    ]);
    return;
  }
  
  if (activeTab === Tabs.ASSIGNED_VOLUNTEERS) {
    downloadCsv('assigned_volunteers.csv', [
      [
        'Role', 
        'Name', 
        'Email',
        'Phone',		
        'Team', 
        'Division',
        //'Family ID',
        //'Is Approved',
        
        //'Created Date'
      ],
      ...assignedVolunteerRows.map((r) => [
        r.role || '',
        r.name || '',
        r.email || '—',
		r.phone || '—',
        r.team || '—',
        r.division || '—',
        //r.family_id || '',
        // These would need to be added to the row data if available
        '', // is_approved placeholder
        '', // phone placeholder
        ''  // created_date placeholder
      ]),
    ]);
    return;
  }
  
  if (activeTab === Tabs.WORKBOND_INCOMPLETE) {
    downloadCsv('workbond_incomplete.csv', [
      [
        'Family ID',
        'Guardians', 
        'Division', 
        'Primary Email', 
        'Parent 2 Email', 
        'Required Shifts', 
        'Completed Shifts', 
        'Remaining Shifts',
        'Status',
        'Is Exempt',
        'Exempt Reason'
      ],
      ...workbondIncompleteRows.map((r) => [
        r.family_id || '',
        r.guardians || '—',
        r.division || '—',
        r.primary_email || '—',
        r.parent2_email || '—',
        r.required || '0',
        r.completed || '0',
        Math.max(0, (parseInt(r.required) || 0) - (parseInt(r.completed) || 0)),
        r.status || 'INCOMPLETE',
        // These would need to be added to workbondIncompleteRows
        '', // is_exempt placeholder
        ''  // exempt_reason placeholder
      ]),
    ]);
  }
};

  // -------------------- UI --------------------
  const seasonOptions = seasons || [];
  const divisionOptions = divisions || [];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mailing Lists</h1>
          <p className="text-gray-600 mt-1">
            Filter by season/division and copy or export emails for communications.
            <span className="text-sm text-gray-500 ml-2">
              Note: Withdrawn players and their families are excluded.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyEmails}
            className="inline-flex items-center px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            disabled={currentEmails.length === 0}
            title="Copy all emails from the current tab"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Emails
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center px-3 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
            disabled={currentEmails.length === 0}
            title="Export current tab to CSV"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
		  
<button
  onClick={() => {
    console.log('=== DEBUG STATE ===');
    console.log('Selected Season:', selectedSeasonId);
    console.log('Players count:', players.length);
    console.log('Players data:', players);
    console.log('Volunteers count:', volunteers.length);
    console.log('Workbond Summary count:', workbondSummary.length);
    
    // Test the API endpoints
    console.log('Testing API endpoints...');
    
    // Test players endpoint
    axios.get('/api/players', { params: { season_id: selectedSeasonId } })
      .then(res => console.log('Players API response:', res.data?.length || 0, 'players'))
      .catch(err => console.error('Players API error:', err));
    
    // Test workbond batch endpoint
    axios.post('/api/family-season-workbond/batch', {
      season_id: selectedSeasonId,
      family_ids: players.map(p => p.family_id).filter(Boolean).slice(0, 10)
    })
      .then(res => console.log('Workbond batch response:', res.data))
      .catch(err => console.error('Workbond batch error:', err));
  }}
  className="inline-flex items-center px-3 py-2 rounded-lg bg-yellow-100 border border-yellow-300 text-sm text-yellow-800 hover:bg-yellow-200"
>
  Debug API
</button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
          <Filter className="h-4 w-4" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Season</label>
            <select
  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
  value={selectedSeasonId || ''}
  onChange={(e) => handleSeasonChange(e.target.value)}
>
  {seasonOptions.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name} {s.is_active ? '(Active)' : ''}
    </option>
  ))}
</select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Division</label>
            <select
  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
  value={selectedDivisionId}
  onChange={(e) => {
    setSelectedDivisionId(e.target.value);
    // Reset page state if needed
  }}
  disabled={!selectedSeasonId || loading}
>
  <option value="all">All Divisions</option>
  {divisionOptions.map((d) => (
    <option key={d.id} value={d.id}>
      {d.name}
    </option>
  ))}
</select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Volunteer Role</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={selectedVolunteerRole}
              onChange={(e) => setSelectedVolunteerRole(e.target.value)}
            >
              {VOLUNTEER_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Applies to Guardians + Assigned Volunteers tabs
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Workbond Check</label>
            <select
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
              value={selectedWorkbondCheck}
              onChange={(e) => setSelectedWorkbondCheck(e.target.value)}
              disabled={activeTab !== Tabs.GUARDIANS}
            >
              {WORKBOND_CHECK_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Applies to Guardians tab
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Emails in this view</label>
            <div className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50">
              {currentEmails.length}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6">
        <div className="flex gap-2 flex-wrap">
          {Object.values(Tabs).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === t
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-4 bg-white border border-gray-200 rounded-lg overflow-hidden">
          {error && (
            <div className="p-4 text-sm text-red-700 bg-red-50 border-b border-red-100">
              {error}
            </div>
          )}
          {loading ? (
            <div className="p-6 text-sm text-gray-600">Loading…</div>
          ) : (
            <>
              {activeTab === Tabs.GUARDIANS && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Guardian</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Workbond Check</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Volunteer Roles</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Division</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {guardianRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-gray-500" colSpan={5}>
                            No guardians found for this season/division.
                          </td>
                        </tr>
                      ) : (
                        guardianRows.map((r) => (
                          <tr key={`${r.family_uuid}-${r.guardian_email}`}
                              className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{r.guardian_name || '(No name)'}</div>
                              <div className="text-xs text-gray-500">{r.guardian_type}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-900">{r.guardian_email}</td>
                            <td className="px-4 py-3">
  <div className="space-y-1">
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        r.is_exempt
          ? 'bg-purple-100 text-purple-800'
          : r.work_bond_check_received
          ? 'bg-green-100 text-green-800'
          : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      {r.is_exempt ? 'Exempt' : r.work_bond_check_received ? 'Received' : 'Not Received'}
    </span>
    {r.work_bond_check_status && !r.is_exempt && (
      <div className="text-xs text-gray-500 truncate max-w-xs">
        {r.work_bond_check_status}
      </div>
    )}
  </div>
</td>
                            <td className="px-4 py-3 text-gray-700">
                              {(r.assigned_roles || []).length ? (r.assigned_roles || []).join(', ') : '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{r.division || "—"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === Tabs.ASSIGNED_VOLUNTEERS && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Role</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Team</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Division</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {assignedVolunteerRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-gray-500" colSpan={5}>
                            No assigned volunteers found for this season/division.
                          </td>
                        </tr>
                      ) : (
                        assignedVolunteerRows.map((r, idx) => (
                          <tr key={`${r.role}-${r.email}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{r.role}</td>
                            <td className="px-4 py-3 text-gray-900">{r.name}</td>
                            <td className="px-4 py-3 text-gray-900">{r.email || '—'}</td>
                            <td className="px-4 py-3 text-gray-700">{r.team || '—'}</td>
                            <td className="px-4 py-3 text-gray-700">{r.division || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === Tabs.WORKBOND_INCOMPLETE && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Guardians</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Division</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Primary Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Parent 2 Email</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Required</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Completed</th>
                        <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workbondIncompleteRows.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-gray-500" colSpan={6}>
                            No incomplete workbond families found.
                          </td>
                        </tr>
                      ) : (
                        workbondIncompleteRows.map((r, idx) => (
                          <tr key={`${r.family_id}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{r.guardians || '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{r.division || '—'}</td>
                            <td className="px-4 py-3 text-gray-900">{r.primary_email || '—'}</td>
                            <td className="px-4 py-3 text-gray-900">{r.parent2_email || '—'}</td>
                            <td className="px-4 py-3 text-gray-700">{r.required}</td>
                            <td className="px-4 py-3 text-gray-700">{r.completed}</td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
