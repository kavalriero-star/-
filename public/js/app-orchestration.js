// ═══════════════════════════════════════════════════════
// App orchestration: ClientAgentManager, Chat workflow,
// Tweaks panel, UI rendering — WITH SERVER CONNECTION
// ═══════════════════════════════════════════════════════

// Global tweaks state
window.tweaks = {
  "speed": 2,
  "lighting": "auto",
  "autonomy": true,
  "bubbles": true,
  "bgm": false,
  "layout": "open"
};

// Track agents currently in a chain task
window.busyAgentSet = new Set();

// Socket.io connection
window.socket = null;

// ── Client agent manager ─────────────────────────────
class ClientAgentManager {
  constructor(){
    this.agents = new Map();
    this.selectedAgentId = null;
    this.onAgentSelect = null;
  }
  syncFromAgents(arr){
    this.agents.clear();
    for(const a of arr) this.agents.set(a.id, a);
  }
  selectAgent(id){
    this.selectedAgentId = id;
    if(this.onAgentSelect) this.onAgentSelect(id);
    if(window.renderAgentCards) window.renderAgentCards();
  }
  getAllAgents(){ return Array.from(this.agents.values()); }
  getAgent(id){ return this.agents.get(id); }
}
window.clientAgentManager = new ClientAgentManager();

// ═══════════════════════════════════════════════════════
// Chat / chain orchestration
// ═══════════════════════════════════════════════════════
const delay = ms => new Promise(r => setTimeout(r, ms));
const R = arr => arr[Math.floor(Math.random()*arr.length)];
const RN = (mn,mx) => Math.floor(Math.random()*(mx-mn+1))+mn;

// Fallback mock responses when server/AI is unavailable
const MOCK_WORK = {
  'CEO': (m) => `## CEO 업무 지시: ${m}\n\n### 1. 전략 방향\n- 시장 동향과 경쟁사 현황을 종합 분석합니다.\n- 실행 가능한 ${R(['2주','3주','4주'])} 단위 로드맵 수립이 필요합니다.\n\n### 2. 기대 결과\n- 데이터 기반 분석 보고서\n- 일정/예산/인력 실행 계획서\n- 리스크 식별 및 대응 방안\n\n### 3. 일정\n기획 ${RN(2,4)}일 / 개발 ${RN(4,7)}일 / 검증 ${RN(1,3)}일`,

  '프로젝트 매니저': (m) => `## 기획서: ${m}\n\n### 범위 정의\n- MVP 핵심 기능 ${RN(3,6)}개\n- 부가 기능 ${RN(2,4)}개\n\n### 일정 계획\n| 단계 | 기간 | 담당 |\n| 기획 | ${RN(2,4)}일 | PM |\n| 디자인 | ${RN(2,4)}일 | 디자이너 |\n| 개발 | ${RN(4,7)}일 | 개발팀 |\n| QA | ${RN(1,3)}일 | QA팀 |\n\n### 리스크\n- 일정 버퍼 ${RN(15,25)}% 확보\n- 핵심 기술 PoC 선행`,

  '시니어 개발자': (m) => `## 개발 결과: ${m}\n\n### 구현 내용\n- API 엔드포인트 ${RN(8,15)}개\n- DB 스키마 + 마이그레이션\n- 단위 테스트 ${RN(30,60)}개\n\n### 기술 스택\n- ${R(['Node.js + Express','Python + FastAPI','Go + Gin'])}\n- ${R(['PostgreSQL','MySQL'])}\n\n### 성능\n- 응답 시간 ${RN(80,150)}ms\n- 코드 커버리지 ${RN(78,92)}%`,

  '백엔드 개발자': (m) => `## 백엔드 작업: ${m}\n\n- 인증/인가 미들웨어 추가\n- 캐시 레이어 (Redis) 구성\n- 큐 기반 비동기 처리 (${R(['SQS','RabbitMQ','Kafka'])})\n- 부하 테스트 통과 (RPS ${RN(800,2500)})`,

  '프론트 개발자': (m) => `## 프론트 작업: ${m}\n\n- 컴포넌트 ${RN(12,28)}개 작성\n- 상태관리 (${R(['Zustand','Redux','Recoil'])}) 도입\n- Lighthouse 성능 ${RN(88,98)}점\n- 접근성 AA 준수`,

  '프로덕트 디자이너': (m) => `## 디자인 검토: ${m}\n\n### UX 분석\n- 사용자 흐름 일관성: 양호\n- CTA 대비율: ${(3.8+Math.random()*1.2).toFixed(1)}:1\n\n### 접근성 (WCAG 2.1 AA)\n- 색상 대비 4.5:1 충족\n- 키보드 탐색 가능\n- 터치 타겟 44×44 충족\n\n### 개선 권고\n- ${R(['스켈레톤 UI','마이크로 인터랙션','다크모드 토큰'])} 추가 권장`,

  'QA 테스터': (m) => `## QA 테스트: ${m}\n\n| 항목 | 수 | 통과 | 통과율 |\n| 기능 | ${RN(24,32)} | ${RN(22,30)} | ${RN(92,99)}% |\n| 성능 | ${RN(6,12)} | 전체 | 100% |\n| 보안 | ${RN(8,14)} | 1 fail | ${RN(85,95)}% |\n\n### 발견된 이슈\n- [중요] ${R(['세션 타임아웃','동시 요청 정합성','입력값 길이'])} 처리 필요`,

  '데이터 분석가': (m) => `## 데이터 분석: ${m}\n\n### 시장\n- 시장 규모 ${R(['1.8','2.3','3.1'])}조원, 연 ${RN(8,15)}% 성장\n- 진입 가능 시장 ${RN(1500,5000).toLocaleString()}억\n\n### 예측\n- 6개월 MAU ${RN(8000,25000).toLocaleString()}명\n- 전환율 ${(2+Math.random()*3).toFixed(1)}%\n- ROI 1년 ${RN(120,250)}%`,

  'DevOps': (m) => `## 인프라/배포: ${m}\n\n- CI/CD 파이프라인 (${R(['GitHub Actions','GitLab CI'])}) 구성\n- ${R(['k8s','ECS','Cloud Run'])} 배포 자동화\n- 모니터링 + 알림 (${R(['Datadog','Grafana','New Relic'])})`,

  '영업 팀장': (m) => `## 영업 전략: ${m}\n\n- 핵심 타겟 고객 ${RN(15,40)}개사 선정\n- 파이프라인 ${RN(3,8)}억원 규모 확보\n- 클로징 예상 ${RN(40,65)}%`,
  '영업 매니저': (m) => `## 영업 액션: ${m}\n\n- 미팅 ${RN(10,25)}건 예약\n- 데모 자료 ${RN(2,4)}종 준비\n- 후속 콜 스크립트 ${RN(3,6)}개`,
  '구매 담당': (m) => `## 구매 검토: ${m}\n\n- 견적 ${RN(3,6)}개사 비교\n- 단가 ${RN(8,18)}% 절감 예상\n- 납기 안정성 확보`,
  '제조 매니저': (m) => `## 제조 계획: ${m}\n\n- 라인 가동률 ${RN(82,96)}%\n- 불량률 ${(0.3+Math.random()*0.5).toFixed(2)}%\n- 자재 리드타임 ${RN(7,14)}일`,
  '인사 담당': (m) => `## 인사 검토: ${m}\n\n- 필요 인력 ${RN(2,5)}명\n- 채용 ETA ${RN(4,8)}주\n- 교육 프로그램 ${RN(2,4)}개`,
  '재무 담당': (m) => `## 재무 분석: ${m}\n\n- 예산 ${(0.5+Math.random()*1.5).toFixed(1)}억\n- BEP ${RN(6,14)}개월\n- 현금흐름 안정`,
  '리셉션': (m) => `## 의전/일정: ${m}\n\n- 회의실 예약 완료\n- 손님 응대 준비 완료`,
};

let chainRunning = false;

// Request AI response from server for a specific agent role
function requestAIWork(agentId, role, message, department) {
  return new Promise((resolve) => {
    if (!window.socket || !window.socket.connected) {
      // Fallback to mock
      const fn = MOCK_WORK[role] || (m => `${role}가 "${m}"에 대한 작업을 완료했습니다.`);
      resolve({ response: fn(message), toolCalls: [] });
      return;
    }

    window.socket.emit('chain:work', { agentId, role, message, department });

    const handler = (data) => {
      if (data.agentId === agentId) {
        window.socket.off('chain:work:result', handler);
        if (data.useMock || !data.response) {
          // Server says use mock (no API key)
          const fn = MOCK_WORK[role] || (m => `${role}가 "${m}"에 대한 작업을 완료했습니다.`);
          resolve({ response: fn(message), toolCalls: [] });
        } else {
          resolve({ response: data.response, toolCalls: data.toolCalls || [] });
        }
      }
    };
    window.socket.on('chain:work:result', handler);

    // Timeout fallback after 30s
    setTimeout(() => {
      window.socket.off('chain:work:result', handler);
      const fn = MOCK_WORK[role] || (m => `${role}가 "${m}"에 대한 작업을 완료했습니다.`);
      resolve({ response: fn(message), toolCalls: [] });
    }, 30000);
  });
}

async function processChain(message, department){
  if(chainRunning){
    addChatMessage('⏳ 시스템', '이전 업무가 진행 중입니다. 잠시만 기다려주세요.', 'agent');
    return;
  }
  chainRunning = true;

  const scene = window.gameInstance?.scene.getScene('OfficeScene');
  if(!scene){ chainRunning = false; return; }

  const AGENTS = window.OFFICE_AGENTS.AGENTS_DATA;
  const CHAIN_ROLES = window.OFFICE_AGENTS.CHAIN_BY_DEPT[department] || window.OFFICE_AGENTS.CHAIN_BY_DEPT['기획'];

  // Find agents matching each role
  const chainAgents = CHAIN_ROLES.map(role => AGENTS.find(a => a.role === role)).filter(Boolean);
  for(const a of chainAgents) window.busyAgentSet.add(a.id);

  const workLogs = [];

  try {
    // 1) 회의 소집 — CEO speaks
    const ceo = chainAgents[0];
    scene.showSpeech(ceo.id, '📣 전체 회의 소집!', 3000);
    addChatMessage(ceo.name, `📢 [${department}] 전원 회의실로 모여주세요!`, 'agent');
    await delay(800);

    // 2) Move all chain agents to conference seats
    const seats = window.OFFICE_MAP.CONFERENCE_SEATS;
    const moves = [];
    chainAgents.forEach((a, i) => {
      const seat = seats[i % seats.length];
      moves.push(scene.forceMove(a.id, seat, {afterState:'meeting', afterAction:'meeting'}));
    });
    await Promise.all(moves);
    await delay(1500);

    // 3) Each role speaks + does work in sequence
    for(let i=0; i<chainAgents.length; i++){
      const a = chainAgents[i];
      const role = a.role;
      // Move agent back to their desk to "work"
      const desk = window.OFFICE_MAP.DESKS[a.homeDesk];
      await scene.forceMove(a.id, desk.chair, {facing: desk.faceDir != null ? desk.faceDir : 2, afterState:'working', afterAction:'typing'});

      scene.showSpeech(a.id, '✍️ 작업 시작!', 2000);
      addChatMessage('💬 시스템', `${a.name}(${role})가 작업을 시작합니다...`, 'agent');
      await delay(1800);

      // Request AI work from server (falls back to mock if no connection/API key)
      const aiResult = await requestAIWork(a.id, role, message, department);
      const result = aiResult.response;
      workLogs.push({agentName:a.name, role, content:result});
      addChatMessage(a.name, result, 'agent', aiResult.toolCalls.length > 0 ? aiResult.toolCalls : [{name:'work_on_task', input:{role, task:message.substring(0,40)}}]);
      await delay(800);

      // Hand off
      if(i < chainAgents.length - 1){
        const next = chainAgents[i+1];
        scene.showSpeech(a.id, `📄 ${next.name}에게 전달!`, 2000);
        await delay(1200);
      }
    }

    // 4) QA gate
    const qa = chainAgents.find(a => a.role === 'QA 테스터');
    if(qa){
      const qaDesk = window.OFFICE_MAP.DESKS[qa.homeDesk];
      await scene.forceMove(qa.id, qaDesk.chair, {facing:2, afterState:'working', afterAction:'thinking'});
      scene.showSpeech(qa.id, '🔍 품질 검사 중...', 2500);
      await delay(1800);

      const pass1 = Math.random() < 0.5;
      const total1 = pass1 ? RN(92,100) : RN(72,84);
      const verdict1 = pass1 ? '✅ 통과' : '❌ 미달 → 롤백';
      addChatMessage(qa.name, `📊 [QA 검사 1차]\n총점: ${total1}/100\n${verdict1}`, 'agent');
      scene.showSpeech(qa.id, pass1 ? `✅ ${total1}점!` : `❌ ${total1}점 - 롤백`, 2500);
      await delay(1500);

      if(!pass1){
        const designer = chainAgents.find(a => a.role === '프로덕트 디자이너') || chainAgents[2];
        if(designer){
          const dDesk = window.OFFICE_MAP.DESKS[designer.homeDesk];
          await scene.forceMove(designer.id, dDesk.chair, {facing:2, afterState:'working', afterAction:'typing'});
          scene.showSpeech(designer.id, '🔄 피드백 반영 중', 2500);
          addChatMessage('🔄 시스템', `→ ${designer.name}에게 재작업 요청`, 'agent');
          await delay(1800);
          addChatMessage(designer.name, '[QA 피드백 반영] 보완 완료', 'agent');
          await delay(700);
          await scene.forceMove(qa.id, qaDesk.chair, {facing:2, afterAction:'thinking'});
          scene.showSpeech(qa.id, '🔍 재검사', 2000);
          await delay(1500);
          addChatMessage(qa.name, `📊 [QA 검사 2차]\n총점: 98/100\n✅ 통과`, 'agent');
          scene.showSpeech(qa.id, '✅ 통과!', 2500);
          await delay(1200);
        }
      }
    }

    // 5) CEO final approval
    const ceoDesk = window.OFFICE_MAP.DESKS[ceo.homeDesk];
    await scene.forceMove(ceo.id, ceoDesk.chair, {facing:2, afterState:'working', afterAction:'thinking'});
    scene.showSpeech(ceo.id, '👁️ 최종 검토', 2500);
    await delay(1500);
    addChatMessage(ceo.name, `🏛️ CEO 최종 검토 완료\n\n✅ **승인합니다!**\n부서: ${department}\n업무: ${message}\n\n전 팀원 수고하셨습니다 👏`, 'agent');
    scene.showSpeech(ceo.id, '✅ 최종 승인!', 3000);
    await delay(1000);

    // 6) Everyone returns to desk
    const returns = [];
    const reactions = ['수고했어요! 👏','좋은 결과! ✅','확인했어요 👍','완료! 🎉','훌륭해요! ⭐','감사합니다! 🙌'];
    chainAgents.forEach((a, i) => {
      const desk = window.OFFICE_MAP.DESKS[a.homeDesk];
      returns.push(scene.forceMove(a.id, desk.chair, {
        facing: desk.faceDir != null ? desk.faceDir : 2,
        afterState:'idle'
      }).then(() => {
        scene.showSpeech(a.id, reactions[i % reactions.length], 2500);
      }));
    });
    await Promise.all(returns);

    addChatMessage('시스템', `[${department}] "${message}" 업무가 완료되었습니다.\n\n참여: ${workLogs.map(l=>l.agentName).join(' → ')}`, 'agent');

    // Generate downloadable report
    const reportHtml = generateStandaloneReport(message, department, workLogs);
    const blob = new Blob([reportHtml], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const el = document.getElementById('chat-messages');
    const rpt = document.createElement('div');
    rpt.className = 'chat-msg agent';
    rpt.innerHTML = `<div class="msg-name">📑 보고서</div><div class="msg-text">업무 보고서가 생성되었습니다.</div><a class="report-download" href="${url}" download="report_${Date.now()}.html"><iconify-icon icon="solar:document-text-bold"></iconify-icon> HTML 보고서 다운로드</a>`;
    el.appendChild(rpt);
    el.scrollTop = el.scrollHeight;
  } finally {
    chainRunning = false;
    for(const a of chainAgents) window.busyAgentSet.delete(a.id);
  }
}

function generateStandaloneReport(title, dept, logs){
  const date = new Date().toLocaleString('ko-KR');
  const sections = logs.map(l => {
    const content = (l.content || '')
      .replace(/^## (.+)$/gm,'<h2>$1</h2>')
      .replace(/^### (.+)$/gm,'<h3>$1</h3>')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/^- (.+)$/gm,'<li>$1</li>')
      .replace(/\n/g,'<br>');
    return `<section style="margin-bottom:20px;background:#fff;border-radius:10px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,0.06)"><div style="font-weight:bold;color:#1a1a3e;border-bottom:1px solid #e9ecef;padding-bottom:8px;margin-bottom:8px">[${l.role}] ${l.agentName}</div><div style="font-size:13px;color:#333;line-height:1.7">${content}</div></section>`;
  }).join('');
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>업무 보고서 — ${title}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Pretendard',sans-serif;background:#f8f9fa;color:#222;padding:32px 20px;line-height:1.7}div.c{max-width:760px;margin:0 auto}h1{font-size:22px;color:#1a1a3e;text-align:center}p.s{text-align:center;color:#868e96;font-size:12px;margin:6px 0 24px}h2{font-size:15px;color:#1a1a3e;margin:10px 0 5px}h3{font-size:13px;color:#495057;margin:6px 0 3px}li{margin-left:18px}strong{color:#1a1a3e}@media print{body{background:#fff}}</style></head><body><div class="c"><h1>업무 보고서</h1><p class="s">${title} | ${dept}부서 | ${date}</p>${sections}<p style="text-align:center;margin-top:24px;color:#adb5bd;font-size:11px">Generated by Pixel Office AI</p></div></body></html>`;
}

// ═══════════════════════════════════════════════════════
// UI: agent cards, chat, agent detail
// ═══════════════════════════════════════════════════════
function escapeHtml(t){ const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

function renderMarkdown(text){
  return escapeHtml(text)
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^- (.+)$/gm,'<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m=>'<ul>'+m+'</ul>')
    .replace(/^\| (.+) \|$/gm, (m, c) => {
      const cells = c.split(' | ').map(x=>`<td>${x.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, m => {
      const rows = m.trim().split('\n');
      if(rows.length>1){
        const head = rows[0].replace(/<td>/g,'<th>').replace(/<\/td>/g,'</th>');
        return `<table>${head}${rows.slice(1).join('')}</table>`;
      }
      return `<table>${m}</table>`;
    })
    .replace(/\n/g,'<br>');
}

function addChatMessage(name, text, type='agent', toolCalls=[]){
  const el = document.getElementById('chat-messages');
  const m = document.createElement('div');
  m.className = 'chat-msg ' + type;
  let tc = '';
  if(toolCalls.length){
    tc = '<div style="margin-top:3px">'+toolCalls.map(t => `<div class="tool-call">→ ${t.name}(${JSON.stringify(t.input).substring(0,40)})</div>`).join('')+'</div>';
  }
  const rendered = type==='agent' ? renderMarkdown(text) : escapeHtml(text);
  m.innerHTML = `<div class="msg-name">${escapeHtml(name)}</div><div class="msg-text">${rendered}</div>${tc}`;
  el.appendChild(m);
  el.scrollTop = el.scrollHeight;
}

const DOT_COLOR = {
  CEO:'#e94560', '프로젝트 매니저':'#10b981', '시니어 개발자':'#60a5fa',
  '백엔드 개발자':'#a78bfa', '프론트 개발자':'#34d399', '프로덕트 디자이너':'#f472b6',
  '데이터 분석가':'#facc15', 'QA 테스터':'#f59e0b', 'DevOps':'#9ca3af',
  '영업 팀장':'#ef4444', '영업 매니저':'#fb923c', '구매 담당':'#84cc16',
  '제조 매니저':'#06b6d4', '인사 담당':'#d946ef', '재무 담당':'#fbbf24',
  '리셉션':'#94a3b8',
};
const STATE_LABEL = {
  idle:'대기', working:'업무', moving:'이동', coffee:'휴식',
  meeting:'회의', chatting:'대화', toilet:'외출'
};

function renderAgentCards(){
  const list = document.getElementById('agent-list');
  if(!list) return;
  list.innerHTML = '';
  const cam = window.clientAgentManager;
  for(const a of cam.getAllAgents()){
    const card = document.createElement('div');
    card.className = 'agent-card' + (cam.selectedAgentId===a.id?' selected':'');
    card.onclick = () => { cam.selectAgent(a.id); };
    const stLabel = STATE_LABEL[a.state] || a.state;
    const dotC = DOT_COLOR[a.role] || '#888';
    card.innerHTML = `
      <div class="agent-dot" style="background:${dotC};color:${dotC}"></div>
      <div style="flex:1;min-width:0">
        <div class="agent-card-name">${a.name}</div>
        <div class="agent-card-role">${a.role}</div>
      </div>
      <div class="agent-card-state ${a.state}">${stLabel}</div>
    `;
    list.appendChild(card);
  }
}
window.renderAgentCards = renderAgentCards;

function updateAgentDetail(id){
  const ad = document.getElementById('agent-detail');
  if(!id){ ad.classList.remove('show'); return; }
  const a = window.clientAgentManager.getAgent(id);
  if(!a){ ad.classList.remove('show'); return; }
  const stLabel = STATE_LABEL[a.state] || a.state;
  const energy = Math.round(a.energy);
  const bhLabel = {desk:'책상에서 업무', lounge:'휴게실에서 휴식', balcony:'발코니에서 환기', whiteboard:'화이트보드 사용', toilet:'화장실', meeting:'회의 중', wandering:'사무실 둘러보기'}[a.behavior] || a.behavior || '대기 중';
  ad.classList.add('show');
  ad.innerHTML = `
    <div class="ad-name">${a.name}</div>
    <div class="ad-role">${a.role} · ${a.dept}부서</div>
    <div class="ad-row"><span>현재 상태</span><span>${stLabel}</span></div>
    <div class="ad-row"><span>활동</span><span>${bhLabel}</span></div>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:#71717a">
        <span>에너지</span><span style="color:#e4e4e7">${energy}%</span>
      </div>
      <div class="ad-bar energy"><div class="fill" style="width:${energy}%"></div></div>
    </div>
  `;
}
window.updateAgentDetail = updateAgentDetail;

// ═══════════════════════════════════════════════════════
// Tweaks panel
// ═══════════════════════════════════════════════════════
function persistTweaks(patch){
  Object.assign(window.tweaks, patch);
}

function initTweaksPanel(){
  const panel = document.getElementById('tweaks-panel');
  const toggle = document.getElementById('tweaks-toggle');
  const closeBtn = document.getElementById('tweaks-close');
  toggle.onclick = () => panel.classList.add('open');
  closeBtn.onclick = () => panel.classList.remove('open');

  panel.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.tweak;
    seg.querySelectorAll('button').forEach(b => {
      const v = b.dataset.v;
      const cur = String(window.tweaks[key]);
      b.classList.toggle('active', v === cur);
      b.onclick = () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const num = !isNaN(parseFloat(v)) && isFinite(v);
        persistTweaks({[key]: num ? parseFloat(v) : v});
        if(key === 'lighting') window.OfficeClock.applyLighting();
        if(key === 'layout') applyLayoutChange(v);
      };
    });
  });
  panel.querySelectorAll('.toggle').forEach(tg => {
    const key = tg.dataset.tweak;
    tg.classList.toggle('on', !!window.tweaks[key]);
    tg.onclick = () => {
      const newVal = !window.tweaks[key];
      tg.classList.toggle('on', newVal);
      persistTweaks({[key]: newVal});
      if(key === 'bgm') toggleBgm(newVal);
    };
  });
}

function applyLayoutChange(layout){
  const scene = window.gameInstance?.scene.getScene('OfficeScene');
  if(!scene || !scene.mapData) return;
  if(scene._cubicles){ scene._cubicles.destroy(); scene._cubicles = null; }
  if(layout === 'cubicle'){
    const g = scene.add.graphics();
    g.setDepth(15);
    g.fillStyle(0x647088, 1);
    const pairs = [
      [16, 12, 16, 17], [19, 12, 19, 17], [22, 12, 22, 17],
      [9, 8, 12, 8], [9, 11, 12, 11], [9, 14, 12, 14]
    ];
    pairs.forEach(([x1,y1,x2,y2]) => {
      g.fillRect(x1*TS, y1*TS+TS-3, (x2-x1+1)*TS, 6);
    });
    scene._cubicles = g;
  }
}

// Simple synthetic BGM using WebAudio
let bgmCtx = null, bgmNodes = [];
function toggleBgm(on){
  if(on){
    bgmCtx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [261.63, 329.63, 392.00, 523.25];
    let i = 0;
    const playNext = () => {
      if(!bgmCtx) return;
      const o = bgmCtx.createOscillator();
      const g = bgmCtx.createGain();
      o.frequency.value = notes[i%notes.length];
      o.type = 'sine';
      g.gain.setValueAtTime(0, bgmCtx.currentTime);
      g.gain.linearRampToValueAtTime(0.04, bgmCtx.currentTime+0.05);
      g.gain.linearRampToValueAtTime(0, bgmCtx.currentTime+0.6);
      o.connect(g); g.connect(bgmCtx.destination);
      o.start(); o.stop(bgmCtx.currentTime+0.6);
      bgmNodes.push(o);
      i++;
      window.bgmTimer = setTimeout(playNext, 700);
    };
    playNext();
  } else {
    if(bgmCtx){ try{ bgmCtx.close(); }catch(e){} bgmCtx=null; }
    if(window.bgmTimer) clearTimeout(window.bgmTimer);
  }
}

// ═══════════════════════════════════════════════════════
// Socket.io connection + Init
// ═══════════════════════════════════════════════════════
function initSocket(){
  const socket = io();
  window.socket = socket;

  const statusBar = document.getElementById('status-bar');

  socket.on('connect', () => {
    statusBar.textContent = 'Live';
    statusBar.className = '';
  });

  socket.on('disconnect', () => {
    statusBar.textContent = '연결 끊김';
  });

  // Listen for individual chat responses
  socket.on('chat:response', (data) => {
    addChatMessage(data.agentName || 'Agent', data.message, 'agent', data.toolCalls || []);
  });
}

function initUI(){
  // Populate agent dropdown
  const sel = document.getElementById('target-agent');
  for(const a of window.OFFICE_AGENTS.AGENTS_DATA){
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.name} (${a.role})`;
    sel.appendChild(opt);
  }

  setTimeout(renderAgentCards, 100);

  // Chat send
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  const send = () => {
    const msg = input.value.trim();
    if(!msg) return;
    const dept = document.getElementById('dept-select').value;
    addChatMessage('나', `[${dept}] ${msg}`, 'user');
    input.value = '';
    processChain(msg, dept);
  };
  sendBtn.onclick = send;
  input.onkeydown = e => { if(e.key === 'Enter') send(); };

  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      const ad = document.getElementById('agent-detail');
      ad.classList.remove('show');
      window.clientAgentManager.selectAgent(null);
    }
  });

  initTweaksPanel();
}

window.addEventListener('DOMContentLoaded', () => {
  // Connect to server
  initSocket();

  initUI();

  const config = {
    type: Phaser.AUTO,
    width: 1280, height: 832,
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#0a0a1a',
    scene: [OfficeScene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: {y:0}, debug: false } },
  };
  window.gameInstance = new Phaser.Game(config);

  // Refresh agent cards every 1.5s
  setInterval(() => {
    if(window.clientAgentManager){
      window.clientAgentManager.syncFromAgents(window.OFFICE_AGENTS.AGENTS_DATA);
      renderAgentCards();
      if(window.clientAgentManager.selectedAgentId)
        updateAgentDetail(window.clientAgentManager.selectedAgentId);
    }
  }, 1500);
});
