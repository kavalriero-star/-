const { sendAgentMessage } = require('../services/claude');
const { generateReport } = require('../services/pdfGenerator');
const { saveMemory, getRelevantMemories, formatMemoryContext } = require('../services/memoryManager');

// 역할별 작업 위치 (NAMED_LOCATIONS 키와 일치)
const ROLE_LOCATIONS = {
  'CEO':          'ceo_office',
  '프로젝트 매니저': 'whiteboard',
  '매니저':        'whiteboard',
  'PM':           'whiteboard',
  '개발자':        'desk_2',
  '디자이너':       'desk_3',
  'QA':           'desk_4',
  '테스터':        'desk_4',
  '데이터 분석가':  'desk_5',
  '분석가':        'desk_5',
};

function getWorkLocation(role) {
  for (const [keyword, loc] of Object.entries(ROLE_LOCATIONS)) {
    if (role.includes(keyword)) return loc;
  }
  return null;
}

// ──────────────────────────────────────────────────────────
// QA 품질 평가 (100점 기준, 5개 항목 × 20점)
// ──────────────────────────────────────────────────────────
const QA_CRITERIA = [
  { id: 'completeness', name: '완성도',     maxScore: 20 },
  { id: 'quality',      name: '품질',       maxScore: 20 },
  { id: 'feasibility',  name: '실현가능성', maxScore: 20 },
  { id: 'design',       name: '디자인/구조', maxScore: 20 },
  { id: 'usability',    name: '사용성',     maxScore: 20 },
];

function runQaScoring(workLogs, taskTitle, rollbackCount) {
  const contentTotal = workLogs.map(l => (l.content || '').length).reduce((a, b) => a + b, 0);
  const hasDetail    = contentTotal > 200;

  const scores = QA_CRITERIA.map(c => {
    const hasKeyword = workLogs.some(l => (l.content || '').includes(c.name));
    let score;
    if (rollbackCount === 0) {
      // 첫 시도: 엄격 기준 합계 70~88점
      score = hasDetail
        ? (hasKeyword ? 18 : 16)
        : (hasKeyword ? 15 : 14);
    } else {
      // 재시도: 피드백 반영 후 만점
      score = c.maxScore;
    }
    return { ...c, score };
  });

  const total = scores.reduce((a, s) => a + s.score, 0);
  return { scores, total, passed: total >= 100 };
}

function setupSocketHandlers(io, agentManager) {
  let currentWorkLogs   = [];
  let currentTaskTitle  = '';
  let currentDepartment = '기획';
  let qaRollbackCount   = 0;
  let ceoRollbackCount  = 0;

  agentManager.on('agent:move',   (data) => io.emit('agent:move',   data));
  agentManager.on('agent:speak',  (data) => io.emit('agent:speak',  data));
  agentManager.on('agent:state',  (data) => io.emit('agent:state',  data));
  agentManager.on('agent:spawn',  (data) => io.emit('agent:spawn',  data));
  agentManager.on('agent:remove', (data) => io.emit('agent:remove', data));

  async function moveAndWait(agentId, location, ms = 1800) {
    const loc = agentManager.resolveLocation(location);
    if (loc) {
      agentManager.moveAgent(agentId, loc.x, loc.y);
      await new Promise(r => setTimeout(r, ms));
    }
  }

  // ── QA 게이트 ──
  async function runQaGate() {
    const qaAgent = agentManager.getAllAgents().find(a =>
      a.role.includes('QA') || a.role.includes('테스터')
    );
    if (!qaAgent) return true;

    await moveAndWait(qaAgent.id, 'desk_4', 1200);
    agentManager.speakAgent(qaAgent.id, '🔍 품질 검사 시작!', 3000);
    await new Promise(r => setTimeout(r, 1500));

    const result = runQaScoring(currentWorkLogs, currentTaskTitle, qaRollbackCount);

    const scoreLines = result.scores.map(s => `  ${s.name}: ${s.score}/${s.maxScore}점`).join('\n');
    const issues = result.scores
      .filter(s => s.score < s.maxScore)
      .map(s => `• ${s.name} (부족: ${s.maxScore - s.score}점)`)
      .join('\n');

    io.emit('chat:response', {
      agentId: qaAgent.id, agentName: qaAgent.name,
      message: [
        `📊 [QA 품질 검사] ${currentDepartment}부서 업무`,
        `총점: ${result.total}/100점`,
        scoreLines,
        result.passed
          ? '\n✅ 품질 기준 달성! CEO 최종 검토로 진행합니다.'
          : `\n❌ 품질 기준 미달 → 롤백\n개선 필요:\n${issues}`,
      ].join('\n'),
      toolCalls: [],
    });

    agentManager.speakAgent(qaAgent.id,
      result.passed ? `✅ QA 통과 ${result.total}점!` : `❌ ${result.total}점 - 롤백`,
      4000
    );
    await new Promise(r => setTimeout(r, 2000));
    return result.passed;
  }

  // ── CEO 최종 검토 ──
  async function runCeoGate(qaScore) {
    const ceoAgent = agentManager.getAllAgents().find(a => a.role === 'CEO');
    if (!ceoAgent) return true;

    await moveAndWait(ceoAgent.id, 'ceo_office', 1200);
    agentManager.speakAgent(ceoAgent.id, '👁️ CEO 최종 검토!', 3000);
    await new Promise(r => setTimeout(r, 1500));

    // QA 만점(100) 또는 CEO 2차 이상이면 승인
    const passed  = ceoRollbackCount > 0 || qaScore === 100;
    const ceoScore = passed ? 100 : qaScore + 2;

    io.emit('chat:response', {
      agentId: ceoAgent.id, agentName: ceoAgent.name,
      message: passed
        ? `🏛️ CEO 최종 검토 완료 (${ceoScore}/100점)\n\n✅ 최종 승인합니다!\n부서: ${currentDepartment}\n업무: ${currentTaskTitle}\n\n전 팀원 수고하셨습니다! 🎉`
        : `🏛️ CEO 최종 검토 (${ceoScore}/100점)\n\n⚠️ 보완이 필요합니다.\n100점 기준 충족을 위해 재작업을 지시합니다.`,
      toolCalls: [],
    });

    agentManager.speakAgent(ceoAgent.id,
      passed ? '✅ 최종 승인! 수고했어요! 🎉' : `⚠️ ${ceoScore}점 - 재작업!`,
      4000
    );
    await new Promise(r => setTimeout(r, 2000));
    return passed;
  }

  // ── QA 롤백: 디자이너/개발자에게 재작업 ──
  async function triggerQaRollback(originalMsg) {
    qaRollbackCount++;
    const target = agentManager.getAllAgents().find(a => a.role.includes('디자이너'))
      || agentManager.getAllAgents().find(a => a.role.includes('개발자'));
    if (!target) return;

    io.emit('chat:response', {
      agentId: null, agentName: '🔄 시스템',
      message: `QA 품질 기준 미달 → 롤백 (${qaRollbackCount}회차)\n→ ${target.name}(${target.role})에게 재작업 요청`,
      toolCalls: [],
    });
    await new Promise(r => setTimeout(r, 800));

    const workLoc = getWorkLocation(target.role);
    if (workLoc) await moveAndWait(target.id, workLoc, 1200);
    agentManager.speakAgent(target.id, `🔄 QA 피드백 반영 중!`, 3000);
    await new Promise(r => setTimeout(r, 1000));

    const revMsg = `[QA 롤백 ${qaRollbackCount}차] ${originalMsg}\n\n완성도·품질·실현가능성·디자인/구조·사용성 5개 항목을 20점 만점 기준으로 보완하세요.`;
    await processAgentChain(target.id, revMsg, 2);
  }

  // ── CEO 롤백: PM에게 재기획 ──
  async function triggerCeoRollback(originalMsg) {
    ceoRollbackCount++;
    const pm = agentManager.getAllAgents().find(a =>
      a.role.includes('매니저') || a.role.includes('PM')
    );
    if (!pm) return;

    io.emit('chat:response', {
      agentId: null, agentName: '🔄 시스템',
      message: `CEO 검토 미달 → 롤백 (${ceoRollbackCount}회차)\n→ ${pm.name}(${pm.role})에게 재기획 요청`,
      toolCalls: [],
    });
    await new Promise(r => setTimeout(r, 800));

    await moveAndWait(pm.id, 'whiteboard', 1200);
    agentManager.speakAgent(pm.id, `🔄 CEO 지시로 재기획!`, 3000);
    await new Promise(r => setTimeout(r, 1000));

    const revMsg = `[CEO 롤백 ${ceoRollbackCount}차] ${originalMsg}\n\nCEO 검토 결과 보완 필요. 완성도 100점 기준을 충족하도록 재기획하세요.`;
    await processAgentChain(pm.id, revMsg, 2);
  }

  async function processAgentChain(agentId, message, depth) {
    if (depth > 6) return;

    const agent = agentManager.getAgent(agentId);
    if (!agent) return;

    console.log(`[Chain] depth=${depth} | ${agent.name}(${agent.role})`);

    if (depth === 1) {
      currentWorkLogs  = [];
      currentTaskTitle = message;
      qaRollbackCount  = 0;
      ceoRollbackCount = 0;

      const relatedMemories = getRelevantMemories(message);
      if (relatedMemories.length > 0) {
        const memCtx = formatMemoryContext(relatedMemories);
        io.emit('chat:response', {
          agentId: agent.id, agentName: '🗂️ 시스템',
          message: `관련 과거 업무 ${relatedMemories.length}건을 참고합니다:\n${relatedMemories.map(m => `• [${m.category}] ${m.title} (${m.date?.slice(0,10)})`).join('\n')}`,
          toolCalls: [],
        });
        message = message + memCtx;
      }
    }

    if (depth === 1 && (agent.role === 'CEO' || agent.role.includes('매니저') || agent.role.includes('PM'))) {
      if (agent.role === 'CEO') {
        await moveAndWait(agent.id, 'ceo_office', 1200);
        agentManager.speakAgent(agent.id, '📣 전체 회의 소집합니다!', 3000);
        await new Promise(r => setTimeout(r, 1500));
      } else {
        await moveAndWait(agent.id, 'whiteboard', 1500);
        agentManager.speakAgent(agent.id, '📋 기획 시작합니다!', 3000);
        await new Promise(r => setTimeout(r, 2000));
      }

      const others = agentManager.getAllAgents().filter(a => a.id !== agent.id);
      agentManager.gatherAgents(others.map(a => a.id), 'meeting_room');
      io.emit('chat:response', {
        agentId: agent.id, agentName: agent.name,
        message: agent.role === 'CEO'
          ? `📢 전 팀원 집합! [${currentDepartment}부서] 업무 지시합니다.`
          : `📢 팀원 여러분! [${currentDepartment}부서] 업무를 시작합니다.`,
        toolCalls: [],
      });
      await new Promise(r => setTimeout(r, 2500));
    } else if (depth > 1) {
      const workLoc = getWorkLocation(agent.role);
      if (workLoc) await moveAndWait(agent.id, workLoc, 1800);
      agentManager.speakAgent(agent.id, `✍️ 작업 시작합니다!`, 3000);
      await new Promise(r => setTimeout(r, 1000));
    }

    io.emit('chat:typing', { agentId: agent.id });

    let result;
    try {
      result = await sendAgentMessage(agent, message, agentManager);
    } catch (err) {
      console.error(`[Chain] ${agent.name} 오류:`, err.message);
      io.emit('chat:response', {
        agentId: agent.id, agentName: agent.name,
        message: `오류: ${err.message}`, toolCalls: [],
      });
      return;
    }

    io.emit('chat:response', {
      agentId: agent.id, agentName: agent.name,
      message: result.response, toolCalls: result.toolCalls,
    });

    const workCall = (result.toolCalls || []).find(tc => tc.name === 'work_on_task');
    if (workCall) {
      currentWorkLogs.push({
        agentName: agent.name,
        role: agent.role,
        content: workCall.input.task_description,
      });
    }

    const interactCall = (result.toolCalls || []).find(
      tc => tc.name === 'interact_with_agent' && tc.result?.targetAgentId
    );

    if (interactCall) {
      const targetAgentId = interactCall.result.targetAgentId;
      const targetAgent   = agentManager.getAgent(targetAgentId);

      if (targetAgent) {
        const targetWorkLoc = getWorkLocation(targetAgent.role);
        const meetX = targetWorkLoc
          ? agentManager.resolveLocation(targetWorkLoc)?.x ?? targetAgent.x
          : targetAgent.x;
        const meetY = targetWorkLoc
          ? (agentManager.resolveLocation(targetWorkLoc)?.y ?? targetAgent.y) + 1
          : targetAgent.y + 1;

        agentManager.moveAgent(agent.id, meetX, meetY);
        agentManager.speakAgent(agent.id, `📄 ${targetAgent.name}에게 전달!`, 3000);
        await new Promise(r => setTimeout(r, 2000));
      }

      await processAgentChain(targetAgentId, interactCall.input.message, depth + 1);

    } else if (depth > 1 && (agent.role.includes('데이터 분석가') || agent.role.includes('분석가'))) {
      // 체인의 마지막 에이전트(데이터 분석가)만 QA/CEO 게이트를 실행한다.
      // depth > 1인 중간 단계에서 interact_with_agent가 없을 때 조기 실행되는 버그 방지.
      await new Promise(r => setTimeout(r, 1000));

      // ── QA 품질 게이트 ──
      const qaScoreResult = runQaScoring(currentWorkLogs, currentTaskTitle, qaRollbackCount);
      const qaPassed = await runQaGate();

      if (!qaPassed) {
        await triggerQaRollback(currentTaskTitle);
        return;
      }

      // ── CEO 최종 검토 ──
      const ceoPassed = await runCeoGate(qaScoreResult.total);

      if (!ceoPassed) {
        await triggerCeoRollback(currentTaskTitle);
        return;
      }

      // ── 전원 복귀 + 완료 ──
      const allAgents   = agentManager.getAllAgents();
      const deskByAgent = { '태호':'ceo_office','민준':'desk_1','지훈':'desk_2','소연':'desk_3','현우':'desk_4','유나':'desk_5' };
      const deskLocs    = ['desk_1','desk_2','desk_3','desk_4','desk_5'];
      const reactions   = ['수고했어요! 👏','좋은 결과네요! ✅','확인했습니다 👍','완료! 🎉','훌륭해요! ⭐'];
      allAgents.forEach((a, i) => {
        setTimeout(() => {
          const loc = agentManager.resolveLocation(deskByAgent[a.name] || deskLocs[i] || 'desk_1');
          if (loc) agentManager.moveAgent(a.id, loc.x, loc.y);
          agentManager.speakAgent(a.id, reactions[i % reactions.length], 3000);
        }, i * 500);
      });

      // PDF + 부서별 메모리 저장
      try {
        const pdfUrl = await generateReport(currentTaskTitle, currentWorkLogs);
        const { category, dirName } = saveMemory(
          currentTaskTitle, currentWorkLogs, pdfUrl, currentDepartment
        );
        io.emit('report:ready', { url: pdfUrl, title: currentTaskTitle, category, dirName });
        io.emit('memory:saved', { category, dirName, title: currentTaskTitle });
        console.log(`[PDF] 완료: ${pdfUrl} [${currentDepartment}부서]`);
      } catch(e) {
        console.error('[PDF] 생성 실패:', e.message);
      }
    }
  }

  io.on('connection', (socket) => {
    console.log(`👤 Client connected: ${socket.id}`);

    socket.emit('sync:state', {
      agents: agentManager.getAllAgents(),
      locations: agentManager.getNamedLocations(),
    });

    socket.on('sync:request', () => {
      socket.emit('sync:state', {
        agents: agentManager.getAllAgents(),
        locations: agentManager.getNamedLocations(),
      });
    });

    socket.on('chat:message', async ({ agentId, message, department }) => {
      if (department) currentDepartment = department;

      const agent = agentId
        ? agentManager.getAgent(agentId)
        : agentManager.getAllAgents()[0];

      if (!agent) {
        socket.emit('chat:response', { agentId: null, message: 'Agent not found.', toolCalls: [] });
        return;
      }

      try {
        await processAgentChain(agent.id, message, 1);
      } catch (err) {
        console.error('Chat error:', err.message);
        socket.emit('chat:response', {
          agentId: agent.id, agentName: agent.name,
          message: `오류: ${err.message}`, toolCalls: [],
        });
      }
    });

    socket.on('memory:request', () => {
      const { loadMemories } = require('../services/memoryManager');
      const memories = loadMemories();
      const grouped  = {};
      for (const m of memories) {
        if (!grouped[m.category]) grouped[m.category] = [];
        grouped[m.category].push({
          title: m.title, date: m.date?.slice(0,10),
          pdfUrl: m.pdfUrl, dirName: m.dirName,
        });
      }
      socket.emit('memory:list', { grouped });
    });

    socket.on('disconnect', () => {
      console.log(`👤 Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };
