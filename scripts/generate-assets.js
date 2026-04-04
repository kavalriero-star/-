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
// tile(0,0)=transparent, tile(1,0)=floor beige, tile(2,0)=wall dark, tile(3,0)=desk wood
// tile(0,1)=chair, tile(1,1)=carpet, tile(2,1)=window, tile(3,1)=door
// ──────────────────────────────────────────────
function buildTileset() {
  const TW = 16, TH = 16;
  const TCOLS = 8, TROWS = 8;
  const W = TW * TCOLS;
  const H = TH * TROWS;
  const png = new PNG({ width: W, height: H, filterType: -1 });
  const data = png.data;
  data.fill(0);

  function tile(tx, ty, col, col2 = null) {
    const ox = tx * TW, oy = ty * TH;
    for (let dy = 0; dy < TH; dy++) {
      for (let dx = 0; dx < TW; dx++) {
        const c = (col2 && ((dx + dy) % 2 === 0)) ? col2 : col;
        setPixel(data, W, ox + dx, oy + dy, c[0], c[1], c[2]);
      }
    }
  }

  // tile(0,0) = transparent (empty)
  // tile(1,0) = floor beige
  tile(1, 0, [210, 190, 160], [200, 180, 150]);
  // tile(2,0) = wall dark blue
  tile(2, 0, [22, 33, 62]);
  // border on wall bottom
  for (let dx = 0; dx < TW; dx++)
    setPixel(data, W, 2 * TW + dx, 0 * TH + TH - 1, 40, 60, 100);
  // tile(3,0) = desk brown wood
  tile(3, 0, [140, 90, 50]);
  for (let dx = 0; dx < TW; dx++) {
    setPixel(data, W, 3 * TW + dx, 0 * TH, 100, 60, 30);
    setPixel(data, W, 3 * TW + dx, 0 * TH + TH - 1, 100, 60, 30);
  }
  // tile(4,0) = chair dark gray
  tile(4, 0, [60, 60, 80]);
  // tile(5,0) = carpet (light blue-gray)
  tile(5, 0, [80, 100, 130], [70, 90, 120]);
  // tile(6,0) = window (light blue)
  tile(6, 0, [160, 200, 240]);
  for (let d = 0; d < TW; d++) {
    setPixel(data, W, 6 * TW + d, 0 * TH,          30, 50, 80);
    setPixel(data, W, 6 * TW + d, 0 * TH + TH - 1, 30, 50, 80);
    setPixel(data, W, 6 * TW + 0, 0 * TH + d,       30, 50, 80);
    setPixel(data, W, 6 * TW + TW - 1, 0 * TH + d,  30, 50, 80);
  }
  // tile(7,0) = door
  tile(7, 0, [120, 70, 30]);
  setPixel(data, W, 7 * TW + 10, 0 * TH + 8, 200, 160, 50);

  ensureDir(TILES_DIR);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(TILES_DIR, 'office-tiles.png'), buf);
  console.log(`[Tiles] office-tiles.png: ${W}×${H}px`);
}

// ──────────────────────────────────────────────
// Build Tiled JSON map
// 30×20 tiles, firstgid=1
// empty=0, floor=2 (tile 1,0), wall=3 (tile 2,0), desk=4 (tile 3,0)
// ──────────────────────────────────────────────
function buildMap() {
  const MW = 30, MH = 20;

  // floor layer: all floor (GID 2)
  const floorData = new Array(MW * MH).fill(2);

  // wall layer: top row walls (GID 3), desks scattered (GID 4)
  const objData = new Array(MW * MH).fill(0);

  // Top wall row
  for (let x = 0; x < MW; x++) objData[x] = 3;
  // Bottom wall row
  for (let x = 0; x < MW; x++) objData[(MH - 1) * MW + x] = 3;
  // Left wall col
  for (let y = 0; y < MH; y++) objData[y * MW] = 3;
  // Right wall col
  for (let y = 0; y < MH; y++) objData[y * MW + MW - 1] = 3;

  // Desk positions (matching server DESK_POSITIONS)
  const deskPositions = [
    [4, 3], [4, 6], [4, 9],
    [10, 3], [10, 6], [10, 9],
    [16, 3], [22, 3],
  ];
  for (const [dx, dy] of deskPositions) {
    if (dy < MH && dx < MW) objData[dy * MW + dx] = 4;
  }

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
