// 어댑터 공통: 임시 작업 폴더, 오류 분류
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function tempDir(tag) {
  return fs.mkdtemp(path.join(os.tmpdir(), `runebook-${tag}-`));
}

export async function rmDir(dir) {
  if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

export function fail(code, message, extra = {}) {
  return { ok: false, error: { code, message, ...extra } };
}

const LIMIT_RE = /(usage|rate)[ _-]?limit|limit (reached|exceeded)|too many requests|quota|한도|429/i;
const AUTH_RE = /not logged in|log ?in|login|unauthori[sz]ed|authenticat|401|oauth|credential|token (expired|invalid)/i;

// 실행 결과와 출력 문구로 오류 종류를 정한다. 문구는 실측 전까지 넓게 잡는다(설계서 8.10-4).
export function classify({ run, message = '', limit = null, label }) {
  if (run.spawnError === 'ENOENT') return fail('NOT_INSTALLED', `${label}가 이 PC에 설치되어 있지 않아요`);
  if (run.spawnError) return fail('CRASH', `${label}를 실행하지 못했어요 (${run.spawnError})`);
  if (run.timedOut) {
    const what = { first: '첫 응답', idle: '응답 중간', total: '전체' }[run.timedOut];
    return fail('TIMEOUT', `${label} ${what} 시간이 초과됐어요`, { timedOut: run.timedOut });
  }
  const text = `${message}\n${run.stderrTail || ''}`;
  if ((limit && limit.status === 'rejected') || LIMIT_RE.test(text)) {
    return fail('LIMIT', `${label} 사용 한도에 도달했어요`, { resetsAt: limit?.resetsAt ?? null });
  }
  if (AUTH_RE.test(text)) return fail('NOT_LOGGED_IN', `${label} 로그인이 필요해요`);
  return fail('CRASH', `${label}가 비정상 종료했어요 (종료 코드 ${run.code ?? '없음'})`);
}
