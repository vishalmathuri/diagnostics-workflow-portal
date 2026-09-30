import React, { useEffect, useRef, useState } from 'react';

const actions = {
  registered: 'Sample registered',
  processing_started: 'Processing started',
  result_entered: 'Result submitted for review',
  rejected: 'Result rejected',
  result_corrected: 'Result corrected and resubmitted',
  approved: 'Result approved'
};

export default function AuditTimeline({ sample, token, onClose }) {
  const dialog = useRef(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    dialog.current.showModal();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function load() {
      try {
        const response = await fetch(`/api/samples/${sample.id}/audit`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load the audit timeline');
        setEvents(data.events);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [sample.id, token, attempt]);

  return <dialog ref={dialog} className="auditDialog" aria-labelledby="audit-title" onCancel={onClose} onClose={onClose}>
    <div className="auditHeader">
      <div><p className="eyebrow">{sample.code}</p><h2 id="audit-title">Sample audit timeline</h2><p>{sample.test_name} · {sample.specimen_type}</p></div>
      <button className="close" aria-label="Close audit timeline" onClick={onClose} autoFocus>×</button>
    </div>
    <div className="auditBody" aria-busy={loading}>
      {loading && <p role="status">Loading sample activity…</p>}
      {!loading && error && <div role="alert" className="auditError"><p>{error}</p><button onClick={() => setAttempt(x => x + 1)}>Try again</button></div>}
      {!loading && !error && !events.length && <div className="auditEmpty"><h3>No recorded activity yet</h3><p>Older seeded samples may have no activity history. New workflow actions will appear here.</p></div>}
      {!loading && !error && events.length > 0 && <ol className="auditList">
        {events.map(event => <li key={event.id} className={`auditEvent ${event.action}`}>
          <div className="auditMarker" aria-hidden="true"/>
          <div className="auditEventContent">
            <h3>{actions[event.action] || event.action}</h3>
            <p className="auditActor">{event.actor_email} <span>{event.actor_role}</span></p>
            <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
            {event.detail && <p className="auditNote">{event.detail}</p>}
          </div>
        </li>)}
      </ol>}
    </div>
    <div className="auditFooter">Activity is shown from earliest to latest.</div>
  </dialog>;
}
