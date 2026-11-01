// 도우미 API 호출. 토큰은 주소의 #t= 로 한 번 받아 sessionStorage에 둔다(서버로 보내지 않는 해시).
const KEY = 'runebook-token';
let token = null;

export function initToken() {
  const m = location.hash.match(/(?:^#|&)t=([0-9a-f]{64})/);
  if (m) {
    token = m[1];
    try { sessionStorage.setItem(KEY, token); } catch { /* 저장 못 해도 이번 창에서는 동작 */ }
    history.replaceState(null, '', `${location.pathname}#/`);
  } else {
    try { token = sessionStorage.getItem(KEY); } catch { token = null; }
  }
  return token;
}

export class ApiError extends Error {
  constructor(status, err = {}) {
    super(err.message || `요청이 실패했어요 (${status})`);
    this.status = status;
    this.code = err.code;
    this.details = err.details;
  }
}

export async function api(method, path, body) {
  let r;
  try {
    r = await fetch(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { code: 'OFFLINE', message: '도우미에 연결할 수 없어요. 도우미 창이 켜져 있는지 확인해 주세요' });
  }
  const ct = r.headers.get('content-type') || '';
  if (!r.ok) {
    let e = {};
    if (ct.includes('json')) e = (await r.json()).error || {};
    throw new ApiError(r.status, e);
  }
  return ct.includes('json') ? r.json() : r.blob();
}

// 작업이 끝날 때까지 기다린다. onProgress(job)로 경과를 알린다.
export async function waitJob(id, onProgress) {
  for (;;) {
    const j = await api('GET', `/ai/jobs/${id}`);
    onProgress?.(j);
    if (j.state === 'done') return j;
    if (j.state === 'error') throw new ApiError(500, j.error || {});
    if (j.state === 'cancelled') throw new ApiError(499, { code: 'ABORT', message: '취소했어요' });
    await new Promise((r) => setTimeout(r, 600));
  }
}

const blobs = new Map();
export async function imageUrl(w, id) {
  const k = `${w}/${id}`;
  if (!blobs.has(k)) blobs.set(k, URL.createObjectURL(await api('GET', `/works/${w}/images/${id}/file`)));
  return blobs.get(k);
}
