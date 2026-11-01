// AI 응답 텍스트에서 JSON 객체 하나를 꺼낸다. 코드펜스와 앞뒤 설명을 견딘다.
export function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'EMPTY' };
  const tries = [];
  const t = text.trim();
  tries.push(t);
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1].trim());
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, value: v };
    } catch { /* 다음 후보로 */ }
  }
  return { ok: false, error: 'PARSE' };
}
