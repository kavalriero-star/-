#!/usr/bin/env node
// 룬북 로컬 도우미. 127.0.0.1에서만 열리고, 시작할 때 만든 토큰으로만 API를 쓸 수 있다(설계서 8.7절).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store, HttpError, nextIdIn, ENTITY } from './lib/store.mjs';
import { Jobs } from './lib/jobs.mjs';
import { createClaudeAdapter } from './lib/adapters/claude.mjs';
import { createCodexAdapter } from './lib/adapters/codex.mjs';
import { createMockAdapter } from './lib/adapters/mock.mjs';
import * as wz from './lib/wizard.mjs';
import * as wr from './lib/write.mjs';
import * as im from './lib/images.mjs';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '0.2.0';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const TEXT_TASKS = ['world', 'write', 'summary'];

function parseArgs(argv) {
  const o = { port: 4317, data: path.join(os.homedir(), '룬북데이터'), open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') o.port = Number(argv[++i]);
    else if (a === '--data') o.data = argv[++i];
    else if (a === '--no-open') o.open = false;
    else if (a === '--claude-bin') o.claudeBin = argv[++i];
    else if (a === '--codex-bin') o.codexBin = argv[++i];
  }
  return o;
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers,
  });
  res.end(data);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'TOO_LARGE', '요청이 너무 커요');
    chunks.push(c);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'BAD_JSON', '요청 본문이 JSON이 아니에요');
  }
}

export async function startServer(options = {}) {
  const opt = { ...parseArgs([]), ...options };
  const store = new Store(opt.data);
  await store.init();
  const bank = await wz.loadBank(opt.questionsDir || path.join(APP_DIR, 'questions'));
  if (bank.problems.length) console.warn(`[문항 은행 경고] ${bank.problems.length}건: ${bank.problems.slice(0, 3).join(' / ')}`);
  const token = opt.token || crypto.randomBytes(32).toString('hex');
  let settingsCache = await store.settings();
  const getSettings = async () => settingsCache;
  const adapters = {
    claude: createClaudeAdapter({ bin: opt.claudeBin || 'claude' }),
    codex: createCodexAdapter({ bin: opt.codexBin || 'codex' }),
    mock: createMockAdapter({ getMode: () => settingsCache.mockMode || 'ok', delayMs: opt.mockDelay ?? 400 }),
  };
  // 그림은 글과 별도 큐 항목으로 센다(사용 한도 소모가 다르므로).
  adapters['codex-image'] = opt.imageMock ? im.createMockImageAdapter() : im.createCodexImageAdapter({ bin: opt.codexBin || 'codex' });
  const usageFile = store.p('usage.json');
  const jobs = new Jobs({
    adapters,
    getSettings,
    usageStore: { load: async () => (await store.readJson(usageFile, { calls: [] })).calls || [], save: (calls) => store.writeJson(usageFile, { calls }) },
  });
  const statusCache = new Map();
  const providerFor = (task) => settingsCache.perTask?.[task] || settingsCache.provider || 'mock';

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^/api/v1${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

  // ---------- 상태·설정 ----------
  route('GET', '/health', async () => ({ version: VERSION, dataDir: store.root, platform: process.platform, node: process.version, bankProblems: bank.problems.length }));
  route('GET', '/settings', async () => settingsCache);
  route('PUT', '/settings', async ({ body }) => {
    const allowed = ['provider', 'perTask', 'models', 'hourlyCap', 'memoryBudget', 'mockMode', 'autoFallback', 'imageProvider'];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    for (const k of ['provider']) if (k in patch && (!adapters[patch[k]] || patch[k] === 'codex-image')) throw new HttpError(400, 'BAD_PROVIDER', '알 수 없는 AI입니다');
    if ('imageProvider' in patch && !['manual', 'codex'].includes(patch.imageProvider)) throw new HttpError(400, 'BAD_PROVIDER', '그림 경로는 manual 또는 codex입니다');
    if (patch.perTask) for (const [t, p] of Object.entries(patch.perTask)) if (!TEXT_TASKS.includes(t) || !adapters[p]) throw new HttpError(400, 'BAD_PROVIDER', '알 수 없는 작업 또는 AI입니다');
    settingsCache = await store.saveSettings(patch);
    return settingsCache;
  });
  route('GET', '/ai/providers', async ({ query }) => {
    const out = {};
    const usage = await jobs.usage();
    for (const [id, a] of Object.entries(adapters)) {
      if (id === 'codex-image') continue;
      let st = statusCache.get(id);
      if (!st || query.refresh === '1' || Date.now() - st.at > 30000) {
        st = { at: Date.now(), value: await a.status() };
        statusCache.set(id, st);
      }
      out[id] = { id, label: a.label, ...st.value, usage: usage[id] };
    }
    return { providers: out, textProvider: providerFor('write'), imageProvider: settingsCache.imageProvider || 'manual', imageUsage: usage['codex-image'], perTask: Object.fromEntries(TEXT_TASKS.map((t) => [t, providerFor(t)])) };
  });
  route('POST', '/ai/test', async ({ body }) => {
    const p = body.provider || providerFor('write');
    if (!adapters[p]) throw new HttpError(400, 'BAD_PROVIDER', '알 수 없는 AI입니다');
    if (p !== 'mock' && !body.confirm) throw new HttpError(428, 'CONFIRM', '실제 AI를 한 번 부르므로 구독 한도를 조금 써요. 확인 후 다시 눌러 주세요');
    return jobs.create({ provider: p, kind: 'test', prompt: { system: '짧게 답한다.', user: 'OK 두 글자만 출력하라.', mockText: 'OK' }, confirmOverCap: !!body.confirmOverCap });
  });
  route('GET', '/ai/jobs/:id', async ({ params }) => jobs.view(params.id));
  route('DELETE', '/ai/jobs/:id', async ({ params }) => jobs.cancel(params.id));

  // ---------- 작품 ----------
  route('GET', '/works', async () => ({ works: await store.listWorks() }));
  route('POST', '/works', async ({ body }) => {
    const title = String(body.title || '').trim().slice(0, 60);
    const logline = String(body.logline || '').trim().slice(0, 120);
    const genres = Array.isArray(body.genres) ? body.genres.filter((g) => ['fantasy', 'hunter', 'wuxia', 'history'].includes(g)) : [];
    if (!title) throw new HttpError(422, 'TITLE', '제목을 적어 주세요');
    if (!logline) throw new HttpError(422, 'LOGLINE', '한 줄 컨셉을 적어 주세요');
    if (genres.length < 1 || genres.length > 2 || new Set(genres).size !== genres.length) throw new HttpError(422, 'GENRES', '장르를 1~2개 골라 주세요');
    const mix = body.mix_policy && typeof body.mix_policy === 'object' ? {
      ...(['replace', 'layer', 'parallel', 'translate'].includes(body.mix_policy.system_relation) ? { system_relation: body.mix_policy.system_relation } : {}),
      ...(['strict', 'loose', 'alt_history', 'off'].includes(body.mix_policy.accuracy_level) ? { accuracy_level: body.mix_policy.accuracy_level } : {}),
    } : undefined;
    let weights;
    if (genres.length === 2 && Number.isInteger(body.primaryWeight) && body.primaryWeight >= 50 && body.primaryWeight <= 90) weights = { [genres[0]]: body.primaryWeight, [genres[1]]: 100 - body.primaryWeight };
    const work = await store.createWork({ title, genres, genre_weights: weights, logline, mix_policy: mix });
    await wz.recordSetup(store, work.id, bank, { 'work.genres': { genres, genre_weights: work.genre_weights }, 'work.logline': { logline } });
    return work;
  });
  route('GET', '/works/:w', async ({ params }) => store.readJson(store.wp(params.w, 'work.json')));
  route('PATCH', '/works/:w/style', async ({ params, body }) => store.withLock(params.w, async () => {
    const file = store.wp(params.w, 'work.json');
    const work = await store.readJson(file);
    const s = { ...(work.style || {}) };
    if ('pov' in body) { if (![null, 'first', 'third_limited', 'omniscient'].includes(body.pov)) throw new HttpError(422, 'POV', '시점 값이 맞지 않아요'); s.pov = body.pov; }
    const strList = (v, n, len) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.slice(0, len)).slice(0, n) : []);
    if ('rules' in body) s.rules = strList(body.rules, 20, 200);
    if ('samples' in body) s.samples = strList(body.samples, 3, 3000);
    if ('notes' in body) s.notes = String(body.notes || '').slice(0, 1000);
    if ('art_style' in body) s.art_style = String(body.art_style || '').slice(0, 300);
    return store.writeJson(file, { ...work, style: s });
  }));

  // ---------- 설정집 ----------
  route('GET', '/works/:w/bible', async ({ params }) => ({
    ...(await store.bible(params.w)),
    candidates: (await store.readJson(store.wp(params.w, 'memory/candidates.json'), { items: [] })).items,
  }));
  const EDITABLE = ['character', 'faction', 'system', 'monster', 'world'];
  route('PATCH', '/works/:w/bible/:kind/:id', async ({ params, body }) => {
    if (!EDITABLE.includes(params.kind)) throw new HttpError(400, 'BAD_KIND', '고칠 수 없는 종류입니다');
    return store.withLock(params.w, async () => {
      const file = params.kind === 'world' ? store.wp(params.w, 'bible/world.json') : store.wp(params.w, ENTITY[params.kind].dir, `${params.id}.json`);
      if (params.kind !== 'world' && !/^[a-z]{2}_\d{4}$/.test(params.id)) throw new HttpError(400, 'BAD_ID', 'id 형식이 아닙니다');
      const obj = await store.readJson(file);
      const set = body.set && typeof body.set === 'object' ? body.set : {};
      for (const [k, v] of Object.entries(set)) {
        if (['id', 'rev', 'schemaVersion', 'slot', 'ai_filled', 'kind', 'role'].includes(k)) continue;
        if (!(typeof v === 'string' || typeof v === 'number' || Array.isArray(v) || (v && typeof v === 'object'))) continue;
        if (JSON.stringify(v).length > 20000) throw new HttpError(413, 'TOO_LARGE', `${k} 값이 너무 길어요`);
        obj[k] = v;
        obj.ai_filled = (obj.ai_filled || []).filter((p) => p !== k && !p.startsWith(`${k}.`));
      }
      if (body.clearAiFilled) obj.ai_filled = [];
      return store.writeJson(file, obj, body.rev);
    });
  });
  route('POST', '/works/:w/bible/:kind', async ({ params, body }) => {
    if (!['character', 'faction', 'monster'].includes(params.kind)) throw new HttpError(400, 'BAD_KIND', '여기서는 인물·세력·몬스터만 만들 수 있어요');
    return createEntity(params.w, params.kind, body);
  });
  async function createEntity(w, kind, body) {
    const name = String(body.name || '').trim().slice(0, 30);
    if (!name) throw new HttpError(422, 'NAME', '이름을 적어 주세요');
    return store.withLock(w, async () => {
      const work = await store.readJson(store.wp(w, 'work.json'));
      const def = ENTITY[kind];
      const id = nextIdIn(work, def.prefix);
      const base = { id, name, aliases: [], note: String(body.note || '').slice(0, 500), visual: String(body.visual || '').slice(0, 500), ai_filled: [] };
      if (kind === 'character') Object.assign(base, { role: body.role || 'supporting', status: { alive: true, death_ep: null } });
      if (kind === 'monster') Object.assign(base, { threat: String(body.threat || '').slice(0, 20), habitat: String(body.habitat || '').slice(0, 100), traits: [] });
      if (kind === 'faction') Object.assign(base, { kind: 'org', goal: '' });
      await store.writeJson(store.wp(w, def.dir, `${id}.json`), base);
      await store.writeJson(store.wp(w, 'work.json'), work);
      return base;
    });
  }
  route('POST', '/works/:w/candidates/:cid/:action', async ({ params }) => {
    const file = store.wp(params.w, 'memory/candidates.json');
    const cands = await store.readJson(file, { items: [] });
    const c = cands.items.find((x) => x.id === params.cid);
    if (!c) throw new HttpError(404, 'NOT_FOUND', '후보를 찾을 수 없어요');
    let created = null;
    if (params.action === 'accept') {
      const kind = { 인물: 'character', 세력: 'faction', 몬스터: 'monster' }[c.kind];
      if (kind) created = await createEntity(params.w, kind, { name: c.name, note: c.desc });
      else if (c.kind === '장소') {
        created = await store.withLock(params.w, async () => {
          const work = await store.readJson(store.wp(params.w, 'work.json'));
          const world = await store.readJson(store.wp(params.w, 'bible/world.json'));
          const place = { id: nextIdIn(work, 'pl'), name: c.name, aliases: [], note: c.desc };
          world.places = [...(world.places || []), place];
          await store.writeJson(store.wp(params.w, 'bible/world.json'), world);
          await store.writeJson(store.wp(params.w, 'work.json'), work);
          return place;
        });
      }
      c.status = 'accepted';
    } else if (params.action === 'dismiss') c.status = 'dismissed';
    else throw new HttpError(400, 'BAD_ACTION', '알 수 없는 동작입니다');
    await store.writeJson(file, cands);
    return { candidate: c, created };
  });

  // ---------- 위저드 ----------
  route('GET', '/works/:w/wizard', async ({ params }) => wz.view(store, params.w, bank));
  route('POST', '/works/:w/wizard/propose', async ({ params, body }) => {
    const prep = await wz.prepareProposal(store, params.w, bank, settingsCache, body);
    const provider = body.provider && adapters[body.provider] ? body.provider : providerFor('world');
    return jobs.create({
      provider, kind: 'wizard', prompt: prep.prompt, confirmOverCap: !!body.confirmOverCap,
      parse: (text) => wz.parseProposal(text, prep.batch),
      finish: (value) => wz.storeProposal(store, params.w, value, { mode: prep.mode, provider }),
    });
  });
  route('POST', '/works/:w/wizard/confirm', async ({ params, body }) => wz.confirm(store, params.w, bank, body));
  route('POST', '/works/:w/wizard/skip', async ({ params, body }) => wz.skip(store, params.w, bank, body));
  route('POST', '/works/:w/wizard/revert', async ({ params, body }) => wz.revert(store, params.w, bank, body));

  // ---------- 원고 ----------
  route('GET', '/works/:w/episodes', async ({ params }) => ({ episodes: await wr.listEpisodes(store, params.w) }));
  route('POST', '/works/:w/episodes', async ({ params, body }) => wr.createEpisode(store, params.w, { title: body.title ? String(body.title).slice(0, 60) : undefined }));
  route('GET', '/works/:w/episodes/:ep', async ({ params }) => wr.readEpisode(store, params.w, params.ep));
  route('PUT', '/works/:w/episodes/:ep', async ({ params, body }) => {
    if (!Array.isArray(body.scenes)) throw new HttpError(422, 'SCENES', '장면 목록이 없어요');
    return wr.saveEpisode(store, params.w, params.ep, { title: body.title, scenes: body.scenes.map((s) => ({ id: s.id, text: String(s.text ?? '') })), rev: body.rev });
  });
  route('POST', '/works/:w/episodes/:ep/scenes', async ({ params, body }) => wr.addScene(store, params.w, params.ep, { goal: String(body.goal || '').slice(0, 200), beats: String(body.beats || '').slice(0, 2000) }));
  route('PATCH', '/works/:w/scenes/:sc', async ({ params, body }) => wr.updateSceneMeta(store, params.w, params.sc, body));

  // ---------- 공동 집필 ----------
  const draftArgs = (body) => ({ ep: body.ep, sceneId: body.sceneId, mode: body.mode || 'draft', beats: String(body.beats || '').slice(0, 2000), request: String(body.request || '').slice(0, 500), length: Math.min(Math.max(Number(body.length) || 2000, 300), 5000), selection: body.selection, budget: body.budget ? Math.min(Math.max(Number(body.budget), 5000), 200000) : undefined });
  route('POST', '/works/:w/write/preview', async ({ params, body }) => {
    const prep = await wr.prepareDraft(store, params.w, settingsCache, draftArgs(body));
    return { ledger: prep.ledger, promptChars: prep.prompt.system.length + prep.prompt.user.length };
  });
  route('POST', '/works/:w/write/draft', async ({ params, body }) => {
    const args = draftArgs(body);
    const prep = await wr.prepareDraft(store, params.w, settingsCache, args);
    const provider = body.provider && adapters[body.provider] ? body.provider : providerFor('write');
    const job = await jobs.create({
      provider, kind: `write:${args.mode}`, prompt: prep.prompt, confirmOverCap: !!body.confirmOverCap,
      parse: (text) => wr.parseDraftOutput(text, args.mode),
      finish: async (value, j) => ({ ...value, mode: args.mode, provider, warnings: value.prose ? wr.checkDraft(prep.src, prep.epNo, value.prose, value.memory, { flashback: prep.scene.meta?.flashback }) : [], ledgerId: j.id }),
    });
    await store.writeJson(store.wp(params.w, 'memory/ledger', `${job.id}.json`), { at: new Date().toISOString(), provider, mode: args.mode, ep: args.ep, sceneId: args.sceneId, ...prep.ledger });
    return { ...job, ledger: prep.ledger };
  });
  route('POST', '/works/:w/write/accept', async ({ params, body }) => wr.acceptDraft(store, params.w, body));
  route('POST', '/works/:w/episodes/:ep/summarize', async ({ params, body }) => {
    const prep = await wr.prepareEpisodeSummary(store, params.w, settingsCache, { ep: params.ep });
    return jobs.create({ provider: providerFor('summary'), kind: 'summary', prompt: prep.prompt, confirmOverCap: !!body.confirmOverCap, parse: wr.parseEpisodeSummary });
  });
  route('POST', '/works/:w/episodes/:ep/summary', async ({ params, body }) => wr.acceptEpisodeSummary(store, params.w, { ep: params.ep, text: body.text, events: Array.isArray(body.events) ? body.events : [] }));

  // ---------- 기억 ----------
  route('GET', '/works/:w/memory', async ({ params }) => {
    const src = await wr.loadMemorySources(store, params.w);
    let ledgers = [];
    try {
      ledgers = (await fs.readdir(store.wp(params.w, 'memory/ledger'))).filter((f) => f.endsWith('.json')).sort().slice(-20);
    } catch { /* 아직 없음 */ }
    const last = [];
    for (const f of ledgers) last.push({ id: f.slice(0, -5), ...(await store.readJson(store.wp(params.w, 'memory/ledger', f))) });
    last.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { summaries: src.summaries, stateLog: src.stateLog.slice(-200), pins: src.pins, plan: src.plan, ledgers: last.slice(0, 10), threads: src.bible.thread };
  });
  route('GET', '/works/:w/memory/arc', async ({ params }) => ({ next: await wr.arcCandidates(store, params.w) }));
  route('POST', '/works/:w/memory/arc/propose', async ({ params, body }) => {
    const prep = await wr.prepareArcSummary(store, params.w, body);
    return jobs.create({ provider: providerFor('summary'), kind: 'arc', prompt: prep.prompt, confirmOverCap: !!body.confirmOverCap, parse: wr.parseArcSummary });
  });
  route('POST', '/works/:w/memory/arc', async ({ params, body }) => wr.acceptArcSummary(store, params.w, body));
  route('PUT', '/works/:w/memory/pins', async ({ params, body }) => {
    const cards = Array.isArray(body.cards) ? body.cards.filter((x) => /^[a-z]{2}_\d{4}$/.test(x)).slice(0, 20) : [];
    const notes = Array.isArray(body.notes) ? body.notes.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.slice(0, 300)).slice(0, 30) : [];
    return store.writeJson(store.wp(params.w, 'memory/pins.json'), { cards, notes });
  });
  route('PUT', '/works/:w/plan', async ({ params, body }) => {
    const arcs = Array.isArray(body.arcs) ? body.arcs.slice(0, 50).map((a) => ({ title: String(a.title || '').slice(0, 60), from: Number(a.from) || null, to: Number(a.to) || null, goal: String(a.goal || '').slice(0, 500) })) : [];
    const episodes = Array.isArray(body.episodes) ? body.episodes.slice(0, 1000).map((e) => ({ no: Number(e.no), goal: String(e.goal || '').slice(0, 300), beats: Array.isArray(e.beats) ? e.beats.map((b) => String(b).slice(0, 200)).slice(0, 12) : [] })).filter((e) => e.no > 0) : [];
    return store.writeJson(store.wp(params.w, 'chapters/plan.json'), { arcs, episodes });
  });
  route('PUT', '/works/:w/memory/summaries/:kind/:key', async ({ params, body }) => store.withLock(params.w, async () => {
    const file = store.wp(params.w, 'memory/summaries.json');
    const sums = await store.readJson(file, { scenes: {}, episodes: {}, arcs: [] });
    const text = String(body.text || '').slice(0, 1000);
    if (params.kind === 'scenes') sums.scenes[params.key] = { ...(sums.scenes[params.key] || {}), text, source: 'author' };
    else if (params.kind === 'episodes') sums.episodes[params.key] = { ...(sums.episodes[params.key] || {}), text, source: 'author' };
    else throw new HttpError(400, 'BAD_KIND', '알 수 없는 요약 종류입니다');
    return store.writeJson(file, sums);
  }));

  // ---------- 그림 ----------
  im.registerRoutes({ route, store, jobs, adapters, getSettings, HttpError });

  // ---------- HTTP ----------
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const u = new URL(req.url, 'http://x');
    try {
      const port = server.address().port;
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!allowedHosts.includes(req.headers.host || '')) throw new HttpError(421, 'BAD_HOST', '허용되지 않은 주소입니다');
      if (u.pathname.startsWith('/api/')) {
        const origin = req.headers.origin;
        if (origin && !allowedHosts.map((h) => `http://${h}`).includes(origin)) throw new HttpError(403, 'BAD_ORIGIN', '허용되지 않은 출처입니다');
        const auth = req.headers.authorization || '';
        const given = Buffer.from(auth.startsWith('Bearer ') ? auth.slice(7) : '');
        const want = Buffer.from(token);
        if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new HttpError(401, 'NO_TOKEN', '도우미가 다시 시작됐어요. 도우미 창에 나온 주소로 다시 열어 주세요');
        let body = {};
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          const ct = req.headers['content-type'] || '';
          const hasBody = Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'] !== undefined;
          if (hasBody) {
            if (!ct.startsWith('application/json')) throw new HttpError(415, 'BAD_TYPE', 'JSON만 받습니다');
            body = await readBody(req, u.pathname.includes('/images') ? 20 * 1024 * 1024 : 2 * 1024 * 1024);
          }
        }
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = u.pathname.match(r.re);
          if (!m) continue;
          const params = Object.fromEntries(Object.entries(m.groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
          const out = await r.handler({ params, body, query: Object.fromEntries(u.searchParams), req, res });
          if (out && out.__raw) { send(res, 200, out.data, out.headers); } else if (!res.writableEnded) send(res, 200, out ?? { ok: true });
          return;
        }
        throw new HttpError(404, 'NO_ROUTE', '없는 API입니다');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'METHOD', '허용되지 않은 요청입니다');
      await serveStatic(u.pathname, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error('[오류]', e.code || '', e.message);
      if (!res.headersSent) send(res, status, { error: { code: e.code || 'INTERNAL', message: status === 500 ? '도우미 내부 오류가 났어요' : e.message, details: e.details } });
    } finally {
      // 원고·프롬프트는 남기지 않는다. 메타데이터만 남긴다(설계서 8.7절).
      if (opt.log !== false) console.log(`${new Date().toISOString()} ${req.method} ${u.pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });

  async function serveStatic(pathname, res) {
    const map = { '/': 'public/index.html', '/lib/validate.mjs': 'lib/validate.mjs', '/prototype/': '../prototype/index.html' };
    let rel = map[pathname];
    if (!rel) {
      if (!pathname.startsWith('/static/')) throw new HttpError(404, 'NOT_FOUND', '없는 파일입니다');
      rel = `public/${pathname.slice('/static/'.length)}`;
    }
    const base = path.resolve(APP_DIR, rel.startsWith('../') ? '..' : 'public');
    const full = path.resolve(APP_DIR, rel);
    if (rel !== 'lib/validate.mjs' && !full.startsWith(base + path.sep)) throw new HttpError(404, 'NOT_FOUND', '없는 파일입니다');
    let data;
    try {
      data = await fs.readFile(full);
    } catch {
      throw new HttpError(404, 'NOT_FOUND', '없는 파일입니다');
    }
    const ext = path.extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer' });
    res.end(data);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opt.port, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/#t=${token}`;
  return { server, url, token, port, store, bank, jobs, close: () => new Promise((r) => server.close(r)) };
}

function openBrowser(url) {
  // Windows: 주소에는 cmd 특수문자가 없다(토큰은 16진수). 따옴표가 그대로 전달되도록 verbatim으로 넘긴다.
  const cmd = process.platform === 'win32' ? [process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true, windowsVerbatimArguments: process.platform === 'win32' });
    child.on('error', () => { /* 브라우저를 못 열면 주소를 직접 연다 */ });
    child.unref();
  } catch { /* 브라우저를 못 열면 주소를 직접 연다 */ }
}

function isMain() {
  if (!process.argv[1]) return false;
  let a = path.resolve(process.argv[1]);
  let b = fileURLToPath(import.meta.url);
  try { a = realpathSync(a); b = realpathSync(b); } catch { /* 그대로 비교 */ }
  // Windows는 드라이브 문자·경로 대소문자를 구분하지 않는다
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isMain()) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    console.error(`Node.js ${process.version}는 너무 오래됐어요. 22 이상을 https://nodejs.org 에서 설치한 뒤 다시 실행해 주세요.`);
    process.exit(1);
  }
  const o = parseArgs(process.argv.slice(2));
  startServer(o).then(({ url, store }) => {
    console.log('룬북 도우미가 켜졌어요.');
    console.log(`데이터 폴더: ${store.root}`);
    console.log(`브라우저에서 열기: ${url}`);
    console.log('이 창을 닫으면 도우미가 꺼져요.');
    if (o.open) openBrowser(url);
  }).catch((e) => {
    if (e.code === 'EADDRINUSE') console.error(`포트 ${o.port}을(를) 이미 쓰고 있어요. 룬북이 이미 켜져 있는지 확인하거나 --port 로 다른 번호를 주세요.`);
    else console.error('도우미를 시작하지 못했어요:', e.message);
    process.exit(1);
  });
}
