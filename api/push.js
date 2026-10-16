import { body, send, withAuth } from './_lib.js';
import { hasSubscription, notify, removeSubscription, saveSubscription, vapid } from './_push.js';

// プッシュ通知の登録
// GET: 公開鍵と、この端末が登録済みか / POST: 登録 / POST ?action=test: テスト通知 / DELETE: 解除
export default withAuth(async (req, res, me) => {
  const q = req.query || {};
  if (req.method === 'GET') {
    const v = await vapid();
    return send(res, 200, { publicKey: v.publicKey, subscribed: q.endpoint ? await hasSubscription(me.tenantId, q.endpoint) : false });
  }
  if (req.method === 'POST' && q.action === 'test') {
    const n = await notify(me.tenantId, { title: 'テスト通知', body: 'プッシュ通知が届いています。承認待ちや完了をお知らせします。', tag: 'test' });
    return send(res, 200, { sent: n });
  }
  if (req.method === 'POST') {
    const sub = body(req).subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return send(res, 400, { error: '通知の登録情報が足りません' });
    await saveSubscription(me.tenantId, me.id, { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    const endpoint = body(req).endpoint || q.endpoint;
    if (endpoint) await removeSubscription(me.tenantId, endpoint);
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: 'Method Not Allowed' });
});
