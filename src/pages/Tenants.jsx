import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

const yen = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

// 運営者だけが見る画面：利用している会社の一覧、会社の追加、費用の上限と利用の停止
export default function Tenants({ me, onAuthError }) {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setList((await api.tenants()).tenants);
    } catch (e) {
      onAuthError(e);
      setErr(e.message);
    }
  }, [onAuthError]);
  useEffect(() => {
    load();
  }, [load]);

  const flash = (m) => {
    setMsg(m);
    setErr('');
    window.setTimeout(() => setMsg(''), 3000);
  };
  const fail = (e) => {
    onAuthError(e);
    setErr(e.message);
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>運営管理</h1>
          <p className="muted">マカセルを使っている会社の一覧です。会社ごとにデータ・ユーザー・費用の上限が分かれています。</p>
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
      <div className="cards">
        <AddTenant
          onAdded={(t) => {
            flash(`${t.name}を追加しました`);
            load();
          }}
          onError={fail}
        />
        <div className="card">
          <h2>会社一覧（{list.length}社）</h2>
          <ul className="tenant-list">
            {list.map((t) => (
              <TenantRow
                key={t.id}
                t={t}
                mine={t.id === me.tenantId}
                onSaved={(m) => {
                  flash(m);
                  load();
                }}
                onError={fail}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function AddTenant({ onAdded, onError }) {
  const blank = { name: '', adminUsername: '', adminName: '', password: '' };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.addTenant(f);
      setF(blank);
      onAdded(r.tenant);
    } catch (e2) {
      onError(e2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>会社を追加</h2>
      <div className="grid2">
        <label>
          会社名
          <input value={f.name} onChange={set('name')} placeholder="例）株式会社サンプル" />
        </label>
        <label>
          管理者の表示名
          <input value={f.adminName} onChange={set('adminName')} placeholder="例）山口" />
        </label>
        <label>
          管理者のログインID
          <input value={f.adminUsername} onChange={set('adminUsername')} autoCapitalize="none" autoCorrect="off" placeholder="例）sample-admin" />
        </label>
        <label>
          初期パスワード
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
        </label>
      </div>
      <p className="muted small">追加すると、その会社の管理者アカウントができます。ログイン後に会社プロフィールを入れてもらってください。</p>
      <div className="card-foot">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? '追加中…' : '追加する'}
        </button>
      </div>
    </form>
  );
}

function TenantRow({ t, mine, onSaved, onError }) {
  const [caseYen, setCaseYen] = useState(t.limits.caseYen);
  const [dayYen, setDayYen] = useState(t.limits.dayYen);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const dirty = Number(caseYen) !== t.limits.caseYen || Number(dayYen) !== t.limits.dayYen;
  const stopped = t.status === 'stopped';

  const save = async (data, m) => {
    setBusy(true);
    try {
      await api.updateTenant({ id: t.id, ...data });
      onSaved(m);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    if (!stopped && !(await confirm(`${t.name}の利用を停止します。この会社のユーザーはログインできなくなります。よろしいですか？`, { ok: '停止する', danger: true }))) return;
    save({ status: stopped ? 'active' : 'stopped' }, `${t.name}の利用を${stopped ? '再開' : '停止'}しました`);
  };

  return (
    <li className={`tenant${stopped ? ' stopped' : ''}`}>
      <div className="tenant-main">
        <b>
          {t.name}
          {mine && <em className="me">運営</em>}
          {stopped && <em className="stop">停止中</em>}
        </b>
        <small className="muted">
          ユーザー {t.users}名・今月のAI費用 {yen(t.costMonth)}・登録 {String(t.createdAt).slice(0, 10)}
        </small>
      </div>
      <div className="tenant-limits">
        <label>
          1案件の上限（円）
          <input type="number" inputMode="numeric" min="0" value={caseYen} onChange={(e) => setCaseYen(e.target.value)} />
        </label>
        <label>
          1日の上限（円）
          <input type="number" inputMode="numeric" min="0" value={dayYen} onChange={(e) => setDayYen(e.target.value)} />
        </label>
        <button type="button" className="btn gold sm" disabled={busy || !dirty} onClick={() => save({ limits: { caseYen, dayYen } }, `${t.name}の上限を変更しました`)}>
          上限を保存
        </button>
        {!mine && (
          <button type="button" className={`btn sm ${stopped ? 'ghost' : 'danger-ghost'}`} disabled={busy} onClick={toggle}>
            {stopped ? '利用を再開' : '利用を停止'}
          </button>
        )}
      </div>
    </li>
  );
}
