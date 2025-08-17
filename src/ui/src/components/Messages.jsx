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
  const [showUnsentOnly, setShowUnsentOnly] = useState(false);

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
    setMsg(r.ok ? 'Invite created in Google Calendar' : `Error: ${r.error}`);
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

  const view = showUnsentOnly ? rows.filter(r => (r.status || 'planned') !== 'sent') : rows;

  return (
    <section className="card">
      <div className="section-head">
        <h2 style={{margin:0}}>Weekly Invites</h2>
        <div style={{display:'flex', gap:8, alignItems:'center'}}>
          <label className="field" style={{margin:0}}>
            <div className="field-head">
              <span>Show unsent only</span>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={showUnsentOnly}
                onChange={(e)=>setShowUnsentOnly(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </label>
          <button className="btn" onClick={sendAllGoogle} disabled={busy || view.length === 0}>
            Send all (Google)
          </button>
        </div>
      </div>

      {msg && <div className="toast success">{msg}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Date & Time</th>
            <th>Athlete</th>
            <th>Email</th>
            <th>Invite</th>
            <th style={{width:320}}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {view.map(r => {
            const name = `${r.first_name||''} ${r.last_name||''}`.trim() || '—';
            const dt = new Date(r.start_time).toLocaleString();
            const status = (r.status || 'planned').toLowerCase();
            const isSent = status === 'sent';

            return (
              <tr key={r.id}>
                <td>{dt}</td>
                <td>{name}</td>
                <td>{r.email || '—'}</td>
                <td>
                  {isSent ? (
                    <span className="badge badge-green">Sent</span>
                  ) : (
                    <span className="badge badge-gray">Not sent</span>
                  )}
                </td>
                <td>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                    <button
                      className="btn"
                      onClick={()=>sendGoogle(r.id)}
                      disabled={busy || !r.email}
                      title={r.email ? '' : 'No email on athlete'}
                    >
                      {isSent ? 'Resend (Google)' : 'Send (Google)'}
                    </button>
                    <button className="btn danger" onClick={()=>askDelete(r)} disabled={busy}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {!view.length && (
            <tr><td colSpan={5} style={{textAlign:'center', color:'#64748b'}}>No sessions to show</td></tr>
          )}
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
