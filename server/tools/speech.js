module.exports = {
  definition: {
    name: 'speak',
    description: 'Display a speech bubble above the agent with a short message visible to everyone in the office.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to display in the speech bubble (keep it short, under 100 chars)',
        },
        duration: {
          type: 'number',
          description: 'Duration in milliseconds to show the bubble (default: 5000)',
        },
      },
      required: ['message'],
    },
  },

  execute(input, agent, agentManager) {
    const duration = input.duration || 5000;
    agentManager.speakAgent(agent.id, input.message, duration);
    return {
      success: true,
      message: `Displayed speech bubble: "${input.message}"`,
    };
  },
};
