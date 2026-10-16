import { randomBytes } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { BRAND } from '../src/brand.js';
import { AGENTS, MAX_TASKS, MODELS, OUTPUT_SPEC, ROSTER, USD_JPY, WEB_SEARCH_USD, agentOf, systemFor, who } from './_agents.js';
import { body, getProfile, getTenant, key, limitsOf, loadStaff, newId, now, redis, send, tkey, withAuth } from './_lib.js';
import { notify } from './_push.js';

// 会社ごとのキー：mk:t:{会社ID}:ai:...
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
const month = () => today().slice(0, 6);
const yen = (n) => Math.round(n * 10) / 10;
const MAX = { chat: 120, log: 60, cases: 200, outputs: 300, inbox: 300 };
const INBOX_URL = '/#/ai?tab=inbox';

// 1つの会社の作業に必要なものをまとめる
async function makeCtx(tid, boss) {
  const tenant = await getTenant(tid);
  if (!tenant) throw new Error('会社が見つかりません');
  const [profile, staff] = await Promise.all([getProfile(tid), loadStaff(tid)]);
  return { r: redis(), tid, tenant, profile, staff, limits: limitsOf(tenant), boss: boss || '担当者さん', k: (...p) => tkey(tid, 'ai', ...p) };
}
const bossName = (name) => `${name || '担当者'}さん`;
const nameOf = (ctx, id) => agentOf(ctx.staff, id).name;
const whoOf = (ctx, id) => who(ctx.staff, id);
const enabled = (ctx, id) => agentOf(ctx.staff, id).enabled;

// ---------- 会話・お知らせ（List：同時に書いても消えない） ----------
async function pushList(ctx, name, item, max) {
  await ctx.r.rpush(ctx.k(name), item);
  await ctx.r.ltrim(ctx.k(name), -max, -1);
}
async function readList(ctx, name) {
  return (await ctx.r.lrange(ctx.k(name), 0, -1)) || [];
}
async function log(ctx, text, agent = '') {
  await pushList(ctx, 'log', { id: newId(), at: now(), text, agent }, MAX.log);
}
async function setAgent(ctx, id, state, activity, caseId = '') {
  await ctx.r.hset(ctx.k('agents'), { [id]: { state, activity, caseId, at: now() } });
}

// ---------- 承認箱（Hash：1件ずつ書くので上書きが起きない） ----------
async function inboxAll(ctx) {
  const all = (await ctx.r.hgetall(ctx.k('inbox'))) || {};
  return Object.values(all).sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
async function putInbox(ctx, item) {
  await ctx.r.hset(ctx.k('inbox'), { [item.id]: item });
}
// 承認箱に入れて、スマホにも知らせる
async function addInbox(ctx, item, push) {
  await putInbox(ctx, item);
  if ((await ctx.r.hlen(ctx.k('inbox'))) > MAX.inbox) {
    const old = (await inboxAll(ctx)).filter((i) => i.status !== 'open').slice(0, 50);
    if (old.length) await ctx.r.hdel(ctx.k('inbox'), ...old.map((i) => i.id));
  }
  if (push) await notify(ctx.tid, { url: INBOX_URL, tag: item.id, ...push });
}

// ---------- 費用 ----------
async function costs(ctx, caseId) {
  const [day, mon, cs] = await Promise.all([ctx.r.get(ctx.k('cost', 'day', today())), ctx.r.get(ctx.k('cost', month())), caseId ? ctx.r.get(ctx.k('cost', 'case', caseId)) : 0]);
  return { day: Number(day || 0), month: Number(mon || 0), case: Number(cs || 0) };
}
async function addCost(ctx, caseId, amount) {
  const dayKey = ctx.k('cost', 'day', today());
  const day = Number(await ctx.r.incrbyfloat(dayKey, amount));
  await ctx.r.expire(dayKey, 3 * 86400);
  await ctx.r.incrbyfloat(ctx.k('cost', month()), amount);
  let cs = 0;
  if (caseId) cs = Number(await ctx.r.incrbyfloat(ctx.k('cost', 'case', caseId), amount));
  // 上限の8割に達したら、1回だけお知らせとプッシュ通知を出す
  const L = ctx.limits;
  const pct = Math.round(L.warnRate * 100);
  if (day >= L.dayYen * L.warnRate && (await ctx.r.set(ctx.k('warn', 'day', today()), '1', { nx: true, ex: 2 * 86400 }))) {
    const text = `今日のAI費用が上限の${pct}%（${Math.round(day)}円／${L.dayYen}円）に達しました`;
    await log(ctx, text, 'sato');
    await notify(ctx.tid, { title: '費用のお知らせ', body: text, tag: 'cost-day' });
  }
  if (caseId && cs >= L.caseYen * L.warnRate && (await ctx.r.set(ctx.k('warn', 'case', caseId), '1', { nx: true, ex: 60 * 86400 }))) {
    const text = `案件のAI費用が上限の${pct}%（${Math.round(cs)}円／${L.caseYen}円）に達しました`;
    await log(ctx, text, 'sato');
    await notify(ctx.tid, { title: '費用のお知らせ', body: text, tag: `cost-${caseId}` });
  }
}
async function guard(ctx, caseId) {
  const c = await costs(ctx, caseId);
  if (c.day >= ctx.limits.dayYen) throw new Error(`今日のAI費用が上限（${ctx.limits.dayYen}円）に達したため止めています`);
  if (caseId && c.case >= ctx.limits.caseYen) throw new Error(`この案件のAI費用が上限（${ctx.limits.caseYen}円）に達したため止めています`);
}

// ---------- Claude API ----------
async function claude(ctx, agentId, { prompt, maxTokens = 2500, caseId = '', search = true }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('VercelにANTHROPIC_API_KEY（ClaudeのAPIキー）が設定されていません');
  const a = AGENTS[agentId];
  const m = MODELS[a.model];
  const payload = { model: m.id, max_tokens: maxTokens, system: systemFor(agentId, ctx), messages: [{ role: 'user', content: prompt }] };
  if (a.search && search) payload.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: a.search }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude APIエラー：${data?.error?.message || res.status}`);
  const u = data.usage || {};
  const searches = u.server_tool_use?.web_search_requests || 0;
  const usd = ((u.input_tokens || 0) * m.in + (u.output_tokens || 0) * m.out) / 1e6 + searches * WEB_SEARCH_USD;
  const cost = usd * USD_JPY;
  await addCost(ctx, caseId, cost);
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return { text, cost: yen(cost) };
}

function parseJson(text) {
  const s = text.replace(/```json|```/g, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b < 0) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

// ---------- 案件・成果物（一覧はSorted Set、中身はMGET） ----------
async function listCases(ctx) {
  const ids = ((await ctx.r.zrange(ctx.k('cases'), 0, MAX.cases - 1, { rev: true })) || []).map(String);
  if (!ids.length) return [];
  const [vals, pauses] = await Promise.all([ctx.r.mget(...ids.map((id) => ctx.k('case', id))), ctx.r.mget(...ids.map((id) => ctx.k('pause', id)))]);
  return vals.map((c, i) => (c ? { ...c, auto: !pauses[i] } : null)).filter(Boolean);
}
async function getCase(ctx, id) {
  return id ? await ctx.r.get(ctx.k('case', String(id))) : null;
}
async function saveCase(ctx, c) {
  c.updatedAt = now();
  await ctx.r.set(ctx.k('case', c.id), c);
  await ctx.r.zadd(ctx.k('cases'), { score: new Date(c.createdAt).getTime(), member: c.id });
}
async function listOutputs(ctx, caseId) {
  const ids = ((await ctx.r.zrange(ctx.k('outputs'), 0, MAX.outputs - 1, { rev: true })) || []).map(String);
  if (!ids.length) return [];
  const vals = (await ctx.r.mget(...ids.map((id) => ctx.k('output', id)))).filter(Boolean);
  return caseId ? vals.filter((o) => o.caseId === caseId) : vals;
}
async function saveOutput(ctx, o) {
  await ctx.r.set(ctx.k('output', o.id), o);
  await ctx.r.zadd(ctx.k('outputs'), { score: new Date(o.createdAt).getTime(), member: o.id });
}

// 案件の区分（会社プロフィールの「事業の区分」。なければ会社名）
const divisionsOf = (p) => (p.divisions?.length ? p.divisions : [p.companyName || '会社全体']);
// 会議で決まったこと（後のタスクに渡す）
const decisionsOf = (c) =>
  c.tasks
    .filter((t) => t.type === 'meeting' && t.meeting?.decision)
    .map((t) => `・${t.meeting.topic}：${t.meeting.decision}`)
    .join('\n');

// 会議の参加者を決める（使っている部署から2〜3人）
function pickMembers(ctx, ids) {
  const ok = (id) => ROSTER.some(([x]) => x === id) && enabled(ctx, id);
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter(ok))].slice(0, 3);
  for (const id of ['takahashi', 'tanaka', 'kobayashi', 'yamada']) {
    if (list.length >= 2) break;
    if (ok(id) && !list.includes(id)) list.push(id);
  }
  return list;
}

// 秘書：指示を受けて返事し、必要なら案件（会議・タスク）を作る
async function secretary(ctx, me, text) {
  await guard(ctx, '');
  await setAgent(ctx, 'sato', 'working', '指示を整理中…');
  const chat = await readList(ctx, 'chat');
  const cases = (await listCases(ctx)).filter((c) => c.status !== 'done').slice(0, 5);
  const sato = nameOf(ctx, 'sato');
  const history = chat
    .slice(-10)
    .map((m) => `${m.from === 'user' ? ctx.boss : sato}：${m.text}`)
    .join('\n');
  const openCases = cases.map((c) => `- ${c.title}（${c.status}）`).join('\n') || 'なし';
  const divs = divisionsOf(ctx.profile);
  const roster = ROSTER.filter(([id]) => enabled(ctx, id));
  const prompt = `これまでの会話：\n${history || 'なし'}\n\n進行中の案件：\n${openCases}\n\n${ctx.boss}の新しいメッセージ：\n${text}\n\n次のJSONだけを返してください（前後に文章を付けない）。
{
  "reply": "${ctx.boss}への返事（結論から、3〜5文）",
  "case": null または {
    "title": "案件名（20字以内）",
    "goal": "この案件のゴール（2〜3文）",
    "division": ${divs.map((d) => JSON.stringify(d)).join(' | ')},
    "meeting": null または { "topic": "会議の議題（40字以内）", "members": ["担当のID", "担当のID"] },
    "tasks": [ { "agent": "担当のID", "title": "タスク名", "brief": "担当への具体的な指示（3〜6文）" } ]
  }
}
担当のID（必要な人だけ選ぶ）：
${roster.map(([id, desc]) => `- ${id}＝${whoOf(ctx, id)}（${desc}）`).join('\n')}
ルール：
・仕事の依頼なら case を作る（質問や雑談なら null）。
・方針・方向性・価格・予算など、作る前に決めることがある場合や、${ctx.boss}が会議・話し合い・相談を求めた場合は meeting を作る。members は議題に関係する担当を2〜3人。会議はタスクより先に行われ、結論は後のタスクに渡される。
・tasks は最大${MAX_TASKS}つ、1人1つまで。会議だけで済むなら空でよい。企画が必要なら企画を最初に、法務チェックが必要なら最後に置く。
・リスク確認のタスクはシステムが自動で足すので入れない。`;
  const { text: out, cost } = await claude(ctx, 'sato', { prompt, maxTokens: 1600 });
  const j = parseJson(out) || { reply: out, case: null };
  let created = null;
  const jc = j.case;
  const rawTasks = Array.isArray(jc?.tasks) ? jc.tasks : [];
  const wantMeeting = jc?.meeting?.topic;
  if (jc && (rawTasks.length || wantMeeting)) {
    const id = newId();
    const tasks = [];
    if (wantMeeting) {
      const members = pickMembers(ctx, jc.meeting.members);
      const topic = String(jc.meeting.topic).slice(0, 60);
      tasks.push({
        id: newId(),
        type: 'meeting',
        agent: 'sato',
        title: `社内会議：${topic}`,
        brief: topic,
        status: 'todo',
        meeting: { topic, members, round: 0, log: [], summary: '', decision: '', options: [], question: '', decided: false },
      });
    }
    const work = rawTasks
      .filter((t, i, arr) => OUTPUT_SPEC[t.agent] && t.agent !== 'yamamoto' && enabled(ctx, t.agent) && arr.findIndex((x) => x.agent === t.agent) === i)
      .slice(0, MAX_TASKS)
      .map((t) => ({
        id: newId(),
        agent: t.agent,
        title: String(t.title || OUTPUT_SPEC[t.agent].label).slice(0, 60),
        brief: String(t.brief || '').slice(0, 1200),
        status: 'todo',
      }));
    tasks.push(...work);
    if (work.length)
      tasks.push({ id: newId(), agent: 'yamamoto', title: '成果物のリスク確認', brief: '法令・費用・競合・実現性の観点で、すべての成果物に反対意見を出す。', status: 'todo' });
    created = {
      id,
      title: String(jc.title || '新しい案件').slice(0, 40),
      goal: String(jc.goal || text).slice(0, 600),
      division: divs.includes(jc.division) ? jc.division : divs[divs.length - 1],
      instruction: text,
      status: 'active',
      auto: true,
      tasks,
      createdAt: now(),
      createdBy: me.id,
      ownerName: me.name,
    };
    await saveCase(ctx, created);
    await log(ctx, `新しい案件「${created.title}」を作りました（${wantMeeting ? '社内会議と' : ''}タスク${work.length ? work.length + 1 : 0}件）`, 'sato');
    for (const t of tasks) {
      if (t.type === 'meeting') for (const m of t.meeting.members) await setAgent(ctx, m, 'assigned', `会議「${t.meeting.topic}」に参加予定`, id);
      else await setAgent(ctx, t.agent, 'assigned', `「${t.title}」を担当`, id);
    }
  }
  await setAgent(ctx, 'sato', 'idle', created ? `案件「${created.title}」を管理中` : '指示待ち');
  return { reply: String(j.reply || '承知しました。').slice(0, 1500), caseId: created?.id || '', cost };
}

// 秘書が、部署AIの成果物を指示どおりかチェックする
async function secretaryReview(ctx, c, t, spec, content) {
  const text =
    spec.kind === 'html'
      ? content
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 5000)
      : content.slice(0, 7000);
  const decided = decisionsOf(c);
  const prompt = `部署AIが作った成果物を、${ctx.boss}に出す前にチェックしてください。

案件：${c.title}
ゴール：${c.goal}
${ctx.boss}の指示：${c.instruction}${decided ? `\n会議で決まったこと：\n${decided}` : ''}
タスク：${t.title}（${t.brief}）
成果物の種類：${spec.label}${spec.kind === 'html' ? '（チラシ。下は画面に出る文字だけを抜き出したもの）' : ''}

---- 成果物 ----
${text}
---- ここまで ----

確認すること：指示とゴール（会議で決まったことがあればそれも）に合っているか／会社名・商品・料金・住所などが会社の前提と矛盾していないか、作り話がないか／誤字や不自然な日本語／${spec.kind === 'html' ? '連絡先・料金・申し込み方法など、チラシに必要な情報が揃っているか' : '根拠のない数字がないか'}。
次のJSONだけを返す：{"ok": true か false, "summary": "全体の評価を1〜2文", "comments": ["直すべき点（なければ空）"]}
ok は、${ctx.boss}にそのまま見せられるなら true、直すべき点が1つでもあれば false。`;
  const { text: out } = await claude(ctx, 'sato', { prompt, maxTokens: 800, caseId: c.id });
  const j = parseJson(out) || { ok: true, summary: out.slice(0, 200), comments: [] };
  return {
    ok: !!j.ok,
    summary: String(j.summary || '').slice(0, 400),
    comments: (Array.isArray(j.comments) ? j.comments : []).map((x) => String(x).slice(0, 300)).slice(0, 8),
  };
}

// 全タスクが終わり、承認待ちも残っていないときだけ完了報告を出す
async function maybeReport(ctx, c) {
  if (!c.tasks.every((x) => x.status === 'done')) return false;
  const mine = (await inboxAll(ctx)).filter((i) => i.caseId === c.id && i.status === 'open');
  if (mine.some((i) => i.type === 'report')) return false;
  c.status = 'review';
  if (mine.some((i) => i.type === 'approval' || i.type === 'decision')) return false;
  await addInbox(
    ctx,
    {
      id: newId(),
      type: 'report',
      caseId: c.id,
      title: `完了報告：${c.title}`,
      detail: '全タスクが終わり、外に出すものもすべて承認済みです。成果物とリスク確認を見て、案件を完了してください。',
      status: 'open',
      at: now(),
    },
    { title: '完了報告', body: `「${c.title}」が終わりました。確認して案件を完了してください。` },
  );
  await log(ctx, `案件「${c.title}」の完了報告を出しました`, 'sato');
  return true;
}

// ---------- 社内会議（案を出す → 反論 → 修正案 → まとめ。1回の呼び出しで1段階） ----------
const MEETING_STAGES = ['案を出す', '反論', '修正案', 'まとめ'];

function transcript(ctx, m, upto) {
  return m.log
    .filter((x) => x.round < upto)
    .map((x) => `【${MEETING_STAGES[x.round]}】${whoOf(ctx, x.agent)}：${x.text}`)
    .join('\n\n');
}

function minutesMd(ctx, c, m) {
  const lines = [
    `# 議事録：${m.topic}`,
    '',
    `- 案件：${c.title}`,
    `- 参加：${[...m.members, 'yamamoto', 'sato'].map((id) => whoOf(ctx, id)).join('、')}`,
    `- 日時：${new Date(m.endedAt || Date.now()).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
    '',
  ];
  lines.push('## まとめ', '', m.summary || '（なし）', '');
  if (m.decision) lines.push('## 決定', '', m.decision, '');
  else if (m.options?.length) {
    lines.push(`## ${ctx.boss}に判断してほしいこと`, '', m.question || '次の案から選んでください。', '');
    m.options.forEach((o, i) => {
      lines.push(`### 案${i + 1}：${o.title}`, '', o.detail || '', '');
      if (o.pros) lines.push(`- よい点：${o.pros}`);
      if (o.cons) lines.push(`- 気になる点：${o.cons}`);
      lines.push('');
    });
  }
  for (let r = 0; r < 3; r++) {
    const xs = m.log.filter((x) => x.round === r);
    if (!xs.length) continue;
    lines.push(`## ${r + 1}. ${MEETING_STAGES[r]}`, '');
    for (const x of xs) lines.push(`**${whoOf(ctx, x.agent)}**`, '', x.text, '');
  }
  return lines.join('\n');
}

async function saveMinutes(ctx, c, t) {
  const m = t.meeting;
  const o = {
    id: t.outputId || newId(),
    caseId: c.id,
    taskId: t.id,
    agent: 'sato',
    kind: 'doc',
    title: `議事録：${m.topic}`,
    content: minutesMd(ctx, c, m),
    status: 'done',
    review: null,
    cost: 0,
    createdAt: t.outputId ? (await ctx.r.get(ctx.k('output', t.outputId)))?.createdAt || now() : now(),
  };
  await saveOutput(ctx, o);
  t.outputId = o.id;
}

async function runMeeting(ctx, c, t) {
  const m = t.meeting;
  const stage = m.round || 0;
  const head = `社内会議の議題：${m.topic}\n案件：${c.title}\nゴール：${c.goal}\n${ctx.boss}の指示：${c.instruction}`;
  const speak = async (agentId, prompt) => {
    await setAgent(ctx, agentId, 'working', `会議「${m.topic}」で${MEETING_STAGES[stage]}…`, c.id);
    const { text } = await claude(ctx, agentId, { prompt, maxTokens: 900, caseId: c.id, search: false });
    await setAgent(ctx, agentId, 'idle', `会議「${m.topic}」で発言しました`, c.id);
    return { round: stage, agent: agentId, text: text.slice(0, 1200), at: now() };
  };
  if (stage === 0) {
    const said = await Promise.all(
      m.members.map((id) => speak(id, `${head}\n\nあなたの担当（${agentOf(ctx.staff, id).dept}）の立場から、議題への案を出してください。結論から、300字以内。`)),
    );
    m.log.push(...said);
  } else if (stage === 1) {
    m.log.push(
      await speak(
        'yamamoto',
        `${head}\n\nこれまでの発言：\n${transcript(ctx, m, 1)}\n\nそれぞれの案に、法令・費用・競合・実現性の観点で反対意見を出してください。案ごとに、400字以内で。`,
      ),
    );
  } else if (stage === 2) {
    const said = await Promise.all(
      m.members.map((id) =>
        speak(
          id,
          `${head}\n\nこれまでの発言：\n${transcript(ctx, m, 2)}\n\n${nameOf(ctx, 'yamamoto')}の指摘を受けて、あなたの案を修正してください。直した点が分かるように、300字以内。`,
        ),
      ),
    );
    m.log.push(...said);
  } else {
    await setAgent(ctx, 'sato', 'working', `会議「${m.topic}」の議事録を作成中…`, c.id);
    const { text } = await claude(ctx, 'sato', {
      caseId: c.id,
      maxTokens: 1500,
      prompt: `${head}\n\n会議の発言：\n${transcript(ctx, m, 3)}\n\n会議をまとめて、次のJSONだけを返してください。
{"summary": "会議のまとめ（3〜5文）", "decided": true か false, "decision": "決まったこと（decided が true のとき。後の担当への指示になるよう具体的に）", "question": "${ctx.boss}に判断してほしいこと（decided が false のとき）", "options": [{"title": "案の名前（20字以内）", "detail": "中身（2〜3文）", "pros": "よい点", "cons": "気になる点"}]}
ルール：予算・価格・会社の方針に関わること、または意見が割れて決めきれないことは decided を false にし、options に2〜3案を出す。それ以外は decided を true にする。`,
    });
    const j = parseJson(text) || { summary: text.slice(0, 600), decided: true, decision: text.slice(0, 600) };
    m.summary = String(j.summary || '').slice(0, 1200);
    m.endedAt = now();
    const opts = (Array.isArray(j.options) ? j.options : [])
      .slice(0, 3)
      .map((o) => ({
        title: String(o.title || '').slice(0, 40),
        detail: String(o.detail || '').slice(0, 500),
        pros: String(o.pros || '').slice(0, 300),
        cons: String(o.cons || '').slice(0, 300),
      }))
      .filter((o) => o.title);
    if (j.decided === false && opts.length >= 2) {
      m.options = opts;
      m.question = String(j.question || '').slice(0, 300);
    } else {
      m.decided = true;
      m.decision = String(j.decision || j.summary || '').slice(0, 1200);
    }
    await setAgent(ctx, 'sato', 'idle', `案件「${c.title}」を管理中`, c.id);
  }
  m.round = stage + 1;
  if (m.round < MEETING_STAGES.length) {
    t.status = 'todo';
    await saveCase(ctx, c);
    await log(ctx, `会議「${m.topic}」：${MEETING_STAGES[stage]}が終わりました`, 'sato');
    return { meeting: true, case: c };
  }
  await saveMinutes(ctx, c, t);
  if (m.decided) {
    t.status = 'done';
    t.doneAt = now();
    await log(ctx, `会議「${m.topic}」で決まりました：${m.decision.slice(0, 60)}`, 'sato');
    await maybeReport(ctx, c);
  } else {
    t.status = 'waiting';
    await addInbox(
      ctx,
      {
        id: newId(),
        type: 'decision',
        caseId: c.id,
        taskId: t.id,
        outputId: t.outputId,
        title: `判断依頼：${m.topic}`,
        detail: m.question || '会議で決めきれませんでした。案を選ぶか、指示を書いてください。',
        options: m.options,
        status: 'open',
        at: now(),
      },
      { title: '判断依頼', body: `会議「${m.topic}」で決めきれませんでした。案を選んでください。` },
    );
    await log(ctx, `会議「${m.topic}」で決めきれず、判断をお願いしました`, 'sato');
  }
  await saveCase(ctx, c);
  return { meeting: true, case: c };
}

// 部署AI：タスクを1つ実行して成果物を作る（会議なら1段階進める）
async function runTask(ctx, caseId, taskId) {
  const c = await getCase(ctx, caseId);
  if (!c) throw new Error('案件が見つかりません');
  const t = c.tasks.find((x) => x.id === taskId);
  if (!t) throw new Error('タスクが見つかりません');
  if (t.status === 'doing') throw new Error('このタスクは実行中です');
  if (t.status === 'waiting') throw new Error('判断待ちです。承認箱で案を選んでください');
  ctx.boss = bossName(c.ownerName);
  await guard(ctx, caseId);
  const label = t.type === 'meeting' ? '社内会議' : OUTPUT_SPEC[t.agent].label;
  t.status = 'doing';
  t.startedAt = now();
  await saveCase(ctx, c);

  if (t.type === 'meeting') {
    try {
      return await runMeeting(ctx, c, t);
    } catch (e) {
      return await failTask(ctx, c, t, label, e);
    }
  }

  const spec = OUTPUT_SPEC[t.agent];
  const me = whoOf(ctx, t.agent);
  await setAgent(ctx, t.agent, 'working', `「${t.title}」を作成中…`, caseId);
  await log(ctx, `${me}が「${t.title}」に取りかかりました`, t.agent);

  const prev = (await listOutputs(ctx, caseId)).filter((o) => o.taskId !== t.id).reverse();
  const prevText = prev
    .map((o) => `### ${o.title}（${whoOf(ctx, o.agent)}）\n${o.kind === 'html' ? '（チラシのHTML。内容は文言のみ参照）\n' : ''}${o.content.slice(0, 3500)}`)
    .join('\n\n');
  const decided = decisionsOf(c);
  const feedback = t.feedback ? `\n\n【差し戻しコメント】\n${t.feedback}\nこのコメントを必ず反映して作り直すこと。` : '';
  const base = `案件：${c.title}\n区分：${c.division}\nゴール：${c.goal}\n${ctx.boss}の指示：${c.instruction}${decided ? `\n\n【会議で決まったこと（必ず従う）】\n${decided}` : ''}\n\nあなたのタスク：${t.title}\n指示：${t.brief}${feedback}`;
  let prompt;
  if (spec.kind === 'html') {
    prompt = `${base}\n\nA4縦1枚のチラシを、HTML1ファイル（CSSは<style>内、画像なし、外部読み込みなし、日本語フォントはsystem-ui）で作ってください。出力はHTMLのみ（<!doctype html>から</html>まで）。連絡先・料金は会社の前提に書かれたものだけを使う。最後にHTMLコメントで、配色とレイアウトの理由を3行で説明すること。${prevText ? `\n\n参考：これまでの成果物\n${prevText}` : ''}`;
  } else if (t.agent === 'yamamoto') {
    prompt = `${base}\n\n次の成果物すべてについて、法令・費用・競合・実現性の観点で反対意見と修正案を出してください。Markdownで、成果物ごとに「重大」「注意」「軽微」の3段階を付けて箇条書きにし、最後に「${ctx.boss}が判断すべきこと」を最大3つまとめる。\n\n${prevText || '（成果物がまだありません。案件の進め方そのものに反論してください）'}`;
  } else {
    prompt = `${base}\n\nMarkdownで、そのまま社内で読める${spec.label}を作ってください（中身：${spec.hint}）。見出し・箇条書き・表を使い、数字や事実には根拠のURLを付けること。${prevText ? `\n\n参考：これまでの成果物\n${prevText}` : ''}`;
  }
  try {
    const { text, cost } = await claude(ctx, t.agent, { prompt, maxTokens: spec.kind === 'html' ? 4000 : 3000, caseId });
    let content = text;
    if (spec.kind === 'html') {
      const a = text.search(/<!doctype html|<html/i);
      const b = text.toLowerCase().lastIndexOf('</html>');
      content = a >= 0 && b > a ? text.slice(a, b + 7) : text;
    }
    // 秘書のチェック（リスク担当以外）。直すべき点があれば1回だけ自動で作り直させる
    let review = null;
    const sato = whoOf(ctx, 'sato');
    if (t.agent !== 'yamamoto') {
      await setAgent(ctx, 'sato', 'working', `「${t.title}」をチェック中…`, caseId);
      review = await secretaryReview(ctx, c, t, spec, content);
      await setAgent(ctx, 'sato', 'idle', `案件「${c.title}」を管理中`, caseId);
      if (!review.ok && !t.reworked) {
        t.reworked = true;
        t.status = 'todo';
        t.feedback = `${sato}からの指摘：\n${review.comments.map((x) => `・${x}`).join('\n') || review.summary}`;
        await saveCase(ctx, c);
        await setAgent(ctx, t.agent, 'assigned', `${nameOf(ctx, 'sato')}の指摘で「${t.title}」を作り直し`, caseId);
        await log(ctx, `${sato}が「${spec.label}」を${nameOf(ctx, t.agent)}に差し戻しました：${review.summary}`, 'sato');
        return { reworked: true, case: c };
      }
      await log(ctx, `${sato}が「${spec.label}」をチェックしました：${review.ok ? 'OK' : '指摘が残っています'}`, 'sato');
    }
    const o = {
      id: t.outputId || newId(),
      caseId,
      taskId: t.id,
      agent: t.agent,
      kind: spec.kind,
      title: `${spec.label}：${c.title}`,
      content,
      status: spec.approval ? 'pending' : 'done',
      review,
      cost,
      createdAt: now(),
    };
    await saveOutput(ctx, o);
    t.outputId = o.id;
    t.status = 'done';
    t.feedback = '';
    t.doneAt = now();
    if (spec.approval) {
      await addInbox(
        ctx,
        {
          id: newId(),
          type: 'approval',
          caseId,
          taskId: t.id,
          outputId: o.id,
          title: `${spec.label}の承認`,
          detail: `${me}が作成し、${sato}がチェックしました。外に出す前に確認してください。`,
          review,
          status: 'open',
          at: now(),
        },
        { title: '承認依頼', body: `${spec.label}（${c.title}）ができました。確認してください。` },
      );
    }
    await maybeReport(ctx, c);
    await saveCase(ctx, c);
    await setAgent(ctx, t.agent, 'idle', `「${t.title}」を提出しました`, caseId);
    await log(ctx, `${me}が「${spec.label}」を提出しました（${cost}円）`, t.agent);
    return { output: o, case: c };
  } catch (e) {
    return await failTask(ctx, c, t, label, e);
  }
}

async function failTask(ctx, c, t, label, e) {
  t.status = 'error';
  t.error = e.message;
  await saveCase(ctx, c);
  if (t.type === 'meeting') for (const id of [...t.meeting.members, 'yamamoto', 'sato']) await setAgent(ctx, id, 'idle', 'エラーで止まりました', c.id);
  else await setAgent(ctx, t.agent, 'idle', 'エラーで止まりました', c.id);
  await log(ctx, `${whoOf(ctx, t.agent)}の「${label}」がエラーで止まりました：${e.message}`, t.agent);
  await notify(ctx.tid, { title: '作業が止まりました', body: `「${c.title}」：${e.message}`, url: '/#/ai?tab=board', tag: `err-${c.id}` });
  throw e;
}

// ---------- 自動で進める仕組み ----------
// 1タスク（会議は1段階）ずつ別の関数呼び出しで実行し、終わったら次を呼ぶ（Vercelの実行時間の上限対策）
const STALE_MS = 6 * 60 * 1000;

async function secret(r) {
  let s = await r.get(key('secret'));
  if (!s) {
    await r.set(key('secret'), randomBytes(24).toString('hex'), { nx: true });
    s = await r.get(key('secret'));
  }
  return String(s);
}

function originOf(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (String(host).startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

async function trigger(r, origin, tid, caseId) {
  try {
    await fetch(`${origin}/api/ai?action=step`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ai-secret': await secret(r) },
      body: JSON.stringify({ tid, caseId }),
    });
  } catch {
    // 呼び出しに失敗しても、案件ボードを開けば再開する
  }
}

// 止まったままの「作業中」を未着手に戻す
function resetStale(c) {
  let changed = false;
  for (const t of c.tasks) {
    if (t.status === 'doing' && Date.now() - new Date(t.startedAt || c.updatedAt).getTime() > STALE_MS) {
      t.status = 'todo';
      changed = true;
    }
  }
  return changed;
}

// 上から順に進める。判断待ちの会議があれば、そこで止まる
const nextTask = (c) => {
  const t = c.tasks.find((x) => x.status !== 'done');
  return t && t.status === 'todo' ? t : null;
};
const canAuto = (c) => c && c.auto !== false && c.status === 'active' && !c.tasks.some((t) => t.status === 'error');
// 一時停止は案件とは別のキーで持つ（実行中のタスクが案件を上書きしても消えないように）
const paused = async (ctx, caseId) => !!(await ctx.r.get(ctx.k('pause', caseId)));

async function processStep(origin, tid, caseId) {
  const ctx = await makeCtx(tid);
  if (ctx.tenant.status === 'stopped') return;
  const got = await ctx.r.set(ctx.k('lock', caseId), '1', { nx: true, ex: 330 });
  if (!got) return;
  let more = false;
  try {
    const c = await getCase(ctx, caseId);
    if (!canAuto(c) || (await paused(ctx, caseId))) return;
    if (resetStale(c)) await saveCase(ctx, c);
    if (c.tasks.some((t) => t.status === 'doing')) return;
    const t = nextTask(c);
    if (!t) return;
    await runTask(ctx, caseId, t.id);
    const after = await getCase(ctx, caseId);
    more = canAuto(after) && !!nextTask(after) && !(await paused(ctx, caseId));
  } catch {
    more = false;
  } finally {
    await ctx.r.del(ctx.k('lock', caseId));
  }
  if (more) await trigger(ctx.r, origin, tid, caseId);
}

async function stepHandler(req, res) {
  try {
    const r = redis();
    if (req.headers['x-ai-secret'] !== (await secret(r))) return send(res, 403, { error: 'forbidden' });
    const { tid, caseId } = body(req);
    if (!tid || !caseId) return send(res, 400, { error: 'tid と caseId が必要です' });
    waitUntil(processStep(originOf(req), String(tid), String(caseId)).catch(() => {}));
    return send(res, 202, { ok: true });
  } catch (e) {
    return send(res, 500, { error: e.message });
  }
}

// 承認箱の判断依頼に答える（案を選ぶ、または指示を書く）
async function decideMeeting(ctx, item, b, req, me) {
  const c = await getCase(ctx, item.caseId);
  const t = c?.tasks.find((x) => x.id === item.taskId);
  if (!t?.meeting) return { error: '会議が見つかりません', status: 404 };
  const idx = Number.isInteger(b.choice) ? b.choice : -1;
  const opt = item.options?.[idx];
  const note = String(b.note || '').trim();
  if (!opt && !note) return { error: '案を選ぶか、指示を書いてください', status: 400 };
  const decision = opt ? `案${idx + 1}「${opt.title}」で進める。${opt.detail}${note ? `\n補足：${note}` : ''}` : `${me.name}さんの指示：${note}`;
  item.status = 'decided';
  item.choice = opt ? idx : null;
  item.note = note.slice(0, 1000);
  item.decidedAt = now();
  item.decidedBy = me.name;
  await putInbox(ctx, item);
  t.meeting.decision = decision.slice(0, 1500);
  t.meeting.decided = true;
  t.status = 'done';
  t.doneAt = now();
  c.status = 'active';
  await saveMinutes(ctx, c, t);
  await maybeReport(ctx, c);
  await saveCase(ctx, c);
  await log(ctx, `${me.name}さんが「${t.meeting.topic}」を決めました：${opt ? opt.title : note.slice(0, 40)}`, '');
  if (nextTask(c) && !(await paused(ctx, c.id))) waitUntil(trigger(ctx.r, originOf(req), me.tenantId, c.id));
  return { item };
}

const main = withAuth(async (req, res, me) => {
  const ctx = await makeCtx(me.tenantId, bossName(me.name));
  const { r, k } = ctx;
  const q = req.query || {};

  if (req.method === 'GET') {
    if (q.view === 'chat') return send(res, 200, { chat: await readList(ctx, 'chat') });
    if (q.view === 'cases') return send(res, 200, { cases: await listCases(ctx) });
    if (q.view === 'outputs') {
      const outs = await listOutputs(ctx, q.caseId);
      return send(res, 200, { outputs: q.full ? outs : outs.map((o) => ({ ...o, content: o.kind === 'html' ? '' : o.content.slice(0, 400) })) });
    }
    if (q.view === 'output') return send(res, 200, { output: await r.get(k('output', String(q.id || ''))) });
    if (q.view === 'inbox') return send(res, 200, { inbox: (await inboxAll(ctx)).reverse() });
    if (q.view === 'meetings') {
      const list = (await listCases(ctx)).flatMap((c) =>
        c.tasks
          .filter((t) => t.type === 'meeting')
          .map((t) => ({ caseId: c.id, caseTitle: c.title, taskId: t.id, status: t.status, outputId: t.outputId || '', at: t.startedAt || c.createdAt, ...t.meeting })),
      );
      return send(res, 200, { meetings: list, stages: MEETING_STAGES });
    }
    // オフィス：AI社員の状況・数字・お知らせ
    const [states, cases, inbox, logs, c] = await Promise.all([r.hgetall(k('agents')), listCases(ctx), inboxAll(ctx), readList(ctx, 'log'), costs(ctx)]);
    const tasks = cases.flatMap((x) => x.tasks);
    const p = ctx.profile;
    return send(res, 200, {
      agents: Object.keys(AGENTS)
        .map((id) => agentOf(ctx.staff, id))
        .filter((a) => a.enabled)
        .map((a) => ({ id: a.id, name: a.name, dept: a.dept, ...(states?.[a.id] || { state: 'idle', activity: '指示待ち' }) })),
      future: [],
      stats: {
        activeCases: cases.filter((x) => x.status === 'active').length,
        tasksOpen: tasks.filter((t) => t.status !== 'done').length,
        tasksDone: tasks.filter((t) => t.status === 'done').length,
        inbox: inbox.filter((i) => i.status === 'open').length,
        costMonth: Math.round(c.month),
        costDay: Math.round(c.day),
      },
      limits: ctx.limits,
      apiReady: !!process.env.ANTHROPIC_API_KEY,
      office: {
        sign: p.officeName || BRAND.officeSign,
        tagline: BRAND.tagline,
        examples: p.examples || [],
        profileReady: !!p.business?.trim(),
      },
      logs: logs.slice(-12).reverse(),
    });
  }

  if (req.method === 'POST') {
    const b = body(req);
    if (q.action === 'chat') {
      const text = String(b.text || '')
        .trim()
        .slice(0, 2000);
      if (!text) return send(res, 400, { error: 'メッセージを入力してください' });
      await pushList(ctx, 'chat', { id: newId(), from: 'user', name: me.name, text, at: now() }, MAX.chat);
      try {
        const out = await secretary(ctx, me, text);
        if (out.caseId) waitUntil(trigger(r, originOf(req), me.tenantId, out.caseId));
        await pushList(ctx, 'chat', { id: newId(), from: 'sato', text: out.reply, caseId: out.caseId, at: now() }, MAX.chat);
        return send(res, 200, out);
      } catch (e) {
        await setAgent(ctx, 'sato', 'idle', '指示待ち');
        await pushList(ctx, 'chat', { id: newId(), from: 'system', text: e.message, at: now() }, MAX.chat);
        return send(res, 500, { error: e.message });
      }
    }
    if (q.action === 'kick') {
      const c = await getCase(ctx, b.caseId);
      if (!c) return send(res, 404, { error: '案件が見つかりません' });
      if (resetStale(c)) await saveCase(ctx, c);
      if (canAuto(c) && nextTask(c) && !(await paused(ctx, c.id))) waitUntil(trigger(r, originOf(req), me.tenantId, c.id));
      return send(res, 200, { ok: true });
    }
    if (q.action === 'auto') {
      const c = await getCase(ctx, b.caseId);
      if (!c) return send(res, 404, { error: '案件が見つかりません' });
      c.auto = !!b.on;
      if (b.on) await r.del(k('pause', c.id));
      else await r.set(k('pause', c.id), '1');
      if (b.on) for (const t of c.tasks) if (t.status === 'error') t.status = 'todo';
      await saveCase(ctx, c);
      await log(ctx, `案件「${c.title}」の自動進行を${b.on ? '再開' : '一時停止'}しました`, 'sato');
      if (b.on) waitUntil(trigger(r, originOf(req), me.tenantId, c.id));
      return send(res, 200, { case: c });
    }
    if (q.action === 'run') {
      try {
        return send(res, 200, await runTask(ctx, b.caseId, b.taskId));
      } catch (e) {
        return send(res, 500, { error: e.message });
      }
    }
    if (q.action === 'decide') {
      const item = await r.hget(k('inbox'), String(b.id || ''));
      if (!item) return send(res, 404, { error: '見つかりません' });
      if (item.status !== 'open') return send(res, 409, { error: 'すでに処理済みです' });
      if (item.type === 'decision') {
        const out = await decideMeeting(ctx, item, b, req, me);
        return out.error ? send(res, out.status, { error: out.error }) : send(res, 200, out);
      }
      const caseItems = (await inboxAll(ctx)).filter((i) => i.caseId === item.caseId);
      if (item.type === 'report') {
        const waiting = caseItems.filter((i) => (i.type === 'approval' || i.type === 'decision') && i.status === 'open').length;
        if (waiting) return send(res, 409, { error: `この案件には承認待ち・判断待ちが${waiting}件残っています。先に済ませてください` });
      }
      item.status = b.decision === 'return' ? 'returned' : 'approved';
      item.decidedAt = now();
      item.decidedBy = me.name;
      item.note = String(b.note || '').slice(0, 1000);
      await putInbox(ctx, item);
      if (item.outputId) {
        const o = await r.get(k('output', item.outputId));
        if (o) {
          o.status = item.status;
          await r.set(k('output', o.id), o);
        }
      }
      if (item.type === 'approval' && item.status === 'returned') {
        const c = await getCase(ctx, item.caseId);
        const t = c?.tasks.find((x) => x.id === item.taskId);
        if (t) {
          t.status = 'todo';
          t.feedback = item.note || 'もう一度見直してください';
          t.reworked = false;
          c.status = 'active';
          for (const i of caseItems) {
            if (i.type === 'report' && i.status === 'open') await putInbox(ctx, { ...i, status: 'withdrawn' });
          }
          await saveCase(ctx, c);
          await setAgent(ctx, t.agent, 'assigned', `差し戻し：「${t.title}」をやり直し`, c.id);
          if (!(await paused(ctx, c.id))) waitUntil(trigger(r, originOf(req), me.tenantId, c.id));
        }
      }
      if (item.type === 'approval' && item.status === 'approved') {
        const c = await getCase(ctx, item.caseId);
        if (c && (await maybeReport(ctx, c))) await saveCase(ctx, c);
      }
      if (item.type === 'report' && item.status === 'approved') {
        const c = await getCase(ctx, item.caseId);
        if (c) {
          c.status = 'done';
          await saveCase(ctx, c);
        }
      }
      await log(ctx, `${me.name}さんが「${item.title}」を${item.status === 'returned' ? '差し戻しました' : '承認しました'}`, '');
      return send(res, 200, { item });
    }
    if (q.action === 'clear-chat') {
      await r.del(k('chat'));
      return send(res, 200, { ok: true });
    }
  }

  if (req.method === 'DELETE' && q.caseId) {
    if (me.role !== 'admin') return send(res, 403, { error: '管理者のみ削除できます' });
    const caseId = String(q.caseId);
    const outs = await listOutputs(ctx, caseId);
    for (const o of outs) await r.del(k('output', o.id));
    if (outs.length) await r.zrem(k('outputs'), ...outs.map((o) => o.id));
    await r.del(k('case', caseId), k('pause', caseId), k('cost', 'case', caseId));
    await r.zrem(k('cases'), caseId);
    const mine = (await inboxAll(ctx)).filter((i) => i.caseId === caseId);
    if (mine.length) await r.hdel(k('inbox'), ...mine.map((i) => i.id));
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'Method Not Allowed' });
});

export default async function handler(req, res) {
  if (req.method === 'POST' && req.query?.action === 'step') return stepHandler(req, res);
  return main(req, res);
}
