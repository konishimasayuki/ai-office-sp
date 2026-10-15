import { body, emptyProfile, getProfile, limitsOf, saveProfile, send, withAuth } from './_lib.js';

const str = (v, max) => String(v ?? '').slice(0, max);
const color = (v, d) => (/^#[0-9A-Fa-f]{6}$/.test(String(v || '')) ? String(v) : d);
const lines = (v, max, len) =>
  (Array.isArray(v) ? v : String(v || '').split('\n'))
    .map((x) => String(x).trim())
    .filter(Boolean)
    .slice(0, max)
    .map((x) => x.slice(0, len));

// 会社プロフィール（AIが会社の前提として読む情報）
// GET: 全員 / PUT: 管理者
export default withAuth(async (req, res, me, tenant) => {
  if (req.method === 'GET') {
    return send(res, 200, { profile: await getProfile(me.tenantId), limits: limitsOf(tenant), tenant: { id: tenant.id, name: tenant.name } });
  }
  if (req.method === 'PUT') {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ変更できます' });
    const b = body(req);
    const d = emptyProfile();
    const p = {
      companyName: str(b.companyName, 80).trim() || tenant.name,
      business: str(b.business, 1500),
      area: str(b.area, 300),
      products: str(b.products, 3000),
      strengths: str(b.strengths, 1000),
      target: str(b.target, 600),
      contact: str(b.contact, 500),
      ngWords: str(b.ngWords, 800),
      brandMain: color(b.brandMain, d.brandMain),
      brandAccent: color(b.brandAccent, d.brandAccent),
      divisions: lines(b.divisions, 12, 30),
      examples: lines(b.examples, 5, 80),
      officeName: str(b.officeName, 40).trim(),
    };
    await saveProfile(me.tenantId, p);
    return send(res, 200, { profile: p });
  }
  return send(res, 405, { error: 'Method Not Allowed' });
});
