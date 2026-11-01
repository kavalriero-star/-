#!/usr/bin/env node
// 가짜 claude: `claude -p --output-format stream-json` 출력 줄 형식을 흉내 낸다(설계서 8.3, 실측 보고 기준).
// 동작은 stdin 안의 [[FAKE:모드]] 표시로 고른다. 실행 파일 이름에 loggedout이 있으면 auth status가 실패한다.
import fs from 'node:fs';
const args = process.argv.slice(2);
const self = process.argv[1];
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
if (args[0] === '--version') { console.log('9.9.9 (Claude Code fake)'); process.exit(0); }
if (args[0] === 'auth' && args[1] === 'status') {
  if (/loggedout/.test(self)) { console.log(JSON.stringify({ loggedIn: false })); process.exit(1); }
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiKeySource: 'none' }));
  process.exit(0);
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  const mode = (input.match(/\[\[FAKE:(\w+)\]\]/) || [])[1] || 'ok';
  const si = args.indexOf('--system-prompt-file');
  const sys = si >= 0 ? fs.readFileSync(args[si + 1], 'utf8') : '';
  const ti = args.indexOf('--tools');
  const tools = ti >= 0 && args[ti + 1] === '' ? [] : ['Bash', 'Read'];
  if (mode === 'silent') { setTimeout(() => {}, 100000); return; }
  out({ type: 'system', subtype: 'init', tools, mcp_servers: [], apiKeySource: mode === 'apikey' ? 'ANTHROPIC_API_KEY' : 'none', model: 'claude-fake' });
  if (mode === 'stall') { setTimeout(() => {}, 100000); return; }
  if (mode === 'auth') { out({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }); process.exit(1); }
  if (mode === 'limit') {
    out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', utilization: 1, resetsAt: 1900000000 } });
    out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Claude usage limit reached' });
    process.exit(1);
  }
  if (mode === 'crash') { process.stderr.write('internal failure\n'); process.exit(3); }
  let text;
  if (mode === 'env') text = JSON.stringify({ hasKey: !!process.env.ANTHROPIC_API_KEY, hasOauth: !!process.env.CLAUDE_CODE_OAUTH_TOKEN, hasJunk: !!process.env.RUNEBOOK_JUNK });
  else if (mode === 'echo') text = JSON.stringify({ sys: sys.slice(0, 30), cwdEmpty: fs.readdirSync(process.cwd()).length === 0, args, input: input.slice(0, 40) });
  else if (mode === 'empty') text = '';
  else { const m = input.match(/\[\[REPLY:([\s\S]*?)\]\]/); text = m ? m[1] : '{"작업":"테스트"}'; }
  out({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.5 } });
  for (let i = 0; i < text.length; i += 5) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 5) } } });
  out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
  out({ type: 'result', subtype: 'success', is_error: false, duration_ms: 123, result: text, usage: { input_tokens: 10, output_tokens: 5 } });
});
