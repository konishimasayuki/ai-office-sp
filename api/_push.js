import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { key, redis, tkey } from './_lib.js';

// Web Push の鍵（VAPID）は初回に自動で作ってRedisに保存する（環境変数の設定は不要）
export async function vapid() {
  const r = redis();
  let v = await r.get(key('vapid'));
  if (!v?.publicKey) {
    const made = webpush.generateVAPIDKeys();
    await r.set(key('vapid'), made, { nx: true });
    v = await r.get(key('vapid'));
  }
  return v;
}

const subKey = (tid) => tkey(tid, 'push');
const idOf = (endpoint) => createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 32);

export async function saveSubscription(tid, userId, sub) {
  await redis().hset(subKey(tid), { [idOf(sub.endpoint)]: { sub, userId, at: new Date().toISOString() } });
}
export async function removeSubscription(tid, endpoint) {
  await redis().hdel(subKey(tid), idOf(endpoint));
}
export async function hasSubscription(tid, endpoint) {
  return !!(await redis().hget(subKey(tid), idOf(endpoint)));
}

// 会社のすべての端末に通知する。失敗しても本体の処理は止めない
export async function notify(tid, { title, body, url = '/#/ai', tag = '' }) {
  try {
    const all = (await redis().hgetall(subKey(tid))) || {};
    const entries = Object.entries(all);
    if (!entries.length) return 0;
    const v = await vapid();
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@makaseru.jp', v.publicKey, v.privateKey);
    const payload = JSON.stringify({ title, body: String(body || '').slice(0, 180), url, tag });
    let sent = 0;
    await Promise.all(
      entries.map(async ([id, s]) => {
        try {
          await webpush.sendNotification(s.sub, payload, { TTL: 86400 });
          sent++;
        } catch (e) {
          // 期限切れ・解除済みの端末は消す
          if (e?.statusCode === 404 || e?.statusCode === 410) await redis().hdel(subKey(tid), id);
        }
      }),
    );
    return sent;
  } catch {
    return 0;
  }
}
