import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || ''; // empty => use same-origin /api (Vercel rewrite or Vite proxy)

function toIntOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getFamilyLabel(f) {
  const name = (f?.family_name || f?.primary_contact_name || '').trim();
  const email = (f?.email || f?.primary_contact_email || '').trim();
  if (name) return name;
  if (email) return email;
  return '—';
}

function getAllEmails(f) {
  if (Array.isArray(f?.all_emails) && f.all_emails.length) return f.all_emails.filter(Boolean);
  const out = [];
  if (f?.email) out.push(f.email);
  if (f?.primary_contact_email) out.push(f.primary_contact_email);
  if (f?.parent2_email) out.push(f.parent2_email);
  return [...new Set(out.filter(Boolean))];
}

function getPlayersLine(f) {
  const players = Array.isArray(f?.players) ? f.players : [];
  const names = players
    .map(p => (p?.full_name || `${p?.first_name || ''} ${p?.last_name || ''}`.trim()).trim())
    .filter(Boolean);
  return names.length ? names.join(', ') : '';
}

export default function WorkbondManagement() {
  const [seasonId, setSeasonId] = useState('');
  const [seasons, setSeasons] = useState([]);
  const [activeTab, setActiveTab] = useState('families');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [summaryRows, setSummaryRows] = useState([]);
  const [requirementsRows, setRequirementsRows] = useState([]);
  const [requirementsDraft, setRequirementsDraft] = useState({});
  const [savingReq, setSavingReq] = useState(false);

  // Families filter
  const [familyFilter, setFamilyFilter] = useState('');

  // Shift form
  const [shiftForm, setShiftForm] = useState({
    date: todayISO(),
    time: '',
    task: '',
    completed_by: '',
    spots_completed: '1',
    family_id: ''
  });
  const [savingShift, setSavingShift] = useState(false);

  // Shift picker
  const [shiftFamilyFilter, setShiftFamilyFilter] = useState('');
  const [shiftFamilyPickerOpen, setShiftFamilyPickerOpen] = useState(false);

  // Running log
  const [shiftLog, setShiftLog] = useState([]);
  const [shiftLogLoading, setShiftLogLoading] = useState(false);
  const [shiftLogFilter, setShiftLogFilter] = useState('');

  // Edit shift state
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [editShiftDraft, setEditShiftDraft] = useState({
    shift_date: '',
    shift_type: '',
    spots_completed: '1',
    time: '',
    completed_by: '',
    notes: ''
  });

  // Parse time/completed_by from notes
  function parseShiftNotes(notes) {
    const out = { time: '', completedBy: '' };
    const text = String(notes || '');
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (l.toLowerCase().startsWith('time:')) out.time = l.slice(5).trim();
      if (l.toLowerCase().startsWith('completed by:')) out.completedBy = l.slice(13).trim();
    }
    return out;
  }

  function buildNotes({ baseNotes, time, completedBy }) {
    const lines = String(baseNotes || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    const filtered = lines.filter(l => {
      const ll = l.toLowerCase();
      return !ll.startsWith('time:') && !ll.startsWith('completed by:');
    });

    if (time) filtered.push(`Time: ${time}`);
    if (completedBy) filtered.push(`Completed by: ${completedBy}`);

    return filtered.join('\n');
  }

  // Load seasons
  useEffect(() => {
    (async () => {
      try {
        // Prefer ACTIVE season as the default everywhere
        const [activeRes, allRes] = await Promise.all([
          axios.get(`${API}/api/seasons/active`).catch(() => ({ data: null })),
          axios.get(`${API}/api/seasons`).catch(() => ({ data: [] }))
        ]);

        const active = activeRes?.data || null;
        const all = Array.isArray(allRes?.data) ? allRes.data : [];
        setSeasons(all);

        const nextDefault = active?.id || all?.[0]?.id || '';
        if (!seasonId && nextDefault) setSeasonId(nextDefault);
      } catch (e) {
        console.warn('Could not load seasons list:', e?.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadSeasonData = async (sid) => {
    if (!sid) return;
    setLoading(true);
    setError('');
    try {
      const [summaryRes, reqRes] = await Promise.all([
        axios.get(`${API}/api/workbond/summary`, { params: { season_id: sid } }),
        axios.get(`${API}/api/workbond/requirements`, { params: { season_id: sid } })
      ]);

      const summary = Array.isArray(summaryRes.data) ? summaryRes.data : [];
      const reqs = Array.isArray(reqRes.data) ? reqRes.data : [];

      // Merge requirements into families required_shifts based on the family's player division(s)
      const reqMap = new Map(
        reqs
          .map(r => [r.division_id ?? r.division?.id, parseInt(r.shifts_required ?? 0, 10) || 0])
          .filter(([k]) => k !== undefined && k !== null)
      );

      const mergedSummary = summary.map(f => {
        const playerDivIds = Array.isArray(f.players)
          ? f.players
              .map(p => p.division_id ?? p.division?.id)
              .filter(Boolean)
          : [];

        let required = f.required_shifts ?? 0;
        if (playerDivIds.length) {
          const vals = playerDivIds.map(id => reqMap.get(id)).filter(v => v !== undefined && v !== null);
          if (vals.length) required = Math.max(...vals);
        }

        return { ...f, required_shifts: required };
      });

      setSummaryRows(mergedSummary);
      setRequirementsRows(reqs);

      const nextDraft = {};
      reqs.forEach(r => {
        const k = r.division_id ?? r.division?.id;
        if (k === undefined || k === null) return;
        nextDraft[k] = String(r.shifts_required ?? '');
      });
      setRequirementsDraft(nextDraft);

      const firstFamilyId = summary[0]?.family_id || '';
      setShiftForm(prev => ({ ...prev, family_id: prev.family_id || firstFamilyId }));
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e?.message || 'Failed to load workbond data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (seasonId) loadSeasonData(seasonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  // When changing seasons, reset local page filters so stale season data isn't "stuck" on-screen.
  useEffect(() => {
    setFamilyFilter('');
    setShiftFamilyFilter('');
    setShiftFamilyPickerOpen(false);
    setShiftLogFilter('');
    setEditingShiftId(null);
  }, [seasonId]);

  async function loadShifts() {
    if (!seasonId) return;
    setShiftLogLoading(true);
    try {
      const logRes = await axios.get(`${API}/api/workbond/shifts`, {
        params: { season_id: seasonId }
      });
      setShiftLog(Array.isArray(logRes.data) ? logRes.data : []);
    } catch (e) {
      console.error('Error loading shifts', e);
      setShiftLog([]);
    } finally {
      setShiftLogLoading(false);
    }
  }

  useEffect(() => {
    if (!seasonId) return;
    if (activeTab === 'shifts') loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, seasonId]);

  async function saveRequirements() {
    if (!seasonId) return;
    setSavingReq(true);
    setError('');
    try {
      // Build payload from the divisions list so division_id keeps its real type (number/uuid)
      // instead of Object.entries() which forces keys to strings.
      const payload = (requirementsRows || [])
        .filter(r => r && r.division_id !== undefined && r.division_id !== null)
        .map(r => ({
          season_id: seasonId,
          division_id: r.division_id,
          shifts_required: toIntOrNull(requirementsDraft[r.division_id] ?? '')
        }));

      await axios.post(`${API}/api/workbond/requirements`, payload);
      await loadSeasonData(seasonId);
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e?.message || 'Failed to save requirements');
    } finally {
      setSavingReq(false);
    }
  }

  async function submitShift() {
    if (!seasonId) return;
    if (!shiftForm.family_id) {
      setError('Please select a family');
      return;
    }
    setSavingShift(true);
    setError('');
    try {
      await axios.post(`${API}/api/workbond/shifts`, {
        season_id: seasonId,
        family_id: shiftForm.family_id,
        date: shiftForm.date,
        time: shiftForm.time,
        task: shiftForm.task,
        completed_by: shiftForm.completed_by,
        spots_completed: toIntOrNull(shiftForm.spots_completed) ?? 1
      });

      setShiftForm(prev => ({
        ...prev,
        task: '',
        completed_by: '',
        spots_completed: '1',
        time: '',
        date: todayISO()
      }));

      await loadSeasonData(seasonId);
      await loadShifts();
      setActiveTab('shifts');
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e?.message || 'Failed to add shift');
    } finally {
      setSavingShift(false);
    }
  }

  function startEditShift(shift) {
    const parsed = parseShiftNotes(shift?.notes);
    setEditingShiftId(shift.id);
    setEditShiftDraft({
      shift_date: shift.shift_date || '',
      shift_type: shift.shift_type || shift.description || '',
      spots_completed: String(shift.spots_completed ?? 1),
      time: parsed.time || '',
      completed_by: parsed.completedBy || '',
      notes: String(shift.notes || '')
    });
  }

  async function saveEditShift() {
    if (!editingShiftId) return;

    const spots = toIntOrNull(editShiftDraft.spots_completed) ?? 1;
    const nextNotes = buildNotes({
      baseNotes: editShiftDraft.notes,
      time: editShiftDraft.time,
      completedBy: editShiftDraft.completed_by
    });

    setError('');
    try {
      await axios.put(`${API}/api/workbond/shifts/${editingShiftId}`, {
        shift_date: editShiftDraft.shift_date,
        shift_type: editShiftDraft.shift_type,
        description: editShiftDraft.shift_type,
        spots_completed: spots,
        notes: nextNotes
      });

      setEditingShiftId(null);
      await loadSeasonData(seasonId);
      await loadShifts();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e?.message || 'Failed to update shift');
    }
  }

  async function deleteShift(id) {
    if (!id) return;
    setError('');
    try {
      await axios.delete(`${API}/api/workbond/shifts/${id}`);
      await loadSeasonData(seasonId);
      await loadShifts();
    } catch (e) {
      console.error(e);
      setError(e?.response?.data?.error || e?.message || 'Failed to delete shift');
    }
  }

  const selectedShiftFamily = useMemo(() => {
    return (summaryRows || []).find(f => f.family_id === shiftForm.family_id) || null;
  }, [summaryRows, shiftForm.family_id]);

  const familiesForPicker = useMemo(() => {
    const q = shiftFamilyFilter.trim().toLowerCase();
    const arr = Array.isArray(summaryRows) ? summaryRows : [];
    if (!q) return arr;

    return arr.filter(f => {
      const emails = getAllEmails(f).join(' ');
      const playersLine = getPlayersLine(f);
      const label = `${getFamilyLabel(f)} ${emails} ${playersLine}`.toLowerCase();
      return label.includes(q);
    });
  }, [summaryRows, shiftFamilyFilter]);


  const filteredShiftLog = useMemo(() => {
    const q = shiftLogFilter.trim().toLowerCase();
    const arr = Array.isArray(shiftLog) ? shiftLog : [];
    if (!q) return arr;

    return arr.filter((s) => {
      const parsed = parseShiftNotes(s?.notes);
      const familyName = (s?.family?.primary_contact_name || s?.family?.family_name || '').toString();
      const task = (s?.shift_type || s?.description || s?.task || '').toString();
      const date = (s?.shift_date || s?.date || '').toString();

      const emails = [
        s?.family?.primary_contact_email,
        s?.family?.parent2_email,
        s?.volunteer?.email,
        s?.volunteer?.name
      ].filter(Boolean).join(' ');

      const hay = `${familyName} ${emails} ${task} ${date} ${parsed.time || ''} ${parsed.completedBy || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [shiftLog, shiftLogFilter]);

  const selectedFamilyPlayers = selectedShiftFamily ? getPlayersLine(selectedShiftFamily) : '';
  const selectedFamilyEmails = selectedShiftFamily ? getAllEmails(selectedShiftFamily) : [];

  const filteredFamilies = useMemo(() => {
    const q = familyFilter.trim().toLowerCase();
    const arr = Array.isArray(summaryRows) ? summaryRows : [];
    if (!q) return arr;

    return arr.filter(f => {
      const label = getFamilyLabel(f).toLowerCase();
      const emails = getAllEmails(f).join(' ').toLowerCase();
      const players = getPlayersLine(f).toLowerCase();
      const reason = String(f?.exempt_reason || '').toLowerCase();
      return `${label} ${emails} ${players} ${reason}`.includes(q);
    });
  }, [summaryRows, familyFilter]);

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Workbond Management</h1>

          {/* Public status page helper */}
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <div className="font-semibold text-gray-900">Public Workbond Status Page</div>
            <div className="mt-1 text-gray-700">
              Families can check their status here:&nbsp;
              <a
                href="/checkworkbond"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                /checkworkbond
              </a>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
                onClick={() => {
                  const url = `${window.location.origin}/checkworkbond`;
                  navigator.clipboard?.writeText(url);
                }}
              >
                Copy full URL
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50"
                onClick={() => window.open('/checkworkbond', '_blank', 'noreferrer')}
              >
                Open page
              </button>
              <div className="text-gray-500 self-center">
                Admin/President can edit the message shown on that page.
              </div>
            </div>
          </div>
          <p className="text-sm text-gray-600">Track required vs completed shifts and log workbond entries.</p>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-sm text-gray-700">Season</label>
            <select
              className="mt-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              value={seasonId}
              onChange={(e) => setSeasonId(e.target.value)}
            >
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || s.title || s.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {['families', 'requirements', 'shifts'].map(key => {
          const label = key === 'families' ? 'Families' : key === 'requirements' ? 'Requirements' : 'Shifts';
          return (
            <button
              key={key}
              type="button"
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                activeTab === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="rounded-md border border-gray-200 bg-white p-6 text-sm text-gray-700">
          Loading…
        </div>
      )}

      {/* Families */}
      {!loading && activeTab === 'families' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Families</h2>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:w-80"
              placeholder="Filter by family, email, player, exempt reason…"
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value)}
            />
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Family</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Emails</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Required</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Completed</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Remaining</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Exempt Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(filteredFamilies || []).map((f) => {
                  const emails = getAllEmails(f);
                  return (
                    <tr key={f.family_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{getFamilyLabel(f)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {emails.length ? (
                          <div className="space-y-0.5">
                            {emails.map((em, idx) => (
                              <div key={`${f.family_id || f.id}-${idx}`}>{em}</div>
                            ))}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm">{f.required_shifts ?? 0}</td>
                      <td className="px-4 py-3 text-right text-sm">{f.completed_shifts ?? 0}</td>
                      <td className="px-4 py-3 text-right text-sm">{f.remaining_shifts ?? 0}</td>
                      <td className="px-4 py-3 text-sm">
                        {f.is_exempt ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            Exempt
                          </span>
                        ) : (f.remaining_shifts ?? 0) === 0 ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                            Incomplete
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {f.is_exempt ? (f.exempt_reason || '—') : '—'}
                      </td>
                    </tr>
                  );
                })}

                {(filteredFamilies || []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-600">
                      No matching families.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Requirements */}
      {!loading && activeTab === 'requirements' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Requirements</h2>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={saveRequirements}
              disabled={savingReq}
            >
              {savingReq ? 'Saving…' : 'Save'}
            </button>
          </div>

          <p className="mt-2 text-sm text-gray-600">
            Set required shifts per division. The Families tab “Required” will reflect these values.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Division</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Required Shifts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(requirementsRows || []).map((r) => (
                  <tr key={r.division_id}>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.division_name || r.division_id}</td>
                    <td className="px-4 py-3 text-sm">
                      <input
                        className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm"
                        inputMode="numeric"
                        value={requirementsDraft[r.division_id] ?? ''}
                        onChange={(e) =>
                          setRequirementsDraft(prev => ({ ...prev, [r.division_id]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}

                {(requirementsRows || []).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-10 text-center text-sm text-gray-600">
                      No divisions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shifts */}
      {!loading && activeTab === 'shifts' && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Shift Entry</h2>

          {selectedShiftFamily && (
            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
              <div className="font-medium text-gray-900">{getFamilyLabel(selectedShiftFamily)}</div>
              {selectedFamilyPlayers && <div className="text-gray-700">Players: {selectedFamilyPlayers}</div>}
              {selectedFamilyEmails.length > 0 && (
                <div className="text-gray-700">Emails: {selectedFamilyEmails.join(', ')}</div>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-700">Family</label>

              <button
                type="button"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm"
                onClick={() => setShiftFamilyPickerOpen(v => !v)}
              >
                {selectedShiftFamily ? getFamilyLabel(selectedShiftFamily) : 'Select a family…'}
              </button>

              {shiftFamilyPickerOpen && (
                <div className="mt-2 rounded-md border border-gray-200 bg-white p-2">
                  <input
                    className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Search family, emails, or player name…"
                    value={shiftFamilyFilter}
                    onChange={(e) => setShiftFamilyFilter(e.target.value)}
                  />
                  <div className="max-h-64 overflow-y-auto">
                    {familiesForPicker.map(f => {
                      const emails = getAllEmails(f);
                      const playersLine = getPlayersLine(f);
                      return (
                        <button
                          key={f.family_id}
                          type="button"
                          className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                          onClick={() => {
                            setShiftForm(prev => ({ ...prev, family_id: f.family_id }));
                            setShiftFamilyPickerOpen(false);
                          }}
                        >
                          <div className="font-medium text-gray-900">{getFamilyLabel(f)}</div>
                          {playersLine && <div className="text-xs text-gray-600">Players: {playersLine}</div>}
                          {emails.length > 0 && <div className="text-xs text-gray-600">Emails: {emails.join(', ')}</div>}
                        </button>
                      );
                    })}

                    {familiesForPicker.length === 0 && (
                      <div className="px-3 py-6 text-center text-sm text-gray-600">No matches.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm text-gray-700">Date</label>
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={shiftForm.date}
                onChange={(e) => setShiftForm(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700">Time</label>
              <input
                type="time"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={shiftForm.time}
                onChange={(e) => setShiftForm(prev => ({ ...prev, time: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700">Spots Completed</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                inputMode="numeric"
                value={shiftForm.spots_completed}
                onChange={(e) => setShiftForm(prev => ({ ...prev, spots_completed: e.target.value }))}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-700">Task</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={shiftForm.task}
                onChange={(e) => setShiftForm(prev => ({ ...prev, task: e.target.value }))}
                placeholder="Concessions, field setup, etc."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm text-gray-700">Completed By</label>
              <input
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={shiftForm.completed_by}
                onChange={(e) => setShiftForm(prev => ({ ...prev, completed_by: e.target.value }))}
                placeholder="Name"
              />
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={submitShift}
                disabled={savingShift || loading}
              >
                {savingShift ? 'Saving…' : 'Add Shift'}
              </button>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Running Log</h3>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                onClick={loadShifts}
                disabled={shiftLogLoading}
              >
                {shiftLogLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <input
                type="text"
                value={shiftLogFilter}
                onChange={(e) => setShiftLogFilter(e.target.value)}
                placeholder="Filter running log by family, email, task, date, etc."
                className="w-full sm:w-96 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              {shiftLogFilter ? (
                <button
                  type="button"
                  className="self-start sm:self-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setShiftLogFilter('')}
                >
                  Clear
                </button>
              ) : null}
            </div>

            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Family</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Emails</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Task</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">Completed By</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Spots</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {(filteredShiftLog || []).map((s) => {
                    const parsed = parseShiftNotes(s.notes);
                    const isEditing = editingShiftId === s.id;

                    const familyEmails = [
                      s.family?.primary_contact_email,
                      s.family?.parent2_email
                    ].filter(Boolean);
                    const uniqEmails = [...new Set(familyEmails)];

                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <input
                              type="date"
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                              value={editShiftDraft.shift_date}
                              onChange={(e) => setEditShiftDraft(d => ({ ...d, shift_date: e.target.value }))}
                            />
                          ) : (
                            s.shift_date || '—'
                          )}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-900">
                          {s.family?.primary_contact_name || s.family?.family_id || s.family_id || '—'}
                        </td>

                        <td className="px-4 py-3 text-sm text-gray-700">
                          {uniqEmails.length ? (
                            <div className="space-y-0.5">
                              {uniqEmails.map((em, idx) => <div key={`${s.id || s.shift_id || s.created_at || 'shift'}-${idx}`}>{em}</div>)}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>

                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <input
                              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                              value={editShiftDraft.shift_type}
                              onChange={(e) => setEditShiftDraft(d => ({ ...d, shift_type: e.target.value }))}
                            />
                          ) : (
                            s.shift_type || s.description || '—'
                          )}
                        </td>

                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <input
                              type="time"
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                              value={editShiftDraft.time}
                              onChange={(e) => setEditShiftDraft(d => ({ ...d, time: e.target.value }))}
                            />
                          ) : (
                            parsed.time || '—'
                          )}
                        </td>

                        <td className="px-4 py-3 text-sm">
                          {isEditing ? (
                            <input
                              className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                              value={editShiftDraft.completed_by}
                              onChange={(e) => setEditShiftDraft(d => ({ ...d, completed_by: e.target.value }))}
                            />
                          ) : (
                            parsed.completedBy || '—'
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-sm">
                          {isEditing ? (
                            <input
                              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-right"
                              inputMode="numeric"
                              value={editShiftDraft.spots_completed}
                              onChange={(e) => setEditShiftDraft(d => ({ ...d, spots_completed: e.target.value }))}
                            />
                          ) : (
                            s.spots_completed ?? 0
                          )}
                        </td>

                        <td className="px-4 py-3 text-right text-sm">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                onClick={saveEditShift}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() => setEditingShiftId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                                onClick={() => startEditShift(s)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                                onClick={() => deleteShift(s.id)}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {(shiftLog || []).length === 0 && !shiftLogLoading && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-600">
                        No shifts logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
