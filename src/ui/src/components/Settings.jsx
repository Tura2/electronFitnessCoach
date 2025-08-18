import React, { useEffect, useMemo, useState } from 'react';

const KEYS = [
  'coach.name',
  'coach.email',
  'reminders.minutesBefore',
  'google.calendarId',
  'calendar.tz',
  'google.tokens',
  'ui.theme', // <- persist theme in settings
];

export default function Settings() {
  const [values, setValues] = useState({
    'coach.name': '',
    'coach.email': '',
    'reminders.minutesBefore': 60,
    'google.calendarId': 'primary',
    'calendar.tz': 'Asia/Jerusalem',
    'google.tokens': null,
    'ui.theme': null, // 'light' | 'dark' | null (decide on load)
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  // ----- Theme helpers -----
  function applyTheme(mode) {
    const safeMode = mode === 'light' || mode === 'dark' ? mode : 'dark';
    document.documentElement.setAttribute('data-theme', safeMode);
    try { localStorage.setItem('ui.theme', safeMode); } catch {}
    setValues(prev => ({ ...prev, 'ui.theme': safeMode }));
  }

  function resolveInitialTheme(fetched) {
    const fromSettings = fetched?.['ui.theme'];
    if (fromSettings === 'light' || fromSettings === 'dark') return fromSettings;

    try {
      const fromLocal = localStorage.getItem('ui.theme');
      if (fromLocal === 'light' || fromLocal === 'dark') return fromLocal;
    } catch {}

    const prefersDark = typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    return prefersDark ? 'dark' : 'light';
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await window.api?.getSettings?.(KEYS);
        if (res?.ok && res.data) {
          const merged = { ...values, ...res.data };
          const initialTheme = resolveInitialTheme(res.data);
          merged['ui.theme'] = initialTheme;
          setValues(merged);
          applyTheme(initialTheme);
        } else {
          setError(res?.error || 'Failed to load settings');
          // Still set a theme so UI looks right
          applyTheme(resolveInitialTheme(null));
        }
      } catch {
        setError('Failed to load settings');
        applyTheme(resolveInitialTheme(null));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k, v) { setValues(prev => ({ ...prev, [k]: v })); }

  const errs = useMemo(() => {
    const e = {};
    const email = String(values['coach.email'] || '').trim();
    if (!String(values['coach.name'] || '').trim()) e['coach.name'] = 'Name is required';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e['coach.email'] = 'Invalid email';
    const minutes = Number(values['reminders.minutesBefore'] ?? 0);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 10080) e['reminders.minutesBefore'] = 'Enter 0–10080 minutes';
    return e;
  }, [values]);

  const isValid = Object.keys(errs).length === 0;
  const connected = !!values['google.tokens'];

  async function onSave(e) {
    e?.preventDefault?.();
    if (!isValid) return;
    setSaving(true); setError(''); setToast('');
    try {
      const payload = {
        'coach.name': values['coach.name'] || '',
        'coach.email': values['coach.email'] || '',
        'reminders.minutesBefore': Number(values['reminders.minutesBefore'] || 0),
        'google.calendarId': values['google.calendarId'] || 'primary',
        'calendar.tz': values['calendar.tz'] || 'Asia/Jerusalem',
        'ui.theme': values['ui.theme'] || 'dark',
      };
      const res = await window.api?.setSettings?.(payload);
      if (!res?.ok) throw new Error(res?.error || 'Failed to save settings');
      setToast('Settings saved');
      setTimeout(() => setToast(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function onConnect() {
    setError(''); setToast('');
    try {
      const start = new Date(Date.now() - 3600e3).toISOString();
      const end   = new Date(Date.now() + 3600e3).toISOString();
      const res = await window.api.listGoogleEvents(start, end); // triggers OAuth if needed
      if (!res?.ok) throw new Error(res?.error || 'Failed to connect');
      const tokens = await window.api.getSetting('google.tokens');
      set('google.tokens', tokens?.value || null);
      setToast('Google connected');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setError(e.message || 'Connect failed');
    }
  }

  async function onDisconnect() {
    setError(''); setToast('');
    const res = await window.api.googleDisconnect?.();
    if (res?.ok) {
      set('google.tokens', null);
      setToast('Disconnected from Google');
      setTimeout(() => setToast(''), 2000);
    } else {
      setError(res?.error || 'Failed to disconnect');
    }
  }

  const themeMode = values['ui.theme'] === 'light' || values['ui.theme'] === 'dark'
    ? values['ui.theme']
    : 'dark';

  const toggleTheme = async () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { await window.api?.setSetting?.('ui.theme', next); } catch {}
  };

  return (
    <section className="card">
      <div className="section-head">
        <h2 style={{margin:0}}>Settings</h2>
        <button className="btn" onClick={onSave} disabled={saving || !isValid}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {toast && <div className="toast success">{toast}</div>}
      {error && <div className="toast error">{error}</div>}
      {loading && <p>Loading…</p>}

      {!loading && (
        <>
          {/* Appearance */}
          <div style={{marginBottom:16}}>
            <h3 className="h3" style={{marginTop:0}}>Appearance</h3>
            <div className="form-grid two-cols">
              <Field label="Theme">
                <div style={{display:'flex', alignItems:'center', gap:12}}>
                  <label className="switch" title="Toggle light / dark">
                    <input
                      type="checkbox"
                      checked={themeMode === 'dark'}
                      onChange={toggleTheme}
                      aria-label="Toggle dark mode"
                    />
                    <span className="slider" />
                  </label>
                  <span className="small" style={{userSelect:'none'}}>
                    {themeMode === 'dark' ? 'Dark mode' : 'Light mode'}
                  </span>
                </div>
              </Field>
            </div>
          </div>

          {/* Coach Profile */}
          <div style={{marginBottom:16}}>
            <h3 className="h3" style={{marginTop:0}}>Coach Profile</h3>
            <div className="form-grid two-cols">
              <Field label="Name" error={errs['coach.name']}>
                <input
                  className="input"
                  placeholder="e.g., Dana Cohen"
                  value={values['coach.name'] || ''}
                  onChange={(e)=>set('coach.name', e.target.value)}
                />
              </Field>
              <Field label="Email" help="Optional" error={errs['coach.email']}>
                <input
                  className="input"
                  type="email"
                  placeholder="coach@example.com"
                  value={values['coach.email'] || ''}
                  onChange={(e)=>set('coach.email', e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Reminders */}
          <div style={{marginBottom:16}}>
            <h3 className="h3" style={{marginTop:0}}>Reminders</h3>
            <div className="form-grid two-cols">
              <Field label="Minutes before session" help="0 to disable" error={errs['reminders.minutesBefore']}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10080}
                  step={5}
                  value={values['reminders.minutesBefore'] ?? 0}
                  onChange={(e)=>set('reminders.minutesBefore', e.target.value)}
                />
              </Field>
              <Field label="Time zone">
                <input
                  className="input"
                  placeholder="e.g., Asia/Jerusalem"
                  value={values['calendar.tz'] || 'Asia/Jerusalem'}
                  onChange={(e)=>set('calendar.tz', e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Google Calendar */}
          <div className="card" style={{padding:16}}>
            <div className="h3" style={{marginTop:0, marginBottom:12}}>Google Calendar</div>
            <div className="form-grid two-cols">
              <Field label="Calendar ID">
                <input
                  className="input"
                  value={values['google.calendarId'] || 'primary'}
                  onChange={(e)=>set('google.calendarId', e.target.value)}
                  placeholder="primary"
                />
              </Field>
              <Field label="Status">
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontWeight:600}}>
                    {connected ? 'Connected' : 'Not connected'}
                  </span>
                  {!connected ? (
                    <button className="btn small" onClick={onConnect}>Connect</button>
                  ) : (
                    <button className="btn small ghost" onClick={onDisconnect}>Disconnect</button>
                  )}
                </div>
              </Field>
            </div>
            <div className="small" style={{marginTop:8, color:'var(--text-muted)'}}>
              Connect once in the browser. Access stays local to this device.
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Field({ label, help, error, children }) {
  return (
    <label className={`field ${error ? 'has-error' : ''}`}>
      <div className="field-head">
        <span>{label}</span>
        {help && <span className="help">{help}</span>}
      </div>
      {children}
      {error && <div className="error-text">{error}</div>}
    </label>
  );
}
