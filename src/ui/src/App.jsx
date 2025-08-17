import React, { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Calendar from './components/Calendar.jsx';
import Athletes from './components/Athletes.jsx';
import Messages from './components/Messages.jsx';
import History from './components/History.jsx';
import Settings from './components/Settings.jsx';

const TABS = ['Calendar', 'Athletes', 'Messages', 'History', 'Settings'];

export default function App() {
  const [active, setActive] = useState('Athletes');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">🏋️‍♀️ Fitness Coach</div>
        <Sidebar active={active} onSelect={setActive} tabs={TABS} />
      </aside>

      <main className="content">
        {active === 'Calendar' && <Calendar />}
        {active === 'Athletes' && <Athletes />}
        {active === 'Messages' && <Messages />}
        {active === 'History' && <History />}
        {active === 'Settings' && <Settings />}
      </main>
    </div>
  );
}
