const SPRITE_COLORS = ['blue', 'green', 'purple', 'orange'];

class AgentInfoPanel {
  constructor() {
    this.listEl = document.getElementById('agent-list');
    this.setupListeners();
  }

  setupListeners() {
    const sm = window.socketManager;
    const cam = window.clientAgentManager;

    sm.on('sync:state', () => this.render());
    sm.on('agent:spawn', () => this.render());
    sm.on('agent:remove', () => this.render());
    sm.on('agent:state', () => this.render());
    sm.on('agent:move', () => this.render());

    if (cam) {
      const originalOnUpdate = cam.onAgentUpdate;
      cam.onAgentUpdate = () => {
        if (originalOnUpdate) originalOnUpdate();
        this.render();
      };
    }
  }

  render() {
    const cam = window.clientAgentManager;
    if (!cam) return;

    const agents = cam.getAllAgents();
    this.listEl.innerHTML = '';

    for (const agent of agents) {
      const card = document.createElement('div');
      card.className = `agent-card${cam.selectedAgentId === agent.id ? ' selected' : ''}`;
      card.addEventListener('click', () => {
        cam.selectAgent(agent.id);
        // Also update the chat selector
        const selector = document.getElementById('target-agent');
        if (selector) selector.value = agent.id;
      });

      const colorClass = SPRITE_COLORS[agent.spriteIndex] || 'blue';

      card.innerHTML = `
        <div class="agent-dot ${colorClass}"></div>
        <div>
          <div class="agent-card-name">${agent.name}</div>
          <div class="agent-card-role">${agent.role}</div>
        </div>
        <div class="agent-card-state ${agent.state}">${this.stateLabel(agent.state)}</div>
      `;

      this.listEl.appendChild(card);
    }
  }

  stateLabel(state) {
    const labels = {
      idle: '대기',
      working: '작업 중',
      moving: '이동 중',
      speaking: '대화 중',
    };
    return labels[state] || state;
  }
}

window.AgentInfoPanel = AgentInfoPanel;
export default AgentInfoPanel;
