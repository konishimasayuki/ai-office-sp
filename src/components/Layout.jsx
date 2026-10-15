import { useEffect, useState } from 'react';
import BrandMark, { RobotMark } from './BrandMark.jsx';

const ICONS = {
  ai: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="8" width="14" height="11" rx="4" />
      <path d="M12 8V5M9.5 13h.01M14.5 13h.01M9.5 16h5M3 12v3M21 12v3" />
      <circle cx="12" cy="4" r="1.2" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 21V5l8-2v18M12 8h8v13M4 21h16" />
      <path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
  tenants: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  ),
};

export default function Layout({ user, page, pages, onNavigate, onLogout, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
  }, [open]);

  const nav = (
    <>
      <div className="brand">
        <BrandMark />
        <div className="brand-sub">{user.tenantName}</div>
      </div>
      <nav className="menu" aria-label="メインメニュー">
        {Object.entries(pages).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`menu-item${page === k ? ' active' : ''}`}
            onClick={() => {
              onNavigate(k);
              setOpen(false);
            }}
          >
            {ICONS[k]}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="side-user">
        <div className="side-user-name">{user.name}</div>
        <div className="side-user-role">
          {user.super ? '運営者' : user.role === 'admin' ? '管理者' : 'メンバー'}　@{user.username}
        </div>
        <button type="button" className="logout" onClick={onLogout}>
          ログアウト
        </button>
      </div>
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar">{nav}</aside>

      <header className="topbar">
        <button type="button" className="hamburger" aria-label="メニューを開く" aria-expanded={open} onClick={() => setOpen(true)}>
          <span />
          <span />
          <span />
        </button>
        <RobotMark className="topbar-mark" />
        <div className="topbar-name">マカセル</div>
        <div className="topbar-title">{pages[page]}</div>
      </header>

      <div className={`drawer-veil${open ? ' show' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside className={`drawer${open ? ' show' : ''}`} aria-hidden={!open}>
        <button type="button" className="drawer-close" aria-label="メニューを閉じる" onClick={() => setOpen(false)}>
          ×
        </button>
        {nav}
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
