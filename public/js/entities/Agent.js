const TILE_SIZE = 16;
const SCALE = 2;
const DIR_NAMES = ['down', 'left', 'right', 'up'];

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

    // Sprite (16×24 pixel art, SCALE=2, frame = spriteIndex*4 + dirIndex)
    // dir 3 = up: 책상 쪽을 바라보는 초기 방향
    this.sprite = scene.add.sprite(0, 0, 'agent', agentData.spriteIndex * 4 + 3);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(SCALE);
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

    // State indicator dot
    this.stateIndicator = scene.add.circle(12, -40, 4, 0x4ade80);
    this.stateIndicator.setStrokeStyle(1, 0x000000, 0.3);
    this.container.add(this.stateIndicator);

    // Speech bubble (hidden by default)
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -52, '', {
      fontSize: '9px',
      fontFamily: 'Courier New',
      color: '#000000',
      wordWrap: { width: 100 },
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
    this.selectionRect = scene.add.rectangle(0, -24, 34, 48);
    this.selectionRect.setStrokeStyle(2, 0xe94560);
    this.selectionRect.setFillStyle(0xe94560, 0.1);
    this.selectionRect.setVisible(false);
    this.container.add(this.selectionRect);
  }

  moveTo(x, y) {
    const targetX = x * TILE_SIZE * SCALE;
    const targetY = y * TILE_SIZE * SCALE;

    if (this.moveTween) {
      this.moveTween.stop();
      this.moveTween = null;
    }
    if (this.moveTween2) {
      this.moveTween2.stop();
      this.moveTween2 = null;
    }

    const SPEED = TILE_SIZE * SCALE * 4;

    const setDir = (dir) => {
      this.sprite.setFrame(this.agentData.spriteIndex * 4 + dir);
    };

    const fromX = this.container.x;
    const fromY = this.container.y;
    const dx = targetX - fromX;
    const dy = targetY - fromY;

    const xDir = dx < 0 ? 1 : 2; // left : right
    const yDir = dy < 0 ? 3 : 0; // up : down
    const xDuration = (Math.abs(dx) / SPEED) * 1000;
    const yDuration = (Math.abs(dy) / SPEED) * 1000;

    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;

    if (Math.abs(dx) > 2) {
      setDir(xDir);
      this.moveTween = this.scene.tweens.add({
        targets: this.container,
        x: targetX,
        duration: xDuration,
        ease: 'Linear',
        onComplete: () => {
          if (Math.abs(dy) > 2) {
            setDir(yDir);
            this.moveTween2 = this.scene.tweens.add({
              targets: this.container,
              y: targetY,
              duration: yDuration,
              ease: 'Linear',
              onComplete: () => setDir(yDir),
            });
          } else {
            setDir(xDir);
          }
        },
      });
    } else {
      setDir(yDir);
      this.moveTween = this.scene.tweens.add({
        targets: this.container,
        y: targetY,
        duration: yDuration,
        ease: 'Linear',
        onComplete: () => setDir(yDir),
      });
    }
  }

  showSpeechBubble(message, duration = 5000) {
    if (this.speechTimer) {
      clearTimeout(this.speechTimer);
    }

    const maxLen = 60;
    const displayMsg = message.length > maxLen ? message.substring(0, maxLen - 3) + '...' : message;

    this.bubbleText.setText(displayMsg);
    this.bubbleText.setVisible(true);

    this.bubbleBg.clear();
    const bounds = this.bubbleText.getBounds();
    const padding = 5;
    const bw = Math.max(bounds.width + padding * 2, 40);
    const bh = bounds.height + padding * 2;
    const bx = -bw / 2;
    const by = -52 - bh;

    this.bubbleBg.fillStyle(0xffffff, 0.95);
    this.bubbleBg.fillRoundedRect(bx, by, bw, bh, 4);
    this.bubbleBg.fillTriangle(
      -3, by + bh,
      3, by + bh,
      0, by + bh + 5
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
