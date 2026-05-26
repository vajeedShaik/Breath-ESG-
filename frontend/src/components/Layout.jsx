import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

const NAV = [
  { path: '/', label: 'Dashboard', icon: '◼' },
  { path: '/upload', label: 'Upload', icon: '↑' },
  { path: '/review', label: 'Review queue', icon: '≡' },
  { path: '/batches', label: 'Batches', icon: '◈' },
  { path: '/audit', label: 'Audit log', icon: '∷' },
];

export default function Layout({ children }) {
  const { user, tenant, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();

  const handleLogout = () => { logout(); nav('/login'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f7f4' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '1px solid #ebe9e3', display: 'flex', flexDirection: 'column', padding: '1.5rem 0' }}>
        <div style={{ padding: '0 1.25rem 1.5rem', borderBottom: '1px solid #ebe9e3', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, background: '#1a7f5a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>B</span>
            </div>
            <span style={{ fontWeight: 600, fontSize: 15, color: '#1a1a18' }}>Breathe ESG</span>
          </div>
          {tenant && <p style={{ fontSize: 11, color: '#888', margin: 0 }}>{tenant.name}</p>}
        </div>

        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
          {NAV.map(({ path, label, icon }) => {
            const active = pathname === path || (path !== '/' && pathname.startsWith(path));
            return (
              <Link
                key={path}
                to={path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                  borderRadius: 8, fontSize: 14, textDecoration: 'none', marginBottom: 2,
                  background: active ? '#e8f5ef' : 'transparent',
                  color: active ? '#1a7f5a' : '#555',
                  fontWeight: active ? 500 : 400,
                }}
              >
                <span style={{ fontSize: 12, width: 16, textAlign: 'center' }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #ebe9e3' }}>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 8px' }}>{user?.name}</p>
          <button
            onClick={handleLogout}
            style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
