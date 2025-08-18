import React, { useEffect, useMemo, useState } from 'react';

function fmtDate(d) { try { return new Date(d).toLocaleDateString(); } catch { return ''; } }
function fmtTime(d) { try { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function startOfMonth(d = new Date()) { const x = new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; }
function endOfToday() { const x = new Date(); x.setHours(23,59,59,999); return x; }
function toInputDate(d) { return new Date(d).toISOString().slice(0,10); }
function dayStartISO(dateStr) { const d = new Date(dateStr); d.setHours(0,0,0,0); return d.toISOString(); }
function dayEndISO(dateStr) { const d = new Date(dateStr); d.setHours(23,59,59,999); return d.toISOString(); }

export default function History() {
  // Filters
  const [start, setStart] = useState(toInputDate(startOfMonth()));
  const [end, setEnd] = useState(toInputDate(endOfToday()));
  const [q, setQ] = useState('');

  // Data
  const [rows, setRows] = useState([]);
  const [trainees, setTrainees] = useState([]);

  // UI
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null); // deleting

  // Lookup maps for enrichment
  const traineeMap = useMemo(() => {
    const m = new Map();
    for (const t of trainees || []) {
      const name = `${t.first_name || ''} ${t.last_name || ''}`.trim() || 'Unnamed';
      m.set(t.id, { ...t, name });
    }
    return m;
  }, [trainees]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const [list, people] = await Promise.all([
        window.api?.listSessions?.(dayStartISO(start), dayEndISO(end)),
        window.api?.listTrainees?.(),
      ]);
      setTrainees(Array.isArray(people) ? people : []);
      setRows(Array.isArray(list) ? list : []);
      if (!Array.isArray(list)) setErr(list?.error || 'Failed to load sessions');
    } catch (e) {
      setErr('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* initial */ }, []);

  function onSearch(e) { e?.preventDefault?.(); load(); }

  const nowTs = Date.now();
  const filtered = useMemo(() => {
    const normQ = q.trim().toLowerCase();
    const byPast = (r) => {
      const endTs = r.end_time ? new Date(r.end_time).getTime() : new Date(r.start_time).getTime();
      return endTs <= nowTs; // only practices whose time has passed
    };
    const byText = (r) => {
      if (!normQ) return true;
      const tr = traineeMap.get(r.trainee_id);
      const hay = (
        (tr?.name || '') + ' ' + (tr?.email || '') + ' ' + (tr?.phone || '') + ' ' + (r.notes || '')
      ).toLowerCase();
      return hay.includes(normQ);
    };
    const inRange = (r) => {
      const s = new Date(r.start_time).getTime();
      const startTs = new Date(dayStartISO(start)).getTime();
      const endTs = new Date(dayEndISO(end)).getTime();
      return s >= startTs && s <= endTs;
    };

    return (rows || [])
      .filter(inRange)
      .filter(byPast)
      .filter(byText)
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time));
  }, [rows, traineeMap, q, start, end, nowTs]);

  async function onDelete(id) {
    if (!id) return;
    if (!confirm('Delete this practice?\n(Will also remove the Google copy if it exists)')) return;
    try {
      setBusyId(id);
      const res = await window.api?.deleteSession?.(id, true);
      if (!res?.ok) throw new Error(res?.error || 'Failed to delete');
      await load();
    } catch (e) {
      alert(e.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card">
      <div className="section-head" style={{gap: 8, alignItems: 'center'}}>
        <h2 style={{ margin: 0 }}>Practices (Past)</h2>
        <form onSubmit={onSearch} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="small">From
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="small">To
            <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <input
            className="input"
            type="search"
            placeholder="Search athlete / email / phone / notes"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
          <button className="btn small" type="submit" disabled={loading}>Filter</button>
          {q && (
            <button type="button" className="btn small ghost" onClick={() => setQ('')} disabled={loading}>
              Clear
            </button>
          )}
        </form>
      </div>

      {err && <div className="toast error">{err}</div>}

      <div className="small" style={{ marginBottom: 12 }}>
        Showing <b>{filtered.length}</b> past practices from <b>{fmtDate(dayStartISO(start))}</b> to <b>{fmtDate(dayEndISO(end))}</b>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{width: 120}}>Date</th>
            <th style={{width: 90}}>Time</th>
            <th>Athlete</th>
            <th style={{width: 160}}>Phone</th>
            <th style={{width: 100}}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5}>Loading…</td>
            </tr>
          )}

          {!loading && filtered.map((r) => {
            const t = traineeMap.get(r.trainee_id);
            return (
              <tr key={r.id}>
                <td>{fmtDate(r.start_time)}</td>
                <td>{fmtTime(r.start_time)}</td>
                <td>{t?.name || '—'}</td>
                <td>{t?.phone || '—'}</td>
                <td>
                  <button
                    className="btn small danger"
                    onClick={() => onDelete(r.id)}
                    disabled={busyId === r.id}
                    title="Delete practice"
                  >
                    {busyId === r.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            );
          })}

          {!loading && !filtered.length && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#64748b' }}>
                No past practices for the selected range
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
