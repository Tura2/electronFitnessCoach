import React, { useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from './Modal.jsx';

function toIsoLocal(dateStr, timeStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  const [hh,mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, (m-1), d, hh, mm, 0, 0);
  return dt.toISOString();
}
function fromIsoToParts(iso){
  const d = new Date(iso);
  const pad = n=>String(n).padStart(2,'0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

export default function Calendar() {
  const [sessions, setSessions] = useState([]);
  const [trainees, setTrainees] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  // form
  const [athleteId, setAthleteId] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [timeStart, setTimeStart] = useState('09:00');
  const [dateEnd, setDateEnd] = useState('');
  const [timeEnd, setTimeEnd] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [syncGoogle, setSyncGoogle] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    const ss = await window.api?.listSessions?.();
    setSessions(Array.isArray(ss) ? ss : []);
    const ts = await window.api?.listTrainees?.();
    setTrainees(Array.isArray(ts) ? ts : []);
    const auto = await window.api?.getSetting?.('google.syncOnCreate');
    setSyncGoogle(!!auto);
  }

  const nameById = useMemo(() => {
    const m = {};
    for (const t of trainees) {
      const name = `${t.first_name||''} ${t.last_name||''}`.trim() || 'Athlete';
      m[t.id] = name;
    }
    return m;
  }, [trainees]);

  const events = useMemo(() => {
    return sessions.map(s => ({
      id: s.id,
      title: nameById[s.trainee_id] ? `Practice: ${nameById[s.trainee_id]}` : 'Practice',
      start: s.start_time,
      end: s.end_time || undefined
    }));
  }, [sessions, nameById]);

  function openNewPractice(seed){
    const start = seed?.date ?? new Date();
    const end = new Date(start.getTime() + 60*60*1000);
    const ps = fromIsoToParts(start.toISOString());
    const pe = fromIsoToParts(end.toISOString());
    setDateStart(ps.date); setTimeStart(ps.time);
    setDateEnd(pe.date);   setTimeEnd(pe.time);
    setNotes('');
    setAthleteId('');
    setOpen(true);
  }

  async function onSave(e){
    e?.preventDefault?.();
    if (!athleteId) return alert('Please choose an athlete');
    if (!dateStart || !timeStart || !dateEnd || !timeEnd) return alert('Please set start and end');

    const startISO = toIsoLocal(dateStart, timeStart);
    const endISO   = toIsoLocal(dateEnd, timeEnd);
    if (new Date(endISO) <= new Date(startISO)) return alert('End must be after start');

    setSaving(true);
    try {
      const res = await window.api?.createSession?.({
        trainee_id: athleteId,
        start_time: startISO,
        end_time: endISO,
        notes,
        status: 'planned',
        syncGoogle,
      });
      if (!res?.ok) throw new Error(res?.error || 'Failed to create practice');
      setMsg(syncGoogle && res.google && !res.google.ok
        ? `Practice created (Google error: ${res.google.error})`
        : 'Practice created');
      setOpen(false);
      await load();
      setTimeout(()=>setMsg(''), 2500);
    } catch (err) {
      alert(err.message || 'Failed to create practice');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="section-head">
        <h2 style={{margin:0}}>Calendar</h2>
        <button className="btn" onClick={()=>openNewPractice()}>+ New Practice</button>
      </div>

      {msg && <div className="toast success">{msg}</div>}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        height="auto"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        selectable
        select={(arg)=>openNewPractice({ date: arg.start })}
        dateClick={(arg)=>openNewPractice({ date: arg.date })}
        events={events}
      />

      {open && (
        <Modal title="New Practice" onClose={()=>setOpen(false)}>
          <form className="form-grid two-cols" onSubmit={onSave}>
            {/* Athlete dropdown (names only) */}
            <label className="field">
              <div className="field-head"><span>Athlete</span></div>
              <select
                className="select"
                value={athleteId}
                onChange={(e)=>setAthleteId(e.target.value)}
                required
              >
                <option value="">Select athlete…</option>
                {trainees.map(t=>{
                  const name = `${t.first_name||''} ${t.last_name||''}`.trim() || 'Athlete';
                  return <option key={t.id} value={t.id}>{name}</option>;
                })}
              </select>
            </label>

            {/* Notes */}
            <label className="field">
              <div className="field-head">
                <span>Notes</span><span className="help">Optional</span>
              </div>
              <textarea
                className="input"
                rows={4}
                placeholder="Any details for this practice…"
                value={notes}
                onChange={e=>setNotes(e.target.value)}
              />
            </label>

            {/* Start date/time */}
            <label className="field">
              <div className="field-head"><span>Start date</span></div>
              <input className="input" type="date" value={dateStart} onChange={e=>setDateStart(e.target.value)} />
            </label>
            <label className="field">
              <div className="field-head"><span>Start time</span></div>
              <input className="input" type="time" value={timeStart} onChange={e=>setTimeStart(e.target.value)} />
            </label>

            {/* End date/time */}
            <label className="field">
              <div className="field-head"><span>End date</span></div>
              <input className="input" type="date" value={dateEnd} onChange={e=>setDateEnd(e.target.value)} />
            </label>
            <label className="field">
              <div className="field-head"><span>End time</span></div>
              <input className="input" type="time" value={timeEnd} onChange={e=>setTimeEnd(e.target.value)} />
            </label>

            {/* Google toggle */}
            <div className="field">
              <div className="field-head"><span>Add to Google Calendar</span></div>
              <label className="switch">
                <input type="checkbox" checked={syncGoogle} onChange={(e)=>setSyncGoogle(e.target.checked)} />
                <span className="slider" />
              </label>
              <div className="small" style={{marginTop:6, color:'var(--text-muted)'}}>
                First time will ask you to connect your Google account.
              </div>
            </div>

            <div className="form-actions span-cols">
              <button className="btn" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create'}
              </button>
              <button className="btn ghost" type="button" onClick={()=>setOpen(false)} disabled={saving}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
