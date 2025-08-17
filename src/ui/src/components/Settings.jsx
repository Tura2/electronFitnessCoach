// src/ui/src/components/Settings.jsx
import React, { useEffect, useMemo, useState } from 'react';

const KEYS = [
  'coach.name',
  'coach.email',
  'reminders.minutesBefore',
  'google.clientId',
  'google.clientSecret',
  'google.calendarId',
  'calendar.tz'
];

export default function Settings() {
  const [values, setValues] = useState({
    'coach.name': '',
    'coach.email': '',
    'reminders.minutesBefore': 60,
    'google.clientId': '',
    'google.clientSecret': '',
    'google.calendarId': 'primary',
    'calendar.tz': 'Asia/Jerusalem'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await window.api?.getSettings?.(KEYS);
        if (res?.ok && res.data) setValues(prev => ({ ...prev, ...res.data }));
        else setError(res?.error || 'Failed to load settings');
      } catch {
        setError('Failed to load settings');
      } finally { setLoading(false); }
    })();
  }, []);

  function set(k, v) { setValues(prev => ({ ...prev, [k]: v })); }

  const errs = useMemo(() => {
    const e = {};
    const email = String(values['coach.email'] || '').trim();
    if (!String(values['coach.name'] || '').trim()) e['coach.name'] = 'Name is required';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e['coach.email'] = 'Invalid email';
    const minutes = Number(values['reminders.minutesBefore'] ?? 0);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 10080) e['reminders.minutesBefore'] = 'Enter 0–10080 minutes';
    if (!String(values['google.clientId'] || '').trim()) e['google.clientId'] = 'Required for Google';
    if (!String(values['google.clientSecret'] || '').trim()) e['google.clientSecret'] = 'Required for Google';
    return e;
  }, [values]);

  const isValid = Object.keys(errs).length === 0;

  async function onSave(e) {
    e?.preventDefault?.();
    if (!isValid) return;
    setSaving(true); setError(''); setToast('');
    try {
      const payload = {
        ...values,
        'reminders.minutesBefore': Number(values['reminders.minutesBefore'] || 0)
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
              <Field label="Email" help="Optional (not used for sending mail)" error={errs['coach.email']}>
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
              <Field label="Client ID" error={errs['google.clientId']}>
                <input
                  className="input"
                  value={values['google.clientId'] || ''}
                  onChange={(e)=>set('google.clientId', e.target.value)}
                  placeholder="xxxxx.apps.googleusercontent.com"
                />
              </Field>
              <Field label="Client Secret" error={errs['google.clientSecret']}>
                <input
                  className="input"
                  value={values['google.clientSecret'] || ''}
                  onChange={(e)=>set('google.clientSecret', e.target.value)}
                  placeholder="********"
                />
              </Field>
              <Field label="Calendar ID">
                <input
                  className="input"
                  value={values['google.calendarId'] || 'primary'}
                  onChange={(e)=>set('google.calendarId', e.target.value)}
                  placeholder="primary"
                />
              </Field>
            </div>
            <div className="small" style={{marginTop:8, color:'var(--text-muted)'}}>
              You’ll connect your Google account the first time you send an invite from Messages.
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
