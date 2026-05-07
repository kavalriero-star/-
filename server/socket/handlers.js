const { getAIResponse } = require('../services/claude');

function setupSocketHandlers(io, agentManager) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle chain work request — one agent's contribution
    socket.on('chain:work', async ({ agentId, role, message, department }) => {
      const agent = agentManager.getAgent(agentId);
      if (!agent) {
        socket.emit('chain:work:result', {
          agentId,
          response: `${role}가 "${message}"에 대한 작업을 완료했습니다.`,
          toolCalls: [],
        });
        return;
      }

      try {
        const result = await getAIResponse(agent, message, department);
        if (result) {
          socket.emit('chain:work:result', {
            agentId,
            agentName: agent.name,
            response: result.response,
            toolCalls: result.toolCalls,
          });
        } else {
          // AI unavailable — client will use its own mock
          socket.emit('chain:work:result', {
            agentId,
            agentName: agent.name,
            response: null,
            useMock: true,
            toolCalls: [],
          });
        }
      } catch (err) {
        console.error('Chain work error:', err.message);
        socket.emit('chain:work:result', {
          agentId,
          agentName: agent.name,
          response: null,
          useMock: true,
          toolCalls: [],
        });
      }
    });

    // Handle individual chat message (direct conversation with one agent)
    socket.on('chat:message', async ({ agentId, message }) => {
      const agent = agentId ? agentManager.getAgent(agentId) : null;
      if (!agent) {
        socket.emit('chat:response', {
          agentId: null,
          message: '에이전트를 찾을 수 없습니다.',
          toolCalls: [],
        });
        return;
      }

      try {
        const result = await getAIResponse(agent, message, agent.dept);
        if (result) {
          socket.emit('chat:response', {
            agentId: agent.id,
            agentName: agent.name,
            message: result.response,
            toolCalls: result.toolCalls,
          });
        } else {
          socket.emit('chat:response', {
            agentId: agent.id,
            agentName: agent.name,
            message: `안녕하세요! 저는 ${agent.name}(${agent.role})입니다. 현재 AI 연결이 없어 응답할 수 없습니다. .env 파일에 ANTHROPIC_API_KEY를 설정해주세요.`,
            toolCalls: [],
          });
        }
      } catch (err) {
        console.error('Chat error:', err.message);
        socket.emit('chat:response', {
          agentId: agent.id,
          agentName: agent.name,
          message: `죄송합니다. 오류가 발생했습니다: ${err.message}`,
          toolCalls: [],
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };
