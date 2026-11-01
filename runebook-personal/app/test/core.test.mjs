import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validate } from '../lib/validate.mjs';
import { extractJson } from '../lib/extract.mjs';
import { Store, atomicWrite } from '../lib/store.mjs';
import { runCli, cleanEnv } from '../lib/runner.mjs';
import { tmp, fx } from './helpers.mjs';

test('validate: 타입·필수·길이·열거형·추가 키', () => {
  const s = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string', maxLength: 3 }, b: { type: 'integer', enum: [1, 2] }, c: { type: 'array', maxItems: 1, items: { type: 'string' } } } };
  assert.deepEqual(validate(s, { a: '가나다' }), []);
  assert.equal(validate(s, { a: '가나다라' }).length, 1, '한글은 코드 포인트로 센다');
  assert.equal(validate(s, {}).length, 1);
  assert.equal(validate(s, { a: 'x', b: 3 }).length, 1);
  assert.equal(validate(s, { a: 'x', z: 1 }).length, 1);
  assert.equal(validate(s, { a: 'x', c: ['1', '2'] }).length, 1);
  assert.equal(validate({ type: ['string', 'null'] }, null).length, 0);
  assert.equal(validate({ type: 'number' }, 3).length, 0, 'integer는 number로 통과');
});

test('extractJson: 코드펜스·앞뒤 설명을 견딘다', () => {
  assert.deepEqual(extractJson('{"a":1}').value, { a: 1 });
  assert.deepEqual(extractJson('설명입니다\n```json\n{"a":2}\n```\n끝').value, { a: 2 });
  assert.deepEqual(extractJson('앞 {"a":3} 뒤').value, { a: 3 });
  assert.equal(extractJson('JSON 없음').ok, false);
  assert.equal(extractJson('').error, 'EMPTY');
});

test('store: 원자적 저장, rev 충돌, 경로 이탈 차단, 작품 생성', async () => {
  const root = await tmp('store');
  const st = new Store(root);
  await st.init();
  const f = path.join(root, 'x.json');
  const a = await st.writeJson(f, { v: 1 });
  assert.equal(a.rev, 1);
  const b = await st.writeJson(f, { v: 2 }, 1);
  assert.equal(b.rev, 2);
  await assert.rejects(st.writeJson(f, { v: 3 }, 1), (e) => e.status === 409);
  assert.equal(JSON.parse(await fs.readFile(`${f}.bak`, 'utf8')).v, 1, '직전본 .bak');
  assert.throws(() => st.p('..', 'etc'), (e) => e.code === 'BAD_PATH');
  assert.throws(() => st.wp('../x'), (e) => e.code === 'BAD_ID');
  const w = await st.createWork({ title: '시험', genres: ['hunter', 'wuxia'], logline: '한 줄' });
  assert.equal(w.id, 'pj_0001');
  assert.equal(w.genre_weights.hunter, 60);
  const w2 = await st.createWork({ title: '둘째', genres: ['fantasy'], logline: 'x' });
  assert.equal(w2.id, 'pj_0002');
  const list = await st.listWorks();
  assert.deepEqual(list.map((x) => x.id), ['pj_0002', 'pj_0001']);
  const bible = await st.bible('pj_0001');
  assert.deepEqual(bible.character, []);
  assert.equal(bible.world.id, 'wd_0001');
  await atomicWrite(path.join(root, 'deep', 'a.txt'), '한글');
  assert.equal(await fs.readFile(path.join(root, 'deep', 'a.txt'), 'utf8'), '한글');
});

test('store: 같은 작품의 쓰기는 한 줄로 선다', async () => {
  const st = new Store(await tmp('lock'));
  await st.init();
  const order = [];
  await Promise.all([1, 2, 3].map((i) => st.withLock('k', async () => { order.push(`s${i}`); await new Promise((r) => setTimeout(r, 10)); order.push(`e${i}`); })));
  assert.deepEqual(order, ['s1', 'e1', 's2', 'e2', 's3', 'e3']);
});

test('cleanEnv: API 키 계열은 제거, 구독 토큰과 PATH는 유지, 그 밖은 버림', () => {
  const env = cleanEnv({ PATH: '/bin', ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k', CODEX_API_KEY: 'k', CLAUDE_CODE_USE_BEDROCK: '1', ANTHROPIC_FEDERATION_X: '1', CLAUDE_CODE_OAUTH_TOKEN: 't', RANDOM: 'x' });
  assert.deepEqual(Object.keys(env).sort(), ['CLAUDE_CODE_OAUTH_TOKEN', 'PATH']);
});

test('runCli: 한글 바이트가 쪼개져 와도 줄을 온전히 받는다', async () => {
  const lines = [];
  const r = await runCli({ cmd: fx('fake-bytes.mjs'), env: cleanEnv(), onLine: (l) => lines.push(l) });
  assert.equal(r.code, 0);
  assert.deepEqual(lines, ['가나', '다라']);
});

test('runCli: 첫 바이트 타임아웃과 없는 명령', async () => {
  const r = await runCli({ cmd: fx('fake-claude.mjs'), args: ['-p'], input: '[[FAKE:silent]]', env: cleanEnv(), timeouts: { first: 300 } });
  assert.equal(r.timedOut, 'first');
  const n = await runCli({ cmd: '/없는/명령', env: cleanEnv() });
  assert.equal(n.spawnError, 'ENOENT');
});

test('runCli: 타임아웃이면 손자 프로세스까지 종료', { skip: process.platform === 'win32' }, async () => {
  let grand = 0;
  const r = await runCli({ cmd: fx('fake-tree.mjs'), env: cleanEnv(), timeouts: { idle: 300 }, onLine: (l) => { grand = Number(l); } });
  assert.equal(r.timedOut, 'idle');
  assert.ok(grand > 0);
  await new Promise((res) => setTimeout(res, 300));
  // 컨테이너의 1번 프로세스가 고아를 거두지 않으면 좀비(Z)로 남는다. 좀비는 이미 종료된 것이다.
  let alive = true;
  try { process.kill(grand, 0); } catch { alive = false; }
  if (alive) {
    try { alive = !/State:\s+Z/.test(await fs.readFile(`/proc/${grand}/status`, 'utf8')); } catch { alive = false; }
  }
  assert.equal(alive, false, '손자 프로세스가 남아 있으면 안 된다');
});
