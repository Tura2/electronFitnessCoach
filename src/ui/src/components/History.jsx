import React, { useEffect, useState } from 'react';

function fmtDate(d) { return new Date(d).toLocaleDateString(); }
function fmtTime(d) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function startOfMonth(d = new Date()) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfToday() { const x = new Date(); x.setHours(23,59,59,999); return x; }
function toInputDate(d) { return new Date(d).toISOString().slice(0,10); }

export default function History() {
  const [start, setStart] = useState(toInputDate(startOfMonth()));
  const [end, setEnd] = useState(toInputDate(endOfToday()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const data = await window.api?.historyList?.(start, end);
      if (Array.isArray(data)) setRows(data);
      else setErr(data?.error || 'Failed to load history');
    } catch (e) {
      setErr('Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* load on first render */ }, []);

  function onSearch(e) {
    e?.preventDefault?.();
    load();
  }

  // total participants across listed sessions (sum of counts)
  const totalParticipants = rows.reduce((a, r) => a + (Number(r.participants) || 0), 0);

  return (
    <section className="card">
      <div className="section-head">
        <h2 style={{margin:0}}>History</h2>
        <form onSubmit={onSearch} style={{display:'flex', gap:8, alignItems:'center'}}>
          <label className="small">From
            <input className="input" type="date" value={start} onChange={e=>setStart(e.target.value)} />
          </label>
          <label className="small">To
            <input className="input" type="date" value={end} onChange={e=>setEnd(e.target.value)} />
          </label>
          <button className="btn small" type="submit" disabled={loading}>Search</button>
        </form>
      </div>

      {err && <div className="toast error">{err}</div>}

      <div className="small" style={{marginBottom:12}}>
        Showing <b>{rows.length}</b> sent sessions · Participants total: <b>{totalParticipants}</b>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Location</th>
            <th>Participants</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={4}>Loading…</td></tr>}

          {!loading && rows.map(r => (
            <tr key={r.id}>
              <td>{fmtDate(r.start_time)}</td>
              <td>{fmtTime(r.start_time)}</td>
              <td>{r.location || '—'}</td>
              <td>{r.participants || 0}</td>
            </tr>
          ))}

          {!loading && !rows.length && (
            <tr><td colSpan={4} style={{textAlign:'center', color:'#64748b'}}>No sent sessions for the selected range</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
