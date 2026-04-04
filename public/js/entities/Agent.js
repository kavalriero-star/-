const TILE_SIZE = 16;
const SCALE = 2;
const COLORS = ['blue', 'green', 'purple', 'orange'];

class AgentSprite {
  constructor(scene, agentData) {
    this.scene = scene;
    this.id = agentData.id;
    this.agentData = agentData;

    const worldX = agentData.x * TILE_SIZE * SCALE;
    const worldY = agentData.y * TILE_SIZE * SCALE;

    // Container for all agent visuals
    this.container = scene.add.container(worldX, worldY);
    this.container.setDepth(10);

    // Sprite
    this.sprite = scene.add.sprite(0, 0, 'agent', agentData.spriteIndex * 4);
    this.sprite.setScale(SCALE);
    this.sprite.setOrigin(0.5, 1);
    this.container.add(this.sprite);

    // Name label
    this.nameLabel = scene.add.text(0, 4, agentData.name, {
      fontSize: '10px',
      fontFamily: 'Courier New',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 1 },
    });
    this.nameLabel.setOrigin(0.5, 0);
    this.container.add(this.nameLabel);

    // State indicator
    this.stateIndicator = scene.add.circle(12, -40, 4, 0x4ade80);
    this.container.add(this.stateIndicator);

    // Speech bubble (hidden by default)
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -65, '', {
      fontSize: '9px',
      fontFamily: 'Courier New',
      color: '#000000',
      wordWrap: { width: 140 },
      align: 'center',
    });
    this.bubbleText.setOrigin(0.5, 1);
    this.bubbleBg.setVisible(false);
    this.bubbleText.setVisible(false);
    this.container.add(this.bubbleBg);
    this.container.add(this.bubbleText);

    this.speechTimer = null;

    // Interactive
    this.sprite.setInteractive({ useHandCursor: true });
    this.sprite.on('pointerdown', () => {
      if (window.clientAgentManager) {
        window.clientAgentManager.selectAgent(this.id);
      }
    });

    // Selection highlight
    this.selectionRect = scene.add.rectangle(0, -16, 20 * SCALE, 28 * SCALE);
    this.selectionRect.setStrokeStyle(2, 0xe94560);
    this.selectionRect.setFillStyle(0xe94560, 0.1);
    this.selectionRect.setVisible(false);
    this.container.add(this.selectionRect);
  }

  moveTo(x, y) {
    const targetX = x * TILE_SIZE * SCALE;
    const targetY = y * TILE_SIZE * SCALE;

    // Determine direction for sprite frame
    const dx = targetX - this.container.x;
    const dy = targetY - this.container.y;
    let dir = 0; // down
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx < 0 ? 1 : 2; // left or right
    } else {
      dir = dy < 0 ? 3 : 0; // up or down
    }
    this.sprite.setFrame(this.agentData.spriteIndex * 4 + dir);

    // Tween movement
    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      y: targetY,
      duration: 800,
      ease: 'Power2',
      onComplete: () => {
        this.sprite.setFrame(this.agentData.spriteIndex * 4); // face down when idle
      },
    });
  }

  showSpeechBubble(message, duration = 5000) {
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
    }

    const maxLen = 60;
    const displayMsg = message.length > maxLen ? message.substring(0, maxLen - 3) + '...' : message;

    this.bubbleText.setText(displayMsg);
    this.bubbleText.setVisible(true);

    // Draw bubble background
    this.bubbleBg.clear();
    const bounds = this.bubbleText.getBounds();
    const padding = 6;
    const bw = Math.max(bounds.width + padding * 2, 40);
    const bh = bounds.height + padding * 2;
    const bx = -bw / 2;
    const by = -65 - bh;

    this.bubbleBg.fillStyle(0xffffff, 0.95);
    this.bubbleBg.fillRoundedRect(bx, by, bw, bh, 6);
    // Pointer triangle
    this.bubbleBg.fillTriangle(
      -4, by + bh,
      4, by + bh,
      0, by + bh + 6
    );
    this.bubbleBg.setVisible(true);

    this.bubbleText.setY(by + bh - padding);

    this.speechTimer = setTimeout(() => {
      this.hideSpeechBubble();
    }, duration);
  }

  hideSpeechBubble() {
    this.bubbleBg.setVisible(false);
    this.bubbleText.setVisible(false);
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
      this.speechTimer = null;
    }
  }

  setState(state) {
    const colors = {
      idle: 0x4ade80,
      working: 0xfacc15,
      moving: 0x60a5fa,
      speaking: 0xf472b6,
    };
    this.stateIndicator.setFillStyle(colors[state] || 0x4ade80);
  }

  setSelected(selected) {
    this.selectionRect.setVisible(selected);
  }

  update(agentData) {
    this.agentData = agentData;
  }

  destroy() {
    if (this.speechTimer) clearTimeout(this.speechTimer);
    this.container.destroy();
  }
}

window.AgentSprite = AgentSprite;
export default AgentSprite;
