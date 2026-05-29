import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import api from '../api';

const SCOPE_COLORS = { '1': '#e8593c', '2': '#1a7f5a', '3': '#2563eb' };
const SCOPE_LABELS = { '1': 'Scope 1', '2': 'Scope 2', '3': 'Scope 3' };

function StatCard({ label, value, sub, color, to }) {
  const content = (
    <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, padding: '1.25rem', flex: 1, minWidth: 150, cursor: to ? 'pointer' : 'default', transition: 'box-shadow .15s' }}
      onMouseEnter={e => { if (to) e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}>
      <p style={{ fontSize: 12, color: '#888', margin: '0 0 6px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: 30, fontWeight: 700, margin: '0 0 2px', color: color || '#1a1a18', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#aaa', margin: 0, marginTop: 4 }}>{sub}</p>}
    </div>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none', flex: 1, minWidth: 150, display: 'flex' }}>{content}</Link> : content;
}

function StatusBadge({ status }) {
  const colors = {
    pending: ['#fef3c7', '#92400e'], parsing: ['#e0f2fe', '#0c4a6e'],
    review: ['#fef3c7', '#92400e'], approved: ['#dcfce7', '#166534'], failed: ['#fee2e2', '#991b1b'],
  };
  const [bg, text] = colors[status] || ['#f0ede8', '#555'];
  return <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: bg, color: text, fontWeight: 500 }}>{status}</span>;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 500 }}>{label}</p>
        {payload.map(p => (
          <p key={p.name} style={{ margin: 0, color: p.fill }}>{p.name}: {Number(p.value).toLocaleString()} {p.unit || ''}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard/').then(r => setData(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <p style={{ color: '#aaa', fontSize: 14 }}>Loading dashboard…</p>
    </div>
  );
  if (!data) return <p style={{ color: '#c00' }}>Failed to load dashboard.</p>;

  const totalTonnes = data.total_co2e_tonnes;

  const scopeBarData = ['1', '2', '3'].map(s => ({
    name: SCOPE_LABELS[s],
    'CO₂e (t)': parseFloat((data.scope_breakdown[s].co2e_kg / 1000).toFixed(2)),
    color: SCOPE_COLORS[s],
  }));

  const scopePieData = ['1', '2', '3']
    .filter(s => data.scope_breakdown[s].co2e_kg > 0)
    .map(s => ({
      name: SCOPE_LABELS[s],
      value: parseFloat((data.scope_breakdown[s].co2e_kg / 1000).toFixed(2)),
      color: SCOPE_COLORS[s],
    }));

  const statusData = [
    { name: 'Pending', value: data.pending_review, color: '#f59e0b' },
    { name: 'Approved', value: data.approved, color: '#1a7f5a' },
    { name: 'Flagged', value: data.flagged, color: '#e8593c' },
  ].filter(d => d.value > 0);

  return (
    <div>
      <div style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#1a1a18' }}>Dashboard</h1>
          <p style={{ color: '#888', margin: 0, fontSize: 14 }}>{data.tenant.name}</p>
        </div>
        <Link to="/upload" style={{ padding: '9px 18px', background: '#1a7f5a', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>
          + Import data
        </Link>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label="Total CO₂e" value={`${totalTonnes.toLocaleString(undefined, { maximumFractionDigits: 2 })} t`} sub="tonnes CO₂ equivalent" color="#1a7f5a" />
        <StatCard label="Total records" value={data.total_records.toLocaleString()} />
        <StatCard label="Pending review" value={data.pending_review} color={data.pending_review > 0 ? '#d97706' : '#1a1a18'} sub="click to review" to={data.pending_review > 0 ? '/review' : undefined} />
        <StatCard label="Flagged" value={data.flagged} color={data.flagged > 0 ? '#c0392b' : '#1a1a18'} sub="warnings or errors" to={data.flagged > 0 ? '/review?flagged=1' : undefined} />
        <StatCard label="Approved" value={data.approved} color="#1a7f5a" />
      </div>

      {/* Alert banner */}
      {data.pending_review > 0 && (
        <div style={{ background: '#fff8ee', border: '1px solid #fbbf24', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontWeight: 600, margin: '0 0 2px', color: '#92400e' }}>
              {data.pending_review} record{data.pending_review !== 1 ? 's' : ''} awaiting review
            </p>
            <p style={{ fontSize: 13, color: '#b45309', margin: 0 }}>
              {data.flagged > 0 ? `${data.flagged} flagged with warnings or errors — review before approving` : 'Ready for analyst sign-off before sending to auditors'}
            </p>
          </div>
          <Link to="/review" style={{ padding: '8px 18px', background: '#d97706', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
            Review now →
          </Link>
        </div>
      )}

      {/* Charts row */}
      {totalTonnes > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Bar chart */}
          <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#444' }}>CO₂e by scope (tonnes)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={scopeBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#888' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#aaa' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="CO₂e (t)" radius={[5, 5, 0, 0]}>
                  {scopeBarData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, padding: '1.25rem' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#444' }}>Scope distribution</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={scopePieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {scopePieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => [`${v} t`, 'CO₂e']} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: '#555' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Scope breakdown cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        {['1', '2', '3'].map(scope => {
          const s = data.scope_breakdown[scope];
          const tonnes = (s.co2e_kg / 1000);
          const pct = totalTonnes > 0 ? (tonnes / totalTonnes * 100).toFixed(1) : 0;
          const scopeDesc = { '1': 'Direct combustion (fuel)', '2': 'Purchased electricity', '3': 'Value chain & travel' };
          return (
            <div key={scope} style={{ background: '#fff', border: `1px solid #ebe9e3`, borderRadius: 10, padding: '1.25rem', borderTop: `3px solid ${SCOPE_COLORS[scope]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: SCOPE_COLORS[scope] }}>Scope {scope}</span>
                <span style={{ fontSize: 11, color: '#bbb', background: '#f8f6f2', padding: '2px 7px', borderRadius: 8 }}>{pct}%</span>
              </div>
              <p style={{ fontSize: 11, color: '#aaa', margin: '0 0 10px' }}>{scopeDesc[scope]}</p>
              <p style={{ fontSize: 24, fontWeight: 700, margin: '0 0 2px', color: '#1a1a18' }}>
                {tonnes.toLocaleString(undefined, { maximumFractionDigits: 2 })} t
              </p>
              <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 10px' }}>{s.count} records</p>
              <div style={{ height: 4, borderRadius: 2, background: '#f0ede8' }}>
                <div style={{ height: 4, borderRadius: 2, background: SCOPE_COLORS[scope], width: `${pct}%`, transition: 'width .8s ease' }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent batches */}
      <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #ebe9e3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Recent imports</h2>
          <Link to="/batches" style={{ fontSize: 13, color: '#1a7f5a', textDecoration: 'none' }}>View all →</Link>
        </div>
        {data.recent_batches.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 12px' }}>No imports yet</p>
            <Link to="/upload" style={{ padding: '8px 18px', background: '#1a7f5a', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13 }}>Upload your first file</Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f0ede8' }}>
                {['File', 'Source', 'Rows', 'Errors', 'Status', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recent_batches.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #f8f6f2' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>{b.original_filename}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#e8f5ef', color: '#1a7f5a', fontWeight: 500 }}>{b.source_type_display}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#555' }}>{b.row_count}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: b.error_count > 0 ? '#c0392b' : '#aaa' }}>{b.error_count}</td>
                  <td style={{ padding: '10px 16px' }}><StatusBadge status={b.status} /></td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#aaa' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { StatusBadge };
