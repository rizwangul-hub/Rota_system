import React from 'react';
import { X, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';

export default function PlaceholderModal({ module, onClose }) {
  if (!module) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-badge-row">
            <span className="modal-phase-badge">
              <Sparkles size={12} style={{ display: 'inline', marginRight: '4px' }} />
              {module.badge || 'Upcoming Phase'}
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <h3 className="modal-title">{module.title}</h3>
          <p className="modal-description">{module.desc}</p>

          <div className="modal-roadmap-card">
            <div className="roadmap-title">
              <ShieldCheck size={16} color="#38bdf8" />
              Phase Implementation Roadmap
            </div>
            <p className="roadmap-text">
              The Worker Portal is being built strictly phase by phase to ensure 100% security and accuracy.
              This module is scheduled for implementation in <strong>{module.badge}</strong>.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
