// OpenAI Codex CLI(`codex exec`) 어댑터. 설계서 8.4절. 실제 실행 검증 전이라 이벤트 이름을 넓게 받는다.
import { runCli, cleanEnv } from '../runner.mjs';
import { tempDir, rmDir, fail, classify } from './common.mjs';

export function codexArgs({ cwd, model }) {
  return ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '-s', 'read-only', '-C', cwd, '--color', 'never',
    ...(model ? ['-m', model] : []), '-'];
}

function itemText(item) {
  if (!item) return null;
  const t = item.type || item.item_type || item.details?.type;
  if (t !== 'agent_message' && t !== 'assistant_message') return null;
  return item.text ?? item.details?.text ?? null;
}

export function createCodexAdapter({ bin = 'codex', timeouts, env = process.env } = {}) {
  const label = 'ChatGPT(Codex)';
  return {
    id: 'codex',
    label,
    async status() {
      const warnings = [];
      if (env.CODEX_API_KEY || env.OPENAI_API_KEY) warnings.push('환경변수에 OpenAI API 키가 있어요. 도우미는 넘기지 않지만, 다른 곳에서 codex를 쓰면 API 요금이 나갈 수 있어요.');
      const lines = [];
      const v = await runCli({ cmd: bin, args: ['--version'], env: cleanEnv(env), timeouts: { first: 15000, total: 20000 }, onLine: (l) => lines.push(l) });
      if (v.spawnError === 'ENOENT') return { installed: false, loggedIn: false, warnings };
      const a = await runCli({ cmd: bin, args: ['login', 'status'], env: cleanEnv(env), timeouts: { first: 15000, total: 20000 } });
      const said = a.stderrTail || '';
      let authMethod = null;
      if (/chatgpt/i.test(said)) authMethod = 'chatgpt';
      else if (/api key/i.test(said)) {
        authMethod = 'api_key';
        warnings.push('Codex가 API 키로 로그인되어 있어요. 구독이 아니라 API 요금이 나가요.');
      }
      return { installed: true, version: lines.join(' ').trim() || null, loggedIn: a.code === 0, authMethod, warnings };
    },
    async complete(prompt, opts = {}) {
      const cwd = await tempDir('cwd');
      const ctrl = new AbortController();
      let userAbort = false;
      const onOuterAbort = () => { userAbort = true; ctrl.abort(); };
      if (opts.signal) opts.signal.addEventListener('abort', onOuterAbort, { once: true });
      let last = null;
      let partial = '';
      let failed = null;
      let usage = null;
      const started = Date.now();
      try {
        // Codex에는 시스템 프롬프트 플래그가 없어 stdin 앞머리에 지침을 넣는다(설계서 8.4).
        const input = `${prompt.system}\n\n---\n\n${prompt.user}`;
        const run = await runCli({
          cmd: bin,
          args: codexArgs({ cwd, model: opts.model }),
          input,
          cwd,
          env: cleanEnv(env),
          timeouts: { ...timeouts, ...(opts.timeouts || {}) },
          signal: ctrl.signal,
          onLine: (line) => {
            let ev;
            try { ev = JSON.parse(line); } catch { return; }
            const type = ev.type || ev.msg?.type;
            if (type === 'item.updated' || type === 'item.completed') {
              const t = itemText(ev.item);
              if (t !== null) {
                if (t.length > partial.length && t.startsWith(partial)) opts.onDelta?.(t.slice(partial.length), t.length);
                partial = t;
                if (type === 'item.completed') last = t;
              }
            } else if (type === 'turn.completed') {
              usage = ev.usage || null;
            } else if (type === 'turn.failed') {
              failed = ev.error?.message || 'turn.failed';
            } else if (type === 'error') {
              failed = ev.message || ev.error?.message || 'error';
            }
          },
        });
        if (userAbort) return fail('ABORT', '취소했어요');
        if (last !== null && !failed && run.code === 0) {
          return { ok: true, text: last, durationMs: Date.now() - started, usage, limit: null, model: opts.model || null };
        }
        return classify({ run, message: failed || '', label });
      } finally {
        if (opts.signal) opts.signal.removeEventListener('abort', onOuterAbort);
        await rmDir(cwd);
      }
    },
  };
}
