// 모의 어댑터. 실제 AI 없이 모든 흐름을 시험한다. 응답은 호출자가 넘긴 prompt.mock()으로 만든다.
import { fail } from './common.mjs';

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('abort')); }, { once: true });
  });
}

export function createMockAdapter({ getMode = () => 'ok', delayMs = 400 } = {}) {
  return {
    id: 'mock',
    label: '모의 AI',
    async status() {
      return { installed: true, version: 'mock', loggedIn: getMode() !== 'login', authMethod: 'mock', warnings: [] };
    },
    async complete(prompt, opts = {}) {
      const mode = getMode();
      const started = Date.now();
      try {
        await wait(mode === 'slow' ? delayMs + 4000 : delayMs, opts.signal);
      } catch {
        return fail('ABORT', '취소했어요');
      }
      if (mode === 'limit') return fail('LIMIT', '모의 AI 사용 한도에 도달했어요(시험용 상태)', { resetsAt: null });
      if (mode === 'login') return fail('NOT_LOGGED_IN', '모의 AI 로그인이 필요해요(시험용 상태)');
      if (mode === 'helper') return fail('NOT_INSTALLED', '모의 AI가 꺼져 있어요(시험용 상태)');
      let text;
      if (mode === 'badjson') text = '죄송하지만 JSON 대신 설명으로 답합니다.';
      else if (typeof prompt.mockText === 'string') text = prompt.mockText;
      else text = JSON.stringify(typeof prompt.mock === 'function' ? prompt.mock() : { 작업: '모의' });
      for (let i = 0; i < text.length; i += Math.ceil(text.length / 4)) opts.onDelta?.(text.slice(i, i + Math.ceil(text.length / 4)), Math.min(text.length, i + Math.ceil(text.length / 4)));
      return { ok: true, text, durationMs: Date.now() - started, usage: null, limit: null, model: 'mock' };
    },
  };
}
