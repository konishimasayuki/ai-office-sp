import {
  DEFAULT_LIMITS,
  USERNAME_RE,
  body,
  createTenant,
  getTenant,
  hashPassword,
  key,
  listTenants,
  listUsers,
  publicUser,
  redis,
  saveTenant,
  send,
  tkey,
  withAuth,
} from './_lib.js';

const month = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7).replace('-', '');

// 運営者だけが使う：会社の一覧・追加・上限と利用状態の変更
export default withAuth(
  async (req, res) => {
    const r = redis();
    if (req.method === 'GET') {
      const list = await listTenants();
      const m = month();
      const [members, costs] = await Promise.all([Promise.all(list.map((t) => listUsers(t.id))), list.length ? r.mget(...list.map((t) => tkey(t.id, 'ai', 'cost', m))) : []]);
      return send(res, 200, {
        tenants: list.map((t, i) => ({
          ...t,
          limits: { ...DEFAULT_LIMITS, ...(t.limits || {}) },
          users: members[i].length,
          accounts: members[i].map((u) => ({ id: u.id, username: u.username, name: u.name, super: !!u.super })),
          costMonth: Math.round(Number(costs[i] || 0)),
        })),
      });
    }
    if (req.method === 'POST') {
      const b = body(req);
      const name = String(b.name || '').trim();
      const uname = String(b.adminUsername || '').trim();
      if (!name || !uname || !b.password) return send(res, 400, { error: '会社名・管理者のログインID・パスワードは必須です' });
      if (!USERNAME_RE.test(uname)) return send(res, 400, { error: 'ログインIDは半角英数字と . _ - で入力してください' });
      if (await r.get(key('username', uname.toLowerCase()))) return send(res, 409, { error: 'このログインIDは使われています' });
      const { tenant, user } = await createTenant({ name: name.slice(0, 80), adminUsername: uname, adminName: String(b.adminName || '').trim() || '管理者', password: b.password });
      return send(res, 201, { tenant, user: publicUser(user, tenant) });
    }
    if (req.method === 'PUT') {
      const b = body(req);
      const t = await getTenant(b.id);
      if (!t) return send(res, 404, { error: '会社が見つかりません' });
      if (b.name !== undefined) t.name = String(b.name).trim().slice(0, 80) || t.name;
      if (b.status === 'active' || b.status === 'stopped') t.status = b.status;
      if (b.limits) {
        const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
        const cur = { ...DEFAULT_LIMITS, ...(t.limits || {}) };
        t.limits = { ...cur, caseYen: n(b.limits.caseYen, cur.caseYen), dayYen: n(b.limits.dayYen, cur.dayYen) };
      }
      // パスワードの再発行（その会社のユーザー1人を指定）
      if (b.userId && b.password) {
        const u = await r.get(key('user', String(b.userId)));
        if (!u || u.tenantId !== t.id) return send(res, 404, { error: 'ユーザーが見つかりません' });
        u.password = hashPassword(b.password);
        await r.set(key('user', u.id), u);
      }
      await saveTenant(t);
      return send(res, 200, { tenant: t });
    }
    return send(res, 405, { error: 'Method Not Allowed' });
  },
  { superOnly: true },
);
