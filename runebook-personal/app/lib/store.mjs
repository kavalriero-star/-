// 작품 데이터 저장소. 폴더 구조는 docs/DATA_MODEL.md 1절을 따른다.
// 모든 쓰기는 원자적(임시 파일 → fsync → rename)이고, 문서마다 rev로 편집 충돌을 막는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export const WORK_ID = /^pj_\d{4}$/;
export const ENT_ID = /^[a-z]{2,3}_\d{4}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function atomicWrite(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fh = await fs.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await fs.copyFile(file, `${file}.bak`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  // Windows에서 백신·색인기가 파일을 잡고 있으면 rename이 잠깐 실패한다.
  for (let i = 0; ; i++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (e) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
        await fs.rm(tmp, { force: true });
        throw e;
      }
      await sleep(50 * 2 ** i);
    }
  }
}

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  provider: 'mock',
  perTask: {},
  models: { claude: '', codex: '' },
  assistLevel: 'L1',
  hourlyCap: 20,
  autoFallback: false,
  mockMode: 'ok',
  imageProvider: 'manual',
  memoryBudget: 60000,
};

// 엔티티 종류별 저장 위치. file: 개체마다 파일 하나, list: 목록 파일의 items[]
export const ENTITY = {
  work: { kind: 'single', rel: 'work.json' },
  world: { kind: 'single', rel: 'bible/world.json' },
  system: { kind: 'file', dir: 'bible/systems', prefix: 'sy' },
  faction: { kind: 'file', dir: 'bible/factions', prefix: 'fc' },
  character: { kind: 'file', dir: 'bible/characters', prefix: 'ch' },
  scene: { kind: 'file', dir: 'scenes', prefix: 'sc' },
  monster: { kind: 'file', dir: 'bible/monsters', prefix: 'mo' },
  relation: { kind: 'list', rel: 'bible/relations.json', prefix: 'rel' },
  event: { kind: 'list', rel: 'bible/timeline.json', prefix: 'ev' },
  thread: { kind: 'list', rel: 'bible/threads.json', prefix: 'th' },
};

export class Store {
  constructor(root) {
    this.root = path.resolve(root);
    this.locks = new Map();
  }

  async init() {
    for (const d of ['works', 'backups', 'packs']) await fs.mkdir(path.join(this.root, d), { recursive: true });
    const settingsFile = path.join(this.root, 'app.json');
    try {
      await fs.access(settingsFile);
    } catch {
      await this.writeJson(settingsFile, DEFAULT_SETTINGS);
    }
  }

  // 데이터 폴더 밖으로 나가는 경로를 막는다.
  p(...parts) {
    const full = path.resolve(this.root, ...parts);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) throw new HttpError(400, 'BAD_PATH', '잘못된 경로입니다');
    return full;
  }

  workDir(w) {
    if (!WORK_ID.test(w)) throw new HttpError(400, 'BAD_ID', '작품 id 형식이 아닙니다');
    return this.p('works', w);
  }

  wp(w, ...rel) {
    return this.p('works', this.checkWork(w), ...rel);
  }

  checkWork(w) {
    if (!WORK_ID.test(w)) throw new HttpError(400, 'BAD_ID', '작품 id 형식이 아닙니다');
    return w;
  }

  async readJson(file, fallback) {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') {
        if (fallback !== undefined) return structuredClone(fallback);
        throw new HttpError(404, 'NOT_FOUND', '찾을 수 없습니다');
      }
      throw e;
    }
  }

  async writeJson(file, obj, expectRev) {
    let cur = null;
    try {
      cur = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (expectRev !== undefined && expectRev !== null && (cur?.rev ?? 0) !== expectRev) {
      throw new HttpError(409, 'CONFLICT', '다른 곳에서 먼저 고쳤어요. 새로고침한 뒤 다시 시도해 주세요');
    }
    const { rev: _drop, ...rest } = obj;
    const out = { schemaVersion: 1, ...rest, rev: (cur?.rev ?? 0) + 1 };
    await atomicWrite(file, `${JSON.stringify(out, null, 2)}\n`);
    return out;
  }

  async appendJsonl(file, obj) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, `${JSON.stringify(obj)}\n`, 'utf8');
  }

  async readJsonl(file) {
    let text;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
    const out = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch { /* 깨진 줄은 건너뛴다(쓰기 도중 종료 등) */ }
    }
    return out;
  }

  // 같은 키(작품 id 등)에 대한 작업을 한 줄로 세운다.
  withLock(key, fn) {
    const prev = this.locks.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    this.locks.set(key, tail);
    tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
  }

  async settings() {
    return { ...DEFAULT_SETTINGS, ...(await this.readJson(this.p('app.json'), DEFAULT_SETTINGS)) };
  }

  async saveSettings(patch) {
    return this.withLock('app', async () => {
      const cur = await this.settings();
      return this.writeJson(this.p('app.json'), { ...cur, ...patch });
    });
  }

  async listWorks() {
    let names = [];
    try {
      names = await fs.readdir(this.p('works'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const out = [];
    for (const n of names.filter((x) => WORK_ID.test(x)).sort()) {
      try {
        const w = await this.readJson(this.wp(n, 'work.json'));
        const st = await fs.stat(this.wp(n, 'work.json'));
        out.push({ id: w.id, title: w.title, genres: w.genres, logline: w.logline, updatedAt: st.mtime.toISOString() });
      } catch { /* 읽을 수 없는 폴더는 목록에서 뺀다 */ }
    }
    return out.reverse();
  }

  async createWork({ title, genres, genre_weights, logline, mix_policy }) {
    return this.withLock('works', async () => {
      const existing = (await fs.readdir(this.p('works'))).filter((x) => WORK_ID.test(x));
      const n = existing.reduce((m, x) => Math.max(m, Number(x.slice(3))), 0) + 1;
      const id = `pj_${String(n).padStart(4, '0')}`;
      for (const d of ['bible/systems', 'bible/factions', 'bible/characters', 'bible/monsters', 'scenes', 'chapters', 'ai/cache', 'memory/ledger', 'images', '.history']) {
        await fs.mkdir(this.wp(id, d), { recursive: true });
      }
      const work = {
        id,
        title,
        genres,
        genre_weights: genre_weights || Object.fromEntries(genres.map((g, i) => [g, i === 0 ? (genres.length > 1 ? 60 : 100) : 40])),
        tags: [],
        style: { pov: null, notes: '' },
        mix_policy: {
          primary: genres[0],
          system_relation: null,
          vocab_zones: [],
          accuracy_level: 'loose',
          rank_mapping: [],
          knowledge_holders: [],
          ext: {},
          ...(mix_policy || {}),
        },
        logline,
        usp: '',
        tone: [],
        target: { eps: null, chars_per_ep: 5500 },
        assist_level: 'L1',
        pref_rules: [],
        wizard: { slots: {} },
        idSeq: {},
        exceptions: [],
        ai_filled: [],
        created_at: new Date().toISOString(),
      };
      const saved = await this.writeJson(this.wp(id, 'work.json'), work);
      await this.writeJson(this.wp(id, 'bible/world.json'), {
        id: 'wd_0001', era: null, premise: '', rules: [], places: [], public_knowledge: '',
        society: { races: [], nations: [], reactions: [] }, secrecy: { public: [], hidden: [] }, ai_filled: [],
      });
      for (const rel of ['bible/relations.json', 'bible/timeline.json', 'bible/threads.json', 'chapters/index.json']) {
        await this.writeJson(this.wp(id, rel), { items: [] });
      }
      return saved;
    });
  }

  // 작품 안에서 쓰는 다음 id. work.json의 idSeq에 기록한다(호출자가 작품 잠금 안에서 부른다).
  async issueId(w, prefix) {
    const file = this.wp(w, 'work.json');
    const work = await this.readJson(file);
    const seq = { ...(work.idSeq || {}) };
    seq[prefix] = (seq[prefix] || 0) + 1;
    await this.writeJson(file, { ...work, idSeq: seq });
    return `${prefix}_${String(seq[prefix]).padStart(4, '0')}`;
  }

  async listDir(w, rel) {
    try {
      return (await fs.readdir(this.wp(w, rel))).filter((f) => f.endsWith('.json') && ENT_ID.test(f.slice(0, -5))).sort();
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  }

  async bible(w) {
    const out = {
      work: await this.readJson(this.wp(w, 'work.json')),
      world: await this.readJson(this.wp(w, 'bible/world.json'), {}),
    };
    for (const [name, def] of Object.entries(ENTITY)) {
      if (def.kind === 'file') {
        out[name] = [];
        for (const f of await this.listDir(w, def.dir)) out[name].push(await this.readJson(this.wp(w, def.dir, f)));
      } else if (def.kind === 'list') {
        out[name] = (await this.readJson(this.wp(w, def.rel), { items: [] })).items || [];
      }
    }
    return out;
  }
}

// 메모리의 work 객체에서 다음 id를 뽑는다. 호출자가 마지막에 work.json을 한 번 저장한다.
export function nextIdIn(work, prefix) {
  work.idSeq = { ...(work.idSeq || {}) };
  work.idSeq[prefix] = (work.idSeq[prefix] || 0) + 1;
  return `${prefix}_${String(work.idSeq[prefix]).padStart(4, '0')}`;
}
