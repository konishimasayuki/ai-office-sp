import { useCallback, useEffect, useRef, useState } from 'react';
import Office from '../ai/Office.jsx';
import { look, setStaffNames } from '../ai/agents.js';
import { mdToHtml } from '../ai/markdown.js';
import { printOut, saveHtml, saveMarkdown, saveWord } from '../ai/save.js';
import { api } from '../api.js';
import { useConfirm } from '../components/Confirm.jsx';

const TABS = [
  ['office', 'オフィス'],
  ['chat', '秘書チャット'],
  ['board', '案件ボード'],
  ['meetings', '会議室'],
  ['inbox', '承認箱'],
  ['outputs', '成果物'],
];
const TASK_LABEL = { todo: '未着手', doing: '作業中', done: '完了', error: 'エラー', waiting: '判断待ち' };
const CASE_LABEL = { active: '進行中', review: '確認待ち', done: '完了' };
const STAGES = ['案を出す', '反論', '修正案', 'まとめ'];
const fmtTime = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const yen = (n) => `¥${Number(n || 0).toLocaleString('ja-JP')}`;
const tabFromHash = () => {
  const m = window.location.hash.match(/[?&]tab=([a-z]+)/);
  return m && TABS.some(([k]) => k === m[1]) ? m[1] : 'office';
};

export default function AiStaff({ me, onAuthError, onGo }) {
  const [tab, setTabState] = useState(tabFromHash);
  const [office, setOffice] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');

  const setTab = useCallback((t) => {
    setTabState(t);
    window.history.replaceState(null, '', t === 'office' ? '#/ai' : `#/ai?tab=${t}`);
  }, []);

  // 通知から開いたときなど、URLのtabが変わったら合わせる
  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 選んだタブが横スクロールの外に隠れないようにする
  useEffect(() => {
    if (tab) document.querySelector('.ai-tabs .on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [tab]);

  const loadOffice = useCallback(async () => {
    try {
      const r = await api.aiOffice();
      setStaffNames(r.agents);
      setOffice(r);
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
  const sato = look('sato');
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
            <small>承認・判断待ち</small>
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
            秘書の{sato.name}に指示する
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
      {tab === 'board' && <Board me={me} onAuthError={onAuthError} onChanged={loadOffice} onView={setViewing} onGo={setTab} />}
      {tab === 'meetings' && <Meetings onAuthError={onAuthError} onView={setViewing} onGo={setTab} />}
      {tab === 'inbox' && <Inbox onAuthError={onAuthError} onChanged={loadOffice} onView={setViewing} />}
      {tab === 'outputs' && <Outputs onAuthError={onAuthError} onView={setViewing} />}

      {viewing && <OutputModal id={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

// ---------- 秘書チャット ----------
const DEFAULT_EXAMPLES = ['新しいお客さんを増やす方法を考えて', '新サービスのチラシを作って', '値上げするかどうか会議して決めて'];

function Chat({ me, examples, onAuthError, onChanged, onGo }) {
  const [chat, setChat] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef(null);
  const confirm = useConfirm();
  const sato = look('sato');

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
    setChat((c) => [...c, { id: `tmp${Date.now()}`, from: 'user', name: me.name, text: t, at: new Date().toISOString() }]);
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
        <span className="bubble-ic" style={{ background: sato.color }}>
          {sato.icon}
        </span>
        <div>
          <b>
            {sato.dept} {sato.name}
          </b>
          <small>指示を案件にまとめ、部署AIに振り分けます。会議も開きます</small>
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
              <span className="bubble-ic sm" style={{ background: sato.color }}>
                {sato.icon}
              </span>
            )}
            <div className="msg-body">
              {m.from === 'user' && m.name && m.name !== me.name && <small className="msg-name">{m.name}さん</small>}
              <p>{m.text}</p>
              {m.caseId && (
                <button type="button" className="msg-link" onClick={() => onGo('board')}>
                  案件ボードで見る
                </button>
              )}
              <small>{fmtTime(m.at)}</small>
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg sato">
            <span className="bubble-ic sm" style={{ background: sato.color }}>
              {sato.icon}
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
          placeholder={`${sato.name}に指示する（例：新しいお客さんを増やしたい）`}
        />
        <button type="button" className="btn gold" onClick={sendMsg} disabled={busy || !text.trim()}>
          送信
        </button>
      </div>
    </div>
  );
}

// ---------- 案件ボード ----------
// 案件は自動で上から1つずつ進む（会議は4段階）。判断待ちがあればそこで止まる
const firstOpen = (c) => c.tasks.find((t) => t.status !== 'done');
const isRunning = (c) => {
  const t = firstOpen(c);
  return c.auto !== false && c.status === 'active' && !!t && (t.status === 'todo' || t.status === 'doing') && !c.tasks.some((x) => x.status === 'error');
};

function TaskIcon({ t }) {
  const a = look(t.agent);
  if (t.type === 'meeting')
    return (
      <span className={`bubble-ic meet${t.status === 'doing' ? ' working' : ''}`} style={{ background: '#2b3038' }}>
        会
      </span>
    );
  return (
    <span className={`bubble-ic${t.status === 'doing' ? ' working' : ''}`} style={{ background: a.color }}>
      {a.icon}
    </span>
  );
}

function Board({ me, onAuthError, onChanged, onView, onGo }) {
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

  if (!cases.length) return <div className="empty">案件はまだありません。秘書チャットから指示を出すと、ここに案件ができて自動で進みます。</div>;
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
        const waiting = c.tasks.some((t) => t.status === 'waiting');
        const done = c.tasks.filter((t) => t.status === 'done').length;
        return (
          <article key={c.id} className="case">
            <div className="case-head">
              <div>
                <span className={`case-st cs-${c.status}`}>{CASE_LABEL[c.status] || c.status}</span>
                {running && <span className="auto-st">自動で進行中</span>}
                {waiting && <span className="auto-st waiting">判断待ち</span>}
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
                {waiting && (
                  <button type="button" className="btn gold sm" onClick={() => onGo('inbox')}>
                    判断する
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
                const meet = t.type === 'meeting';
                const stage = meet ? Math.min(t.meeting.round || 0, 4) : 0;
                return (
                  <li key={t.id} className={`ctask ts-${t.status}`}>
                    <TaskIcon t={t} />
                    <div className="ctask-main">
                      <b>{t.title}</b>
                      <small>
                        {meet ? `社内会議（${t.meeting.members.map((id) => look(id).name).join('・')}）` : `${a.dept} ${a.name}`}・
                        <span className={`tst tst-${t.status}`}>
                          {t.status === 'doing'
                            ? meet
                              ? `${STAGES[stage] || ''}中…`
                              : '作業中…'
                            : t.status === 'todo' && running
                              ? meet && stage > 0
                                ? `次は${STAGES[stage]}`
                                : '順番待ち'
                              : TASK_LABEL[t.status]}
                        </span>
                        {meet && t.status !== 'done' && ` ${stage}/4`}
                        {t.feedback ? '・差し戻しあり' : ''}
                      </small>
                      {t.status === 'error' && <small className="err-line">{t.error}</small>}
                    </div>
                    <div className="ctask-act">
                      {meet && (t.meeting.log?.length > 0 || t.status === 'doing') && (
                        <button type="button" className="btn ghost sm" onClick={() => onGo('meetings')}>
                          会議室
                        </button>
                      )}
                      {!meet && t.outputId && t.status === 'done' && (
                        <button type="button" className="btn ghost sm" onClick={() => onView(t.outputId)}>
                          見る
                        </button>
                      )}
                      {paused && t.status === 'todo' && (
                        <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => runOne(c, t)}>
                          {busy === t.id ? '作業中…' : meet ? '1段階進める' : 'これだけ実行'}
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

// ---------- 会議室 ----------
function Meetings({ onAuthError, onView, onGo }) {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.aiMeetings();
      setList(r.meetings);
      return r.meetings;
    } catch (e) {
      onAuthError(e);
      return [];
    }
  }, [onAuthError]);
  useEffect(() => {
    load().then((ms) => {
      const live = ms.find((m) => m.status === 'doing' || m.status === 'todo' || m.status === 'waiting');
      setOpen((o) => o || live?.taskId || ms[0]?.taskId || '');
    });
  }, [load]);
  const live = list?.some((m) => m.status === 'doing' || m.status === 'todo');
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [live, load]);

  if (!list) return null;
  if (!list.length)
    return (
      <div className="empty">
        会議はまだありません。秘書チャットで「〜について会議して決めて」と頼むと、AI社員が話し合って議事録を作ります。方針や価格を決める必要があるときは、秘書が自分で会議を開きます。
      </div>
    );
  return (
    <div className="meetings">
      {list.map((m) => {
        const stage = Math.min(m.round || 0, 4);
        const st =
          m.status === 'done' ? '決定' : m.status === 'waiting' ? '判断待ち' : m.status === 'error' ? 'エラー' : m.status === 'doing' ? `${STAGES[stage]}中` : `${stage}/4`;
        const isOpen = open === m.taskId;
        return (
          <article key={m.taskId} className={`meet-card ms-${m.status}`}>
            <button type="button" className="meet-top" onClick={() => setOpen(isOpen ? '' : m.taskId)} aria-expanded={isOpen}>
              <div>
                <span className={`meet-st ms-${m.status}`}>{st}</span>
                <h3>{m.topic}</h3>
                <small className="muted">
                  {m.caseTitle}・{fmtTime(m.at)}
                </small>
              </div>
              <div className="meet-members">
                {[...m.members, 'yamamoto', 'sato'].map((id) => (
                  <span key={id} className="bubble-ic sm" style={{ background: look(id).color }} title={`${look(id).dept} ${look(id).name}`}>
                    {look(id).icon}
                  </span>
                ))}
              </div>
            </button>
            <ol className="meet-steps" aria-label="会議の進み具合">
              {STAGES.map((s, i) => (
                <li key={s} className={i < stage ? 'done' : i === stage && m.status === 'doing' ? 'now' : ''}>
                  {s}
                </li>
              ))}
            </ol>
            {isOpen && (
              <div className="meet-body">
                {(m.decision || m.summary) && (
                  <div className={`meet-result${m.decision ? ' ok' : ''}`}>
                    {m.summary && (
                      <p>
                        <b>まとめ</b>
                        {m.summary}
                      </p>
                    )}
                    {m.decision ? (
                      <p>
                        <b>決定</b>
                        {m.decision}
                      </p>
                    ) : (
                      m.status === 'waiting' && (
                        <p>
                          <b>判断待ち</b>
                          {m.question || '案を選んでください。'}
                          <button type="button" className="btn gold sm" onClick={() => onGo('inbox')}>
                            承認箱で選ぶ
                          </button>
                        </p>
                      )
                    )}
                  </div>
                )}
                {STAGES.slice(0, 3).map((s, r) => {
                  const said = m.log.filter((x) => x.round === r);
                  if (!said.length) return null;
                  return (
                    <section key={s} className="meet-round">
                      <h4>
                        {r + 1}. {s}
                      </h4>
                      {said.map((x) => {
                        const a = look(x.agent);
                        return (
                          <div key={`${x.agent}${x.at}`} className={`meet-say${x.agent === 'yamamoto' ? ' risk' : ''}`}>
                            <span className="bubble-ic sm" style={{ background: a.color }}>
                              {a.icon}
                            </span>
                            <div>
                              <b>
                                {a.dept} {a.name}
                              </b>
                              <p>{x.text}</p>
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
                {m.status === 'doing' && <p className="muted small">話し合っています…（数秒ごとに更新します）</p>}
                {m.outputId && (
                  <button type="button" className="btn ghost sm" onClick={() => onView(m.outputId)}>
                    議事録を開く・保存する
                  </button>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ---------- 承認箱 ----------
const TYPE_LABEL = { approval: '承認依頼', report: '完了報告', decision: '判断依頼' };

function Inbox({ onAuthError, onChanged, onView }) {
  const [items, setItems] = useState([]);
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

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

  const decide = async (it, decision, extra = {}) => {
    setBusy(it.id);
    setErr('');
    try {
      await api.aiDecide(it.id, decision, note[it.id] || '', extra);
    } catch (e) {
      setErr(e.message);
    } finally {
      await load();
      onChanged();
      setBusy('');
    }
  };

  const open = items.filter((i) => i.status === 'open');
  const closed = items.filter((i) => ['approved', 'returned', 'decided'].includes(i.status)).slice(0, 20);
  const waitingOf = (caseId) => open.filter((i) => i.caseId === caseId && (i.type === 'approval' || i.type === 'decision')).length;
  return (
    <div className="inbox">
      {err && (
        <p className="form-error" role="alert">
          {err}
        </p>
      )}
      {open.length === 0 && <div className="empty">承認・判断待ちはありません。</div>}
      {open.map((it) => (
        <article key={it.id} className={`inbox-item t-${it.type}`}>
          <div className="inbox-top">
            <span className="inbox-type">{TYPE_LABEL[it.type] || it.type}</span>
            <small className="muted">{fmtTime(it.at)}</small>
          </div>
          <h3>{it.title}</h3>
          <p className="muted small">{it.detail}</p>
          {it.review && <ReviewNote review={it.review} />}

          {it.type === 'decision' && (
            <div className="options">
              {(it.options || []).map((o, i) => (
                <div key={o.title} className="option">
                  <b>
                    案{i + 1}：{o.title}
                  </b>
                  <p>{o.detail}</p>
                  {o.pros && <small className="pro">よい点：{o.pros}</small>}
                  {o.cons && <small className="con">気になる点：{o.cons}</small>}
                  <button type="button" className="btn gold sm" disabled={busy === it.id} onClick={() => decide(it, 'choose', { choice: i })}>
                    この案で進める
                  </button>
                </div>
              ))}
            </div>
          )}

          {(it.type === 'approval' || it.type === 'decision') && (
            <textarea
              rows={2}
              placeholder={it.type === 'decision' ? '補足や、どの案でもない場合の指示を書く' : '差し戻す場合は、直してほしい点を書く'}
              value={note[it.id] || ''}
              onChange={(e) => setNote((n) => ({ ...n, [it.id]: e.target.value }))}
            />
          )}
          <div className="inbox-act">
            {it.outputId && (
              <button type="button" className="btn ghost sm" onClick={() => onView(it.outputId)}>
                {it.type === 'decision' ? '議事録を見る' : '中身を見る'}
              </button>
            )}
            {it.type === 'decision' && (
              <button type="button" className="btn ghost sm" disabled={busy === it.id || !(note[it.id] || '').trim()} onClick={() => decide(it, 'choose')}>
                書いた指示で決める
              </button>
            )}
            {it.type === 'approval' && (
              <button type="button" className="btn danger-ghost sm" disabled={busy === it.id} onClick={() => decide(it, 'return')}>
                差し戻す
              </button>
            )}
            {it.type === 'report' && waitingOf(it.caseId) > 0 ? (
              <span className="muted small">承認・判断待ちが{waitingOf(it.caseId)}件あるため、まだ完了できません</span>
            ) : (
              it.type !== 'decision' && (
                <button type="button" className="btn gold sm" disabled={busy === it.id} onClick={() => decide(it, 'approve')}>
                  {it.type === 'report' ? '確認した（案件を完了）' : '承認する'}
                </button>
              )
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
                <span className={`ok-${it.status}`}>{it.status === 'returned' ? '差し戻し' : it.status === 'decided' ? '決定' : '承認'}</span>
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
const OUT_ST = { pending: '承認待ち', approved: '承認済み', returned: '差し戻し' };

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
        const minutes = o.title.startsWith('議事録');
        return (
          <li key={o.id}>
            <button type="button" className="out" onClick={() => onView(o.id)}>
              <span className="bubble-ic" style={{ background: minutes ? '#2b3038' : a.color }}>
                {minutes ? '会' : a.icon}
              </span>
              <span className="out-main">
                <b>{o.title}</b>
                <small>
                  {minutes ? '社内会議' : `${a.dept} ${a.name}`}・{fmtTime(o.createdAt)}・{o.kind === 'html' ? 'チラシ（HTML）' : '文書'}
                </small>
              </span>
              <span className={`out-st os-${o.status}`}>{OUT_ST[o.status] || '提出済み'}</span>
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
  const [menu, setMenu] = useState(false);
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
  const act = (fn) => () => {
    setMenu(false);
    fn();
  };
  const footer = o ? `${look(o.agent).dept} ${look(o.agent).name}・${new Date(o.createdAt).toLocaleString('ja-JP')}・AIオフィス マカセルで作成（下書き）` : '';
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
              {look(o.agent).dept} {look(o.agent).name}・{fmtTime(o.createdAt)}
              {o.cost ? `・費用 約${o.cost}円` : ''}
            </small>
            <div className="save-wrap">
              <button type="button" className="btn ghost sm" onClick={copy}>
                {copied ? 'コピーしました' : o.kind === 'html' ? 'HTMLをコピー' : '本文をコピー'}
              </button>
              <button type="button" className="btn gold sm" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
                保存
              </button>
              {menu && (
                <div className="save-menu" role="menu">
                  <button type="button" role="menuitem" onClick={act(() => printOut(o, footer))}>
                    PDF（印刷画面から保存）
                  </button>
                  {o.kind === 'html' ? (
                    <button type="button" role="menuitem" onClick={act(() => saveHtml(o))}>
                      HTMLファイル
                    </button>
                  ) : (
                    <>
                      <button type="button" role="menuitem" onClick={act(() => saveWord(o, footer))}>
                        Wordファイル（.doc）
                      </button>
                      <button type="button" role="menuitem" onClick={act(() => saveMarkdown(o))}>
                        テキスト（Markdown）
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewNote({ review }) {
  const sato = look('sato');
  return (
    <div className={`review ${review.ok ? 'ok' : 'warn'}`}>
      <b>
        <span className="bubble-ic sm" style={{ background: sato.color }}>
          {sato.icon}
        </span>
        {sato.dept} {sato.name}のチェック：{review.ok ? 'OK' : '指摘が残っています'}
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
