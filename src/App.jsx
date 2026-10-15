import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { BRAND } from './brand.js';
import { ConfirmProvider } from './components/Confirm.jsx';
import Layout from './components/Layout.jsx';
import Splash from './components/Splash.jsx';
import AiStaff from './pages/AiStaff.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Settings from './pages/Settings.jsx';
import Tenants from './pages/Tenants.jsx';

// 権限によって出すメニューを変える
function pagesFor(user) {
  const p = { ai: 'AIオフィス', profile: '会社プロフィール', settings: '設定' };
  if (user?.super) p.tenants = '運営管理';
  return p;
}
const pageFromHash = () => window.location.hash.replace('#/', '') || 'ai';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [hashPage, setHashPage] = useState(pageFromHash());
  const pages = useMemo(() => pagesFor(user), [user]);
  const page = pages[hashPage] ? hashPage : 'ai';

  useEffect(() => {
    document.title = BRAND.name;
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
    const onHash = () => setHashPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((p) => {
    window.location.hash = `#/${p}`;
    setHashPage(p);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  // セッション切れで401が返ったらログイン画面へ戻す
  const onAuthError = useCallback((e) => {
    if (e?.status === 401) setUser(null);
  }, []);

  if (checking) return <Splash />;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <ConfirmProvider>
      <Layout user={user} page={page} pages={pages} onNavigate={go} onLogout={logout}>
        {page === 'ai' && <AiStaff me={user} onAuthError={onAuthError} onGo={go} />}
        {page === 'profile' && <Profile me={user} onAuthError={onAuthError} />}
        {page === 'settings' && <Settings me={user} onMeChange={setUser} onAuthError={onAuthError} />}
        {page === 'tenants' && <Tenants me={user} onAuthError={onAuthError} />}
      </Layout>
    </ConfirmProvider>
  );
}
