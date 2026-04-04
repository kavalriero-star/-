module.exports = {
  definition: {
    name: 'work_on_task',
    description: 'Start working on a task at the current location. The agent will appear busy for the specified duration.',
    input_schema: {
      type: 'object',
      properties: {
        task_description: {
          type: 'string',
          description: 'Description of the task to work on',
        },
        duration_seconds: {
          type: 'number',
          description: 'How many seconds to work on the task (1-60)',
        },
      },
      required: ['task_description'],
    },
  },

  execute(input, agent, agentManager) {
    const duration = Math.min(60, Math.max(1, input.duration_seconds || 10));

    agentManager.setAgentState(agent.id, 'working', {
      task: input.task_description,
    });

    agentManager.speakAgent(agent.id, `💻 ${input.task_description}`, duration * 1000);

    // Auto-complete after duration
    setTimeout(() => {
      agentManager.setAgentState(agent.id, 'idle', { task: null });
      agentManager.speakAgent(agent.id, `✅ Done: ${input.task_description}`, 3000);
    }, duration * 1000);

    return {
      success: true,
      message: `Started working on: ${input.task_description} (${duration}s)`,
    };
  },
};
