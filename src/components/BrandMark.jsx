import { BRAND } from '../brand.js';

// ロゴマーク：オフィスのロボットの顔（アイコン・ログイン・メニューで共通）
export function RobotMark({ className = '', size }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="14" x2="32" y2="7" stroke="#cdd3db" strokeWidth="2.6" strokeLinecap="round" />
      <circle className="rm-antenna" cx="32" cy="6" r="3.6" fill="#C9A45C" />
      <rect x="6" y="26" width="6" height="14" rx="3" fill="#C9A45C" />
      <rect x="52" y="26" width="6" height="14" rx="3" fill="#C9A45C" />
      <rect x="10" y="14" width="44" height="38" rx="15" fill="#F5F7FA" stroke="#d6dbe2" />
      <rect x="16" y="22" width="32" height="20" rx="9" fill="#141922" />
      <circle className="rm-eye" cx="25" cy="32" r="3.2" fill="#7FE3FF" />
      <circle className="rm-eye" cx="39" cy="32" r="3.2" fill="#7FE3FF" />
    </svg>
  );
}

// マーク＋製品名
export default function BrandMark({ className = '', sub = true }) {
  return (
    <div className={`bm ${className}`}>
      <RobotMark className="bm-mark" />
      <div className="bm-text">
        <small>AIオフィス</small>
        <b>{BRAND.short}</b>
        {sub && <em>{BRAND.en}</em>}
      </div>
    </div>
  );
}
