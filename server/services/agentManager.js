const EventEmitter = require('events');

const NAMED_LOCATIONS = {
  desk_1:       { x: 4,  y: 4,  label: 'PM 책상 (민준)' },
  desk_2:       { x: 9,  y: 4,  label: '개발자 책상 (지훈)' },
  desk_3:       { x: 4,  y: 13, label: '디자이너 책상 (소연)' },
  desk_4:       { x: 4,  y: 10, label: 'QA 책상 (현우)' },
  desk_5:       { x: 9,  y: 10, label: '분석가 책상 (유나)' },
  ceo_office:   { x: 25, y: 4,  label: 'CEO 집무실 (태호)' },
  meeting_room: { x: 16, y: 5,  label: '미팅룸' },
  kitchen:      { x: 4,  y: 16, label: '키친/휴게실' },
  entrance:     { x: 15, y: 17, label: '입구' },
  whiteboard:   { x: 11, y: 3,  label: '화이트보드' },
  plant_corner: { x: 2,  y: 2,  label: '화분 코너' },
  server_area:  { x: 25, y: 15, label: '서버룸' },
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

  // 특정 에이전트들을 지정 위치로 집합
  gatherAgents(agentIds, location) {
    const loc = this.resolveLocation(location);
    if (!loc) return;
    // 미팅룸(15,6) 주변 고정 좌표 - 겹치지 않게
    const seats = [
      { x: 13, y: 7 },
      { x: 15, y: 7 },
      { x: 17, y: 7 },
      { x: 14, y: 9 },
      { x: 16, y: 9 },
    ];
    agentIds.forEach((id, i) => {
      const pos = seats[i % seats.length];
      this.moveAgent(id, pos.x, pos.y);
    });
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
