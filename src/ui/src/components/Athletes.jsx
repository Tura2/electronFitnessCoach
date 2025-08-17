// src/ui/src/components/Athletes.jsx
import React, { useEffect, useMemo, useState, useRef } from 'react';
import Modal from './Modal.jsx';

const emptyForm = { first_name:'', last_name:'', email:'', phone:'' };

export default function Athletes() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Add/Edit modal state
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('add'); // 'add' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const firstInputRef = useRef(null);

  // Delete confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      setLoading(true);
      const data = await window.api?.listTrainees?.();
      setRows(Array.isArray(data) ? data : []);
      setErrorMsg('');
    } catch {
      setErrorMsg('Failed to load athletes');
    } finally { setLoading(false); }
  }

  // Focus first input when modal opens
  useEffect(() => {
    if (open) setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open]);

  // Helpers
  function trimmed(obj){
    const o = {};
    for (const [k,v] of Object.entries(obj)) o[k] = typeof v === 'string' ? v.trim() : v;
    return o;
  }

  // Validation
  function validate(values){
    const errs = {};
    if (!values.first_name?.trim()) errs.first_name = 'First name is required';
    if (values.email?.trim()){
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim());
      if (!ok) errs.email = 'Invalid email address';
    }
    if (values.phone?.trim()){
      const digits = values.phone.replace(/[^\d]/g,'');
      if (digits.length && digits.length < 7) errs.phone = 'Phone number is too short';
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
        if (!res?.ok) throw new Error(res?.error || 'Create failed');
        setToast('Athlete added');
      } else {
        const res = await window.api?.updateTrainee?.(editId, payload);
        if (!res?.ok) throw new Error(res?.error || 'Update failed');
        setToast('Athlete updated');
      }
      closeModal();
      load();
      setTimeout(()=>setToast(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function askDelete(row){
    setConfirmTarget(row);
    setConfirmOpen(true);
  }

  async function confirmDelete(){
    if (!confirmTarget) return;
    try {
      const res = await window.api?.deleteTrainee?.(confirmTarget.id);
      if (!res?.ok) throw new Error(res?.error || 'Delete failed');
      setToast('Athlete deleted');
      setConfirmOpen(false);
      setConfirmTarget(null);
      await load();
      setTimeout(()=>setToast(''), 2000);
    } catch (err) {
      setErrorMsg(err.message || 'Delete failed');
    }
  }

  // Ctrl/Cmd+S to save inside modal
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
          <th>Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th style={{width:200}}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const fullName = `${r.first_name || ''} ${r.last_name || ''}`.trim() || '(No name)';
          return (
            <tr key={r.id}>
              <td>{fullName}</td>
              <td>{r.email || ''}</td>
              <td>{r.phone || ''}</td>
              <td>
                <div style={{display:'flex', gap:8}}>
                  <button className="btn" onClick={()=>openEdit(r)}>Edit</button>
                  <button className="btn danger" onClick={()=>askDelete(r)}>Delete</button>
                </div>
              </td>
            </tr>
          );
        })}
        {!rows.length && !loading && (
          <tr><td colSpan={4} style={{textAlign:'center', color:'#64748b'}}>No athletes yet</td></tr>
        )}
      </tbody>
    </table>
  ), [rows, loading]);

  return (
    <section className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h2 style={{margin:0}}>Athletes</h2>
        <button className="btn" onClick={openAdd}>+ Add</button>
      </div>

      {toast && <div className="toast success">{toast}</div>}
      {errorMsg && <div className="toast error">{errorMsg}</div>}

      {loading ? <p>Loading…</p> : Table}

      {/* Add/Edit modal */}
      {open && (
        <Modal title={mode==='add' ? 'Add Athlete' : 'Edit Athlete'} onClose={closeModal}>
          <form onSubmit={onSubmit} className="form-grid two-cols">
            <Field label="First name" error={touched.first_name ? errs.first_name : ''}>
              <input
                ref={firstInputRef}
                className="input"
                placeholder="e.g., Ethan"
                autoComplete="given-name"
                value={form.first_name}
                onChange={e=>onChange('first_name', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, first_name:true}))}
                required
              />
            </Field>

            <Field label="Last name">
              <input
                className="input"
                placeholder="Optional"
                autoComplete="family-name"
                value={form.last_name}
                onChange={e=>onChange('last_name', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, last_name:true}))}
              />
            </Field>

            <Field label="Email" help="Optional, used for invites" error={touched.email ? errs.email : ''}>
              <input
                className="input"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                value={form.email}
                onChange={e=>onChange('email', e.target.value)}
                onBlur={()=>setTouched(t=>({...t, email:true}))}
              />
            </Field>

            <Field label="Phone" help="Optional" error={touched.phone ? errs.phone : ''}>
              <input
                className="input"
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
                {saving ? 'Saving…' : (mode === 'add' ? 'Save' : 'Update')}
              </button>
              <button className="btn ghost" type="button" onClick={closeModal} disabled={saving}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirmation modal (styled) */}
      {confirmOpen && confirmTarget && (
        <Modal title="Delete athlete?" onClose={()=>setConfirmOpen(false)}>
          <div className="form-grid">
            <div className="toast error">
              This will permanently remove the athlete from this app.
            </div>
            <div>
              <div><b>Name:</b> {`${confirmTarget.first_name||''} ${confirmTarget.last_name||''}`.trim() || '—'}</div>
              {confirmTarget.email && <div><b>Email:</b> {confirmTarget.email}</div>}
              {confirmTarget.phone && <div><b>Phone:</b> {confirmTarget.phone}</div>}
              <div className="small" style={{color:'var(--text-muted)', marginTop:6}}>
                Existing practices will no longer have a linked athlete.
              </div>
            </div>
            <div className="form-actions" style={{justifyContent:'flex-end'}}>
              <button className="btn danger" onClick={confirmDelete}>Yes, delete</button>
              <button className="btn ghost" onClick={()=>setConfirmOpen(false)}>Cancel</button>
            </div>
          </div>
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
