const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'assets', 'sprites');
const TILES_DIR = path.join(__dirname, '..', 'public', 'assets', 'tiles');
const MAPS_DIR = path.join(__dirname, '..', 'public', 'assets', 'maps');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function fillRect(png, sx, sy, w, h, r, g, b, a = 255) {
  for (let y = sy; y < sy + h; y++) {
    for (let x = sx; x < sx + w; x++) {
      setPixel(png, x, y, r, g, b, a);
    }
  }
}

// Draw a pixel art character facing a direction
// Frame: 16x24, character centered
function drawAgent(png, offsetX, offsetY, color, direction) {
  const [cr, cg, cb] = color;
  const skin = [255, 220, 177];
  const hair = [cr > 100 ? cr - 80 : 40, cg > 100 ? cg - 80 : 30, cb > 100 ? cb - 80 : 30];
  const shoe = [60, 40, 30];

  // Head (skin) - 6x6 centered at top
  fillRect(png, offsetX + 5, offsetY + 2, 6, 6, ...skin);
  // Hair on top
  fillRect(png, offsetX + 5, offsetY + 1, 6, 2, ...hair);
  // Eyes
  if (direction === 0 || direction === 3) { // down or up
    setPixel(png, offsetX + 6, offsetY + 5, 30, 30, 30);
    setPixel(png, offsetX + 9, offsetY + 5, 30, 30, 30);
  } else if (direction === 1) { // left
    setPixel(png, offsetX + 5, offsetY + 5, 30, 30, 30);
    setPixel(png, offsetX + 7, offsetY + 5, 30, 30, 30);
  } else { // right
    setPixel(png, offsetX + 8, offsetY + 5, 30, 30, 30);
    setPixel(png, offsetX + 10, offsetY + 5, 30, 30, 30);
  }
  // Body (shirt) - 8x7
  fillRect(png, offsetX + 4, offsetY + 8, 8, 7, ...color);
  // Arms
  fillRect(png, offsetX + 2, offsetY + 9, 2, 5, ...color);
  fillRect(png, offsetX + 12, offsetY + 9, 2, 5, ...color);
  // Hands
  fillRect(png, offsetX + 2, offsetY + 14, 2, 1, ...skin);
  fillRect(png, offsetX + 12, offsetY + 14, 2, 1, ...skin);
  // Pants - 8x4
  fillRect(png, offsetX + 4, offsetY + 15, 8, 4, cr > 150 ? 80 : 50, cg > 150 ? 80 : 50, cb > 150 ? 100 : 70);
  // Leg gap
  fillRect(png, offsetX + 7, offsetY + 17, 2, 2, 0, 0, 0, 0);
  // Shoes
  fillRect(png, offsetX + 4, offsetY + 19, 3, 2, ...shoe);
  fillRect(png, offsetX + 9, offsetY + 19, 3, 2, ...shoe);
}

function generateAgentSpritesheet() {
  // 4 agent colors x 4 directions = 16 frames
  // Each frame 16x24, laid out as 4 columns (directions) x 4 rows (colors)
  const cols = 4; // directions: down, left, right, up
  const rows = 4; // agent colors
  const fw = 16, fh = 24;
  const png = new PNG({ width: cols * fw, height: rows * fh, filterType: -1 });

  // Fill transparent
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
  }

  const colors = [
    [70, 130, 220],   // Blue - Project Manager
    [80, 190, 100],   // Green - Developer
    [160, 90, 210],   // Purple - Designer
    [230, 140, 50],   // Orange - extra agent
  ];

  for (let row = 0; row < rows; row++) {
    for (let dir = 0; dir < cols; dir++) {
      drawAgent(png, dir * fw, row * fh, colors[row], dir);
    }
  }

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(SPRITES_DIR, 'agent.png'), buffer);
  console.log('  ✓ agent.png generated');
}

function generateOfficeTiles() {
  // 8x8 tileset grid, each tile 16x16 = 128x128 image
  const tileSize = 16;
  const cols = 8, rows = 8;
  const png = new PNG({ width: cols * tileSize, height: rows * tileSize, filterType: -1 });

  // Fill transparent
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
  }

  function drawTile(tileIndex, drawFn) {
    const tx = (tileIndex % cols) * tileSize;
    const ty = Math.floor(tileIndex / cols) * tileSize;
    drawFn(png, tx, ty, tileSize);
  }

  // Tile 0: Empty/transparent
  // Tile 1: Floor
  drawTile(1, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 210, 200, 180);
    // subtle grid lines
    for (let i = 0; i < s; i++) {
      setPixel(p, tx + i, ty, 195, 185, 165);
      setPixel(p, tx, ty + i, 195, 185, 165);
    }
  });

  // Tile 2: Wall
  drawTile(2, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 120, 130, 150);
    fillRect(p, tx, ty + s - 2, s, 2, 90, 100, 120);
  });

  // Tile 3: Desk top
  drawTile(3, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 160, 120, 80);
    fillRect(p, tx + 1, ty + 1, s - 2, s - 2, 180, 140, 95);
  });

  // Tile 4: Chair
  drawTile(4, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 210, 200, 180); // floor base
    fillRect(p, tx + 3, ty + 3, 10, 10, 80, 80, 90);
    fillRect(p, tx + 4, ty + 4, 8, 8, 100, 100, 110);
  });

  // Tile 5: Computer
  drawTile(5, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 160, 120, 80); // desk surface
    fillRect(p, tx + 3, ty + 2, 10, 8, 40, 40, 50); // monitor
    fillRect(p, tx + 4, ty + 3, 8, 6, 100, 180, 220); // screen
    fillRect(p, tx + 6, ty + 10, 4, 2, 60, 60, 70); // stand
    fillRect(p, tx + 4, ty + 12, 8, 1, 60, 60, 70); // base
  });

  // Tile 6: Plant
  drawTile(6, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 210, 200, 180); // floor
    fillRect(p, tx + 5, ty + 8, 6, 6, 140, 90, 60); // pot
    fillRect(p, tx + 4, ty + 2, 3, 6, 60, 160, 70); // leaf
    fillRect(p, tx + 8, ty + 3, 3, 5, 50, 140, 60); // leaf
    fillRect(p, tx + 6, ty + 1, 3, 4, 70, 180, 80); // leaf
  });

  // Tile 7: Window
  drawTile(7, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 120, 130, 150); // wall
    fillRect(p, tx + 2, ty + 2, 12, 12, 170, 210, 240); // glass
    fillRect(p, tx + 2, ty + 8, 12, 1, 100, 110, 130); // frame h
    fillRect(p, tx + 7, ty + 2, 1, 12, 100, 110, 130); // frame v
  });

  // Tile 8: Whiteboard
  drawTile(8, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 120, 130, 150); // wall
    fillRect(p, tx + 1, ty + 2, 14, 10, 240, 240, 240); // board
    fillRect(p, tx + 1, ty + 2, 14, 1, 180, 180, 180); // border top
    // scribbles
    fillRect(p, tx + 3, ty + 5, 5, 1, 220, 60, 60);
    fillRect(p, tx + 3, ty + 7, 8, 1, 60, 60, 220);
    fillRect(p, tx + 3, ty + 9, 6, 1, 60, 180, 60);
  });

  // Tile 9: Carpet / meeting area
  drawTile(9, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 140, 160, 190);
    for (let i = 0; i < s; i++) {
      setPixel(p, tx + i, ty, 125, 145, 175);
      setPixel(p, tx, ty + i, 125, 145, 175);
    }
  });

  // Tile 10: Kitchen counter
  drawTile(10, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 180, 180, 180);
    fillRect(p, tx + 1, ty + 1, s - 2, s - 2, 200, 200, 200);
    // coffee maker
    fillRect(p, tx + 5, ty + 3, 6, 8, 50, 50, 50);
    fillRect(p, tx + 6, ty + 4, 4, 4, 80, 60, 40);
  });

  // Tile 11: Door
  drawTile(11, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 120, 130, 150); // wall
    fillRect(p, tx + 3, ty + 1, 10, 15, 140, 100, 70); // door
    fillRect(p, tx + 11, ty + 8, 2, 2, 200, 180, 60); // handle
  });

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(TILES_DIR, 'office-tiles.png'), buffer);
  console.log('  ✓ office-tiles.png generated');
}

function generateFurniture() {
  // 4 furniture items, each 32x32, in a 2x2 grid = 64x64
  const fw = 32, fh = 32;
  const png = new PNG({ width: 64, height: 64, filterType: -1 });

  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
  }

  // Item 0: Large desk (top-left)
  fillRect(png, 2, 8, 28, 16, 160, 120, 80);
  fillRect(png, 3, 9, 26, 14, 180, 140, 95);
  fillRect(png, 4, 24, 4, 6, 130, 95, 60);
  fillRect(png, 24, 24, 4, 6, 130, 95, 60);

  // Item 1: Bookshelf (top-right)
  fillRect(png, 34, 2, 28, 28, 140, 100, 65);
  fillRect(png, 35, 3, 26, 6, 200, 60, 60); // red books
  fillRect(png, 35, 10, 26, 6, 60, 120, 200); // blue books
  fillRect(png, 35, 17, 26, 6, 60, 180, 80); // green books
  fillRect(png, 35, 24, 26, 5, 200, 180, 60); // yellow books

  // Item 2: Server rack (bottom-left)
  fillRect(png, 4, 36, 24, 26, 50, 50, 60);
  for (let i = 0; i < 5; i++) {
    fillRect(png, 6, 38 + i * 5, 20, 3, 70, 70, 80);
    setPixel(png, 22, 39 + i * 5, 0, 255, 0); // green LED
    setPixel(png, 24, 39 + i * 5, 255, 160, 0); // orange LED
  }

  // Item 3: Coffee machine (bottom-right)
  fillRect(png, 40, 40, 16, 20, 60, 60, 65);
  fillRect(png, 42, 42, 12, 10, 80, 60, 45);
  fillRect(png, 44, 54, 8, 4, 180, 180, 180); // cup area
  fillRect(png, 46, 55, 4, 3, 240, 240, 240); // cup

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(SPRITES_DIR, 'furniture.png'), buffer);
  console.log('  ✓ furniture.png generated');
}

function generateOfficeMap() {
  // 30x20 tile office map
  const W = 30, H = 20;

  // Legend: 0=empty, 1=floor, 2=wall, 3=desk, 4=chair, 5=computer,
  //         6=plant, 7=window, 8=whiteboard, 9=carpet, 10=kitchen, 11=door

  // Create floor layer (base)
  const floor = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) {
        row.push(2); // walls
      } else {
        row.push(1); // floor
      }
    }
    floor.push(row);
  }

  // Add windows on top wall
  for (let x of [5, 8, 11, 18, 21, 24]) {
    floor[0][x] = 7;
  }
  // Door
  floor[H - 1][14] = 11;
  floor[H - 1][15] = 11;

  // Objects layer (furniture, decorations)
  const objects = Array.from({ length: H }, () => Array(W).fill(0));

  // Meeting area (carpet)
  for (let y = 2; y < 7; y++) {
    for (let x = 12; x < 18; x++) {
      objects[y][x] = 9;
    }
  }

  // Whiteboard near meeting area
  objects[1][14] = 8;
  objects[1][15] = 8;

  // Desk area 1 (Atlas - PM)
  objects[3][3] = 3; objects[3][4] = 5;
  objects[4][3] = 4;

  // Desk area 2 (Nova - Developer)
  objects[3][7] = 3; objects[3][8] = 5;
  objects[4][7] = 4;

  // Desk area 3 (Pixel - Designer)
  objects[3][22] = 3; objects[3][23] = 5;
  objects[4][22] = 4;

  // Extra desk spaces
  objects[10][3] = 3; objects[10][4] = 5;
  objects[11][3] = 4;
  objects[10][7] = 3; objects[10][8] = 5;
  objects[11][7] = 4;

  // Kitchen area (bottom-right)
  objects[16][25] = 10;
  objects[16][26] = 10;
  objects[16][27] = 10;

  // Plants
  objects[1][1] = 6;
  objects[1][W - 2] = 6;
  objects[H - 2][1] = 6;
  objects[H - 2][W - 2] = 6;
  objects[8][15] = 6;

  // Flatten for Tiled format (1-indexed tile IDs)
  const floorData = floor.flat().map(t => t + 1);
  const objectData = objects.flat().map(t => t === 0 ? 0 : t + 1);

  const map = {
    compressionlevel: -1,
    height: H,
    width: W,
    tilewidth: 16,
    tileheight: 16,
    orientation: "orthogonal",
    renderorder: "right-down",
    type: "map",
    version: "1.10",
    infinite: false,
    nextlayerid: 3,
    nextobjectid: 1,
    tilesets: [{
      columns: 8,
      firstgid: 1,
      image: "../tiles/office-tiles.png",
      imagewidth: 128,
      imageheight: 128,
      margin: 0,
      name: "office-tiles",
      spacing: 0,
      tilecount: 64,
      tilewidth: 16,
      tileheight: 16
    }],
    layers: [
      {
        id: 1,
        name: "floor",
        type: "tilelayer",
        visible: true,
        opacity: 1,
        x: 0, y: 0,
        width: W,
        height: H,
        data: floorData
      },
      {
        id: 2,
        name: "objects",
        type: "tilelayer",
        visible: true,
        opacity: 1,
        x: 0, y: 0,
        width: W,
        height: H,
        data: objectData
      }
    ]
  };

  fs.writeFileSync(path.join(MAPS_DIR, 'office.json'), JSON.stringify(map, null, 2));
  console.log('  ✓ office.json map generated');
}

// Main
console.log('🎨 Generating pixel art assets...');
ensureDir(SPRITES_DIR);
ensureDir(TILES_DIR);
ensureDir(MAPS_DIR);

generateAgentSpritesheet();
generateOfficeTiles();
generateFurniture();
generateOfficeMap();

console.log('✅ All assets generated!');
