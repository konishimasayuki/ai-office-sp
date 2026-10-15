import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

export default function Settings({ me, onMeChange, onAuthError }) {
  const isSuper = !!me.super;
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!isSuper) return;
    try {
      const r = await api.users();
      setUsers(r.users);
    } catch (e) {
      onAuthError(e);
      setErr(e.message);
    }
  }, [onAuthError, isSuper]);

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
    setMsg('');
  };

  return (
    <section className="page">
      <div className="page-head">
        <div>
          <h1>設定</h1>
          <p className="muted">{isSuper ? 'この会社のユーザーと、自分のアカウントを管理します。' : '表示名とパスワードを変更できます。'}</p>
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
        {isSuper && (
          <AddUser
            onAdded={(u) => {
              setUsers((x) => [...x, u]);
              flash(`${u.name}さんを追加しました`);
            }}
            onError={fail}
          />
        )}
        {isSuper && <UserList users={users} me={me} onChanged={load} onFlash={flash} onError={fail} />}
        <MyAccount me={me} onMeChange={onMeChange} onFlash={flash} onError={fail} />
      </div>
    </section>
  );
}

function AddUser({ onAdded, onError }) {
  const [f, setF] = useState({ username: '', name: '', password: '', role: 'member' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.addUser(f);
      onAdded(r.user);
      setF({ username: '', name: '', password: '', role: 'member' });
    } catch (e2) {
      onError(e2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>ユーザー追加</h2>
      <div className="grid2">
        <label>
          ログインID
          <input value={f.username} onChange={set('username')} autoCapitalize="none" autoCorrect="off" placeholder="例）shimizu" />
        </label>
        <label>
          表示名
          <input value={f.name} onChange={set('name')} placeholder="例）清水" />
        </label>
        <label>
          パスワード
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
        </label>
        <label>
          権限
          <select value={f.role} onChange={set('role')}>
            <option value="member">メンバー</option>
            <option value="admin">管理者</option>
          </select>
        </label>
      </div>
      <p className="muted small">ログインIDは半角英数字で、ほかの会社とも重ならないものにしてください。</p>
      <div className="card-foot">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? '追加中…' : '追加する'}
        </button>
      </div>
    </form>
  );
}

function UserList({ users, me, onChanged, onFlash, onError }) {
  const confirm = useConfirm();
  const del = async (u) => {
    if (!(await confirm(`${u.name}さん（@${u.username}）を削除します。よろしいですか？`, { ok: '削除する', danger: true }))) return;
    try {
      await api.deleteUser(u.id);
      onFlash(`${u.name}さんを削除しました`);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };
  const toggleRole = async (u) => {
    try {
      await api.updateUser({ id: u.id, role: u.role === 'admin' ? 'member' : 'admin' });
      onFlash(`${u.name}さんの権限を変更しました`);
      onChanged();
    } catch (e) {
      onError(e);
    }
  };
  return (
    <div className="card">
      <h2>ユーザー一覧（{users.length}名）</h2>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id}>
            <div className="avatar" aria-hidden="true">
              {(u.name || u.username).slice(0, 1)}
            </div>
            <div className="u-main">
              <b>
                {u.name}
                {u.id === me.id && <em className="me">あなた</em>}
              </b>
              <span>@{u.username}</span>
            </div>
            <span className={`role ${u.role}`}>{u.role === 'admin' ? '管理者' : 'メンバー'}</span>
            {u.id !== me.id && (
              <div className="u-actions">
                <button type="button" className="btn ghost sm" onClick={() => toggleRole(u)}>
                  {u.role === 'admin' ? 'メンバーにする' : '管理者にする'}
                </button>
                <button type="button" className="btn danger-ghost sm" onClick={() => del(u)}>
                  削除
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyAccount({ me, onMeChange, onFlash, onError }) {
  const [name, setName] = useState(me.name);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw && pw !== pw2) {
      onError(new Error('確認用のパスワードが一致しません'));
      return;
    }
    setBusy(true);
    try {
      const r = await api.updateUser({ id: me.id, name, ...(pw ? { password: pw } : {}) });
      onMeChange(r.user);
      setPw('');
      setPw2('');
      onFlash(pw ? '表示名とパスワードを更新しました' : '表示名を更新しました');
    } catch (e2) {
      onError(e2);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>自分のアカウント</h2>
      <div className="grid2">
        <label>
          表示名
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          ログインID
          <input value={me.username} disabled />
        </label>
        <label>
          新しいパスワード
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="変更する場合のみ" />
        </label>
        <label>
          新しいパスワード（確認）
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </label>
      </div>
      {me.username === 'z' && <p className="muted small">初期アカウント（z / z）のままです。本番で使う前に、パスワードを変えてください。</p>}
      <div className="card-foot">
        <button type="submit" className="btn gold" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
