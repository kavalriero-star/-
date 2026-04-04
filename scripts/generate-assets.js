const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'assets', 'sprites');
const TILES_DIR = path.join(__dirname, '..', 'public', 'assets', 'tiles');
const MAPS_DIR = path.join(__dirname, '..', 'public', 'assets', 'maps');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ========== Drawing Helpers ==========

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r; png.data[idx + 1] = g; png.data[idx + 2] = b; png.data[idx + 3] = a;
}

function getAlpha(png, x, y) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return 0;
  return png.data[((png.width * y + x) << 2) + 3];
}

function fillRect(png, sx, sy, w, h, r, g, b, a = 255) {
  for (let y = sy; y < sy + h; y++)
    for (let x = sx; x < sx + w; x++)
      setPixel(png, x, y, r, g, b, a);
}

function clearRect(png, sx, sy, w, h) {
  for (let y = sy; y < sy + h; y++)
    for (let x = sx; x < sx + w; x++) {
      if (x >= 0 && x < png.width && y >= 0 && y < png.height) {
        const idx = (png.width * y + x) << 2;
        png.data[idx] = 0; png.data[idx + 1] = 0; png.data[idx + 2] = 0; png.data[idx + 3] = 0;
      }
    }
}

function fillEllipse(png, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++)
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0)
        setPixel(png, cx + dx, cy + dy, r, g, b, a);
}

function addOutline(png, ox, oy, fw, fh, or_, og, ob) {
  const alpha = new Uint8Array(fw * fh);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++)
      alpha[y * fw + x] = getAlpha(png, ox + x, oy + y);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++)
      if (alpha[y * fw + x] === 0) {
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]])
          if (nx >= 0 && nx < fw && ny >= 0 && ny < fh && alpha[ny * fw + nx] > 0) {
            setPixel(png, ox + x, oy + y, or_, og, ob); break;
          }
      }
}

function flipFrameH(png, srcX, srcY, dstX, dstY, fw, fh) {
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      const si = (png.width * (srcY + y) + (srcX + fw - 1 - x)) << 2;
      const di = (png.width * (dstY + y) + (dstX + x)) << 2;
      png.data[di] = png.data[si]; png.data[di + 1] = png.data[si + 1];
      png.data[di + 2] = png.data[si + 2]; png.data[di + 3] = png.data[si + 3];
    }
}

function clearPng(png) {
  for (let i = 0; i < png.data.length; i += 4)
    png.data[i] = png.data[i + 1] = png.data[i + 2] = png.data[i + 3] = 0;
}

// ========== HD Character Palettes - 6 Korean Roles (48x72) ==========
// Row 0: 민준 (PM)       - 파란 비즈니스 셔츠, 안경, 갈색 단발
// Row 1: 지훈 (Dev)      - 초록 후드티, 헤드폰, 두꺼운 안경, 주황 헤어
// Row 2: 태호 (CEO)      - 네이비 정장, 빨간 넥타이, 은발
// Row 3: 소연 (Designer) - 보라색 탑, 금발 밥컷
// Row 4: 현우 (QA)       - 회색 폴로셔츠, 검은 헤어
// Row 5: 유나 (Analyst)  - 청록 블레이저, 검은 밥컷

const PALETTES = [
  { // 민준 (PM) spriteIndex=0
    skin: [255, 220, 185], skinS: [235, 190, 155],
    hair: [75, 52, 30], hairH: [108, 78, 50], hairD: [50, 34, 18],
    eye: [38, 58, 132], eyeW: [240, 242, 255],
    mouth: [200, 118, 118],
    shirt: [68, 128, 222], shirtH: [108, 165, 250], shirtS: [44, 94, 175],
    pants: [54, 58, 78], pantsS: [40, 42, 60],
    shoe: [46, 36, 30], shoeH: [76, 60, 50],
    tie: null, glassesC: [55, 42, 25], headphonesC: null, hoodie: false,
    hairStyle: 0,
  },
  { // 지훈 (Dev) spriteIndex=1
    skin: [255, 220, 185], skinS: [235, 190, 155],
    hair: [178, 90, 46], hairH: [215, 128, 75], hairD: [135, 66, 30],
    eye: [48, 132, 66], eyeW: [240, 255, 240],
    mouth: [200, 118, 118],
    shirt: [58, 172, 82], shirtH: [88, 208, 112], shirtS: [38, 132, 58],
    pants: [60, 66, 88], pantsS: [46, 50, 70],
    shoe: [50, 40, 34], shoeH: [80, 64, 54],
    tie: null, glassesC: [28, 28, 32], headphonesC: [32, 32, 42], hoodie: true,
    hairStyle: 1,
  },
  { // 태호 (CEO) spriteIndex=2
    skin: [242, 210, 176], skinS: [222, 185, 148],
    hair: [165, 165, 175], hairH: [205, 205, 220], hairD: [125, 125, 138],
    eye: [44, 54, 88], eyeW: [240, 240, 255],
    mouth: [194, 112, 112],
    shirt: [26, 36, 90], shirtH: [46, 60, 128], shirtS: [16, 24, 64],
    pants: [20, 26, 66], pantsS: [14, 18, 50],
    shoe: [26, 20, 16], shoeH: [50, 42, 36],
    tie: [222, 42, 42], glassesC: null, headphonesC: null, hoodie: false,
    hairStyle: 0,
  },
  { // 소연 (Designer) spriteIndex=3
    skin: [255, 228, 198], skinS: [242, 202, 170],
    hair: [248, 222, 96], hairH: [255, 242, 150], hairD: [218, 190, 70],
    eye: [130, 70, 172], eyeW: [248, 242, 255],
    mouth: [218, 130, 136],
    shirt: [156, 86, 215], shirtH: [192, 122, 242], shirtS: [120, 60, 170],
    pants: [66, 60, 84], pantsS: [50, 46, 66],
    shoe: [56, 42, 52], shoeH: [86, 66, 76],
    tie: null, glassesC: null, headphonesC: null, hoodie: false,
    hairStyle: 2,
  },
  { // 현우 (QA) spriteIndex=4
    skin: [255, 220, 185], skinS: [235, 190, 155],
    hair: [35, 28, 38], hairH: [60, 52, 68], hairD: [18, 14, 24],
    eye: [50, 40, 64], eyeW: [245, 245, 255],
    mouth: [200, 118, 118],
    shirt: [146, 150, 160], shirtH: [176, 180, 192], shirtS: [116, 120, 132],
    pants: [54, 58, 76], pantsS: [40, 44, 60],
    shoe: [48, 38, 32], shoeH: [74, 60, 50],
    tie: null, glassesC: null, headphonesC: null, hoodie: false,
    hairStyle: 0,
  },
  { // 유나 (Analyst) spriteIndex=5
    skin: [255, 228, 198], skinS: [242, 202, 170],
    hair: [32, 28, 36], hairH: [56, 50, 64], hairD: [16, 14, 20],
    eye: [46, 120, 130], eyeW: [240, 250, 255],
    mouth: [218, 130, 136],
    shirt: [36, 150, 156], shirtH: [66, 186, 192], shirtS: [22, 115, 120],
    pants: [50, 56, 74], pantsS: [36, 42, 58],
    shoe: [40, 34, 30], shoeH: [66, 56, 50],
    tie: null, glassesC: null, headphonesC: null, hoodie: false,
    hairStyle: 2,
  },
];

// ========== Character Drawing - Front (Down) - 48x72 HD ==========

function drawAgentDown(png, ox, oy, pal, walk) {
  const cx = 24;

  // --- HAIR BASE ---
  fillEllipse(png, ox + cx, oy + 16, 13, 12, ...pal.hair);
  fillRect(png, ox + 12, oy + 4, 24, 10, ...pal.hair);
  fillRect(png, ox + 14, oy + 3, 20, 1, ...pal.hair);
  fillRect(png, ox + 15, oy + 1, 18, 2, ...pal.hair);
  // Hair highlight
  fillRect(png, ox + 18, oy + 6, 8, 5, ...pal.hairH);
  fillRect(png, ox + 19, oy + 4, 4, 2, ...pal.hairH);
  // Bangs border
  fillRect(png, ox + 13, oy + 14, 22, 2, ...pal.hairD);

  // Hair style extras
  if (pal.hairStyle === 1) { // messy (지훈)
    fillRect(png, ox + 9, oy + 8, 4, 12, ...pal.hair);
    fillRect(png, ox + 35, oy + 8, 4, 11, ...pal.hair);
    setPixel(png, ox + 9, oy + 6, ...pal.hair);
    setPixel(png, ox + 37, oy + 7, ...pal.hair);
    fillRect(png, ox + 14, oy + 0, 5, 3, ...pal.hair);
    fillRect(png, ox + 29, oy + 0, 5, 3, ...pal.hair);
  } else if (pal.hairStyle === 2) { // bob (소연, 유나)
    fillRect(png, ox + 9, oy + 10, 4, 18, ...pal.hair);
    fillRect(png, ox + 35, oy + 10, 4, 18, ...pal.hair);
    fillRect(png, ox + 10, oy + 26, 3, 4, ...pal.hairD);
    fillRect(png, ox + 35, oy + 26, 3, 4, ...pal.hairD);
  }

  // Hoodie hood rim (지훈 - 후드 테두리)
  if (pal.hoodie) {
    fillRect(png, ox + 9, oy + 12, 2, 8, ...pal.shirtS);
    fillRect(png, ox + 37, oy + 12, 2, 8, ...pal.shirtS);
    fillRect(png, ox + 11, oy + 10, 3, 2, ...pal.shirtS);
    fillRect(png, ox + 34, oy + 10, 3, 2, ...pal.shirtS);
  }

  // Headphones band (지훈 - 헤드폰 밴드, 헤어 위)
  if (pal.headphonesC) {
    const hc = pal.headphonesC;
    fillRect(png, ox + 10, oy + 2, 28, 3, ...hc);
    fillEllipse(png, ox + 11, oy + 16, 4, 5, ...hc);
    fillEllipse(png, ox + 37, oy + 16, 4, 5, ...hc);
    fillEllipse(png, ox + 11, oy + 16, 2, 3, 58, 58, 68);
    fillEllipse(png, ox + 37, oy + 16, 2, 3, 58, 58, 68);
  }

  // --- FACE ---
  fillEllipse(png, ox + cx, oy + 22, 9, 8, ...pal.skin);
  fillRect(png, ox + 15, oy + 15, 18, 12, ...pal.skin);
  fillRect(png, ox + 16, oy + 25, 16, 3, ...pal.skinS);
  fillEllipse(png, ox + cx, oy + 27, 7, 3, ...pal.skinS);

  // --- EYES ---
  fillRect(png, ox + 16, oy + 18, 5, 6, ...pal.eyeW);
  fillRect(png, ox + 17, oy + 19, 3, 5, ...pal.eye);
  setPixel(png, ox + 17, oy + 18, 255, 255, 255);
  fillRect(png, ox + 27, oy + 18, 5, 6, ...pal.eyeW);
  fillRect(png, ox + 28, oy + 19, 3, 5, ...pal.eye);
  setPixel(png, ox + 28, oy + 18, 255, 255, 255);

  // Eyebrows
  fillRect(png, ox + 16, oy + 16, 5, 2, ...pal.hairD);
  fillRect(png, ox + 27, oy + 16, 5, 2, ...pal.hairD);

  // Blush
  fillRect(png, ox + 13, oy + 22, 3, 2, 255, 185, 185);
  fillRect(png, ox + 32, oy + 22, 3, 2, 255, 185, 185);

  // Mouth
  fillRect(png, ox + 22, oy + 26, 4, 2, ...pal.mouth);

  // --- NECK ---
  fillRect(png, ox + 21, oy + 30, 6, 3, ...pal.skinS);

  // --- BODY / SHIRT ---
  fillRect(png, ox + 13, oy + 33, 22, 15, ...pal.shirt);
  fillRect(png, ox + 18, oy + 33, 12, 3, ...pal.shirtH); // collar
  fillRect(png, ox + 13, oy + 36, 3, 12, ...pal.shirtS); // left shadow
  fillRect(png, ox + 32, oy + 36, 3, 12, ...pal.shirtS); // right shadow
  for (let i = 0; i < 6; i++) setPixel(png, ox + 24, oy + 37 + i, ...pal.shirtS); // center fold
  fillRect(png, ox + 18, oy + 45, 12, 2, ...pal.shirtH); // bottom highlight

  // Hoodie pocket (지훈)
  if (pal.hoodie) {
    fillRect(png, ox + 18, oy + 40, 12, 7, ...pal.shirtS);
    fillRect(png, ox + 19, oy + 41, 10, 5, ...pal.shirt);
    for (let i = 0; i < 5; i++) setPixel(png, ox + 24, oy + 41 + i, ...pal.shirtS);
  }

  // --- ARMS ---
  let laOff = 0, raOff = 0;
  if (walk === 1) { laOff = -3; raOff = 3; }
  if (walk === 2) { laOff = 3; raOff = -3; }

  fillRect(png, ox + 7, oy + 36 + laOff, 6, 10, ...pal.shirt);
  fillRect(png, ox + 7, oy + 36 + laOff, 1, 10, ...pal.shirtS);
  fillRect(png, ox + 12, oy + 36 + laOff, 1, 10, ...pal.shirtH);
  fillRect(png, ox + 7, oy + 46 + laOff, 6, 3, ...pal.skin);

  fillRect(png, ox + 35, oy + 36 + raOff, 6, 10, ...pal.shirt);
  fillRect(png, ox + 40, oy + 36 + raOff, 1, 10, ...pal.shirtS);
  fillRect(png, ox + 35, oy + 36 + raOff, 1, 10, ...pal.shirtH);
  fillRect(png, ox + 35, oy + 46 + raOff, 6, 3, ...pal.skin);

  // --- BELT ---
  fillRect(png, ox + 13, oy + 48, 22, 2, ...pal.pantsS);

  // --- LEGS & SHOES ---
  if (walk === 0) {
    fillRect(png, ox + 14, oy + 50, 20, 13, ...pal.pants);
    clearRect(png, ox + 23, oy + 55, 4, 8);
    fillRect(png, ox + 22, oy + 55, 2, 8, ...pal.pantsS);
    fillRect(png, ox + 26, oy + 55, 2, 8, ...pal.pantsS);
    fillRect(png, ox + 13, oy + 62, 10, 5, ...pal.shoe);
    fillRect(png, ox + 26, oy + 62, 10, 5, ...pal.shoe);
    fillRect(png, ox + 14, oy + 62, 7, 1, ...pal.shoeH);
    fillRect(png, ox + 27, oy + 62, 7, 1, ...pal.shoeH);
  } else if (walk === 1) {
    fillRect(png, ox + 14, oy + 50, 8, 14, ...pal.pants);
    fillRect(png, ox + 26, oy + 50, 8, 10, ...pal.pants);
    fillRect(png, ox + 22, oy + 52, 4, 8, ...pal.pantsS);
    fillRect(png, ox + 13, oy + 64, 10, 4, ...pal.shoe);
    fillRect(png, ox + 26, oy + 60, 10, 4, ...pal.shoe);
    fillRect(png, ox + 14, oy + 64, 7, 1, ...pal.shoeH);
    fillRect(png, ox + 27, oy + 60, 7, 1, ...pal.shoeH);
  } else {
    fillRect(png, ox + 14, oy + 50, 8, 10, ...pal.pants);
    fillRect(png, ox + 26, oy + 50, 8, 14, ...pal.pants);
    fillRect(png, ox + 22, oy + 52, 4, 8, ...pal.pantsS);
    fillRect(png, ox + 13, oy + 60, 10, 4, ...pal.shoe);
    fillRect(png, ox + 26, oy + 64, 10, 4, ...pal.shoe);
    fillRect(png, ox + 14, oy + 60, 7, 1, ...pal.shoeH);
    fillRect(png, ox + 27, oy + 64, 7, 1, ...pal.shoeH);
  }

  // --- ACCESSORIES (on top) ---

  // 빨간 넥타이 (CEO - 태호)
  if (pal.tie) {
    fillRect(png, ox + 22, oy + 34, 4, 3, ...pal.tie);
    fillRect(png, ox + 21, oy + 37, 6, 2, ...pal.tie);
    fillRect(png, ox + 22, oy + 39, 4, 7, ...pal.tie);
    fillRect(png, ox + 23, oy + 46, 2, 2, ...pal.tie);
    // Tie knot highlight
    fillRect(png, ox + 23, oy + 35, 2, 1, pal.tie[0] + 50, pal.tie[1] + 30, pal.tie[2] + 30);
  }

  // 안경 (PM - 민준)
  if (pal.glassesC && !pal.hoodie) {
    const gc = pal.glassesC;
    fillRect(png, ox + 15, oy + 17, 7, 7, 230, 242, 255, 70);
    fillRect(png, ox + 15, oy + 17, 1, 7, ...gc);
    fillRect(png, ox + 21, oy + 17, 1, 7, ...gc);
    fillRect(png, ox + 15, oy + 17, 7, 1, ...gc);
    fillRect(png, ox + 15, oy + 23, 7, 1, ...gc);
    fillRect(png, ox + 22, oy + 19, 5, 1, ...gc); // bridge
    fillRect(png, ox + 27, oy + 17, 7, 7, 230, 242, 255, 70);
    fillRect(png, ox + 27, oy + 17, 1, 7, ...gc);
    fillRect(png, ox + 33, oy + 17, 1, 7, ...gc);
    fillRect(png, ox + 27, oy + 17, 7, 1, ...gc);
    fillRect(png, ox + 27, oy + 23, 7, 1, ...gc);
  }

  // 두꺼운 안경 (Dev - 지훈)
  if (pal.glassesC && pal.hoodie) {
    const gc = pal.glassesC;
    fillRect(png, ox + 14, oy + 17, 9, 8, 196, 228, 255, 85);
    fillRect(png, ox + 14, oy + 17, 2, 8, ...gc);
    fillRect(png, ox + 22, oy + 17, 2, 8, ...gc);
    fillRect(png, ox + 14, oy + 17, 9, 2, ...gc);
    fillRect(png, ox + 14, oy + 23, 9, 2, ...gc);
    fillRect(png, ox + 23, oy + 19, 3, 2, ...gc); // bridge
    fillRect(png, ox + 26, oy + 17, 9, 8, 196, 228, 255, 85);
    fillRect(png, ox + 26, oy + 17, 2, 8, ...gc);
    fillRect(png, ox + 34, oy + 17, 2, 8, ...gc);
    fillRect(png, ox + 26, oy + 17, 9, 2, ...gc);
    fillRect(png, ox + 26, oy + 23, 9, 2, ...gc);
  }
}

// ========== Character Drawing - Back (Up) - 48x72 HD ==========

function drawAgentUp(png, ox, oy, pal, walk) {
  const cx = 24;

  // --- HAIR (back view, full coverage) ---
  fillEllipse(png, ox + cx, oy + 16, 13, 12, ...pal.hair);
  fillRect(png, ox + 12, oy + 4, 24, 10, ...pal.hair);
  fillRect(png, ox + 14, oy + 3, 20, 1, ...pal.hair);
  fillRect(png, ox + 15, oy + 1, 18, 2, ...pal.hair);
  fillEllipse(png, ox + cx, oy + 22, 11, 10, ...pal.hair);
  fillRect(png, ox + 14, oy + 14, 20, 14, ...pal.hair);
  // Part line
  fillRect(png, ox + 23, oy + 8, 2, 16, ...pal.hairD);
  fillRect(png, ox + 18, oy + 6, 5, 4, ...pal.hairH);

  if (pal.hairStyle === 1) {
    fillRect(png, ox + 9, oy + 8, 4, 12, ...pal.hair);
    fillRect(png, ox + 35, oy + 8, 4, 11, ...pal.hair);
    fillRect(png, ox + 14, oy + 0, 5, 3, ...pal.hair);
    fillRect(png, ox + 29, oy + 0, 5, 3, ...pal.hair);
  } else if (pal.hairStyle === 2) {
    fillRect(png, ox + 9, oy + 10, 4, 18, ...pal.hair);
    fillRect(png, ox + 35, oy + 10, 4, 18, ...pal.hair);
  }

  // Hoodie hood back
  if (pal.hoodie) {
    fillRect(png, ox + 9, oy + 12, 2, 10, ...pal.shirtS);
    fillRect(png, ox + 37, oy + 12, 2, 10, ...pal.shirtS);
    fillRect(png, ox + 11, oy + 10, 3, 2, ...pal.shirtS);
    fillRect(png, ox + 34, oy + 10, 3, 2, ...pal.shirtS);
  }

  // Headphones back
  if (pal.headphonesC) {
    const hc = pal.headphonesC;
    fillRect(png, ox + 10, oy + 2, 28, 3, ...hc);
    fillEllipse(png, ox + 11, oy + 16, 4, 5, ...hc);
    fillEllipse(png, ox + 37, oy + 16, 4, 5, ...hc);
    fillEllipse(png, ox + 11, oy + 16, 2, 3, 58, 58, 68);
    fillEllipse(png, ox + 37, oy + 16, 2, 3, 58, 58, 68);
  }

  // Ears
  fillRect(png, ox + 11, oy + 18, 3, 5, ...pal.skinS);
  fillRect(png, ox + 34, oy + 18, 3, 5, ...pal.skinS);

  // --- NECK ---
  fillRect(png, ox + 21, oy + 30, 6, 3, ...pal.skinS);

  // --- BODY (back) ---
  fillRect(png, ox + 13, oy + 33, 22, 15, ...pal.shirt);
  fillRect(png, ox + 13, oy + 33, 22, 2, ...pal.shirtH);
  fillRect(png, ox + 13, oy + 36, 3, 12, ...pal.shirtS);
  fillRect(png, ox + 32, oy + 36, 3, 12, ...pal.shirtS);
  for (let i = 0; i < 10; i++) setPixel(png, ox + 24, oy + 35 + i, ...pal.shirtS);

  if (pal.hoodie) {
    fillRect(png, ox + 18, oy + 40, 12, 7, ...pal.shirtS);
    fillRect(png, ox + 19, oy + 41, 10, 5, ...pal.shirt);
  }

  // --- ARMS ---
  let laOff = 0, raOff = 0;
  if (walk === 1) { laOff = 3; raOff = -3; }
  if (walk === 2) { laOff = -3; raOff = 3; }

  fillRect(png, ox + 7, oy + 36 + laOff, 6, 10, ...pal.shirt);
  fillRect(png, ox + 7, oy + 36 + laOff, 1, 10, ...pal.shirtS);
  fillRect(png, ox + 7, oy + 46 + laOff, 6, 3, ...pal.skin);

  fillRect(png, ox + 35, oy + 36 + raOff, 6, 10, ...pal.shirt);
  fillRect(png, ox + 40, oy + 36 + raOff, 1, 10, ...pal.shirtS);
  fillRect(png, ox + 35, oy + 46 + raOff, 6, 3, ...pal.skin);

  // --- BELT ---
  fillRect(png, ox + 13, oy + 48, 22, 2, ...pal.pantsS);

  // --- LEGS & SHOES ---
  if (walk === 0) {
    fillRect(png, ox + 14, oy + 50, 20, 13, ...pal.pants);
    clearRect(png, ox + 23, oy + 55, 4, 8);
    fillRect(png, ox + 22, oy + 55, 2, 8, ...pal.pantsS);
    fillRect(png, ox + 26, oy + 55, 2, 8, ...pal.pantsS);
    fillRect(png, ox + 13, oy + 62, 10, 5, ...pal.shoe);
    fillRect(png, ox + 26, oy + 62, 10, 5, ...pal.shoe);
    fillRect(png, ox + 14, oy + 62, 7, 1, ...pal.shoeH);
    fillRect(png, ox + 27, oy + 62, 7, 1, ...pal.shoeH);
  } else if (walk === 1) {
    fillRect(png, ox + 14, oy + 50, 8, 14, ...pal.pants);
    fillRect(png, ox + 26, oy + 50, 8, 10, ...pal.pants);
    fillRect(png, ox + 22, oy + 52, 4, 8, ...pal.pantsS);
    fillRect(png, ox + 13, oy + 64, 10, 4, ...pal.shoe);
    fillRect(png, ox + 26, oy + 60, 10, 4, ...pal.shoe);
    fillRect(png, ox + 14, oy + 64, 7, 1, ...pal.shoeH);
    fillRect(png, ox + 27, oy + 60, 7, 1, ...pal.shoeH);
  } else {
    fillRect(png, ox + 14, oy + 50, 8, 10, ...pal.pants);
    fillRect(png, ox + 26, oy + 50, 8, 14, ...pal.pants);
    fillRect(png, ox + 22, oy + 52, 4, 8, ...pal.pantsS);
    fillRect(png, ox + 13, oy + 60, 10, 4, ...pal.shoe);
    fillRect(png, ox + 26, oy + 64, 10, 4, ...pal.shoe);
    fillRect(png, ox + 14, oy + 60, 7, 1, ...pal.shoeH);
    fillRect(png, ox + 27, oy + 64, 7, 1, ...pal.shoeH);
  }
}

// ========== Character Drawing - Right Side - 48x72 HD ==========

function drawAgentRight(png, ox, oy, pal, walk) {
  // --- HAIR (profile, face on right) ---
  fillEllipse(png, ox + 26, oy + 16, 12, 12, ...pal.hair);
  fillRect(png, ox + 15, oy + 4, 20, 10, ...pal.hair);
  fillRect(png, ox + 17, oy + 3, 16, 1, ...pal.hair);
  fillRect(png, ox + 18, oy + 1, 14, 2, ...pal.hair);
  // Hair back (left side of sprite)
  fillRect(png, ox + 10, oy + 6, 8, 18, ...pal.hair);
  fillRect(png, ox + 11, oy + 5, 6, 2, ...pal.hair);
  fillRect(png, ox + 19, oy + 6, 4, 4, ...pal.hairH);
  fillRect(png, ox + 13, oy + 14, 16, 2, ...pal.hairD);

  if (pal.hairStyle === 1) {
    fillRect(png, ox + 8, oy + 7, 4, 14, ...pal.hair);
    fillRect(png, ox + 34, oy + 5, 3, 8, ...pal.hair);
  } else if (pal.hairStyle === 2) {
    fillRect(png, ox + 8, oy + 10, 4, 18, ...pal.hair);
  }

  // Hoodie hood side
  if (pal.hoodie) {
    fillRect(png, ox + 8, oy + 10, 2, 10, ...pal.shirtS);
    fillRect(png, ox + 10, oy + 8, 3, 2, ...pal.shirtS);
  }

  // Headphones side
  if (pal.headphonesC) {
    const hc = pal.headphonesC;
    fillRect(png, ox + 12, oy + 2, 28, 3, ...hc);
    fillEllipse(png, ox + 13, oy + 16, 4, 5, ...hc);
    fillEllipse(png, ox + 13, oy + 16, 2, 3, 58, 58, 68);
  }

  // --- FACE (profile right) ---
  fillEllipse(png, ox + 28, oy + 22, 8, 8, ...pal.skin);
  fillRect(png, ox + 19, oy + 15, 12, 14, ...pal.skin);
  fillRect(png, ox + 20, oy + 26, 10, 3, ...pal.skinS);
  // Nose
  setPixel(png, ox + 35, oy + 22, ...pal.skin);
  setPixel(png, ox + 35, oy + 21, ...pal.skin);

  // Eye (one visible)
  fillRect(png, ox + 27, oy + 18, 5, 7, ...pal.eyeW);
  fillRect(png, ox + 28, oy + 19, 3, 5, ...pal.eye);
  setPixel(png, ox + 28, oy + 18, 255, 255, 255);

  // Eyebrow
  fillRect(png, ox + 27, oy + 16, 5, 2, ...pal.hairD);

  // Ear
  fillRect(png, ox + 15, oy + 18, 3, 5, ...pal.skinS);

  // Blush
  setPixel(png, ox + 32, oy + 22, 255, 185, 185);

  // Mouth
  fillRect(png, ox + 32, oy + 26, 3, 2, ...pal.mouth);

  // --- NECK ---
  fillRect(png, ox + 21, oy + 30, 6, 3, ...pal.skinS);

  // --- BODY (profile, narrower) ---
  fillRect(png, ox + 15, oy + 33, 18, 15, ...pal.shirt);
  fillRect(png, ox + 15, oy + 33, 18, 2, ...pal.shirtH);
  fillRect(png, ox + 15, oy + 36, 3, 12, ...pal.shirtS);
  fillRect(png, ox + 30, oy + 36, 3, 12, ...pal.shirtH);

  // --- ARMS ---
  let armFront = 0, armBack = 0;
  if (walk === 1) { armFront = -3; armBack = 3; }
  if (walk === 2) { armFront = 3; armBack = -3; }

  // Front arm
  fillRect(png, ox + 30, oy + 36 + armFront, 6, 10, ...pal.shirt);
  fillRect(png, ox + 35, oy + 36 + armFront, 1, 10, ...pal.shirtS);
  fillRect(png, ox + 30, oy + 46 + armFront, 6, 3, ...pal.skin);

  // Back arm
  fillRect(png, ox + 12, oy + 36 + armBack, 4, 10, ...pal.shirtS);
  fillRect(png, ox + 12, oy + 46 + armBack, 4, 3, ...pal.skinS);

  // --- BELT ---
  fillRect(png, ox + 15, oy + 48, 18, 2, ...pal.pantsS);

  // --- LEGS & SHOES ---
  if (walk === 0) {
    fillRect(png, ox + 15, oy + 50, 16, 13, ...pal.pants);
    fillRect(png, ox + 14, oy + 62, 9, 5, ...pal.shoe);
    fillRect(png, ox + 25, oy + 62, 9, 5, ...pal.shoe);
    fillRect(png, ox + 15, oy + 62, 6, 1, ...pal.shoeH);
    fillRect(png, ox + 26, oy + 62, 6, 1, ...pal.shoeH);
  } else if (walk === 1) {
    fillRect(png, ox + 20, oy + 50, 8, 14, ...pal.pants);
    fillRect(png, ox + 14, oy + 50, 8, 10, ...pal.pants);
    fillRect(png, ox + 20, oy + 64, 8, 4, ...pal.shoe);
    fillRect(png, ox + 14, oy + 60, 8, 4, ...pal.shoe);
    fillRect(png, ox + 21, oy + 64, 5, 1, ...pal.shoeH);
    fillRect(png, ox + 15, oy + 60, 5, 1, ...pal.shoeH);
  } else {
    fillRect(png, ox + 14, oy + 50, 8, 14, ...pal.pants);
    fillRect(png, ox + 20, oy + 50, 8, 10, ...pal.pants);
    fillRect(png, ox + 14, oy + 64, 8, 4, ...pal.shoe);
    fillRect(png, ox + 20, oy + 60, 8, 4, ...pal.shoe);
    fillRect(png, ox + 15, oy + 64, 5, 1, ...pal.shoeH);
    fillRect(png, ox + 21, oy + 60, 5, 1, ...pal.shoeH);
  }

  // Profile accessories
  if (pal.tie) {
    fillRect(png, ox + 21, oy + 34, 3, 3, ...pal.tie);
    fillRect(png, ox + 20, oy + 37, 4, 2, ...pal.tie);
    fillRect(png, ox + 21, oy + 39, 3, 8, ...pal.tie);
    fillRect(png, ox + 22, oy + 47, 1, 1, ...pal.tie);
  }
  if (pal.glassesC && !pal.hoodie) {
    const gc = pal.glassesC;
    fillRect(png, ox + 26, oy + 17, 8, 7, 230, 242, 255, 70);
    fillRect(png, ox + 26, oy + 17, 1, 7, ...gc);
    fillRect(png, ox + 33, oy + 17, 1, 7, ...gc);
    fillRect(png, ox + 26, oy + 17, 8, 1, ...gc);
    fillRect(png, ox + 26, oy + 23, 8, 1, ...gc);
    fillRect(png, ox + 34, oy + 19, 3, 1, ...gc);
  }
  if (pal.glassesC && pal.hoodie) {
    const gc = pal.glassesC;
    fillRect(png, ox + 25, oy + 17, 10, 8, 196, 228, 255, 85);
    fillRect(png, ox + 25, oy + 17, 2, 8, ...gc);
    fillRect(png, ox + 34, oy + 17, 2, 8, ...gc);
    fillRect(png, ox + 25, oy + 17, 10, 2, ...gc);
    fillRect(png, ox + 25, oy + 23, 10, 2, ...gc);
  }
}

// ========== Generate Agent Spritesheet (48x72 HD, 6 Characters) ==========

function generateAgentSpritesheet() {
  const FW = 48, FH = 72;
  // 12 columns × 6 rows
  const COLS = 12, ROWS = 6;
  const png = new PNG({ width: COLS * FW, height: ROWS * FH, filterType: -1 });
  clearPng(png);

  for (let row = 0; row < ROWS; row++) {
    const pal = PALETTES[row];
    const rowY = row * FH;

    // DOWN (cols 0-2)
    for (let f = 0; f < 3; f++)
      drawAgentDown(png, f * FW, rowY, pal, f);

    // RIGHT (cols 6-8)
    for (let f = 0; f < 3; f++)
      drawAgentRight(png, (6 + f) * FW, rowY, pal, f);

    // Flip RIGHT → LEFT (cols 3-5)
    for (let f = 0; f < 3; f++)
      flipFrameH(png, (6 + f) * FW, rowY, (3 + f) * FW, rowY, FW, FH);

    // UP (cols 9-11)
    for (let f = 0; f < 3; f++)
      drawAgentUp(png, (9 + f) * FW, rowY, pal, f);

    // Outline
    for (let col = 0; col < COLS; col++)
      addOutline(png, col * FW, rowY, FW, FH, 22, 14, 32);
  }

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(SPRITES_DIR, 'agent.png'), buffer);
  console.log(`  ✓ agent.png HD (${FW}x${FH}, 12 frames × 6 characters)`);
}

// ========== Tile Generation ==========

function generateOfficeTiles() {
  const tileSize = 16;
  const cols = 8, rows = 8;
  const png = new PNG({ width: cols * tileSize, height: rows * tileSize, filterType: -1 });
  clearPng(png);

  function drawTile(tileIndex, drawFn) {
    const tx = (tileIndex % cols) * tileSize;
    const ty = Math.floor(tileIndex / cols) * tileSize;
    drawFn(png, tx, ty, tileSize);
  }

  // Tile 0: Empty (transparent)

  // Tile 1: Floor - polished wood
  drawTile(1, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 210, 195, 168);
    for (let x = 0; x < s; x++) {
      setPixel(p, tx + x, ty + 4, 198, 182, 155);
      setPixel(p, tx + x, ty + 9, 203, 187, 160);
      setPixel(p, tx + x, ty + 13, 198, 182, 155);
    }
    for (let i = 0; i < s; i++) {
      setPixel(p, tx + i, ty, 188, 172, 148);
      setPixel(p, tx, ty + i, 188, 172, 148);
    }
    for (let i = 1; i < s; i++) setPixel(p, tx + i, ty + 1, 222, 208, 185);
  });

  // Tile 2: Wall
  drawTile(2, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 108, 118, 140);
    fillRect(p, tx, ty + 7, s, 1, 98, 108, 128);
    fillRect(p, tx + 8, ty, 1, 7, 98, 108, 128);
    fillRect(p, tx + 4, ty + 8, 1, 8, 98, 108, 128);
    fillRect(p, tx + 12, ty + 8, 1, 8, 98, 108, 128);
    fillRect(p, tx, ty, s, 1, 128, 138, 162);
    fillRect(p, tx, ty + s - 3, s, 3, 78, 84, 102);
    fillRect(p, tx, ty + s - 3, s, 1, 95, 100, 120);
  });

  // Tile 3: Desk top
  drawTile(3, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 148, 108, 68);
    fillRect(p, tx + 1, ty + 1, s - 2, s - 2, 168, 128, 84);
    fillRect(p, tx + 2, ty + 5, s - 4, 1, 158, 118, 74);
    fillRect(p, tx + 2, ty + 10, s - 4, 1, 158, 118, 74);
    fillRect(p, tx + 1, ty + 1, s - 2, 1, 188, 148, 104);
    fillRect(p, tx + 1, ty + s - 2, s - 2, 1, 132, 94, 58);
  });

  // Tile 4: Chair
  drawTile(4, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 210, 195, 168);
    fillRect(p, tx + 3, ty + 4, 10, 8, 75, 80, 96);
    fillRect(p, tx + 4, ty + 5, 8, 6, 95, 100, 116);
    fillRect(p, tx + 4, ty + 1, 8, 4, 65, 70, 86);
    fillRect(p, tx + 5, ty + 2, 6, 2, 85, 90, 106);
    setPixel(p, tx + 4, ty + 12, 58, 58, 62);
    setPixel(p, tx + 11, ty + 12, 58, 58, 62);
    setPixel(p, tx + 4, ty + 13, 58, 58, 62);
    setPixel(p, tx + 11, ty + 13, 58, 58, 62);
  });

  // Tile 5: Computer
  drawTile(5, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 168, 128, 84);
    fillRect(p, tx + 2, ty + 1, 12, 9, 32, 32, 42);
    fillRect(p, tx + 3, ty + 2, 10, 7, 38, 48, 68);
    fillRect(p, tx + 4, ty + 3, 6, 1, 78, 198, 118);
    fillRect(p, tx + 4, ty + 5, 8, 1, 98, 178, 228);
    fillRect(p, tx + 4, ty + 7, 5, 1, 228, 178, 78);
    fillRect(p, tx + 7, ty + 10, 2, 2, 48, 48, 58);
    fillRect(p, tx + 5, ty + 12, 6, 1, 48, 48, 58);
    fillRect(p, tx + 3, ty + 13, 10, 2, 58, 58, 68);
    fillRect(p, tx + 4, ty + 13, 8, 1, 78, 78, 88);
  });

  // Tile 6: Plant
  drawTile(6, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 210, 195, 168);
    fillRect(p, tx + 5, ty + 10, 6, 5, 158, 90, 55);
    fillRect(p, tx + 6, ty + 10, 4, 1, 178, 110, 74);
    fillRect(p, tx + 4, ty + 9, 8, 1, 168, 100, 64);
    fillRect(p, tx + 7, ty + 5, 2, 5, 55, 128, 46);
    fillEllipse(p, tx + 5, ty + 4, 3, 2, 46, 158, 60);
    fillEllipse(p, tx + 10, ty + 5, 3, 2, 52, 148, 56);
    fillEllipse(p, tx + 8, ty + 2, 3, 2, 68, 182, 76);
    fillEllipse(p, tx + 6, ty + 6, 2, 2, 58, 168, 66);
    setPixel(p, tx + 8, ty + 1, 98, 208, 108);
    setPixel(p, tx + 5, ty + 3, 78, 188, 88);
  });

  // Tile 7: Window
  drawTile(7, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 108, 118, 140);
    fillRect(p, tx + 1, ty + 1, 14, 14, 85, 90, 108);
    fillRect(p, tx + 2, ty + 2, 12, 12, 155, 208, 242);
    fillRect(p, tx + 2, ty + 2, 12, 4, 135, 192, 238);
    fillRect(p, tx + 2, ty + 6, 12, 4, 168, 212, 242);
    fillRect(p, tx + 2, ty + 10, 12, 4, 198, 228, 248);
    fillRect(p, tx + 2, ty + 8, 12, 1, 95, 100, 118);
    fillRect(p, tx + 8, ty + 2, 1, 12, 95, 100, 118);
    fillRect(p, tx + 4, ty + 4, 3, 2, 238, 244, 255);
    fillRect(p, tx + 3, ty + 5, 5, 1, 238, 244, 255);
    setPixel(p, tx + 3, ty + 3, 218, 238, 255);
    setPixel(p, tx + 4, ty + 3, 218, 238, 255);
  });

  // Tile 8: Whiteboard
  drawTile(8, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 108, 118, 140);
    fillRect(p, tx + 1, ty + 2, 14, 12, 155, 160, 172);
    fillRect(p, tx + 2, ty + 3, 12, 10, 244, 244, 248);
    fillRect(p, tx + 3, ty + 4, 3, 3, 255, 238, 95);
    fillRect(p, tx + 7, ty + 4, 3, 3, 95, 198, 255);
    fillRect(p, tx + 3, ty + 8, 4, 1, 228, 68, 68);
    fillRect(p, tx + 3, ty + 10, 8, 1, 68, 68, 228);
    fillRect(p, tx + 8, ty + 8, 3, 3, 98, 228, 118);
    fillRect(p, tx + 3, ty + 12, 10, 1, 135, 135, 148);
    setPixel(p, tx + 5, ty + 12, 228, 58, 58);
    setPixel(p, tx + 7, ty + 12, 58, 58, 228);
    setPixel(p, tx + 9, ty + 12, 58, 178, 58);
  });

  // Tile 9: Meeting carpet
  drawTile(9, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 125, 138, 180);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++)
        if ((x + y) % 4 === 0)
          setPixel(p, tx + x, ty + y, 138, 152, 195);
    for (let i = 0; i < s; i++) {
      setPixel(p, tx + i, ty, 108, 124, 162);
      setPixel(p, tx, ty + i, 108, 124, 162);
      setPixel(p, tx + i, ty + s - 1, 108, 124, 162);
      setPixel(p, tx + s - 1, ty + i, 108, 124, 162);
    }
  });

  // Tile 10: Kitchen counter
  drawTile(10, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 182, 182, 188);
    fillRect(p, tx + 1, ty + 1, s - 2, s - 2, 196, 196, 202);
    fillRect(p, tx, ty, s, 2, 208, 208, 214);
    fillRect(p, tx + 2, ty + 3, 5, 7, 52, 52, 58);
    fillRect(p, tx + 3, ty + 4, 3, 3, 88, 68, 48);
    setPixel(p, tx + 3, ty + 5, 198, 48, 48);
    fillRect(p, tx + 9, ty + 6, 4, 5, 238, 238, 244);
    fillRect(p, tx + 10, ty + 7, 2, 3, 128, 88, 58);
    setPixel(p, tx + 13, ty + 8, 238, 238, 244);
    setPixel(p, tx + 10, ty + 5, 198, 198, 208);
    setPixel(p, tx + 11, ty + 4, 198, 198, 208);
  });

  // Tile 11: Door
  drawTile(11, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 108, 118, 140);
    fillRect(p, tx + 2, ty, 12, s, 95, 100, 118);
    fillRect(p, tx + 3, ty + 1, 10, 14, 145, 108, 70);
    fillRect(p, tx + 4, ty + 2, 8, 12, 162, 122, 82);
    fillRect(p, tx + 5, ty + 3, 6, 4, 152, 112, 75);
    fillRect(p, tx + 5, ty + 9, 6, 4, 152, 112, 75);
    fillRect(p, tx + 10, ty + 8, 2, 2, 208, 192, 72);
    setPixel(p, tx + 10, ty + 8, 232, 218, 98);
    fillRect(p, tx + 2, ty, 12, 1, 76, 82, 98);
  });

  // Tile 12: CEO office floor (dark parquet)
  drawTile(12, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 158, 125, 90);
    fillRect(p, tx + 1, ty + 1, s - 2, s - 2, 172, 138, 102);
    for (let x = 0; x < s; x++) {
      setPixel(p, tx + x, ty + 5, 148, 115, 82);
      setPixel(p, tx + x, ty + 11, 148, 115, 82);
    }
    fillRect(p, tx + 1, ty + 1, s - 2, 1, 192, 158, 122);
    fillRect(p, tx + 1, ty + s - 2, s - 2, 1, 138, 105, 72);
  });

  // Tile 13: Glass partition / wall accent
  drawTile(13, (p, tx, ty, s) => {
    fillRect(p, tx, ty, s, s, 108, 118, 140);
    fillRect(p, tx + 5, ty, 6, s, 95, 100, 118);
    fillRect(p, tx + 6, ty, 4, s, 155, 200, 230, 120);
    fillRect(p, tx + 6, ty, 4, 2, 175, 220, 248, 140);
    for (let y = 2; y < s - 2; y += 3)
      setPixel(p, tx + 7, ty + y, 188, 225, 252, 80);
  });

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(TILES_DIR, 'office-tiles.png'), buffer);
  console.log('  ✓ office-tiles.png (14 tiles, HD detail)');
}

// ========== Furniture Sprites ==========

function generateFurniture() {
  const png = new PNG({ width: 64, height: 64, filterType: -1 });
  clearPng(png);

  // Item 0: Large desk (top-left)
  fillRect(png, 2, 10, 28, 14, 148, 108, 68);
  fillRect(png, 3, 11, 26, 12, 168, 128, 84);
  fillRect(png, 4, 12, 24, 1, 188, 148, 104);
  fillRect(png, 3, 22, 26, 1, 132, 94, 58);
  fillRect(png, 4, 24, 3, 6, 124, 88, 54);
  fillRect(png, 25, 24, 3, 6, 124, 88, 54);
  fillRect(png, 10, 17, 12, 5, 154, 114, 74);
  fillRect(png, 11, 18, 10, 3, 164, 124, 82);
  fillRect(png, 15, 19, 2, 1, 194, 158, 115);

  // Item 1: Bookshelf (top-right)
  fillRect(png, 34, 2, 28, 28, 128, 90, 54);
  fillRect(png, 35, 3, 26, 26, 144, 105, 66);
  for (let i = 0; i < 4; i++) {
    const sy = 4 + i * 7;
    fillRect(png, 35, sy, 26, 1, 115, 80, 48);
    const bookColors = [
      [[198, 52, 52], [175, 36, 36]],
      [[52, 98, 198], [36, 78, 175]],
      [[52, 168, 72], [36, 145, 55]],
      [[198, 172, 52], [175, 150, 36]],
    ];
    const [bc, bcs] = bookColors[i];
    for (let bx = 0; bx < 4; bx++) {
      const x = 36 + bx * 6;
      const bw = 4 + (bx % 2);
      fillRect(png, x, sy + 1, bw, 5, ...bc);
      fillRect(png, x, sy + 1, 1, 5, ...bcs);
    }
  }

  // Item 2: Server rack (bottom-left)
  fillRect(png, 3, 34, 26, 28, 42, 46, 55);
  fillRect(png, 4, 35, 24, 26, 52, 56, 65);
  fillRect(png, 5, 35, 22, 2, 38, 42, 50);
  for (let i = 0; i < 5; i++) {
    const sy = 38 + i * 5;
    fillRect(png, 5, sy, 22, 3, 62, 66, 75);
    fillRect(png, 6, sy + 1, 20, 1, 72, 76, 85);
    setPixel(png, 23, sy + 1, 0, 252, 78);
    setPixel(png, 25, sy + 1, 252, 178, 0);
    fillRect(png, 7, sy + 1, 4, 1, 88, 92, 100);
  }

  // Item 3: Coffee machine (bottom-right)
  fillRect(png, 38, 38, 20, 24, 52, 56, 62);
  fillRect(png, 39, 39, 18, 22, 62, 66, 72);
  fillRect(png, 39, 39, 18, 3, 72, 76, 82);
  fillRect(png, 42, 43, 8, 4, 38, 42, 52);
  fillRect(png, 43, 44, 6, 2, 58, 178, 118);
  setPixel(png, 52, 44, 252, 58, 58);
  setPixel(png, 52, 46, 98, 252, 98);
  fillRect(png, 42, 49, 10, 2, 48, 52, 58);
  fillRect(png, 42, 53, 10, 6, 178, 182, 188);
  fillRect(png, 44, 54, 6, 4, 244, 244, 250);
  fillRect(png, 45, 55, 4, 2, 132, 92, 58);
  setPixel(png, 50, 56, 244, 244, 250);

  const buffer = PNG.sync.write(png);
  fs.writeFileSync(path.join(SPRITES_DIR, 'furniture.png'), buffer);
  console.log('  ✓ furniture.png');
}

// ========== Office Map (improved layout) ==========

function generateOfficeMap() {
  const W = 30, H = 20;

  const floor = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      if (y === 0 || y === H - 1 || x === 0 || x === W - 1) {
        row.push(2); // wall
      } else if (x >= 16 && y >= 9 && x <= 26 && y <= 16) {
        row.push(12); // CEO office floor (dark parquet)
      } else {
        row.push(1); // regular floor
      }
    }
    floor.push(row);
  }

  // Windows on top wall
  for (const x of [4, 7, 10, 18, 21, 24]) floor[0][x] = 7;
  // Door
  floor[H - 1][14] = 11;
  floor[H - 1][15] = 11;

  const objects = Array.from({ length: H }, () => Array(W).fill(0));

  // Meeting carpet
  for (let y = 2; y < 8; y++)
    for (let x = 12; x < 18; x++)
      objects[y][x] = 9;

  // Whiteboards
  objects[1][14] = 8; objects[1][15] = 8;

  // Desk 민준 (PM) area (4,5)
  objects[3][3] = 3; objects[3][4] = 5;
  objects[4][3] = 4;

  // Desk 지훈 (Dev) area (8,5)
  objects[3][7] = 3; objects[3][8] = 5;
  objects[4][7] = 4;

  // Desk 소연 (Designer) area (23,5)
  objects[3][22] = 3; objects[3][23] = 5;
  objects[4][22] = 4;

  // Desk 현우 (QA) area (4,12)
  objects[10][3] = 3; objects[10][4] = 5;
  objects[11][3] = 4;

  // Desk 유나 (Analyst) area (8,12)
  objects[10][7] = 3; objects[10][8] = 5;
  objects[11][7] = 4;

  // CEO 태호 area (19,12) - fancy desk
  objects[10][18] = 3; objects[10][19] = 5; objects[10][20] = 3;
  objects[11][19] = 4;

  // CEO glass partition
  objects[9][17] = 13; objects[10][17] = 13; objects[11][17] = 13;
  objects[9][21] = 13; objects[10][21] = 13; objects[11][21] = 13;

  // Kitchen area
  objects[16][25] = 10; objects[16][26] = 10; objects[16][27] = 10;

  // Plants
  objects[1][1] = 6;
  objects[1][W - 2] = 6;
  objects[H - 2][1] = 6;
  objects[H - 2][W - 2] = 6;
  objects[8][15] = 6;
  objects[8][1] = 6;
  objects[14][W - 2] = 6;
  objects[2][25] = 6;

  const floorData = floor.flat().map(t => t + 1);
  const objectData = objects.flat().map(t => (t === 0 ? 0 : t + 1));

  const map = {
    compressionlevel: -1,
    height: H, width: W,
    tilewidth: 16, tileheight: 16,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    type: 'map', version: '1.10',
    infinite: false, nextlayerid: 3, nextobjectid: 1,
    tilesets: [{
      columns: 8, firstgid: 1,
      image: '../tiles/office-tiles.png',
      imagewidth: 128, imageheight: 128,
      margin: 0, name: 'office-tiles', spacing: 0,
      tilecount: 64, tilewidth: 16, tileheight: 16,
    }],
    layers: [
      { id: 1, name: 'floor', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: W, height: H, data: floorData },
      { id: 2, name: 'objects', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: W, height: H, data: objectData },
    ],
  };

  fs.writeFileSync(path.join(MAPS_DIR, 'office.json'), JSON.stringify(map, null, 2));
  console.log('  ✓ office.json (CEO zone, glass partitions)');
}

// ========== Main ==========

console.log('🎨 HD 캐릭터 에셋 생성 중...');
ensureDir(SPRITES_DIR);
ensureDir(TILES_DIR);
ensureDir(MAPS_DIR);

generateAgentSpritesheet();
generateOfficeTiles();
generateFurniture();
generateOfficeMap();

console.log('✅ HD 에셋 생성 완료!');
