import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.mjs';
import * as wz from '../lib/wizard.mjs';
import { tmp, fx } from './helpers.mjs';

async function setup(genres = ['hunter', 'wuxia']) {
  const st = new Store(await tmp('wz'));
  await st.init();
  const bank = await wz.loadBank(fx('bank'));
  assert.deepEqual(bank.problems, []);
  const w = await st.createWork({ title: '시험', genres, logline: '한 줄' });
  await wz.recordSetup(st, w.id, bank, { 'work.genres': { genres, genre_weights: w.genre_weights }, 'work.logline': { logline: '한 줄' } });
  return { st, bank, w: w.id };
}

test('장르별 문항 선택: 혼합은 mix 문항 포함, 단일 장르는 제외', async () => {
  const { bank } = await setup();
  const ids = (g) => wz.activeQuestions(bank, { genres: g }).map((q) => q.qid);
  assert.ok(ids(['hunter', 'wuxia']).includes('mix.system_relation'));
  assert.ok(!ids(['hunter']).includes('mix.system_relation'));
  assert.ok(ids(['hunter']).includes('hunter.ladder'));
  assert.ok(!ids(['hunter']).includes('wuxia.ladder'));
});

test('다음 묶음: setup 문항은 건너뛰고 같은 단계에서 최대 4개', async () => {
  const { st, bank, w } = await setup();
  const v = await wz.view(st, w, bank);
  assert.deepEqual(v.next, { step: 'W2', qids: ['world.premise', 'world.rules'] });
  assert.equal(v.canStart, false);
});

test('후보 요청(모의) → 검증 → 저장, 형식 위반 후보는 버린다', async () => {
  const { st, bank, w } = await setup();
  const prep = await wz.prepareProposal(st, w, bank, { assistLevel: 'L1' }, {});
  assert.equal(prep.step, 'W2');
  assert.ok(prep.prompt.user.includes('⟦자료:확정설정:'));
  assert.ok(prep.prompt.user.includes('world.rules'));
  const mock = prep.prompt.mock();
  mock.문항[0].후보.unshift({ 번호: 0, 제목: '깨진', 설명: '', 값: { premise: 1 } });
  const parsed = wz.parseProposal(JSON.stringify(mock), prep.batch);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.dropped, 1);
  assert.equal(parsed.value.questions[0].candidates.length, 3);
  await wz.storeProposal(st, w, parsed.value, { mode: 'batch', provider: 'mock' });
  const v = await wz.view(st, w, bank);
  assert.equal(v.cache['world.premise'].candidates[0].title, '균열');
  assert.equal(wz.parseProposal('설명만', prep.batch).retryable, true);
  assert.equal(wz.parseProposal('{"문항":[{"문항ID":"world.premise","후보":[{"값":{"x":1}}]}]}', prep.batch).code, 'NO_VALID');
});

test('확정: 슬롯 개체 생성·id 발급·append id·ai_filled, 검증 오류, 필수 자동 금지', async () => {
  const { st, bank, w } = await setup();
  await wz.confirm(st, w, bank, { qid: 'world.premise', value: { premise: '게이트는 균열이다' } });
  await wz.confirm(st, w, bank, { qid: 'world.rules', value: { rules: [{ text: '석비는 못 부순다', hard: true }] } });
  await wz.confirm(st, w, bank, { qid: 'hero.name_role', value: { name: '한도윤', aliases: ['도윤'], age: { value: 29 } } });
  await wz.confirm(st, w, bank, { qid: 'hero.lack', value: { lack: '가족을 잃음' } });
  await wz.confirm(st, w, bank, { qid: 'hunter.ladder', value: { ladder: [{ rank: 1, name: 'F' }] }, auto: true });
  const b = await st.bible(w);
  assert.equal(b.world.rules[0].id, 'ru_0001');
  assert.equal(b.character.length, 1);
  assert.equal(b.character[0].id, 'ch_0001');
  assert.equal(b.character[0].role, 'protagonist');
  assert.equal(b.character[0].lack, '가족을 잃음');
  assert.equal(b.system[0].kind, 'awakening');
  assert.deepEqual(b.system[0].ai_filled, ['ladder']);
  await assert.rejects(wz.confirm(st, w, bank, { qid: 'hero.lack', value: { lack: 1 } }), (e) => e.code === 'VALIDATION');
  await assert.rejects(wz.confirm(st, w, bank, { qid: 'hero.lack', value: { lack: 'x' }, auto: true }), (e) => e.code === 'REQUIRED');
  await assert.rejects(wz.skip(st, w, bank, { qid: 'hero.lack' }), (e) => e.code === 'REQUIRED');
  const v = await wz.view(st, w, bank);
  assert.equal(v.canStart, true, '시험 은행의 필수 문항을 모두 채웠다');
  const solo = await st.createWork({ title: '단일', genres: ['hunter'], logline: 'x' });
  await assert.rejects(wz.confirm(st, solo.id, bank, { qid: 'wuxia.ladder', value: { ladder: [{ rank: 1, name: '삼류' }] } }), (e) => e.code === 'INACTIVE');
});

test('관계 슬롯은 주인공·조연 id를 자동으로 잇는다', async () => {
  const { st, bank, w } = await setup();
  await wz.confirm(st, w, bank, { qid: 'hero.name_role', value: { name: '한도윤' } });
  await wz.confirm(st, w, bank, { qid: 'support.name_role', value: { name: '백 노인' } });
  await wz.confirm(st, w, bank, { qid: 'relation.hero_support', value: { type: '사제' } });
  const b = await st.bible(w);
  assert.equal(b.relation[0].a, 'ch_0001');
  assert.equal(b.relation[0].b, 'ch_0002');
});

test('되돌리기: 이전 값 복원, append 항목 제거, 재검토 표시, 연쇄 되돌리기', async () => {
  const { st, bank, w } = await setup();
  await wz.confirm(st, w, bank, { qid: 'world.premise', value: { premise: '첫 전제' } });
  await wz.confirm(st, w, bank, { qid: 'world.rules', value: { rules: [{ text: '규칙1', hard: true }] } });
  await wz.confirm(st, w, bank, { qid: 'world.premise', value: { premise: '둘째 전제' } });
  let v = await wz.view(st, w, bank);
  const rulesQ = v.steps.find((s) => s.id === 'W2').questions.find((q) => q.qid === 'world.rules');
  assert.equal(rulesQ.needsReview, true, '의존 문항이 나중에 바뀌면 재검토 필요');
  await wz.revert(st, w, bank, { qid: 'world.premise' });
  let b = await st.bible(w);
  assert.equal(b.world.premise, '첫 전제', '직전 값으로 복원');
  await wz.revert(st, w, bank, { qid: 'world.premise', cascade: true }).catch(() => {});
  await wz.confirm(st, w, bank, { qid: 'world.premise', value: { premise: '새 전제' } });
  await wz.confirm(st, w, bank, { qid: 'world.rules', value: { rules: [{ text: '규칙2', hard: false }] } });
  const r = await wz.revert(st, w, bank, { qid: 'world.premise', cascade: true });
  assert.deepEqual(r.reverted.sort(), ['world.premise', 'world.rules']);
  b = await st.bible(w);
  assert.ok(!b.world.rules.some((x) => x.text === '규칙2'), 'append로 넣은 항목 제거');
  v = await wz.view(st, w, bank);
  assert.equal(v.steps.find((s) => s.id === 'W2').questions.find((q) => q.qid === 'world.rules').status, 'open');
});

test('진행률과 집필 시작 가능', async () => {
  const { st, bank, w } = await setup(['hunter']);
  await wz.confirm(st, w, bank, { qid: 'world.premise', value: { premise: 'a' } });
  await wz.confirm(st, w, bank, { qid: 'world.rules', value: { rules: [{ text: 'b', hard: true }] } });
  await wz.confirm(st, w, bank, { qid: 'hero.name_role', value: { name: 'c' } });
  await wz.confirm(st, w, bank, { qid: 'hero.lack', value: { lack: 'd' } });
  const v = await wz.view(st, w, bank);
  assert.equal(v.canStart, true);
  assert.ok(v.progress.pct > 50 && v.progress.pct < 100);
});
