import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const SOURCE_TYPES = [
  {
    id: 'sap_fuel',
    label: 'SAP Fuel & Procurement',
    description: 'Pipe-delimited or tab-delimited SAP flat file (FAGLL03 / MB52 export). German or English headers. Handles fuel, procurement, and plant codes.',
    scope: 'Scope 1',
    accept: '.csv,.txt,.tsv',
    example: `Buchungsdatum|Werk|Material|Materialbezeichnung|Menge|Mengeneinheit\n01.03.2024|1000|DIESEL001|Diesel Kraftstoff|5000|L\n15.03.2024|2000|NATGAS01|Erdgas|12000|M3`,
  },
  {
    id: 'utility',
    label: 'Utility / Electricity',
    description: 'CSV export from utility portal (e.g. British Gas, EDF portal). Billing periods, meter IDs, consumption in kWh or MWh.',
    scope: 'Scope 2',
    accept: '.csv',
    example: `Meter ID,Site,Period Start,Period End,Consumption,Unit,Tariff,Cost,Currency\nMTR-001,London HQ,2024-02-01,2024-02-29,48500,kWh,TOU-Peak,5820,GBP`,
  },
  {
    id: 'travel',
    label: 'Corporate Travel (Navan/Concur)',
    description: 'JSON export from Navan or Concur. Trips array with flight, hotel, car, and rail segments. Airport codes for distance calculation.',
    scope: 'Scope 3',
    accept: '.json,.txt',
    example: `{"trips":[{"traveller_name":"Alice Smith","start_date":"2024-03-10","segments":[{"type":"flight","origin":"LHR","destination":"JFK","departure_date":"2024-03-10","passengers":1},{"type":"hotel","hotel_name":"Marriott Times Square","city":"New York","check_in":"2024-03-10","nights":3}]}]}`,
  },
];

export default function Upload() {
  const [sourceType, setSourceType] = useState('sap_fuel');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [pasteContent, setPasteContent] = useState('');
  const [mode, setMode] = useState('file'); // 'file' | 'paste'
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInput = useRef();
  const nav = useNavigate();

  const source = SOURCE_TYPES.find(s => s.id === sourceType);

  const handleDrop = e => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const submit = async () => {
    setUploading(true); setError(''); setResult(null);
    try {
      let res;
      if (mode === 'file' && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('source_type', sourceType);
        res = await api.post('/ingest/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        const content = pasteContent.trim() || source.example;
        res = await api.post('/ingest/', { source_type: sourceType, content, filename: `paste_${sourceType}.${sourceType === 'travel' ? 'json' : 'csv'}` });
      }
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const loadExample = () => {
    setMode('paste');
    setPasteContent(source.example);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>Upload data</h1>
        <p style={{ color: '#888', margin: 0, fontSize: 14 }}>Import SAP, utility, or travel data for review</p>
      </div>

      {/* Source type picker */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {SOURCE_TYPES.map(s => (
          <button
            key={s.id}
            onClick={() => { setSourceType(s.id); setFile(null); setPasteContent(''); setResult(null); setError(''); }}
            style={{
              flex: 1, minWidth: 180, padding: '14px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${sourceType === s.id ? '#1a7f5a' : '#ebe9e3'}`,
              background: sourceType === s.id ? '#e8f5ef' : '#fff',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: '#1a7f5a', marginBottom: 4 }}>{s.scope}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18' }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Description */}
      <div style={{ background: '#f8f7f4', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#555' }}>
        {source.description}
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['file', 'paste'].map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${mode === m ? '#1a7f5a' : '#ddd'}`, background: mode === m ? '#1a7f5a' : '#fff', color: mode === m ? '#fff' : '#555', fontSize: 13, cursor: 'pointer' }}
          >
            {m === 'file' ? 'Upload file' : 'Paste / example'}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInput.current.click()}
          style={{
            border: `2px dashed ${dragging ? '#1a7f5a' : '#ddd'}`,
            borderRadius: 10, padding: '2.5rem', textAlign: 'center', cursor: 'pointer',
            background: dragging ? '#e8f5ef' : '#fafaf8', marginBottom: 16,
          }}
        >
          <input ref={fileInput} type="file" accept={source.accept} style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
          {file ? (
            <div>
              <p style={{ fontWeight: 500, color: '#1a7f5a', margin: '0 0 4px' }}>{file.name}</p>
              <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p style={{ color: '#888', margin: '0 0 4px', fontSize: 15 }}>Drop file here or click to browse</p>
              <p style={{ color: '#bbb', margin: 0, fontSize: 12 }}>Accepts {source.accept}</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#555' }}>Paste content or use example data</span>
            <button onClick={loadExample} style={{ fontSize: 12, color: '#1a7f5a', background: 'none', border: '1px solid #1a7f5a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
              Load example
            </button>
          </div>
          <textarea
            value={pasteContent}
            onChange={e => setPasteContent(e.target.value)}
            style={{ width: '100%', height: 180, fontFamily: 'monospace', fontSize: 12, padding: 12, border: '1px solid #ddd', borderRadius: 8, resize: 'vertical', boxSizing: 'border-box', color: '#333' }}
            placeholder={`Paste ${source.label} content here…`}
          />
        </div>
      )}

      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#991b1b', fontSize: 13 }}>{error}</div>}

      {result && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
          <p style={{ fontWeight: 500, color: '#166534', margin: '0 0 6px' }}>✓ Imported successfully</p>
          <p style={{ color: '#15803d', fontSize: 13, margin: '0 0 10px' }}>
            {result.row_count} rows parsed · {result.error_count} errors · {result.warning_count} warnings
          </p>
          <button
            onClick={() => nav(`/review?batch=${result.id}`)}
            style={{ padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            Review records →
          </button>
        </div>
      )}

      <button
        onClick={submit}
        disabled={uploading || (mode === 'file' && !file)}
        style={{
          padding: '11px 28px', background: '#1a7f5a', color: '#fff', border: 'none',
          borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
          opacity: (uploading || (mode === 'file' && !file)) ? 0.6 : 1,
        }}
      >
        {uploading ? 'Processing…' : 'Import data'}
      </button>
    </div>
  );
}
