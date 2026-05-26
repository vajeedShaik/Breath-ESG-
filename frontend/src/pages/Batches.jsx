import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { StatusBadge } from './Dashboard';

export default function Batches() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState(null);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/batches/');
    setBatches(data.results || data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const approveBatch = async (id) => {
    if (!confirm('Approve all pending records in this batch and lock them for audit?')) return;
    setApprovingId(id);
    await api.post(`/batches/${id}/approve/`);
    await load();
    setApprovingId(null);
  };

  return (
    <div>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Import history</h1>
        <p style={{ color: '#888', margin: 0, fontSize: 14 }}>All ingestion batches for your organisation</p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ebe9e3', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ebe9e3', background: '#fafaf8' }}>
              {['File', 'Source', 'Rows', 'Errors', 'Warnings', 'Status', 'Imported', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: '#888', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>Loading…</td></tr>}
            {!loading && batches.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: '#aaa' }}>No imports yet.</td></tr>
            )}
            {batches.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid #f8f6f2' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, maxWidth: 220 }}>
                  <p style={{ margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.original_filename}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>{b.uploaded_by_name}</p>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#e8f5ef', color: '#1a7f5a', fontWeight: 500 }}>{b.source_type_display}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{b.row_count}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: b.error_count > 0 ? '#c0392b' : '#888' }}>{b.error_count}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: b.warning_count > 0 ? '#d97706' : '#888' }}>{b.warning_count}</td>
                <td style={{ padding: '12px 16px' }}><StatusBadge status={b.status} /></td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#aaa' }}>
                  {new Date(b.created_at).toLocaleDateString()}<br />
                  <span style={{ fontSize: 11 }}>{new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => nav(`/review?batch=${b.id}`)}
                      style={{ padding: '5px 10px', fontSize: 12, background: '#f0f0f0', border: 'none', borderRadius: 5, cursor: 'pointer', color: '#555' }}
                    >
                      View records
                    </button>
                    {b.status === 'review' && (
                      <button
                        onClick={() => approveBatch(b.id)}
                        disabled={approvingId === b.id}
                        style={{ padding: '5px 10px', fontSize: 12, background: '#1a7f5a', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', opacity: approvingId === b.id ? 0.6 : 1 }}
                      >
                        {approvingId === b.id ? '…' : 'Approve all'}
                      </button>
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
