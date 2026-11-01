// 공식 CLI를 한 번 실행하는 실행기. 설계서 8.5절의 안전장치를 구현한다.
// - argv는 호출자가 정한 상수만, 사용자 텍스트는 전부 stdin
// - shell 없이 실행, 환경변수는 허용 목록만 전달하고 API 키 계열은 제거
// - 첫 바이트·무출력·전체 타임아웃, 초과 시 프로세스 트리 종료
// - stdout은 UTF-8로 직접 디코딩하고 줄 단위로 넘긴다. stderr는 끝부분 64KB만 메모리에 둔다(저장하지 않음)
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

const ALLOW = [
  'PATH', 'Path', 'PATHEXT', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
  'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR', 'USER', 'LOGNAME', 'SHELL',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_HOME',
];
const DENY = [/^ANTHROPIC_API_KEY$/, /^ANTHROPIC_AUTH_TOKEN$/, /^ANTHROPIC_PROFILE$/, /^ANTHROPIC_FEDERATION_/,
  /^OPENAI_API_KEY$/, /^CODEX_API_KEY$/, /^CODEX_ACCESS_TOKEN$/, /^CLAUDE_CODE_USE_/];

export function cleanEnv(base = process.env, extra = {}) {
  const env = {};
  for (const k of ALLOW) if (base[k] !== undefined) env[k] = base[k];
  for (const [k, v] of Object.entries(extra)) env[k] = v;
  for (const k of Object.keys(env)) if (DENY.some((re) => re.test(k))) delete env[k];
  return env;
}

const active = new Set();

export function killTree(child) {
  if (!child || child.exitCode !== null || child.killed && child.signalCode) return;
  const pid = child.pid;
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { windowsHide: true, stdio: 'ignore' });
    } else {
      try { process.kill(-pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
      setTimeout(() => {
        try { process.kill(-pid, 'SIGKILL'); } catch { /* 이미 종료 */ }
      }, 2000).unref();
    }
  } catch { /* 이미 종료 */ }
}

process.once('exit', () => {
  for (const c of active) killTree(c);
});

/**
 * @returns {Promise<{code:number|null, signal:string|null, timedOut:null|'first'|'idle'|'total',
 *   aborted:boolean, spawnError:null|string, stderrTail:string, sawOutput:boolean}>}
 */
export function runCli({ cmd, args = [], input = '', cwd, env, timeouts = {}, onLine, signal }) {
  const t = { first: 60000, idle: 90000, total: 300000, ...timeouts };
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd, env, shell: false, windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      resolve({ code: null, signal: null, timedOut: null, aborted: false, spawnError: e.code || String(e), stderrTail: '', sawOutput: false });
      return;
    }
    active.add(child);
    const dec = new StringDecoder('utf8');
    let buf = '';
    let stderrTail = '';
    let sawOutput = false;
    let timedOut = null;
    let aborted = false;
    let spawnError = null;
    let done = false;
    const timers = {};
    const stop = (why) => {
      if (done) return;
      if (why === 'abort') aborted = true; else timedOut = why;
      killTree(child);
    };
    const arm = (name, ms) => {
      clearTimeout(timers[name]);
      timers[name] = setTimeout(() => stop(name), ms);
    };
    arm('first', t.first);
    arm('total', t.total);
    const emit = (line) => {
      if (onLine && line.length) {
        try { onLine(line.replace(/\r$/, '')); } catch { /* 파서 오류는 호출자가 결과로 판단 */ }
      }
    };
    child.stdout.on('data', (chunk) => {
      if (!sawOutput) {
        sawOutput = true;
        clearTimeout(timers.first);
      }
      arm('idle', t.idle);
      buf += dec.write(chunk);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        emit(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-65536);
    });
    child.on('error', (e) => {
      spawnError = e.code || String(e);
    });
    const onAbort = () => stop('abort');
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    child.on('close', (code, sig) => {
      done = true;
      active.delete(child);
      for (const k of Object.keys(timers)) clearTimeout(timers[k]);
      if (signal) signal.removeEventListener('abort', onAbort);
      buf += dec.end();
      if (buf.length) emit(buf);
      resolve({ code, signal: sig, timedOut, aborted, spawnError, stderrTail, sawOutput });
    });
    child.stdin.on('error', () => { /* 자식이 먼저 끝나면 EPIPE가 난다 */ });
    child.stdin.end(input, 'utf8');
  });
}
