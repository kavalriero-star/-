module.exports = {
  definition: {
    name: 'spawn_agent',
    description: 'Spawn a new sub-agent in the office. The new agent will appear at the entrance.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for the new agent',
        },
        role: {
          type: 'string',
          description: 'Role/job title for the new agent (e.g., "QA Tester", "DevOps Engineer")',
        },
      },
      required: ['name', 'role'],
    },
  },

  execute(input, agent, agentManager) {
    const existingAgents = agentManager.getAllAgents();
    if (existingAgents.length >= 8) {
      return { success: false, error: 'Maximum 8 agents allowed in the office' };
    }

    if (agentManager.getAgentByName(input.name)) {
      return { success: false, error: `Agent named "${input.name}" already exists` };
    }

    // Assign next available sprite color (cycle through 0-3)
    const spriteIndex = existingAgents.length % 4;
    const newAgent = agentManager.createAgent(input.name, input.role, spriteIndex, { x: 15, y: 18 });

    return {
      success: true,
      message: `Spawned new agent: ${newAgent.name} (${newAgent.role}) at the entrance`,
      agentId: newAgent.id,
    };
  },
};
