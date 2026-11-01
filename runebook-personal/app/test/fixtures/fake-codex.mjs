#!/usr/bin/env node
// 가짜 codex: `codex exec --json` JSONL 이벤트 형식을 흉내 낸다(openai/codex exec_events.rs 기준).
const args = process.argv.slice(2);
const self = process.argv[1];
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
if (args[0] === '--version') { console.log('codex-cli 9.9.9'); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') {
  if (/loggedout/.test(self)) { process.stderr.write('Not logged in\n'); process.exit(1); }
  process.stderr.write('Logged in using ChatGPT\n');
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const mode = (input.match(/\[\[FAKE:(\w+)\]\]/) || [])[1] || 'ok';
  out({ type: 'thread.started', thread_id: 'th_fake' });
  out({ type: 'turn.started' });
  if (mode === 'limit') { out({ type: 'turn.failed', error: { message: "You've hit your usage limit. Try again later." } }); process.exit(1); }
  if (mode === 'auth') { out({ type: 'error', message: 'Not logged in. Run codex login.' }); process.exit(1); }
  if (mode === 'crash') { process.exit(2); }
  const m = input.match(/\[\[REPLY:([\s\S]*?)\]\]/);
  const text = mode === 'args' ? JSON.stringify({ args, hasSystem: input.startsWith('SYS') }) : (m ? m[1] : '{"작업":"테스트"}');
  out({ type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: '생각 중' } });
  out({ type: 'item.updated', item: { id: 'item_1', type: 'agent_message', text: text.slice(0, 3) } });
  out({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text } });
  out({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } });
});
