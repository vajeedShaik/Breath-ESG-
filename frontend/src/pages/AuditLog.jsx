import { useEffect, useState } from 'react';
import api from '../api';

const EVENT_COLORS = {
  batch_uploaded:    '#e0f2fe',
  batch_parsed:      '#dcfce7',
  batch_failed:      '#fee2e2',
  record_approved:   '#dcfce7',
  record_rejected:   '#fee2e2',
  record_edited:     '#ede9fe',
  batch_approved:    '#dcfce7',
  record_unlocked:   '#fef3c7',
};

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/audit/').then(r => setEvents(r.data.results || r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Audit log</h1>
        <p style={{ color: '#888', margin: 0, fontSize: 14 }}>Immutable record of all analyst actions and system events</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, overflow: 'hidden' }}>
        {loading && <p style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</p>}
        {!loading && events.length === 0 && (
          <p style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>No audit events yet.</p>
        )}
        {events.map((ev, i) => (
          <div key={ev.id} style={{ padding: '12px 20px', borderBottom: i < events.length - 1 ? '1px solid #f8f6f2' : 'none', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: EVENT_COLORS[ev.event_type] || '#ddd', marginTop: 5, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>{ev.event_type_display}</span>
                <span style={{ fontSize: 11, color: '#bbb' }}>{new Date(ev.created_at).toLocaleString()}</span>
              </div>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                {ev.actor_name}
                {ev.detail && Object.keys(ev.detail).length > 0 && (
                  <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 11, color: '#aaa' }}>
                    {JSON.stringify(ev.detail).slice(0, 120)}
                  </span>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
