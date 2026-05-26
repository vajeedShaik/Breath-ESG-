import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';

const SCOPE_COLORS = { '1': '#e8593c', '2': '#1a7f5a', '3': '#2563eb' };

function FlagBadge({ flag }) {
  const colors = {
    error:   { bg: '#fee2e2', text: '#991b1b' },
    warning: { bg: '#fef3c7', text: '#92400e' },
    info:    { bg: '#e0f2fe', text: '#0c4a6e' },
  };
  const c = colors[flag.severity] || colors.info;
  return (
    <span style={{ display: 'inline-block', fontSize: 11, padding: '2px 7px', borderRadius: 10, background: c.bg, color: c.text, marginRight: 4, marginBottom: 3 }}>
      {flag.code}: {flag.message}
    </span>
  );
}

function RecordRow({ record, onApprove, onReject, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [noteInput, setNoteInput] = useState(record.analyst_note || '');
  const [saving, setSaving] = useState(false);

  const approve = async () => {
    setSaving(true);
    await onApprove(record.id, noteInput);
    setSaving(false);
  };

  const reject = async () => {
    const note = prompt('Rejection reason (optional):') || '';
    setSaving(true);
    await onReject(record.id, note);
    setSaving(false);
  };

  const statusBadgeStyle = {
    pending:  { bg: '#fef3c7', text: '#92400e' },
    approved: { bg: '#dcfce7', text: '#166534' },
    rejected: { bg: '#fee2e2', text: '#991b1b' },
    edited:   { bg: '#ede9fe', text: '#5b21b6' },
  };
  const sb = statusBadgeStyle[record.status] || statusBadgeStyle.pending;

  return (
    <>
      <tr
        style={{ borderBottom: '1px solid #f8f6f2', cursor: 'pointer', background: expanded ? '#fafaf8' : 'transparent' }}
        onClick={() => setExpanded(e => !e)}
      >
        <td style={{ padding: '10px 14px', fontSize: 12 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: SCOPE_COLORS[record.scope], marginRight: 6 }} />
          <span style={{ fontWeight: 500 }}>Scope {record.scope}</span>
        </td>
        <td style={{ padding: '10px 14px', fontSize: 12, color: '#555' }}>{record.category_display}</td>
        <td style={{ padding: '10px 14px', fontSize: 12 }}>{record.activity_date}</td>
        <td style={{ padding: '10px 14px', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.location || '—'}</td>
        <td style={{ padding: '10px 14px', fontSize: 12 }}>{record.quantity_normalised} {record.normalised_unit}</td>
        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 500 }}>
          {record.co2e_kg ? `${parseFloat(record.co2e_kg).toFixed(2)} kg` : '—'}
        </td>
        <td style={{ padding: '10px 14px' }}>
          {record.flags?.length > 0 && (
            <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: record.has_errors ? '#fee2e2' : '#fef3c7', color: record.has_errors ? '#991b1b' : '#92400e' }}>
              {record.flag_count} flag{record.flag_count !== 1 ? 's' : ''}
            </span>
          )}
        </td>
        <td style={{ padding: '10px 14px' }}>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: sb.bg, color: sb.text, fontWeight: 500 }}>{record.status}</span>
        </td>
        <td style={{ padding: '10px 14px' }}>
          {!record.is_locked && record.status !== 'approved' && (
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              <button onClick={approve} disabled={saving} style={{ padding: '4px 10px', background: '#1a7f5a', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>✓</button>
              <button onClick={reject} disabled={saving} style={{ padding: '4px 10px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>✕</button>
            </div>
          )}
          {record.is_locked && <span style={{ fontSize: 11, color: '#aaa' }}>🔒 locked</span>}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: '#fafaf8' }}>
          <td colSpan={9} style={{ padding: '0 14px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 6 }}>Raw data</p>
                <p style={{ fontSize: 12, margin: '2px 0', fontFamily: 'monospace', color: '#444' }}>
                  {record.raw_quantity} {record.raw_unit} → {record.quantity_normalised} {record.normalised_unit}
                  {record.conversion_factor !== '1.000000' && ` (×${parseFloat(record.conversion_factor).toFixed(4)})`}
                </p>
                {record.raw_description && (
                  <p style={{ fontSize: 12, color: '#777', margin: '4px 0', fontFamily: 'monospace' }}>{record.raw_description}</p>
                )}
                {record.emission_factor_used && (
                  <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>EF: {record.emission_factor_used}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 6 }}>Source</p>
                <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>File: {record.batch_filename}</p>
                <p style={{ fontSize: 12, color: '#555', margin: '2px 0' }}>Row: {record.source_row_id}</p>
              </div>
            </div>
            {record.flags?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#888', marginBottom: 4 }}>Flags</p>
                {record.flags.map((f, i) => <FlagBadge key={i} flag={f} />)}
              </div>
            )}
            {!record.is_locked && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  placeholder="Analyst note (optional)…"
                  onClick={e => e.stopPropagation()}
                  style={{ width: '100%', height: 56, fontSize: 12, padding: 8, border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Review() {
  const [params] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ scope: '', status: 'pending', flagged: '' });
  const batchId = params.get('batch');

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (batchId) q.set('batch', batchId);
    if (filter.scope) q.set('scope', filter.scope);
    if (filter.status) q.set('status', filter.status);
    if (filter.flagged) q.set('flagged', filter.flagged);
    const { data } = await api.get(`/records/?${q}`);
    setRecords(data.results || data);
    setLoading(false);
  }, [batchId, filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id, note) => {
    await api.post(`/records/${id}/approve/`, { note });
    load();
  };

  const handleReject = async (id, note) => {
    await api.post(`/records/${id}/reject/`, { note });
    load();
  };

  const pendingCount = records.filter(r => r.status === 'pending').length;

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Review queue</h1>
          <p style={{ color: '#888', margin: 0, fontSize: 14 }}>
            {loading ? 'Loading…' : `${records.length} records · ${pendingCount} pending`}
          </p>
        </div>
        <button
          onClick={() => { const a = document.createElement('a'); a.href = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api') + '/export/'; a.click(); }}
          style={{ padding: '8px 16px', background: '#fff', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: '#555' }}
        >
          ↓ Export approved CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, background: '#fff' }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="edited">Edited</option>
        </select>
        <select value={filter.scope} onChange={e => setFilter(f => ({ ...f, scope: e.target.value }))}
          style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, background: '#fff' }}>
          <option value="">All scopes</option>
          <option value="1">Scope 1</option>
          <option value="2">Scope 2</option>
          <option value="3">Scope 3</option>
        </select>
        <select value={filter.flagged} onChange={e => setFilter(f => ({ ...f, flagged: e.target.value }))}
          style={{ padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, background: '#fff' }}>
          <option value="">All records</option>
          <option value="1">Flagged only</option>
        </select>
        <button onClick={() => setFilter({ scope: '', status: 'pending', flagged: '' })}
          style={{ padding: '7px 12px', background: '#f0ede8', border: 'none', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: '#555' }}>
          Reset
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ebe9e3', background: '#fafaf8' }}>
                {['Scope', 'Category', 'Date', 'Location', 'Quantity', 'CO₂e', 'Flags', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</td></tr>}
              {!loading && records.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '2rem', textAlign: 'center', color: '#aaa', fontSize: 14 }}>No records match your filters.</td></tr>
              )}
              {records.map(r => (
                <RecordRow key={r.id} record={r} onApprove={handleApprove} onReject={handleReject} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
