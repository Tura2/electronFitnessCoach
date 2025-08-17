import React, { useEffect, useMemo, useState, useRef } from 'react';
import Modal from './Modal.jsx';

const emptyForm = { first_name:'', last_name:'', email:'', phone:'' };

export default function Athletes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // מצב מודאל
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('add'); // 'add' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      setLoading(true);
      const data = await window.api?.listTrainees?.();
      setRows(Array.isArray(data) ? data : []);
      setErrorMsg('');
    } catch {
      setErrorMsg('שגיאה בטעינת מתאמנים');
    } finally { setLoading(false); }
  }

  // ולידציה
  function validate(values){
    const errs = {};
    if (!values.first_name?.trim()) errs.first_name = 'שם פרטי חובה';
    if (values.email?.trim()){
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim());
      if (!ok) errs.email = 'כתובת מייל לא תקינה';
    }
    if (values.phone?.trim()){
      const digits = values.phone.replace(/[^\d]/g,'');
      if (digits.length && digits.length < 7) errs.phone = 'מספר קצר מדי';
    }
    return errs;
  }
  const [touched, setTouched] = useState({});
  const errs = useMemo(()=>validate(form), [form]);
  const isValid = Object.keys(errs).length === 0;

  function onChange(field, val){ setForm(prev => ({ ...prev, [field]: val })); }

  function openAdd(){
    setMode('add'); setForm(emptyForm); setEditId(null); setTouched({}); setOpen(true);
  }
  function openEdit(r){
    setMode('edit');
    setForm({
      first_name: r.first_name || '',
      last_name:  r.last_name  || '',
      email:      r.email      || '',
      phone:      r.phone      || ''
    });
    setEditId(r.id);
    setTouched({});
    setOpen(true);
  }
  function closeModal(){
    if (saving) return;
    setOpen(false);
    setTimeout(()=>{ setForm(emptyForm); setEditId(null); setTouched({}); }, 120);
  }

  async function onSubmit(e){
  e?.preventDefault?.();
  setTouched({ first_name:true, email:true, phone:true, last_name:true });
  if (!isValid) return;

  setSaving(true);
  try {
    const payload = trimmed(form);
    if (mode === 'add'){
      const res = await window.api?.createTrainee?.(payload);
      if (!res?.ok) throw new Error(res?.error || 'שגיאה בהוספה');
      setToast('נוסף בהצלחה');
    } else {
      const res = await window.api?.updateTrainee?.(editId, payload);
      if (!res?.ok) throw new Error(res?.error || 'שגיאה בעדכון');
      setToast('עודכן בהצלחה');
    }
    closeModal();
    load();
    setTimeout(()=>setToast(''), 2000);
  } catch (err) {
    setErrorMsg(err.message || 'תקלה בשמירה');
  } finally {
    setSaving(false);
  }
}
  async function onDelete(id){
    if (!confirm('למחוק מתאמן/ת?')) return;
    try {
      const res = await window.api?.deleteTrainee?.(id);
      if (!res?.ok) throw new Error(res?.error || 'שגיאה במחיקה');
      setToast('נמחק');
      load();
      setTimeout(()=>setToast(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'תקלה במחיקה');
    }
  }

  // Ctrl/Cmd+S לשמירה בתוך מודאל
  useEffect(() => {
    function onKey(e){
      if (!open) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
        e.preventDefault(); onSubmit(e);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, form, isValid]);

  const Table = useMemo(() => (
    <table className="table">
      <thead>
        <tr>
          <th>שם</th>
          <th>מייל</th>
          <th>טלפון</th>
          <th style={{width:200}}>פעולות</th>
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
                <div style={{display:'flex', gap:8}}>
                  <button className="btn" onClick={()=>openEdit(r)}>עריכה</button>
                  <button className="btn danger" onClick={()=>onDelete(r.id)}>מחיקה</button>
                </div>
              </td>
            </tr>
          );
        })}
        {!rows.length && !loading && (
          <tr><td colSpan={4} style={{textAlign:'center', color:'#64748b'}}>אין מתאמנים עדיין</td></tr>
        )}
      </tbody>
    </table>
  ), [rows, loading]);

  return (
    <section className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h2 style={{margin:0}}>Athletes</h2>
        <button className="btn" onClick={openAdd}>+ הוספה</button>
      </div>

      {toast && <div className="toast success">{toast}</div>}
      {errorMsg && <div className="toast error">{errorMsg}</div>}

      {loading ? <p>Loading…</p> : Table}

      {open && (
        <Modal title={mode==='add' ? 'הוספת מתאמן/ת' : 'עריכת מתאמן/ת'} onClose={closeModal}>
          <form onSubmit={onSubmit} className="form-grid two-cols">
            <Field
              label="שם פרטי"
              error={touched.first_name ? errs.first_name : ''}
            >
              <input
                ref={firstInputRef}
                placeholder="לדוגמה: איתן"
                autoComplete="given-name"
                value={form.first_name}
                onChange={e=>onChange('first_name', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, first_name:true}))}
                required
              />
            </Field>

            <Field label="שם משפחה">
              <input
                placeholder="אופציונלי"
                autoComplete="family-name"
                value={form.last_name}
                onChange={e=>onChange('last_name', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, last_name:true}))}
              />
            </Field>

            <Field
              label="מייל"
              help="לא חובה, משמש לזימונים"
              error={touched.email ? errs.email : ''}
            >
              <input
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                value={form.email}
                onChange={e=>onChange('email', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, email:true}))}
              />
            </Field>

            <Field
              label="טלפון"
              help="לא חובה"
              error={touched.phone ? errs.phone : ''}
            >
              <input
                inputMode="tel"
                placeholder="050-1234567"
                autoComplete="tel"
                value={form.phone}
                onChange={e=>onChange('phone', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, phone:true}))}
              />
            </Field>

            <div className="form-actions span-cols">
              <button className="btn" type="submit" disabled={!isValid || saving}>
                {saving ? 'שומר…' : (mode === 'add' ? 'שמור/י' : 'עדכן/י')}
              </button>
              <button className="btn ghost" type="button" onClick={closeModal} disabled={saving}>ביטול</button>
            </div>
          </form>
        </Modal>
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
