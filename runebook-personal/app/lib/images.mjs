// 그림(ChatGPT). 기준: docs/CONCEPT_V3.md 3절.
// 경로와 상관없이 같은 것: 시각 설정집으로 프롬프트를 조립하고, 이미지를 images/에 저장해 개체·장면·지도와 연결한다.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nextIdIn } from './store.mjs';
import { currentState } from './memory.mjs';
import { genreLabel } from './prompts.mjs';
import { runCli, cleanEnv } from './runner.mjs';
import { tempDir, rmDir, fail, classify } from './adapters/common.mjs';

export const KINDS = {
  illustration: { label: '장면 일러스트', frame: '장면 일러스트. 인물의 표정과 동작이 보이는 구도, 가로 3:2' },
  map: { label: '세계 지도', frame: '위에서 내려다본 세계 지도. 지형·강·산맥·도시 위치가 구분되게, 가로 16:9. 지명 글자는 넣지 않는다(앱이 위에 표시한다)' },
  city: { label: '도시', frame: '도시 전경. 건물 양식과 분위기가 드러나는 원경, 가로 16:9' },
  dungeon: { label: '던전', frame: '던전 내부 또는 입구. 공간 구조와 위험 요소가 보이게, 가로 16:9' },
  character: { label: '캐릭터', frame: '캐릭터 설정화. 전신, 정면과 3/4 측면 두 자세, 단색 배경' },
  villain: { label: '빌런', frame: '빌런 설정화. 전신, 위압감 있는 자세, 단색 배경' },
  monster: { label: '몬스터', frame: '몬스터 설정화. 전신과 크기 비교용 사람 실루엣, 단색 배경' },
  item: { label: '아이템', frame: '아이템 설정화. 정면과 측면, 재질이 보이게, 단색 배경' },
};
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const MAX_BYTES = 15 * 1024 * 1024;

function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const one = (s, n = 160) => (s && String(s).length > n ? `${String(s).slice(0, n)}…` : s || '');

function entityLines(e, stateLog, ep) {
  const lines = [`${e.name}${e.role ? ` (${{ protagonist: '주인공', supporting: '조연', antagonist: '적대자' }[e.role] || e.role})` : ''}`];
  if (e.visual) lines.push(`고정 외형: ${e.visual}`);
  else if (e.appearance_hook) lines.push(`외형 특징: ${e.appearance_hook}`);
  if (e.age?.value) lines.push(`나이: ${e.age.value}세`);
  if (e.abilities?.length) lines.push(`능력·무기: ${e.abilities.map((a) => (a.skills || []).join(', ')).filter(Boolean).join(' / ')}`);
  if (e.threat || e.habitat) lines.push(`위협 등급 ${e.threat || '-'} · 서식지 ${e.habitat || '-'}`);
  if (e.traits?.length) lines.push(`특징: ${e.traits.join(', ')}`);
  if (e.note) lines.push(`메모: ${one(e.note)}`);
  const st = currentState(stateLog, e.id, ep);
  const vis = Object.entries(st).filter(([f]) => /부상|외형|의상|소지품|무기|상처/.test(f));
  if (vis.length) lines.push(`현재 상태(${ep}화 기준): ${vis.map(([f, s]) => `${f}=${s.value}`).join(', ')}`);
  return lines.join('\n  ');
}

// 시각 설정집으로 프롬프트를 조립한다. 대표 이미지가 있으면 참조로 함께 넘긴다.
export function buildImagePrompt({ kind, bible, stateLog = [], summaries = {}, refs = [], sceneId, ep = 1, extra = '' }) {
  const k = KINDS[kind];
  if (!k) throw Object.assign(new Error('알 수 없는 그림 종류입니다'), { status: 400, code: 'BAD_KIND' });
  const work = bible.work || {};
  const world = bible.world || {};
  const all = [...(bible.character || []), ...(bible.monster || []), ...(bible.faction || [])];
  const targets = refs.map((id) => all.find((e) => e.id === id)).filter(Boolean);
  const places = refs.map((id) => (world.places || []).find((p) => p.id === id)).filter(Boolean);
  const lines = [
    `[화풍] ${work.style?.art_style || '선명한 디지털 페인팅, 웹소설 삽화풍, 부드러운 조명'}`,
    `[종류] ${k.frame}`,
    `[세계 분위기] 장르: ${(work.genres || []).map(genreLabel).join(' + ')} · 시대: ${world.era ? (world.era.label || world.era.kind || '') : '미정'} · 전제: ${one(world.premise, 100)}`,
  ];
  if (kind === 'map') {
    const ps = world.places || [];
    lines.push(`[장소 ${ps.length}곳] ${ps.map((p) => `${p.name}${p.note ? `(${one(p.note, 40)})` : ''}`).join(', ') || '장소 카드가 아직 없음'}`);
  }
  if (kind === 'illustration' && sceneId) {
    const s = summaries.scenes?.[sceneId];
    lines.push(`[장면] ${s?.text || '장면 요약이 아직 없음'}`);
  }
  for (const t of targets) lines.push(`[대상]\n  ${entityLines(t, stateLog, ep)}`);
  for (const p of places) lines.push(`[장소] ${p.name}: ${p.note || ''}${p.visual ? ` / 고정 외형: ${p.visual}` : ''}`);
  if (extra) lines.push(`[작가 요청] ${one(extra, 300)}`);
  const references = targets.filter((t) => t.portrait).map((t) => ({ entity: t.id, image: t.portrait }));
  if (references.length) lines.push('[참조] 첨부한 참조 이미지와 같은 얼굴, 체형, 의상을 유지한다');
  lines.push('[금지] 이미지 안에 글자, 로고, 워터마크, 말풍선을 넣지 않는다. 실존 인물을 닮게 그리지 않는다. 사실적인 고어 표현은 피하고 긴장감은 구도와 조명으로 낸다');
  return { kind, label: k.label, prompt: lines.join('\n'), references };
}

async function readIndex(store, w) {
  return store.readJson(store.wp(w, 'images/index.json'), { items: [] });
}

export async function saveImage(store, w, { kind, title, prompt = '', refs = [], sceneId = null, dataBase64, buffer, provider = 'manual', parent = null }) {
  if (!KINDS[kind]) throw Object.assign(new Error('알 수 없는 그림 종류입니다'), { status: 400, code: 'BAD_KIND' });
  if (!buffer && (typeof dataBase64 !== 'string' || !dataBase64)) throw Object.assign(new Error('이미지 파일이 없어요'), { status: 422, code: 'NO_FILE' });
  const buf = buffer || Buffer.from(dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('이미지가 15MB를 넘어요'), { status: 413, code: 'TOO_LARGE' });
  const ext = sniff(buf);
  if (!ext) throw Object.assign(new Error('PNG, JPG, WebP 이미지만 받을 수 있어요'), { status: 415, code: 'BAD_IMAGE' });
  return store.withLock(w, async () => {
    const work = await store.readJson(store.wp(w, 'work.json'));
    const id = nextIdIn(work, 'im');
    const file = `${id}.${ext}`;
    await fs.writeFile(store.wp(w, 'images', file), buf);
    const index = await readIndex(store, w);
    const item = { id, kind, title: String(title || KINDS[kind].label).slice(0, 60), file, mime: MIME[ext], bytes: buf.length, prompt: String(prompt).slice(0, 4000), refs: refs.filter((x) => /^[a-z]{2}_\d{4}$/.test(x)).slice(0, 10), sceneId, provider, parent, pins: [], created_at: new Date().toISOString() };
    index.items = [...(index.items || []), item];
    await store.writeJson(store.wp(w, 'images/index.json'), index);
    await store.writeJson(store.wp(w, 'work.json'), work);
    return item;
  });
}

export function registerRoutes({ route, store, jobs, adapters, getSettings, HttpError }) {
  const wrap = (e) => (e instanceof HttpError ? e : new HttpError(e.status || 500, e.code || 'INTERNAL', e.message));
  route('GET', '/works/:w/images', async ({ params }) => ({ images: (await readIndex(store, params.w)).items, kinds: Object.fromEntries(Object.entries(KINDS).map(([k, v]) => [k, v.label])) }));
  route('POST', '/works/:w/images/prompt', async ({ params, body }) => {
    try {
      const { loadMemorySources } = await import('./write.mjs');
      const src = await loadMemorySources(store, params.w);
      const lastEp = Math.max(1, ...src.episodes.map((e) => e.no));
      return buildImagePrompt({ kind: body.kind, bible: src.bible, stateLog: src.stateLog, summaries: src.summaries, refs: Array.isArray(body.refs) ? body.refs : [], sceneId: body.sceneId, ep: Number(body.ep) || lastEp, extra: String(body.extra || '') });
    } catch (e) { throw wrap(e); }
  });
  route('POST', '/works/:w/images', async ({ params, body }) => {
    try { return await saveImage(store, params.w, body); } catch (e) { throw wrap(e); }
  });
  route('GET', '/works/:w/images/:id/file', async ({ params }) => {
    const item = (await readIndex(store, params.w)).items.find((x) => x.id === params.id);
    if (!item) throw new HttpError(404, 'NOT_FOUND', '그림을 찾을 수 없어요');
    return { __raw: true, data: await fs.readFile(store.wp(params.w, 'images', item.file)), headers: { 'Content-Type': item.mime } };
  });
  route('PATCH', '/works/:w/images/:id', async ({ params, body }) => store.withLock(params.w, async () => {
    const index = await readIndex(store, params.w);
    const item = index.items.find((x) => x.id === params.id);
    if (!item) throw new HttpError(404, 'NOT_FOUND', '그림을 찾을 수 없어요');
    if ('title' in body) item.title = String(body.title || '').slice(0, 60);
    if (Array.isArray(body.pins)) item.pins = body.pins.filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number' && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1).slice(0, 200).map((p) => ({ place: String(p.place || '').slice(0, 20), label: String(p.label || '').slice(0, 30), x: p.x, y: p.y }));
    await store.writeJson(store.wp(params.w, 'images/index.json'), index);
    if (body.portraitFor) {
      const kind = { ch: 'characters', mo: 'monsters', fc: 'factions' }[String(body.portraitFor).slice(0, 2)];
      if (!kind || !/^[a-z]{2}_\d{4}$/.test(body.portraitFor)) throw new HttpError(400, 'BAD_ID', '대표 이미지를 붙일 카드가 맞지 않아요');
      const file = store.wp(params.w, 'bible', kind, `${body.portraitFor}.json`);
      const ent = await store.readJson(file);
      ent.portrait = item.id;
      await store.writeJson(file, ent);
    }
    return item;
  }));
  route('POST', '/works/:w/images/generate', async ({ params, body }) => {
    const settings = await getSettings();
    if ((settings.imageProvider || 'manual') !== 'codex') {
      throw new HttpError(409, 'MANUAL_MODE', '그림 자동 생성이 꺼져 있어요. AI 연결 화면에서 "ChatGPT(Codex)로 그리기"를 켜거나, 프롬프트를 복사해 ChatGPT에서 만든 뒤 가져오기를 써 주세요');
    }
    if (!body.confirm) throw new HttpError(428, 'CONFIRM', '그림은 ChatGPT 사용 한도를 글보다 3~5배 빨리 써요. 확인 후 다시 눌러 주세요');
    const { loadMemorySources } = await import('./write.mjs');
    const src = await loadMemorySources(store, params.w);
    const lastEp = Math.max(1, ...src.episodes.map((e) => e.no));
    let built;
    try {
      built = buildImagePrompt({ kind: body.kind, bible: src.bible, stateLog: src.stateLog, summaries: src.summaries, refs: Array.isArray(body.refs) ? body.refs : [], sceneId: body.sceneId, ep: Number(body.ep) || lastEp, extra: String(body.extra || '') });
    } catch (e) { throw wrap(e); }
    const prompt = typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.slice(0, 4000) : built.prompt;
    const index = await readIndex(store, params.w);
    const refFiles = built.references.map((r) => index.items.find((x) => x.id === r.image)).filter(Boolean).slice(0, 5).map((x) => store.wp(params.w, 'images', x.file));
    return jobs.create({
      provider: 'codex-image', kind: 'image', confirmOverCap: !!body.confirmOverCap,
      prompt: { system: '', user: prompt, references: refFiles, mockKind: body.kind },
      parse: (text) => { try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, retryable: false, code: 'PARSE', message: '그림 결과를 읽지 못했어요' }; } },
      finish: async (value) => {
        const saved = [];
        for (const f of value.files || []) {
          const buffer = await fs.readFile(f);
          saved.push(await saveImage(store, params.w, { kind: body.kind, title: body.title || built.label, prompt, refs: Array.isArray(body.refs) ? body.refs : [], sceneId: body.sceneId || null, buffer, provider: 'codex' }));
        }
        if (!saved.length) throw Object.assign(new Error('Codex가 그림 파일을 남기지 않았어요'), { code: 'NO_IMAGE' });
        return { images: saved };
      },
    });
  });
}

// ChatGPT 구독으로 그림 만들기: 공식 Codex CLI의 내장 image_gen 도구(조사: openai/codex rust-v0.122.0부터 기본 켜짐).
// `codex exec --json` 출력에는 이미지 항목이 없어서, $CODEX_HOME/generated_images/<세션ID>/ 에서 파일을 찾는다.
// 세션ID가 thread_id와 같은지는 실측 전이라, 시작 시각 이후에 생긴 파일도 찾는다.
export function createCodexImageAdapter({ bin = 'codex', env = process.env, timeouts } = {}) {
  const label = 'ChatGPT 그림(Codex)';
  return {
    id: 'codex-image',
    label,
    async status() { return { installed: true, loggedIn: true, warnings: [] }; },
    async complete(prompt, opts = {}) {
      const cwd = await tempDir('img');
      const started = Date.now();
      let threadId = null;
      let failed = null;
      try {
        const refs = (prompt.references || []).flatMap((f) => ['-i', f]);
        const args = ['exec', ...refs, '--json', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '--color', 'never', '-'];
        const input = [
          '아래 설명대로 image_gen 도구를 써서 그림 1장을 만들어라.',
          '그림 말고 다른 파일을 만들거나 명령을 실행하지 않는다. 끝나면 "완료" 한 단어만 답한다.',
          '',
          prompt.user,
        ].join('\n');
        const run = await runCli({
          cmd: bin, args, input, cwd, env: cleanEnv(env), signal: opts.signal,
          timeouts: { first: 120000, idle: 180000, total: 600000, ...timeouts },
          onLine: (line) => {
            let ev;
            try { ev = JSON.parse(line); } catch { return; }
            if (ev.type === 'thread.started') threadId = ev.thread_id;
            else if (ev.type === 'turn.failed') failed = ev.error?.message || 'turn.failed';
            else if (ev.type === 'error') failed = ev.message || 'error';
          },
        });
        if (run.aborted) return fail('ABORT', '취소했어요');
        if (failed || run.code !== 0) return classify({ run, message: failed || '', label });
        const files = await findGenerated(env, threadId, started);
        return { ok: true, text: JSON.stringify({ files, threadId }), durationMs: Date.now() - started, model: 'gpt-image-2' };
      } finally {
        await rmDir(cwd);
      }
    },
  };
}

export async function findGenerated(env, threadId, since) {
  const root = path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'generated_images');
  const pick = async (dir) => {
    try {
      const names = await fs.readdir(dir);
      const out = [];
      for (const n of names) {
        if (!/\.(png|jpe?g|webp)$/i.test(n)) continue;
        const f = path.join(dir, n);
        const st = await fs.stat(f);
        if (st.mtimeMs >= since - 2000) out.push({ f, t: st.mtimeMs });
      }
      return out.sort((a, b) => a.t - b.t).map((x) => x.f);
    } catch { return []; }
  };
  if (threadId) {
    const direct = await pick(path.join(root, threadId));
    if (direct.length) return direct;
  }
  let dirs = [];
  try { dirs = await fs.readdir(root); } catch { return []; }
  const found = [];
  for (const d of dirs) found.push(...await pick(path.join(root, d)));
  return found.slice(-1);
}

// 모의 그림 어댑터: 1x1 PNG를 만든다(흐름 시험용).
export function createMockImageAdapter({ dir = os.tmpdir() } = {}) {
  const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  return {
    id: 'codex-image', label: '모의 그림',
    async status() { return { installed: true, loggedIn: true, warnings: [] }; },
    async complete() {
      const f = path.join(dir, `rb-mock-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
      await fs.writeFile(f, PNG_1x1);
      return { ok: true, text: JSON.stringify({ files: [f] }), durationMs: 10, model: 'mock-image' };
    },
  };
}
