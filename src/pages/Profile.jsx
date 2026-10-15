import { useEffect, useState } from 'react';
import { api } from '../api.js';

// AI社員が「会社の前提」として読む情報。ここに書いていない事実は、AIは作らず「要確認」と書く
const FIELDS = [
  ['companyName', '会社名・屋号', 'input', '例）株式会社マカセル'],
  ['business', '事業内容', 'area', '例）福岡市でリフォーム業。水回り・外壁塗装が中心'],
  ['area', '所在地・商圏', 'input', '例）福岡県福岡市（車で1時間圏内）'],
  ['products', '商品・サービスと料金', 'area', '例）キッチン交換 80万円〜／外壁塗装 30坪 90万円〜'],
  ['strengths', '強み', 'area', '例）自社職人のみ。見積もりは当日中'],
  ['target', 'お客様（ターゲット）', 'area', '例）築20年以上の戸建てに住む50〜70代'],
  ['contact', '連絡先（チラシなどに載せる）', 'area', '例）電話 092-000-0000（9〜18時）／LINE @xxxx'],
  ['ngWords', '使わない表現', 'area', '例）「地域最安」「絶対」など根拠のない表現'],
];

export default function Profile({ me, onAuthError }) {
  const isAdmin = me.role === 'admin';
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .profile()
      .then((r) => setP({ ...r.profile, divisions: (r.profile.divisions || []).join('\n'), examples: (r.profile.examples || []).join('\n') }))
      .catch((e) => {
        onAuthError(e);
        setErr(e.message);
      });
  }, [onAuthError]);

  const set = (k) => (e) => setP((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api.saveProfile(p);
      setMsg('保存しました。次の指示から、AI社員がこの内容を前提に作業します。');
      window.setTimeout(() => setMsg(''), 4000);
    } catch (e2) {
      onAuthError(e2);
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>会社プロフィール</h1>
          <p className="muted">AI社員はここを読んで、会社の事業・商品・料金を理解します。書いていない事実は作らず「要確認」と書きます。</p>
        </div>
      </div>
      {msg && (
        <p className="form-ok" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      {p && (
        <form className="card profile-form" onSubmit={save} noValidate>
          <fieldset disabled={!isAdmin}>
            <h2>会社のこと</h2>
            <div className="pf-grid">
              {FIELDS.map(([k, label, type, ph]) => (
                <label key={k} htmlFor={`pf-${k}`} className={type === 'area' ? 'wide' : ''}>
                  {label}
                  {type === 'area' ? (
                    <textarea id={`pf-${k}`} rows={3} value={p[k] || ''} onChange={set(k)} placeholder={ph} />
                  ) : (
                    <input id={`pf-${k}`} value={p[k] || ''} onChange={set(k)} placeholder={ph} />
                  )}
                </label>
              ))}
            </div>

            <h2>AIオフィスの設定</h2>
            <div className="pf-grid">
              <label>
                オフィスの看板
                <input value={p.officeName || ''} onChange={set('officeName')} placeholder="空欄なら MAKASERU AI OFFICE" maxLength={40} />
              </label>
              <div className="pf-colors">
                <label>
                  ブランドカラー（メイン）
                  <span className="pf-color">
                    <input type="color" value={p.brandMain} onChange={set('brandMain')} />
                    <code>{p.brandMain}</code>
                  </span>
                </label>
                <label>
                  ブランドカラー（アクセント）
                  <span className="pf-color">
                    <input type="color" value={p.brandAccent} onChange={set('brandAccent')} />
                    <code>{p.brandAccent}</code>
                  </span>
                </label>
              </div>
              <label className="wide">
                事業の区分（1行に1つ。秘書が案件をどれに当てはめるかに使います）
                <textarea rows={3} value={p.divisions} onChange={set('divisions')} placeholder={'例）\nリフォーム\n外壁塗装\n会社全体'} />
              </label>
              <label className="wide">
                秘書チャットの例文（1行に1つ、5つまで）
                <textarea rows={3} value={p.examples} onChange={set('examples')} placeholder={'例）\n外壁塗装のお客さんを増やしたい\n春のキャンペーンのチラシを作って'} />
              </label>
            </div>
          </fieldset>
          {isAdmin ? (
            <div className="card-foot">
              <button type="submit" className="btn gold" disabled={busy}>
                {busy ? '保存中…' : '保存する'}
              </button>
            </div>
          ) : (
            <p className="muted small">変更できるのは管理者だけです。</p>
          )}
        </form>
      )}
    </section>
  );
}
