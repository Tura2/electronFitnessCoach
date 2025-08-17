import React, { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from './Modal.jsx';

function toLocalInput(iso){ if(!iso) return ''; const d=new Date(iso);
  const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(s){ return s ? new Date(s).toISOString() : null; }
const fmt = (iso) => iso ? new Date(iso).toLocaleString([], {dateStyle:'medium', timeStyle:'short'}) : '';

export default function Calendar() {
  const calRef = useRef(null);

  const [athletes, setAthletes] = useState([]);
  const athleteOptions = useMemo(() => (athletes || []).map(a => ({
    id: a.id,
    name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || 'Unnamed',
    email: a.email || ''
  })), [athletes]);

  const [events, setEvents] = useState([]);     // merged: google + local
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('create'); // 'create' | 'edit'
  const [form, setForm] = useState({ id:null, trainee_id:'', start:'', end:'', notes:'', syncGoogle:true });
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try { setAthletes(await window.api.listTrainees() || []); } catch {}
  })(); }, []);

  async function loadRange(startISO, endISO) {
    setLoading(true);
    try {
      // 1) Google events
      const g = await window.api.listGoogleEvents(startISO, endISO);
      const google = g?.ok ? g.items : [];
      const googleEvents = google.map(ev => ({
        id: `g:${ev.id}`,
        title: ev.summary || '(Google event)',
        start: ev.start, end: ev.end || undefined,
        editable: false,
        classNames: ['fc-event-google'],
        extendedProps: { source: 'google' }
      }));

      // 2) Local practices
      const rows = await window.api.listSessions(startISO, endISO);
      const localEvents = (Array.isArray(rows) ? rows : []).map(r => {
        const a = athleteOptions.find(x => x.id === r.trainee_id);
        return {
          id: r.id,
          title: a?.name || 'Practice',
          start: r.start_time,
          end:   r.end_time || undefined,
          editable: true,
          classNames: ['fc-event-local'],
          extendedProps: {
            source: 'local',
            trainee_id: r.trainee_id || '',
            notes: r.notes || '',
            status: r.status || 'planned',
            googleEventId: r.google_event_id || null,
          }
        };
      });

      setEvents([...googleEvents, ...localEvents]);
    } catch (e) {
      setErrorMsg(e.message || 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }

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
      alert('Google events are read-only here.\nCreate your practices (local) to edit/delete.');
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
      syncGoogle: !!form.syncGoogle
    };

    try {
      setSaving(true); setErrorMsg('');
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

      const view = calRef.current?.getApi?.().view;
      if (view) await loadRange(view.activeStart.toISOString(), view.activeEnd.toISOString());
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
      const view = calRef.current?.getApi?.().view;
      if (view) await loadRange(view.activeStart.toISOString(), view.activeEnd.toISOString());
      setToast('Practice deleted');
      setTimeout(() => setToast(''), 1500);
    } catch (err) {
      setErrorMsg(err.message || 'Delete failed');
    }
  }

  return (
    <section className="card">
      <div className="section-head">
        <h2 style={{margin:0}}>Calendar</h2>
        <button
          className="btn small"
          onClick={()=>{
            const now = new Date();
            setMode('create');
            setForm({ id:null, trainee_id:'', start: toLocalInput(now.toISOString()),
                      end: toLocalInput(new Date(now.getTime()+60*60*1000).toISOString()),
                      notes:'', syncGoogle:true });
            setOpen(true);
          }}
        >New practice +</button>
      </div>

      {toast && <div className="toast success">{toast}</div>}
      {errorMsg && <div className="toast error">{errorMsg}</div>}
      {loading && <p>Loading…</p>}

      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        selectable selectMirror dayMaxEvents
        headerToolbar={{ left:'prev,next today', center:'title', right:'timeGridDay,timeGridWeek,dayGridMonth' }}
        events={async (info, success, failure) => {
          try {
            await loadRange(info.startStr, info.endStr);
            success(events);
          } catch (e) { failure(e); }
        }}
        select={onSelect}
        eventClick={onEventClick}
      />

      {open && (
        <Modal title={mode==='create' ? 'Add practice' : 'Edit practice'} onClose={()=>setOpen(false)} width={560}>
          <form onSubmit={onSubmit} className="form-grid two-cols">
            <label className="field">
              <div className="field-head"><span>Athlete</span></div>
              <select className="select" value={form.trainee_id}
                      onChange={(e)=>setForm(f=>({...f, trainee_id:e.target.value}))}>
                <option value="">— Select athlete —</option>
                {athleteOptions.map(a=> <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <label className="field">
              <div className="field-head"><span>Start</span></div>
              <input className="input" type="datetime-local" value={form.start}
                     onChange={(e)=>setForm(f=>({...f, start:e.target.value}))} step={300} required />
            </label>

            <label className="field">
              <div className="field-head"><span>End</span></div>
              <input className="input" type="datetime-local" value={form.end}
                     onChange={(e)=>setForm(f=>({...f, end:e.target.value}))} step={300} />
            </label>

            <label className="field span-cols">
              <div className="field-head"><span>Notes</span></div>
              <textarea className="input" rows={3} value={form.notes}
                        onChange={(e)=>setForm(f=>({...f, notes:e.target.value}))}
                        placeholder="Optional notes…" />
            </label>

            <label className="field span-cols">
              <div className="field-head"><span>Add/Update in Google Calendar (no invite)</span></div>
              <label className="switch">
                <input type="checkbox" checked={!!form.syncGoogle}
                       onChange={(e)=>setForm(f=>({...f, syncGoogle:e.target.checked}))}/>
                <span className="slider" />
              </label>
            </label>

            <div className="form-actions span-cols" style={{justifyContent:'space-between'}}>
              <div>
                {mode==='edit' && (
                  <button type="button" className="btn danger" onClick={onDelete} disabled={saving}>Delete</button>
                )}
              </div>
              <div style={{display:'flex', gap:8}}>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : (mode==='create' ? 'Add' : 'Save')}
                </button>
                <button className="btn ghost" type="button" onClick={()=>setOpen(false)} disabled={saving}>Cancel</button>
              </div>
            </div>
          </form>
          <div className="small" style={{marginTop:8, color:'var(--text-muted)'}}>
            Invitations are sent from the <strong>Messages</strong> tab.
          </div>
        </Modal>
      )}
    </section>
  );
}
