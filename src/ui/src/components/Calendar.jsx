import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from './Modal.jsx';

// FullCalendar v6 injects its own CSS. Do NOT import @fullcalendar/* .css files here.
// Ensure the calendar container has height so events can render.

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(s) {
  return s ? new Date(s).toISOString() : null;
}

export default function Calendar() {
  const calRef = useRef(null);

  const [athletes, setAthletes] = useState([]);
  const athleteOptions = useMemo(
    () => (athletes || []).map((a) => ({
      id: a.id,
      name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Unnamed',
      email: a.email || '',
    })),
    [athletes]
  );

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState(''); // NEW

  // modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [form, setForm] = useState({ id: null, trainee_id: '', start: '', end: '', notes: '', syncGoogle: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await window.api.listTrainees();
        setAthletes(list || []);
      } catch {}
    })();
  }, []);

  // === PURE range builder for FullCalendar (NO setState here to avoid refetch loops) ===
  const buildRange = useCallback(
    async (startISO, endISO) => {
      // 1) Google
      const g = await window.api.listGoogleEvents(startISO, endISO);
      const google = g?.ok ? g.items : [];
      const googleEvents = google.map((ev) => {
        const hasAllDay = !!(ev.start && ev.start.length === 10); // 'YYYY-MM-DD'
        return {
          id: `g:${ev.id}`,
          title: ev.summary || '(Google event)',
          start: ev.start || null,
          end: ev.end || undefined, // FullCalendar handles all-day end (exclusive)
          allDay: hasAllDay || undefined,
          editable: false,
          classNames: ['fc-event-google'],
          extendedProps: { source: 'google' },
        };
      });

      // 2) Local practices
      const rows = await window.api.listSessions(startISO, endISO);
      const localEvents = (Array.isArray(rows) ? rows : []).map((r) => {
        const a = athleteOptions.find((x) => x.id === r.trainee_id);
        return {
          id: r.id,
          title: a?.name || 'Practice',
          start: r.start_time,
          end: r.end_time || undefined,
          editable: true,
          classNames: ['fc-event-local'],
          extendedProps: {
            source: 'local',
            trainee_id: r.trainee_id || '',
            notes: r.notes || '',
            status: r.status || 'planned',
            googleEventId: r.google_event_id || null,
          },
        };
      });

      // 3) Hide Google duplicates when a local session is linked to that Google ID
      const linkedGoogleIds = new Set(localEvents.map((e) => e.extendedProps.googleEventId).filter(Boolean));
      const googleEventsFiltered = googleEvents.filter((ge) => !linkedGoogleIds.has(ge.id.slice(2)));

      const combined = [...googleEventsFiltered, ...localEvents];

      // Debug summary
      console.debug('[fc] loadRange', {
        startISO,
        endISO,
        counts: {
          google: googleEvents.length,
          local: localEvents.length,
          googleFiltered: googleEventsFiltered.length,
          combined: combined.length,
        },
      });

      return combined;
    },
    [athleteOptions]
  );

  // Stable async source for FullCalendar
  const eventsFetcher = useCallback(
    async (info, success, failure) => {
      try {
        const combined = await buildRange(info.startStr, info.endStr);
        console.debug('[fc] feeding', combined.length, 'events');
        success(combined);
      } catch (e) {
        console.error('[fc] events fetch failed', e);
        failure(e);
      }
    },
    [buildRange]
  );

  function onSelect(sel) {
    setMode('create');
    setForm({
      id: null,
      trainee_id: '',
      start: toLocalInput(sel.startStr),
      end: toLocalInput(sel.endStr),
      notes: '',
      syncGoogle: true, // default add to Google (no invite)
    });
    setOpen(true);
  }

  function onEventClick(info) {
    const ev = info.event;
    const xp = ev.extendedProps || {};
    if (xp.source === 'google') {
      // REPLACED alert() with non-blocking info toast
      setInfoMsg('Google events are read-only here. Create a local practice to edit/delete.');
      setTimeout(() => setInfoMsg(''), 2800);
      return;
    }
    setMode('edit');
    setForm({
      id: ev.id,
      trainee_id: xp.trainee_id || '',
      start: toLocalInput(ev.start?.toISOString?.() || ev.startStr),
      end: toLocalInput((ev.end || ev.start)?.toISOString?.() || ev.endStr),
      notes: xp.notes || '',
      syncGoogle: true, // editing will update the Google copy if toggled
    });
    setOpen(true);
  }

  async function onSubmit(e) {
    e?.preventDefault?.();
    if (!form.start) return setErrorMsg('Start time is required');

    const payload = {
      trainee_id: form.trainee_id || null,
      start_time: fromLocalInput(form.start),
      end_time: form.end ? fromLocalInput(form.end) : null,
      notes: form.notes || '',
      syncGoogle: !!form.syncGoogle,
    };

    try {
      setSaving(true);
      setErrorMsg('');
      if (mode === 'create') {
        const res = await window.api.createSession(payload);
        if (!res?.ok) throw new Error(res?.error || 'Failed to create');
        setToast('Practice added');
      } else {
        const res = await window.api.updateSession(form.id, payload);
        if (!res?.ok) throw new Error(res?.error || 'Failed to update');
        setToast('Practice updated');
      }
      setTimeout(() => setToast(''), 1500);
      setOpen(false);

      // Ask FullCalendar to refetch the async source
      calRef.current?.getApi()?.refetchEvents();
    } catch (err) {
      setErrorMsg(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!form.id) return;
    if (!confirm('Delete this practice?\n(Will also remove the Google copy if it exists)')) return;
    try {
      const res = await window.api.deleteSession(form.id, true);
      if (!res?.ok) throw new Error(res?.error || 'Failed to delete');
      setOpen(false);
      calRef.current?.getApi()?.refetchEvents();
      setToast('Practice deleted');
      setTimeout(() => setToast(''), 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Delete failed');
    }
  }

  return (
    <section className="card" style={{ height: '100vh', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="section-head" style={{ flex: '0 0 auto' }}>
        <h2 style={{ margin: 0 }}>Calendar</h2>
        <button
          className="btn small"
          onClick={() => {
            const now = new Date();
            setMode('create');
            setForm({
              id: null,
              trainee_id: '',
              start: toLocalInput(now.toISOString()),
              end: toLocalInput(new Date(now.getTime() + 60 * 60 * 1000).toISOString()),
              notes: '',
              syncGoogle: true,
            });
            setOpen(true);
          }}
        >
          New practice +
        </button>
      </div>

      {toast && <div className="toast success" role="status" aria-live="polite">{toast}</div>}
      {infoMsg && <div className="toast info" role="status" aria-live="polite">{infoMsg}</div>}
      {errorMsg && <div className="toast error" role="alert" aria-live="assertive">{errorMsg}</div>}
      {loading && <p>Loading…</p>}

      {/* Calendar container that can grow */}
      <div style={{ flex: '1 1 auto', minHeight: 0 }}>
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth' }}
          height="100%"
          expandRows
          timeZone="local"
          nowIndicator
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: false }}

          // Let FullCalendar toggle our spinner safely (no refetch loop)
          loading={(isLoading) => setLoading(isLoading)}

          // Stable async source
          events={eventsFetcher}

          // Debug: log when an event is actually mounted
          eventDidMount={(arg) => {
            console.debug('[fc] mounted', arg.event.id, arg.event.startStr, arg.event.title);
          }}

          selectable
          selectMirror
          dayMaxEvents
          select={onSelect}
          eventClick={onEventClick}
        />
      </div>

      {open && (
        <Modal title={mode === 'create' ? 'Add practice' : 'Edit practice'} onClose={() => setOpen(false)} width={560}>
          <form onSubmit={onSubmit} className="form-grid two-cols">
            <label className="field">
              <div className="field-head"><span>Athlete</span></div>
              <select
                className="select"
                value={form.trainee_id}
                onChange={(e) => setForm((f) => ({ ...f, trainee_id: e.target.value }))}
              >
                <option value="">— Select athlete —</option>
                {athleteOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <div className="field-head"><span>Start</span></div>
              <input
                className="input"
                type="datetime-local"
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
                step={300}
                required
              />
            </label>

            <label className="field">
              <div className="field-head"><span>End</span></div>
              <input
                className="input"
                type="datetime-local"
                value={form.end}
                onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
                step={300}
              />
            </label>

            <label className="field span-cols">
              <div className="field-head"><span>Notes</span></div>
              <textarea
                className="input"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes…"
                dir="auto"
              />
            </label>

            <label className="field span-cols">
              <div className="field-head"><span>Add/Update in Google Calendar (no invite)</span></div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={!!form.syncGoogle}
                  onChange={(e) => setForm((f) => ({ ...f, syncGoogle: e.target.checked }))}
                />
                <span className="slider" />
              </label>
            </label>

            <div className="form-actions span-cols" style={{ justifyContent: 'space-between' }}>
              <div>
                {mode === 'edit' && (
                  <button type="button" className="btn danger" onClick={onDelete} disabled={saving}>
                    Delete
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : mode === 'create' ? 'Add' : 'Save'}
                </button>
                <button className="btn ghost" type="button" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
          <div className="small" style={{ marginTop: 8, color: 'var(--text-muted)' }}>
            Invitations are sent from the <strong>Messages</strong> tab.
          </div>
        </Modal>
      )}
    </section>
  );
}
