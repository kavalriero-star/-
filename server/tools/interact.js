module.exports = {
  definition: {
    name: 'interact_with_agent',
    description: 'Send a message to another agent in the office. They will process your message and may respond.',
    input_schema: {
      type: 'object',
      properties: {
        target_agent: {
          type: 'string',
          description: 'Name of the agent to interact with',
        },
        message: {
          type: 'string',
          description: 'Message to send to the other agent',
        },
      },
      required: ['target_agent', 'message'],
    },
  },

  execute(input, agent, agentManager) {
    const target = agentManager.getAgentByName(input.target_agent);
    if (!target) {
      return {
        success: false,
        error: `Agent "${input.target_agent}" not found. Available agents: ${agentManager.getAllAgents().map(a => a.name).join(', ')}`,
      };
    }

    if (target.id === agent.id) {
      return { success: false, error: "You can't interact with yourself" };
    }

    // Show interaction visually
    agentManager.speakAgent(agent.id, `💬 Hey ${target.name}!`, 3000);

    return {
      success: true,
      message: `Message sent to ${target.name}: "${input.message}". They will process it when they can.`,
      targetAgentId: target.id,
    };
  },
};
