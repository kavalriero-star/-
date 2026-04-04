/**
 * HD 2D Asset Generator – 수정된 캐릭터 비율
 * 머리 반지름 11px(기존 18px), 충분한 몸통/다리
 * 64×96px 프레임, 12프레임×6캐릭터
 *
 * 캐릭터 레이아웃 (bottom-anchor):
 *   y=0~3  : 머리카락 상단
 *   y=3~25 : 머리 (center=32,14, r=11)
 *   y=25~32: 목
 *   y=32~64: 상반신(어깨~허리)
 *   y=64~88: 하반신(허벅지~종아리)
 *   y=88~96: 신발
 */
const { createCanvas } = require('canvas');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const SPRITES_DIR = path.join(__dirname, '..', 'public', 'assets', 'sprites');
const TILES_DIR   = path.join(__dirname, '..', 'public', 'assets', 'tiles');
const MAPS_DIR    = path.join(__dirname, '..', 'public', 'assets', 'maps');

const FW = 64, FH = 96;
const COLS = 12, ROWS = 6;

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

// ──────────────────────────────────────────────────────────
// 6 Characters
// ──────────────────────────────────────────────────────────
const CHARS = [
  { // 0: 민준 (PM) – 파란 셔츠, 안경, 갈색 머리
    skin:'#F5C888', skinD:'#C88848', skinL:'#FDDEA0',
    hair:'#2C1C0C', hairH:'#503020', hairD:'#140C04',
    shirt:'#3070D8', shirtD:'#1848A0', shirtL:'#60A0FF',
    pants:'#1E2850', pantsD:'#10162E',
    shoe:'#181008',
    eye:'#2030A8',
    hairStyle:'neat', sex:'M', glasses:'thin', tie:null, headphones:null, hoodie:false,
  },
  { // 1: 지훈 (Dev) – 초록 후드티, 헤드폰, 주황 머리
    skin:'#F5C888', skinD:'#C88848', skinL:'#FDDEA0',
    hair:'#B04818', hairH:'#D87038', hairD:'#682808',
    shirt:'#28A040', shirtD:'#107828', shirtL:'#40C860',
    pants:'#283050', pantsD:'#181C38',
    shoe:'#201808',
    eye:'#187830',
    hairStyle:'messy', sex:'M', glasses:'thick', tie:null, headphones:'#404858', hoodie:true,
  },
  { // 2: 태호 (CEO) – 네이비 수트, 빨간 넥타이, 은발
    skin:'#EEC880', skinD:'#B88040', skinL:'#F8E0A0',
    hair:'#A0A0B0', hairH:'#C8C8D8', hairD:'#606070',
    shirt:'#181C60', shirtD:'#0C1038', shirtL:'#283898',
    pants:'#101438', pantsD:'#080A20',
    shoe:'#100C08',
    eye:'#182048',
    hairStyle:'neat', sex:'M', glasses:null, tie:'#C82020', headphones:null, hoodie:false,
  },
  { // 3: 소연 (Designer) – 보라 탑, 금발 밥컷
    skin:'#F8D090', skinD:'#CC9050', skinL:'#FFE8B0',
    hair:'#F0D040', hairH:'#FFE860', hairD:'#C0A828',
    shirt:'#8030C8', shirtD:'#501888', shirtL:'#B058F8',
    pants:'#302840', pantsD:'#1E1828',
    shoe:'#281C28',
    eye:'#6828A0',
    hairStyle:'bob', sex:'F', glasses:null, tie:null, headphones:null, hoodie:false,
  },
  { // 4: 현우 (QA) – 회색 폴로, 검은 머리
    skin:'#F5C888', skinD:'#C88848', skinL:'#FDDEA0',
    hair:'#181820', hairH:'#303040', hairD:'#080810',
    shirt:'#888898', shirtD:'#585868', shirtL:'#A8A8B8',
    pants:'#202838', pantsD:'#101820',
    shoe:'#181410',
    eye:'#282838',
    hairStyle:'neat', sex:'M', glasses:null, tie:null, headphones:null, hoodie:false,
  },
  { // 5: 유나 (Analyst) – 청록 블레이저, 검은 밥컷
    skin:'#F8D090', skinD:'#CC9050', skinL:'#FFE8B0',
    hair:'#181018', hairH:'#302830', hairD:'#080408',
    shirt:'#189098', shirtD:'#0C5860', shirtL:'#28C0C8',
    pants:'#202838', pantsD:'#101820',
    shoe:'#181018',
    eye:'#107888',
    hairStyle:'bob', sex:'F', glasses:null, tie:null, headphones:null, hoodie:false,
  },
];

// ──────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────
function lg(ctx, x0,y0,x1,y1, stops) {
  const g = ctx.createLinearGradient(x0,y0,x1,y1);
  stops.forEach(([t,c]) => g.addColorStop(t,c));
  return g;
}
function rg(ctx, ix,iy,ir, ox,oy,or_, stops) {
  const g = ctx.createRadialGradient(ix,iy,ir,ox,oy,or_);
  stops.forEach(([t,c]) => g.addColorStop(t,c));
  return g;
}
function roundRect(ctx, x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y, x+w,y+h, r);
  ctx.arcTo(x+w,y+h, x,y+h, r);
  ctx.arcTo(x,y+h, x,y, r);
  ctx.arcTo(x,y, x+w,y, r);
  ctx.closePath();
}
function flipH(src) {
  const dst = createCanvas(FW, FH);
  const c   = dst.getContext('2d');
  c.translate(FW,0); c.scale(-1,1);
  c.drawImage(src,0,0);
  return dst;
}

// ──────────────────────────────────────────────────────────
// Layout constants (all Y values from sprite top)
// ──────────────────────────────────────────────────────────
const HCX = 32;   // head center X
const HCY = 14;   // head center Y  (was 26 → now 14)
const HR  = 11;   // head radius    (was 18 → now 11)

// body landmarks
const NECK_TOP = HCY + HR + 1;  // 26
const NECK_BOT = 33;
const SHLDR_Y  = 33;            // shoulder line
const WAIST_Y  = 62;            // waist / hip top
const THIGH_BOT= 79;
const SHIN_BOT = 89;
const FOOT_BOT = 96;

// widths
const SHLDR_W  = 14;  // half-shoulder width
const WAIST_W  = 10;
const LEG_W    = 8;   // each leg half-width
const LEG_GAP  = 2;

// ──────────────────────────────────────────────────────────
// FRONT – HEAD
// ──────────────────────────────────────────────────────────
function drawHeadFront(ctx, c) {
  // ── neck ──
  ctx.fillStyle = lg(ctx, HCX,NECK_TOP, HCX,NECK_BOT,
    [[0,c.skin],[1,c.skinD]]);
  roundRect(ctx, HCX-5, NECK_TOP, 10, NECK_BOT-NECK_TOP, 3);
  ctx.fill();

  // ── face circle ──
  ctx.fillStyle = rg(ctx, HCX-3,HCY-3,1, HCX,HCY,HR+1,
    [[0,c.skinL],[0.5,c.skin],[1,c.skinD]]);
  ctx.beginPath(); ctx.arc(HCX,HCY,HR,0,Math.PI*2); ctx.fill();

  // ears
  for (const ex of [HCX-HR+1, HCX+HR-1]) {
    ctx.fillStyle = c.skin;
    ctx.beginPath(); ctx.ellipse(ex,HCY+2,3,4,0,0,Math.PI*2); ctx.fill();
  }

  // ── eyes ──
  const EYE_Y = HCY;
  for (const [ex, side] of [[HCX-4.5, -1],[HCX+4.5, 1]]) {
    // white
    ctx.fillStyle='#F8F8FF';
    ctx.beginPath(); ctx.ellipse(ex,EYE_Y,3.5,2.8,0,0,Math.PI*2); ctx.fill();
    // iris
    ctx.fillStyle = rg(ctx,ex-0.5,EYE_Y-0.5,0.3, ex,EYE_Y,2.5,
      [[0,c.eye+'EE'],[0.7,c.eye],[1,'#080808']]);
    ctx.beginPath(); ctx.arc(ex,EYE_Y,2.2,0,Math.PI*2); ctx.fill();
    // pupil
    ctx.fillStyle='#060608';
    ctx.beginPath(); ctx.arc(ex,EYE_Y,1.1,0,Math.PI*2); ctx.fill();
    // highlight
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(ex-0.8,EYE_Y-0.8,0.7,0,Math.PI*2); ctx.fill();
    // eyelid
    ctx.strokeStyle=c.hairD+'99'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.ellipse(ex,EYE_Y,3.5,2.8,0,Math.PI+0.1,Math.PI*2-0.1); ctx.stroke();
    // eyebrow
    ctx.strokeStyle=c.hair; ctx.lineWidth=1.4; ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(ex+side*3.5, EYE_Y-5.5);
    ctx.quadraticCurveTo(ex, EYE_Y-6.5, ex-side*3.5, EYE_Y-5);
    ctx.stroke();
  }

  // blush
  for (const bx of [HCX-8,HCX+8]) {
    ctx.fillStyle = rg(ctx,bx,EYE_Y+4,0, bx,EYE_Y+4,5,
      [[0,'rgba(240,120,120,0.25)'],[1,'rgba(240,120,120,0)']]);
    ctx.beginPath(); ctx.ellipse(bx,EYE_Y+4,5,3.5,0,0,Math.PI*2); ctx.fill();
  }

  // nose
  ctx.strokeStyle=c.skinD+'88'; ctx.lineWidth=0.9; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(HCX-1.5,HCY+4); ctx.lineTo(HCX-2,HCY+6.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(HCX+1.5,HCY+4); ctx.lineTo(HCX+2,HCY+6.5); ctx.stroke();

  // mouth
  ctx.strokeStyle = c.sex==='F' ? c.eye+'99' : '#90404066';
  ctx.lineWidth = c.sex==='F' ? 1.3 : 1.1;
  ctx.beginPath();
  ctx.moveTo(HCX-3, HCY+8);
  ctx.quadraticCurveTo(HCX, HCY+10, HCX+3, HCY+8);
  ctx.stroke();
  if (c.sex==='F') {
    ctx.fillStyle = c.eye+'44';
    ctx.beginPath();
    ctx.moveTo(HCX-3,HCY+8); ctx.quadraticCurveTo(HCX,HCY+11,HCX+3,HCY+8);
    ctx.quadraticCurveTo(HCX,HCY+9.5,HCX-3,HCY+8); ctx.fill();
  }

  // glasses
  if (c.glasses) {
    const gCol = c.glasses==='thin' ? '#9090A0' : '#282830';
    const gW   = c.glasses==='thin' ? 0.9       : 1.8;
    ctx.strokeStyle=gCol; ctx.lineWidth=gW;
    for (const ex of [HCX-4.5,HCX+4.5]) {
      ctx.beginPath(); ctx.arc(ex,EYE_Y,4,0,Math.PI*2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(HCX-0.5,EYE_Y); ctx.lineTo(HCX+0.5,EYE_Y); ctx.stroke();
  }

  // face outline (subtle)
  ctx.strokeStyle=c.skinD+'55'; ctx.lineWidth=0.5;
  ctx.beginPath(); ctx.arc(HCX,HCY,HR,0,Math.PI*2); ctx.stroke();
}

// ──────────────────────────────────────────────────────────
// FRONT – HAIR
// ──────────────────────────────────────────────────────────
function drawHairFront(ctx, c) {
  const g = lg(ctx, HCX-HR,2, HCX+HR,HCY+HR,
    [[0,c.hairH],[0.4,c.hair],[1,c.hairD]]);
  ctx.fillStyle = g;

  if (c.hairStyle==='neat') {
    ctx.beginPath();
    ctx.moveTo(HCX-HR-1, HCY+4);
    ctx.quadraticCurveTo(HCX-HR-2, HCY-4, HCX-HR+2, HCY-HR+2);
    ctx.quadraticCurveTo(HCX-2, HCY-HR-3, HCX+3, HCY-HR-2);
    ctx.quadraticCurveTo(HCX+HR-1, HCY-HR+1, HCX+HR+1, HCY+1);
    ctx.lineTo(HCX+HR, HCY+4);
    ctx.arc(HCX, HCY, HR+0.5, 0.35, Math.PI-0.35, true);
    ctx.closePath();
    ctx.fill();
    // highlight
    ctx.fillStyle='rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(HCX-1,HCY-HR+3,4,2.5,-0.3,0,Math.PI*2); ctx.fill();

  } else if (c.hairStyle==='messy') {
    ctx.beginPath();
    ctx.moveTo(HCX-HR-1, HCY+2);
    ctx.lineTo(HCX-HR-3, HCY-3);
    ctx.lineTo(HCX-HR+2, HCY-HR);
    ctx.lineTo(HCX-HR-1, HCY-HR-4);
    ctx.lineTo(HCX-4,    HCY-HR-6);
    ctx.lineTo(HCX,      HCY-HR-4);
    ctx.lineTo(HCX+4,    HCY-HR-7);
    ctx.lineTo(HCX+HR-2, HCY-HR-2);
    ctx.lineTo(HCX+HR+2, HCY-3);
    ctx.lineTo(HCX+HR,   HCY+2);
    ctx.arc(HCX, HCY, HR+0.5, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();

  } else if (c.hairStyle==='bob') {
    const bobBot = HCY+HR+4;
    ctx.beginPath();
    ctx.moveTo(HCX-HR-2, bobBot);
    ctx.lineTo(HCX-HR-2, HCY-4);
    ctx.arc(HCX, HCY-1, HR+1.5, Math.PI, 0);
    ctx.lineTo(HCX+HR+2, bobBot);
    ctx.quadraticCurveTo(HCX+HR, bobBot+2, HCX, bobBot+2);
    ctx.quadraticCurveTo(HCX-HR, bobBot+2, HCX-HR-2, bobBot);
    ctx.closePath();
    ctx.fill();
    // bang
    ctx.fillStyle=c.hairD;
    ctx.beginPath();
    ctx.moveTo(HCX-HR, HCY+1);
    ctx.quadraticCurveTo(HCX-4, HCY-5, HCX, HCY-4);
    ctx.quadraticCurveTo(HCX+4, HCY-5, HCX+HR, HCY+1);
    ctx.lineTo(HCX+HR-2, HCY+4); ctx.quadraticCurveTo(HCX,HCY+2,HCX-HR+2,HCY+4);
    ctx.closePath(); ctx.fill();
    // highlight
    ctx.fillStyle='rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.ellipse(HCX-2,HCY-HR+1,4,2.5,-0.3,0,Math.PI*2); ctx.fill();
  }

  // headphones (개발자)
  if (c.headphones) {
    ctx.strokeStyle=c.headphones; ctx.lineWidth=3.5;
    ctx.beginPath(); ctx.arc(HCX,HCY-1,HR+4,Math.PI*1.05,0); ctx.stroke();
    ctx.fillStyle=c.headphones;
    ctx.beginPath(); ctx.ellipse(HCX-HR-4,HCY,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(HCX+HR+4,HCY,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#101820';
    ctx.beginPath(); ctx.ellipse(HCX-HR-4,HCY,3,4,0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(HCX+HR+4,HCY,3,4,0,0,Math.PI*2); ctx.fill();
  }
}

// ──────────────────────────────────────────────────────────
// FRONT – BODY
// ──────────────────────────────────────────────────────────
function drawBodyFront(ctx, c, walkF) {
  // ── arms (behind torso) ──
  const armSwing = walkF===1 ? 4 : walkF===2 ? -4 : 0;
  const armColor = lg(ctx, 0,SHLDR_Y, 0,WAIST_Y+5,
    [[0,c.shirt],[1,c.shirtD]]);

  for (const [side, sign] of [[-1,-1],[1,1]]) {
    const ax = HCX + sign*(SHLDR_W+3);
    const armY1 = SHLDR_Y+2;
    const armY2 = WAIST_Y+8 + sign*armSwing;
    const armX2 = ax + sign*4 + sign*armSwing*0.4;
    ctx.fillStyle = armColor;
    ctx.beginPath();
    ctx.moveTo(ax-4, armY1);
    ctx.lineTo(ax+4, armY1);
    ctx.lineTo(armX2+sign*3, armY2);
    ctx.lineTo(armX2-sign*3, armY2);
    ctx.closePath(); ctx.fill();
    // hand
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.ellipse(armX2, armY2+3, 4, 5, sign*0.15, 0, Math.PI*2); ctx.fill();
  }

  // ── torso ──
  ctx.fillStyle = lg(ctx, HCX-SHLDR_W,SHLDR_Y, HCX+SHLDR_W,WAIST_Y,
    [[0,c.shirtL],[0.4,c.shirt],[1,c.shirtD]]);
  ctx.beginPath();
  ctx.moveTo(HCX-SHLDR_W, SHLDR_Y);
  ctx.lineTo(HCX+SHLDR_W, SHLDR_Y);
  ctx.lineTo(HCX+WAIST_W, WAIST_Y);
  ctx.lineTo(HCX-WAIST_W, WAIST_Y);
  ctx.closePath(); ctx.fill();

  // side shading
  ctx.fillStyle='rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.moveTo(HCX-SHLDR_W,SHLDR_Y); ctx.lineTo(HCX-SHLDR_W+5,SHLDR_Y);
  ctx.lineTo(HCX-WAIST_W+3,WAIST_Y); ctx.lineTo(HCX-WAIST_W,WAIST_Y);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(HCX+SHLDR_W-5,SHLDR_Y); ctx.lineTo(HCX+SHLDR_W,SHLDR_Y);
  ctx.lineTo(HCX+WAIST_W,WAIST_Y); ctx.lineTo(HCX+WAIST_W-3,WAIST_Y);
  ctx.closePath(); ctx.fill();

  // hoodie pocket (개발자)
  if (c.hoodie) {
    ctx.strokeStyle=c.shirtD; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(HCX-6,WAIST_Y-10); ctx.lineTo(HCX-7,WAIST_Y-3);
    ctx.lineTo(HCX+7,WAIST_Y-3); ctx.lineTo(HCX+6,WAIST_Y-10);
    ctx.stroke();
  }

  // collar / tie / neckline
  const neckG = lg(ctx, HCX,NECK_TOP, HCX,SHLDR_Y,
    [[0,c.shirtL],[1,c.shirt]]);
  ctx.beginPath();
  ctx.moveTo(HCX-5, NECK_BOT);
  ctx.lineTo(HCX+5, NECK_BOT);
  ctx.lineTo(HCX+7, SHLDR_Y+2);
  ctx.lineTo(HCX-7, SHLDR_Y+2);
  ctx.closePath(); ctx.fillStyle=neckG; ctx.fill();

  if (c.tie) {
    ctx.fillStyle=c.tie;
    ctx.beginPath();
    ctx.moveTo(HCX-3,NECK_BOT+2); ctx.lineTo(HCX+3,NECK_BOT+2);
    ctx.lineTo(HCX+4,NECK_BOT+14); ctx.lineTo(HCX,NECK_BOT+18);
    ctx.lineTo(HCX-4,NECK_BOT+14);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=c.tie.replace('#','#88')||'#880000';
    ctx.beginPath();
    ctx.moveTo(HCX-1,NECK_BOT+2); ctx.lineTo(HCX+1,NECK_BOT+2);
    ctx.lineTo(HCX+1.5,NECK_BOT+12); ctx.lineTo(HCX,NECK_BOT+17);
    ctx.lineTo(HCX-1.5,NECK_BOT+12);
    ctx.closePath();
    ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fill();
  }

  // ── belt ──
  ctx.fillStyle = lg(ctx, HCX-WAIST_W,WAIST_Y, HCX+WAIST_W,WAIST_Y+5,
    [[0,c.pantsD],[0.5,'#484848'],[1,c.pantsD]]);
  roundRect(ctx, HCX-WAIST_W,WAIST_Y,WAIST_W*2,5,2); ctx.fill();
  roundRect(ctx, HCX-4,WAIST_Y,8,5,1);
  ctx.fillStyle='#C8C090'; ctx.fill();

  // ── legs ──
  const legSwing = walkF===1 ? 4 : walkF===2 ? -4 : 0;
  for (const [side, sign] of [[-1,-1],[1,1]]) {
    const lx = HCX + sign*(LEG_GAP+LEG_W*0.5);
    const topX  = lx;
    const botX  = lx + sign*legSwing*0.3;
    const kneeBotX = lx + sign*(legSwing*0.5);

    ctx.fillStyle = lg(ctx, lx,WAIST_Y+5, lx,THIGH_BOT,
      [[0,c.pants],[1,c.pantsD]]);
    ctx.beginPath();
    ctx.moveTo(topX-LEG_W+2, WAIST_Y+5);
    ctx.lineTo(topX+LEG_W-2, WAIST_Y+5);
    ctx.lineTo(kneeBotX+LEG_W-3, THIGH_BOT);
    ctx.lineTo(kneeBotX-LEG_W+3, THIGH_BOT);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = lg(ctx, lx,THIGH_BOT, lx,SHIN_BOT,
      [[0,c.pantsD],[1,c.pants]]);
    ctx.beginPath();
    ctx.moveTo(kneeBotX-LEG_W+3, THIGH_BOT);
    ctx.lineTo(kneeBotX+LEG_W-3, THIGH_BOT);
    ctx.lineTo(botX+LEG_W-4, SHIN_BOT);
    ctx.lineTo(botX-LEG_W+4, SHIN_BOT);
    ctx.closePath(); ctx.fill();

    // shoe
    ctx.fillStyle=c.shoe;
    ctx.beginPath();
    ctx.ellipse(botX+sign*2, SHIN_BOT+4, LEG_W, 5, sign*0.1, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.ellipse(botX+sign*2, SHIN_BOT+2, LEG_W-3, 2, sign*0.1, 0, Math.PI*2);
    ctx.fill();
  }
}

// ──────────────────────────────────────────────────────────
// BACK VIEW
// ──────────────────────────────────────────────────────────
function drawHeadBack(ctx, c) {
  ctx.fillStyle = lg(ctx,HCX,NECK_TOP,HCX,NECK_BOT,[[0,c.skin],[1,c.skinD]]);
  roundRect(ctx,HCX-5,NECK_TOP,10,NECK_BOT-NECK_TOP,3); ctx.fill();

  // back of head (skin visible below hair for sides)
  ctx.fillStyle=c.skin;
  ctx.beginPath(); ctx.arc(HCX,HCY,HR,0,Math.PI*2); ctx.fill();
}

function drawHairBack(ctx, c) {
  const g = lg(ctx, HCX-HR,1, HCX+HR,HCY+HR,
    [[0,c.hairH],[0.5,c.hair],[1,c.hairD]]);
  ctx.fillStyle=g;

  if (c.hairStyle==='bob') {
    const bobBot=HCY+HR+4;
    ctx.beginPath();
    ctx.moveTo(HCX-HR-2,bobBot); ctx.lineTo(HCX-HR-2,HCY-4);
    ctx.arc(HCX,HCY-1,HR+1.5,Math.PI,0);
    ctx.lineTo(HCX+HR+2,bobBot);
    ctx.quadraticCurveTo(HCX+HR,bobBot+2,HCX,bobBot+2);
    ctx.quadraticCurveTo(HCX-HR,bobBot+2,HCX-HR-2,bobBot);
    ctx.closePath(); ctx.fill();
  } else if (c.hairStyle==='messy') {
    ctx.beginPath();
    ctx.moveTo(HCX-HR-1,HCY+2);
    ctx.lineTo(HCX-HR-3,HCY-3); ctx.lineTo(HCX-HR+2,HCY-HR);
    ctx.lineTo(HCX-HR-1,HCY-HR-4); ctx.lineTo(HCX-4,HCY-HR-6);
    ctx.lineTo(HCX,HCY-HR-4); ctx.lineTo(HCX+4,HCY-HR-7);
    ctx.lineTo(HCX+HR-2,HCY-HR-2); ctx.lineTo(HCX+HR+2,HCY-3);
    ctx.lineTo(HCX+HR,HCY+2);
    ctx.arc(HCX,HCY,HR+0.5,0,Math.PI,true); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(HCX-HR-1,HCY+4);
    ctx.quadraticCurveTo(HCX-HR-2,HCY-4,HCX-HR+2,HCY-HR+2);
    ctx.quadraticCurveTo(HCX-2,HCY-HR-3,HCX+3,HCY-HR-2);
    ctx.quadraticCurveTo(HCX+HR-1,HCY-HR+1,HCX+HR+1,HCY+1);
    ctx.lineTo(HCX+HR,HCY+4);
    ctx.arc(HCX,HCY,HR+0.5,0.35,Math.PI-0.35,true); ctx.closePath(); ctx.fill();
  }
  // hair part/highlight
  ctx.strokeStyle=c.hairD; ctx.lineWidth=0.8;
  ctx.beginPath(); ctx.moveTo(HCX,3); ctx.lineTo(HCX,HCY-6); ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.1)';
  ctx.beginPath(); ctx.ellipse(HCX-2,HCY-HR+3,4,2.5,-0.3,0,Math.PI*2); ctx.fill();
}

function drawBodyBack(ctx, c, walkF) {
  const armSwing = walkF===1 ? 4 : walkF===2 ? -4 : 0;
  const armColor = lg(ctx,0,SHLDR_Y,0,WAIST_Y+5,[[0,c.shirt],[1,c.shirtD]]);

  for (const [side,sign] of [[-1,-1],[1,1]]) {
    const ax=HCX+sign*(SHLDR_W+3);
    const armY1=SHLDR_Y+2, armY2=WAIST_Y+8-sign*armSwing;
    const armX2=ax+sign*4-sign*armSwing*0.4;
    ctx.fillStyle=armColor;
    ctx.beginPath();
    ctx.moveTo(ax-4,armY1); ctx.lineTo(ax+4,armY1);
    ctx.lineTo(armX2+sign*3,armY2); ctx.lineTo(armX2-sign*3,armY2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=c.skin;
    ctx.beginPath(); ctx.ellipse(armX2,armY2+3,4,5,sign*0.15,0,Math.PI*2); ctx.fill();
  }

  ctx.fillStyle=lg(ctx,HCX-SHLDR_W,SHLDR_Y,HCX+SHLDR_W,WAIST_Y,
    [[0,c.shirt],[0.5,c.shirtD],[1,c.shirtD]]);
  ctx.beginPath();
  ctx.moveTo(HCX-SHLDR_W,SHLDR_Y); ctx.lineTo(HCX+SHLDR_W,SHLDR_Y);
  ctx.lineTo(HCX+WAIST_W,WAIST_Y); ctx.lineTo(HCX-WAIST_W,WAIST_Y);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle=lg(ctx,HCX-WAIST_W,WAIST_Y,HCX+WAIST_W,WAIST_Y+5,
    [[0,c.pantsD],[0.5,'#484848'],[1,c.pantsD]]);
  roundRect(ctx,HCX-WAIST_W,WAIST_Y,WAIST_W*2,5,2); ctx.fill();

  const legSwing = walkF===1 ? 4 : walkF===2 ? -4 : 0;
  for (const [side,sign] of [[-1,-1],[1,1]]) {
    const lx=HCX+sign*(LEG_GAP+LEG_W*0.5);
    const botX=lx+sign*legSwing*0.3;
    const kneeBotX=lx+sign*(legSwing*0.5);
    ctx.fillStyle=lg(ctx,lx,WAIST_Y+5,lx,THIGH_BOT,[[0,c.pants],[1,c.pantsD]]);
    ctx.beginPath();
    ctx.moveTo(lx-LEG_W+2,WAIST_Y+5); ctx.lineTo(lx+LEG_W-2,WAIST_Y+5);
    ctx.lineTo(kneeBotX+LEG_W-3,THIGH_BOT); ctx.lineTo(kneeBotX-LEG_W+3,THIGH_BOT);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=lg(ctx,lx,THIGH_BOT,lx,SHIN_BOT,[[0,c.pantsD],[1,c.pants]]);
    ctx.beginPath();
    ctx.moveTo(kneeBotX-LEG_W+3,THIGH_BOT); ctx.lineTo(kneeBotX+LEG_W-3,THIGH_BOT);
    ctx.lineTo(botX+LEG_W-4,SHIN_BOT); ctx.lineTo(botX-LEG_W+4,SHIN_BOT);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle=c.shoe;
    ctx.beginPath(); ctx.ellipse(botX+sign*2,SHIN_BOT+4,LEG_W,5,sign*0.1,0,Math.PI*2); ctx.fill();
  }
}

// ──────────────────────────────────────────────────────────
// SIDE VIEW (right-facing; left = flipH)
// ──────────────────────────────────────────────────────────
function drawFrameSide(ctx, c, walkF) {
  // In side view, character faces RIGHT
  // Head center shifted right to ~(38, 14)
  const SHX = 36;  // side head center X

  // neck
  ctx.fillStyle=lg(ctx,SHX,NECK_TOP,SHX,NECK_BOT,[[0,c.skin],[1,c.skinD]]);
  roundRect(ctx,SHX-5,NECK_TOP,10,NECK_BOT-NECK_TOP,3); ctx.fill();

  // face oval (slightly elongated sideways)
  ctx.fillStyle=rg(ctx,SHX-2,HCY-2,1,SHX,HCY,HR,
    [[0,c.skinL],[0.5,c.skin],[1,c.skinD]]);
  ctx.beginPath(); ctx.ellipse(SHX,HCY,HR,HR-1,0,0,Math.PI*2); ctx.fill();

  // ear (far side, left at SHX-HR)
  ctx.fillStyle=c.skin;
  ctx.beginPath(); ctx.ellipse(SHX-HR+1,HCY+2,3,4,0,0,Math.PI*2); ctx.fill();

  // nose profile
  ctx.strokeStyle=c.skinD+'99'; ctx.lineWidth=1; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(SHX+HR-1,HCY+2);
  ctx.quadraticCurveTo(SHX+HR+3,HCY+4,SHX+HR+1,HCY+7);
  ctx.stroke();

  // one eye
  const EX=SHX+4, EY=HCY;
  ctx.fillStyle='#F8F8FF';
  ctx.beginPath(); ctx.ellipse(EX,EY,3,2.5,0,0,Math.PI*2); ctx.fill();
  ctx.fillStyle=rg(ctx,EX-0.5,EY-0.5,0.3,EX,EY,2,[[0,c.eye+'DD'],[0.7,c.eye],[1,'#080808']]);
  ctx.beginPath(); ctx.arc(EX,EY,1.8,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#060608';
  ctx.beginPath(); ctx.arc(EX,EY,0.9,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(EX-0.5,EY-0.6,0.6,0,Math.PI*2); ctx.fill();
  // eyebrow
  ctx.strokeStyle=c.hair; ctx.lineWidth=1.3; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(EX-3,EY-5); ctx.quadraticCurveTo(EX,EY-6.5,EX+3,EY-5); ctx.stroke();

  // mouth profile
  ctx.strokeStyle=c.sex==='F'?c.eye+'66':'#80404066';
  ctx.lineWidth=1; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(SHX+HR-2,HCY+8); ctx.lineTo(SHX+HR,HCY+9.5); ctx.stroke();

  // hair side
  const hg=lg(ctx,SHX-HR,2,SHX+HR,HCY+HR,[[0,c.hairH],[0.5,c.hair],[1,c.hairD]]);
  ctx.fillStyle=hg;
  if (c.hairStyle==='bob') {
    ctx.beginPath();
    ctx.moveTo(SHX-HR-1,HCY+HR+4); ctx.lineTo(SHX-HR-2,HCY-2);
    ctx.arc(SHX,HCY-1,HR+1,Math.PI,0);
    ctx.lineTo(SHX+HR+1,HCY+HR+4);
    ctx.quadraticCurveTo(SHX+HR-2,HCY+HR+6,SHX,HCY+HR+6);
    ctx.quadraticCurveTo(SHX-HR+2,HCY+HR+6,SHX-HR-1,HCY+HR+4);
    ctx.closePath(); ctx.fill();
  } else if (c.hairStyle==='messy') {
    ctx.beginPath();
    ctx.moveTo(SHX-HR,HCY+2); ctx.lineTo(SHX-HR-2,HCY-3);
    ctx.lineTo(SHX-HR+2,HCY-HR); ctx.lineTo(SHX-3,HCY-HR-5);
    ctx.lineTo(SHX+2,HCY-HR-3); ctx.lineTo(SHX+HR-1,HCY-HR);
    ctx.lineTo(SHX+HR+2,HCY-3); ctx.lineTo(SHX+HR,HCY+2);
    ctx.arc(SHX,HCY,HR+0.5,0,Math.PI,true); ctx.closePath(); ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(SHX-HR,HCY+4);
    ctx.quadraticCurveTo(SHX-HR-2,HCY-2,SHX-HR+2,HCY-HR+1);
    ctx.quadraticCurveTo(SHX+1,HCY-HR-2,SHX+HR-1,HCY-HR+1);
    ctx.lineTo(SHX+HR,HCY+4);
    ctx.arc(SHX,HCY,HR+0.5,0.4,Math.PI-0.4,true); ctx.closePath(); ctx.fill();
  }

  // headphones side
  if (c.headphones) {
    ctx.strokeStyle=c.headphones; ctx.lineWidth=3.5;
    ctx.beginPath(); ctx.arc(SHX,HCY-1,HR+4,Math.PI*1.05,0); ctx.stroke();
    ctx.fillStyle=c.headphones;
    ctx.beginPath(); ctx.ellipse(SHX-HR-4,HCY,5,6,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#101820';
    ctx.beginPath(); ctx.ellipse(SHX-HR-4,HCY,3,4,0,0,Math.PI*2); ctx.fill();
  }

  // ── side body ──
  const armSwing = walkF===1 ? 6 : walkF===2 ? -6 : 0;
  const legSwing = walkF===1 ? 8 : walkF===2 ? -8 : 0;

  // back arm
  ctx.fillStyle=lg(ctx,0,SHLDR_Y,0,WAIST_Y+10,[[0,c.shirt],[1,c.shirtD]]);
  const baX=SHX-4;
  ctx.beginPath();
  ctx.moveTo(baX-4,SHLDR_Y+4); ctx.lineTo(baX+4,SHLDR_Y+4);
  ctx.lineTo(baX+3-armSwing*0.3,WAIST_Y+6-armSwing);
  ctx.lineTo(baX-3-armSwing*0.3,WAIST_Y+6-armSwing);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle=c.skin;
  ctx.beginPath(); ctx.ellipse(baX-armSwing*0.3,WAIST_Y+9-armSwing,4,5,0,0,Math.PI*2); ctx.fill();

  // torso side (narrower)
  ctx.fillStyle=lg(ctx,SHX-9,SHLDR_Y,SHX+9,WAIST_Y,
    [[0,c.shirtL],[0.4,c.shirt],[1,c.shirtD]]);
  ctx.beginPath();
  ctx.moveTo(SHX-8,SHLDR_Y); ctx.lineTo(SHX+8,SHLDR_Y);
  ctx.lineTo(SHX+6,WAIST_Y); ctx.lineTo(SHX-6,WAIST_Y);
  ctx.closePath(); ctx.fill();

  // hoodie
  if (c.hoodie) {
    ctx.strokeStyle=c.shirtD; ctx.lineWidth=1;
    ctx.beginPath();
    ctx.moveTo(SHX-3,WAIST_Y-10); ctx.lineTo(SHX-4,WAIST_Y-3);
    ctx.lineTo(SHX+4,WAIST_Y-3); ctx.lineTo(SHX+3,WAIST_Y-10);
    ctx.stroke();
  }

  // front arm
  ctx.fillStyle=lg(ctx,0,SHLDR_Y,0,WAIST_Y+10,[[0,c.shirt],[1,c.shirtD]]);
  const faX=SHX+4;
  ctx.beginPath();
  ctx.moveTo(faX-4,SHLDR_Y+4); ctx.lineTo(faX+4,SHLDR_Y+4);
  ctx.lineTo(faX+3+armSwing*0.3,WAIST_Y+6+armSwing);
  ctx.lineTo(faX-3+armSwing*0.3,WAIST_Y+6+armSwing);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle=c.skin;
  ctx.beginPath(); ctx.ellipse(faX+armSwing*0.3,WAIST_Y+9+armSwing,4,5,0,0,Math.PI*2); ctx.fill();

  // belt
  ctx.fillStyle=lg(ctx,SHX-7,WAIST_Y,SHX+7,WAIST_Y+5,
    [[0,c.pantsD],[0.5,'#484848'],[1,c.pantsD]]);
  roundRect(ctx,SHX-7,WAIST_Y,14,5,2); ctx.fill();

  // back leg
  const blX=SHX-4;
  ctx.fillStyle=lg(ctx,blX,WAIST_Y+5,blX,THIGH_BOT,[[0,c.pants],[1,c.pantsD]]);
  ctx.beginPath();
  ctx.moveTo(blX-5,WAIST_Y+5); ctx.lineTo(blX+5,WAIST_Y+5);
  ctx.lineTo(blX+5+legSwing*0.3,THIGH_BOT); ctx.lineTo(blX-5+legSwing*0.3,THIGH_BOT);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle=lg(ctx,blX,THIGH_BOT,blX,SHIN_BOT,[[0,c.pantsD],[1,c.pants]]);
  ctx.beginPath();
  ctx.moveTo(blX-5+legSwing*0.3,THIGH_BOT); ctx.lineTo(blX+5+legSwing*0.3,THIGH_BOT);
  ctx.lineTo(blX+4+legSwing*0.5,SHIN_BOT); ctx.lineTo(blX-4+legSwing*0.5,SHIN_BOT);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle=c.shoe;
  ctx.beginPath();
  ctx.ellipse(blX+legSwing*0.5+2,SHIN_BOT+4,7,5,0.1,0,Math.PI*2); ctx.fill();

  // front leg
  const flX=SHX+4;
  ctx.fillStyle=lg(ctx,flX,WAIST_Y+5,flX,THIGH_BOT,[[0,c.pants],[1,c.pantsD]]);
  ctx.beginPath();
  ctx.moveTo(flX-5,WAIST_Y+5); ctx.lineTo(flX+5,WAIST_Y+5);
  ctx.lineTo(flX+5-legSwing*0.3,THIGH_BOT); ctx.lineTo(flX-5-legSwing*0.3,THIGH_BOT);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle=lg(ctx,flX,THIGH_BOT,flX,SHIN_BOT,[[0,c.pantsD],[1,c.pants]]);
  ctx.beginPath();
  ctx.moveTo(flX-5-legSwing*0.3,THIGH_BOT); ctx.lineTo(flX+5-legSwing*0.3,THIGH_BOT);
  ctx.lineTo(flX+4-legSwing*0.5,SHIN_BOT); ctx.lineTo(flX-4-legSwing*0.5,SHIN_BOT);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle=c.shoe;
  ctx.beginPath();
  ctx.ellipse(flX-legSwing*0.5+2,SHIN_BOT+4,8,5,0.1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.ellipse(flX-legSwing*0.5+3,SHIN_BOT+2,5,2,0.1,0,Math.PI*2); ctx.fill();

  // glasses side
  if (c.glasses) {
    ctx.strokeStyle=c.glasses==='thin'?'#9090A0':'#282830';
    ctx.lineWidth=c.glasses==='thin'?0.9:1.8;
    ctx.beginPath(); ctx.arc(EX,EY,3.5,0,Math.PI*2); ctx.stroke();
  }

  // tie side
  if (c.tie) {
    ctx.fillStyle=c.tie;
    ctx.beginPath();
    ctx.moveTo(SHX+2,NECK_BOT+2); ctx.lineTo(SHX+5,NECK_BOT+2);
    ctx.lineTo(SHX+5,NECK_BOT+14); ctx.lineTo(SHX+3,NECK_BOT+18);
    ctx.lineTo(SHX+2,NECK_BOT+14);
    ctx.closePath(); ctx.fill();
  }
}

// ──────────────────────────────────────────────────────────
// Build full spritesheet
// ──────────────────────────────────────────────────────────
function buildAgentSpritesheet() {
  const sheet = createCanvas(FW * COLS, FH * ROWS);
  const ctx   = sheet.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // walk frames per direction: [0]=idle/neutral, [1]=step1, [2]=step2
  // dir: 0=down,1=left,2=right,3=up
  // columns: down(0,1,2), left(3,4,5), right(6,7,8), up(9,10,11)

  for (let ci = 0; ci < ROWS; ci++) {
    const c = CHARS[ci];
    const rowY = ci * FH;

    // direction loop
    for (let dir = 0; dir < 4; dir++) {
      for (let fi = 0; fi < 3; fi++) {
        const col = dir * 3 + fi;
        const frameX = col * FW;
        const walkF = fi; // 0,1,2

        // draw into temp canvas then blit
        const tmp = createCanvas(FW, FH);
        const tc  = tmp.getContext('2d');
        tc.imageSmoothingEnabled = true;
        tc.imageSmoothingQuality = 'high';

        if (dir === 0) {
          // DOWN (front)
          drawBodyFront(tc, c, walkF);
          drawHeadFront(tc, c);
          drawHairFront(tc, c);
        } else if (dir === 3) {
          // UP (back)
          drawHeadBack(tc, c);
          drawBodyBack(tc, c, walkF);
          drawHairBack(tc, c);
        } else if (dir === 2) {
          // RIGHT
          drawFrameSide(tc, c, walkF);
        } else {
          // LEFT = mirror of RIGHT
          const mirror = createCanvas(FW, FH);
          const mc = mirror.getContext('2d');
          mc.imageSmoothingEnabled = true;
          drawFrameSide(mc, c, walkF);
          tc.drawImage(flipH(mirror), 0, 0);
        }

        ctx.drawImage(tmp, frameX, rowY);
      }
    }
  }

  return sheet;
}

// ──────────────────────────────────────────────────────────
// TILE MAP (pngjs – 픽셀 아트 유지)
// ──────────────────────────────────────────────────────────
function px(png, x, y, r, g, b, a=255) {
  if (x<0||y<0||x>=png.width||y>=png.height) return;
  const i=(y*png.width+x)*4;
  png.data[i]=r; png.data[i+1]=g; png.data[i+2]=b; png.data[i+3]=a;
}
function rect(png,x,y,w,h,r,g,b,a=255){
  for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) px(png,x+dx,y+dy,r,g,b,a);
}
function border(png,x,y,w,h,r,g,b,a=255){
  for(let dx=0;dx<w;dx++){px(png,x+dx,y,r,g,b,a);px(png,x+dx,y+h-1,r,g,b,a);}
  for(let dy=0;dy<h;dy++){px(png,x,y+dy,r,g,b,a);px(png,x+w-1,y+dy,r,g,b,a);}
}

function buildTileset() {
  const TW=16, rows=8, cols=8;
  const png=new PNG({width:cols*TW,height:rows*TW});
  png.data=Buffer.alloc(cols*TW*rows*TW*4,0);

  function tile(tx,ty,fn){
    const ox=tx*TW, oy=ty*TW;
    const sub={width:TW,height:TW,data:png.data,_ox:ox,_oy:oy,_pw:cols*TW};
    const spx=(x,y,r,g,b,a=255)=>{
      if(x<0||y<0||x>=TW||y>=TW)return;
      const i=((oy+y)*(cols*TW)+(ox+x))*4;
      png.data[i]=r;png.data[i+1]=g;png.data[i+2]=b;png.data[i+3]=a;
    };
    fn(spx,TW);
  }

  // 0,0 – empty/transparent
  tile(0,0,(p)=>{});
  // 1,0 – floor (warm beige)
  tile(1,0,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++){
      const v=220+((x+y)%2)*8; p(x,y,v,v-10,v-20);
    }
    for(let x=0;x<16;x++) p(x,0,180,170,150);
    for(let y=0;y<16;y++) p(0,y,180,170,150);
  });
  // 2,0 – wall (dark blue-grey)
  tile(2,0,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++){
      const v=40+((x^y)&3)*4; p(x,y,v,v+5,v+15);
    }
    for(let x=0;x<16;x++) p(x,0,60,65,90);
    for(let y=0;y<16;y++) p(15,y,25,28,45);
  });
  // 3,0 – desk top (medium brown)
  tile(3,0,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++){
      p(x,y,120-y*2,80-y*1,50-y);
    }
    for(let x=0;x<16;x++){p(x,0,160,110,70);p(x,15,80,54,30);}
    for(let y=0;y<16;y++){p(0,y,160,110,70);p(15,y,90,60,35);}
  });
  // 4,0 – chair seat (grey)
  tile(4,0,(p)=>{
    for(let y=2;y<14;y++) for(let x=2;x<14;x++) p(x,y,100,100,120);
    border({width:16,height:16,data:png.data},4,0,12,12,60,60,80);
  });
  // 5,0 – computer monitor
  tile(5,0,(p)=>{
    for(let y=2;y<12;y++) for(let x=2;x<14;x++) p(x,y,20,30,50);
    border({width:16,height:16,data:png.data},5,0,14,12,50,60,80);
    for(let y=3;y<11;y++) for(let x=3;x<13;x++){
      const v=30+Math.floor(Math.random()*20); p(x,y,0,v,v*2);
    }
    for(let x=5;x<11;x++) p(x,13,60,60,60);
    for(let x=4;x<12;x++) p(x,14,80,80,80);
  });
  // 6,0 – plant pot
  tile(6,0,(p)=>{
    for(let y=8;y<14;y++) for(let x=5;x<11;x++) p(x,y,140,80,40);
    for(let x=6;x<10;x++) p(x,14,120,65,30);
    for(let y=0;y<8;y++) for(let x=4;x<12;x++){
      if(Math.random()<0.4) p(x,y,20+Math.floor(Math.random()*40),120+Math.floor(Math.random()*40),20);
    }
  });
  // 7,0 – window
  tile(7,0,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) p(x,y,180,210,240);
    for(let x=0;x<16;x++){p(x,0,100,120,160);p(x,15,100,120,160);}
    for(let y=0;y<16;y++){p(0,y,100,120,160);p(15,y,100,120,160);}
    for(let y=0;y<16;y++) p(7,y,100,120,160);
    for(let x=0;x<16;x++) p(x,7,100,120,160);
  });
  // 0,1 – carpet (meeting room)
  tile(0,1,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++){
      p(x,y,60+((x+y)%3)*8,70+((x*y)%3)*6,120+((x-y+16)%3)*5);
    }
  });
  // 1,1 – whiteboard
  tile(1,1,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) p(x,y,240,245,250);
    for(let x=0;x<16;x++){p(x,0,160,160,170);p(x,15,160,160,170);}
    for(let y=0;y<16;y++){p(0,y,160,160,170);p(15,y,160,160,170);}
    p(3,5,50,80,200);p(4,5,50,80,200);p(5,4,50,80,200);
    p(6,6,50,80,200);p(7,5,50,80,200);
  });
  // 2,1 – door
  tile(2,1,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) p(x,y,100,65,35);
    for(let x=0;x<16;x++){p(x,0,70,45,20);p(x,15,120,80,45);}
    for(let y=0;y<16;y++){p(0,y,70,45,20);p(15,y,120,80,45);}
    for(let y=3;y<13;y++) for(let x=3;x<13;x++) p(x,y,115,75,42);
    p(12,8,200,160,100);p(12,9,200,160,100);
  });
  // 3,1 – bookshelf
  tile(3,1,(p)=>{
    for(let y=0;y<16;y++) for(let x=0;x<16;x++) p(x,y,90,60,30);
    for(let y=0;y<16;y+=5){
      for(let x=1;x<15;x++) p(x,y,70,45,20);
    }
    const cols2=[[200,50,50],[50,150,200],[50,200,100],[220,180,50],[180,50,220]];
    let bx=1;
    for(const [r2,g2,b2] of cols2){
      for(let y=1;y<4;y++) p(bx,y,r2,g2,b2);
      bx+=3;
    }
  });

  return png;
}

// ──────────────────────────────────────────────────────────
// MAP JSON
// ──────────────────────────────────────────────────────────
function buildMap() {
  const W=30,H=20;
  // Tile GIDs (firstgid=1): value = tileset index + 1
  // tile(0,0)=1=empty, tile(1,0)=2=floor, tile(2,0)=3=wall ...
  const T = {
    empty:0, floor:2, wall:3,
    desk:4, chair:5, monitor:6, plant:7, window_:8,
    carpet:9, whiteboard:10, door:11, shelf:12,
  };

  const f=Array.from({length:H},()=>Array(W).fill(T.floor));
  const o=Array.from({length:H},()=>Array(W).fill(T.empty));

  // perimeter walls
  for(let x=0;x<W;x++){f[0][x]=T.wall;f[H-1][x]=T.wall;}
  for(let y=0;y<H;y++){f[y][0]=T.wall;f[y][W-1]=T.wall;}

  // CEO office (top-right)
  for(let y=1;y<8;y++) for(let x=16;x<W-1;x++) f[y][x]=T.floor;
  for(let y=1;y<8;y++){f[y][16]=T.wall;}
  for(let x=16;x<W-1;x++) f[8][x]=T.wall;
  f[4][16]=T.door; // CEO office door

  // Meeting room (top-center)
  for(let y=1;y<8;y++) for(let x=8;x<16;x++) f[y][x]=T.carpet;
  for(let y=1;y<8;y++){f[y][8]=T.wall;f[y][15]=T.wall;}
  for(let x=8;x<16;x++) f[8][x]=T.wall;
  f[4][15]=T.door;

  // windows on top wall
  for(const wx of [3,12,20,27]) o[1][wx]=T.window_;

  // desks (open plan bottom)
  // desk row 1 (y=4-5)
  for(const dx of [3,7,12]) { o[4][dx]=T.desk; o[4][dx+1]=T.monitor; o[5][dx]=T.chair; }
  // desk row 2 (y=11-12)
  for(const dx of [3,7]) { o[11][dx]=T.desk; o[11][dx+1]=T.monitor; o[12][dx]=T.chair; }
  // CEO desk
  o[3][24]=T.desk; o[3][25]=T.monitor; o[4][24]=T.chair;

  // meeting table
  for(let x=10;x<14;x++) o[4][x]=T.desk;
  for(const mx of [10,13]) for(let my=3;my<7;my++) o[my][mx]=T.chair;

  // whiteboard
  o[2][9]=T.whiteboard;

  // plants
  for(const [py,px2] of [[1,1],[1,W-3],[H-2,1],[H-2,W-3],[9,14]]) o[py][px2]=T.plant;

  // shelves
  o[2][17]=T.shelf; o[2][18]=T.shelf;

  function flat(arr){return arr.flat().map(v=>v);}

  return {
    height:H, width:W,
    tilewidth:16, tileheight:16,
    infinite:false, orientation:'orthogonal',
    renderorder:'right-down', type:'map', version:'1.10',
    nextlayerid:3, nextobjectid:1,
    tilesets:[{
      firstgid:1, name:'office-tiles',
      image:'../tiles/office-tiles.png',
      tilewidth:16, tileheight:16,
      imagewidth:128, imageheight:128,
      columns:8, tilecount:64,
      spacing:0, margin:0,
    }],
    layers:[
      {id:1,name:'floor',type:'tilelayer',width:W,height:H,x:0,y:0,opacity:1,visible:true,data:flat(f)},
      {id:2,name:'objects',type:'tilelayer',width:W,height:H,x:0,y:0,opacity:1,visible:true,data:flat(o)},
    ],
  };
}

// ──────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────
async function main() {
  ensureDir(SPRITES_DIR); ensureDir(TILES_DIR); ensureDir(MAPS_DIR);

  // 1. Characters
  console.log('캐릭터 스프라이트 생성 중...');
  const sheet = buildAgentSpritesheet();
  const agentPath = path.join(SPRITES_DIR,'agent.png');
  fs.writeFileSync(agentPath, sheet.toBuffer('image/png'));
  console.log(`✅ agent.png HD 2D (${FW}x${FH}, Canvas API, ${ROWS}캐릭터×${COLS}프레임)`);

  // 2. Tiles
  console.log('타일셋 생성 중...');
  const tilePng = buildTileset();
  const tileData = PNG.sync.write(tilePng);
  fs.writeFileSync(path.join(TILES_DIR,'office-tiles.png'), tileData);
  console.log('✅ office-tiles.png');

  // 3. Map
  const mapJson = buildMap();
  fs.writeFileSync(path.join(MAPS_DIR,'office.json'), JSON.stringify(mapJson, null, 2));
  console.log('✅ office.json');

  console.log('\n🎨 모든 에셋 생성 완료!');
}

main().catch(console.error);
