class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    // Top status bar showing all agents
    this.agentStatusTexts = new Map();
    this.updateAgentStatus();

    // Title
    this.add.text(10, 8, 'PIXEL OFFICE AI', {
      fontSize: '12px',
      fontFamily: 'Courier New',
      color: '#e94560',
      fontStyle: 'bold',
    }).setDepth(100).setScrollFactor(0);

    // Instructions
    this.add.text(10, this.cameras.main.height - 20, '클릭하여 에이전트 선택 | 채팅으로 명령 전송', {
      fontSize: '10px',
      fontFamily: 'Courier New',
      color: '#ffffff88',
    }).setDepth(100).setScrollFactor(0);

    // Listen for updates
    if (window.clientAgentManager) {
      window.clientAgentManager.onAgentUpdate = () => {
        this.updateAgentStatus();
      };
    }
  }

  updateAgentStatus() {
    // Clear existing
    for (const text of this.agentStatusTexts.values()) {
      text.destroy();
    }
    this.agentStatusTexts.clear();

    if (!window.clientAgentManager) return;

    const agents = window.clientAgentManager.getAllAgents();
    let xOffset = 180;

    for (const agent of agents) {
      const stateColors = {
        idle: '#4ade80',
        working: '#facc15',
        moving: '#60a5fa',
      };
      const color = stateColors[agent.state] || '#ffffff';

      const text = this.add.text(xOffset, 8, `● ${agent.name}`, {
        fontSize: '10px',
        fontFamily: 'Courier New',
        color: color,
      }).setDepth(100).setScrollFactor(0);

      this.agentStatusTexts.set(agent.id, text);
      xOffset += text.width + 15;
    }
  }
}

window.UIScene = UIScene;
export default UIScene;
