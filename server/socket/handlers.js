const { sendAgentMessage } = require('../services/claude');

function setupSocketHandlers(io, agentManager) {
  // Broadcast helper
  agentManager.on('agent:move', (data) => io.emit('agent:move', data));
  agentManager.on('agent:speak', (data) => io.emit('agent:speak', data));
  agentManager.on('agent:state', (data) => io.emit('agent:state', data));
  agentManager.on('agent:spawn', (data) => io.emit('agent:spawn', data));
  agentManager.on('agent:remove', (data) => io.emit('agent:remove', data));

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

      socket.emit('chat:typing', { agentId: agent.id });

      try {
        const result = await sendAgentMessage(agent, message, agentManager);
        socket.emit('chat:response', {
          agentId: agent.id,
          agentName: agent.name,
          message: result.response,
          toolCalls: result.toolCalls,
        });
      } catch (err) {
        console.error('Chat error:', err.message);
        socket.emit('chat:response', {
          agentId: agent.id,
          agentName: agent.name,
          message: `Sorry, I encountered an error: ${err.message}`,
          toolCalls: [],
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`👤 Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = { setupSocketHandlers };
