import React from 'react';

export default function Topbar(){
  return (
    <div className="topbar">
      <div className="h3" style={{marginRight:'auto'}}>Calendar & Invites</div>
      <input className="input" placeholder="Search… (Ctrl/⌘+K)"/>
      <button className="btn ghost small">Share availability</button>
      <button className="btn small">New event</button>
    </div>
  );
}
