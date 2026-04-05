/**
 * Pixel Art Asset Generator (pngjs only)
 * 16×24px frames, 4 directions × 6 characters
 * Layout: cols=4 (down/left/right/up), rows=6 (one per character)
 * Frame index = spriteIndex * 4 + directionIndex
 */
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'assets', 'sprites');
const TILES_DIR   = path.join(__dirname, '..', 'public', 'assets', 'tiles');
const MAPS_DIR    = path.join(__dirname, '..', 'public', 'assets', 'maps');

const fw = 16, fh = 24; // frame width/height
const COLS = 4;          // directions: down, left, right, up
const ROWS = 6;          // characters

function ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// 6 characters with distinct body colors
const CHARS = [
  { name: '민준(PM)',       shirt: [48, 112, 216],  pants: [30, 40,  80],  hair: [44,  28, 12]  }, // Blue
  { name: '지훈(Dev)',      shirt: [40, 160,  64],  pants: [40, 48,  80],  hair: [176, 72, 24]  }, // Green
  { name: '태호(CEO)',      shirt: [24,  28,  96],  pants: [16, 20,  56],  hair: [160,160,176]  }, // Navy
  { name: '소연(Designer)', shirt: [128, 48, 200],  pants: [48, 40,  64],  hair: [240,208, 64]  }, // Purple
  { name: '현우(QA)',       shirt: [136,136,152],   pants: [32, 40,  56],  hair: [24,  24, 32]  }, // Gray
  { name: '유나(Analyst)',  shirt: [24, 144, 152],  pants: [32, 40,  56],  hair: [24,  16, 24]  }, // Teal
];

const SKIN  = [245, 200, 136];
const WHITE = [255, 255, 255];
const BLACK = [0,   0,   0  ];
const SHOE  = [32,  24,  16 ];

// ──────────────────────────────────────────────
// Low-level pixel helpers
// ──────────────────────────────────────────────
function setPixel(data, W, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= (data.length / 4 / W)) return;
  const i = (y * W + x) * 4;
  data[i]     = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function drawRect(data, W, x, y, w, h, col) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(data, W, x + dx, y + dy, col[0], col[1], col[2]);
}

// ──────────────────────────────────────────────
// Draw one character frame (16×24) into big buffer
// offset: (ox, oy) top-left corner in the spritesheet
// dir: 0=down, 1=left, 2=right, 3=up
// ──────────────────────────────────────────────
function drawCharFrame(data, W, ox, oy, char, dir) {
  const { shirt, pants, hair } = char;

  // Clear to transparent
  for (let dy = 0; dy < fh; dy++)
    for (let dx = 0; dx < fw; dx++)
      setPixel(data, W, ox + dx, oy + dy, 0, 0, 0, 0);

  // --- HAIR (rows 0-3) ---
  drawRect(data, W, ox + 5, oy + 0, 6, 4, hair);

  // --- HEAD (rows 2-9) ---
  // Skin face 6×7
  drawRect(data, W, ox + 5, oy + 2, 6, 7, SKIN);
  // Hair top sides
  setPixel(data, W, ox + 4, oy + 1, hair[0], hair[1], hair[2]);
  setPixel(data, W, ox + 11, oy + 1, hair[0], hair[1], hair[2]);

  // Eyes: direction-dependent
  if (dir === 3) {
    // up: back of head, no face
    drawRect(data, W, ox + 4, oy + 1, 8, 7, hair);
  } else if (dir === 0) {
    // down: eyes visible
    setPixel(data, W, ox + 6, oy + 5, BLACK[0], BLACK[1], BLACK[2]);
    setPixel(data, W, ox + 9, oy + 5, BLACK[0], BLACK[1], BLACK[2]);
  } else if (dir === 1) {
    // left: one eye on right side of face (x+10)
    setPixel(data, W, ox + 7, oy + 5, BLACK[0], BLACK[1], BLACK[2]);
  } else if (dir === 2) {
    // right: one eye on left side of face (x+5)
    setPixel(data, W, ox + 8, oy + 5, BLACK[0], BLACK[1], BLACK[2]);
  }

  // --- NECK (rows 9-10) ---
  drawRect(data, W, ox + 7, oy + 9, 2, 2, SKIN);

  // --- BODY/SHIRT (rows 11-17) ---
  drawRect(data, W, ox + 4, oy + 11, 8, 7, shirt);
  // Shoulder shading
  setPixel(data, W, ox + 4,  oy + 11, Math.max(0, shirt[0]-30), Math.max(0, shirt[1]-30), Math.max(0, shirt[2]-30));
  setPixel(data, W, ox + 11, oy + 11, Math.max(0, shirt[0]-30), Math.max(0, shirt[1]-30), Math.max(0, shirt[2]-30));

  // Arms
  if (dir === 0 || dir === 3) {
    drawRect(data, W, ox + 3,  oy + 12, 1, 5, shirt);
    drawRect(data, W, ox + 12, oy + 12, 1, 5, shirt);
    // Hands
    setPixel(data, W, ox + 3,  oy + 17, SKIN[0], SKIN[1], SKIN[2]);
    setPixel(data, W, ox + 12, oy + 17, SKIN[0], SKIN[1], SKIN[2]);
  } else if (dir === 1) {
    drawRect(data, W, ox + 11, oy + 12, 2, 5, shirt);
    setPixel(data, W, ox + 12, oy + 17, SKIN[0], SKIN[1], SKIN[2]);
  } else if (dir === 2) {
    drawRect(data, W, ox + 3,  oy + 12, 2, 5, shirt);
    setPixel(data, W, ox + 3,  oy + 17, SKIN[0], SKIN[1], SKIN[2]);
  }

  // --- PANTS (rows 18-21) ---
  drawRect(data, W, ox + 5, oy + 18, 6, 4, pants);
  // Leg split
  setPixel(data, W, ox + 7, oy + 20, Math.max(0, pants[0]-20), Math.max(0, pants[1]-20), Math.max(0, pants[2]-20));
  setPixel(data, W, ox + 8, oy + 20, Math.max(0, pants[0]-20), Math.max(0, pants[1]-20), Math.max(0, pants[2]-20));

  // --- SHOES (rows 22-23) ---
  drawRect(data, W, ox + 5, oy + 22, 3, 2, SHOE);
  drawRect(data, W, ox + 8, oy + 22, 3, 2, SHOE);
}

// ──────────────────────────────────────────────
// Build agent spritesheet
// ──────────────────────────────────────────────
function buildAgentSprite() {
  const W = fw * COLS;
  const H = fh * ROWS;
  const png = new PNG({ width: W, height: H, filterType: -1 });
  const data = png.data;

  // Init transparent
  data.fill(0);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ox = col * fw;
      const oy = row * fh;
      drawCharFrame(data, W, ox, oy, CHARS[row], col);
    }
  }

  ensureDir(SPRITES_DIR);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(SPRITES_DIR, 'agent.png'), buf);
  console.log(`[Sprite] agent.png: ${W}×${H}px (${COLS} dirs × ${ROWS} chars, ${fw}×${fh} frames)`);
}

// ──────────────────────────────────────────────
// Build tileset (office-tiles.png)
// 8×8 tile atlas, each tile 16×16
// GID mapping (firstgid=1):
//   GID1=transparent, GID2=floor, GID3=wall, GID4=desk
//   GID5=chair,       GID6=carpet, GID7=window, GID8=door
//   GID9=round_table (row1, col0)
// ──────────────────────────────────────────────
function buildTileset() {
  const TW = 16, TH = 16;
  const W = TW * 8;
  const H = TH * 8;
  const png = new PNG({ width: W, height: H, filterType: -1 });
  const data = png.data;
  data.fill(0);

  function fillTile(tx, ty, col, col2 = null) {
    const ox = tx * TW, oy = ty * TH;
    for (let dy = 0; dy < TH; dy++)
      for (let dx = 0; dx < TW; dx++) {
        const c = (col2 && ((dx + dy) % 2 === 0)) ? col2 : col;
        setPixel(data, W, ox + dx, oy + dy, c[0], c[1], c[2]);
      }
  }

  function borderTile(tx, ty, inner, border) {
    const ox = tx * TW, oy = ty * TH;
    for (let dy = 0; dy < TH; dy++)
      for (let dx = 0; dx < TW; dx++) {
        const onEdge = (dx === 0 || dy === 0 || dx === TW-1 || dy === TH-1);
        const c = onEdge ? border : inner;
        setPixel(data, W, ox + dx, oy + dy, c[0], c[1], c[2]);
      }
  }

  // GID1 (col0): transparent — leave as-is
  // GID2 (col1): floor — warm beige with subtle checker
  fillTile(1, 0, [200, 182, 150], [192, 174, 142]);

  // GID3 (col2): wall — dark navy with highlight edge
  fillTile(2, 0, [18, 28, 56]);
  for (let dx = 0; dx < TW; dx++) {
    setPixel(data, W, 2*TW+dx, 0*TH,      38, 55, 100);
    setPixel(data, W, 2*TW+dx, 0*TH+TH-1, 10, 16, 36);
  }
  for (let dy = 0; dy < TH; dy++) {
    setPixel(data, W, 2*TW,      0*TH+dy, 38, 55, 100);
    setPixel(data, W, 2*TW+TW-1, 0*TH+dy, 10, 16, 36);
  }

  // GID4 (col3): desk — warm wood brown
  fillTile(3, 0, [130, 82, 42]);
  for (let dx = 0; dx < TW; dx++) {
    setPixel(data, W, 3*TW+dx, 0*TH,     90, 55, 25);
    setPixel(data, W, 3*TW+dx, 0*TH+1,   160, 110, 60);
    setPixel(data, W, 3*TW+dx, 0*TH+TH-1, 90, 55, 25);
  }
  for (let dy = 2; dy < TH-1; dy++) {
    setPixel(data, W, 3*TW, 0*TH+dy,      90, 55, 25);
    setPixel(data, W, 3*TW+TW-1, 0*TH+dy, 90, 55, 25);
  }

  // GID5 (col4): chair — dark slate
  borderTile(4, 0, [50, 55, 75], [35, 38, 55]);
  // Seat cushion center
  for (let dy = 3; dy < TH-3; dy++)
    for (let dx = 3; dx < TW-3; dx++)
      setPixel(data, W, 4*TW+dx, 0*TH+dy, 65, 70, 95);

  // GID6 (col5): carpet — dark blue-gray with dot pattern
  fillTile(5, 0, [55, 70, 100], [50, 65, 95]);
  // Small dots
  for (let dy = 2; dy < TH; dy += 4)
    for (let dx = 2; dx < TW; dx += 4)
      setPixel(data, W, 5*TW+dx, 0*TH+dy, 75, 92, 130);

  // GID7 (col6): window — sky blue with cross frame
  fillTile(6, 0, [140, 195, 240]);
  // Frame
  for (let d = 0; d < TW; d++) {
    setPixel(data, W, 6*TW+d,      0*TH,      25, 45, 75);
    setPixel(data, W, 6*TW+d,      0*TH+TH-1, 25, 45, 75);
    setPixel(data, W, 6*TW,        0*TH+d,    25, 45, 75);
    setPixel(data, W, 6*TW+TW-1,   0*TH+d,    25, 45, 75);
  }
  // Cross divider
  for (let d = 1; d < TH-1; d++) {
    setPixel(data, W, 6*TW+TW/2, 0*TH+d, 25, 45, 75);
    setPixel(data, W, 6*TW+d,    0*TH+TH/2, 25, 45, 75);
  }
  // Glint
  setPixel(data, W, 6*TW+3, 0*TH+3, 200, 230, 255);
  setPixel(data, W, 6*TW+4, 0*TH+3, 200, 230, 255);

  // GID8 (col7): door — warm brown with knob
  fillTile(7, 0, [110, 65, 28]);
  for (let dx = 0; dx < TW; dx++) {
    setPixel(data, W, 7*TW+dx, 0*TH, 70, 40, 15);
    setPixel(data, W, 7*TW+dx, 0*TH+TH-1, 70, 40, 15);
  }
  for (let dy = 0; dy < TH; dy++) {
    setPixel(data, W, 7*TW,      0*TH+dy, 70, 40, 15);
    setPixel(data, W, 7*TW+TW-1, 0*TH+dy, 70, 40, 15);
  }
  // Door panel detail
  for (let dy = 3; dy < TH/2-1; dy++)
    for (let dx = 3; dx < TW-3; dx++)
      setPixel(data, W, 7*TW+dx, 0*TH+dy, 130, 80, 38);
  for (let dy = TH/2+1; dy < TH-3; dy++)
    for (let dx = 3; dx < TW-3; dx++)
      setPixel(data, W, 7*TW+dx, 0*TH+dy, 130, 80, 38);
  // Knob
  setPixel(data, W, 7*TW+11, 0*TH+8, 210, 170, 50);
  setPixel(data, W, 7*TW+12, 0*TH+8, 210, 170, 50);

  // GID9 (col0, row1): 원형 테이블 표면 — 이음매 없는 평면 마호가니
  // 여러 타일을 배치해서 하나의 큰 원형 테이블을 구성할 때 사용
  {
    const tx = 0, ty = 1;
    const ox = tx * TW, oy = ty * TH;
    for (let dy = 0; dy < TH; dy++)
      for (let dx = 0; dx < TW; dx++) {
        // 나무결 느낌의 미세한 가로 줄무늬
        const stripe = ((dy * 3 + dx) % 5 === 0) ? -8 : 0;
        const R = 115 + stripe;
        const G = 62 + stripe;
        const B = 28 + stripe;
        setPixel(data, W, ox + dx, oy + dy, R, G, B);
      }
  }

  ensureDir(TILES_DIR);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(TILES_DIR, 'office-tiles.png'), buf);
  console.log(`[Tiles] office-tiles.png: ${W}×${H}px`);
}

// ──────────────────────────────────────────────
// Build Tiled JSON map  (30×20 tiles, firstgid=1)
//
// GID key:
//   0=empty  2=floor  3=wall  4=desk
//   5=chair  6=carpet 7=window 8=door
//
// Layout:
//   y=0      : outer top wall (windows at x=5,10,15,20,25)
//   y=1-7    : [open office left] | [meeting room, carpet] | [CEO office, carpet]
//              CEO left wall at x=21 (y=1-6), door at (21,6)
//              Meeting left wall at x=12 (y=1-4), door at (12,4)
//   y=8-13   : [QA/Analyst desks] | [open corridor] | [server room right]
//   y=14-17  : [kitchen left] | [open space] | [server racks right]
//   y=18     : outer bottom wall (entrance opening at x=14-15)
//   y=19     : outer bottom wall
// ──────────────────────────────────────────────
function buildMap() {
  const MW = 30, MH = 20;

  // ── Floor layer ──────────────────────────────
  const floorData = new Array(MW * MH).fill(2);

  // Carpet in CEO office (x=22-28, y=1-7)
  for (let y = 1; y <= 7; y++)
    for (let x = 22; x <= 28; x++)
      floorData[y * MW + x] = 6;

  // Carpet in meeting room (x=12-20, y=1-7) — 벽 없는 개방형
  for (let y = 1; y <= 7; y++)
    for (let x = 12; x <= 20; x++)
      floorData[y * MW + x] = 6;

  // ── Objects layer ─────────────────────────────
  const objData = new Array(MW * MH).fill(0);

  const setObj = (x, y, gid) => {
    if (x >= 0 && x < MW && y >= 0 && y < MH) objData[y * MW + x] = gid;
  };

  // Outer walls
  for (let x = 0; x < MW; x++) { setObj(x, 0, 3); setObj(x, MH-1, 3); }
  for (let y = 0; y < MH; y++) { setObj(0, y, 3); setObj(MW-1, y, 3); }

  // Windows on top wall
  for (const wx of [5, 10, 15, 20, 25]) setObj(wx, 0, 7);
  // Windows on right outer wall (CEO office side)
  for (const wy of [2, 4, 6]) setObj(MW-1, wy, 7);

  // CEO office inner left wall (x=21, y=1-6)
  for (let y = 1; y <= 6; y++) setObj(21, y, 3);
  setObj(21, 6, 8); // door

  // Meeting room — 벽 제거, 개방형 (카펫으로 영역 구분)

  // ── Desks ────────────────────────────────────
  // PM desk area (top-left)
  setObj(3, 3, 4);   setObj(5, 3, 4);
  setObj(3, 5, 4);   setObj(5, 5, 4);

  // Dev desk area (top-left, adjacent to PM)
  setObj(8, 3, 4);   setObj(10, 3, 4);

  // Meeting room — 큰 원형 테이블 (5×5 다이아몬드, GID9)
  //        15  16  17
  //  y=2:  [T] [T] [T]
  //  y=3:  [T] [T] [T] [T] [T]   ← 14~18
  //  y=4:  [T] [T] [T] [T] [T]
  //  y=5:  [T] [T] [T] [T] [T]
  //  y=6:  [T] [T] [T]
  setObj(15, 2, 9);  setObj(16, 2, 9);  setObj(17, 2, 9);
  setObj(14, 3, 9);  setObj(15, 3, 9);  setObj(16, 3, 9);  setObj(17, 3, 9);  setObj(18, 3, 9);
  setObj(14, 4, 9);  setObj(15, 4, 9);  setObj(16, 4, 9);  setObj(17, 4, 9);  setObj(18, 4, 9);
  setObj(14, 5, 9);  setObj(15, 5, 9);  setObj(16, 5, 9);  setObj(17, 5, 9);  setObj(18, 5, 9);
  setObj(15, 6, 9);  setObj(16, 6, 9);  setObj(17, 6, 9);

  // CEO desk
  setObj(25, 3, 4);

  // QA area (middle-left)
  setObj(3, 9, 4);   setObj(5, 9, 4);

  // Analyst area
  setObj(8, 9, 4);   setObj(10, 9, 4);

  // Designer area (left, lower)
  setObj(3, 13, 4);  setObj(5, 13, 4);

  // Server racks (bottom-right)
  setObj(23, 14, 4); setObj(25, 14, 4); setObj(27, 14, 4);
  setObj(23, 16, 4); setObj(25, 16, 4); setObj(27, 16, 4);

  // Whiteboard (top-center)
  setObj(11, 2, 4);

  // Plant corner (top-left inner)
  setObj(2, 2, 5);   // use chair tile as plant placeholder

  // Entrance opening (bottom wall gap)
  setObj(14, MH-1, 8);
  setObj(15, MH-1, 8);

  const map = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.1',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width: MW,
    height: MH,
    tilewidth: 16,
    tileheight: 16,
    infinite: false,
    nextlayerid: 3,
    nextobjectid: 1,
    tilesets: [{
      firstgid: 1,
      name: 'office-tiles',
      tilewidth: 16,
      tileheight: 16,
      spacing: 0,
      margin: 0,
      columns: 8,
      tilecount: 64,
      image: '../tiles/office-tiles.png',
      imagewidth: 128,
      imageheight: 128,
    }],
    layers: [
      {
        id: 1,
        name: 'floor',
        type: 'tilelayer',
        x: 0, y: 0,
        width: MW,
        height: MH,
        opacity: 1,
        visible: true,
        data: floorData,
      },
      {
        id: 2,
        name: 'objects',
        type: 'tilelayer',
        x: 0, y: 0,
        width: MW,
        height: MH,
        opacity: 1,
        visible: true,
        data: objData,
      },
    ],
  };

  ensureDir(MAPS_DIR);
  fs.writeFileSync(path.join(MAPS_DIR, 'office.json'), JSON.stringify(map, null, 2));
  console.log(`[Map] office.json: ${MW}×${MH} tiles`);
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
buildAgentSprite();
buildTileset();
buildMap();
console.log('Assets generated!');
