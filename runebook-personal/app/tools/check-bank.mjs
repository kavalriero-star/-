#!/usr/bin/env node
// 위저드 문항 은행 검사: node tools/check-bank.mjs [폴더]
// 서버가 읽는 형식, 저장 위치 허용 목록, 예시가 값 스키마를 통과하는지, 필수 문항 7개를 확인한다.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBank } from '../lib/wizard.mjs';
import { validate } from '../lib/validate.mjs';

const dir = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'questions');
const REQUIRED = ['work.genres', 'work.logline', 'world.premise', 'world.rules', 'hero.name_role', 'hero.desire', 'hero.lack'];
// entity → { slots, paths: { path: [허용 키] } }
const ALLOW = {
  work: { slots: [null], paths: { '': ['genres', 'genre_weights', 'tone', 'logline', 'usp', 'target'], style: ['pov'], mix_policy: ['system_relation', 'accuracy_level', 'vocab_zones'], 'mix_policy.ext': ['rules'] } },
  world: { slots: [null], paths: { '': ['premise', 'rules', 'public_knowledge', 'era', 'places'], society: ['races', 'nations', 'reactions'] } },
  system: { slots: ['fantasy', 'hunter', 'wuxia', 'history'], paths: { '': ['name', 'aliases', 'source', 'cost', 'limits', 'ladder', 'gate_rule', 'awaken_rule', 'economy', 'unit', 'arts', 'jianghu_rules', 'status_ladder', 'office_ranks', 'real_figures', 'fact_policy', 'divergence_point'] } },
  faction: { slots: ['ruling', 'ally', 'enemy'], paths: { '': ['name', 'aliases', 'goal', 'resources'] } },
  character: { slots: ['hero', 'support', 'antagonist'], paths: { '': ['name', 'aliases', 'age', 'appearance_hook', 'intro_scene', 'desire', 'lack', 'false_belief', 'abilities', 'weaknesses', 'voice', 'secrets', 'arc'], ext: ['function', 'motive', 'justification', 'mirror_trait', 'defeat_condition', 'cheat'] } },
  relation: { slots: ['hero_support', 'hero_antagonist'], paths: { '': ['type', 'a_to_b', 'b_to_a', 'note'] } },
  event: { slots: ['first'], paths: { '': ['title', 'note'] } },
  scene: { slots: ['first'], paths: { '': ['goal', 'conflict', 'hook'] } },
};
const KIND = { fantasy: 'magic', hunter: 'awakening', wuxia: 'internal_energy', history: 'history_anchor' };

const bank = await loadBank(dir);
const problems = [...bank.problems];
const strNoMax = (s, p) => {
  if (!s || typeof s !== 'object') return;
  const t = Array.isArray(s.type) ? s.type : [s.type];
  if (t.includes('string') && !s.enum && s.maxLength === undefined) problems.push(`${p}: 문자열에 maxLength 없음`);
  for (const [k, v] of Object.entries(s.properties || {})) strNoMax(v, `${p}.${k}`);
  if (s.items) strNoMax(s.items, `${p}[]`);
};
for (const q of bank.questions) {
  const id = `${q._file}:${q.qid}`;
  for (const k of ['qid', 'step', 'order', 'label', 'question', 'genres', 'required', 'input', 'target', 'depends', 'value_schema', 'hint', 'examples']) if (!(k in q)) problems.push(`${id}: ${k} 없음`);
  if (!/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/.test(q.qid)) problems.push(`${id}: qid 형식`);
  if ([...String(q.label)].length > 12) problems.push(`${id}: label 12자 초과`);
  if ([...String(q.question)].length > 60) problems.push(`${id}: question 60자 초과`);
  const t = q.target || {};
  const a = ALLOW[t.entity];
  if (!a) { problems.push(`${id}: 허용되지 않은 entity ${t.entity}`); continue; }
  if (!a.slots.includes(t.slot ?? null)) problems.push(`${id}: 허용되지 않은 slot ${t.slot}`);
  if (!(t.path in a.paths)) problems.push(`${id}: 허용되지 않은 path "${t.path}"`);
  if (!['set', 'append'].includes(t.merge)) problems.push(`${id}: merge는 set/append`);
  if (t.entity === 'system' && t.kind !== KIND[t.slot]) problems.push(`${id}: system kind는 ${KIND[t.slot]}`);
  const vs = q.value_schema || {};
  if (vs.type !== 'object' || vs.additionalProperties !== false) problems.push(`${id}: value_schema 최상위는 additionalProperties:false 객체`);
  for (const k of Object.keys(vs.properties || {})) if (!(a.paths[t.path] || []).includes(k)) problems.push(`${id}: 허용되지 않은 키 ${t.path ? `${t.path}.` : ''}${k}`);
  strNoMax(vs, `${id}.value_schema`);
  if (!Array.isArray(q.examples) || q.examples.length !== 3) problems.push(`${id}: examples는 정확히 3개`);
  (q.examples || []).forEach((e, i) => {
    if (!e.title || [...e.title].length > 20) problems.push(`${id}: 예시${i + 1} title 없음 또는 20자 초과`);
    if (typeof e.desc !== 'string' || [...e.desc].length > 80) problems.push(`${id}: 예시${i + 1} desc 80자 초과`);
    for (const err of validate(vs, e.value)) problems.push(`${id}: 예시${i + 1} ${err}`);
  });
}
const req = bank.questions.filter((q) => q.required).map((q) => q.qid).sort();
if (JSON.stringify(req) !== JSON.stringify([...REQUIRED].sort())) problems.push(`required 문항이 정확히 7개가 아님: ${req.join(', ')}`);
const byFile = {};
for (const q of bank.questions) byFile[q._file] = (byFile[q._file] || 0) + 1;
console.log(`문항 ${bank.questions.length}개 ${JSON.stringify(byFile)}`);
if (problems.length) { console.log(`문제 ${problems.length}건\n${problems.slice(0, 80).join('\n')}`); process.exit(1); }
console.log('통과');
