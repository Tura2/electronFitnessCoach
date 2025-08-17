import React from 'react';

export default function Sidebar({ active, onSelect, tabs }) {
  return (
    <nav>
      {tabs.map(t => (
        <button
          key={t}
          className={`tab-btn ${active === t ? 'active' : ''}`}
          onClick={() => onSelect(t)}
        >
          {t}
        </button>
      ))}
    </nav>
  );
}
