import React, { useEffect, useRef } from 'react';

export default function Modal({ title, onClose, children, width = 520 }) {
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab') trapFocus(e);
    }
    document.addEventListener('keydown', onKey);
    // אוטו-פוקוס לשדה הראשון בטופס
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector(
        'input,select,textarea,button,[tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trapFocus(e) {
    const nodes = panelRef.current?.querySelectorAll(
      'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        <div className="modal-header">
          <h3 style={{margin:0}}>{title}</h3>
          <button className="btn danger" onClick={onClose} aria-label="סגירה">X</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
