import { useEffect, useState } from 'react';
import { api } from '../api.js';

// プッシュ通知のオン・オフ（承認待ち・判断依頼・完了報告・停止・費用8割を知らせる）
const toKey = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export default function PushCard({ onFlash, onError }) {
  const [state, setState] = useState('loading'); // loading / unsupported / needInstall / denied / off / on
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!supported()) return setState(isIOS() && !standalone() ? 'needInstall' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return setState('off');
        const r = await api.pushInfo(sub.endpoint);
        setState(r.subscribed ? 'on' : 'off');
      } catch {
        setState('off');
      }
    })();
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await api.pushInfo();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      await api.pushSubscribe(sub.toJSON());
      setState('on');
      onFlash('この端末で通知を受け取れるようにしました');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.pushUnsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
      onFlash('この端末の通知をオフにしました');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await api.pushTest();
      onFlash(r.sent ? 'テスト通知を送りました' : '通知を受け取れる端末がありません');
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card push-card">
      <h2>スマホへの通知</h2>
      <p className="muted small">承認待ち・判断依頼・完了報告・作業の停止・費用が上限の8割に達したときに、この端末へ通知します。</p>
      {state === 'loading' && <p className="muted small">確認中…</p>}
      {state === 'needInstall' && <p className="push-note">iPhoneでは、Safariの共有ボタンから「ホーム画面に追加」をして、ホーム画面のアイコンから開くと通知をオンにできます。</p>}
      {state === 'unsupported' && <p className="push-note">このブラウザは通知に対応していません。iPhoneはホーム画面に追加したアプリ、PCはChrome・Edge・Safariで使えます。</p>}
      {state === 'denied' && <p className="push-note">通知がブロックされています。端末の設定（iPhoneは「設定」→「通知」→「マカセル」）で許可してください。</p>}
      {(state === 'off' || state === 'on') && (
        <div className="push-row">
          <span className={`push-st ${state}`}>{state === 'on' ? 'この端末で受け取る' : 'オフ'}</span>
          {state === 'on' ? (
            <>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={test}>
                テスト通知
              </button>
              <button type="button" className="btn danger-ghost sm" disabled={busy} onClick={turnOff}>
                オフにする
              </button>
            </>
          ) : (
            <button type="button" className="btn gold sm" disabled={busy} onClick={turnOn}>
              通知をオンにする
            </button>
          )}
        </div>
      )}
    </div>
  );
}
