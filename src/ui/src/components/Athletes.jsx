import React, { useEffect, useState } from 'react';

export default function Athletes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    status: 'active'
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await window.api?.listTrainees?.();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!form.first_name.trim()) return alert('שם פרטי חובה');
    await window.api?.createTrainee?.(form);
    setForm({ first_name:'', last_name:'', email:'', phone:'', status:'active' });
    load();
  }

  async function updateStatus(id, status) {
    await window.api?.updateTrainee?.(id, { status });
    load();
  }

  async function remove(id) {
    if (!confirm('למחוק מתאמן/ת?')) return;
    await window.api?.deleteTrainee?.(id);
    load();
  }

  return (
    <section className="card">
      <h2>Athletes</h2>

      <div className="inputs" style={{marginBottom:12}}>
        <input placeholder="First name" value={form.first_name} onChange={e=>setForm({...form, first_name:e.target.value})}/>
        <input placeholder="Last name" value={form.last_name} onChange={e=>setForm({...form, last_name:e.target.value})}/>
        <input placeholder="Email" type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})}/>
        <input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})}/>
        <select value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>
          <option value="active">פעיל</option>
          <option value="invited">שוגר זימון</option>
          <option value="inactive">לא פעיל</option>
        </select>
      </div>
      <button className="btn" onClick={create}>הוסף/י מתאמן/ת</button>

      <div style={{height:12}}/>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>שם</th>
              <th>מייל</th>
              <th>טלפון</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '(ללא שם)';
              return (
                <tr key={r.id}>
                  <td>{fullName}</td>
                  <td>{r.email || ''}</td>
                  <td>{r.phone || ''}</td>
                  <td>
                    <select value={r.status} onChange={e=>updateStatus(r.id, e.target.value)}>
                      <option value="active">פעיל</option>
                      <option value="invited">שוגר זימון</option>
                      <option value="inactive">לא פעיל</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn danger" onClick={()=>remove(r.id)}>מחיקה</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
