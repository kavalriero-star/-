// ═══════════════════════════════════════════════════════
// Phaser game: scenes, agent sprites, autonomy tick
// ═══════════════════════════════════════════════════════

const TILE_SIZE = 16, SCALE = 2;
const TS = TILE_SIZE * SCALE;

// ── Agent sprite (container) ───────────────────────────
class AgentSprite {
  constructor(scene, agentData) {
    this.scene = scene;
    this.id = agentData.id;
    this.agentData = agentData;
    this.busy = false;
    this.actionTimer = null;
    this.bobTween = null;

    const wx = agentData.x * TS + TS/2;
    const wy = agentData.y * TS + TS;

    this.container = scene.add.container(wx, wy);
    this.container.setDepth(20);

    // shadow
    this.shadow = scene.add.ellipse(0, -1, 18, 6, 0x000000, 0.35);
    this.container.add(this.shadow);

    // sprite
    this.sprite = scene.add.sprite(0, 0, 'agent', agentData.spriteIndex*4 + 3);
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setScale(SCALE);
    this.container.add(this.sprite);

    // selection ring
    this.selectionRect = scene.add.rectangle(0, -24, 36, 50);
    this.selectionRect.setStrokeStyle(2, 0x10b981);
    this.selectionRect.setFillStyle(0x10b981, 0.08);
    this.selectionRect.setVisible(false);
    this.container.add(this.selectionRect);

    // name label
    this.nameLabel = scene.add.text(0, 4, agentData.name, {
      fontSize:'9px', fontFamily:'Pretendard, sans-serif',
      color:'#ffffff', backgroundColor:'#000000aa',
      padding:{x:3, y:1}
    });
    this.nameLabel.setOrigin(0.5, 0);
    this.nameLabel.setResolution(2);
    this.container.add(this.nameLabel);

    // state indicator dot
    this.stateIndicator = scene.add.circle(13, -42, 3.5, 0x4ade80);
    this.stateIndicator.setStrokeStyle(1, 0x000000, 0.4);
    this.container.add(this.stateIndicator);

    // typing icon overlay
    this.actionIcon = scene.add.text(0, -50, '', {
      fontSize:'11px', fontFamily:'Pretendard, sans-serif',
      color:'#ffffff'
    });
    this.actionIcon.setOrigin(0.5, 0.5);
    this.actionIcon.setResolution(2);
    this.actionIcon.setVisible(false);
    this.container.add(this.actionIcon);

    // bubble
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add.text(0, -52, '', {
      fontSize:'10px', fontFamily:'Pretendard, sans-serif',
      color:'#1f2937', wordWrap:{width:120}, align:'center'
    });
    this.bubbleText.setOrigin(0.5, 1);
    this.bubbleText.setResolution(2);
    this.bubbleBg.setVisible(false);
    this.bubbleText.setVisible(false);
    this.container.add(this.bubbleBg);
    this.container.add(this.bubbleText);
    this.speechTimer = null;

    // interaction
    this.sprite.setInteractive({useHandCursor:true});
    this.sprite.on('pointerdown', () => {
      if(window.clientAgentManager) window.clientAgentManager.selectAgent(this.id);
    });
  }

  setFacing(dir){ this.sprite.setFrame(this.agentData.spriteIndex*4 + dir); }

  // Walk along a path — returns Promise that resolves when done
  walkPath(path){
    return new Promise((resolve) => {
      if(!path || path.length===0){ resolve(); return; }
      this.stopMovement();
      const SPD_PX = TS * 5; // px/sec
      let i = 0;
      const step = () => {
        if(i >= path.length){ resolve(); return; }
        const cell = path[i];
        const tx = cell.x*TS + TS/2;
        const ty = cell.y*TS + TS;
        const dx = tx - this.container.x, dy = ty - this.container.y;
        // determine facing
        let dir = 3;
        if(Math.abs(dx) > Math.abs(dy)) dir = dx<0 ? 0 : 1;
        else dir = dy<0 ? 2 : 3;
        this.setFacing(dir);
        const dist = Math.hypot(dx, dy);
        const dur = dist / SPD_PX * 1000;
        this.moveTween = this.scene.tweens.add({
          targets: this.container, x:tx, y:ty,
          duration: dur, ease:'Linear',
          onComplete: () => { i++; step(); }
        });
        // walk bob
        this.bobTween && this.bobTween.stop();
        this.bobTween = this.scene.tweens.add({
          targets: this.sprite, y: -1, duration: 130, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
        });
        // update agent grid coords as we move
        this.agentData.x = cell.x;
        this.agentData.y = cell.y;
      };
      step();
    });
  }

  stopMovement(){
    if(this.moveTween){ this.moveTween.stop(); this.moveTween=null; }
    if(this.bobTween){ this.bobTween.stop(); this.bobTween=null; this.sprite.y=0; }
  }

  // Action animations — plays until stopped
  startAction(kind){
    this.stopAction();
    if(kind==='typing'){
      this.actionIcon.setText('💻'); this.actionIcon.setVisible(true);
      this.actionIcon.y = -52;
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, y:-58, duration:600, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
      });
      this.shoulderTween = this.scene.tweens.add({
        targets: this.sprite, scaleY: SCALE*0.97, duration:200, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
      });
    } else if(kind==='coffee'){
      this.actionIcon.setText('☕'); this.actionIcon.setVisible(true);
      this.actionIcon.y = -50;
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, y:-56, alpha:{from:1,to:0.6}, duration:900, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
      });
    } else if(kind==='speak'){
      this.actionIcon.setText('💬'); this.actionIcon.setVisible(true);
      this.actionIcon.y = -52;
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, scale:{from:0.9,to:1.1}, duration:500, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
      });
    } else if(kind==='whiteboard'){
      this.actionIcon.setText('📝'); this.actionIcon.setVisible(true);
      this.actionIcon.y = -52;
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, x:{from:-3,to:3}, duration:400, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
      });
    } else if(kind==='meeting'){
      this.actionIcon.setText('🗣'); this.actionIcon.setVisible(true);
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, alpha:{from:1,to:0.5}, duration:700, yoyo:true, repeat:-1
      });
    } else if(kind==='thinking'){
      this.actionIcon.setText('💭'); this.actionIcon.setVisible(true);
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, y:{from:-52,to:-58}, duration:1000, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
      });
    } else if(kind==='tired'){
      this.actionIcon.setText('💤'); this.actionIcon.setVisible(true);
      this.bobTween = this.scene.tweens.add({
        targets: this.actionIcon, alpha:{from:1,to:0.4}, duration:1200, yoyo:true, repeat:-1
      });
    }
  }

  // Sit at desk: lower body slightly so character looks seated
  sitDown(){
    this.sprite.y = 6;
    this.shadow.setVisible(false);
  }
  standUp(){
    this.sprite.y = 0;
    this.shadow.setVisible(true);
  }

  // Emotion popups — brief icon above head (!, ?, ♥, …)
  showEmotion(kind, dur=1400){
    const map = { '!':'❗','?':'❓','love':'💖','idea':'💡','angry':'💢','sweat':'💦','happy':'😊','surprise':'❕','sleep':'…zzz' };
    const sym = map[kind] || kind;
    const t = this.scene.add.text(this.container.x, this.container.y-58, sym, {
      fontSize:'14px', fontFamily:'Pretendard, sans-serif'
    });
    t.setOrigin(0.5,1);
    t.setDepth(40);
    t.setResolution(2);
    this.scene.tweens.add({
      targets: t, y: t.y-14, alpha:{from:0,to:1}, scale:{from:0.6,to:1.1},
      duration:280, ease:'Back.easeOut',
      onComplete:()=>{
        this.scene.tweens.add({
          targets:t, alpha:0, y:t.y-6, delay:dur, duration:300,
          onComplete:()=>t.destroy()
        });
      }
    });
  }

  // Greet gesture — quick bow + ! emotion
  greet(){
    this.showEmotion('happy', 1200);
    this.scene.tweens.add({
      targets: this.sprite, y:{from:0,to:-3}, duration:160, yoyo:true, repeat:1, ease:'Sine.easeInOut'
    });
  }
  stopAction(){
    if(this.bobTween){ this.bobTween.stop(); this.bobTween=null; }
    if(this.shoulderTween){ this.shoulderTween.stop(); this.shoulderTween=null; this.sprite.scaleY=SCALE; }
    this.actionIcon.setVisible(false);
    this.actionIcon.x = 0;
    this.actionIcon.y = -52;
    this.actionIcon.alpha = 1;
    this.actionIcon.setScale(1);
    // Stand back up if was sitting
    this.standUp();
  }

  showSpeechBubble(msg, dur=3500){
    if(!window.tweaks || window.tweaks.bubbles === false) return;
    if(this.speechTimer) clearTimeout(this.speechTimer);
    const dm = msg.length>30 ? msg.substring(0,28)+'…' : msg;
    this.bubbleText.setText(dm);
    this.bubbleText.setVisible(true);
    this.bubbleBg.clear();
    const b = this.bubbleText.getBounds();
    const p=4, bw=Math.max(b.width+p*2, 36), bh=b.height+p*2;
    const bx=-bw/2, by=-52-bh;
    this.bubbleBg.fillStyle(0xffffff, 0.96);
    this.bubbleBg.fillRoundedRect(bx, by, bw, bh, 5);
    this.bubbleBg.lineStyle(1, 0x000000, 0.15);
    this.bubbleBg.strokeRoundedRect(bx, by, bw, bh, 5);
    this.bubbleBg.fillTriangle(-3, by+bh, 3, by+bh, 0, by+bh+5);
    this.bubbleBg.setVisible(true);
    this.bubbleText.setY(by+bh-p);
    this.speechTimer = setTimeout(()=>this.hideSpeechBubble(), dur);
  }
  hideSpeechBubble(){
    this.bubbleBg.setVisible(false);
    this.bubbleText.setVisible(false);
    if(this.speechTimer){ clearTimeout(this.speechTimer); this.speechTimer=null; }
  }

  setState(st){
    const c = {
      idle:0x4ade80, working:0xfacc15, moving:0x60a5fa,
      coffee:0xf59e0b, meeting:0xa78bfa, chatting:0xf472b6, toilet:0x9ca3af
    };
    this.stateIndicator.setFillStyle(c[st] || 0x4ade80);
  }
  setSelected(s){ this.selectionRect.setVisible(s); }
  destroy(){
    this.stopMovement(); this.stopAction();
    if(this.speechTimer) clearTimeout(this.speechTimer);
    this.container.destroy();
  }
}
window.AgentSprite = AgentSprite;

// ═══════════════════════════════════════════════════════
// Office Scene (loads assets directly, no separate Boot)
// ═══════════════════════════════════════════════════════
class OfficeScene extends Phaser.Scene {
  constructor(){
    super({key:'OfficeScene'});
    this.agentSprites = new Map();
  }

  preload(){
    const w=this.cameras.main.width, h=this.cameras.main.height;
    const px=this.add.graphics(); px.fillStyle(0x18181b,1); px.fillRect(w/2-160, h/2-15, 320, 30);
    const lt=this.add.text(w/2, h/2-30, 'Pixel Office 로딩 중...', {fontSize:'13px', fontFamily:'Pretendard,sans-serif', color:'#10b981'}).setOrigin(0.5);
    const pb=this.add.graphics();
    this.load.on('progress', v=>{
      pb.clear(); pb.fillStyle(0x10b981, 1); pb.fillRect(w/2-155, h/2-10, 310*v, 20);
    });
    this.load.on('complete', ()=>{ pb.destroy(); px.destroy(); lt.destroy(); });
    this.load.image('tiles', window.OFFICE_ASSETS.generateTileset());
    this.load.spritesheet('agent', window.OFFICE_ASSETS.generateSpritesheet(), {frameWidth:16, frameHeight:24});
  }

  create(){
    const mapData = window.OFFICE_MAP.buildOfficeMap();
    this.mapData = mapData;
    this.walkable = window.OFFICE_MAP.buildWalkable(mapData);

    this.cache.tilemap.add('office-map', {format: Phaser.Tilemaps.Formats.TILED_JSON, data: mapData});
    const map = this.make.tilemap({key:'office-map'});
    const tileset = map.addTilesetImage('office-tiles', 'tiles');
    const fl = map.createLayer('floor', tileset, 0, 0);    fl.setScale(SCALE);
    const ol = map.createLayer('objects', tileset, 0, 0);  ol.setScale(SCALE);

    const W = mapData.width * TS, H = mapData.height * TS;
    this.cameras.main.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Camera fits to view (scale handled by Phaser FIT scale mode at canvas level too)
    this.cameras.main.centerOn(W/2, H/2);

    // Subtle grid
    const g = this.add.graphics();
    g.lineStyle(0.4, 0xffffff, 0.04);
    g.setDepth(5);
    for(let x=0; x<=mapData.width; x++) g.lineBetween(x*TS, 0, x*TS, H);
    for(let y=0; y<=mapData.height; y++) g.lineBetween(0, y*TS, W, y*TS);

    // ── Environment: sun beams from windows ──
    const beams = this.add.graphics();
    beams.setDepth(7);
    beams.setBlendMode(Phaser.BlendModes.ADD);
    this.sunBeams = beams;
    const drawBeams = () => {
      beams.clear();
      const phase = window.OfficeClock.getPhase();
      if(phase === 'night') return;
      const alpha = phase === 'dusk' ? 0.10 : 0.18;
      const tint = phase === 'dusk' ? 0xffaa66 : 0xfff2cc;
      // Top windows beam down
      [4,7,11,18,22,27].forEach(wx => {
        const x0 = wx*TS, y0 = 0;
        beams.fillStyle(tint, alpha);
        beams.beginPath();
        beams.moveTo(x0, y0); beams.lineTo(x0+TS, y0);
        beams.lineTo(x0+TS+60, y0+220); beams.lineTo(x0-60, y0+220);
        beams.closePath(); beams.fillPath();
      });
      // Left side windows beam right
      [3,6,10,14,17,20,23].forEach(wy => {
        const x0 = 0, y0 = wy*TS;
        beams.fillStyle(tint, alpha*0.7);
        beams.beginPath();
        beams.moveTo(x0, y0); beams.lineTo(x0, y0+TS);
        beams.lineTo(x0+180, y0+TS+50); beams.lineTo(x0+180, y0-50);
        beams.closePath(); beams.fillPath();
      });
    };
    drawBeams();
    this.time.addEvent({ delay:3000, callback:drawBeams, loop:true });

    // ── Floating dust particles ──
    const dust = this.add.graphics();
    dust.setDepth(8);
    this.dustParticles = [];
    for(let i=0;i<40;i++){
      this.dustParticles.push({
        x: Math.random()*W, y: Math.random()*H,
        vx: (Math.random()-0.5)*0.3, vy: -0.1-Math.random()*0.2,
        s: 0.5+Math.random()*1.2, a: 0.3+Math.random()*0.4,
      });
    }
    this.events.on('update', () => {
      dust.clear();
      for(const p of this.dustParticles){
        p.x += p.vx; p.y += p.vy;
        if(p.y < 0){ p.y = H; p.x = Math.random()*W; }
        if(p.x < 0) p.x = W; if(p.x > W) p.x = 0;
        dust.fillStyle(0xfff8e0, p.a*0.4);
        dust.fillCircle(p.x, p.y, p.s);
      }
    });

    // ── Monitor glow flicker (on desks) ──
    const monitorGlow = this.add.graphics();
    monitorGlow.setDepth(9);
    monitorGlow.setBlendMode(Phaser.BlendModes.ADD);
    this.time.addEvent({delay:200, loop:true, callback: () => {
      monitorGlow.clear();
      // Find all desk monitors (GID 27, 28, 35) on map
      const obj = mapData.layers.find(l=>l.name==='objects').data;
      for(let y=0; y<mapData.height; y++) for(let x=0; x<mapData.width; x++){
        const g = obj[y*mapData.width+x];
        if(g===27||g===28||g===35){
          const a = 0.18 + Math.random()*0.06;
          monitorGlow.fillStyle(0x88ccff, a);
          monitorGlow.fillCircle(x*TS+TS/2, y*TS+TS/2, 14);
        }
      }
    }});

    // Room labels (faint)
    this.roomLabels = [];
    for(const key of Object.keys(window.OFFICE_MAP.ROOMS)){
      const r = window.OFFICE_MAP.ROOMS[key];
      const cx = (r.x1 + r.x2)/2 * TS + TS/2;
      const cy = r.y1 * TS + 6;
      const t = this.add.text(cx, cy, r.label, {
        fontSize:'9px', fontFamily:'Pretendard, sans-serif',
        color:'#ffffff', backgroundColor:'#00000066',
        padding:{x:4,y:2}
      });
      t.setOrigin(0.5, 0);
      t.setResolution(2);
      t.setDepth(8);
      t.setAlpha(0.55);
      this.roomLabels.push(t);
    }

    // Drag camera
    this.input.on('pointerdown', (p)=>{
      if(p.target && p.target !== this.cameras.main) return;
      this.dragStart = {x:p.x, y:p.y, camX:this.cameras.main.scrollX, camY:this.cameras.main.scrollY};
    });
    this.input.on('pointermove', (p)=>{
      if(!p.isDown || !this.dragStart) return;
      this.cameras.main.scrollX = this.dragStart.camX - (p.x - this.dragStart.x);
      this.cameras.main.scrollY = this.dragStart.camY - (p.y - this.dragStart.y);
    });
    this.input.on('pointerup', ()=>{ this.dragStart=null; });
    // Wheel zoom
    this.input.on('wheel', (p, _o, _dx, dy) => {
      const z = this.cameras.main.zoom;
      const nz = Phaser.Math.Clamp(z + (dy>0?-0.1:0.1), 0.4, 2);
      this.cameras.main.setZoom(nz);
    });

    // Spawn agents
    for(const a of window.OFFICE_AGENTS.AGENTS_DATA){
      const s = new AgentSprite(this, a);
      this.agentSprites.set(a.id, s);
    }

    // Agent select handler
    if(window.clientAgentManager){
      window.clientAgentManager.onAgentSelect = sid => {
        for(const [id,s] of this.agentSprites) s.setSelected(id===sid);
        // center on selected
        const ag = window.OFFICE_AGENTS.AGENTS_DATA.find(a=>a.id===sid);
        if(ag) this.cameras.main.pan(ag.x*TS+TS/2, ag.y*TS+TS, 600, 'Sine.easeInOut');
        if(window.updateAgentDetail) window.updateAgentDetail(sid);
      };
    }

    // Sync state to client manager
    window.clientAgentManager.syncFromAgents(window.OFFICE_AGENTS.AGENTS_DATA);

    // Autonomy tick
    this.time.addEvent({
      delay: 2500, callback: () => this.tickAutonomy(), loop: true
    });

    // Start clock
    window.OfficeClock.start(this);
  }

  // ── Autonomy ─────────────────────────────────────────
  tickAutonomy(){
    const tw = window.tweaks || {};
    const ctx = {
      hour: window.OfficeClock.hour,
      autonomyEnabled: tw.autonomy !== false,
      busyAgents: window.busyAgentSet || new Set(),
    };

    for(const a of window.OFFICE_AGENTS.AGENTS_DATA){
      const sprite = this.agentSprites.get(a.id);
      if(!sprite || sprite.busy) continue;

      // Energy decay
      if(a.behavior === 'desk') a.energy = Math.max(0, a.energy - 1.5);
      else if(a.behavior === 'lounge' || a.behavior === 'balcony') a.energy = Math.min(100, a.energy + 4);

      // Tired indicator
      if(a.energy < 25 && a.behavior==='desk' && Math.random()<0.3) {
        sprite.startAction('tired');
        setTimeout(()=>sprite.stopAction(), 1500);
      }

      const newBh = window.OFFICE_AGENTS.chooseBehavior(a, ctx);
      if(!newBh || newBh === a.behavior) continue;

      this.assignBehavior(a, newBh);
    }
    if(window.renderAgentCards) window.renderAgentCards();
  }

  async assignBehavior(agent, behavior){
    const sprite = this.agentSprites.get(agent.id);
    if(!sprite) return;
    const occupied = window.OFFICE_AGENTS.buildOccupancy(agent.id);
    const target = window.OFFICE_AGENTS.targetForBehavior(agent, behavior, occupied);
    if(!target) return;

    sprite.busy = true;
    agent.target = target;
    agent.behavior = behavior;
    agent.state = 'moving';
    sprite.setState('moving');

    // Path
    const path = window.OFFICE_AGENTS.findPath(this.walkable, this.mapData.width, this.mapData.height, agent.x, agent.y, target.x, target.y);
    if(path){
      sprite.stopAction();
      await sprite.walkPath(path);
    }
    sprite.stopMovement();
    agent.x = target.x; agent.y = target.y;
    agent.target = null;

    // Set state + action
    const st = window.OFFICE_AGENTS.stateForBehavior(behavior);
    agent.state = st;
    sprite.setState(st);

    // Face desk monitor / etc
    if(behavior === 'desk'){
      const desk = window.OFFICE_MAP.DESKS[agent.homeDesk];
      sprite.setFacing(desk.faceDir != null ? desk.faceDir : 2);
      sprite.sitDown();
      sprite.startAction('typing');
      // occasional eureka / frustration during work
      if(window.OFFICE_AGENTS.chance(0.12))
        setTimeout(()=>sprite.showEmotion(window.OFFICE_AGENTS.pickRandom(['idea','!','sweat','?'])), 800+Math.random()*2000);
    } else if(behavior === 'lounge'){
      sprite.setFacing(3);
      sprite.startAction('coffee');
      // chance to chat with someone in lounge
      if(window.OFFICE_AGENTS.chance(0.5)){
        const phrases = ['오늘 점심 뭐 먹었어요?','커피 한 잔의 여유 ☕','회의 길었네요…','이번 주 마감 가능할까?','벌써 금요일!','와 날씨 좋다','이 기능 어떻게 풀까요?','주말 잘 보내세요 🙌','업무 진척 어때요?','오늘 컨디션 좋네요'];
        sprite.showSpeechBubble(window.OFFICE_AGENTS.pickRandom(phrases), 3000);
      }
    } else if(behavior === 'balcony'){
      sprite.setFacing(2);
      sprite.startAction('coffee');
      if(window.OFFICE_AGENTS.chance(0.4))
        sprite.showSpeechBubble(window.OFFICE_AGENTS.pickRandom(['바람 쐬는 중 🍃','상쾌하다 ✨','잠깐 환기 좀','경치 좋네요']), 2500);
    } else if(behavior === 'whiteboard'){
      sprite.setFacing(2);
      sprite.startAction('whiteboard');
      if(window.OFFICE_AGENTS.chance(0.3))
        sprite.showSpeechBubble(window.OFFICE_AGENTS.pickRandom(['이 흐름이 어떨까요?','음… 다시 그려볼게요','여기가 핵심이에요','아 이제 보이네!']), 2800);
    } else if(behavior === 'toilet'){
      sprite.setFacing(3);
    } else if(behavior === 'meeting'){
      sprite.setFacing(3);
      sprite.sitDown();
      sprite.startAction('meeting');
    } else if(behavior === 'wandering'){
      sprite.setFacing(3);
      // brief speak + greet gesture
      if(window.OFFICE_AGENTS.chance(0.4))
        sprite.showSpeechBubble(window.OFFICE_AGENTS.pickRandom(['👋 안녕하세요','수고하세요!','방금 그 보고서 봤어요','다들 화이팅!','잠깐 산책 중','오늘도 평화롭다']), 2200);
      if(window.OFFICE_AGENTS.chance(0.3)) sprite.greet();
    }

    sprite.busy = false;
    if(window.renderAgentCards) window.renderAgentCards();
    if(window.clientAgentManager.selectedAgentId === agent.id && window.updateAgentDetail)
      window.updateAgentDetail(agent.id);
  }

  // Forced move (for chain-of-command scripted scenes)
  async forceMove(agentId, target, opts={}){
    const a = window.OFFICE_AGENTS.AGENTS_DATA.find(x=>x.id===agentId);
    const sprite = this.agentSprites.get(agentId);
    if(!a || !sprite) return;
    if(opts.haltAction !== false) sprite.stopAction();
    a.state = 'moving'; sprite.setState('moving');
    const path = window.OFFICE_AGENTS.findPath(this.walkable, this.mapData.width, this.mapData.height, a.x, a.y, target.x, target.y);
    if(path) await sprite.walkPath(path);
    sprite.stopMovement();
    a.x = target.x; a.y = target.y;
    if(opts.facing != null) sprite.setFacing(opts.facing);
    if(opts.afterState){ a.state = opts.afterState; sprite.setState(opts.afterState); }
    if(opts.afterAction) sprite.startAction(opts.afterAction);
  }

  showSpeech(agentId, msg, dur){
    const sprite = this.agentSprites.get(agentId);
    if(sprite) sprite.showSpeechBubble(msg, dur);
  }
}

// ═══════════════════════════════════════════════════════
// Office Clock — runs the 9-to-late simulated workday
// ═══════════════════════════════════════════════════════
const OfficeClock = {
  hour: 9, minute: 0,
  speedMult: 2,        // tweak: time speed (1x = 1 minute / sec)
  manualLighting: 'auto',
  start(scene){
    this.scene = scene;
    setInterval(() => this.tick(), 1000);
    this.applyLighting();
  },
  tick(){
    const tw = window.tweaks || {};
    const sm = (tw.speed != null) ? tw.speed : this.speedMult;
    this.minute += sm;
    while(this.minute >= 60){ this.minute -= 60; this.hour = (this.hour+1) % 24; }
    this.applyLighting();
    this.updateDisplay();
  },
  updateDisplay(){
    const el = document.getElementById('clock-time');
    if(el) el.textContent = `${String(this.hour).padStart(2,'0')}:${String(Math.floor(this.minute)).padStart(2,'0')}`;
    const phaseEl = document.getElementById('clock-phase');
    if(phaseEl) phaseEl.textContent = this.getPhaseLabel();
  },
  getPhaseLabel(){
    const h = this.hour;
    if(h<7) return '새벽';
    if(h<12) return '아침';
    if(h<14) return '점심';
    if(h<18) return '오후';
    if(h<21) return '저녁';
    return '야근';
  },
  getPhase(){
    const tw = window.tweaks || {};
    const lt = tw.lighting || 'auto';
    if(lt !== 'auto') return lt;
    const h = this.hour;
    if(h>=7 && h<17) return 'day';
    if(h>=17 && h<19) return 'dusk';
    return 'night';
  },
  applyLighting(){
    const overlay = document.getElementById('tone-overlay');
    if(!overlay) return;
    const phase = this.getPhase();
    const map = {
      day:   'rgba(255,255,255,0)',
      dusk:  'rgba(220,140,80,0.32)',
      night: 'rgba(40,55,120,0.55)',
    };
    overlay.style.background = map[phase] || 'transparent';
  }
};
window.OfficeClock = OfficeClock;
window.OfficeScene = OfficeScene;
