const { sendAgentMessage } = require('../services/claude');
const { generateReport } = require('../services/pdfGenerator');
const { saveMemory, getRelevantMemories, formatMemoryContext } = require('../services/memoryManager');

// 역할별 작업 위치
const ROLE_LOCATIONS = {
  'CEO':    'ceo_office',
  '프로젝트 매니저': 'whiteboard',
  '매니저': 'whiteboard',
  'PM':     'whiteboard',
  '개발자': 'desk_2',
  '디자이너': 'desk_3',
  'QA':     'desk_4',
  '데이터 분석가': 'desk_5',
};

function getWorkLocation(role) {
  for (const [keyword, loc] of Object.entries(ROLE_LOCATIONS)) {
    if (role.includes(keyword)) return loc;
  }
  return null;
}

function setupSocketHandlers(io, agentManager) {
  let currentWorkLogs = [];  // 현재 진행 중인 작업 로그
  let currentTaskTitle = '';
  // Broadcast helper
  agentManager.on('agent:move', (data) => io.emit('agent:move', data));
  agentManager.on('agent:speak', (data) => io.emit('agent:speak', data));
  agentManager.on('agent:state', (data) => io.emit('agent:state', data));
  agentManager.on('agent:spawn', (data) => io.emit('agent:spawn', data));
  agentManager.on('agent:remove', (data) => io.emit('agent:remove', data));

  async function moveAndWait(agentId, location, ms = 1800) {
    const loc = agentManager.resolveLocation(location);
    if (loc) {
      agentManager.moveAgent(agentId, loc.x, loc.y);
      await new Promise((r) => setTimeout(r, ms));
    }
  }

  async function processAgentChain(agentId, message, depth) {
    if (depth > 6) return;

    const agent = agentManager.getAgent(agentId);
    if (!agent) return;

    console.log(`[Chain] depth=${depth} | ${agent.name}(${agent.role})`);

    // depth===1 시작 시 작업 로그 초기화
    if (depth === 1) {
      currentWorkLogs = [];
      currentTaskTitle = message;
      // 관련 과거 업무 메모리 로드해서 첫 메시지에 컨텍스트 추가
      const relatedMemories = getRelevantMemories(message);
      if (relatedMemories.length > 0) {
        const memCtx = formatMemoryContext(relatedMemories);
        io.emit('chat:response', {
          agentId: agent.id, agentName: '🗂️ 시스템',
          message: `관련 과거 업무 ${relatedMemories.length}건을 참고합니다:\n${relatedMemories.map(m => `• [${m.category}] ${m.title} (${m.date?.slice(0,10)})`).join('\n')}`,
          toolCalls: [],
        });
        // 메시지에 메모리 컨텍스트 첨부
        message = message + memCtx;
      }
    }

    // 1. PM이 첫 번째로 실행되면 전원 미팅룸 집합
    if (depth === 1 && (agent.role === 'CEO' || agent.role.includes('매니저') || agent.role.includes('PM'))) {
      if (agent.role === 'CEO') {
        // CEO는 집무실에서 전체 소집
        await moveAndWait(agent.id, 'ceo_office', 1200);
        agentManager.speakAgent(agent.id, '📣 전체 회의 소집합니다!', 3000);
        await new Promise((r) => setTimeout(r, 1500));
      } else {
        // PM은 화이트보드로
        await moveAndWait(agent.id, 'whiteboard', 1500);
        agentManager.speakAgent(agent.id, '📋 기획 시작합니다!', 3000);
        await new Promise((r) => setTimeout(r, 2000));
      }

      // 나머지 전원 미팅룸 집합
      const others = agentManager.getAllAgents().filter(a => a.id !== agent.id);
      agentManager.gatherAgents(others.map(a => a.id), 'meeting_room');
      io.emit('chat:response', {
        agentId: agent.id, agentName: agent.name,
        message: agent.role === 'CEO'
          ? '📢 전 팀원 미팅룸으로 집합! 중요 업무 지시가 있습니다.'
          : '📢 팀원 여러분, 미팅룸으로 모여주세요!',
        toolCalls: [],
      });
      await new Promise((r) => setTimeout(r, 2500));
    } else if (depth > 1) {
      // 2. 다른 에이전트는 자기 작업 위치로 이동
      const workLoc = getWorkLocation(agent.role);
      if (workLoc) {
        await moveAndWait(agent.id, workLoc, 1800);
      }
      agentManager.speakAgent(agent.id, `✍️ 작업 시작합니다!`, 3000);
      await new Promise((r) => setTimeout(r, 1000));
    }

    // 3. AI/Mock 실행
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

    // work_on_task toolCall 수집
    const workCall = (result.toolCalls || []).find(tc => tc.name === 'work_on_task');
    if (workCall) {
      currentWorkLogs.push({
        agentName: agent.name,
        role: agent.role,
        content: workCall.input.task_description,
      });
    }

    // 4. 다음 에이전트 체인
    const interactCall = (result.toolCalls || []).find(
      (tc) => tc.name === 'interact_with_agent' && tc.result?.targetAgentId
    );

    if (interactCall) {
      const targetAgentId = interactCall.result.targetAgentId;
      const targetAgent = agentManager.getAgent(targetAgentId);

      // 전달자가 수신자에게 걸어가서 자료 전달
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
        await new Promise((r) => setTimeout(r, 2000));
      }

      await processAgentChain(targetAgentId, interactCall.input.message, depth + 1);

    } else if (depth > 1) {
      // 5. 체인 마지막 → 전원 자리 복귀
      await new Promise((r) => setTimeout(r, 1000));
      const allAgents = agentManager.getAllAgents();
      const deskLocs = ['desk_1', 'desk_2', 'desk_3', 'desk_4', 'desk_5'];
      const reactions = ['수고했어요! 👏', '좋은 결과네요! ✅', '확인했습니다 👍', '완료! 🎉', '훌륭해요! ⭐'];
      const deskByAgent = {
        '태호': 'ceo_office',
        '민준': 'desk_1',
        '지훈': 'desk_2',
        '소연': 'desk_3',
        '현우': 'desk_4',
        '유나': 'desk_5',
      };
      allAgents.forEach((a, i) => {
        setTimeout(() => {
          const locName = deskByAgent[a.name] || deskLocs[i] || 'desk_1';
          const loc = agentManager.resolveLocation(locName);
          if (loc) agentManager.moveAgent(a.id, loc.x, loc.y);
          agentManager.speakAgent(a.id, reactions[i % reactions.length], 3000);
        }, i * 500);
      });

      // PDF 생성 + 메모리 저장
      try {
        const pdfUrl = await generateReport(currentTaskTitle, currentWorkLogs);
        // 메모리에 저장
        const { category, dirName } = saveMemory(currentTaskTitle, currentWorkLogs, pdfUrl);
        io.emit('report:ready', { url: pdfUrl, title: currentTaskTitle, category, dirName });
        io.emit('memory:saved', { category, dirName, title: currentTaskTitle });
        console.log('[PDF] 보고서 생성됨:', pdfUrl);
      } catch(e) {
        console.error('[PDF] 생성 실패:', e.message);
      }
    }
  }

  io.on('connection', (socket) => {
    console.log(`👤 Client connected: ${socket.id}`);

    // Send full state on connect
    socket.emit('sync:state', {
      agents: agentManager.getAllAgents(),
      locations: agentManager.getNamedLocations(),
    });

    // Handle sync request
    socket.on('sync:request', () => {
      socket.emit('sync:state', {
        agents: agentManager.getAllAgents(),
        locations: agentManager.getNamedLocations(),
      });
    });

    // Handle chat message
    socket.on('chat:message', async ({ agentId, message }) => {
      const agent = agentId
        ? agentManager.getAgent(agentId)
        : agentManager.getAllAgents()[0];

      if (!agent) {
        socket.emit('chat:response', {
          agentId: null,
          message: 'Agent not found.',
          toolCalls: [],
        });
        return;
      }

      try {
        await processAgentChain(agent.id, message, 1);
      } catch (err) {
        console.error('Chat error:', err.message);
        socket.emit('chat:response', {
          agentId: agent.id,
          agentName: agent.name,
          message: `오류가 발생했습니다: ${err.message}`,
          toolCalls: [],
        });
      }
    });

    // 메모리 목록 요청
    socket.on('memory:request', () => {
      const { loadMemories } = require('../services/memoryManager');
      const memories = loadMemories();
      const grouped = {};
      for (const m of memories) {
        if (!grouped[m.category]) grouped[m.category] = [];
        grouped[m.category].push({
          title: m.title,
          date: m.date?.slice(0, 10),
          pdfUrl: m.pdfUrl,
          dirName: m.dirName,
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
