import { useEffect, useState } from 'react';
import { AGENT_LOOK } from '../ai/agents.js';
import { api } from '../api.js';

// 会社ごとに、AI社員の名前・口調・使う/使わないを変える。担当の仕事と安全のルールは変えられない
export default function Staff({ me, onAuthError }) {
  const isAdmin = me.role === 'admin';
  const [list, setList] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api
      .staff()
      .then((r) => setList(r.agents))
      .catch((e) => {
        onAuthError(e);
        setErr(e.message);
      });
  }, [onAuthError]);

  const edit = (id, patch) => {
    setList((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const agents = Object.fromEntries(list.map((a) => [a.id, { name: a.name, tone: a.tone, enabled: a.enabled }]));
      setList((await api.saveStaff(agents)).agents);
      setDirty(false);
      setMsg('保存しました。次の作業から反映されます。');
      window.setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      onAuthError(e);
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const on = list ? list.filter((a) => a.enabled).length : 0;
  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>AI社員の設定</h1>
          <p className="muted">
            名前と口調を会社に合わせて変えられます。使わない部署を外すと、秘書はその部署に仕事を振りません。担当の仕事と、送信・公開をしないルールは変わりません。
          </p>
        </div>
        {isAdmin && (
          <button type="button" className="btn gold" disabled={busy || !dirty} onClick={save}>
            {busy ? '保存中…' : '保存する'}
          </button>
        )}
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
      {list && (
        <>
          <p className="muted small">
            使っているAI社員：{on}人／{list.length}人
          </p>
          <ul className="staff-list">
            {list.map((a) => {
              const lk = AGENT_LOOK[a.id] || { color: '#9AA0AA', icon: '?' };
              return (
                <li key={a.id} className={`staff${a.enabled ? '' : ' off'}`}>
                  <div className="staff-top">
                    <span className="bubble-ic" style={{ background: a.enabled ? lk.color : '#c4c9d1' }}>
                      {lk.icon}
                    </span>
                    <div className="staff-name">
                      <small>{a.dept}</small>
                      <b>{a.name}</b>
                      <em>
                        {a.model === 'sonnet' ? '上位モデル' : '標準モデル'}
                        {a.search ? `・Web検索${a.search}回まで` : ''}
                      </em>
                    </div>
                    <label className={`switch${a.locked ? ' locked' : ''}`}>
                      <input type="checkbox" checked={a.enabled} disabled={!isAdmin || a.locked} onChange={(e) => edit(a.id, { enabled: e.target.checked })} />
                      <span>{a.locked ? '必須' : a.enabled ? '使う' : '使わない'}</span>
                    </label>
                  </div>
                  <div className="staff-fields">
                    <label>
                      名前
                      <input value={a.name} maxLength={8} disabled={!isAdmin} onChange={(e) => edit(a.id, { name: e.target.value })} placeholder={a.defaultName} />
                    </label>
                    <label className="grow">
                      口調・性格
                      <input value={a.tone} maxLength={80} disabled={!isAdmin} onChange={(e) => edit(a.id, { tone: e.target.value })} placeholder={a.defaultTone} />
                    </label>
                  </div>
                  {isAdmin && (a.name !== a.defaultName || a.tone !== a.defaultTone) && (
                    <button type="button" className="link-btn" onClick={() => edit(a.id, { name: a.defaultName, tone: a.defaultTone })}>
                      最初の設定に戻す
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {isAdmin && dirty && (
            <div className="staff-save">
              <button type="button" className="btn gold" disabled={busy} onClick={save}>
                {busy ? '保存中…' : '変更を保存する'}
              </button>
            </div>
          )}
          {!isAdmin && <p className="muted small">変更できるのは管理者だけです。</p>}
        </>
      )}
    </section>
  );
}
