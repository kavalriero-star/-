module.exports = {
  definition: {
    name: 'move_to',
    description: 'Move the agent to a specific location in the office. You can use named locations or x,y coordinates.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Named location (e.g., "desk_1", "meeting_room", "kitchen", "entrance", "whiteboard")',
        },
        x: { type: 'number', description: 'X tile coordinate (1-28)' },
        y: { type: 'number', description: 'Y tile coordinate (1-18)' },
      },
    },
  },

  execute(input, agent, agentManager) {
    let target;
    if (input.location) {
      target = agentManager.resolveLocation(input.location);
      if (!target) {
        return { success: false, error: `Unknown location: ${input.location}` };
      }
    } else if (input.x !== undefined && input.y !== undefined) {
      target = { x: input.x, y: input.y };
    } else {
      return { success: false, error: 'Provide a location name or x,y coordinates' };
    }

    agentManager.moveAgent(agent.id, target.x, target.y);
    return {
      success: true,
      message: `Moving to (${target.x}, ${target.y})${input.location ? ` - ${input.location}` : ''}`,
    };
  },
};
