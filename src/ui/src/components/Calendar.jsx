import React, { useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import Modal from './Modal.jsx';

export default function Calendar() {
  const calendarRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [range, setRange] = useState({ start: null, end: null });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ start:'', end:'', location:'', notes:'' });

  async function loadSessions(start, end) {
    const rows = await window.api?.listSessions?.(start.toISOString(), end.toISOString());
    const mapped = (rows||[]).map(r => ({
      id: r.id,
      title: r.location ? `Training @ ${r.location}` : 'Training',
      start: r.start_time,
      end: r.end_time || undefined,
      extendedProps: { session: r }
    }));
    setEvents(mapped);
  }

  function handleDatesSet(arg) {
    setRange({ start: arg.start, end: arg.end });
    loadSessions(arg.start, arg.end);
  }

  async function handleEventClick(info) {
    const id = info?.event?.id;
    if (!id) return;
    if (confirm('Delete this session?')) {
      await window.api?.deleteSession?.(id);
      if (range.start && range.end) loadSessions(range.start, range.end);
    }
  }

  function handleDateSelect(selectionInfo) {
    const toVal = (d)=> {
      const pad=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const start = toVal(selectionInfo.start);
    const end = toVal(selectionInfo.end || selectionInfo.start);
    setForm({ start, end, location:'', notes:'' });
    setModalOpen(true);
  }

  async function saveSession(e) {
    e?.preventDefault?.();
    const startISO = new Date(form.start).toISOString();
    const endISO = form.end ? new Date(form.end).toISOString() : null;
    await window.api?.createSession?.({
      start_time:startISO, end_time:endISO, location:form.location.trim(), notes:form.notes.trim(), status:'planned'
    });
    setModalOpen(false);
    if (range.start && range.end) loadSessions(range.start, range.end);
  }

  /* Top “sticky” toolbar (pure UI) */
  const Toolbar = () => (
    <div className="section-head">
      <div className="h2" style={{margin:0}}>Calendar</div>
      <div style={{display:'flex', gap:8, alignItems:'center'}}>
        <input className="input" placeholder="Search events…" style={{minWidth:240}}/>
        <select className="select" defaultValue="week">
          <option value="month">Month</option>
          <option value="week">Week</option>
          <option value="day">Day</option>
        </select>
        <button className="btn" onClick={()=>{
          const now=new Date(), plus=new Date(now.getTime()+60*60*1000);
          const toVal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          setForm({ start:toVal(now), end:toVal(plus), location:'', notes:'' });
          setModalOpen(true);
        }}>New event</button>
      </div>
    </div>
  );

  return (
    <section className="card">
      <Toolbar/>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{ left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,timeGridDay' }}
        selectable={true}
        selectMirror={true}
        select={handleDateSelect}
        events={events}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        height="74vh"
      />

      {modalOpen && (
        <Modal title="Create Event" onClose={()=>setModalOpen(false)}>
          <form onSubmit={saveSession} className="fc-form" style={{display:'grid', gap:12}}>
            <label>Title
              <input className="input" placeholder="Training" disabled value="Training"/>
            </label>
            <label>Start
              <input className="input" type="datetime-local" value={form.start} onChange={e=>setForm({...form, start:e.target.value})} required/>
            </label>
            <label>End
              <input className="input" type="datetime-local" value={form.end} onChange={e=>setForm({...form, end:e.target.value})}/>
            </label>
            <label>Location
              <input className="input" value={form.location} onChange={e=>setForm({...form, location:e.target.value})} placeholder="Gym / Park / Address"/>
            </label>
            <label>Notes
              <input className="input" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} placeholder="Optional notes"/>
            </label>
            <div style={{display:'flex', gap:8, marginTop:4}}>
              <button className="btn" type="submit">Save</button>
              <button type="button" className="btn ghost" onClick={()=>setModalOpen(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
