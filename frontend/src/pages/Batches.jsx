import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

function StatusBadge({ status }) {
  const colors = {
    pending: ['#fef3c7','#92400e'], parsing: ['#e0f2fe','#0c4a6e'],
    review:  ['#fef3c7','#d97706'], approved: ['#dcfce7','#166534'], failed: ['#fee2e2','#991b1b'],
  };
  const [bg, text] = colors[status] || ['#f0ede8','#555'];
  return <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:bg, color:text, fontWeight:500 }}>{status}</span>;
}

const SOURCE_ICON = { sap_fuel: '⚙', utility: '⚡', travel: '✈' };

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('');
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const q = sourceFilter ? `?source_type=${sourceFilter}` : '';
    const { data } = await api.get(`/batches/${q}`);
    setBatches(data.results || data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [sourceFilter]);

  const approveBatch = async (id) => {
    if (!window.confirm('Approve all pending records in this batch and lock them for audit?\n\nThis cannot be undone.')) return;
    setApprovingId(id);
    await api.post(`/batches/${id}/approve/`);
    await load();
    setApprovingId(null);
  };

  const totalRows     = batches.reduce((s, b) => s + b.row_count, 0);
  const totalErrors   = batches.reduce((s, b) => s + b.error_count, 0);
  const approvedCount = batches.filter(b => b.status === 'approved').length;
  const pendingCount  = batches.filter(b => b.status === 'review').length;

  return (
    <div>
      <div style={{ marginBottom:'1.75rem', display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 4px' }}>Import history</h1>
          <p style={{ color:'#888', margin:0, fontSize:14 }}>All ingestion batches · {batches.length} total · {totalRows.toLocaleString()} rows</p>
        </div>
        <button onClick={() => nav('/upload')}
          style={{ padding:'9px 18px', background:'#1a7f5a', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + New import
        </button>
      </div>

      {/* Summary bar */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        {[
          { label:'Total batches', value: batches.length },
          { label:'Total rows', value: totalRows.toLocaleString() },
          { label:'Awaiting review', value: pendingCount, color: pendingCount > 0 ? '#d97706' : undefined },
          { label:'Approved', value: approvedCount, color:'#1a7f5a' },
          { label:'Rows with errors', value: totalErrors, color: totalErrors > 0 ? '#c0392b' : undefined },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'#fff', border:'1px solid #ebe9e3', borderRadius:10, padding:'1rem 1.25rem', flex:1, minWidth:130 }}>
            <p style={{ fontSize:11, color:'#aaa', margin:'0 0 4px', textTransform:'uppercase', letterSpacing:'0.04em', fontWeight:500 }}>{label}</p>
            <p style={{ fontSize:22, fontWeight:700, margin:0, color: color || '#1a1a18' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <span style={{ fontSize:13, color:'#888' }}>Filter:</span>
        {[['', 'All sources'], ['sap_fuel','SAP Fuel'], ['utility','Utility'], ['travel','Travel']].map(([val, label]) => (
          <button key={val} onClick={() => setSourceFilter(val)}
            style={{ padding:'6px 14px', borderRadius:7, fontSize:13, cursor:'pointer', border: sourceFilter === val ? '2px solid #1a7f5a' : '1px solid #ddd', background: sourceFilter === val ? '#e8f5ef' : '#fff', color: sourceFilter === val ? '#1a7f5a' : '#555', fontWeight: sourceFilter === val ? 600 : 400 }}>
            {SOURCE_ICON[val] || ''} {label}
          </button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid #ebe9e3', borderRadius:10, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #ebe9e3', background:'#fafaf8' }}>
              {['','File','Source','Rows','Errors','Warnings','Status','Imported by','Date','Actions'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color:'#888', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ padding:'3rem', textAlign:'center', color:'#aaa' }}>Loading…</td></tr>}
            {!loading && batches.length === 0 && (
              <tr><td colSpan={10} style={{ padding:'3rem', textAlign:'center', color:'#aaa', fontSize:14 }}>
                No imports yet. <button onClick={() => nav('/upload')} style={{ color:'#1a7f5a', background:'none', border:'none', cursor:'pointer', fontSize:14 }}>Upload now</button>
              </td></tr>
            )}
            {batches.map(b => (
              <tr key={b.id} style={{ borderBottom:'1px solid #f8f6f2' }}>
                <td style={{ padding:'12px 8px 12px 14px', fontSize:18 }}>{SOURCE_ICON[b.source_type] || '📄'}</td>
                <td style={{ padding:'12px 0', maxWidth:220 }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:500, color:'#333', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.original_filename}</p>
                  <p style={{ margin:0, fontSize:11, color:'#aaa', fontFamily:'monospace' }}>{b.id.slice(0,8)}…</p>
                </td>
                <td style={{ padding:'12px 14px' }}>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'#e8f5ef', color:'#1a7f5a', fontWeight:500 }}>{b.source_type_display}</span>
                </td>
                <td style={{ padding:'12px 14px', fontSize:13, color:'#444', fontWeight:500 }}>{b.row_count}</td>
                <td style={{ padding:'12px 14px', fontSize:13 }}>
                  <span style={{ color: b.error_count > 0 ? '#c0392b' : '#aaa', fontWeight: b.error_count > 0 ? 600 : 400 }}>{b.error_count}</span>
                </td>
                <td style={{ padding:'12px 14px', fontSize:13 }}>
                  <span style={{ color: b.warning_count > 0 ? '#d97706' : '#aaa', fontWeight: b.warning_count > 0 ? 600 : 400 }}>{b.warning_count}</span>
                </td>
                <td style={{ padding:'12px 14px' }}><StatusBadge status={b.status} /></td>
                <td style={{ padding:'12px 14px', fontSize:12, color:'#777' }}>{b.uploaded_by_name || '—'}</td>
                <td style={{ padding:'12px 14px', fontSize:12, color:'#aaa', whiteSpace:'nowrap' }}>
                  {new Date(b.created_at).toLocaleDateString()}<br/>
                  <span style={{ fontSize:11 }}>{new Date(b.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                </td>
                <td style={{ padding:'12px 14px' }}>
                  <div style={{ display:'flex', gap:6, flexWrap:'nowrap' }}>
                    <button onClick={() => nav(`/review?batch=${b.id}`)}
                      style={{ padding:'5px 10px', fontSize:11, background:'#f0f0f0', border:'none', borderRadius:5, cursor:'pointer', color:'#555', whiteSpace:'nowrap' }}>
                      View records
                    </button>
                    {b.status === 'review' && (
                      <button onClick={() => approveBatch(b.id)} disabled={approvingId === b.id}
                        style={{ padding:'5px 10px', fontSize:11, background:'#1a7f5a', color:'#fff', border:'none', borderRadius:5, cursor:'pointer', opacity: approvingId === b.id ? 0.6 : 1, whiteSpace:'nowrap' }}>
                        {approvingId === b.id ? '…' : '🔒 Approve all'}
                      </button>
                    )}
                    {b.status === 'failed' && (
                      <span title={b.error_detail} style={{ fontSize:11, color:'#c0392b', cursor:'help' }}>⚠ error</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
