import React, { useEffect, useRef } from 'react';

export default function Modal({ title, onClose, children, width = 520 }) {
  const panelRef = useRef(null);
  const titleId = 'modal-title-' + Math.random().toString(36).slice(2);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab') trapFocus(e);
    }
    document.addEventListener('keydown', onKey);

    // Auto-focus first interactive element
    requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });

    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function trapFocus(e) {
    const nodes = panelRef.current?.querySelectorAll(
      'button:not([disabled]), [href], textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onOverlayClick(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  return (
    <div className="modal-overlay" onClick={onOverlayClick}>
      <div
        className="modal-card"
        style={{ width, maxWidth: '94vw' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        ref={panelRef}
      >
        <div className="modal-header">
          <h3 id={titleId} className="h3" style={{ margin: 0, color: '#fff' }}>{title}</h3>
          <button
            className="icon-btn"
            aria-label="Close modal"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}
