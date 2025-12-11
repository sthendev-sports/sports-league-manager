// frontend/src/pages/EmailSettings.jsx
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Mail,
  ToggleLeft,
  ToggleRight,
  Send,
} from 'lucide-react';
import {
  emailSettingsAPI,
  seasonsAPI,
  divisionsAPI,
  notificationsAPI,
} from '../services/api';

const EmailSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingRosters, setSendingRosters] = useState(false);
  const [error, setError] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const [form, setForm] = useState({
    test_mode: false,
    test_email: '',
    from_email: '',
  });

  const [seasons, setSeasons] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const [settingsRes, seasonsRes] = await Promise.all([
        emailSettingsAPI.get(),
        seasonsAPI.getAll(),
      ]);

      const settingsData = settingsRes.data || {};
      const seasonsData = seasonsRes.data || [];

      setForm({
        test_mode: !!settingsData.test_mode,
        test_email: settingsData.test_email || '',
        from_email: settingsData.from_email || '',
      });

      setSeasons(seasonsData);

      // Try to set active season as default, otherwise first
      const activeSeason =
        seasonsData.find((s) => s.is_active) || seasonsData[0] || null;
      if (activeSeason) {
        setSelectedSeasonId(activeSeason.id);
        await loadDivisionsForSeason(activeSeason.id);
      }
    } catch (err) {
      console.error('Error loading email settings:', err);
      setError(
        err.response?.data?.error || 'Failed to load email settings from server'
      );
    } finally {
      setLoading(false);
    }
  };

  const loadDivisionsForSeason = async (seasonId) => {
    try {
      setDivisions([]);
      setSelectedDivisionId('');
      if (!seasonId) return;
      const res = await divisionsAPI.getAll({ season_id: seasonId });
      setDivisions(res.data || []);
    } catch (err) {
      console.error('Error loading divisions:', err);
      // don't hard-fail the page, just log
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggle = () => {
    setForm((prev) => ({
      ...prev,
      test_mode: !prev.test_mode,
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSeasonChange = async (e) => {
    const newSeasonId = e.target.value;
    setSelectedSeasonId(newSeasonId);
    setSelectedDivisionId('');
    await loadDivisionsForSeason(newSeasonId);
  };

  const handleDivisionChange = (e) => {
    setSelectedDivisionId(e.target.value);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setTestResult(null);

    if (form.test_mode && !form.test_email) {
      setError('Please enter a test email address when test mode is enabled.');
      return;
    }

    try {
      setSaving(true);
      const res = await emailSettingsAPI.update(form);
      const data = res.data || {};
      setForm({
        test_mode: !!data.test_mode,
        test_email: data.test_email || '',
        from_email: data.from_email || '',
      });
      setTestResult('Settings saved successfully.');
    } catch (err) {
      console.error('Error saving email settings:', err);
      setError(
        err.response?.data?.error || 'Failed to save email settings to server'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestSend = async () => {
    setError(null);
    setTestResult(null);

    try {
      setTesting(true);
      await emailSettingsAPI.testSend();
      setTestResult(
        'Test email sent. Check the configured test email (or your own email if no test email is set).'
      );
    } catch (err) {
      console.error('Error sending test email:', err);
      setError(
        err.response?.data?.error ||
          'Failed to send test email. Check your email configuration.'
      );
    } finally {
      setTesting(false);
    }
  };

  const handleSendManagerRosters = async () => {
    setError(null);
    setTestResult(null);

    if (!selectedSeasonId) {
      setError('Please select a season to send manager rosters.');
      return;
    }

    try {
      setSendingRosters(true);
      const payload = {
        season_id: selectedSeasonId,
        division_id: selectedDivisionId || null,
      };
      const res = await notificationsAPI.sendManagerRosters(payload);
      const data = res.data || {};

      const count = Array.isArray(data.sent) ? data.sent.length : 0;

      setTestResult(
        `Manager roster emails triggered successfully. ${count} email(s) sent (or redirected to test address if test mode is enabled).`
      );
    } catch (err) {
      console.error('Error sending manager roster emails:', err);
      setError(
        err.response?.data?.error ||
          'Failed to send manager roster emails. Check server logs for details.'
      );
    } finally {
      setSendingRosters(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Mail className="h-6 w-6 mr-2 text-blue-600" />
            Email Settings
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Configure outgoing email behavior and test mode. When test mode is
            enabled, all emails will be sent to the test address instead of the
            real recipients.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 flex">
            <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {testResult && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-md px-3 py-2">
            {testResult}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-5 space-y-8">
          {/* Email config section */}
          <div>
            {loading ? (
              <div className="py-8 text-center text-sm text-gray-500">
                Loading email settings...
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-6">
                {/* Test mode toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Test Mode
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-md">
                      When enabled, all emails will be redirected to the test
                      email address below. This is recommended while testing or
                      developing to prevent accidentally emailing parents and
                      volunteers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggle}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    {form.test_mode ? (
                      <>
                        <ToggleRight className="h-5 w-5 text-green-500 mr-1" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="h-5 w-5 text-gray-400 mr-1" />
                        Disabled
                      </>
                    )}
                  </button>
                </div>

                {/* Test email address */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Test Email Address
                  </label>
                  <input
                    type="email"
                    name="test_email"
                    value={form.test_email}
                    onChange={handleChange}
                    placeholder="you+tests@yourleague.org"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm text-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    When test mode is enabled, all outgoing emails will be sent
                    here instead of the real recipients. The original recipient
                    list will be included in the message for reference.
                  </p>
                </div>

                {/* From email address */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    From Email (optional)
                  </label>
                  <input
                    type="email"
                    name="from_email"
                    value={form.from_email}
                    onChange={handleChange}
                    placeholder="Your League Name <no-reply@yourleague.org>"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm text-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    If left blank, the system will use the default address from
                    your backend configuration (EMAIL_FROM or EMAIL_USER).
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save Settings'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestSend}
                    disabled={testing}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {testing ? 'Sending Test...' : 'Send Test Email'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Manager roster notifications section */}
          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Manager Roster Emails
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Send each team manager an email with their full roster and parent
              contact information. This will respect the test mode settings
              above.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {/* Season select */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Season
                </label>
                <select
                  value={selectedSeasonId}
                  onChange={handleSeasonChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm text-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a season...</option>
                  {seasons.map((season) => (
                    <option key={season.id} value={season.id}>
                      {season.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Division select */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Division (optional)
                </label>
                <select
                  value={selectedDivisionId}
                  onChange={handleDivisionChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm text-sm px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All divisions</option>
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  Leave blank to send rosters for all divisions in the selected
                  season.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendManagerRosters}
              disabled={sendingRosters}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-60"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendingRosters ? 'Sending Manager Rosters...' : 'Send Manager Rosters'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailSettings;
