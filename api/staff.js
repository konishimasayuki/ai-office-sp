import { AGENTS, LOCKED, agentOf } from './_agents.js';
import { body, loadStaff, redis, send, tkey, withAuth } from './_lib.js';

// AI社員の設定（会社ごと）：名前・口調・使う/使わない
// GET: 全員 / PUT: 管理者
export default withAuth(async (req, res, me) => {
  const list = (staff) =>
    Object.keys(AGENTS).map((id) => ({
      ...agentOf(staff, id),
      defaultName: AGENTS[id].name,
      defaultTone: AGENTS[id].tone,
      locked: LOCKED.includes(id),
      search: AGENTS[id].search || 0,
    }));
  if (req.method === 'GET') return send(res, 200, { agents: list(await loadStaff(me.tenantId)) });
  if (req.method === 'PUT') {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ変更できます' });
    const input = body(req).agents || {};
    const staff = {};
    const names = new Set();
    for (const id of Object.keys(AGENTS)) {
      const v = input[id] || {};
      const name = String(v.name || '')
        .replace(/[\r\n]/g, '')
        .trim()
        .slice(0, 8);
      const tone = String(v.tone || '')
        .replace(/[\r\n]/g, ' ')
        .trim()
        .slice(0, 80);
      const finalName = name || AGENTS[id].name;
      if (names.has(finalName)) return send(res, 400, { error: `「${finalName}」が重複しています。名前は1人ずつ変えてください` });
      names.add(finalName);
      staff[id] = { name: name === AGENTS[id].name ? '' : name, tone: tone === AGENTS[id].tone ? '' : tone, enabled: LOCKED.includes(id) ? true : v.enabled !== false };
    }
    await redis().set(tkey(me.tenantId, 'staff'), staff);
    return send(res, 200, { agents: list(staff) });
  }
  return send(res, 405, { error: 'Method Not Allowed' });
});
