import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

const SCOPE_COLORS = { '1': '#e8593c', '2': '#1a7f5a', '3': '#2563eb' };
const SCOPE_LABELS = { '1': 'Scope 1 — Direct', '2': 'Scope 2 — Electricity', '3': 'Scope 3 — Value chain' };

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, padding: '1.25rem', flex: 1, minWidth: 160 }}>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 6px', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 600, margin: '0 0 2px', color: color || '#1a1a18' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ color: '#888' }}>Loading…</p>;
  if (!data) return <p style={{ color: '#c00' }}>Failed to load dashboard.</p>;

  const totalTonnes = data.total_co2e_tonnes;

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px', color: '#1a1a18' }}>Dashboard</h1>
        <p style={{ color: '#888', margin: 0, fontSize: 14 }}>{data.tenant.name}</p>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total CO₂e" value={`${totalTonnes.toLocaleString()} t`} sub="tonnes CO₂ equivalent" color="#1a7f5a" />
        <StatCard label="Total records" value={data.total_records.toLocaleString()} />
        <StatCard label="Pending review" value={data.pending_review} color={data.pending_review > 0 ? '#d97706' : undefined} />
        <StatCard label="Flagged" value={data.flagged} color={data.flagged > 0 ? '#c0392b' : undefined} sub="warnings or errors" />
        <StatCard label="Approved" value={data.approved} color="#1a7f5a" />
      </div>

      {/* Scope breakdown */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {['1', '2', '3'].map(scope => {
          const s = data.scope_breakdown[scope];
          const pct = totalTonnes > 0 ? ((s.co2e_kg / 1000) / totalTonnes * 100).toFixed(1) : 0;
          return (
            <div key={scope} style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, padding: '1.25rem', flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: SCOPE_COLORS[scope] }}>{SCOPE_LABELS[scope]}</span>
                <span style={{ fontSize: 11, color: '#aaa' }}>{pct}%</span>
              </div>
              <p style={{ fontSize: 22, fontWeight: 600, margin: '0 0 2px', color: SCOPE_COLORS[scope] }}>
                {(s.co2e_kg / 1000).toFixed(2)} t
              </p>
              <p style={{ fontSize: 12, color: '#aaa', margin: 0 }}>{s.count} records</p>
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: '#f0ede8' }}>
                <div style={{ height: 4, borderRadius: 2, background: SCOPE_COLORS[scope], width: `${pct}%`, transition: 'width .5s' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending review callout */}
      {data.pending_review > 0 && (
        <div style={{ background: '#fff8ee', border: '1px solid #fbbf24', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontWeight: 500, margin: '0 0 2px', color: '#92400e' }}>
              {data.pending_review} records awaiting review
            </p>
            <p style={{ fontSize: 13, color: '#b45309', margin: 0 }}>
              {data.flagged} flagged with warnings or errors
            </p>
          </div>
          <Link to="/review" style={{ padding: '8px 16px', background: '#d97706', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
            Review now
          </Link>
        </div>
      )}

      {/* Recent batches */}
      <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #ebe9e3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Recent imports</h2>
          <Link to="/batches" style={{ fontSize: 13, color: '#1a7f5a', textDecoration: 'none' }}>View all</Link>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f0ede8' }}>
              {['File', 'Source', 'Rows', 'Errors', 'Status', 'Uploaded'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: '#888', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.recent_batches.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: 14 }}>No imports yet. <Link to="/upload" style={{ color: '#1a7f5a' }}>Upload your first file</Link></td></tr>
            )}
            {data.recent_batches.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid #f8f6f2' }}>
                <td style={{ padding: '10px 16px', fontSize: 13, color: '#333', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.original_filename}</td>
                <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#e8f5ef', color: '#1a7f5a', fontWeight: 500 }}>{b.source_type_display}</span></td>
                <td style={{ padding: '10px 16px', fontSize: 13 }}>{b.row_count}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: b.error_count > 0 ? '#c0392b' : '#888' }}>{b.error_count}</td>
                <td style={{ padding: '10px 16px' }}>
                  <StatusBadge status={b.status} />
                </td>
                <td style={{ padding: '10px 16px', fontSize: 12, color: '#aaa' }}>{new Date(b.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    pending: ['#fef3c7', '#92400e'],
    parsing: ['#e0f2fe', '#0c4a6e'],
    review: ['#fef3c7', '#92400e'],
    approved: ['#dcfce7', '#166534'],
    failed: ['#fee2e2', '#991b1b'],
  };
  const [bg, text] = colors[status] || ['#f0ede8', '#555'];
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: bg, color: text, fontWeight: 500 }}>{status}</span>;
}

export { StatusBadge };
