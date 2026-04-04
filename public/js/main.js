// Initialize everything after DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  // Connect socket
  window.socketManager.connect();

  // Initialize client agent manager
  window.clientAgentManager.init(window.socketManager);

  // Initialize UI panels
  new window.ChatPanel();
  new window.AgentInfoPanel();

  // Start Phaser game
  const config = {
    type: Phaser.AUTO,
    width: 960,
    height: 640,
    parent: 'game-container',
    pixelArt: true,
    backgroundColor: '#0a0a1a',
    scene: [window.BootScene, window.OfficeScene, window.UIScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false,
      },
    },
  };

  const game = new Phaser.Game(config);
});
