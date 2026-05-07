#!/usr/bin/env node
// Build a TRULY standalone HTML from the V02 bundle
// - Extract all JS assets from V02 manifest
// - Inline Phaser + Iconify (no CDN)
// - Replace app-orchestration.js Socket.io with direct Anthropic API
// - Output a single self-contained .html file

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const V02 = process.env.V02_PATH || '/root/.claude/uploads/46babed7-7ae6-4bec-a5ec-d0266be11052/378a890b-pixelofficestandalone_V02.html';
const OUT = path.join(__dirname, '..', 'pixel-office-standalone.html');

// Read & decode V02 manifest + template
const lines = fs.readFileSync(V02, 'utf8').split('\n');
const manifestJson = lines[172];
const templateJson = lines[180];
const manifest = JSON.parse(manifestJson);
const template = JSON.parse(templateJson);

function decodeAsset(uuid) {
  const entry = manifest[uuid];
  if (!entry) throw new Error('No asset for ' + uuid);
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = zlib.gunzipSync(bytes);
  return { mime: entry.mime, bytes };
}

// Identified UUIDs from V02 template (script tags in order):
// Head:
//   eb2d8ec3 → phaser min
//   a8ab5763 → iconify
// Body:
//   dacbfc36 → asset-generation.js
//   cbf31e23 → floorplan.js
//   c3859d45 → agents-data.js
//   c47a238a → phaser-game.js
//   72d477d6 → app-orchestration.js
const UUIDs = {
  phaser:        'eb2d8ec3-6624-4ee3-8488-2b858c96c83d',
  iconify:       'a8ab5763-93cc-4111-982a-a47e53fe22a5',
  assetGen:      'dacbfc36-004c-499a-b3f9-075b42140e54',
  floorplan:     'cbf31e23-4072-426e-82a3-49a5ed3feb7c',
  agentsData:    'c3859d45-5ea6-4226-be76-04590062996d',
  phaserGame:    'c47a238a-cf1a-497c-9036-1418fe18e09a',
  orchestration: '72d477d6-d06d-4bb8-8620-ef3655137544',
};

const phaserSrc        = decodeAsset(UUIDs.phaser).bytes.toString('utf8');
const iconifySrc       = decodeAsset(UUIDs.iconify).bytes.toString('utf8');
const assetGenSrc      = decodeAsset(UUIDs.assetGen).bytes.toString('utf8');
const floorplanSrc     = decodeAsset(UUIDs.floorplan).bytes.toString('utf8');
const agentsDataSrc    = decodeAsset(UUIDs.agentsData).bytes.toString('utf8');
const phaserGameSrc    = decodeAsset(UUIDs.phaserGame).bytes.toString('utf8');
let   orchestrationSrc = decodeAsset(UUIDs.orchestration).bytes.toString('utf8');

console.log('Extracted JS sizes:');
console.log('  phaser:        ', (phaserSrc.length/1024).toFixed(1), 'KB');
console.log('  iconify:       ', (iconifySrc.length/1024).toFixed(1), 'KB');
console.log('  asset-gen:     ', (assetGenSrc.length/1024).toFixed(1), 'KB');
console.log('  floorplan:     ', (floorplanSrc.length/1024).toFixed(1), 'KB');
console.log('  agents-data:   ', (agentsDataSrc.length/1024).toFixed(1), 'KB');
console.log('  phaser-game:   ', (phaserGameSrc.length/1024).toFixed(1), 'KB');
console.log('  orchestration: ', (orchestrationSrc.length/1024).toFixed(1), 'KB');

// ── Patch app-orchestration: add direct Anthropic API on top of mock-only V02 ──

// 1. Inject requestAIWork function before processChain function
const ANTHROPIC_INJECTION = `
// ═══════════════════════════════════════════════════════
// Direct Anthropic API call (added by build-from-v02)
// ═══════════════════════════════════════════════════════
async function callAnthropic(agent, role, message, department) {
  const apiKey = localStorage.getItem('anthropic_api_key');
  if (!apiKey) return null;
  const systemPrompt = \`당신은 \${agent.name}입니다. 역할: \${role}, 소속: \${department}부서.
가상 픽셀 아트 사무실에서 근무하는 AI 직원입니다.

## 행동 지침
- \${role}의 전문성을 살려 구체적이고 실무적인 결과물을 작성하세요
- 마크다운 형식으로 깔끔하게 정리하세요 (##, ###, -, **, 표 등)
- 한국어로 작성하세요
- 실제 업무 보고서처럼 구체적인 수치와 일정을 포함하세요
- 응답은 간결하되 실질적인 내용으로 채우세요 (200-400자 정도)\`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: message }]
      })
    });
    if (!res.ok) {
      console.error('Anthropic API error', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || null;
  } catch (e) {
    console.error('Anthropic fetch failed:', e);
    return null;
  }
}

async function requestAIWork(agentId, role, message, department) {
  const agent = window.OFFICE_AGENTS.AGENTS_DATA.find(a => a.id === agentId);
  if (agent && localStorage.getItem('anthropic_api_key')) {
    const text = await callAnthropic(agent, role, message, department);
    if (text) return { response: text, toolCalls: [{ name: 'claude_api', input: { role } }] };
  }
  const fn = MOCK_WORK[role] || (m => \`\${role}가 "\${m}"에 대한 작업을 완료했습니다.\`);
  return { response: fn(message), toolCalls: [] };
}

`;

// Inject before "let chainRunning"
const before1 = orchestrationSrc.length;
orchestrationSrc = orchestrationSrc.replace(
  /^let chainRunning = false;/m,
  ANTHROPIC_INJECTION + 'let chainRunning = false;'
);
if (orchestrationSrc.length === before1) {
  console.warn('WARN: chainRunning injection point not found');
}

// 2. Replace the inline mock invocation with requestAIWork call
const before2 = orchestrationSrc.length;
orchestrationSrc = orchestrationSrc.replace(
  /const fn = MOCK_WORK\[role\] \|\| \(m => `\$\{role\}가 "\$\{m\}"에 대한 작업을 완료했습니다\.`\);\s*\n\s*const result = fn\(message\);\s*\n\s*workLogs\.push\(\{agentName:a\.name, role, content:result\}\);\s*\n\s*addChatMessage\(a\.name, result, 'agent', \[\{name:'work_on_task', input:\{role, task:message\.substring\(0,40\)\}\}\]\);/,
  `const aiResult = await requestAIWork(a.id, role, message, department);
      const result = aiResult.response;
      workLogs.push({agentName:a.name, role, content:result});
      addChatMessage(a.name, result, 'agent', aiResult.toolCalls.length > 0 ? aiResult.toolCalls : [{name:'work_on_task', input:{role, task:message.substring(0,40)}}]);`
);
if (orchestrationSrc.length === before2) {
  console.warn('WARN: mock invocation replacement did not match');
}

// Build the final HTML by replacing the script src tags in the template with inline scripts
let html = template;

// Phaser and Iconify in head — replace <script src="UUID"></script>
html = html.replace(
  new RegExp(`<script src="${UUIDs.phaser}"></script>`),
  `<script>${phaserSrc}</script>`
);
html = html.replace(
  new RegExp(`<script src="${UUIDs.iconify}"></script>`),
  `<script>${iconifySrc}</script>`
);

// 5 app modules in body
html = html.replace(
  new RegExp(`<script src="${UUIDs.assetGen}"></script>`),
  `<script>${assetGenSrc}</script>`
);
html = html.replace(
  new RegExp(`<script src="${UUIDs.floorplan}"></script>`),
  `<script>${floorplanSrc}</script>`
);
html = html.replace(
  new RegExp(`<script src="${UUIDs.agentsData}"></script>`),
  `<script>${agentsDataSrc}</script>`
);
html = html.replace(
  new RegExp(`<script src="${UUIDs.phaserGame}"></script>`),
  `<script>${phaserGameSrc}</script>`
);
html = html.replace(
  new RegExp(`<script src="${UUIDs.orchestration}"></script>`),
  `<script>${orchestrationSrc}</script>`
);

// Strip Pretendard font @font-face block (uses unresolved UUIDs) — fallback to system font
html = html.replace(
  /<style>\/\*\*[\s\S]*?Pretendard[\s\S]*?<\/style>/,
  '<!-- Pretendard fonts dropped (use system fallback) -->'
);

// Inject API key UI + error handler before </body>
const API_KEY_UI = `
<style>
#api-modal{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(8px)}
#api-modal.open{display:flex}
#api-modal .box{background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:24px;width:90%;max-width:480px;box-shadow:0 30px 80px rgba(0,0,0,0.6);font-family:'Pretendard',system-ui,sans-serif}
#api-modal h2{font-size:15px;color:#e4e4e7;margin-bottom:8px;font-weight:700}
#api-modal p{font-size:12px;color:#a1a1aa;line-height:1.7;margin-bottom:14px}
#api-modal p a{color:#10b981;text-decoration:none}
#api-modal input{width:100%;background:rgba(255,255,255,0.04);color:#e4e4e7;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;font-family:'Courier New',monospace;font-size:12px;outline:none;margin-bottom:12px}
#api-modal input:focus{border-color:#10b981}
#api-modal .row{display:flex;gap:8px;justify-content:flex-end}
#api-modal button{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#d4d4d8;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600}
#api-modal button.primary{background:#10b981;border-color:#10b981;color:#09090b}
#api-modal button.danger{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:#f87171}
#api-status-pill{position:fixed;top:12px;right:12px;background:rgba(24,24,27,0.92);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:6px 12px;font-size:11px;color:#a1a1aa;z-index:50;cursor:pointer;display:flex;align-items:center;gap:6px;font-family:'Pretendard',system-ui,sans-serif}
#api-status-pill:hover{border-color:#10b981;color:#10b981}
#api-status-pill .dot{width:6px;height:6px;border-radius:50%;background:#f59e0b}
#api-status-pill.connected .dot{background:#10b981}
#__error_overlay{display:none;position:fixed;bottom:12px;left:12px;right:12px;background:#2a1215;color:#ff8a80;padding:10px 14px;border-radius:8px;border:1px solid #5c2b2e;z-index:99999;font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;max-height:40vh;overflow:auto}
</style>

<div id="api-status-pill" title="Claude API 키 설정">
  <span class="dot"></span>
  <span id="api-pill-text">API 키 설정</span>
</div>

<div id="api-modal">
  <div class="box">
    <h2>🔑 Claude API 키 설정</h2>
    <p>
      AI 직원이 실제 업무 결과를 생성하려면 Anthropic API 키가 필요합니다.<br>
      키를 입력하지 않으면 미리 정의된 <strong>Mock 응답</strong>이 사용됩니다.<br><br>
      🔒 키는 브라우저의 <strong>localStorage</strong>에만 저장되며, 외부로 전송되지 않습니다.<br>
      🔗 키 발급: <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a>
    </p>
    <input type="password" id="api-key-input" placeholder="sk-ant-api03-...">
    <div class="row">
      <button id="api-clear" class="danger">삭제</button>
      <button id="api-cancel">취소</button>
      <button id="api-save" class="primary">저장</button>
    </div>
  </div>
</div>

<div id="__error_overlay"></div>

<script>
window.addEventListener('error', function(e) {
  var el = document.getElementById('__error_overlay');
  if (el) {
    el.style.display = 'block';
    el.textContent += '[Error] ' + (e.message || e.type) +
      (e.filename ? ' (' + String(e.filename).slice(-40) + ':' + e.lineno + ')' : '') + '\\n';
  }
}, true);

document.addEventListener('DOMContentLoaded', function() {
  var modal = document.getElementById('api-modal');
  var pill = document.getElementById('api-status-pill');
  var input = document.getElementById('api-key-input');
  var pillText = document.getElementById('api-pill-text');

  function refresh() {
    var has = !!localStorage.getItem('anthropic_api_key');
    pill.classList.toggle('connected', has);
    pillText.textContent = has ? 'Claude AI 연결됨' : 'API 키 설정';
    var sb = document.getElementById('status-bar');
    if (sb) {
      if (has) { sb.textContent = 'Claude AI'; sb.style.color = '#10b981'; }
      else { sb.textContent = 'Mock 모드'; sb.style.color = '#f59e0b'; }
    }
  }

  pill.onclick = function() {
    input.value = localStorage.getItem('anthropic_api_key') || '';
    modal.classList.add('open');
  };
  document.getElementById('api-cancel').onclick = function() { modal.classList.remove('open'); };
  document.getElementById('api-save').onclick = function() {
    var v = input.value.trim();
    if (v) localStorage.setItem('anthropic_api_key', v);
    else localStorage.removeItem('anthropic_api_key');
    modal.classList.remove('open');
    refresh();
  };
  document.getElementById('api-clear').onclick = function() {
    if (confirm('저장된 API 키를 삭제하시겠습니까?')) {
      localStorage.removeItem('anthropic_api_key');
      input.value = '';
      modal.classList.remove('open');
      refresh();
    }
  };
  refresh();
});
</script>
`;

// Insert before the LAST </body>, not the first (Phaser source contains "</body>" literal)
const lastBody = html.lastIndexOf('</body>');
if (lastBody === -1) throw new Error('No </body> in template');
html = html.slice(0, lastBody) + API_KEY_UI + '\n' + html.slice(lastBody);

fs.writeFileSync(OUT, html);
console.log('\n✅ Built:', OUT);
console.log('   Size:', (html.length/1024/1024).toFixed(2), 'MB');
