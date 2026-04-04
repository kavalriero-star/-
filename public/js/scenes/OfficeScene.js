const TILE_SIZE = 16;
const SCALE = 2;

class OfficeScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OfficeScene' });
    this.agentSprites = new Map();
  }

  create() {
    // Create tilemap
    const map = this.make.tilemap({ key: 'office-map' });
    const tileset = map.addTilesetImage('office-tiles', 'tiles');

    // Create layers
    const floorLayer = map.createLayer('floor', tileset, 0, 0);
    const objectsLayer = map.createLayer('objects', tileset, 0, 0);

    floorLayer.setScale(SCALE);
    objectsLayer.setScale(SCALE);

    // Set world bounds
    this.cameras.main.setBounds(0, 0, map.widthInPixels * SCALE, map.heightInPixels * SCALE);

    // Center the camera
    const mapCenterX = (map.widthInPixels * SCALE) / 2;
    const mapCenterY = (map.heightInPixels * SCALE) / 2;
    this.cameras.main.centerOn(mapCenterX, mapCenterY);

    // Background color
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Setup socket event listeners
    const sm = window.socketManager;

    sm.on('sync:state', (data) => {
      // Clear existing sprites
      for (const sprite of this.agentSprites.values()) {
        sprite.destroy();
      }
      this.agentSprites.clear();

      // Create agent sprites
      for (const agent of data.agents) {
        this.createAgentSprite(agent);
      }
    });

    sm.on('agent:move', (data) => {
      const sprite = this.agentSprites.get(data.agentId);
      if (sprite) {
        sprite.moveTo(data.x, data.y);
        sprite.setState('moving');
      }
    });

    sm.on('agent:speak', (data) => {
      const sprite = this.agentSprites.get(data.agentId);
      if (sprite) {
        sprite.showSpeechBubble(data.message, data.duration);
      }
    });

    sm.on('agent:state', (data) => {
      const sprite = this.agentSprites.get(data.agentId);
      if (sprite) {
        sprite.setState(data.state);
      }
    });

    sm.on('agent:spawn', (data) => {
      this.createAgentSprite(data.agent);
    });

    sm.on('agent:remove', (data) => {
      const sprite = this.agentSprites.get(data.agentId);
      if (sprite) {
        sprite.destroy();
        this.agentSprites.delete(data.agentId);
      }
    });

    // Agent selection updates
    if (window.clientAgentManager) {
      window.clientAgentManager.onAgentSelect = (selectedId) => {
        for (const [id, sprite] of this.agentSprites) {
          sprite.setSelected(id === selectedId);
        }
      };
    }

    // Launch UI scene on top
    this.scene.launch('UIScene');

    // Add grid overlay (subtle)
    this.addGridOverlay(map.width, map.height);

    // Request fresh sync (initial sync:state may have fired before this scene was ready)
    sm.requestSync();
  }

  createAgentSprite(agentData) {
    const sprite = new window.AgentSprite(this, agentData);
    this.agentSprites.set(agentData.id, sprite);
    return sprite;
  }

  addGridOverlay(cols, rows) {
    const graphics = this.add.graphics();
    graphics.lineStyle(0.5, 0xffffff, 0.05);
    graphics.setDepth(5);

    for (let x = 0; x <= cols; x++) {
      graphics.lineBetween(x * TILE_SIZE * SCALE, 0, x * TILE_SIZE * SCALE, rows * TILE_SIZE * SCALE);
    }
    for (let y = 0; y <= rows; y++) {
      graphics.lineBetween(0, y * TILE_SIZE * SCALE, cols * TILE_SIZE * SCALE, y * TILE_SIZE * SCALE);
    }
  }
}

window.OfficeScene = OfficeScene;
export default OfficeScene;
