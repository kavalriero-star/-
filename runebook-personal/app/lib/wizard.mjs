// 시작 위저드의 서버 로직. 규칙은 docs/DATA_MODEL.md 6절, docs/IMPROVEMENT_PLAN.md 4절.
import fs from 'node:fs/promises';
import path from 'node:path';
import { validate } from './validate.mjs';
import { extractJson } from './extract.mjs';
import { ENTITY, HttpError, nextIdIn } from './store.mjs';
import { summarize, wizardContext, wizardBatchPrompt, genreLabel } from './prompts.mjs';

export const STEPS = [
  { id: 'W0', label: '장르·톤' }, { id: 'W1', label: '한 줄 컨셉' }, { id: 'W2', label: '세계 규칙' },
  { id: 'W3', label: '힘의 체계' }, { id: 'W4', label: '사회·세력' }, { id: 'W5', label: '지리·시대' },
  { id: 'W6', label: '주인공' }, { id: 'W7', label: '조연·적대자' }, { id: 'W8', label: '관계' },
  { id: 'W9', label: '시작 사건' }, { id: 'W10', label: '확정' },
];
const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
const BATCH_MAX = 4;
// append로 추가되는 배열 항목에 붙이는 id 접두어
const ITEM_PREFIX = { rules: 'ru', places: 'pl', secrets: 'sec', races: 'rc', nations: 'na', reactions: 'sr' };
const ROLE = { hero: 'protagonist', support: 'supporting', antagonist: 'antagonist' };

export const BATCH_SCHEMA = {
  type: 'object',
  required: ['문항'],
  properties: {
    작업: { type: 'string' },
    단계ID: { type: 'string' },
    문항: {
      type: 'array', minItems: 1, maxItems: BATCH_MAX,
      items: {
        type: 'object', required: ['문항ID', '후보'],
        properties: {
          문항ID: { type: 'string', maxLength: 60 },
          질문: { type: 'string' },
          후보: { type: 'array', minItems: 1, items: { type: 'object', required: ['값'], properties: { 값: { type: 'object' } } } },
          추천: { type: 'integer' },
        },
      },
    },
    확인필요: { type: 'array' },
  },
};

// ---------- 문항 은행 ----------
export async function loadBank(dir) {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const questions = [];
  const byId = new Map();
  const problems = [];
  for (const f of files) {
    const data = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
    for (const q of data.questions || []) {
      if (byId.has(q.qid)) problems.push(`${f}: qid 중복 ${q.qid}`);
      if (!(q.step in STEP_INDEX) || q.step === 'W10') problems.push(`${f}: ${q.qid} step 오류`);
      if (!ENTITY[q.target?.entity]) problems.push(`${f}: ${q.qid} entity 오류`);
      if (q.value_schema?.type !== 'object') problems.push(`${f}: ${q.qid} value_schema는 object여야 함`);
      q.depends = q.depends || [];
      q.genres = q.genres || ['*'];
      q.input = q.input || 'ai';
      q.examples = q.examples || [];
      q._file = f;
      byId.set(q.qid, q);
      questions.push(q);
    }
  }
  for (const q of questions) for (const d of q.depends) if (!byId.has(d)) problems.push(`${q.qid}: 없는 depends ${d}`);
  questions.sort((a, b) => STEP_INDEX[a.step] - STEP_INDEX[b.step] || (a.order ?? 0) - (b.order ?? 0));
  return { questions, byId, problems };
}

export function isActive(q, work) {
  const g = new Set(work.genres || []);
  if (q.genres.includes('*')) return true;
  if (q.genres.some((x) => g.has(x))) return true;
  return q.genres.includes('mix') && g.size >= 2;
}

export function activeQuestions(bank, work) {
  return bank.questions.filter((q) => isActive(q, work));
}

// ---------- 상태 ----------
export function computeState(questions, log) {
  const last = new Map();
  for (const e of log) last.set(e.qid, e);
  const status = {};
  for (const q of questions) {
    const e = last.get(q.qid);
    const st = !e || e.state === 'reverted' ? 'open' : e.state;
    status[q.qid] = { status: st, seq: e?.seq ?? null, value: st === 'confirmed' || st === 'auto' ? e.value : null, source: e?.source ?? null };
  }
  for (const q of questions) {
    const s = status[q.qid];
    if (s.status === 'confirmed' || s.status === 'auto') {
      s.needsReview = q.depends.some((d) => (last.get(d)?.seq ?? 0) > s.seq);
    }
  }
  return status;
}

export function progress(questions, status) {
  let tot = 0;
  let got = 0;
  for (const q of questions) {
    const w = q.required ? 2 : 1;
    tot += w;
    const s = status[q.qid]?.status;
    if (s === 'confirmed') got += w;
    else if (s === 'auto') got += w / 2;
  }
  return { total: tot, got, pct: tot ? Math.round((got / tot) * 100) : 0 };
}

export function canStart(questions, status) {
  return questions.filter((q) => q.required).every((q) => status[q.qid]?.status === 'confirmed');
}

export function nextBatch(questions, status) {
  for (const s of STEPS) {
    const open = questions.filter((q) => q.step === s.id && q.input === 'ai' && status[q.qid]?.status === 'open');
    if (open.length) return { step: s.id, qids: open.slice(0, BATCH_MAX).map((q) => q.qid) };
  }
  return null;
}

function stepLabel(id) {
  return STEPS.find((s) => s.id === id)?.label || id;
}

// ---------- 파일 위치 ----------
function logFile(store, w) { return store.wp(w, 'ai/wizard.jsonl'); }
function cacheFile(store, w) { return store.wp(w, 'ai/cache/wizard.json'); }

async function readCache(store, w) {
  return store.readJson(cacheFile(store, w), {});
}

function getPath(obj, p, create) {
  let cur = obj;
  for (const k of p.split('.').filter(Boolean)) {
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== 'object') {
      if (!create) return undefined;
      cur[k] = {};
    }
    cur = cur[k];
  }
  return cur;
}

function initEntity(t, id, work) {
  const slots = work.wizard?.slots || {};
  const hero = slots['character:hero'] || null;
  switch (t.entity) {
    case 'system':
      return { id, kind: t.kind || 'magic', genre: t.slot, name: '', aliases: [], source: '', cost: '', limits: [], ladder: [], ai_filled: [] };
    case 'faction':
      return { id, kind: 'org', role: t.slot, name: '', aliases: [], goal: '', resources: [], allies: [], enemies: [], ai_filled: [] };
    case 'character':
      return {
        id, role: ROLE[t.slot] || t.slot, slot: t.slot, name: '', aliases: [], age: { value: null }, appearance_hook: '',
        desire: { want: '', need: '' }, lack: '', false_belief: '', secrets: [], abilities: [], weaknesses: [],
        voice: { style: '', tics: [], samples: [], address: {}, banned_words: [] }, affiliations: [],
        status: { alive: true, death_ep: null }, arc: { start: '', turns: [], end: '' }, ext: {}, ai_filled: [],
      };
    case 'scene':
      return { id, ep: 1, pov: hero, place: null, time: null, characters: hero ? [hero] : [], goal: '', conflict: '', hook: '', flashback: false, summary: '', hook_type: null, label: null, status: 'planned', memo: [], ai_filled: [] };
    case 'relation':
      return { id, a: null, b: null, type: '', a_to_b: '', b_to_a: '', public: true, note: '', since: null, changes: [], ai_filled: [] };
    case 'event':
      return { id, title: '', note: '', when: { t: null, order: 10 }, ep_range: [1, 1], participants: hero ? [hero] : [], place: null, effects: [], reveals: [], canon: true, ai_filled: [] };
    case 'thread':
      return { id, title: '', planted_ep: 1, due_ep: null, resolved_ep: null, links: [], note: '', ai_filled: [] };
    default:
      return { id, ai_filled: [] };
  }
}

// 문항의 target이 가리키는 개체를 읽어 온다. create면 슬롯 개체를 만든다.
async function resolveTarget(store, w, work, t, create) {
  const def = ENTITY[t.entity];
  if (t.entity === 'work') return { obj: work, save: async () => {}, ref: 'work' };
  if (def.kind === 'single') {
    const file = store.wp(w, def.rel);
    const obj = await store.readJson(file, {});
    return { obj, save: () => store.writeJson(file, obj), ref: t.entity };
  }
  work.wizard = work.wizard || {};
  work.wizard.slots = work.wizard.slots || {};
  const slotKey = `${t.entity}:${t.slot}`;
  let id = work.wizard.slots[slotKey];
  if (def.kind === 'file') {
    let obj;
    if (id) obj = await store.readJson(store.wp(w, def.dir, `${id}.json`), null);
    if (!obj) {
      if (!create) return null;
      id = nextIdIn(work, def.prefix);
      work.wizard.slots[slotKey] = id;
      obj = initEntity(t, id, work);
    }
    return { obj, save: () => store.writeJson(store.wp(w, def.dir, `${id}.json`), obj), ref: id };
  }
  const file = store.wp(w, def.rel);
  const list = await store.readJson(file, { items: [] });
  list.items = list.items || [];
  let item = id ? list.items.find((x) => x.id === id) : null;
  if (!item) {
    if (!create) return null;
    id = nextIdIn(work, def.prefix);
    work.wizard.slots[slotKey] = id;
    item = initEntity(t, id, work);
    list.items.push(item);
  }
  if (t.entity === 'relation') {
    item.a = item.a || work.wizard.slots['character:hero'] || null;
    const other = t.slot === 'hero_antagonist' ? 'antagonist' : 'support';
    item.b = item.b || work.wizard.slots[`character:${other}`] || null;
  }
  return { obj: item, save: () => store.writeJson(file, list), ref: id };
}

const sameItem = (a, b) => {
  const key = (x) => (x && typeof x === 'object' ? (x.text ?? x.name ?? x.title ?? JSON.stringify(x)) : x);
  return key(a) === key(b);
};

function fieldPaths(t, value) {
  return Object.keys(value).map((k) => (t.path ? `${t.path}.${k}` : k));
}

// ---------- 확정·건너뛰기·되돌리기 ----------
export async function confirm(store, w, bank, { qid, value, source = '후보', auto = false }) {
  return store.withLock(w, async () => {
    const q = bank.byId.get(qid);
    if (!q) throw new HttpError(404, 'NO_QUESTION', '없는 문항입니다');
    const workFile = store.wp(w, 'work.json');
    const work = await store.readJson(workFile);
    if (!isActive(q, work)) throw new HttpError(400, 'INACTIVE', '이 작품의 장르에 해당하지 않는 문항입니다');
    if (auto && q.required) throw new HttpError(400, 'REQUIRED', '필수 문항은 AI가 알아서 채울 수 없어요. 후보를 고르거나 직접 적어 주세요');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(422, 'VALIDATION', '값이 비어 있어요');
    const errs = validate(q.value_schema, value);
    if (errs.length) throw Object.assign(new HttpError(422, 'VALIDATION', '입력값이 형식에 맞지 않아요'), { details: errs });
    const t = q.target;
    const target = await resolveTarget(store, w, work, t, true);
    const base = t.path ? getPath(target.obj, t.path, true) : target.obj;
    const prev = {};
    const added = [];
    for (const [k, v] of Object.entries(value)) {
      prev[k] = base[k] === undefined ? null : structuredClone(base[k]);
      if (t.merge === 'append' && Array.isArray(v)) {
        const arr = Array.isArray(base[k]) ? base[k] : [];
        for (const raw of v) {
          if (arr.some((x) => sameItem(x, raw))) continue;
          const it = raw && typeof raw === 'object' ? { ...raw } : raw;
          if (it && typeof it === 'object' && ITEM_PREFIX[k] && !it.id) {
            it.id = nextIdIn(work, ITEM_PREFIX[k]);
            added.push(it.id);
          }
          arr.push(it);
        }
        base[k] = arr;
      } else {
        base[k] = structuredClone(v);
      }
    }
    const paths = fieldPaths(t, value);
    const filled = Array.isArray(target.obj.ai_filled) ? target.obj.ai_filled.filter((p) => !paths.includes(p)) : [];
    target.obj.ai_filled = auto ? [...filled, ...paths] : filled;
    if (target.ref !== 'work') await target.save();
    await store.writeJson(workFile, work);
    const log = await store.readJsonl(logFile(store, w));
    const entry = {
      qid, seq: (log.at(-1)?.seq || 0) + 1, state: auto ? 'auto' : 'confirmed',
      value, prev, added_ids: added, ref: target.ref, source, ts: new Date().toISOString(),
    };
    await store.appendJsonl(logFile(store, w), entry);
    return entry;
  });
}

export async function recordSetup(store, w, bank, values) {
  // 작품을 만들 때 화면에서 받은 값(장르, 한 줄 컨셉)을 위저드 로그에 확정으로 남긴다.
  const log = await store.readJsonl(logFile(store, w));
  let seq = log.at(-1)?.seq || 0;
  for (const [qid, value] of Object.entries(values)) {
    if (!bank.byId.has(qid)) continue;
    seq += 1;
    await store.appendJsonl(logFile(store, w), { qid, seq, state: 'confirmed', value, prev: null, added_ids: [], ref: 'work', source: 'setup', ts: new Date().toISOString() });
  }
}

export async function skip(store, w, bank, { qid }) {
  return store.withLock(w, async () => {
    const q = bank.byId.get(qid);
    if (!q) throw new HttpError(404, 'NO_QUESTION', '없는 문항입니다');
    if (q.required) throw new HttpError(400, 'REQUIRED', '필수 문항은 건너뛸 수 없어요');
    const log = await store.readJsonl(logFile(store, w));
    const entry = { qid, seq: (log.at(-1)?.seq || 0) + 1, state: 'skipped', ts: new Date().toISOString() };
    await store.appendJsonl(logFile(store, w), entry);
    return entry;
  });
}

export function dependents(questions, qid) {
  const out = new Set();
  const stack = [qid];
  while (stack.length) {
    const cur = stack.pop();
    for (const q of questions) if (q.depends.includes(cur) && !out.has(q.qid)) { out.add(q.qid); stack.push(q.qid); }
  }
  return [...out];
}

export async function revert(store, w, bank, { qid, cascade = false }) {
  return store.withLock(w, async () => {
    const workFile = store.wp(w, 'work.json');
    const work = await store.readJson(workFile);
    const questions = activeQuestions(bank, work);
    let log = await store.readJsonl(logFile(store, w));
    const status = computeState(questions, log);
    const s = status[qid];
    if (!s || s.status === 'open') throw new HttpError(400, 'NOTHING', '되돌릴 내용이 없어요');
    const targets = [qid, ...(cascade ? dependents(questions, qid).filter((d) => ['confirmed', 'auto', 'skipped'].includes(status[d]?.status)) : [])];
    targets.sort((a, b) => (status[b].seq ?? 0) - (status[a].seq ?? 0));
    const reverted = [];
    for (const tq of targets) {
      const q = bank.byId.get(tq);
      const lastEntry = [...log].reverse().find((e) => e.qid === tq);
      if (!lastEntry) continue;
      if ((lastEntry.state === 'confirmed' || lastEntry.state === 'auto') && lastEntry.source !== 'setup') {
        const target = await resolveTarget(store, w, work, q.target, false);
        if (target) {
          const base = q.target.path ? getPath(target.obj, q.target.path, true) : target.obj;
          for (const k of Object.keys(lastEntry.value)) {
            if (q.target.merge === 'append' && Array.isArray(base[k]) && lastEntry.added_ids?.length) {
              base[k] = base[k].filter((x) => !(x && typeof x === 'object' && lastEntry.added_ids.includes(x.id)));
            } else if (lastEntry.prev && lastEntry.prev[k] !== null && lastEntry.prev[k] !== undefined) {
              base[k] = lastEntry.prev[k];
            } else {
              base[k] = Array.isArray(base[k]) ? [] : (typeof base[k] === 'object' && base[k] !== null ? {} : '');
            }
          }
          const paths = fieldPaths(q.target, lastEntry.value);
          target.obj.ai_filled = (target.obj.ai_filled || []).filter((p) => !paths.includes(p));
          if (target.ref !== 'work') await target.save();
        }
      }
      const entry = { qid: tq, seq: (log.at(-1)?.seq || 0) + 1, state: 'reverted', ts: new Date().toISOString() };
      await store.appendJsonl(logFile(store, w), entry);
      log = [...log, entry];
      reverted.push(tq);
    }
    await store.writeJson(workFile, work);
    return { reverted };
  });
}

// ---------- 화면용 상태 ----------
export async function view(store, w, bank) {
  const work = await store.readJson(store.wp(w, 'work.json'));
  const questions = activeQuestions(bank, work);
  const log = await store.readJsonl(logFile(store, w));
  const status = computeState(questions, log);
  const cache = await readCache(store, w);
  const next = nextBatch(questions, status);
  return {
    work: { id: work.id, title: work.title, genres: work.genres, logline: work.logline, rev: work.rev },
    steps: STEPS.map((s) => ({
      id: s.id,
      label: s.label,
      questions: questions.filter((q) => q.step === s.id).map((q) => ({
        qid: q.qid, label: q.label, question: q.question, hint: q.hint, required: !!q.required, input: q.input,
        value_schema: q.value_schema, example: q.examples[0] || null,
        status: status[q.qid].status, needsReview: !!status[q.qid].needsReview,
        value: status[q.qid].value, summary: !status[q.qid].value ? '' : (q.qid === 'work.genres' ? (status[q.qid].value.genres || []).map((g) => `${genreLabel(g)}${status[q.qid].value.genre_weights?.[g] ? ` ${status[q.qid].value.genre_weights[g]}%` : ''}`).join(' + ') : summarize(status[q.qid].value)),
        hasDependents: questions.some((x) => x.depends.includes(q.qid)),
      })),
    })),
    progress: progress(questions, status),
    canStart: canStart(questions, status),
    next,
    cache,
  };
}

// ---------- 후보 요청 ----------
function mockBatch(batch, { merge, regen } = {}) {
  return {
    작업: '문항묶음',
    단계ID: batch[0].step,
    문항: batch.map((q) => {
      let ex = q.examples.slice(0, 3);
      if (regen) ex = [...ex.slice(1), ...ex.slice(0, 1)];
      let 후보 = ex.map((e, i) => ({ 번호: i + 1, 제목: e.title, 설명: regen ? `${e.desc} (다시 제안 · 모의)` : e.desc, 값: e.value, 장점: '모의 응답: 문항 은행의 예시', 위험: '' }));
      if (merge) {
        const [a, b] = merge.picks;
        후보 = [{ 번호: 1, 제목: `${a.title} + ${b?.title || ''}`.slice(0, 40), 설명: `모의 합치기: 첫 후보의 값을 쓰고 둘째 후보의 설명을 덧붙였어요. ${b?.desc || ''}`.slice(0, 200), 값: a.value, 장점: '', 위험: '' }];
      }
      return { 문항ID: q.qid, 질문: q.question, 후보, 추천: 1 };
    }),
    확인필요: [],
  };
}

export async function prepareProposal(store, w, bank, settings, { qids, hint, rejected, merge }) {
  const work = await store.readJson(store.wp(w, 'work.json'));
  const questions = activeQuestions(bank, work);
  const log = await store.readJsonl(logFile(store, w));
  const status = computeState(questions, log);
  let picks = null;
  if (merge) {
    const cache = await readCache(store, w);
    const c = cache[merge.qid];
    if (!c) throw new HttpError(400, 'NO_CANDIDATES', '합칠 후보가 없어요');
    picks = (merge.picks || []).map((i) => c.candidates[i]).filter(Boolean);
    if (picks.length < 2) throw new HttpError(400, 'PICK_TWO', '합칠 후보를 2개 이상 골라 주세요');
    qids = [merge.qid];
  }
  if (!qids || !qids.length) {
    const nb = nextBatch(questions, status);
    if (!nb) throw new HttpError(400, 'ALL_DONE', '모든 문항을 마쳤어요');
    qids = nb.qids;
  }
  const batch = qids.map((id) => {
    const q = bank.byId.get(id);
    if (!q || !isActive(q, work)) throw new HttpError(400, 'BAD_QID', `요청할 수 없는 문항입니다: ${id}`);
    if (q.input !== 'ai') throw new HttpError(400, 'SETUP_ONLY', `${q.label}은(는) 작품을 만들 때 정하는 항목이에요`);
    return q;
  });
  if (batch.length > BATCH_MAX || new Set(batch.map((q) => q.step)).size !== 1) {
    throw new HttpError(400, 'BAD_BATCH', `한 번에 같은 단계의 문항 ${BATCH_MAX}개까지 요청할 수 있어요`);
  }
  const step = batch[0].step;
  const context = wizardContext({ work, questions, status, batch });
  const prompt = wizardBatchPrompt({
    work, step, stepLabel: stepLabel(step), batch, context, level: settings.assistLevel,
    hint, rejected,
    merge: merge ? { instruction: merge.instruction, picks: picks.map((p) => ({ 제목: p.title, 설명: p.desc, 값: p.value })) } : null,
  });
  prompt.mock = () => mockBatch(batch, { merge: merge ? { picks } : null, regen: !!(hint || rejected?.length) });
  return { prompt, batch, step, mode: merge ? 'merge' : (hint || rejected?.length ? 'regen' : 'batch') };
}

// AI 응답 텍스트 → 검증된 후보. 길이·개수 위반은 재시도하지 않고 걸러 낸다(PROMPTS.md 4절).
export function parseProposal(text, batch) {
  const ex = extractJson(text);
  if (!ex.ok) return { ok: false, retryable: true, code: 'PARSE', message: 'AI 응답이 JSON 형식이 아니에요' };
  const errs = validate(BATCH_SCHEMA, ex.value);
  if (errs.length) return { ok: false, retryable: false, code: 'SCHEMA', message: 'AI 응답의 구조가 맞지 않아요', details: errs.slice(0, 10) };
  const want = new Map(batch.map((q) => [q.qid, q]));
  const out = [];
  let dropped = 0;
  for (const item of ex.value.문항) {
    const q = want.get(item.문항ID);
    if (!q) continue;
    const candidates = [];
    for (const c of item.후보) {
      const v = c.값;
      if (validate(q.value_schema, v).length) { dropped += 1; continue; }
      const cut = (s, n) => (typeof s === 'string' ? (s.length > n ? `${s.slice(0, n)}…` : s) : '');
      candidates.push({ title: cut(c.제목, 40) || '(제목 없음)', desc: cut(c.설명, 300), pros: cut(c.장점, 300), risk: cut(c.위험, 300), value: v });
      if (candidates.length === 3) break;
    }
    const rec = Number.isInteger(item.추천) && item.추천 >= 1 && item.추천 <= candidates.length ? item.추천 - 1 : 0;
    out.push({ qid: q.qid, question: typeof item.질문 === 'string' && item.질문.trim() ? item.질문.slice(0, 120) : q.question, candidates, recommend: rec });
  }
  if (!out.some((x) => x.candidates.length)) {
    return { ok: false, retryable: false, code: 'NO_VALID', message: '형식에 맞는 후보가 없어요. 다시 시도하거나 직접 적어 주세요', details: { dropped } };
  }
  return { ok: true, value: { questions: out, dropped, checks: Array.isArray(ex.value.확인필요) ? ex.value.확인필요.slice(0, 5) : [] } };
}

export async function storeProposal(store, w, result, { mode, provider }) {
  return store.withLock(`${w}:cache`, async () => {
    const file = cacheFile(store, w);
    const cache = await store.readJson(file, {});
    for (const q of result.questions) {
      const old = cache[q.qid];
      if (mode === 'merge' && old) {
        cache[q.qid] = { ...old, candidates: [...old.candidates.slice(0, 3), ...q.candidates.map((c) => ({ ...c, merged: true }))].slice(0, 4), at: new Date().toISOString() };
      } else {
        cache[q.qid] = {
          question: q.question, candidates: q.candidates, recommend: q.recommend, provider,
          at: new Date().toISOString(), prev: old ? { question: old.question, candidates: old.candidates, recommend: old.recommend } : null,
        };
      }
    }
    const { rev: _r, schemaVersion: _s, ...plain } = cache;
    await store.writeJson(file, plain);
    return result;
  });
}
