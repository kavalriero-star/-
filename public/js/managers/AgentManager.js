class ClientAgentManager {
  constructor() {
    this.agents = new Map();
    this.selectedAgentId = null;
    this.onAgentUpdate = null;
    this.onAgentSelect = null;
  }

  init(socketManager) {
    socketManager.on('sync:state', (data) => {
      this.agents.clear();
      for (const agent of data.agents) {
        this.agents.set(agent.id, agent);
      }
      this.notifyUpdate();
    });

    socketManager.on('agent:spawn', (data) => {
      this.agents.set(data.agent.id, data.agent);
      this.notifyUpdate();
    });

    socketManager.on('agent:remove', (data) => {
      this.agents.delete(data.agentId);
      if (this.selectedAgentId === data.agentId) {
        this.selectedAgentId = null;
      }
      this.notifyUpdate();
    });

    socketManager.on('agent:move', (data) => {
      const agent = this.agents.get(data.agentId);
      if (agent) {
        agent.x = data.x;
        agent.y = data.y;
        agent.state = 'moving';
        this.notifyUpdate();
      }
    });

    socketManager.on('agent:state', (data) => {
      const agent = this.agents.get(data.agentId);
      if (agent) {
        agent.state = data.state;
        if (data.task !== undefined) agent.currentTask = data.task;
        this.notifyUpdate();
      }
    });
  }

  selectAgent(id) {
    this.selectedAgentId = id;
    if (this.onAgentSelect) this.onAgentSelect(id);
    this.notifyUpdate();
  }

  getSelectedAgent() {
    return this.selectedAgentId ? this.agents.get(this.selectedAgentId) : null;
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  notifyUpdate() {
    if (this.onAgentUpdate) this.onAgentUpdate();
  }
}

window.clientAgentManager = new ClientAgentManager();
export default window.clientAgentManager;
