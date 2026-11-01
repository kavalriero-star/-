// 맥락 기억 장치. 기준: docs/CONCEPT_V3.md 4절.
// AI는 호출 사이에 아무것도 기억하지 않으므로, 앱이 기억을 층으로 조립해 매번 넣는다.
// 고정 기억(M0)과 이번 작업(M5)은 예산이 부족해도 빼지 않고, 원문(M4)부터 줄인다.
import { summarize, genreLabel } from './prompts.mjs';

const SYSTEM_KO = { magic: '마법', awakening: '각성', internal_energy: '내공', history_anchor: '시대 기준', status_ladder: '신분' };

export const LAYER_LABEL = {
  M0: '고정 기억', M1: '이야기 지도', M2: '관련 카드', M3: '연속성', M4: '원문', M5: '이번 작업',
};

const PARTICLES = ['은', '는', '이', '가', '을', '를', '의', '에', '에게', '에게서', '와', '과', '도', '만', '으로', '로', '께', '께서', '이다', '입니다', '이었다', '였다', '야', '아', '이여', '여', '한테', '랑', '이랑', '처럼', '보다', '까지', '부터', '조차', '마저', '뿐'];
const isHangul = (ch) => !!ch && ch >= '가' && ch <= '힣';

// ---------- 이름 연결 (DATA_MODEL.md 7절) ----------
export function nameDictionary(bible) {
  const dict = new Map();
  const add = (term, id) => {
    if (!term || [...term].length < 2) return;
    const prev = dict.get(term);
    if (prev && prev !== id) dict.set(term, null); // 서로 다른 카드가 같은 이름 → 모호함
    else dict.set(term, id);
  };
  for (const kind of ['character', 'faction', 'system', 'monster']) {
    for (const e of bible[kind] || []) {
      add(e.name, e.id);
      for (const a of e.aliases || []) add(a, e.id);
    }
  }
  for (const p of bible.world?.places || []) {
    add(p.name, p.id);
    for (const a of p.aliases || []) add(a, p.id);
  }
  return dict;
}

export function findNames(text, dict) {
  const found = new Map(); // id → 처음 나온 이름
  if (!text) return found;
  const terms = [...dict.keys()].sort((a, b) => b.length - a.length);
  const taken = new Array(text.length).fill(false);
  for (const term of terms) {
    const id = dict.get(term);
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i < 0) break;
      from = i + 1;
      const end = i + term.length;
      if (taken.slice(i, end).some(Boolean)) continue;
      const before = text[i - 1];
      // 앞이 한글이면 다른 낱말의 일부일 가능성이 크다("한도윤" 안의 "도윤"은 최장 일치로 이미 처리됨)
      if (isHangul(before)) continue;
      const rest = text.slice(end);
      const okAfter = !isHangul(rest[0]) || PARTICLES.some((p) => rest.startsWith(p) && !isHangul(rest[p.length]));
      if (!okAfter) continue;
      for (let k = i; k < end; k++) taken[k] = true;
      if (id && !found.has(id)) found.set(id, term);
    }
  }
  return found;
}

// ---------- 카드 → 읽기 좋은 글 ----------
const FIELD_KO = {
  name: '이름', aliases: '별칭', role: '역할', age: '나이', appearance_hook: '외형 특징', visual: '고정 외형', intro_scene: '첫 등장',
  desire: '욕망', want: '원하는 것', need: '필요한 것', lack: '결핍', false_belief: '잘못된 믿음', secrets: '비밀', text: '내용',
  known_by: '아는 사람', abilities: '능력', skills: '기술', cost: '대가', weaknesses: '약점', voice: '말투', style: '문체',
  tics: '말버릇', samples: '대사 예시', arc: '변화', start: '시작', turns: '전환점', end: '끝', ext: '추가', motive: '동기',
  justification: '스스로 옳다고 믿는 이유', mirror_trait: '주인공과 닮은 점', defeat_condition: '패배 조건', function: '기능',
  kind: '종류', source: '원천', limits: '한계', ladder: '등급', unit: '단위', arts: '무공', jianghu_rules: '강호 규칙',
  gate_rule: '게이트 규칙', awaken_rule: '각성 규칙', economy: '경제', status_ladder: '신분', office_ranks: '관직',
  real_figures: '실존 인물', fact_policy: '사실과 허구', divergence_point: '분기점', goal: '목표', resources: '자원',
  type: '관계', a_to_b: 'A→B', b_to_a: 'B→A', note: '메모', title: '제목', status: '상태', alive: '생존', death_ep: '사망 회차',
  premise: '전제', rules: '철칙', public_knowledge: '일반인이 아는 것', era: '시대', places: '장소', society: '사회',
  races: '종족', nations: '국가', reactions: '사회 반응', hard: '절대', rank: '단계', stats: '능력치', habitat: '서식지',
  threat: '위협 등급', traits: '특징',
};
const SKIP = new Set(['id', 'ai_filled', 'rev', 'schemaVersion', 'slot', 'genre', 'portrait', 'allies', 'enemies', 'affiliations', 'address', 'banned_words', 'changes', 'since', 'public']);

function val(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Array.isArray(v)) return v.map(val).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    if ('rank' in v && 'name' in v) return `${v.rank}.${v.name}`;
    if ('value' in v && Object.keys(v).length <= 2) return val(v.value);
    return Object.entries(v).filter(([k]) => !SKIP.has(k)).map(([k, x]) => { const s = val(x); return s ? `${FIELD_KO[k] || k}: ${s}` : ''; }).filter(Boolean).join(' / ');
  }
  if (typeof v === 'boolean') return v ? '예' : '아니오';
  return String(v);
}

export function cardText(kindLabel, e) {
  const lines = [`[${kindLabel}] ${e.name || e.title || e.id}${e.aliases?.length ? ` (별칭: ${e.aliases.join(', ')})` : ''}`];
  for (const [k, v] of Object.entries(e)) {
    if (SKIP.has(k) || k === 'name' || k === 'aliases' || k === 'title') continue;
    const s = val(v);
    if (s) lines.push(`- ${FIELD_KO[k] || k}: ${s}`);
  }
  return lines.join('\n');
}

// ---------- 시점별 상태 ----------
export function currentState(stateLog, entityId, ep) {
  const out = {};
  for (const s of stateLog) {
    if (s.entity !== entityId) continue;
    if (ep !== undefined && s.ep > ep) continue;
    out[s.field] = { value: s.value, ep: s.ep };
  }
  return out;
}

function stateText(state) {
  const parts = Object.entries(state).map(([f, s]) => `${f}=${s.value} (${s.ep}화)`);
  return parts.length ? `- 현재 상태: ${parts.join(', ')}` : '';
}

export function threadStatus(t, ep) {
  if (t.resolved_ep) return 'resolved';
  if (t.due_ep && t.due_ep - ep <= 2) return 'imminent';
  if (ep - (t.planted_ep || 0) > 10) return 'neglected';
  return 'active';
}

const KIND_LABEL = { character: '인물', faction: '세력', system: '체계', monster: '몬스터', place: '장소' };

// ---------- 조립 ----------
/**
 * @param {object} src  { bible, summaries, stateLog, plan, pins, episodes: [{no, scenes:[{id,text}]}] }
 * @param {object} opt  { ep, sceneId, beats, request, budget, extraText }
 */
export function assembleMemory(src, opt) {
  const { bible, summaries = {}, stateLog = [], plan = {}, pins = { cards: [], notes: [] } } = src;
  const ep = opt.ep ?? 1;
  const budget = opt.budget ?? 60000;
  const work = bible.work || {};
  const blocks = [];
  const push = (layer, key, label, text, extra = {}) => { if (text && text.trim()) blocks.push({ layer, key, label, text: text.trim(), mode: 'full', ...extra }); };

  // M0 고정
  const charter = [
    `제목: ${work.title || ''}`,
    `장르: ${(work.genres || []).map(genreLabel).join(' + ')}${work.tags?.length ? ` · 꼬리표: ${work.tags.join(', ')}` : ''}`,
    `한 줄 컨셉: ${work.logline || ''}`,
    work.usp ? `차별점: ${work.usp}` : '',
    work.tone?.length ? `톤: ${work.tone.join(', ')}` : '',
    work.mix_policy?.system_relation ? `혼합 정책: 체계 관계=${work.mix_policy.system_relation}, 고증=${work.mix_policy.accuracy_level}${work.mix_policy.ext?.rules?.length ? `, 규칙: ${work.mix_policy.ext.rules.join(' / ')}` : ''}` : '',
  ].filter(Boolean).join('\n');
  push('M0', 'charter', '작품 헌장', charter);
  const w = bible.world || {};
  push('M0', 'world', '세계', [
    w.premise ? `전제: ${w.premise}` : '',
    ...(w.rules || []).map((r) => `철칙${r.hard ? '(절대)' : ''}: ${r.text}`),
    w.era ? `시대: ${val(w.era)}` : '',
    w.public_knowledge ? `일반인이 아는 것: ${w.public_knowledge}` : '',
  ].filter(Boolean).join('\n'));
  for (const s of bible.system || []) push('M0', s.id, `체계 ${s.name || SYSTEM_KO[s.kind] || s.kind}`, cardText('체계', { ...s, kind: SYSTEM_KO[s.kind] || s.kind }));
  const style = work.style || {};
  push('M0', 'style', '문체 가이드', [
    style.pov ? `시점: ${{ first: '1인칭', third_limited: '3인칭 제한', omniscient: '전지' }[style.pov] || style.pov}` : '',
    ...(style.rules || []).map((r) => `규칙: ${r}`),
    ...(style.samples || []).map((s, i) => `작가 샘플 ${i + 1}:\n${s}`),
    style.notes ? `메모: ${style.notes}` : '',
  ].filter(Boolean).join('\n'));
  const hero = (bible.character || []).find((c) => c.slot === 'hero' || c.role === 'protagonist');
  if (hero) push('M0', hero.id, `주인공 ${hero.name}`, `${cardText('주인공', hero)}\n${stateText(currentState(stateLog, hero.id, ep))}`);
  const all = [...(bible.character || []).map((e) => ['character', e]), ...(bible.faction || []).map((e) => ['faction', e]), ...(bible.monster || []).map((e) => ['monster', e])];
  for (const id of pins.cards || []) {
    const hit = all.find(([, e]) => e.id === id);
    if (hit && hit[1].id !== hero?.id) push('M0', id, `고정 카드 ${hit[1].name}`, `${cardText(KIND_LABEL[hit[0]], hit[1])}\n${stateText(currentState(stateLog, id, ep))}`, { pinned: true });
  }
  if (pins.notes?.length) push('M0', 'pin-notes', '작가가 고정한 기억', pins.notes.map((n) => `- ${n}`).join('\n'), { pinned: true });

  // M1 이야기 지도
  const arcs = (summaries.arcs || []).map((a) => `${a.from}~${a.to}화: ${a.text}`);
  const planText = [
    ...(plan.arcs || []).map((a) => `아크 "${a.title}" (${a.from ?? '?'}~${a.to ?? '?'}화): ${a.goal || ''}`),
    ...((plan.episodes || []).filter((x) => x.no >= ep - 1 && x.no <= ep + 2).map((x) => `${x.no}화 계획: ${x.goal || ''}${x.beats?.length ? ` — ${x.beats.join(' / ')}` : ''}`)),
  ];
  push('M1', 'plan', '줄거리 계획', planText.join('\n'));
  push('M1', 'arcs', '아크 요약', arcs.join('\n'));

  // M2 관련 카드: 비트·요청·최근 원문에 나온 이름
  const recentText = (src.episodes || []).filter((e) => e.no >= ep - 1 && e.no <= ep).flatMap((e) => e.scenes.map((s) => s.text)).join('\n').slice(-4000);
  const dict = nameDictionary({ ...bible, monster: bible.monster || [] });
  const hits = findNames(`${opt.beats || ''}\n${opt.request || ''}\n${opt.extraText || ''}\n${recentText}`, dict);
  const shown = new Set(blocks.map((b) => b.key));
  for (const [id] of hits) {
    if (shown.has(id)) continue;
    const hit = all.find(([, e]) => e.id === id);
    if (hit) {
      const [kind, e] = hit;
      push('M2', id, `${KIND_LABEL[kind]} ${e.name}`, `${cardText(KIND_LABEL[kind], e)}\n${stateText(currentState(stateLog, id, ep))}`, { short: `${KIND_LABEL[kind]} ${e.name}: ${summarize(e, 140)}` });
      continue;
    }
    const place = (bible.world?.places || []).find((p) => p.id === id);
    if (place) push('M2', id, `장소 ${place.name}`, cardText('장소', place), { short: `장소 ${place.name}: ${place.note || ''}` });
  }

  // M3 연속성
  const epSum = Object.entries(summaries.episodes || {}).map(([no, s]) => [Number(no), s]).filter(([no]) => no < ep).sort((a, b) => a[0] - b[0]);
  push('M3', 'episodes', '지난 회차 요약', epSum.map(([no, s]) => `${no}화: ${typeof s === 'string' ? s : s.text}`).join('\n'), { items: epSum.length });
  const sceneSum = Object.entries(summaries.scenes || {}).filter(([, s]) => (s.ep ?? 0) === ep).map(([, s]) => `- ${s.text}`);
  push('M3', 'scenes', '이번 회차 장면 요약', sceneSum.join('\n'));
  const open = (bible.thread || []).filter((t) => !t.resolved_ep).map((t) => `- ${t.title} (${t.planted_ep}화에 심음, 상태: ${{ active: '활성', imminent: '임박', neglected: '방치' }[threadStatus(t, ep)]})`);
  push('M3', 'threads', '미회수 떡밥(전부)', open.join('\n'));
  const events = (bible.event || []).slice(-5).map((e) => `- ${e.title}${e.note ? `: ${e.note}` : ''}`);
  push('M3', 'events', '최근 사건', events.join('\n'));

  // M4 원문: 현재 장면 앞까지(이번 회차) + 직전 회차
  const prevTexts = [];
  for (const e of (src.episodes || []).filter((x) => x.no === ep - 1 || x.no === ep).sort((a, b) => a.no - b.no)) {
    for (const s of e.scenes) {
      if (e.no === ep && s.id === opt.sceneId) break;
      if (s.text?.trim()) prevTexts.push({ ep: e.no, id: s.id, text: s.text.trim() });
    }
  }
  push('M4', 'recent', '직전 원문', prevTexts.map((t) => `(${t.ep}화 ${t.id})\n${t.text}`).join('\n\n'), { pieces: prevTexts.length });

  // M5 이번 작업
  push('M5', 'task', '이번 작업', [opt.beats ? `장면 비트:\n${opt.beats}` : '', opt.request ? `작가 요청: ${opt.request}` : ''].filter(Boolean).join('\n'));

  // 예산 맞추기: M4 → M3 회차 요약 → M2 카드 순으로 줄인다. M0·M5는 빼지 않는다.
  const total = () => blocks.reduce((n, b) => n + b.text.length, 0);
  const notes = [];
  const recent = blocks.find((b) => b.key === 'recent');
  if (total() > budget && recent) {
    const keep = Math.max(1500, recent.text.length - (total() - budget));
    if (keep < recent.text.length) {
      recent.text = `…(앞부분 줄임)\n${recent.text.slice(-keep)}`;
      recent.mode = 'trimmed';
      notes.push(`직전 원문을 끝부분 ${keep.toLocaleString()}자로 줄임`);
    }
  }
  const eps = blocks.find((b) => b.key === 'episodes');
  if (total() > budget && eps && epSum.length > 5) {
    eps.text = `${epSum.length - 5}개 회차는 아크 요약으로 대신함\n${epSum.slice(-5).map(([no, s]) => `${no}화: ${typeof s === 'string' ? s : s.text}`).join('\n')}`;
    eps.mode = 'folded';
    notes.push('오래된 회차 요약을 접음');
  }
  for (const b of blocks.filter((x) => x.layer === 'M2')) {
    if (total() <= budget) break;
    b.text = b.short || b.text.split('\n')[0];
    b.mode = 'summary';
    notes.push(`${b.label} 카드를 요약으로 줄임`);
  }
  const over = total() > budget;
  if (over) notes.push('고정 기억만으로 예산을 넘었어요. 예산을 늘리거나 고정 카드를 줄여 주세요');

  const ledger = {
    budget,
    total: total(),
    over,
    notes,
    blocks: blocks.map(({ layer, key, label, mode, text, pinned }) => ({ layer, layerLabel: LAYER_LABEL[layer], key, label, mode, pinned: !!pinned, chars: text.length })),
  };
  return { blocks, ledger };
}

export function memoryText(blocks) {
  const order = ['M0', 'M1', 'M2', 'M3', 'M4'];
  return order.map((L) => {
    const bs = blocks.filter((b) => b.layer === L);
    if (!bs.length) return '';
    return `## ${LAYER_LABEL[L]}\n${bs.map((b) => `### ${b.label}\n${b.text}`).join('\n\n')}`;
  }).filter(Boolean).join('\n\n');
}
