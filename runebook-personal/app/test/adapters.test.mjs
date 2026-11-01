import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClaudeAdapter, claudeArgs } from '../lib/adapters/claude.mjs';
import { createCodexAdapter } from '../lib/adapters/codex.mjs';
import { createMockAdapter } from '../lib/adapters/mock.mjs';
import { Jobs } from '../lib/jobs.mjs';
import { tmp, fx } from './helpers.mjs';

const P = (user) => ({ system: 'SYS 시스템 지시', user });

test('claude: 고정 호출 형태(설계서 8.3)', () => {
  const a = claudeArgs({ systemPromptFile: '/x/s.txt', model: 'sonnet' });
  for (const f of ['-p', '--tools', '--safe-mode', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']) assert.ok(a.includes(f), f);
  assert.equal(a[a.indexOf('--tools') + 1], '');
  assert.equal(a[a.indexOf('--output-format') + 1], 'stream-json');
  assert.ok(!a.includes('--bare'), '--bare는 구독 OAuth를 읽지 않는다');
});

test('claude: 정상 응답, 스트리밍 델타, 한도 정보, 빈 작업 폴더, 시스템 프롬프트 파일', async () => {
  const c = createClaudeAdapter({ bin: fx('fake-claude.mjs') });
  let deltas = 0;
  const r = await c.complete(P('질문 [[REPLY:{"답":"한글 응답"}]]'), { onDelta: () => { deltas += 1; } });
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(r.text), { 답: '한글 응답' });
  assert.ok(deltas > 1);
  assert.equal(r.limit.utilization, 0.5);
  const e = await c.complete(P('[[FAKE:echo]]'));
  const j = JSON.parse(e.text);
  assert.equal(j.cwdEmpty, true, '작업 폴더는 비어 있어야 한다');
  assert.ok(j.sys.startsWith('SYS'), '시스템 프롬프트는 파일로 전달');
});

test('claude: API 키 환경변수는 넘기지 않고, API 키 인증이면 즉시 중단', async () => {
  const c = createClaudeAdapter({ bin: fx('fake-claude.mjs'), env: { ...process.env, ANTHROPIC_API_KEY: 'sk-test', RUNEBOOK_JUNK: '1' } });
  const r = await c.complete(P('[[FAKE:env]]'));
  assert.deepEqual(JSON.parse(r.text), { hasKey: false, hasOauth: false, hasJunk: false });
  const b = await c.complete(P('[[FAKE:apikey]]'));
  assert.equal(b.ok, false);
  assert.equal(b.error.code, 'API_KEY_IN_USE');
});

test('claude: 오류 분류(로그인, 한도, 비정상 종료, 미설치, 타임아웃, 취소)', async () => {
  const c = createClaudeAdapter({ bin: fx('fake-claude.mjs') });
  assert.equal((await c.complete(P('[[FAKE:auth]]'))).error.code, 'NOT_LOGGED_IN');
  const lim = await c.complete(P('[[FAKE:limit]]'));
  assert.equal(lim.error.code, 'LIMIT');
  assert.equal(lim.error.resetsAt, 1900000000);
  assert.equal((await c.complete(P('[[FAKE:crash]]'))).error.code, 'CRASH');
  assert.equal((await createClaudeAdapter({ bin: '/없는/claude' }).complete(P('x'))).error.code, 'NOT_INSTALLED');
  const t = await c.complete(P('[[FAKE:stall]]'), { timeouts: { idle: 300 } });
  assert.equal(t.error.code, 'TIMEOUT');
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 200);
  assert.equal((await c.complete(P('[[FAKE:stall]]'), { signal: ctrl.signal })).error.code, 'ABORT');
});

test('claude: status(로그인/로그아웃/미설치)', async () => {
  const dir = await tmp('bin');
  const out = path.join(dir, 'claude-loggedout.mjs');
  await fs.copyFile(fx('fake-claude.mjs'), out);
  await fs.chmod(out, 0o755);
  const ok = await createClaudeAdapter({ bin: fx('fake-claude.mjs') }).status();
  assert.equal(ok.installed, true);
  assert.equal(ok.loggedIn, true);
  assert.equal(ok.authMethod, 'claude.ai');
  assert.equal((await createClaudeAdapter({ bin: out }).status()).loggedIn, false);
  assert.equal((await createClaudeAdapter({ bin: '/없는/claude' }).status()).installed, false);
});

test('codex: 정상 응답(마지막 agent_message), 인자, 오류 분류, status', async () => {
  const c = createCodexAdapter({ bin: fx('fake-codex.mjs') });
  const r = await c.complete(P('[[REPLY:{"답":1}]]'));
  assert.equal(r.ok, true);
  assert.deepEqual(JSON.parse(r.text), { 답: 1 });
  const a = JSON.parse((await c.complete(P('[[FAKE:args]]'))).text);
  assert.ok(a.hasSystem, '지침은 stdin 앞머리');
  for (const f of ['exec', '--json', '--ephemeral', '--skip-git-repo-check', 'read-only', '-C', '-']) assert.ok(a.args.includes(f), f);
  assert.equal((await c.complete(P('[[FAKE:limit]]'))).error.code, 'LIMIT');
  assert.equal((await c.complete(P('[[FAKE:auth]]'))).error.code, 'NOT_LOGGED_IN');
  assert.equal((await c.complete(P('[[FAKE:crash]]'))).error.code, 'CRASH');
  const st = await c.status();
  assert.equal(st.loggedIn, true);
  assert.equal(st.authMethod, 'chatgpt');
});

test('jobs: 동시 실행 1개, 파싱 실패 1회 재시도, 빈 응답, 취소, 한도 보호', async () => {
  let calls = 0;
  const flaky = { id: 'claude', label: 'Claude', complete: async (p) => { calls += 1; return { ok: true, text: p.user.includes('JSON 객체 하나만') ? '{"a":1}' : '설명뿐' }; } };
  const usage = [];
  const jobs = new Jobs({ adapters: { claude: flaky, mock: createMockAdapter({ delayMs: 50 }) }, getSettings: async () => ({ hourlyCap: 2, models: {} }), usageStore: { load: async () => usage, save: async () => {} } });
  const parse = (t) => { try { return { ok: true, value: JSON.parse(t) }; } catch { return { ok: false, retryable: true }; } };
  const j = await jobs.create({ provider: 'claude', kind: 't', prompt: P('q'), parse });
  while (['queued', 'running'].includes(jobs.view(j.id).state)) await new Promise((r) => setTimeout(r, 10));
  assert.equal(jobs.view(j.id).state, 'done');
  assert.equal(calls, 2, '파싱 실패 뒤 1회만 재시도');
  await assert.rejects(jobs.create({ provider: 'claude', kind: 't', prompt: P('q'), parse }), (e) => e.code === 'SOFT_CAP');
  const ok = await jobs.create({ provider: 'claude', kind: 't', prompt: P('q'), parse, confirmOverCap: true });
  assert.ok(ok.id);
  const m1 = await jobs.create({ provider: 'mock', kind: 't', prompt: { ...P('q'), mock: () => ({ x: 1 }) } });
  const m2 = await jobs.create({ provider: 'mock', kind: 't', prompt: { ...P('q'), mock: () => ({ x: 2 }) } });
  assert.equal(jobs.view(m2.id).state, 'queued');
  jobs.cancel(m2.id);
  assert.equal(jobs.view(m2.id).state, 'cancelled');
  while (['queued', 'running'].includes(jobs.view(m1.id).state)) await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(jobs.view(m1.id).result, { text: '{"x":1}' });
  const u = await jobs.usage();
  assert.ok(u.claude.lastHour >= 3);
  assert.equal(u.mock.lastHour, 0, '모의 호출은 세지 않는다');
});

test('mock: 시험용 오류 상태', async () => {
  let mode = 'limit';
  const m = createMockAdapter({ getMode: () => mode, delayMs: 10 });
  assert.equal((await m.complete(P('q'))).error.code, 'LIMIT');
  mode = 'login';
  assert.equal((await m.complete(P('q'))).error.code, 'NOT_LOGGED_IN');
  mode = 'badjson';
  assert.equal((await m.complete(P('q'))).ok, true);
});
