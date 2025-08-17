import React, { useEffect, useState } from 'react';
import Modal from './Modal.jsx';

function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay()+6)%7; // Monday=0
  x.setHours(0,0,0,0); x.setDate(x.getDate()-day);
  return x;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s); e.setDate(e.getDate()+7); return e;
}

export default function Invites() {
  const [range, setRange] = useState({ start: startOfWeek(new Date()), end: endOfWeek(new Date()) });
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // delete modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [target, setTarget] = useState(null);

  async function load() {
    const data = await window.api.listInvitesWeek(range.start.toISOString(), range.end.toISOString());
    setRows(Array.isArray(data) ? data : []);
  }
  useEffect(()=>{ load(); }, [range.start]);

  async function sendGoogle(id){
    setBusy(true);
    const r = await window.api.sendInviteGoogle(id);
    setMsg(r.ok ? 'Google invite created' : `Error: ${r.error}`);
    await load(); setBusy(false);
    setTimeout(()=>setMsg(''), 2500);
  }
  async function sendAllGoogle(){
    setBusy(true);
    const res = await window.api.sendAllInvitesGoogle(range.start.toISOString(), range.end.toISOString());
    const ok = res.filter(x=>x.ok).length; setMsg(`Created ${ok}/${res.length} Google events`);
    await load(); setBusy(false);
    setTimeout(()=>setMsg(''), 2500);
  }

  function askDelete(row){ setTarget(row); setConfirmOpen(true); }
  async function confirmDelete(){
    if (!target) return;
    setBusy(true);
    try {
      const r = await window.api.deleteSession(target.id);
      if (!r?.ok) throw new Error(r?.error || 'Failed');
      setMsg('Practice deleted');
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setConfirmOpen(false);
      setTarget(null);
      await load();
      setBusy(false);
      setTimeout(()=>setMsg(''), 2500);
    }
  }

  return (
    <section className="card">
      <div className="section-head">
        <h2 style={{margin:0}}>Weekly Invites</h2>
        <div style={{display:'flex', gap:8}}>
          <button className="btn" onClick={sendAllGoogle} disabled={busy}>Send all (Google)</button>
        </div>
      </div>

      {msg && <div className="toast success">{msg}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Athlete</th>
            <th>Email</th>
            <th>Status</th>
            <th style={{width:280}}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const name = `${r.first_name||''} ${r.last_name||''}`.trim() || '—';
            const dt = new Date(r.start_time).toLocaleString();
            const status = r.status || 'planned';
            return (
              <tr key={r.id}>
                <td>{dt}</td>
                <td>{name}</td>
                <td>{r.email || '—'}</td>
                <td>{status}</td>
                <td>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    <button className="btn" onClick={()=>sendGoogle(r.id)} disabled={!r.email || busy}>
                      Send (Google)
                    </button>
                    <button className="btn danger" onClick={()=>askDelete(r)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={5} style={{textAlign:'center', color:'#64748b'}}>No sessions in this week</td></tr>}
        </tbody>
      </table>

      {/* Confirm delete modal */}
      {confirmOpen && target && (
        <Modal title="Delete practice?" onClose={()=>setConfirmOpen(false)}>
          <div className="form-grid">
            <div className="toast error">
              This will permanently remove the practice from this app.
            </div>
            <div>
              <div><b>Athlete:</b> {`${target.first_name||''} ${target.last_name||''}`.trim() || '—'}</div>
              <div><b>When:</b> {new Date(target.start_time).toLocaleString()}</div>
            </div>
            <div className="form-actions" style={{justifyContent:'flex-end'}}>
              <button className="btn danger" onClick={confirmDelete} disabled={busy}>Yes, delete</button>
              <button className="btn ghost" onClick={()=>setConfirmOpen(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
