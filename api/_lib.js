import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Redis } from '@upstash/redis';

// キーはすべて mk: で始める。会社ごとのデータは mk:t:{会社ID}: の下に置く
const PREFIX = 'mk';
const SESSION_DAYS = 14;
const COOKIE = 'mk_session';
export const DEFAULT_LIMITS = { caseYen: 500, dayYen: 2000, warnRate: 0.8 };

let client = globalThis.__mkRedis || null;
export function redis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redisの環境変数が設定されていません（VercelのStorageからUpstashを接続してください）');
  client = new Redis({ url, token });
  return client;
}
// テスト用：模擬Redisに差し替える
export function setRedis(r) {
  client = r;
}

export const key = (...parts) => [PREFIX, ...parts].join(':');
export const tkey = (tid, ...parts) => [PREFIX, 't', tid, ...parts].join(':');
export const newId = () => `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
export const now = () => new Date().toISOString();

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(String(password), salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function publicUser(u, tenant) {
  if (!u) return null;
  return {
    id: u.id,
    tenantId: u.tenantId,
    tenantName: tenant?.name || '',
    username: u.username,
    name: u.name,
    role: u.role,
    super: !!u.super,
    createdAt: u.createdAt,
  };
}

// 一覧はMGETでまとめて取得する
export async function getMany(keys) {
  if (!keys || keys.length === 0) return [];
  const vals = await redis().mget(...keys);
  return vals.filter(Boolean);
}

// ---------- 会社（テナント） ----------
export async function getTenant(tid) {
  return tid ? await redis().get(key('tenant', tid)) : null;
}
export async function saveTenant(t) {
  const r = redis();
  await r.set(key('tenant', t.id), t);
  await r.sadd(key('tenants'), t.id);
}
export async function listTenants() {
  const ids = (await redis().smembers(key('tenants'))).map(String);
  const list = await getMany(ids.map((id) => key('tenant', id)));
  return list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
export const limitsOf = (t) => ({ ...DEFAULT_LIMITS, ...(t?.limits || {}) });

// 会社プロフィールの初期値（AIが会社の前提を理解するための情報）
export function emptyProfile(name = '') {
  return {
    companyName: name,
    business: '',
    area: '',
    products: '',
    strengths: '',
    target: '',
    contact: '',
    ngWords: '',
    brandMain: '#0F131A',
    brandAccent: '#C9A45C',
    divisions: [],
    examples: [],
    officeName: '',
  };
}
export async function getProfile(tid) {
  return { ...emptyProfile(), ...((await redis().get(tkey(tid, 'profile'))) || {}) };
}
export async function saveProfile(tid, p) {
  await redis().set(tkey(tid, 'profile'), p);
}

// AI社員の設定（会社ごとの名前・口調・使う/使わない）
export async function loadStaff(tid) {
  return (await redis().get(tkey(tid, 'staff'))) || {};
}

// ---------- ユーザー ----------
export async function listUsers(tid) {
  const ids = (await redis().smembers(tkey(tid, 'users'))).map(String);
  const users = await getMany(ids.map((id) => key('user', id)));
  return users.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
export async function saveUser(u) {
  const r = redis();
  await r.set(key('user', u.id), u);
  await r.set(key('username', u.username.toLowerCase()), u.id);
  await r.sadd(tkey(u.tenantId, 'users'), u.id);
}
export async function deleteUser(u) {
  const r = redis();
  await r.del(key('user', u.id));
  await r.del(key('username', u.username.toLowerCase()));
  await r.srem(tkey(u.tenantId, 'users'), u.id);
}

// 会社を作る（最初の管理者も一緒に作る）
export async function createTenant({ name, adminUsername, adminName, password, isSuper = false, profile = null }) {
  const t = { id: newId(), name, status: 'active', limits: { ...DEFAULT_LIMITS }, createdAt: now() };
  await saveTenant(t);
  await saveProfile(t.id, profile || emptyProfile(name));
  const u = {
    id: newId(),
    tenantId: t.id,
    username: adminUsername,
    name: adminName || '管理者',
    role: 'admin',
    super: isSuper,
    password: hashPassword(password),
    createdAt: now(),
  };
  await saveUser(u);
  return { tenant: t, user: u };
}

// 初回だけ、TEST会社と運営者アカウント z / z を自動で作る
const TEST_PROFILE = {
  ...emptyProfile('TEST株式会社'),
  business: 'テスト用の会社です。地域の小さな会社向けに、ホームページ制作と集客の支援をしています。',
  area: '福岡県福岡市（九州一円）',
  products: 'ホームページ制作 30万円〜／月額保守 1万円／SNS運用代行 月5万円',
  strengths: '少人数で早い対応。打ち合わせから公開まで最短2週間',
  target: '従業員10名以下の店舗・事務所の経営者',
  contact: '電話 092-000-0000（平日9〜18時）／info@example.com',
  ngWords: '「業界No.1」「絶対」などの根拠のない表現',
  divisions: ['HP制作', 'SNS運用', '会社全体'],
  examples: ['HP制作の新しいお客さんを福岡で増やしたい', 'SNS運用代行のチラシを作って', '今月の営業先リストと営業メールを用意して'],
  officeName: 'TEST AI OFFICE',
};
export async function ensureSeed() {
  const r = redis();
  if ((await r.scard(key('tenants'))) > 0) return;
  const got = await r.set(key('seeding'), '1', { nx: true, ex: 30 });
  if (!got) return;
  await createTenant({ name: 'TEST株式会社', adminUsername: 'z', adminName: '運営管理者', password: 'z', isSuper: true, profile: TEST_PROFILE });
}

// ---------- セッション ----------
export function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function setSessionCookie(res, token, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'development' ? '' : ' Secure;';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAgeSec}`);
}

export async function createSession(res, userId) {
  const token = randomBytes(24).toString('hex');
  const ttl = SESSION_DAYS * 86400;
  await redis().set(key('session', token), userId, { ex: ttl });
  setSessionCookie(res, token, ttl);
}

export async function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await redis().del(key('session', token));
  setSessionCookie(res, '', 0);
}

export async function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const r = redis();
  const userId = await r.get(key('session', token));
  if (!userId) return null;
  return (await r.get(key('user', String(userId)))) || null;
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

// ログイン必須のAPIをまとめて守る。会社が停止中なら使えない
export function withAuth(handler, { admin = false, superOnly = false } = {}) {
  return async (req, res) => {
    try {
      await ensureSeed();
      const user = await currentUser(req);
      if (!user) return send(res, 401, { error: 'ログインしてください' });
      const tenant = await getTenant(user.tenantId);
      if (!tenant) return send(res, 401, { error: '会社が見つかりません。運営者にお問い合わせください' });
      if (tenant.status === 'stopped' && !user.super) return send(res, 403, { error: 'この会社の利用は停止中です。運営者にお問い合わせください' });
      if (superOnly && !user.super) return send(res, 403, { error: '運営者のみ操作できます' });
      if (admin && user.role !== 'admin') return send(res, 403, { error: '管理者のみ操作できます' });
      return await handler(req, res, user, tenant);
    } catch (e) {
      return send(res, 500, { error: e.message || 'サーバーエラー' });
    }
  };
}

export const USERNAME_RE = /^[A-Za-z0-9._-]{1,32}$/;
