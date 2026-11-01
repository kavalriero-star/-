// JSON Schema 부분집합 검사기. 브라우저와 Node가 같은 파일을 쓴다.
// 지원 키워드: type(문자열 또는 배열), properties, required, additionalProperties(false), items,
// enum, maxLength, minLength(코드 포인트 기준), minItems, maxItems, minimum, maximum.

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number' && Number.isInteger(v)) return 'integer';
  return typeof v;
}

function typeMatches(want, v) {
  const t = typeOf(v);
  return want === t || (want === 'number' && t === 'integer');
}

function check(s, v, p, errs) {
  if (!s || typeof s !== 'object') return;
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((t) => typeMatches(t, v))) {
      errs.push(`${p}: ${types.join('|')} 이어야 하는데 ${typeOf(v)}`);
      return;
    }
  }
  if (s.enum && !s.enum.some((e) => e === v)) errs.push(`${p}: 허용값(${s.enum.join(', ')}) 밖의 값`);
  if (typeof v === 'string') {
    const len = [...v].length;
    if (s.maxLength !== undefined && len > s.maxLength) errs.push(`${p}: ${s.maxLength}자 초과(${len}자)`);
    if (s.minLength !== undefined && len < s.minLength) errs.push(`${p}: ${s.minLength}자 미만`);
  }
  if (typeof v === 'number') {
    if (s.minimum !== undefined && v < s.minimum) errs.push(`${p}: ${s.minimum} 미만`);
    if (s.maximum !== undefined && v > s.maximum) errs.push(`${p}: ${s.maximum} 초과`);
  }
  if (Array.isArray(v)) {
    if (s.minItems !== undefined && v.length < s.minItems) errs.push(`${p}: 항목 ${s.minItems}개 미만`);
    if (s.maxItems !== undefined && v.length > s.maxItems) errs.push(`${p}: 항목 ${s.maxItems}개 초과`);
    if (s.items) v.forEach((item, i) => check(s.items, item, `${p}[${i}]`, errs));
  }
  if (typeOf(v) === 'object') {
    for (const k of s.required || []) if (!(k in v)) errs.push(`${p}.${k}: 필수 항목 없음`);
    const props = s.properties || {};
    for (const [k, val] of Object.entries(v)) {
      if (props[k]) check(props[k], val, `${p}.${k}`, errs);
      else if (s.additionalProperties === false) errs.push(`${p}.${k}: 정의되지 않은 항목`);
    }
  }
}

export function validate(schema, value, path = '$') {
  const errs = [];
  check(schema, value, path, errs);
  return errs;
}

export function isValid(schema, value) {
  return validate(schema, value).length === 0;
}
