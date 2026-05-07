#!/usr/bin/env node
// Build standalone HTML by inlining all CSS + JS into a single file
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');

const css = fs.readFileSync(path.join(PUB, 'css', 'style.css'), 'utf8');
const jsFiles = ['asset-generation.js', 'floorplan.js', 'agents-data.js', 'phaser-game.js'];
const jsContent = jsFiles.map(f => fs.readFileSync(path.join(PUB, 'js', f), 'utf8')).join('\n\n');

// Modified app-orchestration: replace Socket.io with direct Anthropic API
const appOrigPath = path.join(PUB, 'js', 'app-orchestration.js');
let appJs = fs.readFileSync(appOrigPath, 'utf8');

// Remove Socket.io initialization and direct chat handling
const STANDALONE_REPLACEMENT = `
// ═══════════════════════════════════════════════════════
// Direct Anthropic API call (no server)
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
      const t = await res.text();
      console.error('Anthropic API error', res.status, t);
      return null;
    }
    const data = await res.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    return text || null;
  } catch (e) {
    console.error('Anthropic fetch failed:', e);
    return null;
  }
}

// Request AI work — direct Anthropic call with mock fallback
function requestAIWork(agentId, role, message, department) {
  return new Promise(async (resolve) => {
    const agent = window.OFFICE_AGENTS.AGENTS_DATA.find(a => a.id === agentId);
    if (agent && localStorage.getItem('anthropic_api_key')) {
      const text = await callAnthropic(agent, role, message, department);
      if (text) {
        resolve({ response: text, toolCalls: [{ name: 'claude_api', input: { role } }] });
        return;
      }
    }
    // Fallback to mock
    const fn = MOCK_WORK[role] || (m => \`\${role}가 "\${m}"에 대한 작업을 완료했습니다.\`);
    resolve({ response: fn(message), toolCalls: [] });
  });
}
`;

// Replace the original requestAIWork function
appJs = appJs.replace(
  /\/\/ Request AI response from server[\s\S]*?^}\n/m,
  STANDALONE_REPLACEMENT + '\n'
);

// Remove initSocket function and call
appJs = appJs.replace(/function initSocket\(\)\{[\s\S]*?^}\n/m, '');
appJs = appJs.replace(/initSocket\(\);[\s\S]*?initUI\(\);/, `
  // Status bar based on API key presence
  const sb = document.getElementById('status-bar');
  if (localStorage.getItem('anthropic_api_key')) {
    sb.textContent = 'Claude AI';
    sb.style.color = '#10b981';
  } else {
    sb.textContent = 'Mock 모드';
    sb.style.color = '#f59e0b';
  }

  initUI();`);

// Also remove "// Listen for individual chat responses" socket handler block (it's gone with initSocket)
// And remove the `window.socket = null;` line
appJs = appJs.replace(/\/\/ Socket\.io connection\nwindow\.socket = null;\n/, '');

// Build the standalone HTML
const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pixel Office AI — Standalone</title>
<style>
${css}

/* === Standalone-only additions === */
#api-modal{position:fixed;inset:0;background:rgba(0,0,0,0.7);display:none;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(8px)}
#api-modal.open{display:flex}
#api-modal .box{background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:14px;padding:24px;width:90%;max-width:480px;box-shadow:0 30px 80px rgba(0,0,0,0.6)}
#api-modal h2{font-size:15px;color:#e4e4e7;margin-bottom:8px;font-weight:700}
#api-modal p{font-size:12px;color:#a1a1aa;line-height:1.7;margin-bottom:14px}
#api-modal p a{color:#10b981;text-decoration:none}
#api-modal input{width:100%;background:rgba(255,255,255,0.04);color:#e4e4e7;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:10px 14px;font-family:'Courier New',monospace;font-size:12px;outline:none;margin-bottom:12px}
#api-modal input:focus{border-color:#10b981}
#api-modal .row{display:flex;gap:8px;justify-content:flex-end}
#api-modal button{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#d4d4d8;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600}
#api-modal button.primary{background:#10b981;border-color:#10b981;color:#09090b}
#api-modal button.danger{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:#f87171}
#api-status-pill{position:fixed;top:12px;right:12px;background:rgba(24,24,27,0.92);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:6px 12px;font-size:11px;color:#a1a1aa;z-index:50;cursor:pointer;display:flex;align-items:center;gap:6px}
#api-status-pill:hover{border-color:#10b981;color:#10b981}
#api-status-pill .dot{width:6px;height:6px;border-radius:50%;background:#f59e0b}
#api-status-pill.connected .dot{background:#10b981}
</style>
<script src="https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js"></script>
</head>
<body>
<div id="app">
  <div id="header">
    <h1>
      <span class="logo-icon">🏢</span>
      Pixel Office — Standalone
    </h1>
    <div class="header-right">
      <div class="clock">
        <span style="font-size:13px">🕘</span>
        <span id="clock-time">09:00</span>
        <span class="phase" id="clock-phase">아침</span>
      </div>
      <span id="status-bar">Mock 모드</span>
    </div>
  </div>
  <div id="main-container">
    <div id="game-container">
      <div id="tone-overlay"></div>
      <div id="vignette"></div>
      <div id="agent-detail"></div>
      <div id="legend">
        <div class="li"><div class="d" style="background:#4ade80"></div>대기</div>
        <div class="li"><div class="d" style="background:#facc15"></div>작업</div>
        <div class="li"><div class="d" style="background:#60a5fa"></div>이동</div>
        <div class="li"><div class="d" style="background:#f59e0b"></div>휴식</div>
        <div class="li"><div class="d" style="background:#a78bfa"></div>회의</div>
        <div class="li"><div class="d" style="background:#f472b6"></div>대화</div>
      </div>
    </div>
    <div id="sidebar">
      <div id="agent-info">
        <h3>👥 임직원 (16명)</h3>
        <div class="agent-grid" id="agent-list"></div>
      </div>
      <div id="chat-container">
        <h3>💬 업무 채팅</h3>
        <div id="dept-selector">
          <label>부서</label>
          <select id="dept-select">
            <option value="기획">기획</option><option value="개발">개발</option>
            <option value="영업">영업</option><option value="구매">구매</option>
            <option value="제조">제조</option><option value="품질">품질</option>
            <option value="인사">인사</option><option value="재무">재무</option>
          </select>
        </div>
        <div id="agent-selector">
          <label>담당</label>
          <select id="target-agent"></select>
        </div>
        <div id="chat-messages"></div>
        <div id="chat-input-area">
          <input id="chat-input" placeholder="업무 내용을 입력하세요...">
          <button id="chat-send">전송</button>
        </div>
      </div>
    </div>
  </div>
</div>

<button id="tweaks-toggle" title="Tweaks">⚙️</button>
<div id="tweaks-panel">
  <h4>Tweaks <button id="tweaks-close">×</button></h4>
  <div class="tweak-row">
    <label>시간 속도</label>
    <div class="seg" data-tweak="speed">
      <button data-v="1">1x</button>
      <button data-v="2" class="active">2x</button>
      <button data-v="4">4x</button>
      <button data-v="8">8x</button>
    </div>
  </div>
  <div class="tweak-row">
    <label>조명 / 시간대</label>
    <div class="seg" data-tweak="lighting">
      <button data-v="auto" class="active">Auto</button>
      <button data-v="day">낮</button>
      <button data-v="dusk">저녁</button>
      <button data-v="night">야근</button>
    </div>
  </div>
  <div class="tweak-row">
    <label>자율 행동</label>
    <div class="toggle on" data-tweak="autonomy"></div>
  </div>
  <div class="tweak-row">
    <label>말풍선 표시</label>
    <div class="toggle on" data-tweak="bubbles"></div>
  </div>
  <div class="tweak-row">
    <label>BGM</label>
    <div class="toggle" data-tweak="bgm"></div>
  </div>
  <div class="tweak-row">
    <label>레이아웃</label>
    <div class="seg" data-tweak="layout">
      <button data-v="open" class="active">오픈형</button>
      <button data-v="cubicle">큐비클</button>
    </div>
  </div>
</div>

<!-- API key status pill (top-right) -->
<div id="api-status-pill" title="Claude API 키 설정">
  <span class="dot"></span>
  <span id="api-pill-text">API 키 설정</span>
</div>

<!-- API key modal -->
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

<div id="error-overlay" style="display:none;position:fixed;bottom:12px;left:12px;right:12px;background:#2a1215;color:#ff8a80;padding:10px 14px;border-radius:8px;border:1px solid #5c2b2e;z-index:99999;font:12px/1.5 monospace;white-space:pre-wrap;max-height:40vh;overflow:auto"></div>

<script>
// Global error handler
window.addEventListener('error', function(e) {
  const el = document.getElementById('error-overlay');
  if (el) {
    el.style.display = 'block';
    el.textContent += '[Error] ' + (e.message || e.type) +
      (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '') + '\\n';
  }
}, true);

// API key UI wiring
function updateApiPill() {
  const pill = document.getElementById('api-status-pill');
  const text = document.getElementById('api-pill-text');
  const has = !!localStorage.getItem('anthropic_api_key');
  pill.classList.toggle('connected', has);
  text.textContent = has ? 'Claude AI 연결됨' : 'API 키 설정';
}

window.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('api-modal');
  const pill = document.getElementById('api-status-pill');
  const input = document.getElementById('api-key-input');

  pill.onclick = () => {
    input.value = localStorage.getItem('anthropic_api_key') || '';
    modal.classList.add('open');
  };
  document.getElementById('api-cancel').onclick = () => modal.classList.remove('open');
  document.getElementById('api-save').onclick = () => {
    const v = input.value.trim();
    if (v) {
      localStorage.setItem('anthropic_api_key', v);
    } else {
      localStorage.removeItem('anthropic_api_key');
    }
    modal.classList.remove('open');
    updateApiPill();
    const sb = document.getElementById('status-bar');
    if (localStorage.getItem('anthropic_api_key')) {
      sb.textContent = 'Claude AI';
      sb.style.color = '#10b981';
    } else {
      sb.textContent = 'Mock 모드';
      sb.style.color = '#f59e0b';
    }
  };
  document.getElementById('api-clear').onclick = () => {
    if (confirm('저장된 API 키를 삭제하시겠습니까?')) {
      localStorage.removeItem('anthropic_api_key');
      input.value = '';
      modal.classList.remove('open');
      updateApiPill();
    }
  };
  updateApiPill();
});
</script>

<script>
${jsContent}
</script>

<script>
${appJs}
</script>

</body>
</html>
`;

const outPath = path.join(ROOT, 'pixel-office-standalone.html');
fs.writeFileSync(outPath, html);
console.log(`✅ Built: ${outPath} (${(html.length/1024).toFixed(1)}KB)`);
