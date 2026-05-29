import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api';

const SCOPE_COLORS = { '1': '#e8593c', '2': '#1a7f5a', '3': '#2563eb' };
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function FlagBadge({ flag }) {
  const colors = { error: ['#fee2e2','#991b1b'], warning: ['#fef3c7','#92400e'], info: ['#e0f2fe','#0c4a6e'] };
  const [bg, text] = colors[flag.severity] || colors.info;
  return (
    <span style={{ display:'inline-block', fontSize:11, padding:'2px 7px', borderRadius:10, background:bg, color:text, marginRight:4, marginBottom:3 }}>
      {flag.code}: {flag.message}
    </span>
  );
}

function EditModal({ record, onSave, onClose }) {
  const [form, setForm] = useState({
    activity_date: record.activity_date || '',
    location: record.location || '',
    quantity_normalised: record.quantity_normalised || '',
    normalised_unit: record.normalised_unit || '',
    co2e_kg: record.co2e_kg || '',
    analyst_note: record.analyst_note || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.patch(`/records/${record.id}/`, form);
      onSave();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Save failed');
    } finally { setSaving(false); }
  };

  const field = (label, key, type = 'text') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#555', marginBottom:5 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{ width:'100%', padding:'8px 10px', border:'1px solid #ddd', borderRadius:7, fontSize:13, boxSizing:'border-box' }} />
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#fff', borderRadius:12, padding:'1.75rem', width:460, boxShadow:'0 8px 40px rgba(0,0,0,0.18)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
          <h2 style={{ fontSize:16, fontWeight:600, margin:0 }}>Edit record</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aaa', lineHeight:1 }}>×</button>
        </div>

        <div style={{ background:'#f8f7f4', borderRadius:8, padding:'10px 12px', marginBottom:16, fontSize:12, color:'#777' }}>
          <strong>Source:</strong> {record.batch_filename} — row {record.source_row_id}<br/>
          <strong>Raw:</strong> {record.raw_quantity} {record.raw_unit}
        </div>

        {field('Activity date', 'activity_date', 'date')}
        {field('Location', 'location')}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {field('Normalised quantity', 'quantity_normalised', 'number')}
          {field('Unit', 'normalised_unit')}
        </div>
        {field('CO₂e (kg)', 'co2e_kg', 'number')}
        <div style={{ marginBottom:14 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#555', marginBottom:5 }}>Analyst note</label>
          <textarea value={form.analyst_note} onChange={e => setForm(f => ({ ...f, analyst_note: e.target.value }))}
            style={{ width:'100%', height:72, padding:'8px 10px', border:'1px solid #ddd', borderRadius:7, fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
        </div>

        {error && <p style={{ color:'#c0392b', fontSize:13, marginBottom:12 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 18px', background:'#f0ede8', border:'none', borderRadius:7, fontSize:13, cursor:'pointer', color:'#555' }}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{ padding:'8px 18px', background:'#1a7f5a', color:'#fff', border:'none', borderRadius:7, fontSize:13, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecordRow({ record, onApprove, onReject, onEdit }) {
  const [expanded, setExpanded] = useState(false);
  const [noteInput, setNoteInput] = useState(record.analyst_note || '');
  const [saving, setSaving] = useState(false);

  const approve = async (e) => {
    e.stopPropagation(); setSaving(true);
    await onApprove(record.id, noteInput);
    setSaving(false);
  };
  const reject = async (e) => {
    e.stopPropagation();
    const note = window.prompt('Rejection reason (optional):') || '';
    setSaving(true);
    await onReject(record.id, note);
    setSaving(false);
  };
  const edit = (e) => { e.stopPropagation(); onEdit(record); };

  const sbColors = {
    pending: ['#fef3c7','#92400e'], approved: ['#dcfce7','#166534'],
    rejected: ['#fee2e2','#991b1b'], edited: ['#ede9fe','#5b21b6'],
  };
  const [sbBg, sbText] = sbColors[record.status] || sbColors.pending;

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)}
        style={{ borderBottom:'1px solid #f8f6f2', cursor:'pointer', background: expanded ? '#fafaf8' : 'transparent' }}>
        <td style={{ padding:'10px 14px', fontSize:12 }}>
          <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', background:SCOPE_COLORS[record.scope], marginRight:6 }} />
          <span style={{ fontWeight:500, color:'#333' }}>S{record.scope}</span>
        </td>
        <td style={{ padding:'10px 14px', fontSize:12, color:'#555' }}>{record.category_display}</td>
        <td style={{ padding:'10px 14px', fontSize:12, color:'#444' }}>{record.activity_date}</td>
        <td style={{ padding:'10px 14px', fontSize:12, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#555' }} title={record.location}>{record.location || '—'}</td>
        <td style={{ padding:'10px 14px', fontSize:12, color:'#444' }}>{parseFloat(record.quantity_normalised).toLocaleString()} {record.normalised_unit}</td>
        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:500, color: record.co2e_kg ? '#1a1a18' : '#ccc' }}>
          {record.co2e_kg ? `${parseFloat(record.co2e_kg).toFixed(1)} kg` : '—'}
        </td>
        <td style={{ padding:'10px 14px' }}>
          {record.flags?.length > 0 && (
            <span style={{ fontSize:11, padding:'2px 7px', borderRadius:10, background: record.has_errors ? '#fee2e2' : '#fef3c7', color: record.has_errors ? '#991b1b' : '#92400e' }}>
              {record.flag_count} flag{record.flag_count !== 1 ? 's' : ''}
            </span>
          )}
        </td>
        <td style={{ padding:'10px 14px' }}>
          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:sbBg, color:sbText, fontWeight:500 }}>{record.status}</span>
        </td>
        <td style={{ padding:'10px 14px' }}>
          {record.is_locked
            ? <span style={{ fontSize:11, color:'#aaa' }}>🔒 locked</span>
            : (
              <div style={{ display:'flex', gap:5 }} onClick={e => e.stopPropagation()}>
                {record.status !== 'approved' && (
                  <button onClick={approve} disabled={saving} title="Approve"
                    style={{ padding:'4px 9px', background:'#1a7f5a', color:'#fff', border:'none', borderRadius:5, fontSize:11, cursor:'pointer' }}>✓</button>
                )}
                <button onClick={edit} disabled={saving} title="Edit"
                  style={{ padding:'4px 9px', background:'#ede9fe', color:'#5b21b6', border:'none', borderRadius:5, fontSize:11, cursor:'pointer' }}>✎</button>
                {record.status !== 'rejected' && (
                  <button onClick={reject} disabled={saving} title="Reject"
                    style={{ padding:'4px 9px', background:'#fee2e2', color:'#991b1b', border:'none', borderRadius:5, fontSize:11, cursor:'pointer' }}>✕</button>
                )}
              </div>
            )
          }
        </td>
      </tr>
      {expanded && (
        <tr style={{ background:'#fafaf8' }}>
          <td colSpan={9} style={{ padding:'0 14px 16px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginTop:12 }}>
              <div>
                <p style={{ fontSize:12, fontWeight:600, color:'#888', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>Raw data</p>
                <p style={{ fontSize:12, margin:'2px 0', fontFamily:'monospace', color:'#444' }}>
                  {record.raw_quantity} {record.raw_unit} → {record.quantity_normalised} {record.normalised_unit}
                  {parseFloat(record.conversion_factor) !== 1 && ` (×${parseFloat(record.conversion_factor).toFixed(4)})`}
                </p>
                {record.raw_description && <p style={{ fontSize:12, color:'#777', margin:'4px 0', fontFamily:'monospace', wordBreak:'break-word' }}>{record.raw_description}</p>}
                {record.emission_factor_used && <p style={{ fontSize:11, color:'#aaa', marginTop:4 }}>EF source: {record.emission_factor_used}</p>}
              </div>
              <div>
                <p style={{ fontSize:12, fontWeight:600, color:'#888', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>Provenance</p>
                <p style={{ fontSize:12, color:'#555', margin:'2px 0' }}>File: <span style={{ fontFamily:'monospace' }}>{record.batch_filename}</span></p>
                <p style={{ fontSize:12, color:'#555', margin:'2px 0' }}>Row ID: <span style={{ fontFamily:'monospace' }}>{record.source_row_id}</span></p>
                {record.period_start && <p style={{ fontSize:12, color:'#555', margin:'2px 0' }}>Period: {record.period_start} → {record.period_end}</p>}
              </div>
            </div>
            {record.flags?.length > 0 && (
              <div style={{ marginTop:12 }}>
                <p style={{ fontSize:12, fontWeight:600, color:'#888', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.04em' }}>Flags</p>
                {record.flags.map((f, i) => <FlagBadge key={i} flag={f} />)}
              </div>
            )}
            {record.analyst_note && (
              <div style={{ marginTop:10, padding:'8px 12px', background:'#ede9fe', borderRadius:6 }}>
                <span style={{ fontSize:12, color:'#5b21b6' }}>Note: {record.analyst_note}</span>
              </div>
            )}
            {!record.is_locked && record.status !== 'approved' && (
              <div style={{ marginTop:12, display:'flex', gap:8, alignItems:'center' }}>
                <input
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  placeholder="Add analyst note before approving…"
                  style={{ flex:1, padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:12 }}
                />
                <button onClick={approve} disabled={saving}
                  style={{ padding:'7px 14px', background:'#1a7f5a', color:'#fff', border:'none', borderRadius:6, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
                  Approve with note
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function Review() {
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    scope: '', status: 'pending',
    flagged: searchParams.get('flagged') || '',
  });
  const [editRecord, setEditRecord] = useState(null);
  const [total, setTotal] = useState(0);
  const batchId = searchParams.get('batch');

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (batchId) q.set('batch', batchId);
    if (filter.scope) q.set('scope', filter.scope);
    if (filter.status) q.set('status', filter.status);
    if (filter.flagged) q.set('flagged', filter.flagged);
    q.set('page_size', 100);
    const { data } = await api.get(`/records/?${q}`);
    const rows = data.results || data;
    setRecords(rows);
    setTotal(data.count || rows.length);
    setLoading(false);
  }, [batchId, filter]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id, note) => { await api.post(`/records/${id}/approve/`, { note }); load(); };
  const handleReject  = async (id, note) => { await api.post(`/records/${id}/reject/`,  { note }); load(); };
  const handleExport  = () => { window.open(`${API_BASE}/export/`, '_blank'); };

  const pendingCount   = records.filter(r => r.status === 'pending').length;
  const approvedCount  = records.filter(r => r.status === 'approved').length;
  const flaggedCount   = records.filter(r => r.flags?.length > 0).length;

  return (
    <div>
      {editRecord && (
        <EditModal record={editRecord} onSave={load} onClose={() => setEditRecord(null)} />
      )}

      <div style={{ marginBottom:'1.5rem', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 4px' }}>Review queue</h1>
          <p style={{ color:'#888', margin:0, fontSize:14 }}>
            {loading ? 'Loading…' : `${total} records · ${pendingCount} pending · ${flaggedCount} flagged · ${approvedCount} approved`}
          </p>
        </div>
        <button onClick={handleExport}
          style={{ padding:'8px 16px', background:'#fff', border:'1px solid #ddd', borderRadius:8, fontSize:13, cursor:'pointer', color:'#555', display:'flex', alignItems:'center', gap:6 }}>
          ↓ Export approved CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap', alignItems:'center' }}>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}
          style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:7, fontSize:13, background:'#fff', color:'#333' }}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="edited">Edited</option>
        </select>
        <select value={filter.scope} onChange={e => setFilter(f => ({ ...f, scope: e.target.value }))}
          style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:7, fontSize:13, background:'#fff', color:'#333' }}>
          <option value="">All scopes</option>
          <option value="1">Scope 1 — Direct</option>
          <option value="2">Scope 2 — Electricity</option>
          <option value="3">Scope 3 — Value chain</option>
        </select>
        <select value={filter.flagged} onChange={e => setFilter(f => ({ ...f, flagged: e.target.value }))}
          style={{ padding:'7px 10px', border:'1px solid #ddd', borderRadius:7, fontSize:13, background:'#fff', color:'#333' }}>
          <option value="">All records</option>
          <option value="1">Flagged only</option>
        </select>
        <button onClick={() => setFilter({ scope:'', status:'pending', flagged:'' })}
          style={{ padding:'7px 12px', background:'#f0ede8', border:'none', borderRadius:7, fontSize:13, cursor:'pointer', color:'#555' }}>
          Reset filters
        </button>
        {batchId && (
          <span style={{ fontSize:12, color:'#888', padding:'4px 10px', background:'#f0ede8', borderRadius:6 }}>
            Filtered to batch · <a href="/review" style={{ color:'#1a7f5a' }}>clear</a>
          </span>
        )}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:16, marginBottom:14, fontSize:12, color:'#888' }}>
        <span>Actions: <strong style={{ color:'#1a7f5a' }}>✓</strong> approve &nbsp; <strong style={{ color:'#5b21b6' }}>✎</strong> edit &nbsp; <strong style={{ color:'#991b1b' }}>✕</strong> reject &nbsp; click row to expand</span>
      </div>

      <div style={{ background:'#fff', border:'1px solid #ebe9e3', borderRadius:10, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #ebe9e3', background:'#fafaf8' }}>
                {['Scope','Category','Date','Location','Quantity','CO₂e','Flags','Status','Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color:'#888', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>Loading records…</td></tr>
              )}
              {!loading && records.length === 0 && (
                <tr><td colSpan={9} style={{ padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
                  No records match your filters.
                </td></tr>
              )}
              {records.map(r => (
                <RecordRow key={r.id} record={r}
                  onApprove={handleApprove} onReject={handleReject} onEdit={setEditRecord} />
              ))}
            </tbody>
          </table>
        </div>
        {records.length > 0 && (
          <div style={{ padding:'10px 16px', borderTop:'1px solid #f0ede8', fontSize:12, color:'#aaa', display:'flex', justifyContent:'space-between' }}>
            <span>Showing {records.length} of {total} records</span>
            <span>{approvedCount} approved · {pendingCount} pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
