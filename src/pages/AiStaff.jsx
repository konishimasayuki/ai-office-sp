import { useCallback, useEffect, useRef, useState } from 'react';
import Office from '../ai/Office.jsx';
import { look } from '../ai/agents.js';
import { mdToHtml } from '../ai/markdown.js';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

const TABS = [
  ['office', 'オフィス'],
  ['chat', '秘書チャット'],
  ['board', '案件ボード'],
  ['inbox', '承認箱'],
  ['outputs', '成果物'],
];
const TASK_LABEL = { todo: '未着手', doing: '作業中', done: '完了', error: 'エラー' };
const CASE_LABEL = { active: '進行中', review: '確認待ち', done: '完了' };
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const yen = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;

export default function AiStaff({ me, onAuthError, onGo }) {
  const [tab, setTab] = useState('office');
  const [office, setOffice] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');

  const loadOffice = useCallback(async () => {
    try {
      setOffice(await api.aiOffice());
    } catch (e) {
      onAuthError(e);
      setError(e.message);
    }
  }, [onAuthError]);

  useEffect(() => {
    loadOffice();
    const t = window.setInterval(loadOffice, 8000);
    return () => window.clearInterval(t);
  }, [loadOffice]);

  const s = office?.stats;
  return (
    <section className="page ai-page">
      <div className="ai-head">
        <div>
          <h1>AI社員たちが、あなたの代わりに働いています。</h1>
          <p className="muted">アイデアを仕組みに、時間を自由に。</p>
        </div>
      </div>

      {office && !office.office.profileReady && (
        <div className="ai-notice">
          会社プロフィールがまだ入っていません。AI社員は会社の事業・商品・料金を知らないまま作業します。
          {me.role === 'admin' ? (
            <button type="button" className="btn gold sm" onClick={() => onGo('profile')}>
              会社プロフィールを入力する
            </button>
          ) : (
            '管理者に入力を依頼してください。'
          )}
        </div>
      )}

      {office && !office.apiReady && (
        <div className="ai-notice">
          ClaudeのAPIキーがまだ設定されていません。Vercelの「Settings → Environment Variables」に <code>ANTHROPIC_API_KEY</code> を追加して、Redeployしてください。
        </div>
      )}

      <div className="ai-stats">
        <div className="ai-stat">
          <span className="ai-stat-ic">AI</span>
          <div>
            <small>稼働中のAI社員</small>
            <b>
              {office ? office.agents.length : '-'}
              <em>体</em>
            </b>
            <span>うち作業中 {office ? office.agents.filter((a) => a.state === 'working').length : 0}</span>
          </div>
        </div>
        <div className="ai-stat">
          <span className="ai-stat-ic green">✓</span>
          <div>
            <small>タスク</small>
            <b>
              {s ? s.tasksOpen + s.tasksDone : '-'}
              <em>件</em>
            </b>
            <span>
              完了 {s?.tasksDone || 0}／残り {s?.tasksOpen || 0}
            </span>
          </div>
        </div>
        <button type="button" className="ai-stat link" onClick={() => setTab('inbox')}>
          <span className="ai-stat-ic blue">!</span>
          <div>
            <small>承認待ち</small>
            <b>
              {s ? s.inbox : '-'}
              <em>件</em>
            </b>
            <span>あなたの確認が必要です</span>
          </div>
        </button>
        <div className="ai-stat">
          <span className="ai-stat-ic gold">¥</span>
          <div>
            <small>今月のAI費用</small>
            <b>{s ? yen(s.costMonth) : '-'}</b>
            <span>
              今日 {yen(s?.costDay)}／上限 {yen(office?.limits?.dayYen)}
            </span>
          </div>
        </div>
        <div className="ai-cta">
          <p>AIたちが働いている間に、やりたいことをやりましょう。</p>
          <button type="button" className="btn gold sm" onClick={() => setTab('chat')}>
            秘書の佐藤に指示する →
          </button>
        </div>
      </div>

      <div className="ai-tabs" role="tablist">
        {TABS.map(([k2, l]) => (
          <button key={k2} type="button" role="tab" aria-selected={tab === k2} className={tab === k2 ? 'on' : ''} onClick={() => setTab(k2)}>
            {l}
            {k2 === 'inbox' && s?.inbox > 0 && <b className="tab-badge">{s.inbox}</b>}
          </button>
        ))}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {tab === 'office' && office && (
        <>
          <Office agents={office.agents} future={office.future} sign={office.office.sign} tagline={office.office.tagline} />
          <div className="ai-news">
            <b>お知らせ</b>
            <div className="ai-news-list">
              {office.logs.length === 0 ? (
                <span className="muted small">まだ動きはありません。秘書チャットから指示を出してください。</span>
              ) : (
                office.logs.map((l) => (
                  <span key={l.id}>
                    <i>{fmtTime(l.at)}</i>
                    {l.text}
                  </span>
                ))
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'chat' && <Chat me={me} examples={office?.office.examples || []} onAuthError={onAuthError} onChanged={loadOffice} onGo={setTab} />}
      {tab === 'board' && <Board me={me} onAuthError={onAuthError} onChanged={loadOffice} onView={setViewing} />}
      {tab === 'inbox' && <Inbox onAuthError={onAuthError} onChanged={loadOffice} onView={setViewing} />}
      {tab === 'outputs' && <Outputs onAuthError={onAuthError} onView={setViewing} />}

      {viewing && <OutputModal id={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

// ---------- 秘書チャット ----------
const DEFAULT_EXAMPLES = ['新しいお客さんを増やす方法を考えて', '新サービスのチラシを作って', '今月の営業先リストと営業メールを用意して'];

function Chat({ me, examples, onAuthError, onChanged, onGo }) {
  const [chat, setChat] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      setChat((await api.aiChat()).chat);
    } catch (e) {
      onAuthError(e);
    }
  }, [onAuthError]);
  useEffect(() => {
    load();
  }, [load]);
  const count = chat.length + (busy ? 1 : 0);
  useEffect(() => {
    if (count >= 0) end.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const sendMsg = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    setErr('');
    setBusy(true);
    setChat((c) => [...c, { id: `tmp${Date.now()}`, from: 'user', text: t, at: new Date().toISOString() }]);
    try {
      await api.aiSend(t);
    } catch (e) {
      onAuthError(e);
      setErr(e.message);
    } finally {
      await load();
      onChanged();
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!(await confirm('会話の履歴を消します。案件と成果物は残ります。よろしいですか？', { ok: '消す', danger: true }))) return;
    await api.aiClearChat();
    load();
  };

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="bubble-ic" style={{ background: look('sato').color }}>
          秘
        </span>
        <div>
          <b>秘書 佐藤</b>
          <small>指示を案件にまとめ、部署AIに振り分けます</small>
        </div>
        <button type="button" className="btn ghost sm" onClick={clear}>
          履歴を消す
        </button>
      </div>
      <div className="chat-body">
        {chat.length === 0 && (
          <div className="chat-hint">
            <p>例えば、こんなふうに話しかけてください。</p>
            {(examples.length ? examples : DEFAULT_EXAMPLES).map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
        {chat.map((m) => (
          <div key={m.id} className={`msg ${m.from}`}>
            {m.from === 'sato' && (
              <span className="bubble-ic sm" style={{ background: look('sato').color }}>
                秘
              </span>
            )}
            <div className="msg-body">
              {m.from === 'user' && m.name && m.name !== me.name && <small className="msg-name">{m.name}さん</small>}
              <p>{m.text}</p>
              {m.caseId && (
                <button type="button" className="msg-link" onClick={() => onGo('board')}>
                  案件ボードで見る →
                </button>
              )}
              <small>{fmtTime(m.at)}</small>
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg sato">
            <span className="bubble-ic sm" style={{ background: look('sato').color }}>
              秘
            </span>
            <div className="msg-body typing">
              <i />
              <i />
              <i />
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      <div className="chat-input">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendMsg();
          }}
          placeholder="佐藤に指示する（例：新しいお客さんを増やしたい）"
        />
        <button type="button" className="btn gold" onClick={sendMsg} disabled={busy || !text.trim()}>
          送信
        </button>
      </div>
    </div>
  );
}

// ---------- 案件ボード ----------
// 案件は自動で1タスクずつ進む。画面は数秒ごとに最新の状態を読み直す
const isRunning = (c) =>
  c.auto !== false && c.status === 'active' && c.tasks.some((t) => t.status === 'todo' || t.status === 'doing') && !c.tasks.some((t) => t.status === 'error');

function Board({ me, onAuthError, onChanged, onView }) {
  const [cases, setCases] = useState([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const kicked = useRef(false);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      const list = (await api.aiCases()).cases;
      setCases(list);
      return list;
    } catch (e) {
      onAuthError(e);
      return [];
    }
  }, [onAuthError]);

  // 開いたときに、止まっている案件があれば自動進行を呼び直す
  useEffect(() => {
    load().then((list) => {
      if (kicked.current) return;
      kicked.current = true;
      for (const c of list) if (isRunning(c)) api.aiKick(c.id).catch(() => {});
    });
  }, [load]);

  const anyRunning = cases.some(isRunning);
  useEffect(() => {
    if (!anyRunning) return;
    const t = window.setInterval(() => {
      load();
      onChanged();
    }, 4000);
    return () => window.clearInterval(t);
  }, [anyRunning, load, onChanged]);

  const setAuto = async (c, on) => {
    setBusy(c.id);
    setErr('');
    try {
      await api.aiAuto(c.id, on);
      await load();
      onChanged();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const runOne = async (c, t) => {
    setBusy(t.id);
    setErr('');
    try {
      await api.aiRun(c.id, t.id);
    } catch (e) {
      onAuthError(e);
      setErr(e.message);
    } finally {
      setBusy('');
      await load();
      onChanged();
    }
  };

  const remove = async (c) => {
    if (!(await confirm(`案件「${c.title}」と成果物を削除します。よろしいですか？`, { ok: '削除する', danger: true }))) return;
    await api.aiDeleteCase(c.id);
    load();
    onChanged();
  };

  if (!cases.length) return <div className="empty">案件はまだありません。秘書チャットから佐藤に指示を出すと、ここに案件ができて自動で進みます。</div>;
  return (
    <div className="cases">
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      {cases.map((c) => {
        const running = isRunning(c);
        const paused = c.auto === false && c.status === 'active' && c.tasks.some((t) => t.status !== 'done');
        const failed = c.tasks.some((t) => t.status === 'error');
        const done = c.tasks.filter((t) => t.status === 'done').length;
        return (
          <article key={c.id} className="case">
            <div className="case-head">
              <div>
                <span className={`case-st cs-${c.status}`}>{CASE_LABEL[c.status] || c.status}</span>
                {running && <span className="auto-st">自動で進行中</span>}
                {paused && <span className="auto-st paused">一時停止中</span>}
                {failed && <span className="auto-st failed">エラーで停止</span>}
                <h3>{c.title}</h3>
                <p className="muted small">
                  {c.division || c.company}・{c.ownerName ? `${c.ownerName}さん・` : ''}
                  {fmtTime(c.createdAt)}・{c.goal}
                </p>
                <div className="case-prog">
                  <span className="cl-bar">
                    <i style={{ width: `${(done / c.tasks.length) * 100}%` }} />
                  </span>
                  {done}/{c.tasks.length} 完了
                </div>
              </div>
              <div className="case-actions">
                {running && (
                  <button type="button" className="btn ghost sm" disabled={busy === c.id} onClick={() => setAuto(c, false)}>
                    一時停止
                  </button>
                )}
                {(paused || failed) && (
                  <button type="button" className="btn gold sm" disabled={busy === c.id} onClick={() => setAuto(c, true)}>
                    {failed ? 'やり直して再開' : '再開する'}
                  </button>
                )}
                {me.role === 'admin' && (
                  <button type="button" className="btn danger-ghost sm" onClick={() => remove(c)}>
                    削除
                  </button>
                )}
              </div>
            </div>
            <ul className="ctasks">
              {c.tasks.map((t) => {
                const a = look(t.agent);
                return (
                  <li key={t.id} className={`ctask ts-${t.status}`}>
                    <span className={`bubble-ic${t.status === 'doing' ? ' working' : ''}`} style={{ background: a.color }}>
                      {a.icon}
                    </span>
                    <div className="ctask-main">
                      <b>{t.title}</b>
                      <small>
                        {a.dept} {a.name}・
                        <span className={`tst tst-${t.status}`}>{t.status === 'doing' ? '作業中…' : t.status === 'todo' && running ? '順番待ち' : TASK_LABEL[t.status]}</span>
                        {t.feedback ? '・差し戻しあり' : ''}
                      </small>
                      {t.status === 'error' && <small className="err-line">{t.error}</small>}
                    </div>
                    <div className="ctask-act">
                      {t.outputId && t.status === 'done' && (
                        <button type="button" className="btn ghost sm" onClick={() => onView(t.outputId)}>
                          見る
                        </button>
                      )}
                      {paused && t.status === 'todo' && (
                        <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => runOne(c, t)}>
                          {busy === t.id ? '作業中…' : 'これだけ実行'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

// ---------- 承認箱 ----------
function Inbox({ onAuthError, onChanged, onView }) {
  const [items, setItems] = useState([]);
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setItems((await api.aiInbox()).inbox);
    } catch (e) {
      onAuthError(e);
    }
  }, [onAuthError]);
  useEffect(() => {
    load();
  }, [load]);

  const [err, setErr] = useState('');
  const decide = async (it, decision) => {
    setBusy(it.id);
    setErr('');
    try {
      await api.aiDecide(it.id, decision, note[it.id] || '');
    } catch (e) {
      setErr(e.message);
    } finally {
      await load();
      onChanged();
      setBusy('');
    }
  };

  const open = items.filter((i) => i.status === 'open');
  const closed = items.filter((i) => i.status === 'approved' || i.status === 'returned').slice(0, 20);
  const waitingOf = (caseId) => open.filter((i) => i.caseId === caseId && i.type === 'approval').length;
  return (
    <div className="inbox">
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      {open.length === 0 && <div className="empty">承認待ちはありません。</div>}
      {open.map((it) => (
        <article key={it.id} className={`inbox-item t-${it.type}`}>
          <div className="inbox-top">
            <span className="inbox-type">{it.type === 'approval' ? '承認依頼' : it.type === 'report' ? '完了報告' : '判断依頼'}</span>
            <small className="muted">{fmtTime(it.at)}</small>
          </div>
          <h3>{it.title}</h3>
          <p className="muted small">{it.detail}</p>
          {it.review && <ReviewNote review={it.review} />}
          {it.type === 'approval' && (
            <textarea rows={2} placeholder="差し戻す場合は、直してほしい点を書く" value={note[it.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [it.id]: e.target.value }))} />
          )}
          <div className="inbox-act">
            {it.outputId && (
              <button type="button" className="btn ghost sm" onClick={() => onView(it.outputId)}>
                中身を見る
              </button>
            )}
            {it.type === 'approval' && (
              <button type="button" className="btn danger-ghost sm" disabled={busy === it.id} onClick={() => decide(it, 'return')}>
                差し戻す
              </button>
            )}
            {it.type === 'report' && waitingOf(it.caseId) > 0 ? (
              <span className="muted small">承認待ちが{waitingOf(it.caseId)}件あるため、まだ完了できません</span>
            ) : (
              <button type="button" className="btn gold sm" disabled={busy === it.id} onClick={() => decide(it, 'approve')}>
                {it.type === 'report' ? '確認した（案件を完了）' : '承認する'}
              </button>
            )}
          </div>
        </article>
      ))}
      {closed.length > 0 && (
        <>
          <h4 className="inbox-sub">処理済み</h4>
          <ul className="inbox-done">
            {closed.map((it) => (
              <li key={it.id}>
                <span className={`ok-${it.status}`}>{it.status === 'returned' ? '差し戻し' : '承認'}</span>
                {it.title}
                <small>{fmtTime(it.decidedAt)}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ---------- 成果物 ----------
function Outputs({ onAuthError, onView }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    api
      .aiOutputs()
      .then((r) => setList(r.outputs))
      .catch(onAuthError);
  }, [onAuthError]);
  if (!list.length) return <div className="empty">成果物はまだありません。</div>;
  return (
    <ul className="outs">
      {list.map((o) => {
        const a = look(o.agent);
        return (
          <li key={o.id}>
            <button type="button" className="out" onClick={() => onView(o.id)}>
              <span className="bubble-ic" style={{ background: a.color }}>
                {a.icon}
              </span>
              <span className="out-main">
                <b>{o.title}</b>
                <small>
                  {a.dept} {a.name}・{fmtTime(o.createdAt)}・{o.kind === 'html' ? 'チラシ（HTML）' : '文書'}
                </small>
              </span>
              <span className={`out-st os-${o.status}`}>
                {o.status === 'pending' ? '承認待ち' : o.status === 'approved' ? '承認済み' : o.status === 'returned' ? '差し戻し' : '提出済み'}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OutputModal({ id, onClose }) {
  const [o, setO] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api.aiOutput(id).then((r) => setO(r.output));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(o.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* コピーできない環境では何もしない */
    }
  };
  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{o ? o.title : '読み込み中…'}</h2>
          <button type="button" className="x" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {o?.review && <ReviewNote review={o.review} />}
        {o &&
          (o.kind === 'html' ? (
            <iframe title={o.title} className="out-frame" sandbox="" srcDoc={o.content} />
          ) : (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: mdToHtml でエスケープ済み
            <div className="md" dangerouslySetInnerHTML={{ __html: mdToHtml(o.content) }} />
          ))}
        {o && (
          <div className="modal-foot">
            <small className="muted">
              {look(o.agent).dept} {look(o.agent).name}・{fmtTime(o.createdAt)}・費用 約{o.cost}円
            </small>
            <button type="button" className="btn ghost sm" onClick={copy}>
              {copied ? 'コピーしました' : o.kind === 'html' ? 'HTMLをコピー' : '本文をコピー'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewNote({ review }) {
  return (
    <div className={`review ${review.ok ? 'ok' : 'warn'}`}>
      <b>
        <span className="bubble-ic sm" style={{ background: look('sato').color }}>
          秘
        </span>
        秘書 佐藤のチェック：{review.ok ? 'OK' : '指摘が残っています'}
      </b>
      {review.summary && <p>{review.summary}</p>}
      {!review.ok && review.comments?.length > 0 && (
        <ul>
          {review.comments.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
