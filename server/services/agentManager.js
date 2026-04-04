const EventEmitter = require('events');

const NAMED_LOCATIONS = {
  desk_1: { x: 4, y: 4, label: "Atlas's Desk" },
  desk_2: { x: 8, y: 4, label: "Nova's Desk" },
  desk_3: { x: 23, y: 4, label: "Pixel's Desk" },
  desk_4: { x: 4, y: 11, label: 'Desk 4' },
  desk_5: { x: 8, y: 11, label: 'Desk 5' },
  meeting_room: { x: 15, y: 4, label: 'Meeting Room' },
  kitchen: { x: 26, y: 16, label: 'Kitchen' },
  entrance: { x: 15, y: 18, label: 'Entrance' },
  whiteboard: { x: 15, y: 2, label: 'Whiteboard' },
  plant_corner: { x: 1, y: 1, label: 'Plant Corner' },
  server_area: { x: 26, y: 10, label: 'Server Area' },
};

// Tiles that are not walkable (walls, desks, etc.)
const NON_WALKABLE_TILES = new Set([2, 3, 5, 7, 8, 10, 11]);

class AgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.nextId = 1;
  }

  createAgent(name, role, spriteIndex, position = { x: 15, y: 10 }) {
    const id = `agent_${this.nextId++}`;
    const agent = {
      id,
      name,
      role,
      spriteIndex,
      x: position.x,
      y: position.y,
      state: 'idle',
      currentTask: null,
      conversationHistory: [],
    };
    this.agents.set(id, agent);
    this.emit('agent:spawn', { agent: this.serializeAgent(agent) });
    return agent;
  }

  removeAgent(id) {
    if (this.agents.delete(id)) {
      this.emit('agent:remove', { agentId: id });
      return true;
    }
    return false;
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  getAgentByName(name) {
    for (const agent of this.agents.values()) {
      if (agent.name.toLowerCase() === name.toLowerCase()) return agent;
    }
    return null;
  }

  getAllAgents() {
    return Array.from(this.agents.values()).map(a => this.serializeAgent(a));
  }

  moveAgent(id, x, y) {
    const agent = this.agents.get(id);
    if (!agent) return false;

    // Clamp to map bounds (1-28 for x, 1-18 for y, inside walls)
    x = Math.max(1, Math.min(28, Math.round(x)));
    y = Math.max(1, Math.min(18, Math.round(y)));

    const oldX = agent.x;
    const oldY = agent.y;
    agent.x = x;
    agent.y = y;
    agent.state = 'moving';

    this.emit('agent:move', {
      agentId: id,
      fromX: oldX,
      fromY: oldY,
      x,
      y,
    });

    // Reset to idle after a delay
    setTimeout(() => {
      if (agent.state === 'moving') {
        agent.state = 'idle';
        this.emit('agent:state', { agentId: id, state: 'idle' });
      }
    }, 1500);

    return true;
  }

  setAgentState(id, state, metadata = {}) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    agent.state = state;
    if (metadata.task) agent.currentTask = metadata.task;
    this.emit('agent:state', { agentId: id, state, ...metadata });
    return true;
  }

  speakAgent(id, message, duration = 5000) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    this.emit('agent:speak', { agentId: id, message, duration });
    return true;
  }

  getNamedLocations() {
    return NAMED_LOCATIONS;
  }

  resolveLocation(locationOrCoords) {
    if (typeof locationOrCoords === 'string') {
      const loc = NAMED_LOCATIONS[locationOrCoords];
      return loc ? { x: loc.x, y: loc.y } : null;
    }
    return locationOrCoords;
  }

  getAgentContext(id) {
    const agent = this.agents.get(id);
    if (!agent) return null;

    const otherAgents = Array.from(this.agents.values())
      .filter(a => a.id !== id)
      .map(a => `- ${a.name} (${a.role}): at (${a.x}, ${a.y}), ${a.state}${a.currentTask ? `, working on: ${a.currentTask}` : ''}`);

    const locationList = Object.entries(NAMED_LOCATIONS)
      .map(([key, val]) => `- ${key}: ${val.label} (${val.x}, ${val.y})`)
      .join('\n');

    return {
      agent,
      otherAgents: otherAgents.join('\n'),
      locationList,
    };
  }

  serializeAgent(agent) {
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      spriteIndex: agent.spriteIndex,
      x: agent.x,
      y: agent.y,
      state: agent.state,
      currentTask: agent.currentTask,
    };
  }
}

const agentManager = new AgentManager();
module.exports = { agentManager, AgentManager };
