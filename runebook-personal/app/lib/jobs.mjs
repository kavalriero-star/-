// AI 호출 작업 큐. 동시 실행 1개, 대기 최대 5개(설계서 8.5절).
// 자동 재시도는 JSON 파싱 실패와 빈 응답에만, 작업당 1회(PROMPTS.md 4절).
import crypto from 'node:crypto';
import { HttpError } from './store.mjs';

const KEEP_MS = 15 * 60 * 1000;

export class Jobs {
  constructor({ adapters, getSettings, usageStore }) {
    this.adapters = adapters;
    this.getSettings = getSettings;
    this.usageStore = usageStore; // { load():Promise<array>, save(array):Promise }
    this.jobs = new Map();
    this.queue = [];
    this.running = null;
    this.calls = null;
  }

  async loadUsage() {
    if (!this.calls) this.calls = (await this.usageStore?.load()) || [];
    const cut = Date.now() - 2 * 24 * 3600 * 1000;
    this.calls = this.calls.filter((c) => c.t > cut);
    return this.calls;
  }

  async usage() {
    const calls = await this.loadUsage();
    const hour = Date.now() - 3600 * 1000;
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const by = (p, since) => calls.filter((c) => c.provider === p && c.t >= since).length;
    const out = {};
    for (const p of Object.keys(this.adapters)) out[p] = { lastHour: by(p, hour), today: by(p, dayStart.getTime()) };
    return out;
  }

  async create({ provider, kind, prompt, opts = {}, parse, finish, confirmOverCap = false }) {
    const adapter = this.adapters[provider];
    if (!adapter) throw new HttpError(400, 'BAD_PROVIDER', '알 수 없는 AI입니다');
    if (this.queue.length >= 5) throw new HttpError(429, 'QUEUE_FULL', '대기 중인 요청이 5개예요. 잠시 뒤에 다시 시도해 주세요');
    if (provider !== 'mock') {
      const settings = await this.getSettings();
      const u = (await this.usage())[provider];
      if (u.lastHour >= settings.hourlyCap && !confirmOverCap) {
        throw new HttpError(429, 'SOFT_CAP', `지난 1시간 동안 ${adapter.label}를 ${u.lastHour}회 불렀어요. 구독 한도를 아끼려고 확인을 받아요`);
      }
    }
    const job = {
      id: crypto.randomBytes(8).toString('hex'),
      provider, kind, state: 'queued', createdAt: Date.now(), startedAt: null, endedAt: null,
      chars: 0, attempts: 0, result: null, error: null,
      prompt, opts, parse, finish, ctrl: new AbortController(),
    };
    this.jobs.set(job.id, job);
    this.queue.push(job);
    this.pump();
    return this.view(job.id);
  }

  pump() {
    if (this.running || !this.queue.length) return;
    const job = this.queue.shift();
    this.running = job;
    this.run(job).finally(() => {
      this.running = null;
      this.gc();
      this.pump();
    });
  }

  async run(job) {
    job.state = 'running';
    job.startedAt = Date.now();
    const adapter = this.adapters[job.provider];
    const settings = await this.getSettings();
    const model = settings.models?.[job.provider] || undefined;
    let prompt = job.prompt;
    try {
      for (;;) {
        job.attempts += 1;
        if (job.provider !== 'mock') {
          await this.loadUsage();
          this.calls.push({ t: Date.now(), provider: job.provider, kind: job.kind });
          await this.usageStore?.save(this.calls);
        }
        const r = await adapter.complete(prompt, {
          ...job.opts, model, signal: job.ctrl.signal,
          onDelta: (_d, total) => { job.chars = total; },
        });
        if (!r.ok) {
          job.state = r.error.code === 'ABORT' ? 'cancelled' : 'error';
          job.error = r.error;
          return;
        }
        job.meta = { durationMs: r.durationMs, model: r.model, limit: r.limit || null };
        if (!r.text || !r.text.trim()) {
          if (job.attempts < 2) continue; // 빈 응답: 1회 재시도
          job.state = 'error';
          job.error = { code: 'EMPTY', message: 'AI가 빈 응답을 보냈어요' };
          return;
        }
        if (job.parse) {
          const p = job.parse(r.text);
          if (!p.ok) {
            if (p.retryable && job.attempts < 2) {
              prompt = { ...prompt, user: `${prompt.user}\n\nJSON 객체 하나만 출력하라.` };
              continue;
            }
            job.state = 'error';
            job.error = { code: p.code || 'PARSE', message: p.message || 'AI 응답을 읽지 못했어요', details: p.details };
            return;
          }
          job.result = job.finish ? await job.finish(p.value, job) : p.value;
        } else {
          job.result = { text: r.text };
        }
        job.state = 'done';
        return;
      }
    } catch (e) {
      job.state = 'error';
      job.error = { code: e.code || 'INTERNAL', message: e.message };
    } finally {
      job.endedAt = Date.now();
    }
  }

  cancel(id) {
    const job = this.jobs.get(id);
    if (!job) throw new HttpError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다');
    if (job.state === 'queued') {
      this.queue = this.queue.filter((j) => j !== job);
      job.state = 'cancelled';
      job.endedAt = Date.now();
    } else if (job.state === 'running') {
      job.ctrl.abort();
    }
    return this.view(id);
  }

  view(id) {
    const job = this.jobs.get(id);
    if (!job) throw new HttpError(404, 'NOT_FOUND', '작업을 찾을 수 없습니다');
    const now = job.endedAt || Date.now();
    return {
      id: job.id, provider: job.provider, kind: job.kind, state: job.state,
      queuePosition: job.state === 'queued' ? this.queue.indexOf(job) + 1 : 0,
      elapsedMs: job.startedAt ? now - job.startedAt : 0,
      chars: job.chars, attempts: job.attempts,
      result: job.state === 'done' ? job.result : null,
      error: job.error, meta: job.meta || null,
    };
  }

  gc() {
    const cut = Date.now() - KEEP_MS;
    for (const [id, j] of this.jobs) if (j.endedAt && j.endedAt < cut) this.jobs.delete(id);
  }
}
