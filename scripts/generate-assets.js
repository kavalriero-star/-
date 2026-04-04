/**
 * HD 2D Asset Generator
 * Canvas API 기반 고해상도 2D 캐릭터 스프라이트 생성
 * 64×96px 프레임, 그라디언트 + 곡선 + 안티앨리어싱 적용
 */
const { createCanvas, Image } = require('canvas');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'assets', 'sprites');
const TILES_DIR = path.join(__dirname, '..', 'public', 'assets', 'tiles');
const MAPS_DIR = path.join(__dirname, '..', 'public', 'assets', 'maps');

const FW = 64, FH = 96;  // HD frame size
const COLS = 12, ROWS = 6;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ===== 6 Korean Role Characters =====
const CHARS = [
  { // Row 0: 민준 (PM) – 파란 비즈니스 셔츠, 안경, 갈색 단발
    skin:'#F5C888', skinS:'#C88848', skinL:'#FDE0A8',
    hair:'#2C1C0C', hairH:'#503020', hairD:'#140C04',
    shirt:'#3070D8', shirtS:'#1848A0', shirtL:'#60A0FF',
    pants:'#1E2850', pantsS:'#10162E',
    shoe:'#181008', shoeH:'#30200C',
    eye:'#2030A8', eyeL:'#4060D0', lip:'#B84848',
    hairStyle:'neat', sex:'M', tie:null, glasses:'thin', headphones:null, hoodie:false,
  },
  { // Row 1: 지훈 (Dev) – 초록 후드티, 두꺼운 안경, 헤드폰, 주황 헤어
    skin:'#F5C888', skinS:'#C88848', skinL:'#FDE0A8',
    hair:'#B04818', hairH:'#D87038', hairD:'#682808',
    shirt:'#28A040', shirtS:'#107828', shirtL:'#40C860',
    pants:'#283050', pantsS:'#181C38',
    shoe:'#201808', shoeH:'#382810',
    eye:'#187830', eyeL:'#28A848', lip:'#B84848',
    hairStyle:'messy', sex:'M', tie:null, glasses:'thick', headphones:'#202830', hoodie:true,
  },
  { // Row 2: 태호 (CEO) – 네이비 정장, 빨간 넥타이, 은발
    skin:'#EEC880', skinS:'#B88040', skinL:'#F8E0A0',
    hair:'#A0A0B0', hairH:'#C8C8D8', hairD:'#606070',
    shirt:'#181C60', shirtS:'#0C1038', shirtL:'#283898',
    pants:'#101438', pantsS:'#080A20',
    shoe:'#100C08', shoeH:'#282018',
    eye:'#182048', eyeL:'#283068', lip:'#A84040',
    hairStyle:'neat', sex:'M', tie:'#C82020', glasses:null, headphones:null, hoodie:false,
  },
  { // Row 3: 소연 (Designer) – 보라 탑, 금발 밥컷
    skin:'#F8D090', skinS:'#CC9050', skinL:'#FFE8B0',
    hair:'#F0D040', hairH:'#FFE860', hairD:'#C0A828',
    shirt:'#8030C8', shirtS:'#501888', shirtL:'#B058F8',
    pants:'#302840', pantsS:'#1E1828',
    shoe:'#281C28', shoeH:'#48304A',
    eye:'#6828A0', eyeL:'#9048D0', lip:'#C06068',
    hairStyle:'bob', sex:'F', tie:null, glasses:null, headphones:null, hoodie:false,
  },
  { // Row 4: 현우 (QA) – 회색 폴로셔츠, 검은 헤어
    skin:'#F5C888', skinS:'#C88848', skinL:'#FDE0A8',
    hair:'#181820', hairH:'#303040', hairD:'#080810',
    shirt:'#888898', shirtS:'#585868', shirtL:'#A8A8B8',
    pants:'#202838', pantsS:'#101820',
    shoe:'#181410', shoeH:'#302820',
    eye:'#282838', eyeL:'#404050', lip:'#B84848',
    hairStyle:'neat', sex:'M', tie:null, glasses:null, headphones:null, hoodie:false,
  },
  { // Row 5: 유나 (Analyst) – 청록 블레이저, 검은 밥컷
    skin:'#F8D090', skinS:'#CC9050', skinL:'#FFE8B0',
    hair:'#181018', hairH:'#302830', hairD:'#080408',
    shirt:'#189098', shirtS:'#0C5860', shirtL:'#28C0C8',
    pants:'#202838', pantsS:'#101820',
    shoe:'#181018', shoeH:'#302030',
    eye:'#107888', eyeL:'#18A8B8', lip:'#C06068',
    hairStyle:'bob', sex:'F', tie:null, glasses:null, headphones:null, hoodie:false,
  },
];

// ===== Drawing Utilities =====

function rad(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function linGrad(ctx, x1, y1, x2, y2, stops) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

function radGrad(ctx, x, y, r0, cx2, cy2, r1, stops) {
  const g = ctx.createRadialGradient(x, y, r0, cx2, cy2, r1);
  stops.forEach(([t, c]) => g.addColorStop(t, c));
  return g;
}

function shadow(ctx, blur, color, ox = 2, oy = 2) {
  ctx.shadowBlur = blur; ctx.shadowColor = color;
  ctx.shadowOffsetX = ox; ctx.shadowOffsetY = oy;
}

function clearShadow(ctx) {
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
}

// ===== Hair Drawing =====

function drawHairFront(ctx, cx, char) {
  const { hair, hairH, hairD, hairStyle } = char;
  ctx.save();
  shadow(ctx, 4, 'rgba(0,0,0,0.3)', 1, 2);

  if (hairStyle === 'neat' || hairStyle === 'neat_silver') {
    // Smooth layered hair covering top + sides of head
    const g = linGrad(ctx, cx - 14, 4, cx + 10, 28, [[0, hairH], [0.4, hair], [1, hairD]]);
    ctx.beginPath();
    ctx.moveTo(cx - 14, 28);
    ctx.quadraticCurveTo(cx - 16, 18, cx - 13, 8);
    ctx.quadraticCurveTo(cx - 4, 2, cx + 2, 2);
    ctx.quadraticCurveTo(cx + 10, 2, cx + 13, 8);
    ctx.quadraticCurveTo(cx + 16, 18, cx + 14, 28);
    ctx.lineTo(cx - 14, 28);
    ctx.fillStyle = g;
    ctx.fill();
    // Hair highlight
    ctx.beginPath();
    ctx.ellipse(cx - 2, 10, 5, 3, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
  } else if (hairStyle === 'messy') {
    // Messy, spiky hair
    const g = linGrad(ctx, cx - 18, 2, cx + 8, 30, [[0, hairH], [0.5, hair], [1, hairD]]);
    ctx.beginPath();
    ctx.moveTo(cx - 14, 30);
    ctx.lineTo(cx - 16, 20);
    ctx.lineTo(cx - 18, 12);
    ctx.lineTo(cx - 12, 6);
    ctx.lineTo(cx - 14, 2);
    ctx.lineTo(cx - 6, 6);
    ctx.lineTo(cx - 2, 0);
    ctx.lineTo(cx + 4, 5);
    ctx.lineTo(cx + 10, 1);
    ctx.lineTo(cx + 13, 7);
    ctx.lineTo(cx + 16, 12);
    ctx.lineTo(cx + 14, 22);
    ctx.lineTo(cx + 14, 30);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // Hair side tufts
    ctx.beginPath();
    ctx.moveTo(cx - 16, 25);
    ctx.quadraticCurveTo(cx - 22, 24, cx - 20, 32);
    ctx.quadraticCurveTo(cx - 17, 38, cx - 14, 34);
    ctx.fillStyle = hair;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 16, 25);
    ctx.quadraticCurveTo(cx + 22, 24, cx + 20, 32);
    ctx.quadraticCurveTo(cx + 17, 38, cx + 14, 34);
    ctx.fillStyle = hair;
    ctx.fill();
  } else if (hairStyle === 'bob') {
    // Bob cut - covers to jaw level
    const g = linGrad(ctx, cx - 16, 4, cx + 10, 40, [[0, hairH], [0.4, hair], [1, hairD]]);
    ctx.beginPath();
    ctx.moveTo(cx - 15, 42);
    ctx.quadraticCurveTo(cx - 18, 36, cx - 16, 22);
    ctx.quadraticCurveTo(cx - 15, 10, cx - 8, 4);
    ctx.quadraticCurveTo(cx, 1, cx + 8, 4);
    ctx.quadraticCurveTo(cx + 15, 10, cx + 16, 22);
    ctx.quadraticCurveTo(cx + 18, 36, cx + 15, 42);
    ctx.quadraticCurveTo(cx + 10, 46, cx, 46);
    ctx.quadraticCurveTo(cx - 10, 46, cx - 15, 42);
    ctx.fillStyle = g;
    ctx.fill();
    // Fringe/bangs
    ctx.beginPath();
    ctx.moveTo(cx - 13, 16);
    ctx.quadraticCurveTo(cx - 6, 12, cx, 13);
    ctx.quadraticCurveTo(cx + 6, 12, cx + 13, 16);
    ctx.lineTo(cx + 12, 20);
    ctx.quadraticCurveTo(cx, 18, cx - 12, 20);
    ctx.closePath();
    ctx.fillStyle = hairD;
    ctx.fill();
    // Highlight
    ctx.beginPath();
    ctx.ellipse(cx - 3, 8, 6, 3, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
  }
  clearShadow(ctx);
  ctx.restore();
}

function drawHairBack(ctx, cx, char) {
  const { hair, hairH, hairD, hairStyle } = char;
  ctx.save();
  const g = linGrad(ctx, cx - 14, 4, cx + 8, 32, [[0, hairH], [0.5, hair], [1, hairD]]);

  if (hairStyle === 'bob') {
    ctx.beginPath();
    ctx.moveTo(cx - 15, 44);
    ctx.quadraticCurveTo(cx - 18, 34, cx - 16, 20);
    ctx.quadraticCurveTo(cx - 14, 8, cx - 6, 3);
    ctx.quadraticCurveTo(cx, 1, cx + 6, 3);
    ctx.quadraticCurveTo(cx + 14, 8, cx + 16, 20);
    ctx.quadraticCurveTo(cx + 18, 34, cx + 15, 44);
    ctx.quadraticCurveTo(cx, 48, cx - 15, 44);
    ctx.fillStyle = g;
    ctx.fill();
  } else if (hairStyle === 'messy') {
    ctx.beginPath();
    ctx.moveTo(cx - 15, 32);
    ctx.quadraticCurveTo(cx - 18, 20, cx - 14, 8);
    ctx.quadraticCurveTo(cx - 6, 2, cx + 6, 2);
    ctx.quadraticCurveTo(cx + 14, 6, cx + 15, 18);
    ctx.quadraticCurveTo(cx + 18, 26, cx + 15, 32);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 15, 25);
    ctx.quadraticCurveTo(cx - 22, 26, cx - 20, 36);
    ctx.quadraticCurveTo(cx - 16, 40, cx - 14, 34);
    ctx.fillStyle = hair; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 15, 25);
    ctx.quadraticCurveTo(cx + 22, 26, cx + 20, 36);
    ctx.quadraticCurveTo(cx + 16, 40, cx + 14, 34);
    ctx.fillStyle = hair; ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 14, 30);
    ctx.quadraticCurveTo(cx - 16, 18, cx - 12, 6);
    ctx.quadraticCurveTo(cx - 4, 1, cx + 4, 1);
    ctx.quadraticCurveTo(cx + 12, 6, cx + 14, 18);
    ctx.quadraticCurveTo(cx + 16, 26, cx + 14, 30);
    ctx.lineTo(cx - 14, 30);
    ctx.fillStyle = g; ctx.fill();
  }
  // Part line on back
  ctx.beginPath();
  ctx.moveTo(cx - 1, 4); ctx.lineTo(cx - 1, 22);
  ctx.strokeStyle = hairD; ctx.lineWidth = 1; ctx.stroke();
  // Hair highlight
  ctx.beginPath();
  ctx.ellipse(cx - 4, 9, 5, 3, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  ctx.restore();
}

function drawHairRight(ctx, char) {
  const { hair, hairH, hairD, hairStyle } = char;
  const cx = 32;
  ctx.save();

  if (hairStyle === 'bob') {
    const g = linGrad(ctx, 10, 4, 36, 40, [[0, hairH], [0.4, hair], [1, hairD]]);
    ctx.beginPath();
    ctx.moveTo(12, 42);
    ctx.quadraticCurveTo(9, 30, 10, 18);
    ctx.quadraticCurveTo(11, 6, 18, 2);
    ctx.quadraticCurveTo(28, 0, 36, 8);
    ctx.quadraticCurveTo(42, 16, 40, 28);
    ctx.quadraticCurveTo(40, 36, 38, 40);
    ctx.quadraticCurveTo(28, 46, 12, 42);
    ctx.fillStyle = g; ctx.fill();
  } else if (hairStyle === 'messy') {
    const g = linGrad(ctx, 8, 2, 38, 30, [[0, hairH], [0.5, hair], [1, hairD]]);
    ctx.beginPath();
    ctx.moveTo(10, 30);
    ctx.lineTo(9, 20);
    ctx.lineTo(8, 10);
    ctx.lineTo(12, 4);
    ctx.lineTo(10, 0);
    ctx.lineTo(17, 4);
    ctx.lineTo(22, 0);
    ctx.lineTo(27, 4);
    ctx.lineTo(34, 2);
    ctx.lineTo(38, 8);
    ctx.lineTo(40, 18);
    ctx.lineTo(38, 28);
    ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
  } else {
    const g = linGrad(ctx, 10, 2, 38, 28, [[0, hairH], [0.4, hair], [1, hairD]]);
    ctx.beginPath();
    ctx.moveTo(12, 28);
    ctx.quadraticCurveTo(10, 18, 12, 8);
    ctx.quadraticCurveTo(16, 2, 26, 1);
    ctx.quadraticCurveTo(36, 2, 40, 10);
    ctx.quadraticCurveTo(42, 18, 40, 28);
    ctx.lineTo(12, 28);
    ctx.fillStyle = g; ctx.fill();
  }
  ctx.restore();
}

// ===== Face Drawing =====

function drawFaceFront(ctx, cx, char) {
  const { skin, skinS, skinL, eye, eyeL, lip, hairD } = char;
  ctx.save();

  // Face / head base
  shadow(ctx, 6, 'rgba(0,0,0,0.25)', 2, 2);
  const faceG = radGrad(ctx, cx - 4, 22, 2, cx, 26, 20,
    [[0, skinL], [0.5, skin], [1, skinS]]);
  ctx.beginPath();
  ctx.arc(cx, 26, 18, 0, Math.PI * 2);
  ctx.fillStyle = faceG;
  ctx.fill();
  clearShadow(ctx);

  // Subtle chin shading
  const chinG = linGrad(ctx, 0, 34, 0, 46, [[0, 'rgba(0,0,0,0)'], [1, `${skinS}60`]]);
  ctx.beginPath();
  ctx.ellipse(cx, 42, 12, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = chinG; ctx.fill();

  // Ear left & right
  for (const [ex, ey] of [[cx - 18, 26], [cx + 18, 26]]) {
    const earG = radGrad(ctx, ex, ey, 0, ex, ey, 5,
      [[0, skin], [1, skinS]]);
    ctx.beginPath();
    ctx.ellipse(ex, ey, 4, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = earG; ctx.fill();
  }

  // Eyes
  const eyeY = 24;
  const eyeOffX = 7;
  for (const [ex, side] of [[cx - eyeOffX, -1], [cx + eyeOffX, 1]]) {
    // Eye socket shadow
    const socketG = radGrad(ctx, ex, eyeY, 0, ex, eyeY, 7,
      [[0, 'rgba(0,0,0,0.08)'], [1, 'rgba(0,0,0,0)']]);
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 7, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = socketG; ctx.fill();

    // White of eye
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 5, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#F8F8FF'; ctx.fill();

    // Iris
    const irisG = radGrad(ctx, ex - 0.5, eyeY - 1, 0.5, ex, eyeY, 3.5,
      [[0, eyeL], [0.6, eye], [1, '#101018']]);
    ctx.beginPath();
    ctx.arc(ex, eyeY, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = irisG; ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(ex, eyeY, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = '#060608'; ctx.fill();

    // Eye highlight
    ctx.beginPath();
    ctx.arc(ex - 1.2, eyeY - 1.5, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + 1.4, eyeY + 0.8, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();

    // Eyelid crease
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 5, 4, 0, Math.PI + 0.1, Math.PI * 2 - 0.1);
    ctx.strokeStyle = hairD + 'AA';
    ctx.lineWidth = 0.8; ctx.stroke();

    // Eyebrow
    ctx.beginPath();
    ctx.moveTo(ex + side * 5, eyeY - 8);
    ctx.quadraticCurveTo(ex, eyeY - 9.5, ex - side * 5, eyeY - 7);
    ctx.strokeStyle = hairD; ctx.lineWidth = 1.6;
    ctx.lineCap = 'round'; ctx.stroke();
  }

  // Blush
  for (const bx of [cx - 13, cx + 13]) {
    const blG = radGrad(ctx, bx, eyeY + 7, 0, bx, eyeY + 7, 6,
      [[0, 'rgba(240,120,120,0.28)'], [1, 'rgba(240,120,120,0)']]);
    ctx.beginPath();
    ctx.ellipse(bx, eyeY + 7, 6, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = blG; ctx.fill();
  }

  // Nose (subtle)
  ctx.beginPath();
  ctx.moveTo(cx - 2.5, 33);
  ctx.quadraticCurveTo(cx - 4, 36, cx - 3, 37);
  ctx.quadraticCurveTo(cx, 38, cx + 3, 37);
  ctx.quadraticCurveTo(cx + 4, 36, cx + 2.5, 33);
  ctx.strokeStyle = skinS + '90'; ctx.lineWidth = 1; ctx.stroke();

  // Mouth / lips
  if (char.sex === 'F') {
    const lipG = linGrad(ctx, cx - 6, 39, cx + 6, 43,
      [[0, lip], [0.5, '#E88080'], [1, lip]]);
    ctx.beginPath();
    ctx.moveTo(cx - 6, 40);
    ctx.quadraticCurveTo(cx - 3, 38, cx, 39);
    ctx.quadraticCurveTo(cx + 3, 38, cx + 6, 40);
    ctx.quadraticCurveTo(cx + 3, 44, cx, 44);
    ctx.quadraticCurveTo(cx - 3, 44, cx - 6, 40);
    ctx.fillStyle = lipG; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - 6, 40);
    ctx.quadraticCurveTo(cx, 37.5, cx + 6, 40);
    ctx.strokeStyle = lip + 'CC'; ctx.lineWidth = 0.6; ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 5, 40);
    ctx.quadraticCurveTo(cx - 2, 43, cx, 43);
    ctx.quadraticCurveTo(cx + 2, 43, cx + 5, 40);
    ctx.strokeStyle = lip; ctx.lineWidth = 1.4;
    ctx.lineCap = 'round'; ctx.stroke();
  }

  // Face outline
  ctx.beginPath();
  ctx.arc(cx, 26, 18, 0, Math.PI * 2);
  ctx.strokeStyle = skinS + '80'; ctx.lineWidth = 0.5; ctx.stroke();

  ctx.restore();
}

function drawFaceBack(ctx, cx, char) {
  const { skin, skinS, skinL } = char;
  ctx.save();
  shadow(ctx, 5, 'rgba(0,0,0,0.2)', 2, 2);
  const g = radGrad(ctx, cx - 3, 22, 2, cx, 26, 20,
    [[0, skinL], [0.5, skin], [1, skinS]]);
  ctx.beginPath(); ctx.arc(cx, 26, 18, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  clearShadow(ctx);
  // Ear stubs
  for (const ex of [cx - 18, cx + 18]) {
    const earG = radGrad(ctx, ex, 26, 0, ex, 26, 5,
      [[0, skin], [1, skinS]]);
    ctx.beginPath();
    ctx.ellipse(ex, 26, 4, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = earG; ctx.fill();
  }
  ctx.restore();
}

function drawFaceRight(ctx, char) {
  const { skin, skinS, skinL, eye, eyeL, lip, hairD } = char;
  ctx.save();
  // Face facing right: head center at (38, 26)
  shadow(ctx, 5, 'rgba(0,0,0,0.25)', 2, 2);
  const faceG = radGrad(ctx, 34, 22, 2, 38, 26, 20,
    [[0, skinL], [0.5, skin], [1, skinS]]);
  ctx.beginPath();
  ctx.arc(38, 26, 18, 0, Math.PI * 2);
  ctx.fillStyle = faceG; ctx.fill();
  clearShadow(ctx);

  // Ear (left side, facing right - at left of head)
  const earG = radGrad(ctx, 20, 26, 0, 20, 26, 5,
    [[0, skin], [1, skinS]]);
  ctx.beginPath();
  ctx.ellipse(20, 26, 4, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = earG; ctx.fill();

  // Nose bump
  ctx.beginPath();
  ctx.moveTo(54, 30);
  ctx.quadraticCurveTo(57, 33, 54, 36);
  ctx.strokeStyle = skinS + 'A0'; ctx.lineWidth = 1.5;
  ctx.lineCap = 'round'; ctx.stroke();

  // One eye (right side, facing right)
  const ex = 44, eyeY = 24;
  ctx.beginPath();
  ctx.ellipse(ex, eyeY, 5, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#F8F8FF'; ctx.fill();
  const irisG = radGrad(ctx, ex - 0.5, eyeY - 1, 0.5, ex, eyeY, 3.5,
    [[0, eyeL], [0.6, eye], [1, '#101018']]);
  ctx.beginPath();
  ctx.arc(ex, eyeY, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = irisG; ctx.fill();
  ctx.beginPath();
  ctx.arc(ex, eyeY, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = '#060608'; ctx.fill();
  ctx.beginPath();
  ctx.arc(ex - 1.2, eyeY - 1.5, 1, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.beginPath();
  ctx.ellipse(ex, eyeY, 5, 4, 0, Math.PI + 0.1, Math.PI * 2 - 0.1);
  ctx.strokeStyle = hairD + 'AA'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ex - 5, eyeY - 7);
  ctx.quadraticCurveTo(ex, eyeY - 9.5, ex + 5, eyeY - 7);
  ctx.strokeStyle = hairD; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke();

  // Mouth profile
  ctx.beginPath();
  ctx.moveTo(52, 40);
  ctx.quadraticCurveTo(54, 43, 52, 44);
  ctx.strokeStyle = lip; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.stroke();

  ctx.restore();
}

// ===== Body Drawing =====

function drawBodyFront(ctx, cx, char, walkF) {
  const { shirt, shirtS, shirtL } = char;
  ctx.save();
  shadow(ctx, 5, 'rgba(0,0,0,0.2)', 1, 2);
  const bG = linGrad(ctx, cx - 18, 50, cx + 18, 80,
    [[0, shirtL], [0.3, shirt], [1, shirtS]]);
  ctx.beginPath();
  ctx.moveTo(cx - 20, 50);  // left shoulder
  ctx.lineTo(cx + 20, 50);  // right shoulder
  ctx.lineTo(cx + 18, 80);  // right hip
  ctx.lineTo(cx - 18, 80);  // left hip
  ctx.closePath();
  ctx.fillStyle = bG; ctx.fill();
  // Side shadows
  const lSh = linGrad(ctx, cx - 20, 0, cx - 6, 0,
    [[0, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]);
  ctx.fillStyle = lSh;
  ctx.beginPath();
  ctx.moveTo(cx - 20, 50); ctx.lineTo(cx - 6, 50);
  ctx.lineTo(cx - 8, 80); ctx.lineTo(cx - 18, 80); ctx.closePath(); ctx.fill();
  const rSh = linGrad(ctx, cx + 6, 0, cx + 20, 0,
    [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.22)']]);
  ctx.fillStyle = rSh;
  ctx.beginPath();
  ctx.moveTo(cx + 6, 50); ctx.lineTo(cx + 20, 50);
  ctx.lineTo(cx + 18, 80); ctx.lineTo(cx + 8, 80); ctx.closePath(); ctx.fill();
  clearShadow(ctx);
  ctx.restore();

  // Collar / neckline
  ctx.save();
  const colG = linGrad(ctx, cx - 8, 50, cx + 8, 58,
    [[0, shirtL], [1, shirt]]);
  ctx.beginPath();
  ctx.moveTo(cx - 6, 50); ctx.lineTo(cx + 6, 50);
  ctx.lineTo(cx + 4, 58); ctx.lineTo(cx - 4, 58); ctx.closePath();
  ctx.fillStyle = colG; ctx.fill();
  ctx.restore();

  // Neck
  ctx.save();
  const neckG = radGrad(ctx, cx - 2, 46, 1, cx, 48, 7,
    [[0, char.skinL], [0.5, char.skin], [1, char.skinS]]);
  rad(ctx, cx - 5, 44, 10, 10, 3);
  ctx.fillStyle = neckG; ctx.fill();
  ctx.restore();

  // Arms
  drawArmsFront(ctx, cx, char, walkF);

  // Belt
  ctx.save();
  const beltG = linGrad(ctx, cx - 18, 78, cx + 18, 84,
    [[0, char.pantsS], [0.5, '#505058'], [1, char.pantsS]]);
  rad(ctx, cx - 18, 79, 36, 5, 2);
  ctx.fillStyle = beltG; ctx.fill();
  // Belt buckle
  rad(ctx, cx - 5, 79, 10, 5, 1);
  ctx.fillStyle = '#C8C0A0'; ctx.fill();
  ctx.restore();
}

function drawArmsFront(ctx, cx, char, walkF) {
  const { shirt, shirtS, shirtL, skin, skinS } = char;
  const lOff = walkF === 1 ? -8 : (walkF === 2 ? 8 : 0);
  const rOff = walkF === 1 ? 8 : (walkF === 2 ? -8 : 0);

  for (const [ax, yOff, side] of [[cx - 26, lOff, -1], [cx + 26, rOff, 1]]) {
    ctx.save();
    const armG = linGrad(ctx, ax - 6, 52 + yOff, ax + 6, 76 + yOff,
      [[0, shirtL], [0.3, shirt], [1, shirtS]]);
    shadow(ctx, 3, 'rgba(0,0,0,0.2)', 1, 1);
    rad(ctx, ax - 6, 52 + yOff, 12, 24, 5);
    ctx.fillStyle = armG; ctx.fill();
    // Side shadow on arm
    ctx.beginPath();
    ctx.fillStyle = side > 0
      ? linGrad(ctx, ax, 0, ax + 6, 0, [[0,'rgba(0,0,0,0)'], [1,'rgba(0,0,0,0.18)']])
      : linGrad(ctx, ax - 6, 0, ax, 0, [[0,'rgba(0,0,0,0.18)'], [1,'rgba(0,0,0,0)']]);
    rad(ctx, ax - 6, 52 + yOff, 12, 24, 5);
    ctx.fill();
    clearShadow(ctx);
    // Hand
    const handG = radGrad(ctx, ax, 78 + yOff, 0, ax, 78 + yOff, 6,
      [[0, char.skinL], [0.5, char.skin], [1, char.skinS]]);
    ctx.beginPath();
    ctx.arc(ax, 79 + yOff, 6, 0, Math.PI * 2);
    ctx.fillStyle = handG; ctx.fill();
    ctx.restore();
  }
}

function drawLegsShoesFront(ctx, cx, char, walkF) {
  const { pants, pantsS, shoe, shoeH } = char;
  const lOff = walkF === 1 ? 6 : (walkF === 2 ? -6 : 0);
  const rOff = walkF === 1 ? -6 : (walkF === 2 ? 6 : 0);

  for (const [lx, yOff] of [[cx - 9, lOff], [cx + 9, rOff]]) {
    ctx.save();
    shadow(ctx, 3, 'rgba(0,0,0,0.2)', 1, 1);
    const legG = linGrad(ctx, lx - 7, 84 + yOff, lx + 7, 84 + yOff,
      [[0, pantsS], [0.5, pants], [1, pantsS]]);
    rad(ctx, lx - 7, 84 + yOff, 14, 28, 4);
    ctx.fillStyle = legG; ctx.fill();
    // Leg highlight
    ctx.beginPath();
    ctx.fillStyle = linGrad(ctx, lx - 7, 0, lx - 1, 0,
      [[0,'rgba(255,255,255,0.06)'],[1,'rgba(255,255,255,0)']]);
    rad(ctx, lx - 7, 84 + yOff, 7, 28, 4);
    ctx.fill();
    clearShadow(ctx);
    // Shoe
    const shoeG = linGrad(ctx, lx - 8, 112 + yOff, lx + 10, 118 + yOff,
      [[0, shoeH], [0.3, shoe], [1, '#080604']]);
    ctx.beginPath();
    ctx.moveTo(lx - 8, 112 + yOff);
    ctx.quadraticCurveTo(lx - 8, 108 + yOff, lx - 5, 108 + yOff);
    ctx.lineTo(lx + 6, 108 + yOff);
    ctx.quadraticCurveTo(lx + 10, 108 + yOff, lx + 10, 112 + yOff);
    ctx.lineTo(lx + 10, 116 + yOff);
    ctx.quadraticCurveTo(lx + 10, 120 + yOff, lx + 6, 120 + yOff);
    ctx.lineTo(lx - 7, 120 + yOff);
    ctx.quadraticCurveTo(lx - 10, 120 + yOff, lx - 10, 116 + yOff);
    ctx.closePath();
    ctx.fillStyle = shoeG; ctx.fill();
    // Shoe highlight
    ctx.beginPath();
    ctx.ellipse(lx - 2, 110 + yOff, 5, 2, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();
    ctx.restore();
  }
}

function drawBodyBack(ctx, cx, char, walkF) {
  const { shirt, shirtS, shirtL } = char;
  ctx.save();
  shadow(ctx, 5, 'rgba(0,0,0,0.2)', 1, 2);
  const bG = linGrad(ctx, cx - 18, 50, cx + 18, 80,
    [[0, shirtL], [0.3, shirt], [1, shirtS]]);
  ctx.beginPath();
  ctx.moveTo(cx - 20, 50); ctx.lineTo(cx + 20, 50);
  ctx.lineTo(cx + 18, 80); ctx.lineTo(cx - 18, 80); ctx.closePath();
  ctx.fillStyle = bG; ctx.fill();
  clearShadow(ctx);
  // Back seam
  ctx.beginPath();
  ctx.moveTo(cx, 52); ctx.lineTo(cx, 78);
  ctx.strokeStyle = shirtS; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.restore();

  const lOff = walkF === 1 ? 8 : (walkF === 2 ? -8 : 0);
  const rOff = walkF === 1 ? -8 : (walkF === 2 ? 8 : 0);
  for (const [ax, yOff, side] of [[cx - 26, lOff, -1], [cx + 26, rOff, 1]]) {
    ctx.save();
    const armG = linGrad(ctx, ax - 6, 52 + yOff, ax + 6, 76 + yOff,
      [[0, shirtL], [0.3, shirt], [1, shirtS]]);
    rad(ctx, ax - 6, 52 + yOff, 12, 24, 5);
    ctx.fillStyle = armG; ctx.fill();
    const handG = radGrad(ctx, ax, 78 + yOff, 0, ax, 78 + yOff, 6,
      [[0, char.skinL], [0.5, char.skin], [1, char.skinS]]);
    ctx.beginPath();
    ctx.arc(ax, 79 + yOff, 6, 0, Math.PI * 2);
    ctx.fillStyle = handG; ctx.fill();
    ctx.restore();
  }

  rad(ctx, cx - 18, 79, 36, 5, 2);
  ctx.fillStyle = linGrad(ctx, cx - 18, 79, cx + 18, 84,
    [[0, char.pantsS], [0.5, '#505058'], [1, char.pantsS]]);
  ctx.fill();
  rad(ctx, cx - 5, 79, 10, 5, 1);
  ctx.fillStyle = '#C8C0A0'; ctx.fill();
}

function drawBodyRight(ctx, char, walkF) {
  const { shirt, shirtS, shirtL, skin, skinS, skinL } = char;
  // profile body - centered around x=38
  ctx.save();
  shadow(ctx, 5, 'rgba(0,0,0,0.2)', 1, 2);
  const bG = linGrad(ctx, 24, 50, 52, 80,
    [[0, shirtL], [0.4, shirt], [1, shirtS]]);
  ctx.beginPath();
  ctx.moveTo(24, 50); ctx.lineTo(52, 50);
  ctx.lineTo(50, 80); ctx.lineTo(26, 80); ctx.closePath();
  ctx.fillStyle = bG; ctx.fill();
  clearShadow(ctx);

  // Front arm (visible)
  const fArmOff = walkF === 1 ? -9 : (walkF === 2 ? 9 : 0);
  ctx.save();
  const armG = linGrad(ctx, 48, 52, 60, 76,
    [[0, shirtL], [0.4, shirt], [1, shirtS]]);
  rad(ctx, 46, 52 + fArmOff, 14, 24, 5);
  ctx.fillStyle = armG; ctx.fill();
  const handG = radGrad(ctx, 53, 78 + fArmOff, 0, 53, 78 + fArmOff, 6,
    [[0, skinL], [0.5, skin], [1, skinS]]);
  ctx.beginPath();
  ctx.arc(53, 79 + fArmOff, 6, 0, Math.PI * 2);
  ctx.fillStyle = handG; ctx.fill();
  ctx.restore();

  // Back arm (partially visible)
  const bArmOff = walkF === 1 ? 9 : (walkF === 2 ? -9 : 0);
  ctx.save();
  ctx.globalAlpha = 0.6;
  rad(ctx, 16, 52 + bArmOff, 10, 22, 4);
  ctx.fillStyle = shirtS; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();

  // Neck
  const neckG = radGrad(ctx, 36, 46, 1, 38, 48, 7,
    [[0, skinL], [0.5, skin], [1, skinS]]);
  rad(ctx, 33, 44, 10, 10, 3);
  ctx.fillStyle = neckG; ctx.fill();

  // Belt
  rad(ctx, 24, 79, 28, 5, 2);
  ctx.fillStyle = linGrad(ctx, 24, 79, 52, 84,
    [[0, char.pantsS], [0.5, '#505058'], [1, char.pantsS]]);
  ctx.fill();
  ctx.restore();

  // Legs side view
  const lOff = walkF === 1 ? 7 : (walkF === 2 ? -7 : 0);
  const rOff = walkF === 1 ? -7 : (walkF === 2 ? 7 : 0);
  for (const [lx, yOff] of [[30, rOff], [38, lOff]]) {
    ctx.save();
    const legG = linGrad(ctx, lx - 6, 84, lx + 6, 84,
      [[0, char.pantsS], [0.5, char.pants], [1, char.pantsS]]);
    rad(ctx, lx - 6, 84 + yOff, 12, 26, 4);
    ctx.fillStyle = legG; ctx.fill();
    // Shoe
    const sg = linGrad(ctx, lx - 6, 110, lx + 12, 118,
      [[0, char.shoeH], [0.4, char.shoe], [1, '#080604']]);
    ctx.beginPath();
    ctx.moveTo(lx - 6, 110 + yOff);
    ctx.quadraticCurveTo(lx - 6, 107 + yOff, lx - 2, 107 + yOff);
    ctx.lineTo(lx + 8, 107 + yOff);
    ctx.quadraticCurveTo(lx + 14, 107 + yOff, lx + 14, 112 + yOff);
    ctx.lineTo(lx + 14, 116 + yOff);
    ctx.quadraticCurveTo(lx + 12, 120 + yOff, lx + 6, 120 + yOff);
    ctx.lineTo(lx - 5, 120 + yOff);
    ctx.quadraticCurveTo(lx - 8, 120 + yOff, lx - 8, 116 + yOff);
    ctx.closePath();
    ctx.fillStyle = sg; ctx.fill();
    ctx.restore();
  }
}

function drawLegsShoesBack(ctx, cx, char, walkF) {
  drawLegsShoesFront(ctx, cx, char, walkF); // same from back
}

// ===== Accessories =====

function drawTie(ctx, cx, char) {
  if (!char.tie) return;
  const c = char.tie;
  const tG = linGrad(ctx, cx - 4, 54, cx + 4, 78,
    [[0, c], [0.5, c + 'CC'], [1, '#601010']]);
  ctx.save();
  // Knot
  ctx.beginPath();
  ctx.moveTo(cx - 4, 54); ctx.lineTo(cx + 4, 54);
  ctx.lineTo(cx + 3, 58); ctx.lineTo(cx, 60); ctx.lineTo(cx - 3, 58);
  ctx.closePath();
  ctx.fillStyle = c; ctx.fill();
  // Body of tie
  ctx.beginPath();
  ctx.moveTo(cx - 3, 58); ctx.lineTo(cx + 3, 58);
  ctx.lineTo(cx + 4, 74); ctx.lineTo(cx, 80); ctx.lineTo(cx - 4, 74);
  ctx.closePath();
  ctx.fillStyle = tG; ctx.fill();
  // Tie highlight
  ctx.beginPath();
  ctx.moveTo(cx - 1, 60); ctx.lineTo(cx + 1, 60);
  ctx.lineTo(cx + 2, 72); ctx.lineTo(cx, 76); ctx.lineTo(cx - 2, 72);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  ctx.restore();
}

function drawGlasses(ctx, cx, type) {
  const eyeY = 24, offX = 7;
  ctx.save();
  if (type === 'thick') {
    // Thick square frames (Dev)
    ctx.strokeStyle = '#181820'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (const ex of [cx - offX, cx + offX]) {
      ctx.strokeRect(ex - 7, eyeY - 5.5, 14, 11);
      ctx.fillStyle = 'rgba(180,220,255,0.12)';
      ctx.fillRect(ex - 6.5, eyeY - 5, 13, 10);
    }
    ctx.beginPath();
    ctx.moveTo(cx - offX + 7, eyeY); ctx.lineTo(cx + offX - 7, eyeY);
    ctx.stroke();
  } else {
    // Thin wire frames (PM)
    ctx.strokeStyle = '#50380A'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
    for (const ex of [cx - offX, cx + offX]) {
      ctx.beginPath(); ctx.ellipse(ex, eyeY, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,230,255,0.08)';
      ctx.beginPath(); ctx.ellipse(ex, eyeY, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx - offX + 6, eyeY); ctx.lineTo(cx + offX - 6, eyeY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeadphones(ctx, cx, color) {
  ctx.save();
  shadow(ctx, 4, 'rgba(0,0,0,0.3)', 1, 1);
  // Headband
  const bandG = linGrad(ctx, cx - 14, 2, cx + 14, 12,
    [[0, '#404050'], [0.5, color], [1, '#202028']]);
  ctx.beginPath();
  ctx.arc(cx, 18, 16, Math.PI, Math.PI * 2, false);
  ctx.strokeStyle = bandG; ctx.lineWidth = 4; ctx.stroke();
  // Ear cups
  for (const [ex, ey] of [[cx - 16, 18], [cx + 16, 18]]) {
    const cupG = radGrad(ctx, ex - 1, ey - 1, 0, ex, ey, 6,
      [[0, '#505060'], [0.5, color], [1, '#181820']]);
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = cupG; ctx.fill();
    ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#101018'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex - 1, ey - 1, 1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
  }
  clearShadow(ctx);
  ctx.restore();
}

function drawHoodie(ctx, cx, char) {
  const { shirtS, shirtL } = char;
  ctx.save();
  // Hood rim around hairline
  ctx.beginPath();
  ctx.moveTo(cx - 18, 30);
  ctx.quadraticCurveTo(cx - 20, 20, cx - 16, 10);
  ctx.quadraticCurveTo(cx - 10, 5, cx - 4, 5);
  ctx.lineWidth = 4;
  ctx.strokeStyle = shirtS + 'CC'; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 18, 30);
  ctx.quadraticCurveTo(cx + 20, 20, cx + 16, 10);
  ctx.quadraticCurveTo(cx + 10, 5, cx + 4, 5);
  ctx.lineWidth = 4;
  ctx.strokeStyle = shirtS + 'CC'; ctx.stroke();
  // Kangaroo pocket
  const pG = linGrad(ctx, cx - 12, 60, cx + 12, 76,
    [[0, shirtS], [1, '#00000040']]);
  rad(ctx, cx - 12, 62, 24, 14, 5);
  ctx.fillStyle = pG; ctx.fill();
  rad(ctx, cx - 12, 62, 24, 14, 5);
  ctx.strokeStyle = shirtL + '60'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.restore();
}

// ===== Full Character Frame =====

function drawFrameFront(ctx, char, walkF) {
  const cx = 32;
  ctx.clearRect(0, 0, FW, FH);

  // Draw order: legs → body → face (hair drawn first for back-of-head coverage)
  drawHairFront(ctx, cx, char);
  if (char.headphones) drawHeadphones(ctx, cx, char.headphones);
  drawFaceFront(ctx, cx, char);
  drawBodyFront(ctx, cx, char, walkF);
  if (char.hoodie) drawHoodie(ctx, cx, char);
  if (char.tie) drawTie(ctx, cx, char);
  if (char.glasses) drawGlasses(ctx, cx, char.glasses);
  drawLegsShoesFront(ctx, cx, char, walkF);

  // Overall character outline (subtle)
  ctx.globalCompositeOperation = 'destination-over';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawFrameBack(ctx, char, walkF) {
  const cx = 32;
  ctx.clearRect(0, 0, FW, FH);
  drawHairBack(ctx, cx, char);
  if (char.headphones) drawHeadphones(ctx, cx, char.headphones);
  drawFaceBack(ctx, cx, char);
  drawBodyBack(ctx, cx, char, walkF);
  if (char.hoodie) drawHoodie(ctx, cx, char);
  drawLegsShoesBack(ctx, cx, char, walkF);
}

function drawFrameRight(ctx, char, walkF) {
  ctx.clearRect(0, 0, FW, FH);
  drawHairRight(ctx, char);
  if (char.headphones) {
    // Side headphone (just one ear cup visible)
    ctx.save();
    const cupG = radGrad(ctx, 16, 18, 0, 16, 18, 6,
      [[0, '#505060'], [0.5, char.headphones], [1, '#181820']]);
    ctx.beginPath(); ctx.arc(16, 18, 6, 0, Math.PI * 2);
    ctx.fillStyle = cupG; ctx.fill();
    ctx.beginPath(); ctx.arc(16, 18, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#101018'; ctx.fill();
    ctx.restore();
  }
  drawFaceRight(ctx, char);
  drawBodyRight(ctx, char, walkF);
  if (char.hoodie) {
    const { shirtS } = char;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(12, 28); ctx.quadraticCurveTo(9, 16, 12, 6);
    ctx.quadraticCurveTo(14, 3, 18, 3);
    ctx.lineWidth = 4; ctx.strokeStyle = shirtS + 'CC'; ctx.stroke();
    // Side pocket
    rad(ctx, 42, 62, 12, 14, 4);
    ctx.fillStyle = shirtS; ctx.fill();
    ctx.restore();
  }
  if (char.tie) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(36, 54); ctx.lineTo(40, 54);
    ctx.lineTo(40, 76); ctx.lineTo(37, 80); ctx.lineTo(35, 76); ctx.lineTo(36, 54);
    ctx.fillStyle = linGrad(ctx, 36, 54, 40, 80,
      [[0, char.tie], [1, '#601010']]);
    ctx.fill();
    ctx.restore();
  }
  if (char.glasses) {
    // Side glasses
    ctx.save();
    ctx.strokeStyle = char.glasses === 'thick' ? '#181820' : '#50380A';
    ctx.lineWidth = char.glasses === 'thick' ? 2.5 : 1.2;
    if (char.glasses === 'thick') {
      ctx.strokeRect(38, 18.5, 12, 11);
      ctx.fillStyle = 'rgba(180,220,255,0.1)';
      ctx.fillRect(38.5, 19, 11, 10);
    } else {
      ctx.beginPath(); ctx.ellipse(43, 24, 6, 4.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // Temple arm
    ctx.beginPath(); ctx.moveTo(50, 24); ctx.lineTo(58, 24);
    ctx.stroke();
    ctx.restore();
  }
}

function flipH(srcCanvas) {
  const dst = createCanvas(FW, FH);
  const dCtx = dst.getContext('2d');
  dCtx.translate(FW, 0); dCtx.scale(-1, 1);
  dCtx.drawImage(srcCanvas, 0, 0);
  return dst;
}

// ===== Spritesheet Generator =====

function generateAgentSpritesheet() {
  const sheet = createCanvas(COLS * FW, ROWS * FH);
  const sCtx = sheet.getContext('2d');

  const frame = createCanvas(FW, FH);
  const fCtx = frame.getContext('2d');

  for (let row = 0; row < ROWS; row++) {
    const char = CHARS[row];
    const rowY = row * FH;

    for (let f = 0; f < 3; f++) {
      // DOWN (cols 0-2)
      drawFrameFront(fCtx, char, f);
      sCtx.drawImage(frame, f * FW, rowY);

      // RIGHT (cols 6-8)
      drawFrameRight(fCtx, char, f);
      sCtx.drawImage(frame, (6 + f) * FW, rowY);

      // LEFT = flip of RIGHT (cols 3-5)
      const leftFrame = flipH(frame);
      sCtx.drawImage(leftFrame, (3 + f) * FW, rowY);

      // UP (cols 9-11)
      drawFrameBack(fCtx, char, f);
      sCtx.drawImage(frame, (9 + f) * FW, rowY);
    }
  }

  const buf = sheet.toBuffer('image/png');
  fs.writeFileSync(path.join(SPRITES_DIR, 'agent.png'), buf);
  console.log(`  ✓ agent.png HD 2D (${FW}x${FH}, Canvas API, 6캐릭터×12프레임)`);
}

// ===== Tile Generation (pngjs - 16x16 tiles remain pixel art) =====

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = r; png.data[i+1] = g; png.data[i+2] = b; png.data[i+3] = a;
}
function fillRect(png, sx, sy, w, h, r, g, b, a = 255) {
  for (let y = sy; y < sy + h; y++)
    for (let x = sx; x < sx + w; x++)
      setPixel(png, x, y, r, g, b, a);
}
function fillEllipse(png, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++)
      if ((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry) <= 1)
        setPixel(png, cx+dx, cy+dy, r, g, b, a);
}
function clearPng(png) {
  for (let i = 0; i < png.data.length; i += 4)
    png.data[i]=png.data[i+1]=png.data[i+2]=png.data[i+3]=0;
}

function generateOfficeTiles() {
  const S = 16, COLS8 = 8, ROWS8 = 8;
  const png = new PNG({ width: COLS8*S, height: ROWS8*S, filterType: -1 });
  clearPng(png);

  function tile(idx, fn) {
    fn(png, (idx % COLS8) * S, Math.floor(idx / COLS8) * S, S);
  }

  tile(1, (p, tx, ty, s) => { // Floor
    fillRect(p,tx,ty,s,s, 208,193,166);
    for (let x=0;x<s;x++) { setPixel(p,tx+x,ty+4,196,180,154); setPixel(p,tx+x,ty+9,202,186,158); setPixel(p,tx+x,ty+13,196,180,154); }
    for (let i=0;i<s;i++) { setPixel(p,tx+i,ty,186,170,146); setPixel(p,tx,ty+i,186,170,146); }
    for (let i=1;i<s;i++) setPixel(p,tx+i,ty+1,222,208,184);
  });
  tile(2, (p, tx, ty, s) => { // Wall
    fillRect(p,tx,ty,s,s, 105,115,138);
    fillRect(p,tx,ty+7,s,1, 95,105,126);
    fillRect(p,tx+8,ty,1,7, 95,105,126);
    fillRect(p,tx+4,ty+8,1,8, 95,105,126);
    fillRect(p,tx+12,ty+8,1,8, 95,105,126);
    fillRect(p,tx,ty,s,1, 126,136,160);
    fillRect(p,tx,ty+s-3,s,3, 76,82,100);
  });
  tile(3, (p, tx, ty, s) => { // Desk
    fillRect(p,tx,ty,s,s, 145,106,66);
    fillRect(p,tx+1,ty+1,s-2,s-2, 166,126,82);
    fillRect(p,tx+2,ty+5,s-4,1, 155,116,72);
    fillRect(p,tx+2,ty+10,s-4,1, 155,116,72);
    fillRect(p,tx+1,ty+1,s-2,1, 186,146,102);
    fillRect(p,tx+1,ty+s-2,s-2,1, 130,92,56);
  });
  tile(4, (p, tx, ty, s) => { // Chair
    fillRect(p,tx,ty,s,s, 208,193,166);
    fillRect(p,tx+3,ty+4,10,8, 72,78,94);
    fillRect(p,tx+4,ty+5,8,6, 92,98,114);
    fillRect(p,tx+4,ty+1,8,4, 62,68,84);
    fillRect(p,tx+5,ty+2,6,2, 82,88,104);
    for (const [px,py] of [[4,12],[11,12],[4,13],[11,13]])
      setPixel(p,tx+px,ty+py, 56,56,60);
  });
  tile(5, (p, tx, ty, s) => { // Computer
    fillRect(p,tx,ty,s,s, 165,126,82);
    fillRect(p,tx+2,ty+1,12,9, 30,30,40);
    fillRect(p,tx+3,ty+2,10,7, 36,46,66);
    fillRect(p,tx+4,ty+3,6,1, 76,196,116);
    fillRect(p,tx+4,ty+5,8,1, 96,176,226);
    fillRect(p,tx+4,ty+7,5,1, 226,176,76);
    fillRect(p,tx+7,ty+10,2,2, 46,46,56);
    fillRect(p,tx+5,ty+12,6,1, 46,46,56);
    fillRect(p,tx+3,ty+13,10,2, 56,56,66);
    fillRect(p,tx+4,ty+13,8,1, 76,76,86);
  });
  tile(6, (p, tx, ty, s) => { // Plant
    fillRect(p,tx,ty,s,s, 208,193,166);
    fillRect(p,tx+5,ty+10,6,5, 155,88,52);
    fillRect(p,tx+6,ty+10,4,1, 175,108,72);
    fillRect(p,tx+4,ty+9,8,1, 165,98,62);
    fillRect(p,tx+7,ty+5,2,5, 52,126,44);
    fillEllipse(p,tx+5,ty+4,3,2, 44,155,58);
    fillEllipse(p,tx+10,ty+5,3,2, 50,145,54);
    fillEllipse(p,tx+8,ty+2,3,2, 66,178,74);
    fillEllipse(p,tx+6,ty+6,2,2, 56,165,64);
  });
  tile(7, (p, tx, ty, s) => { // Window
    fillRect(p,tx,ty,s,s, 105,115,138);
    fillRect(p,tx+1,ty+1,14,14, 82,88,106);
    fillRect(p,tx+2,ty+2,12,12, 152,206,240);
    fillRect(p,tx+2,ty+2,12,4, 132,190,235);
    fillRect(p,tx+2,ty+6,12,4, 165,210,240);
    fillRect(p,tx+2,ty+10,12,4, 196,226,246);
    fillRect(p,tx+2,ty+8,12,1, 92,98,116);
    fillRect(p,tx+8,ty+2,1,12, 92,98,116);
    fillRect(p,tx+4,ty+4,3,2, 235,242,254);
  });
  tile(8, (p, tx, ty, s) => { // Whiteboard
    fillRect(p,tx,ty,s,s, 105,115,138);
    fillRect(p,tx+1,ty+2,14,12, 152,158,170);
    fillRect(p,tx+2,ty+3,12,10, 242,242,246);
    fillRect(p,tx+3,ty+4,3,3, 254,236,92);
    fillRect(p,tx+7,ty+4,3,3, 92,196,254);
    fillRect(p,tx+3,ty+8,4,1, 226,66,66);
    fillRect(p,tx+3,ty+10,8,1, 66,66,226);
    fillRect(p,tx+8,ty+8,3,3, 96,226,116);
    fillRect(p,tx+3,ty+12,10,1, 132,132,145);
  });
  tile(9, (p, tx, ty, s) => { // Carpet
    fillRect(p,tx,ty,s,s, 122,136,178);
    for (let y=0;y<s;y++) for (let x=0;x<s;x++)
      if ((x+y)%4===0) setPixel(p,tx+x,ty+y, 135,150,192);
    for (let i=0;i<s;i++) {
      setPixel(p,tx+i,ty, 105,120,160); setPixel(p,tx,ty+i, 105,120,160);
      setPixel(p,tx+i,ty+s-1, 105,120,160); setPixel(p,tx+s-1,ty+i, 105,120,160);
    }
  });
  tile(10, (p, tx, ty, s) => { // Kitchen
    fillRect(p,tx,ty,s,s, 180,180,186);
    fillRect(p,tx+1,ty+1,s-2,s-2, 194,194,200);
    fillRect(p,tx,ty,s,2, 206,206,212);
    fillRect(p,tx+2,ty+3,5,7, 50,50,56);
    fillRect(p,tx+3,ty+4,3,3, 86,66,46);
    setPixel(p,tx+3,ty+5, 196,46,46);
    fillRect(p,tx+9,ty+6,4,5, 236,236,242);
    fillRect(p,tx+10,ty+7,2,3, 126,86,56);
    setPixel(p,tx+13,ty+8, 236,236,242);
  });
  tile(11, (p, tx, ty, s) => { // Door
    fillRect(p,tx,ty,s,s, 105,115,138);
    fillRect(p,tx+2,ty,12,s, 92,98,116);
    fillRect(p,tx+3,ty+1,10,14, 142,106,68);
    fillRect(p,tx+4,ty+2,8,12, 160,120,80);
    fillRect(p,tx+5,ty+3,6,4, 150,110,73);
    fillRect(p,tx+5,ty+9,6,4, 150,110,73);
    fillRect(p,tx+10,ty+8,2,2, 206,190,70);
    setPixel(p,tx+10,ty+8, 230,216,96);
  });
  tile(12, (p, tx, ty, s) => { // CEO office floor
    fillRect(p,tx,ty,s,s, 155,122,88);
    fillRect(p,tx+1,ty+1,s-2,s-2, 170,136,100);
    for (let x=0;x<s;x++) { setPixel(p,tx+x,ty+5, 145,112,80); setPixel(p,tx+x,ty+11, 145,112,80); }
    fillRect(p,tx+1,ty+1,s-2,1, 190,156,120);
    fillRect(p,tx+1,ty+s-2,s-2,1, 135,102,70);
  });
  tile(13, (p, tx, ty, s) => { // Glass partition
    fillRect(p,tx,ty,s,s, 105,115,138);
    fillRect(p,tx+5,ty,6,s, 92,98,116);
    fillRect(p,tx+6,ty,4,s, 152,198,228, 115);
    fillRect(p,tx+6,ty,4,2, 172,218,246, 135);
    for (let y=2;y<s-2;y+=3) setPixel(p,tx+7,ty+y, 185,222,250, 78);
  });

  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(TILES_DIR, 'office-tiles.png'), buf);
  console.log('  ✓ office-tiles.png');
}

// ===== Furniture =====
function generateFurniture() {
  const png = new PNG({ width: 64, height: 64, filterType: -1 });
  clearPng(png);
  fillRect(png,2,10,28,14,145,106,66); fillRect(png,3,11,26,12,166,126,82);
  fillRect(png,4,12,24,1,186,146,102); fillRect(png,3,22,26,1,130,92,56);
  fillRect(png,4,24,3,6,122,86,52); fillRect(png,25,24,3,6,122,86,52);
  fillRect(png,10,17,12,5,152,112,72); fillRect(png,15,19,2,1,192,156,112);
  fillRect(png,34,2,28,28,126,88,52); fillRect(png,35,3,26,26,142,104,64);
  for (let i=0;i<4;i++){
    const sy=4+i*7; fillRect(png,35,sy,26,1,112,78,46);
    const bc=[[196,50,50],[50,96,196],[50,165,70],[196,170,50]][i];
    for (let bx=0;bx<4;bx++){const x=36+bx*6;fillRect(png,x,sy+1,4+(bx%2),5,...bc);}
  }
  fillRect(png,3,34,26,28,40,44,52); fillRect(png,4,35,24,26,50,54,62);
  for (let i=0;i<5;i++){
    const sy=38+i*5; fillRect(png,5,sy,22,3,60,64,72);
    setPixel(png,23,sy+1,0,250,76); setPixel(png,25,sy+1,250,176,0);
  }
  fillRect(png,38,38,20,24,50,54,60); fillRect(png,39,39,18,22,60,64,70);
  fillRect(png,39,39,18,3,70,74,80);
  fillRect(png,42,43,8,4,36,40,50); fillRect(png,43,44,6,2,56,175,115);
  setPixel(png,52,44,250,56,56); setPixel(png,52,46,96,250,96);
  fillRect(png,42,49,10,2,46,50,56); fillRect(png,42,53,10,6,176,180,186);
  fillRect(png,44,54,6,4,242,242,248); fillRect(png,45,55,4,2,130,90,56);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(SPRITES_DIR, 'furniture.png'), buf);
  console.log('  ✓ furniture.png');
}

// ===== Office Map =====
function generateOfficeMap() {
  const W=30, H=20;
  const floor=[]; for(let y=0;y<H;y++){const row=[];for(let x=0;x<W;x++){
    if(y===0||y===H-1||x===0||x===W-1) row.push(2);
    else if(x>=16&&y>=9&&x<=26&&y<=16) row.push(12);
    else row.push(1);
  } floor.push(row);}
  for(const x of [4,7,10,18,21,24]) floor[0][x]=7;
  floor[H-1][14]=11; floor[H-1][15]=11;
  const obj=Array.from({length:H},()=>Array(W).fill(0));
  for(let y=2;y<8;y++) for(let x=12;x<18;x++) obj[y][x]=9;
  obj[1][14]=8; obj[1][15]=8;
  obj[3][3]=3; obj[3][4]=5; obj[4][3]=4;
  obj[3][7]=3; obj[3][8]=5; obj[4][7]=4;
  obj[3][22]=3; obj[3][23]=5; obj[4][22]=4;
  obj[10][3]=3; obj[10][4]=5; obj[11][3]=4;
  obj[10][7]=3; obj[10][8]=5; obj[11][7]=4;
  obj[10][18]=3; obj[10][19]=5; obj[10][20]=3; obj[11][19]=4;
  obj[9][17]=13; obj[10][17]=13; obj[11][17]=13;
  obj[9][21]=13; obj[10][21]=13; obj[11][21]=13;
  obj[16][25]=10; obj[16][26]=10; obj[16][27]=10;
  for(const [y,x] of [[1,1],[1,W-2],[H-2,1],[H-2,W-2],[8,15],[8,1],[14,W-2],[2,25]]) obj[y][x]=6;
  const map={compressionlevel:-1,height:H,width:W,tilewidth:16,tileheight:16,
    orientation:'orthogonal',renderorder:'right-down',type:'map',version:'1.10',
    infinite:false,nextlayerid:3,nextobjectid:1,
    tilesets:[{columns:8,firstgid:1,image:'../tiles/office-tiles.png',
      imagewidth:128,imageheight:128,margin:0,name:'office-tiles',spacing:0,
      tilecount:64,tilewidth:16,tileheight:16}],
    layers:[
      {id:1,name:'floor',type:'tilelayer',visible:true,opacity:1,x:0,y:0,width:W,height:H,
        data:floor.flat().map(t=>t+1)},
      {id:2,name:'objects',type:'tilelayer',visible:true,opacity:1,x:0,y:0,width:W,height:H,
        data:obj.flat().map(t=>t===0?0:t+1)},
    ]};
  fs.writeFileSync(path.join(MAPS_DIR,'office.json'),JSON.stringify(map,null,2));
  console.log('  ✓ office.json');
}

// ===== Main =====
console.log('🎨 HD 2D 에셋 생성 중 (Canvas API 그라디언트/곡선)...');
ensureDir(SPRITES_DIR); ensureDir(TILES_DIR); ensureDir(MAPS_DIR);
generateAgentSpritesheet();
generateOfficeTiles();
generateFurniture();
generateOfficeMap();
console.log('✅ HD 2D 에셋 생성 완료!');
