import React from 'react';

export default function StyleGuide(){
  return (
    <div className="card" style={{marginTop:16}}>
      <div className="h2" style={{marginTop:0}}>UI Kit & Style Guide</div>

      <section style={{marginTop:12}}>
        <div className="h3">Color tokens</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(6, minmax(100px,1fr))', gap:12, marginTop:8}}>
          {[
            ['Primary', 'var(--primary-600)'],
            ['Hover', 'var(--primary-600-hover)'],
            ['Light', 'var(--primary-50)'],
            ['Accent', 'var(--accent-500)'],
            ['Success','var(--success)'],
            ['Danger','var(--danger)'],
          ].map(([label, varname])=>(
            <div key={label} style={{border:'1px solid var(--border)', borderRadius:'12px', overflow:'hidden'}}>
              <div style={{height:48, background:`${varname}`}}/>
              <div style={{padding:8}} className="small">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{marginTop:16}}>
        <div className="h3">Buttons</div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:8}}>
          <button className="btn">Primary</button>
          <button className="btn" disabled>Disabled</button>
          <button className="btn ghost">Ghost</button>
          <button className="btn success">Success</button>
          <button className="btn danger">Danger</button>
          <button className="btn small">Small</button>
        </div>
      </section>

      <section style={{marginTop:16}}>
        <div className="h3">Inputs</div>
        <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:8}}>
          <input className="input" placeholder="Text input"/>
          <select className="select"><option>Option</option></select>
        </div>
      </section>

      <section style={{marginTop:16}}>
        <div className="h3">Data</div>
        <table className="table" style={{marginTop:8}}>
          <thead><tr><th>Header</th><th>Header</th></tr></thead>
          <tbody><tr><td>Cell</td><td>Cell</td></tr></tbody>
        </table>
      </section>

      <section style={{marginTop:16}}>
        <div className="h3">States</div>
        <p className="small">Empty: “No events yet — create your first meeting.”</p>
        <p className="small">Conflict tip: “This overlaps Alex’s 15:00–15:30. Try 15:30?”</p>
        <p className="small">Invite: “Invites on their way. We’ll notify you as guests respond.”</p>
      </section>
    </div>
  );
}
