// 문항 은행의 value_schema로 입력 양식을 만든다. 객체 배열은 "한 줄에 하나, 칸은 | 로 구분"으로 받는다.
import { validate } from '/lib/validate.mjs';

export const KO = {
  name: '이름', aliases: '별칭', age: '나이', value: '값', appearance_hook: '외형 특징', intro_scene: '첫 장면', desire: '욕망', want: '원하는 것',
  need: '필요한 것', lack: '결핍', false_belief: '잘못된 믿음', secrets: '비밀', text: '내용', known_by: '아는 사람', abilities: '능력', skills: '기술',
  cost: '대가', weaknesses: '약점', voice: '말투', style: '문체', tics: '말버릇', samples: '대사 예시', arc: '변화', start: '시작', turns: '전환점',
  ep: '회차', end: '끝', motive: '동기', justification: '스스로 옳다고 믿는 이유', mirror_trait: '주인공과 닮은 점', defeat_condition: '패배 조건',
  function: '역할 기능', source: '원천', limits: '한계', ladder: '등급', rank: '단계', unit: '단위', years: '년', arts: '무공', jianghu_rules: '강호 규칙',
  gate_rule: '게이트 규칙', awaken_rule: '각성 규칙', economy: '경제', loot_unit: '전리품 단위', price_by_rank: '등급별 시세', status_ladder: '신분',
  office_ranks: '관직', real_figures: '실존 인물', born: '출생', died: '사망', involvement: '개입 수준', fact_policy: '사실과 허구', divergence_point: '분기점',
  goal: '목표', resources: '자원', type: '관계', a_to_b: '주인공→상대', b_to_a: '상대→주인공', note: '메모', title: '제목', premise: '전제', rules: '규칙',
  hard: '절대 규칙', public_knowledge: '일반인이 아는 것', era: '시대', kind: '종류', year: '연도', calendar: '역법', label: '이름표', places: '장소',
  races: '종족', trait: '특징', nations: '국가', polity: '정체', reactions: '사회 반응', genres: '장르', genre_weights: '비중', tone: '톤', logline: '한 줄 컨셉',
  usp: '차별점', target: '연재 목표', eps: '회차 수', chars_per_ep: '회당 글자 수', pov: '시점', system_relation: '체계 관계', accuracy_level: '고증 수준',
  vocab_zones: '어휘 구역', id: 'id', conflict: '갈등', hook: '훅', cheat: '치트',
};
const ENUM_KO = {
  first: '1인칭', third_limited: '3인칭 제한', omniscient: '전지', replace: '대체', layer: '겹침', parallel: '병존', translate: '대응표(번역)',
  strict: '엄격', loose: '느슨', alt_history: '대체역사', off: '끔', modern: '현대', historical: '역사', fantasy: '판타지',
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lab = (k) => KO[k] || k;
const typeOf = (s) => (Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type);

function flatProps(itemSchema) {
  return Object.entries(itemSchema.properties || {}).filter(([, s]) => ['string', 'integer', 'number', 'boolean'].includes(typeOf(s)) || (typeOf(s) === 'array' && typeOf(s.items || {}) === 'string'));
}

function lineOf(item, props) {
  return props.map(([k, s]) => {
    const v = item?.[k];
    if (typeOf(s) === 'boolean') return v ? '예' : '아니오';
    if (Array.isArray(v)) return v.join(', ');
    return v ?? '';
  }).join(' | ');
}

function field(key, s, v, p) {
  const t = typeOf(s);
  const id = `f-${p.replace(/[^\w-]/g, '_')}`;
  const req = s._required ? ' <span class="hint">(필수)</span>' : '';
  const max = s.maxLength ? ` <span class="hint">${s.maxLength}자 이내</span>` : '';
  if (s.enum) {
    return `<div><label for="${id}">${esc(lab(key))}${req}</label><select id="${id}" data-path="${esc(p)}" data-t="enum">${s._required ? '' : '<option value="">(선택 안 함)</option>'}${s.enum.map((e) => `<option value="${esc(e)}" ${v === e ? 'selected' : ''}>${esc(ENUM_KO[e] || e)}</option>`).join('')}</select></div>`;
  }
  if (t === 'string') {
    const long = (s.maxLength || 200) > 40;
    return `<div><label for="${id}">${esc(lab(key))}${req}${max}</label>${long ? `<textarea id="${id}" rows="${(s.maxLength || 200) > 150 ? 3 : 2}" data-path="${esc(p)}" data-t="string">${esc(v ?? '')}</textarea>` : `<input type="text" id="${id}" data-path="${esc(p)}" data-t="string" value="${esc(v ?? '')}">`}</div>`;
  }
  if (t === 'integer' || t === 'number') return `<div><label for="${id}">${esc(lab(key))}${req}</label><input type="number" id="${id}" data-path="${esc(p)}" data-t="${t}" value="${v ?? ''}"></div>`;
  if (t === 'boolean') return `<div><label><input type="checkbox" data-path="${esc(p)}" data-t="boolean" ${v ? 'checked' : ''}> ${esc(lab(key))}</label></div>`;
  if (t === 'array') {
    const it = s.items || {};
    if (typeOf(it) === 'object') {
      const props = flatProps(it);
      const lines = (Array.isArray(v) ? v : []).map((x) => lineOf(x, props)).join('\n');
      return `<div><label for="${id}">${esc(lab(key))}${req} <span class="hint">한 줄에 하나 · 칸 순서: ${esc(props.map(([k]) => lab(k)).join(' | '))}</span></label><textarea id="${id}" rows="3" data-path="${esc(p)}" data-t="objlines">${esc(lines)}</textarea></div>`;
    }
    return `<div><label for="${id}">${esc(lab(key))}${req} <span class="hint">한 줄에 하나</span></label><textarea id="${id}" rows="3" data-path="${esc(p)}" data-t="lines">${esc((Array.isArray(v) ? v : []).join('\n'))}</textarea></div>`;
  }
  if (t === 'object') {
    const reqs = new Set(s.required || []);
    return `<fieldset><legend>${esc(lab(key))}</legend>${Object.entries(s.properties || {}).map(([k, ss]) => field(k, { ...ss, _required: reqs.has(k) }, v?.[k], `${p}.${k}`)).join('')}</fieldset>`;
  }
  return '';
}

export function renderForm(schema, value = {}) {
  const reqs = new Set(schema.required || []);
  return `<div class="formgrid">${Object.entries(schema.properties || {}).map(([k, s]) => field(k, { ...s, _required: reqs.has(k) }, value?.[k], k)).join('')}</div>`;
}

function schemaAt(schema, path) {
  let s = schema;
  for (const k of path.split('.')) s = s?.properties?.[k];
  return s;
}

export function readForm(root, schema) {
  const out = {};
  for (const el of root.querySelectorAll('[data-path]')) {
    const p = el.dataset.path;
    const s = schemaAt(schema, p) || {};
    let v;
    const raw = el.type === 'checkbox' ? el.checked : el.value;
    switch (el.dataset.t) {
      case 'string': v = String(raw).trim(); if (!v) v = undefined; break;
      case 'enum': v = raw || undefined; break;
      case 'integer': v = raw === '' ? undefined : Math.round(Number(raw)); break;
      case 'number': v = raw === '' ? undefined : Number(raw); break;
      case 'boolean': v = !!raw; break;
      case 'lines': v = String(raw).split('\n').map((x) => x.trim()).filter(Boolean); break;
      case 'objlines': {
        const props = flatProps(s.items || {});
        v = String(raw).split('\n').map((x) => x.trim()).filter(Boolean).map((line) => {
          const cells = line.split('|').map((c) => c.trim());
          const o = {};
          props.forEach(([k, ps], i) => {
            const c = cells[i];
            if (c === undefined || c === '') return;
            const tt = typeOf(ps);
            if (tt === 'boolean') o[k] = /^(예|네|y|yes|true|1|o)$/i.test(c);
            else if (tt === 'integer') o[k] = Math.round(Number(c));
            else if (tt === 'number') o[k] = Number(c);
            else if (tt === 'array') o[k] = c.split(',').map((x) => x.trim()).filter(Boolean);
            else o[k] = c;
          });
          return o;
        });
        break;
      }
      default: v = raw;
    }
    if (v === undefined) continue;
    const keys = p.split('.');
    let cur = out;
    keys.slice(0, -1).forEach((k) => { cur[k] = cur[k] || {}; cur = cur[k]; });
    cur[keys.at(-1)] = v;
  }
  return out;
}

export function checkValue(schema, value) {
  return validate(schema, value);
}
