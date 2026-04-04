class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Loading bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x0f3460, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 15, 320, 30);

    const loadingText = this.add.text(width / 2, height / 2 - 30, '로딩 중...', {
      fontSize: '14px',
      fontFamily: 'Courier New',
      color: '#e94560',
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on('progress', (value) => {
      progressBar.clear();
      progressBar.fillStyle(0xe94560, 1);
      progressBar.fillRect(width / 2 - 155, height / 2 - 10, 310 * value, 20);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Load assets
    this.load.spritesheet('agent', 'assets/sprites/agent.png', {
      frameWidth: 64,
      frameHeight: 96,
    });

    this.load.image('tiles', 'assets/tiles/office-tiles.png');
    this.load.tilemapTiledJSON('office-map', 'assets/maps/office.json');
  }

  create() {
    // Create walk animations for each character (4 characters × 4 directions)
    const dirNames = ['down', 'left', 'right', 'up'];
    for (let i = 0; i < 6; i++) {
      const base = i * 12;
      for (let d = 0; d < 4; d++) {
        const dirBase = base + d * 3;
        this.anims.create({
          key: `agent${i}_walk_${dirNames[d]}`,
          frames: this.anims.generateFrameNumbers('agent', {
            frames: [dirBase, dirBase + 1, dirBase, dirBase + 2],
          }),
          frameRate: 6,
          repeat: -1,
        });
      }
    }

    this.scene.start('OfficeScene');
  }
}

window.BootScene = BootScene;
export default BootScene;
