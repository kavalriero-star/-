import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../lib/store.mjs';
import * as wz from '../lib/wizard.mjs';
import * as wr from '../lib/write.mjs';
import { assembleMemory, nameDictionary, findNames, currentState } from '../lib/memory.mjs';
import { tmp, fx } from './helpers.mjs';

test('이름 연결: 최장 일치, 조사, 앞 글자가 한글이면 제외, 한 글자 별칭 제외, 모호함', () => {
  const bible = { character: [{ id: 'ch_0001', name: '한도윤', aliases: ['도윤', '윤'] }, { id: 'ch_0002', name: '백 노인', aliases: [] }], faction: [{ id: 'fc_0001', name: '협회', aliases: [] }], system: [{ id: 'sy_0001', name: '내공', aliases: ['기'] }], world: { places: [] } };
  const d = nameDictionary(bible);
  assert.equal(d.has('윤'), false);
  assert.equal(d.has('기'), false);
  const hit = findNames('한도윤은 협회에 갔다. 도윤이 웃었다. 백 노인의 포장마차. 이도윤수는 무관.', d);
  assert.deepEqual([...hit.keys()].sort(), ['ch_0001', 'ch_0002', 'fc_0001']);
  assert.equal(findNames('도윤아, 내공을 써라', d).size, 2, '호격 조사와 목적격 조사');
  assert.equal(findNames('협회장', d).size, 0, '뒤에 한글이 붙어 다른 낱말이면 제외');
  const amb = nameDictionary({ character: [{ id: 'a', name: '청운', aliases: [] }, { id: 'b', name: '청운', aliases: [] }] });
  assert.equal(findNames('청운이 왔다', amb).size, 0, '같은 이름 두 카드는 연결하지 않음');
});

test('시점별 상태: 해당 회차까지의 마지막 값', () => {
  const log = [{ entity: 'x', ep: 1, field: '부상', value: '없음' }, { entity: 'x', ep: 3, field: '부상', value: '왼팔 골절' }, { entity: 'x', ep: 5, field: '부상', value: '회복' }];
  assert.equal(currentState(log, 'x', 4).부상.value, '왼팔 골절');
  assert.equal(currentState(log, 'x', 5).부상.value, '회복');
});

function sources(extra = {}) {
  return {
    bible: {
      work: { title: '균열', genres: ['hunter'], logline: 'E급 헌터', style: { pov: 'third_limited', rules: ['문단은 짧게'], samples: ['작가가 쓴 문단'] } },
      world: { premise: '게이트는 균열', rules: [{ text: '석비는 못 부순다', hard: true }], places: [{ id: 'pl_0001', name: '강남 게이트존', aliases: ['강남존'], note: '심층 3층' }] },
      system: [{ id: 'sy_0001', name: '각성', kind: 'awakening', ladder: [{ rank: 1, name: 'F' }] }],
      character: [{ id: 'ch_0001', slot: 'hero', role: 'protagonist', name: '한도윤', aliases: ['도윤'], lack: '가족' }, { id: 'ch_0002', slot: 'support', name: '백 노인', aliases: [], goal: '석비 수호' }, { id: 'ch_0003', name: '윤세아', aliases: [] }],
      faction: [], monster: [], thread: [{ id: 'th_0001', title: '할아버지의 공책', planted_ep: 1 }], event: [],
    },
    summaries: { scenes: {}, episodes: { 1: { text: '1화 요약' }, 2: { text: '2화 요약' } }, arcs: [] },
    stateLog: [{ entity: 'ch_0001', ep: 2, field: '부상', value: '왼팔 골절' }],
    plan: { arcs: [{ title: '석비', from: 1, to: 10, goal: '석비의 비밀' }], episodes: [{ no: 3, goal: '심층 진입' }] },
    pins: { cards: [], notes: ['도윤은 절대 존댓말을 쓰지 않는다'] },
    episodes: [{ no: 2, scenes: [{ id: 'sc_0001', text: '백 노인이 국수를 말았다. '.repeat(300) }] }, { no: 3, scenes: [{ id: 'sc_0002', text: '' }] }],
    ...extra,
  };
}

test('기억 조립: 고정 기억·관련 카드·상태·떡밥·원문이 층별로 들어간다', () => {
  const { blocks, ledger } = assembleMemory(sources(), { ep: 3, sceneId: 'sc_0002', beats: '도윤이 강남존 심층으로 내려간다', budget: 60000 });
  const keys = blocks.map((b) => `${b.layer}:${b.key}`);
  for (const k of ['M0:charter', 'M0:world', 'M0:style', 'M0:ch_0001', 'M0:pin-notes', 'M1:plan', 'M2:ch_0002', 'M2:pl_0001', 'M3:episodes', 'M3:threads', 'M4:recent', 'M5:task']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes('M2:ch_0003'), '나오지 않은 인물은 넣지 않는다');
  const hero = blocks.find((b) => b.key === 'ch_0001');
  assert.ok(hero.text.includes('부상=왼팔 골절 (2화)'), '주인공의 현재 상태');
  assert.ok(blocks.find((b) => b.key === 'style').text.includes('작가 샘플 1'));
  assert.equal(ledger.over, false);
});

test('기억 예산: 원문부터 줄이고, 카드는 요약으로, 고정 기억은 빼지 않는다', () => {
  const { blocks, ledger } = assembleMemory(sources(), { ep: 3, sceneId: 'sc_0002', beats: '도윤과 백 노인', budget: 1500 });
  const recent = blocks.find((b) => b.key === 'recent');
  assert.equal(recent.mode, 'trimmed');
  assert.ok(blocks.find((b) => b.key === 'charter'), '고정 기억 유지');
  assert.ok(blocks.find((b) => b.key === 'ch_0001'), '주인공 유지');
  assert.ok(blocks.find((b) => b.key === 'task'), '이번 작업 유지');
  assert.ok(ledger.notes.length >= 1);
});

async function writingWork() {
  const st = new Store(await tmp('wr'));
  await st.init();
  const bank = await wz.loadBank(fx('bank'));
  const w = (await st.createWork({ title: '균열', genres: ['hunter'], logline: 'E급 헌터' })).id;
  await wz.confirm(st, w, bank, { qid: 'hero.name_role', value: { name: '한도윤', aliases: ['도윤'] } });
  await wz.confirm(st, w, bank, { qid: 'support.name_role', value: { name: '백 노인' } });
  return { st, w, bank };
}

test('원고: 회차 생성, 장면 추가, 저장 rev 충돌, 마커 파싱', async () => {
  const { st, w } = await writingWork();
  const ep = await wr.createEpisode(st, w, { title: '석비' });
  assert.equal(ep.id, 'ep001');
  const sc = await wr.addScene(st, w, 'ep001', { goal: '석비 발견', beats: '도윤이 석비를 본다' });
  let e = await wr.readEpisode(st, w, 'ep001');
  assert.equal(e.scenes.at(-1).id, sc.id);
  assert.equal(e.scenes.at(-1).meta.goal, '석비 발견');
  const saved = await wr.saveEpisode(st, w, 'ep001', { scenes: [{ id: sc.id, text: '첫 문단.' }], rev: e.rev });
  await assert.rejects(wr.saveEpisode(st, w, 'ep001', { scenes: [{ id: sc.id, text: 'x' }], rev: e.rev }), (x) => x.status === 409);
  e = await wr.readEpisode(st, w, 'ep001');
  assert.equal(e.rev, saved.rev);
  assert.equal(e.scenes[0].text, '첫 문단.');
  assert.deepEqual(wr.parseEpisode('# 제목\n\n<!-- sc_0001 -->\n가\n\n나\n<!-- sc_0002 -->\n다\n').scenes, [{ id: 'sc_0001', text: '가\n\n나' }, { id: 'sc_0002', text: '다' }]);
});

test('초안 출력 해석: 본문과 기억 분리, 기억이 빠지면 경고, 잘못된 항목만 버림', () => {
  const ok = wr.parseDraftOutput('본문 첫 줄.\n\n둘째 문단.\n===기억===\n{"장면요약":"요약","등장":["한도윤"],"상태변화":[{"이름":"한도윤","항목":"부상","값":"골절"},{"이름":1}],"훅유형":"반전"}', 'draft');
  assert.equal(ok.value.prose, '본문 첫 줄.\n\n둘째 문단.');
  assert.equal(ok.value.memory.상태변화.length, 1);
  assert.equal(ok.value.memory.훅유형, '반전');
  const noMem = wr.parseDraftOutput('본문만 있다.', 'draft');
  assert.ok(noMem.value.memoryWarning);
  assert.equal(wr.parseDraftOutput('===기억===\n{}', 'draft').code, 'EMPTY_PROSE');
  const pol = wr.parseDraftOutput('{"작업":"다듬기","대안":[{"본문":"고친 글","바꾼점":"짧게"}]}', 'polish');
  assert.equal(pol.value.alternatives[0].text, '고친 글');
});

test('공동 집필: 초안 준비(기억 장부) → 받아들이기 → 요약·상태·떡밥·후보 갱신 → 쓴 뒤 대조', async () => {
  const { st, w } = await writingWork();
  await wr.createEpisode(st, w, { title: '1화' });
  const sc = await wr.addScene(st, w, 'ep001', { goal: '석비 발견', beats: '도윤이 석비 앞에 선다\n백 노인의 목소리가 들린다' });
  const prep = await wr.prepareDraft(st, w, {}, { ep: 'ep001', sceneId: sc.id, mode: 'draft' });
  assert.ok(prep.prompt.user.includes('⟦자료:기억:'));
  assert.ok(prep.prompt.user.includes('===기억==='));
  assert.ok(prep.ledger.blocks.some((b) => b.layer === 'M0'));
  const parsed = wr.parseDraftOutput(prep.prompt.mockText, 'draft');
  assert.equal(parsed.ok, true);
  const mem = { 장면요약: '도윤이 석비를 발견', 등장: ['한도윤', '백 노인', '검은 사제'], 상태변화: [{ 이름: '한도윤', 항목: '부상', 값: '손바닥 화상' }], 새설정후보: [{ 종류: '인물', 이름: '검은 사제', 설명: '석비 뒤의 그림자' }], 떡밥: { 심음: ['석비의 두 번째 글자'], 회수: [] }, 훅유형: '반전' };
  const r = await wr.acceptDraft(st, w, { ep: 'ep001', sceneId: sc.id, mode: 'draft', prose: '도윤은 석비 앞에 섰다.', memory: mem });
  assert.equal(r.updates.summary, true);
  assert.equal(r.updates.states, 1);
  assert.deepEqual(r.updates.threadsPlanted, ['석비의 두 번째 글자']);
  assert.deepEqual(r.updates.candidates, ['검은 사제']);
  assert.ok(r.warnings.some((x) => x.kind === 'unknown' && x.text.includes('검은 사제')));
  const src = await wr.loadMemorySources(st, w);
  assert.equal(src.summaries.scenes[sc.id].text, '도윤이 석비를 발견');
  assert.equal(src.stateLog[0].entity, 'ch_0001');
  const e = await wr.readEpisode(st, w, 'ep001');
  assert.equal(e.scenes.find((s) => s.id === sc.id).text, '도윤은 석비 앞에 섰다.');
  assert.deepEqual(e.scenes.find((s) => s.id === sc.id).meta.characters, ['ch_0001', 'ch_0002']);
  // 다음 장면은 앞 장면의 요약·상태·떡밥을 기억으로 받는다
  const sc2 = await wr.addScene(st, w, 'ep001', { beats: '도윤이 돌아간다' });
  const prep2 = await wr.prepareDraft(st, w, {}, { ep: 'ep001', sceneId: sc2.id, mode: 'draft' });
  assert.ok(prep2.prompt.user.includes('손바닥 화상'), '상태 변화가 다음 호출에 들어간다');
  assert.ok(prep2.prompt.user.includes('석비의 두 번째 글자'), '심은 떡밥이 다음 호출에 들어간다');
  assert.ok(prep2.prompt.user.includes('도윤은 석비 앞에 섰다'), '직전 원문이 들어간다');
});

test('다듬기: 선택 구간만 바꾼다, 잘못된 구간은 거절', async () => {
  const { st, w } = await writingWork();
  await wr.createEpisode(st, w, {});
  const sc = await wr.addScene(st, w, 'ep001', {});
  await wr.acceptDraft(st, w, { ep: 'ep001', sceneId: sc.id, mode: 'draft', prose: '가나다라마바사', memory: null });
  await wr.acceptDraft(st, w, { ep: 'ep001', sceneId: sc.id, mode: 'polish', prose: 'XY', selection: { start: 2, end: 4 }, memory: null });
  const e = await wr.readEpisode(st, w, 'ep001');
  assert.equal(e.scenes.find((s) => s.id === sc.id).text, '가나XY마바사');
  await assert.rejects(wr.acceptDraft(st, w, { ep: 'ep001', sceneId: sc.id, mode: 'polish', prose: 'Z', selection: { start: 5, end: 99 } }), (x) => x.code === 'BAD_SELECTION');
});

test('쓴 뒤 대조: 사망 인물 등장 경고(회상 장면은 제외)', () => {
  const src = sources();
  src.bible.character[1].status = { alive: false, death_ep: 2 };
  const w1 = wr.checkDraft(src, 3, '백 노인이 웃었다.', { 등장: ['백 노인'] });
  assert.ok(w1.some((x) => x.kind === 'dead'));
  assert.equal(wr.checkDraft(src, 3, '백 노인이 웃었다.', null, { flashback: true }).filter((x) => x.kind === 'dead').length, 0);
});

test('회차 요약: 받아들이면 기억에 저장, 요약에서 빠진 상태 변화를 알려 줌', async () => {
  const { st, w } = await writingWork();
  await wr.createEpisode(st, w, {});
  const sc = await wr.addScene(st, w, 'ep001', {});
  await wr.acceptDraft(st, w, { ep: 'ep001', sceneId: sc.id, mode: 'draft', prose: '본문', memory: { 장면요약: '요약', 상태변화: [{ 이름: '한도윤', 항목: '부상', 값: '골절' }] } });
  const prep = await wr.prepareEpisodeSummary(st, w, {}, { ep: 'ep001' });
  assert.equal(wr.parseEpisodeSummary(prep.prompt.mockText).ok, true);
  const r = await wr.acceptEpisodeSummary(st, w, { ep: 'ep001', text: '석비를 찾았다' });
  assert.deepEqual(r.missing, ['한도윤(부상: 골절)']);
  const src = await wr.loadMemorySources(st, w);
  assert.equal(src.summaries.episodes[1].text, '석비를 찾았다');
});

test('긴 연재: 아크 요약이 덮지 않는 오래된 회차는 빼지 않고 첫 문장으로 줄인다', () => {
  const src = sources();
  src.summaries.episodes = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, { text: `${i + 1}화의 첫 문장이다. 그리고 긴 뒷부분 ${'설명 '.repeat(200)}` }]));
  src.episodes = [{ no: 31, scenes: [{ id: 'sc_0009', text: '' }] }];
  const noArc = assembleMemory(src, { ep: 31, sceneId: 'sc_0009', budget: 8000 });
  const t1 = noArc.blocks.find((b) => b.key === 'episodes').text;
  assert.ok(t1.includes('1화: 1화의 첫 문장이다.'), '아크가 없으면 첫 문장은 남긴다');
  src.summaries.arcs = [{ from: 1, to: 20, title: '1부', text: '1부 아크 요약' }];
  const withArc = assembleMemory(src, { ep: 31, sceneId: 'sc_0009', budget: 8000 });
  const t2 = withArc.blocks.find((b) => b.key === 'episodes').text;
  assert.ok(!t2.includes('1화: 1화의'), '아크가 덮는 회차는 뺀다');
  assert.ok(t2.includes('21화: 21화의 첫 문장이다.'));
  assert.ok(withArc.blocks.find((b) => b.key === 'arcs').text.includes('1부 아크 요약'));
});

test('아크 요약: 10화가 쌓이면 후보, 저장 시 빠진 상태 변화 알림', async () => {
  const { st, w } = await writingWork();
  for (let n = 1; n <= 10; n++) {
    await wr.createEpisode(st, w, {});
    await wr.acceptEpisodeSummary(st, w, { ep: wr.epId(n), text: `${n}화 요약` });
  }
  const next = await wr.arcCandidates(st, w);
  assert.deepEqual(next, { from: 1, to: 10 });
  const prep = await wr.prepareArcSummary(st, w, next);
  const parsed = wr.parseArcSummary(prep.prompt.mockText);
  assert.equal(parsed.ok, true);
  await st.appendJsonl(st.wp(w, 'memory/state_log.jsonl'), { ep: 3, name: '한도윤', field: '부상', value: '골절' });
  const r = await wr.acceptArcSummary(st, w, { ...next, title: parsed.value.title, text: '석비를 찾았다' });
  assert.deepEqual(r.missing, ['한도윤(3화 부상)']);
  assert.equal(await wr.arcCandidates(st, w), null);
});
