import React from 'react';
import { IconCalendar, IconUsers, IconMail, IconClock, IconSettings } from './icons.jsx';

export default function Sidebar({ active, onSelect, tabs }) {
  const map = {
    Calendar: <IconCalendar className="nav-icon" />,
    Athletes: <IconUsers className="nav-icon" />,
    Messages: <IconMail className="nav-icon" />,
    History:  <IconClock className="nav-icon" />,
    Settings: <IconSettings className="nav-icon" />,
  };

  const linkedInUrl = 'https://www.linkedin.com/in/offir-tura/'; // ← עדכן אם צריך

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">🏋️‍♀️</div>
        <span>Fitness Coach</span>
      </div>

      <nav className="nav-list" aria-label="Main">
        {tabs.map((t) => {
          const isActive = active === t;
          return (
            <button
              key={t}
              type="button"
              className={`nav-btn ${isActive ? 'active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(t)}
            >
              {map[t]}
              <span className="nav-label">{t}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <a
          href={linkedInUrl}
          className="footer-link"
          onClick={(e) => {
            e.preventDefault();
            if (window.api?.openExternal) {
              window.api.openExternal(linkedInUrl);
            } else {
              window.open(linkedInUrl, '_blank', 'noopener,noreferrer');
            }
          }}
          title="Open LinkedIn"
        >
          <small>Designed and developed by Offir Tura ©</small>
        </a>
      </div>
    </aside>
  );
}
