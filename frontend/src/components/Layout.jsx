import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV = [
  { path: '/', label: 'Dashboard', icon: '◼' },
  { path: '/upload', label: 'Upload data', icon: '↑' },
  { path: '/review', label: 'Review queue', icon: '≡' },
  { path: '/batches', label: 'Import history', icon: '◈' },
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
      <aside style={{ width: 224, background: '#fff', borderRight: '1px solid #ebe9e3', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Logo */}
        <div style={{ padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid #ebe9e3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
            <div style={{ width: 30, height: 30, background: 'linear-gradient(135deg,#1a7f5a,#0f5a3f)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, letterSpacing: '-1px' }}>B</span>
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: 14, color: '#1a1a18', margin: 0, lineHeight: 1.2 }}>Breathe ESG</p>
              <p style={{ fontSize: 10, color: '#aaa', margin: 0 }}>Data Platform</p>
            </div>
          </div>
          {tenant && (
            <div style={{ marginTop: 8, padding: '5px 8px', background: '#e8f5ef', borderRadius: 6 }}>
              <p style={{ fontSize: 11, color: '#1a7f5a', margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenant.name}</p>
              <p style={{ fontSize: 10, color: '#4ade80', margin: 0, textTransform: 'capitalize' }}>{tenant.role}</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0.75rem 0.75rem' }}>
          <p style={{ fontSize: 10, color: '#ccc', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px 8px' }}>Navigation</p>
          {NAV.map(({ path, label, icon }) => {
            const active = path === '/' ? pathname === '/' : pathname.startsWith(path);
            return (
              <Link key={path} to={path} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                borderRadius: 8, fontSize: 13, textDecoration: 'none', marginBottom: 2,
                background: active ? '#e8f5ef' : 'transparent',
                color: active ? '#1a7f5a' : '#666',
                fontWeight: active ? 600 : 400,
                transition: 'background .12s',
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f8f7f4'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 11, width: 18, textAlign: 'center', opacity: active ? 1 : 0.6 }}>{icon}</span>
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #ebe9e3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{ width: 28, height: 28, background: '#e8f5ef', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#1a7f5a' }}>{user?.name?.[0]?.toUpperCase() || 'U'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, margin: 0, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</p>
              <button onClick={handleLogout}
                style={{ fontSize: 11, color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: '2rem 2.25rem', overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}
