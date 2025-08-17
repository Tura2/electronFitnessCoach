import React from 'react';
import StyleGuide from './StyleGuide.jsx';

export default function Settings(){
  return (
    <>
      <section className="card">
        <div className="h2" style={{marginTop:0}}>Settings</div>
        <p className="small">Profile, working hours, time zone, calendar connections, default reminders, accessibility.</p>
      </section>

      <StyleGuide/>
    </>
  );
}
