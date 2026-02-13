import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, RefreshCw, Users } from 'lucide-react';
import { playersAPI, seasonsAPI, divisionsAPI, requestsAPI } from '../services/api';
import Modal from '../components/Modal'; // ADD THIS IMPORT

const DIVISION_ORDER = [
  'T-Ball Division',
  'Baseball - Coach Pitch Division',
  'Baseball - Rookies Division',
  'Baseball - Minors Division',
  'Baseball - Majors Division',
  'Softball - Rookies Division (Coach Pitch)',
  'Softball - Minors Division',
  'Softball - Majors Division',
  'Softball - Junior Division',
  'Challenger Division',
];

function calcAge(birthDateStr) {
  if (!birthDateStr) return '';
  const dob = new Date(birthDateStr);
  if (Number.isNaN(dob.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

const Requests = () => {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState(null);

  const [players, setPlayers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [requests, setRequests] = useState([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    player_id: '',
    parent_request: '',
    status: '', // Approved | Denied | Pending(blank)
    type: '',
    program: '',
    comments: '',
    current_division_id: '',
    new_division_id: '',
    requested_teammate_name: '',
  });

  const [showTeammateModal, setShowTeammateModal] = useState(false);
  const [teammateRequests, setTeammateRequests] = useState([]);

  // Derived: player info for display
  const selectedPlayer = useMemo(() => {
    const id = form.player_id;
    return players.find((p) => p.id === id) || null;
  }, [players, form.player_id]);

  const birthday = selectedPlayer?.birth_date || '';
  const age = birthday ? calcAge(birthday) : '';
  const currentDivisionName = selectedPlayer?.division?.name || '';
  const currentDivisionId = selectedPlayer?.division_id || '';

  // Keep form current_division_id in sync with selected player
  useEffect(() => {
    if (currentDivisionId && form.player_id) {
      setForm((prev) => ({ ...prev, current_division_id: currentDivisionId }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDivisionId, form.player_id]);

  useEffect(() => {
    loadSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason !== null) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason]);

  const loadSeasons = async () => {
    try {
      const [activeRes, allRes] = await Promise.all([
        seasonsAPI.getActive().catch(() => ({ data: null })),
        seasonsAPI.getAll().catch(() => ({ data: [] })),
      ]);

      const active = activeRes?.data || null;
      const all = Array.isArray(allRes?.data) ? allRes.data : [];
      setSeasons(all);

      if (selectedSeason === null) {
        setSelectedSeason(active?.id || '');
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load seasons');
      setSeasons([]);
      setSelectedSeason('');
    }
  };

  const loadData = async () => {
  try {
    setLoading(true);

    // Players + divisions depend on season
    const seasonFilter = selectedSeason ? { season_id: selectedSeason } : {};
    const [playersRes, divisionsRes, requestsRes] = await Promise.all([
      playersAPI.getAll(seasonFilter).catch(() => ({ data: [] })),
      divisionsAPI.getAll(seasonFilter).catch(() => ({ data: [] })),
      requestsAPI.getAll(seasonFilter).catch(() => ({ data: [] })),
    ]);

    const p = Array.isArray(playersRes?.data) ? playersRes.data : [];
    const d = Array.isArray(divisionsRes?.data) ? divisionsRes.data : [];
    const r = Array.isArray(requestsRes?.data) ? requestsRes.data : [];

    // Fetch parent/guardian data for each player
    const playersWithParents = await Promise.all(
      p.map(async (player) => {
        try {
          // Fetch guardians for this player
          const guardiansRes = await playersAPI.getGuardians(player.id);
          return {
            ...player,
            parents: Array.isArray(guardiansRes?.data) ? guardiansRes.data : []
          };
        } catch (error) {
          console.error(`Error fetching guardians for player ${player.id}:`, error);
          return {
            ...player,
            parents: []
          };
        }
      })
    );

    // Active players only (exclude withdrawn)
    const activePlayers = playersWithParents.filter((pl) => String(pl?.status || '').toLowerCase() !== 'withdrawn');

    setPlayers(activePlayers);
    setDivisions(d);
    setRequests(r);
  } catch (e) {
    console.error(e);
    toast.error('Failed to load requests data');
    setPlayers([]);
    setDivisions([]);
    setRequests([]);
  } finally {
    setLoading(false);
  }
};

  const loadTeammateRequests = async () => {
    try {
      const res = await requestsAPI.getAll({ season_id: selectedSeason });
      const filtered = (res.data || []).filter(r => 
        r.type === 'Teammate Request'
      );
      setTeammateRequests(filtered);
      setShowTeammateModal(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load teammate requests');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({
      player_id: '',
      parent_request: '',
      status: '',
      type: '',
      program: '',
      comments: '',
      current_division_id: '',
      new_division_id: '',
      requested_teammate_name: '',
    });
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      player_id: row.player_id || row.player?.id || '',
      parent_request: row.parent_request || '',
      status: row.status && row.status !== 'Pending' ? row.status : '',
      type: row.type || '',
      program: row.program || '',
      comments: row.comments || '',
      current_division_id: row.current_division_id || row.current_division?.id || '',
      new_division_id: row.new_division_id || row.new_division?.id || '',
      requested_teammate_name: row.requested_teammate_name || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!selectedSeason) {
      toast.error('Please select a season');
      return;
    }
    if (!form.player_id) {
      toast.error('Please select a player');
      return;
    }

    const payload = {
      season_id: selectedSeason,
      player_id: form.player_id,
      parent_request: form.parent_request || null,
      status: form.status || 'Pending',
      type: form.type || null,
      program: form.program || null,
      comments: form.comments || null,
      current_division_id: form.current_division_id || currentDivisionId || null,
      new_division_id: form.new_division_id || null,
      requested_teammate_name: form.type === 'Teammate Request' ? form.requested_teammate_name || null : null,
    };

    try {
      setSaving(true);
      if (editingId) {
        await requestsAPI.update(editingId, payload);
        toast.success('Request updated');
      } else {
        await requestsAPI.create(payload);
        toast.success('Request added');
      }
      resetForm();
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to save request');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row) => {
    if (!row?.id) return;
    const ok = window.confirm('Delete this request?');
    if (!ok) return;

    try {
      await requestsAPI.delete(row.id);
      toast.success('Request deleted');
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to delete request');
    }
  };

  // Build a stable division list for dropdowns + totals table
  const divisionsById = useMemo(() => {
    const map = new Map();
    for (const d of divisions || []) map.set(d.id, d);
    return map;
  }, [divisions]);

  const orderedDivisionRows = useMemo(() => {
    // Prefer the custom league order, but include any "extra" divisions at the end.
    const byName = new Map((divisions || []).map((d) => [d.name, d]));
    const ordered = [];
    for (const name of DIVISION_ORDER) {
      if (byName.has(name)) ordered.push(byName.get(name));
    }
    for (const d of divisions || []) {
      if (!DIVISION_ORDER.includes(d.name)) ordered.push(d);
    }
    return ordered;
  }, [divisions]);

  const totals = useMemo(() => {
    // Current totals from players
    const currentCounts = {};
    for (const p of players || []) {
      const divId = p?.division_id;
      if (!divId) continue;
      currentCounts[divId] = (currentCounts[divId] || 0) + 1;
    }

    // Requests (all) and approvals (approved only)
    const req = Array.isArray(requests) ? requests : [];
    const isApproved = (r) => String(r?.status || '').toLowerCase() === 'approved';

    // outgoing counts per current_division_id
    const moveUpReqOut = {};
    const moveDownReqOut = {};
    const moveUpApprovedOut = {};
    const moveDownApprovedOut = {};

    // incoming counts per new_division_id
    const moveUpReqIn = {};
    const moveDownReqIn = {};
    const moveUpApprovedIn = {};
    const moveDownApprovedIn = {};

    for (const r of req) {
      const type = String(r?.type || '').toLowerCase();
      const cur = r?.current_division_id || r?.current_division?.id || null;
      const nxt = r?.new_division_id || r?.new_division?.id || null;
      const approved = isApproved(r);

      const isMoveUp = type === 'move up';
      const isMoveDown = type === 'move down';

      if (isMoveUp && cur) {
        moveUpReqOut[cur] = (moveUpReqOut[cur] || 0) + 1;
        if (approved) moveUpApprovedOut[cur] = (moveUpApprovedOut[cur] || 0) + 1;
      }
      if (isMoveDown && cur) {
        moveDownReqOut[cur] = (moveDownReqOut[cur] || 0) + 1;
        if (approved) moveDownApprovedOut[cur] = (moveDownApprovedOut[cur] || 0) + 1;
      }
      if (isMoveUp && nxt) {
        moveUpReqIn[nxt] = (moveUpReqIn[nxt] || 0) + 1;
        if (approved) moveUpApprovedIn[nxt] = (moveUpApprovedIn[nxt] || 0) + 1;
      }
      if (isMoveDown && nxt) {
        moveDownReqIn[nxt] = (moveDownReqIn[nxt] || 0) + 1;
        if (approved) moveDownApprovedIn[nxt] = (moveDownApprovedIn[nxt] || 0) + 1;
      }
    }

    const rows = orderedDivisionRows.map((d) => {
      const id = d.id;
      const current = currentCounts[id] || 0;

      const muReqOut = moveUpReqOut[id] || 0;
      const mdReqOut = moveDownReqOut[id] || 0;

      const muReqIn = moveUpReqIn[id] || 0;
      const mdReqIn = moveDownReqIn[id] || 0;

      const muApprovedOut = moveUpApprovedOut[id] || 0;
      const mdApprovedOut = moveDownApprovedOut[id] || 0;

      const muApprovedIn = moveUpApprovedIn[id] || 0;
      const mdApprovedIn = moveDownApprovedIn[id] || 0;

      // If ALL requests were approved:
      const projectedAll = current + (muReqIn + mdReqIn) - (muReqOut + mdReqOut);

      // If ONLY approved requests are applied:
      const projectedApproved = current + (muApprovedIn + mdApprovedIn) - (muApprovedOut + mdApprovedOut);

      return {
        divisionId: id,
        divisionName: d.name,
        current,
        moveUpReq: muReqOut,
        moveDownReq: mdReqOut,
        projectedAll,
        moveUpApproved: muApprovedOut,
        moveDownApproved: mdApprovedOut,
        finalTotals: projectedApproved,
      };
    });

    return rows;
  }, [players, requests, orderedDivisionRows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Requests</h1>
          <p className="text-sm text-gray-600">
            Track move-up/move-down and other player requests by season, then see projected division totals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTeammateRequests}
            className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 text-sm bg-white hover:bg-gray-50"
            disabled={!selectedSeason || loading}
          >
            <Users className="h-4 w-4 mr-2" />
            Teammate Requests
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 text-sm bg-white hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Season selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Season</label>
          <select
            className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            value={selectedSeason ?? ''}
            onChange={(e) => setSelectedSeason(e.target.value)}
          >
            <option value="">Select Season</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={onSave} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? 'Edit Request' : 'Add Request'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm px-3 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Player Name</label>
  <select
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
    value={form.player_id}
    onChange={(e) => setForm((p) => ({ ...p, player_id: e.target.value }))}
  >
    <option value="">Select a player…</option>
    {players
      .slice()
      .sort((a, b) => {
        const an = `${a.last_name || ''}, ${a.first_name || ''}`.toLowerCase();
        const bn = `${b.last_name || ''}, ${b.first_name || ''}`.toLowerCase();
        return an.localeCompare(bn);
      })
      .map((p) => {
        // Format parent info for display in the dropdown using family object
        const parentInfo = [];
        
        // Add primary guardian if exists
        if (p.family?.primary_contact_name) {
          const primaryPhone = p.family.primary_contact_phone ? ` (${p.family.primary_contact_phone})` : '';
          const primaryEmail = p.family.primary_contact_email ? ` - ${p.family.primary_contact_email}` : '';
          parentInfo.push(`${p.family.primary_contact_name}${primaryPhone}${primaryEmail}`);
        }
        
        // Add secondary guardian if exists
        if (p.family?.parent2_first_name) {
          const secondaryName = `${p.family.parent2_first_name} ${p.family.parent2_last_name || ''}`.trim();
          const secondaryPhone = p.family.parent2_phone ? ` (${p.family.parent2_phone})` : '';
          const secondaryEmail = p.family.parent2_email ? ` - ${p.family.parent2_email}` : '';
          parentInfo.push(`${secondaryName}${secondaryPhone}${secondaryEmail}`);
        }
        
        const parentDisplay = parentInfo.length > 0 ? ` - Parents: ${parentInfo.join('; ')}` : '';
        
        return (
          <option key={p.id} value={p.id}>
            {(p.last_name || '') + ', ' + (p.first_name || '')}{parentDisplay}
          </option>
        );
      })}
  </select>
  
  {/* Display detailed parent info when a player is selected - using family object like in Players.jsx */}
  {selectedPlayer && selectedPlayer.family && (
    <div className="mt-3 p-3 bg-blue-50 rounded-md border border-blue-200">
      <div className="text-sm font-medium text-blue-800 mb-2">Parent/Guardian Information:</div>
      
      {/* Primary Guardian */}
      {selectedPlayer.family.primary_contact_name && (
        <div className="text-sm text-blue-700 mb-3 pb-2 border-b border-blue-100">
          <div className="font-medium">{selectedPlayer.family.primary_contact_name}</div>
          <div className="flex flex-col gap-1 mt-1">
            {selectedPlayer.family.primary_contact_email && (
              <div className="flex items-center gap-2">
                <span className="text-blue-600">✉️</span>
                <span>{selectedPlayer.family.primary_contact_email}</span>
              </div>
            )}
            {selectedPlayer.family.primary_contact_phone && (
              <div className="flex items-center gap-2">
                <span className="text-blue-600">📞</span>
                <span>{selectedPlayer.family.primary_contact_phone}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Secondary Guardian */}
      {selectedPlayer.family.parent2_first_name && (
        <div className="text-sm text-blue-700">
          <div className="font-medium">
            {selectedPlayer.family.parent2_first_name} {selectedPlayer.family.parent2_last_name || ''}
          </div>
          <div className="flex flex-col gap-1 mt-1">
            {selectedPlayer.family.parent2_email && (
              <div className="flex items-center gap-2">
                <span className="text-blue-600">✉️</span>
                <span>{selectedPlayer.family.parent2_email}</span>
              </div>
            )}
            {selectedPlayer.family.parent2_phone && (
              <div className="flex items-center gap-2">
                <span className="text-blue-600">📞</span>
                <span>{selectedPlayer.family.parent2_phone}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* If no guardian info at all */}
      {!selectedPlayer.family?.primary_contact_name && !selectedPlayer.family?.parent2_first_name && (
        <div className="text-sm text-gray-500 italic">
          No parent/guardian information available for this player.
        </div>
      )}
    </div>
  )}
  
  {/* Show message if no family object exists */}
  {selectedPlayer && !selectedPlayer.family && (
    <div className="mt-2 text-xs text-gray-500 italic">
      No parent/guardian information available for this player.
    </div>
  )}
</div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Requests</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={form.parent_request}
              onChange={(e) => setForm((p) => ({ ...p, parent_request: e.target.value }))}
              placeholder="e.g., Move up to Minors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Birthday</label>
            <input
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50"
              value={birthday ? new Date(birthday).toLocaleDateString() : ''}
              readOnly
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
            <input
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50"
              value={age}
              readOnly
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Denied">Denied</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            >
              <option value="">Select…</option>
              <option value="Move Up">Move Up</option>
              <option value="Move Down">Move Down</option>
              <option value="Teammate Request">Teammate Request</option>
              <option value="Volunteer Request">Volunteer Request</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teammate Name</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={form.requested_teammate_name || ''}
              onChange={(e) => setForm((p) => ({ ...p, requested_teammate_name: e.target.value }))}
              placeholder="Enter teammate's name"
              disabled={form.type !== 'Teammate Request'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Only enabled for "Teammate Request" type
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Programs</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              value={form.program}
              onChange={(e) => setForm((p) => ({ ...p, program: e.target.value }))}
            >
              <option value="">Select…</option>
              <option value="Baseball">Baseball</option>
              <option value="Softball">Softball</option>
              <option value="Admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
            <input
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              value={form.comments}
              onChange={(e) => setForm((p) => ({ ...p, comments: e.target.value }))}
              placeholder="Any notes…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Division</label>
            <input
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-gray-50"
              value={currentDivisionName}
              readOnly
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Division</label>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
              value={form.new_division_id}
              onChange={(e) => setForm((p) => ({ ...p, new_division_id: e.target.value }))}
            >
              <option value="">Select…</option>
              {orderedDivisionRows.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4 mr-2" />
            {editingId ? 'Save Changes' : 'Add Request'}
          </button>
          {saving && <span className="text-sm text-gray-600">Saving…</span>}
        </div>
      </form>

      {/* Requests table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Request List</h2>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-gray-700">Player</th>
                <th className="px-3 py-2 font-medium text-gray-700">Parent Requests</th>
                <th className="px-3 py-2 font-medium text-gray-700">Birthday</th>
                <th className="px-3 py-2 font-medium text-gray-700">Age</th>
                <th className="px-3 py-2 font-medium text-gray-700">Status</th>
                <th className="px-3 py-2 font-medium text-gray-700">Type</th>
                <th className="px-3 py-2 font-medium text-gray-700">Programs</th>
                <th className="px-3 py-2 font-medium text-gray-700">Comments</th>
                <th className="px-3 py-2 font-medium text-gray-700">Current Division</th>
                <th className="px-3 py-2 font-medium text-gray-700">New Division</th>
                <th className="px-3 py-2 font-medium text-gray-700">Teammate</th>
                <th className="px-3 py-2 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(requests || []).length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-gray-500">
                    {loading ? 'Loading…' : 'No requests yet.'}
                  </td>
                </tr>
              ) : (
                requests.map((r) => {
                  const player = r.requesting_player || r.player || null;
                  const name = player
                    ? `${player.last_name || ''}, ${player.first_name || ''}`.replace(/^,\s*/, '').trim()
                    : '';
                  const bday = player?.birth_date || '';
                  const ageVal = bday ? calcAge(bday) : '';
                  const curName = r.current_division?.name || divisionsById.get(r.current_division_id)?.name || '';
                  const newName = r.new_division?.name || divisionsById.get(r.new_division_id)?.name || '';
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap">{name}</td>
                      <td className="px-3 py-2">{r.parent_request || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {bday ? new Date(bday).toLocaleDateString() : ''}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{ageVal}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.status || 'Pending'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.type || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.program || ''}</td>
                      <td className="px-3 py-2">{r.comments || ''}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{curName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{newName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.requested_teammate_name || ''}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button
                          type="button"
                          className="inline-flex items-center text-blue-600 hover:text-blue-800 mr-3"
                          onClick={() => startEdit(r)}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center text-red-600 hover:text-red-800"
                          onClick={() => onDelete(r)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Division Totals (What-If)</h2>
        <p className="text-sm text-gray-600 mb-4">
          "Projected All" assumes all move-up/move-down requests are approved. "Final Totals" only applies requests where Status = Approved.
        </p>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium text-gray-700">Division</th>
                <th className="px-3 py-2 font-medium text-gray-700">Current Totals</th>
                <th className="px-3 py-2 font-medium text-gray-700">Move Up Request</th>
                <th className="px-3 py-2 font-medium text-gray-700">Move Down Request</th>
                <th className="px-3 py-2 font-medium text-gray-700">Projected All</th>
                <th className="px-3 py-2 font-medium text-gray-700">Move Up Approvals</th>
                <th className="px-3 py-2 font-medium text-gray-700">Move Down Approvals</th>
                <th className="px-3 py-2 font-medium text-gray-700">Final Totals</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((row) => (
                <tr key={row.divisionId} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{row.divisionName}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.current}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.moveUpReq}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.moveDownReq}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.projectedAll}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.moveUpApproved}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.moveDownApproved}</td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold">{row.finalTotals}</td>
                </tr>
              ))}
              {totals.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                    {loading ? 'Loading…' : 'No divisions found for this season.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Teammate Requests Modal - USING THE Modal COMPONENT */}
      <Modal
        isOpen={showTeammateModal}
        onClose={() => setShowTeammateModal(false)}
        title="Teammate Requests"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setShowTeammateModal(false)}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-gray-600 mb-4">
            Showing all teammate requests for <span className="font-semibold">
              {seasons.find(s => s.id === selectedSeason)?.name || 'selected season'}
            </span>
          </div>
          
          {teammateRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No teammate requests found for this season.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Requesting Player</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Requested Teammate</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Division</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Status</th>
                    <th className="px-3 py-2 font-medium text-gray-700 text-left">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {teammateRequests.map((req) => {
                    const requestingPlayer = req.requesting_player || {};
                    const currentDivision = req.current_division || divisionsById.get(req.current_division_id) || {};
                    
                    return (
                      <tr key={req.id} className="border-t hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {requestingPlayer.last_name || ''}, {requestingPlayer.first_name || ''}
                          </div>
                          {requestingPlayer.birth_date && (
                            <div className="text-xs text-gray-500">
                              Age: {calcAge(requestingPlayer.birth_date)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {req.requested_teammate_name || 'Not specified'}
                        </td>
                        <td className="px-3 py-2">
                          {currentDivision.name || 'Unknown'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            req.status === 'Approved' ? 'bg-green-100 text-green-800' :
                            req.status === 'Denied' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {req.status || 'Pending'}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-xs">
                          <div className="truncate" title={req.comments || ''}>
                            {req.comments || ''}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Requests;