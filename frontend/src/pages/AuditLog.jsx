import { useEffect, useState } from 'react';
import api from '../api';

const EVENT_META = {
  batch_uploaded:  { color:'#2563eb', bg:'#eff6ff', icon:'↑', label:'Batch uploaded' },
  batch_parsed:    { color:'#1a7f5a', bg:'#e8f5ef', icon:'✓', label:'Batch parsed' },
  batch_failed:    { color:'#c0392b', bg:'#fee2e2', icon:'✕', label:'Parse failed' },
  record_approved: { color:'#1a7f5a', bg:'#e8f5ef', icon:'✓', label:'Record approved' },
  record_rejected: { color:'#c0392b', bg:'#fee2e2', icon:'✕', label:'Record rejected' },
  record_edited:   { color:'#7c3aed', bg:'#ede9fe', icon:'✎', label:'Record edited' },
  batch_approved:  { color:'#1a7f5a', bg:'#dcfce7', icon:'🔒', label:'Batch approved & locked' },
  record_unlocked: { color:'#d97706', bg:'#fef3c7', icon:'🔓', label:'Record unlocked' },
};

function DetailPanel({ detail }) {
  if (!detail || Object.keys(detail).length === 0) return null;
  // Show before/after diff for edits
  if (detail.before && detail.after) {
    const changed = Object.keys(detail.after).filter(k =>
      JSON.stringify(detail.before[k]) !== JSON.stringify(detail.after[k]) &&
      !['updated_at','status','reviewed_at','reviewed_by'].includes(k)
    );
    if (changed.length === 0) return null;
    return (
      <div style={{ marginTop:8, padding:'8px 10px', background:'#f8f7f4', borderRadius:6, fontSize:11, fontFamily:'monospace' }}>
        {changed.map(k => (
          <div key={k} style={{ marginBottom:3 }}>
            <span style={{ color:'#888' }}>{k}:</span>{' '}
            <span style={{ color:'#c0392b', textDecoration:'line-through' }}>{JSON.stringify(detail.before[k])}</span>
            {' → '}
            <span style={{ color:'#1a7f5a' }}>{JSON.stringify(detail.after[k])}</span>
          </div>
        ))}
      </div>
    );
  }
  const safeDetail = { ...detail };
  delete safeDetail.before; delete safeDetail.after;
  if (Object.keys(safeDetail).length === 0) return null;
  return (
    <p style={{ margin:'4px 0 0', fontSize:12, color:'#aaa', fontFamily:'monospace' }}>
      {JSON.stringify(safeDetail).slice(0, 200)}
    </p>
  );
}

export default function AuditLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    api.get('/audit/').then(r => setEvents(r.data.results || r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = typeFilter ? events.filter(e => e.event_type === typeFilter) : events;

  return (
    <div>
      <div style={{ marginBottom:'1.75rem' }}>
        <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 4px' }}>Audit log</h1>
        <p style={{ color:'#888', margin:0, fontSize:14 }}>
          Immutable record of all system events and analyst actions — append-only, never deleted
        </p>
      </div>

      {/* Filter by event type */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <span style={{ fontSize:13, color:'#888', alignSelf:'center' }}>Filter:</span>
        {[['', 'All events'], ['record_approved','Approvals'], ['record_edited','Edits'], ['record_rejected','Rejections'], ['batch_approved','Batch locks'], ['batch_failed','Failures']].map(([val, label]) => (
          <button key={val} onClick={() => setTypeFilter(val)}
            style={{ padding:'5px 12px', borderRadius:7, fontSize:12, cursor:'pointer', border: typeFilter === val ? '2px solid #1a7f5a' : '1px solid #ddd', background: typeFilter === val ? '#e8f5ef' : '#fff', color: typeFilter === val ? '#1a7f5a' : '#555', fontWeight: typeFilter === val ? 600 : 400 }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid #ebe9e3', borderRadius:10, overflow:'hidden' }}>
        {loading && <p style={{ padding:'3rem', textAlign:'center', color:'#aaa' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <p style={{ padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>No audit events yet.</p>
        )}
        {filtered.map((ev, i) => {
          const meta = EVENT_META[ev.event_type] || { color:'#888', bg:'#f0ede8', icon:'·', label: ev.event_type };
          return (
            <div key={ev.id} style={{
              padding:'14px 20px', borderBottom: i < filtered.length - 1 ? '1px solid #f8f6f2' : 'none',
              display:'flex', gap:14, alignItems:'flex-start',
            }}>
              {/* Icon */}
              <div style={{ width:30, height:30, borderRadius:'50%', background:meta.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:13, color:meta.color, fontWeight:700 }}>
                {meta.icon}
              </div>
              {/* Content */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, flexWrap:'wrap' }}>
                  <div>
                    <span style={{ fontSize:13, fontWeight:600, color:meta.color }}>{meta.label}</span>
                    <span style={{ fontSize:13, color:'#888', marginLeft:8 }}>by <strong style={{ color:'#444' }}>{ev.actor_name}</strong></span>
                  </div>
                  <span style={{ fontSize:11, color:'#bbb', whiteSpace:'nowrap' }}>
                    {new Date(ev.created_at).toLocaleString([], { dateStyle:'medium', timeStyle:'short' })}
                  </span>
                </div>
                <DetailPanel detail={ev.detail} />
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 0 && (
        <p style={{ fontSize:12, color:'#bbb', marginTop:12, textAlign:'center' }}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''} — audit log is read-only and cannot be modified
        </p>
      )}
    </div>
  );
}
