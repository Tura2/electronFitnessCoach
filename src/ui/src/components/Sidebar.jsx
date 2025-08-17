import React from 'react';  
import { IconCalendar, IconUsers, IconMail, IconClock, IconSettings } from './icons.jsx';

export default function Sidebar({ active, onSelect, tabs }){
  const map = {
    Calendar: <IconCalendar className="nav-icon"/>,
    Athletes: <IconUsers className="nav-icon"/>,
    Invites: <IconMail className="nav-icon"/>,
    History: <IconClock className="nav-icon"/>,
    Settings: <IconSettings className="nav-icon"/>,
  };

  return (
    <div>
      <div className="brand">🏋️‍♀️ <span>Fitness Coach</span></div>
      {tabs.map(t=>(
        <button key={t} className={`nav-btn ${active===t?'active':''}`} onClick={()=>onSelect(t)}>
          {map[t]} <span>{t}</span>
        </button>
      ))}
    </div>
  );
}
