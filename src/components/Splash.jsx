import { RobotMark } from './BrandMark.jsx';

// 起動時・読み込み中の表示（index.html の最初の表示と同じ見た目）
export default function Splash() {
  return (
    <div className="splash" role="status" aria-label="読み込み中">
      <div className="splash-in">
        <RobotMark className="splash-mark" />
        <div className="splash-name">AIオフィス マカセル</div>
        <div className="splash-bar">
          <i />
        </div>
      </div>
    </div>
  );
}
