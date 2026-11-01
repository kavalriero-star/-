import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startServer } from '../server.mjs';
import { createCodexImageAdapter } from '../lib/images.mjs';
import { tmp, fx } from './helpers.mjs';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function boot() {
  const s = await startServer({ port: 0, data: await tmp('srv'), questionsDir: fx('bank'), mockDelay: 20, imageMock: true, log: false, open: false });
  const base = `http://127.0.0.1:${s.port}`;
  const api = async (method, p, body, headers = {}) => {
    const r = await fetch(`${base}/api/v1${p}`, { method, headers: { Authorization: `Bearer ${s.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  const waitJob = async (id) => {
    for (let i = 0; i < 200; i++) {
      const j = (await api('GET', `/ai/jobs/${id}`)).body;
      if (!['queued', 'running'].includes(j.state)) return j;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('job timeout');
  };
  return { s, base, api, waitJob };
}

function rawRequest(port, { method = 'GET', path: p = '/', headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.end();
  });
}

test('보안: Host·토큰·Origin·Content-Type·경로 이탈', async () => {
  const { s, base, api } = await boot();
  try {
    assert.equal(await rawRequest(s.port, { path: '/api/v1/health', headers: { Host: 'evil.example:80', Authorization: `Bearer ${s.token}` } }), 421, 'DNS 리바인딩 방어');
    assert.equal((await fetch(`${base}/api/v1/health`)).status, 401, '토큰 없으면 거부');
    assert.equal((await api('GET', '/health', null, { Origin: 'http://evil.example' })).status, 403);
    assert.equal((await api('GET', '/health', null, { Origin: base })).status, 200);
    const r = await fetch(`${base}/api/v1/works`, { method: 'POST', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'text/plain' }, body: 'x' });
    assert.equal(r.status, 415);
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal((await fetch(`${base}/static/../server.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/static/%2e%2e/server.mjs`)).status, 404);
  } finally { await s.close(); }
});

test('흐름: 작품 → 위저드(모의 AI) → 회차·장면 → 공동 집필 → 기억 → 회차 요약', async () => {
  const { s, api, waitJob } = await boot();
  try {
    assert.equal((await api('POST', '/works', { title: '', genres: ['hunter'], logline: 'x' })).status, 422);
    const work = (await api('POST', '/works', { title: '균열', genres: ['hunter', 'wuxia'], logline: 'E급 헌터', primaryWeight: 70 })).body;
    assert.equal(work.genre_weights.hunter, 70);
    const w = work.id;
    let v = (await api('GET', `/works/${w}/wizard`)).body;
    assert.equal(v.next.step, 'W2');
    const job = (await api('POST', `/works/${w}/wizard/propose`, {})).body;
    const done = await waitJob(job.id);
    assert.equal(done.state, 'done', JSON.stringify(done.error));
    v = (await api('GET', `/works/${w}/wizard`)).body;
    const cand = v.cache['world.premise'].candidates[0];
    assert.equal((await api('POST', `/works/${w}/wizard/confirm`, { qid: 'world.premise', value: cand.value })).status, 200);
    assert.equal((await api('POST', `/works/${w}/wizard/confirm`, { qid: 'hero.name_role', value: { name: '한도윤', aliases: ['도윤'] } })).status, 200);
    const bad = await api('POST', `/works/${w}/wizard/confirm`, { qid: 'hero.lack', value: { lack: 7 } });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.error.details.length);

    await api('PATCH', `/works/${w}/style`, { pov: 'third_limited', rules: ['문단은 짧게'], samples: ['작가 샘플 문단'], art_style: '수묵 담채풍' });
    await api('PUT', `/works/${w}/memory/pins`, { cards: [], notes: ['도윤은 반말만 쓴다'] });
    const ep = (await api('POST', `/works/${w}/episodes`, { title: '석비' })).body;
    const sc = (await api('POST', `/works/${w}/episodes/${ep.id}/scenes`, { goal: '석비 발견', beats: '도윤이 석비 앞에 선다' })).body;
    const pv = (await api('POST', `/works/${w}/write/preview`, { ep: ep.id, sceneId: sc.id, mode: 'draft' })).body;
    assert.ok(pv.ledger.blocks.some((b) => b.key === 'pin-notes'), '고정 기억이 장부에 보인다');
    const dj = (await api('POST', `/works/${w}/write/draft`, { ep: ep.id, sceneId: sc.id, mode: 'draft' })).body;
    assert.ok(dj.ledger);
    const dr = await waitJob(dj.id);
    assert.equal(dr.state, 'done', JSON.stringify(dr.error));
    assert.ok(dr.result.prose.includes('모의 초안'));
    const acc = (await api('POST', `/works/${w}/write/accept`, { ep: ep.id, sceneId: sc.id, mode: 'draft', prose: dr.result.prose, memory: { ...dr.result.memory, 상태변화: [{ 이름: '한도윤', 항목: '부상', 값: '손바닥 화상' }] }, provider: 'mock' })).body;
    assert.equal(acc.updates.summary, true);
    const mem = (await api('GET', `/works/${w}/memory`)).body;
    assert.equal(mem.stateLog[0].value, '손바닥 화상');
    assert.equal(mem.ledgers.length, 1, '기억 장부 저장');
    const sj = (await api('POST', `/works/${w}/episodes/${ep.id}/summarize`, {})).body;
    const sr = await waitJob(sj.id);
    assert.equal(sr.state, 'done');
    const sum = (await api('POST', `/works/${w}/episodes/${ep.id}/summary`, { text: sr.result.text })).body;
    assert.ok(Array.isArray(sum.missing));
    const eps = (await api('GET', `/works/${w}/episodes`)).body.episodes;
    assert.equal(eps[0].status, 'done');
    const cands = (await api('GET', `/works/${w}/bible`)).body.candidates;
    assert.ok(Array.isArray(cands));
  } finally { await s.close(); }
});

test('설정: 실제 AI 연결 테스트는 확인을 받는다, 모의 오류 상태가 작업 오류로 나온다', async () => {
  const { s, api, waitJob } = await boot();
  try {
    assert.equal((await api('POST', '/ai/test', { provider: 'claude' })).status, 428);
    await api('PUT', '/settings', { mockMode: 'limit' });
    const j = (await api('POST', '/ai/test', { provider: 'mock' })).body;
    const r = await waitJob(j.id);
    assert.equal(r.error.code, 'LIMIT');
    assert.equal((await api('PUT', '/settings', { provider: 'codex-image' })).status, 400);
    assert.equal((await api('PUT', '/settings', { imageProvider: 'dalle' })).status, 400);
  } finally { await s.close(); }
});

test('그림: 프롬프트 조립(화풍·외형·상태), 가져오기·형식 검사, 대표 이미지, 자동 생성 확인 절차', async () => {
  const { s, api, waitJob } = await boot();
  try {
    const w = (await api('POST', '/works', { title: '균열', genres: ['hunter'], logline: 'x' })).body.id;
    await api('PATCH', `/works/${w}/style`, { art_style: '수묵 담채풍 판타지' });
    const mon = (await api('POST', `/works/${w}/bible/monster`, { name: '석비 수호자', visual: '이끼 낀 돌 거인', threat: 'B급', habitat: '심층 3층' })).body;
    const pr = (await api('POST', `/works/${w}/images/prompt`, { kind: 'monster', refs: [mon.id] })).body;
    assert.match(pr.prompt, /수묵 담채풍/);
    assert.match(pr.prompt, /이끼 낀 돌 거인/);
    assert.match(pr.prompt, /글자/);
    assert.equal((await api('POST', `/works/${w}/images`, { kind: 'monster', dataBase64: Buffer.from('not image').toString('base64') })).status, 415);
    const img = (await api('POST', `/works/${w}/images`, { kind: 'monster', title: '수호자', refs: [mon.id], dataBase64: `data:image/png;base64,${PNG}` })).body;
    assert.equal(img.mime, 'image/png');
    const file = await api('GET', `/works/${w}/images/${img.id}/file`);
    assert.equal(file.status, 200);
    assert.ok(file.body.length > 10);
    await api('PATCH', `/works/${w}/images/${img.id}`, { portraitFor: mon.id, pins: [{ place: 'pl_0001', label: '심층', x: 0.5, y: 0.2 }, { x: 2, y: 0 }] });
    const b = (await api('GET', `/works/${w}/bible`)).body;
    assert.equal(b.monster[0].portrait, img.id);
    const pr2 = (await api('POST', `/works/${w}/images/prompt`, { kind: 'monster', refs: [mon.id] })).body;
    assert.equal(pr2.references[0].image, img.id, '대표 이미지를 참조로 넘긴다');
    assert.equal((await api('POST', `/works/${w}/images/generate`, { kind: 'monster', refs: [mon.id] })).status, 409, '수동 모드');
    await api('PUT', '/settings', { imageProvider: 'codex' });
    assert.equal((await api('POST', `/works/${w}/images/generate`, { kind: 'monster', refs: [mon.id] })).status, 428, '한도 확인');
    const gj = (await api('POST', `/works/${w}/images/generate`, { kind: 'monster', refs: [mon.id], confirm: true })).body;
    const gr = await waitJob(gj.id);
    assert.equal(gr.state, 'done', JSON.stringify(gr.error));
    assert.equal(gr.result.images[0].provider, 'codex');
    const list = (await api('GET', `/works/${w}/images`)).body.images;
    assert.equal(list.length, 2);
    assert.deepEqual(list[0].pins, [{ place: 'pl_0001', label: '심층', x: 0.5, y: 0.2 }], '범위 밖 핀은 버린다');
  } finally { await s.close(); }
});

test('Codex 그림 어댑터: 가짜 codex가 만든 파일을 generated_images에서 찾고 참조 이미지를 -i로 넘긴다', async () => {
  const home = await tmp('codexhome');
  const ref = path.join(home, 'ref.png');
  await fs.writeFile(ref, Buffer.from(PNG, 'base64'));
  const a = createCodexImageAdapter({ bin: fx('fake-codex.mjs'), env: { ...process.env, CODEX_HOME: home } });
  const r = await a.complete({ user: '돌 거인', references: [ref] });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  const out = JSON.parse(r.text);
  assert.equal(out.files.length, 1);
  assert.ok(out.files[0].includes(path.join('generated_images', 'th_fake')));
});
