import { USERNAME_RE, body, deleteUser, hashPassword, key, listUsers, newId, now, publicUser, redis, saveUser, send, withAuth } from './_lib.js';

// 自分の会社のユーザーだけを扱う。今は1社1ユーザーの運用なので、追加・削除・権限変更は運営者だけ
// GET: 一覧 / POST: 追加（運営者） / PUT: 自分の名前・パスワード（運営者は他人も） / DELETE: 削除（運営者）
export default withAuth(async (req, res, me, tenant) => {
  const r = redis();
  const loadMine = async (id) => {
    const u = await r.get(key('user', String(id)));
    return u && u.tenantId === me.tenantId ? u : null;
  };

  if (req.method === 'GET') {
    const users = await listUsers(me.tenantId);
    return send(res, 200, { users: users.map((u) => publicUser(u, tenant)) });
  }

  if (req.method === 'POST') {
    if (!me.super) return send(res, 403, { error: 'ユーザーの追加は運営者のみできます' });
    const { username, name, password, role } = body(req);
    const uname = String(username || '').trim();
    if (!uname || !password) return send(res, 400, { error: 'ログインIDとパスワードは必須です' });
    if (!USERNAME_RE.test(uname)) return send(res, 400, { error: 'ログインIDは半角英数字と . _ - で入力してください' });
    if (await r.get(key('username', uname.toLowerCase()))) return send(res, 409, { error: 'このログインIDは使われています' });
    const user = {
      id: newId(),
      tenantId: me.tenantId,
      username: uname,
      name: String(name || uname).trim(),
      role: role === 'admin' ? 'admin' : 'member',
      password: hashPassword(password),
      createdAt: now(),
    };
    await saveUser(user);
    return send(res, 201, { user: publicUser(user, tenant) });
  }

  if (req.method === 'PUT') {
    const { id, name, role, password } = body(req);
    const targetId = id || me.id;
    if (targetId !== me.id && !me.super) return send(res, 403, { error: '自分以外のユーザーは変更できません' });
    const user = await loadMine(targetId);
    if (!user) return send(res, 404, { error: 'ユーザーが見つかりません' });
    if (name !== undefined) user.name = String(name).trim() || user.name;
    if (role !== undefined && me.super && targetId !== me.id) user.role = role === 'admin' ? 'admin' : 'member';
    if (password) user.password = hashPassword(password);
    await r.set(key('user', user.id), user);
    return send(res, 200, { user: publicUser(user, tenant) });
  }

  if (req.method === 'DELETE') {
    if (!me.super) return send(res, 403, { error: 'ユーザーの削除は運営者のみできます' });
    const id = req.query?.id || body(req).id;
    if (!id) return send(res, 400, { error: 'IDがありません' });
    if (id === me.id) return send(res, 400, { error: '自分自身は削除できません' });
    const user = await loadMine(id);
    if (!user) return send(res, 404, { error: 'ユーザーが見つかりません' });
    await deleteUser(user);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});
