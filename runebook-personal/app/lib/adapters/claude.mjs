// Claude Code(`claude -p`) 어댑터. 고정 호출 형태는 설계서 8.3절.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCli, cleanEnv } from '../runner.mjs';
import { tempDir, rmDir, fail, classify } from './common.mjs';

export function claudeArgs({ systemPromptFile, model }) {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--tools', '', '--safe-mode', '--strict-mcp-config', '--disable-slash-commands',
    '--no-session-persistence', '--system-prompt-file', systemPromptFile,
    ...(model ? ['--model', model] : []),
  ];
}

export function createClaudeAdapter({ bin = 'claude', timeouts, env = process.env } = {}) {
  const label = 'Claude';
  return {
    id: 'claude',
    label,
    async status() {
      const warnings = [];
      if (env.ANTHROPIC_API_KEY) warnings.push('환경변수 ANTHROPIC_API_KEY가 있어요. 도우미는 이 값을 넘기지 않지만, 다른 곳에서 claude를 쓰면 API 요금이 나갈 수 있어요.');
      const lines = [];
      const v = await runCli({ cmd: bin, args: ['--version'], env: cleanEnv(env), timeouts: { first: 15000, total: 20000 }, onLine: (l) => lines.push(l) });
      if (v.spawnError === 'ENOENT') return { installed: false, loggedIn: false, warnings };
      const version = lines.join(' ').trim() || null;
      const authLines = [];
      const a = await runCli({ cmd: bin, args: ['auth', 'status'], env: cleanEnv(env), timeouts: { first: 15000, total: 20000 }, onLine: (l) => authLines.push(l) });
      let authMethod = null;
      try {
        const j = JSON.parse(authLines.join('\n'));
        authMethod = j.authMethod || j.auth_method || null;
        if (j.apiKeySource && j.apiKeySource !== 'none') warnings.push(`API 키(${j.apiKeySource})로 인증되어 있어요. 구독이 아니라 API 요금이 나갈 수 있어요.`);
      } catch { /* JSON이 아니면 종료 코드로만 판단 */ }
      return { installed: true, version, loggedIn: a.code === 0, authMethod, warnings };
    },
    async complete(prompt, opts = {}) {
      const cwd = await tempDir('cwd');
      const sysDir = await tempDir('sys');
      const sysFile = path.join(sysDir, 'system.txt');
      const ctrl = new AbortController();
      let reason = null;
      const onOuterAbort = () => { reason = 'user'; ctrl.abort(); };
      if (opts.signal) opts.signal.addEventListener('abort', onOuterAbort, { once: true });
      let text = '';
      let result = null;
      let limit = null;
      let init = null;
      const started = Date.now();
      try {
        await fs.writeFile(sysFile, prompt.system, 'utf8');
        const run = await runCli({
          cmd: bin,
          args: claudeArgs({ systemPromptFile: sysFile, model: opts.model }),
          input: prompt.user,
          cwd,
          env: cleanEnv(env),
          timeouts: { ...timeouts, ...(opts.timeouts || {}) },
          signal: ctrl.signal,
          onLine: (line) => {
            let ev;
            try { ev = JSON.parse(line); } catch { return; }
            if (ev.type === 'system' && ev.subtype === 'init') {
              init = ev;
              if (ev.apiKeySource && ev.apiKeySource !== 'none') { reason = 'billing'; ctrl.abort(); }
            } else if (ev.type === 'stream_event') {
              const d = ev.event?.delta;
              if (d?.type === 'text_delta' && d.text) {
                text += d.text;
                opts.onDelta?.(d.text, text.length);
              }
            } else if (ev.type === 'rate_limit_event') {
              limit = ev.rate_limit_info || ev;
            } else if (ev.type === 'result') {
              result = ev;
            }
          },
        });
        if (reason === 'billing') return fail('API_KEY_IN_USE', `Claude가 구독이 아니라 API 키(${init?.apiKeySource})로 인증되어 호출을 멈췄어요`);
        if (reason === 'user') return fail('ABORT', '취소했어요');
        if (result && !result.is_error && (result.subtype === 'success' || result.subtype === undefined)) {
          return {
            ok: true,
            text: typeof result.result === 'string' ? result.result : text,
            durationMs: result.duration_ms ?? Date.now() - started,
            usage: result.usage || null,
            limit,
            model: init?.model || opts.model || null,
            tools: init?.tools ?? null,
          };
        }
        return classify({ run, message: typeof result?.result === 'string' ? result.result : (result?.subtype || ''), limit, label });
      } finally {
        if (opts.signal) opts.signal.removeEventListener('abort', onOuterAbort);
        await rmDir(cwd);
        await rmDir(sysDir);
      }
    },
  };
}
