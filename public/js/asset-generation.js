// ═══════════════════════════════════════════════════════
// Asset generation: detailed pixel sprites + tileset (16x16)
// ═══════════════════════════════════════════════════════

// 16 character profiles — varied roles, outfits, hair, accessories
// outfit: 'suit'|'shirt'|'tee'|'hoodie'|'blouse'|'dress'|'reception'
// hairStyle: 'short'|'long'|'pony'|'bald'|'bun'|'curly'|'sidecut'
// accessory: 'glasses'|'tie'|'badge'|'headset'|null
const CHARS = [
  // 0 PM — navy suit, glasses
  { shirt:[40,55,110], pants:[28,32,60], hair:[44,28,12],
    skin:[245,205,170], outfit:'suit', tie:[180,40,50], hairStyle:'short', accessory:'glasses', badge:true },
  // 1 시니어 개발자 — green hoodie
  { shirt:[40,140,80], pants:[40,48,80], hair:[120,72,40],
    skin:[238,200,160], outfit:'hoodie', hairStyle:'short', accessory:'glasses' },
  // 2 CEO — dark suit, silver hair, red tie
  { shirt:[20,20,40], pants:[16,20,36], hair:[180,180,190],
    skin:[238,205,175], outfit:'suit', tie:[200,40,50], hairStyle:'short', accessory:null, badge:true },
  // 3 디자이너 — purple, blonde
  { shirt:[140,80,200], pants:[60,50,80], hair:[240,210,100],
    skin:[245,210,180], outfit:'blouse', hairStyle:'long', accessory:'glasses' },
  // 4 QA — gray, black hair
  { shirt:[100,100,115], pants:[40,45,60], hair:[24,20,28],
    skin:[235,195,160], outfit:'shirt', hairStyle:'short', accessory:'glasses' },
  // 5 데이터 — teal, dark hair, ponytail
  { shirt:[28,140,150], pants:[40,48,72], hair:[40,28,32],
    skin:[240,200,170], outfit:'blouse', hairStyle:'pony', accessory:'glasses' },
  // 6 영업 매니저 — red shirt, brown hair
  { shirt:[200,80,80], pants:[44,36,52], hair:[110,68,30],
    skin:[238,200,170], outfit:'shirt', hairStyle:'short', accessory:'tie', badge:true },
  // 7 제조 — yellow polo, dark hair
  { shirt:[220,170,40], pants:[60,50,72], hair:[56,32,20],
    skin:[235,190,150], outfit:'tee', hairStyle:'short', accessory:'badge' },
  // 8 DevOps — charcoal tee, redhead
  { shirt:[60,60,70], pants:[40,40,50], hair:[180,80,40],
    skin:[245,210,180], outfit:'tee', hairStyle:'curly', accessory:'headset' },
  // 9 구매 — sky blue blouse, sandy hair
  { shirt:[150,200,240], pants:[30,50,90], hair:[230,200,150],
    skin:[245,210,180], outfit:'blouse', hairStyle:'long', accessory:'badge' },
  // 10 영업 팀장 — pink, dark hair, bun
  { shirt:[225,130,170], pants:[64,40,60], hair:[40,24,20],
    skin:[245,205,175], outfit:'dress', hairStyle:'bun', accessory:'tie', badge:true },
  // 11 프론트 — cyan, blonde
  { shirt:[80,180,225], pants:[40,55,80], hair:[210,170,90],
    skin:[245,210,180], outfit:'tee', hairStyle:'short', accessory:'headset' },
  // 12 인사 — tan blouse, auburn
  { shirt:[210,170,130], pants:[80,56,40], hair:[160,80,32],
    skin:[245,205,175], outfit:'blouse', hairStyle:'long', accessory:null, badge:true },
  // 13 백엔드 — indigo hoodie
  { shirt:[88,80,180], pants:[32,32,60], hair:[40,28,20],
    skin:[238,195,160], outfit:'hoodie', hairStyle:'sidecut', accessory:'glasses' },
  // 14 재무 — cream shirt, chestnut
  { shirt:[245,225,200], pants:[88,72,56], hair:[120,72,40],
    skin:[245,210,180], outfit:'shirt', hairStyle:'short', accessory:'tie', badge:true },
  // 15 리셉션 — forest green dress, dark hair
  { shirt:[70,140,120], pants:[48,40,32], hair:[28,20,12],
    skin:[245,210,180], outfit:'reception', hairStyle:'long', accessory:'badge' },
];
const SHOE=[28,22,18];

// Frames: col 0=left, 1=right, 2=up, 3=down
function generateSpritesheet() {
  const c = document.createElement('canvas');
  const fw=16, fh=24, COLS=4, ROWS=CHARS.length;
  c.width = fw*COLS; c.height = fh*ROWS;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(c.width, c.height);
  const d = id.data;
  function sp(x,y,r,g,b,a=255){
    if(x<0||y<0||x>=c.width||y>=c.height) return;
    const i=(y*c.width+x)*4; d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=a;
  }
  function dr(x,y,w,h,col){ for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) sp(x+dx,y+dy,col[0],col[1],col[2]); }
  function shade(col, factor){
    return [Math.max(0,Math.min(255,col[0]*factor)|0),
            Math.max(0,Math.min(255,col[1]*factor)|0),
            Math.max(0,Math.min(255,col[2]*factor)|0)];
  }

  for(let row=0; row<ROWS; row++) {
    for(let col=0; col<COLS; col++) {
      const ox=col*fw, oy=row*fh, ch=CHARS[row];
      const SKIN = ch.skin;
      const SKIN_SH = shade(SKIN, 0.85);
      const SHIRT_SH = shade(ch.shirt, 0.78);
      const SHIRT_HL = shade(ch.shirt, 1.15);
      const PANTS_SH = shade(ch.pants, 0.7);

      const facing = col; // 0=L,1=R,2=U,3=D
      const isUp = facing===2;
      const isWalkA = (col===0); // left frame as walk pose A
      const isWalkB = (col===1);

      // ── HAIR (top of head) ──
      if(ch.hairStyle === 'long'){
        dr(ox+4,oy+0,8,5,ch.hair);
        // long sides
        if(!isUp){ dr(ox+3,oy+3,1,7,ch.hair); dr(ox+12,oy+3,1,7,ch.hair); }
        else { dr(ox+3,oy+3,10,5,ch.hair); }
      } else if(ch.hairStyle === 'pony'){
        dr(ox+5,oy+0,6,4,ch.hair);
        if(!isUp) dr(ox+10,oy+3,2,5,ch.hair); // pony tail visible from side/back
      } else if(ch.hairStyle === 'bun'){
        dr(ox+5,oy+0,6,4,ch.hair);
        dr(ox+10,oy+1,3,3,ch.hair);
      } else if(ch.hairStyle === 'curly'){
        dr(ox+4,oy+0,8,4,ch.hair);
        // curls
        sp(ox+3,oy+1,ch.hair[0],ch.hair[1],ch.hair[2]);
        sp(ox+12,oy+1,ch.hair[0],ch.hair[1],ch.hair[2]);
        sp(ox+4,oy+4,ch.hair[0],ch.hair[1],ch.hair[2]);
        sp(ox+11,oy+4,ch.hair[0],ch.hair[1],ch.hair[2]);
      } else if(ch.hairStyle === 'sidecut'){
        dr(ox+5,oy+0,6,4,ch.hair);
        // shaved side
        dr(ox+11,oy+3,2,3,shade(ch.hair, 0.4));
      } else if(ch.hairStyle === 'bald'){
        // skin only
      } else { // short
        dr(ox+5,oy+0,6,4,ch.hair);
        dr(ox+4,oy+1,8,2,ch.hair);
      }
      // hair highlight
      sp(ox+6,oy+1,Math.min(255,ch.hair[0]+30),Math.min(255,ch.hair[1]+30),Math.min(255,ch.hair[2]+30));

      // ── FACE ──
      if(isUp){
        // back of head only — fill hair
        dr(ox+4,oy+1,8,8,ch.hair);
      } else {
        dr(ox+5,oy+2,6,7,SKIN);
        // cheek shadow
        sp(ox+5,oy+7,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]);
        sp(ox+10,oy+7,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]);
        // EYES
        if(facing===3){ // front
          sp(ox+6,oy+5,0,0,0); sp(ox+9,oy+5,0,0,0);
          // glasses
          if(ch.accessory==='glasses'){
            sp(ox+5,oy+5,40,40,50); sp(ox+7,oy+5,40,40,50);
            sp(ox+8,oy+5,40,40,50); sp(ox+10,oy+5,40,40,50);
            sp(ox+5,oy+6,40,40,50); sp(ox+7,oy+6,40,40,50);
            sp(ox+8,oy+6,40,40,50); sp(ox+10,oy+6,40,40,50);
            sp(ox+6,oy+6,40,40,50); sp(ox+9,oy+6,40,40,50);
          }
          // mouth (subtle)
          sp(ox+7,oy+8,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]);
          sp(ox+8,oy+8,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]);
        } else if(facing===0){ // left
          sp(ox+6,oy+5,0,0,0);
          if(ch.accessory==='glasses'){
            sp(ox+5,oy+5,40,40,50); sp(ox+7,oy+5,40,40,50);
            sp(ox+5,oy+6,40,40,50); sp(ox+7,oy+6,40,40,50);
          }
        } else if(facing===1){ // right
          sp(ox+9,oy+5,0,0,0);
          if(ch.accessory==='glasses'){
            sp(ox+8,oy+5,40,40,50); sp(ox+10,oy+5,40,40,50);
            sp(ox+8,oy+6,40,40,50); sp(ox+10,oy+6,40,40,50);
          }
        }
        // ear hint
        if(facing===0){ sp(ox+4,oy+5,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]); sp(ox+4,oy+6,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]); }
        if(facing===1){ sp(ox+11,oy+5,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]); sp(ox+11,oy+6,SKIN_SH[0],SKIN_SH[1],SKIN_SH[2]); }
      }

      // ── NECK ──
      dr(ox+7,oy+9,2,2,SKIN);

      // ── SHIRT BODY ──
      dr(ox+4,oy+11,8,7,ch.shirt);
      // shading on side
      dr(ox+4,oy+11,1,7,SHIRT_SH);
      dr(ox+11,oy+11,1,7,SHIRT_SH);
      // collar / outfit details
      if(ch.outfit==='suit'){
        // lapels (V shape)
        dr(ox+5,oy+11,2,1,shade(ch.shirt,0.5));
        dr(ox+9,oy+11,2,1,shade(ch.shirt,0.5));
        sp(ox+6,oy+12,shade(ch.shirt,0.5)[0],shade(ch.shirt,0.5)[1],shade(ch.shirt,0.5)[2]);
        sp(ox+9,oy+12,shade(ch.shirt,0.5)[0],shade(ch.shirt,0.5)[1],shade(ch.shirt,0.5)[2]);
        // shirt under
        dr(ox+7,oy+11,2,3,[245,245,250]);
        // tie
        if(ch.tie){
          sp(ox+7,oy+12,ch.tie[0],ch.tie[1],ch.tie[2]);
          sp(ox+8,oy+12,ch.tie[0],ch.tie[1],ch.tie[2]);
          dr(ox+7,oy+13,2,3,ch.tie);
        }
      } else if(ch.outfit==='hoodie'){
        // hood drawstring + hood collar
        dr(ox+5,oy+11,6,1,shade(ch.shirt,0.7));
        sp(ox+7,oy+12,250,250,250); sp(ox+8,oy+12,250,250,250);
        // pocket
        dr(ox+6,oy+15,4,1,shade(ch.shirt,0.85));
      } else if(ch.outfit==='shirt'){
        // collar
        dr(ox+6,oy+11,4,1,SHIRT_HL);
        sp(ox+7,oy+12,SHIRT_HL[0],SHIRT_HL[1],SHIRT_HL[2]);
        sp(ox+8,oy+12,SHIRT_HL[0],SHIRT_HL[1],SHIRT_HL[2]);
        // tie if accessory
        if(ch.accessory==='tie' && ch.tie){
          sp(ox+7,oy+12,ch.tie[0],ch.tie[1],ch.tie[2]);
          sp(ox+8,oy+12,ch.tie[0],ch.tie[1],ch.tie[2]);
          dr(ox+7,oy+13,2,3,ch.tie);
        } else if(ch.accessory==='tie'){
          dr(ox+7,oy+13,2,3,[100,30,40]);
        }
        // buttons
        sp(ox+8,oy+14,SHIRT_SH[0],SHIRT_SH[1],SHIRT_SH[2]);
        sp(ox+8,oy+16,SHIRT_SH[0],SHIRT_SH[1],SHIRT_SH[2]);
      } else if(ch.outfit==='blouse'){
        // soft collar
        dr(ox+6,oy+11,4,1,SHIRT_HL);
        // chest detail
        sp(ox+7,oy+13,SHIRT_HL[0],SHIRT_HL[1],SHIRT_HL[2]);
        sp(ox+8,oy+13,SHIRT_HL[0],SHIRT_HL[1],SHIRT_HL[2]);
      } else if(ch.outfit==='dress'){
        // dress flares wider at bottom
        dr(ox+3,oy+17,10,1,ch.shirt);
      } else if(ch.outfit==='reception'){
        // scarf/uniform accent
        dr(ox+6,oy+11,4,1,[240,220,180]);
        sp(ox+7,oy+12,240,220,180); sp(ox+8,oy+12,240,220,180);
      } else { // tee
        // round neckline
        dr(ox+6,oy+11,4,1,SHIRT_SH);
      }

      // ID badge
      if(ch.badge){
        sp(ox+10,oy+14,250,250,250);
        sp(ox+10,oy+15,180,180,200);
        sp(ox+11,oy+13,SHIRT_SH[0],SHIRT_SH[1],SHIRT_SH[2]);
      }
      // Headset
      if(ch.accessory==='headset' && !isUp){
        sp(ox+4,oy+4,40,40,50); sp(ox+11,oy+4,40,40,50);
        if(facing===3){
          sp(ox+5,oy+3,40,40,50); sp(ox+10,oy+3,40,40,50);
          sp(ox+11,oy+5,40,40,50);
        }
      }

      // ── ARMS ──
      // arm position varies for walk
      let armDownL = oy+12, armDownR = oy+12;
      if(isWalkA){ armDownL = oy+13; armDownR = oy+11; }
      else if(isWalkB){ armDownL = oy+11; armDownR = oy+13; }

      dr(ox+3,armDownL,1,5,ch.shirt);
      dr(ox+12,armDownR,1,5,ch.shirt);
      // hands
      sp(ox+3,armDownL+5,SKIN[0],SKIN[1],SKIN[2]);
      sp(ox+12,armDownR+5,SKIN[0],SKIN[1],SKIN[2]);

      // ── PANTS / LEGS ──
      // walk: alternate leg lift
      if(isWalkA){
        dr(ox+5,oy+18,3,3,ch.pants); dr(ox+8,oy+18,3,4,ch.pants);
        dr(ox+5,oy+22,3,2,SHOE); dr(ox+8,oy+22,3,2,SHOE);
      } else if(isWalkB){
        dr(ox+5,oy+18,3,4,ch.pants); dr(ox+8,oy+18,3,3,ch.pants);
        dr(ox+5,oy+22,3,2,SHOE); dr(ox+8,oy+22,3,2,SHOE);
      } else {
        dr(ox+5,oy+18,6,4,ch.pants);
        dr(ox+5,oy+22,3,2,SHOE); dr(ox+8,oy+22,3,2,SHOE);
      }
      // pants seam (center)
      sp(ox+7,oy+19,PANTS_SH[0],PANTS_SH[1],PANTS_SH[2]);
      sp(ox+8,oy+19,PANTS_SH[0],PANTS_SH[1],PANTS_SH[2]);
      sp(ox+7,oy+20,PANTS_SH[0],PANTS_SH[1],PANTS_SH[2]);
      // shoe highlight
      sp(ox+5,oy+22,shade(SHOE,1.4)[0],shade(SHOE,1.4)[1],shade(SHOE,1.4)[2]);
      sp(ox+8,oy+22,shade(SHOE,1.4)[0],shade(SHOE,1.4)[1],shade(SHOE,1.4)[2]);
    }
  }
  ctx.putImageData(id,0,0);
  return c.toDataURL();
}

// ═══════════════════════════════════════════════════════
// Tile IDs (gid) — expanded with detail tiles 33–48
// ═══════════════════════════════════════════════════════
function generateTileset() {
  const TW=16, TH=16, COLS=8, ROWS=8;
  const c = document.createElement('canvas');
  c.width = TW*COLS; c.height = TH*ROWS;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(c.width, c.height);
  const d = id.data;
  const W=c.width;
  function sp(x,y,r,g,b,a=255){
    if(x<0||y<0||x>=c.width||y>=c.height) return;
    const i=(y*W+x)*4; d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=a;
  }
  function ft(tx,ty,c1,c2){
    for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++){
      const cl=(c2&&((dx+dy)%2===0))?c2:c1;
      sp(tx*TW+dx,ty*TH+dy,cl[0],cl[1],cl[2]);
    }
  }
  function rect(tx,ty,x0,y0,w,h,col){
    for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) sp(tx*TW+x0+dx, ty*TH+y0+dy, col[0],col[1],col[2]);
  }
  function pix(tx,ty,x,y,col){ sp(tx*TW+x, ty*TH+y, col[0],col[1],col[2]); }

  // GID2 carpet — soft beige with weave
  ft(1,0,[212,196,170],[202,186,160]);
  for(let i=0;i<8;i++){const fx=2+((i*5)%12),fy=2+((i*7)%12);pix(1,0,fx,fy,[180,164,140]);}
  // weave lines
  for(let dy=0;dy<TH;dy+=4) for(let dx=0;dx<TW;dx++) pix(1,0,dx,dy,[195,180,156]);

  // GID3 wall
  ft(2,0,[238,234,226]);
  for(let dx=0;dx<TW;dx++){pix(2,0,dx,0,[200,196,188]); pix(2,0,dx,1,[248,244,236]); pix(2,0,dx,TH-1,[180,176,168]);}
  for(let dx=0;dx<TW;dx++){pix(2,0,dx,TH-2,[160,156,148]);}
  // subtle texture
  for(let i=0;i<4;i++){pix(2,0,2+i*4,5,[225,221,213]); pix(2,0,3+i*4,9,[225,221,213]);}

  // GID4 desk wood
  ft(3,0,[185,140,90]);
  for(let dx=0;dx<TW;dx++){pix(3,0,dx,0,[120,80,40]); pix(3,0,dx,1,[210,170,120]); pix(3,0,dx,TH-1,[120,80,40]);}
  for(let dx=2;dx<TW-2;dx+=4){for(let dy=3;dy<TH-2;dy++) pix(3,0,dx,dy,[160,115,70]);}

  // GID5 office chair
  ft(4,0,[55,60,75]);
  for(let dx=2;dx<TW-2;dx++){pix(4,0,dx,2,[35,40,55]); pix(4,0,dx,3,[80,85,100]); pix(4,0,dx,8,[35,40,55]);}
  for(let dy=4;dy<10;dy++){pix(4,0,1,dy,[30,35,45]); pix(4,0,TW-2,dy,[30,35,45]);}
  // seat
  rect(4,0,4,9,8,2,[40,45,60]);
  // 5-leg base
  pix(4,0,4,TH-2,[20,20,30]); pix(4,0,7,TH-2,[20,20,30]);
  pix(4,0,11,TH-2,[20,20,30]); pix(4,0,8,TH-3,[20,20,30]);
  // hydraulic
  pix(4,0,7,12,[80,80,90]); pix(4,0,8,12,[80,80,90]);

  // GID6 meeting carpet (rich purple)
  ft(5,0,[55,60,110],[48,55,100]);
  for(let dy=2;dy<TH;dy+=4) for(let dx=2;dx<TW;dx+=4) pix(5,0,dx,dy,[90,100,150]);

  // GID7 window
  for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++){
    // sky gradient
    const v=Math.max(0,Math.min(255,170+dy*4));
    sp(6*TW+dx, 0+dy, 130+dy*2, v, 240);
  }
  // clouds
  for(let dx=2;dx<6;dx++) pix(6,0,dx,4,[245,250,255]);
  for(let dx=3;dx<5;dx++) pix(6,0,dx,5,[245,250,255]);
  for(let dx=10;dx<13;dx++) pix(6,0,dx,7,[245,250,255]);
  // building outlines below (city)
  for(let dy=11;dy<14;dy++) for(let dx=0;dx<TW;dx++) pix(6,0,dx,dy,[120,140,150]);
  rect(6,0,2,9,3,2,[100,110,120]);
  rect(6,0,9,8,2,3,[100,110,120]);
  // frame
  for(let dx=0;dx<TW;dx++){pix(6,0,dx,0,[60,55,50]); pix(6,0,dx,TH-1,[60,55,50]);}
  for(let dy=0;dy<TH;dy++){pix(6,0,0,dy,[60,55,50]); pix(6,0,TW-1,dy,[60,55,50]);}
  for(let dy=1;dy<TH-1;dy++) pix(6,0,Math.floor(TW/2),dy,[60,55,50]);
  for(let dx=1;dx<TW-1;dx++) pix(6,0,dx,Math.floor(TH/2),[60,55,50]);

  // GID8 door
  ft(7,0,[140,90,50]);
  for(let dx=0;dx<TW;dx++){pix(7,0,dx,0,[80,50,25]); pix(7,0,dx,TH-1,[80,50,25]);}
  for(let dy=0;dy<TH;dy++){pix(7,0,0,dy,[80,50,25]); pix(7,0,TW-1,dy,[80,50,25]);}
  rect(7,0,3,3,10,5,[160,110,60]);
  rect(7,0,3,9,10,4,[160,110,60]);
  // panel highlights
  for(let dx=4;dx<13;dx++){pix(7,0,dx,3,[180,130,80]); pix(7,0,dx,9,[180,130,80]);}
  pix(7,0,12,8,[230,200,80]); pix(7,0,12,9,[230,200,80]);
  pix(7,0,11,8,[180,150,40]);

  // GID9 round meeting table
  for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++){
    const cx=TW/2, cy=TH/2, dist=Math.hypot(dx-cx+0.5, dy-cy+0.5);
    if(dist<7.5) sp(0*TW+dx, 1*TH+dy, 100, 60, 30);
    else sp(0*TW+dx, 1*TH+dy, 0,0,0,0);
  }
  for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++){
    const cx=TW/2, cy=TH/2, dist=Math.hypot(dx-cx+0.5, dy-cy+0.5);
    if(dist>5.5 && dist<7) sp(0*TW+dx, 1*TH+dy, 80,45,20);
    if(dist<3) sp(0*TW+dx, 1*TH+dy, 130,80,45);
  }
  // tiny coffee cups on table
  pix(0,1,5,5,[245,245,245]); pix(0,1,5,6,[100,60,30]);
  pix(0,1,11,9,[245,245,245]); pix(0,1,11,10,[100,60,30]);

  // GID10 whiteboard
  ft(1,1,[252,252,250]);
  for(let dx=0;dx<TW;dx++){pix(1,1,dx,0,[80,80,80]); pix(1,1,dx,TH-1,[80,80,80]);}
  for(let dy=0;dy<TH;dy++){pix(1,1,0,dy,[80,80,80]); pix(1,1,TW-1,dy,[80,80,80]);}
  // marker traces — diagram-like
  for(let dx=3;dx<7;dx++) pix(1,1,dx,4,[70,140,200]);
  for(let dy=4;dy<7;dy++) pix(1,1,7,dy,[70,140,200]);
  for(let dx=3;dx<5;dx++) pix(1,1,dx,8,[200,80,80]);
  for(let dx=8;dx<13;dx++) pix(1,1,dx,5,[60,160,90]);
  for(let dy=5;dy<9;dy++) pix(1,1,12,dy,[60,160,90]);
  // marker tray
  rect(1,1,1,TH-3,14,1,[160,160,160]);
  pix(1,1,3,TH-3,[200,40,40]); pix(1,1,7,TH-3,[40,80,160]); pix(1,1,11,TH-3,[40,160,80]);

  // GID11 coffee machine
  ft(2,1,[40,40,55]);
  rect(2,1,2,1,12,5,[60,60,75]);
  // display
  rect(2,1,3,2,5,2,[60,180,140]);
  pix(2,1,4,2,[200,255,200]);
  // power
  pix(2,1,12,2,[255,80,40]); pix(2,1,13,2,[255,80,40]);
  // spout
  rect(2,1,5,7,6,3,[20,20,28]);
  pix(2,1,7,8,[140,90,40]); pix(2,1,8,8,[160,100,50]);
  // cup
  rect(2,1,6,9,4,2,[245,245,245]);
  pix(2,1,7,10,[100,60,30]); pix(2,1,8,10,[100,60,30]);
  // drip tray
  rect(2,1,4,11,8,4,[80,80,90]);
  rect(2,1,5,12,6,2,[30,30,38]);
  // grilles
  for(let dx=2;dx<14;dx+=2) pix(2,1,dx,4,[30,30,40]);

  // GID12 sofa
  ft(3,1,[160,80,60]);
  for(let dx=0;dx<TW;dx++){pix(3,1,dx,0,[100,50,40]); pix(3,1,dx,1,[180,100,80]); pix(3,1,dx,2,[150,75,55]);}
  rect(3,1,1,4,6,8,[200,120,90]);
  rect(3,1,9,4,6,8,[200,120,90]);
  // cushion seam
  pix(3,1,7,5,[100,50,40]); pix(3,1,8,5,[100,50,40]);
  pix(3,1,7,8,[100,50,40]); pix(3,1,8,8,[100,50,40]);
  // pillow accents
  rect(3,1,2,5,2,2,[230,180,150]);
  rect(3,1,11,5,2,2,[180,90,70]);
  // legs
  pix(3,1,1,TH-1,[40,30,20]); pix(3,1,TW-2,TH-1,[40,30,20]);

  // GID13 plant — leafier
  // pot
  rect(4,1,4,11,8,4,[120,70,40]);
  rect(4,1,5,10,6,1,[160,100,60]);
  pix(4,1,4,11,[80,50,30]); pix(4,1,11,11,[80,50,30]);
  // soil
  rect(4,1,5,10,6,1,[60,40,30]);
  // foliage clusters
  const leaves = [[8,3],[6,4],[10,4],[5,6],[11,6],[7,7],[9,7],[6,8],[10,8],[8,9],[4,7],[12,7]];
  leaves.forEach(([px,py])=>{
    pix(4,1,px,py,[40,120,60]);
    pix(4,1,px-1,py,[60,140,70]);
    pix(4,1,px,py-1,[80,160,80]);
    pix(4,1,px+1,py,[40,110,55]);
    pix(4,1,px,py+1,[30,90,45]);
  });
  // accent bright leaf tips
  pix(4,1,8,2,[120,200,100]);
  pix(4,1,5,5,[120,200,100]);
  pix(4,1,11,5,[120,200,100]);
  // stems
  pix(4,1,8,9,[60,80,40]); pix(4,1,8,10,[60,80,40]);

  // GID14 server rack — detailed LEDs
  ft(5,1,[18,18,26]);
  for(let dx=0;dx<TW;dx++){pix(5,1,dx,0,[8,8,12]); pix(5,1,dx,TH-1,[8,8,12]);}
  for(let dy=0;dy<TH;dy++){pix(5,1,0,dy,[8,8,12]); pix(5,1,TW-1,dy,[8,8,12]);}
  for(let r=0;r<5;r++){
    rect(5,1,2,1+r*3,12,2,[40,40,50]);
    // status LEDs
    pix(5,1,3,2+r*3,[80,255,80]);
    pix(5,1,5,2+r*3,[255,200,40]);
    pix(5,1,12,2+r*3,r%2?[80,255,80]:[60,180,60]);
    // disk slits
    for(let dx=7;dx<11;dx++) pix(5,1,dx,1+r*3,[20,20,28]);
  }

  // GID15 bookshelf — with varied books
  ft(6,1,[110,70,40]);
  for(let dx=0;dx<TW;dx++){pix(6,1,dx,0,[60,40,20]); pix(6,1,dx,TH-1,[60,40,20]);}
  for(let dy=0;dy<TH;dy++){pix(6,1,0,dy,[60,40,20]); pix(6,1,TW-1,dy,[60,40,20]);}
  const shelves = [4, 9, 14];
  shelves.forEach(sy => {
    for(let dx=0;dx<TW;dx++) pix(6,1,dx,sy,[40,25,15]);
  });
  // books per shelf — different colors, slight slant
  const bookColors = [[180,40,40],[40,80,160],[60,160,90],[200,160,40],[160,80,160],[60,60,80],[200,100,40],[80,140,200],[180,140,80]];
  shelves.forEach((sy, si) => {
    let bx = 1;
    while(bx<14){
      const w = 1 + (si+bx)%2;
      const h = 3 + ((bx+si)%2);
      const c = bookColors[(bx+si)%bookColors.length];
      rect(6,1,bx,sy-h,w,h,c);
      // book spine highlight
      pix(6,1,bx,sy-h,[Math.min(255,c[0]+40),Math.min(255,c[1]+40),Math.min(255,c[2]+40)]);
      bx += w;
    }
  });
  // small decoration on top shelf
  pix(6,1,3,1,[200,180,80]); pix(6,1,4,1,[200,180,80]); // trophy

  // GID16 warm rug (orange/red)
  ft(7,1,[180,90,60],[170,85,55]);
  for(let dx=2;dx<TW-2;dx+=3) for(let dy=2;dy<TH-2;dy+=3) pix(7,1,dx,dy,[200,140,90]);
  // border
  for(let dx=0;dx<TW;dx++){pix(7,1,dx,0,[140,60,40]); pix(7,1,dx,TH-1,[140,60,40]);}
  for(let dy=0;dy<TH;dy++){pix(7,1,0,dy,[140,60,40]); pix(7,1,TW-1,dy,[140,60,40]);}
  // pattern
  rect(7,1,6,6,4,4,[160,80,50]);
  rect(7,1,7,7,2,2,[200,140,90]);

  // GID17 toilet
  ft(0,2,[230,230,235]);
  rect(0,2,3,4,10,8,[245,245,250]);
  rect(0,2,4,5,8,6,[200,210,225]);
  rect(0,2,5,6,6,4,[180,200,220]);
  rect(0,2,4,1,8,3,[245,245,250]);
  pix(0,2,11,2,[160,160,170]);
  // tank line
  for(let dx=4;dx<12;dx++) pix(0,2,dx,4,[200,200,210]);

  // GID18 reception desk — with computer
  ft(1,2,[180,140,90]);
  for(let dx=0;dx<TW;dx++){pix(1,2,dx,0,[100,70,40]); pix(1,2,dx,1,[210,170,120]);}
  for(let dx=2;dx<TW-2;dx++) pix(1,2,dx,5,[140,100,60]);
  // monitor
  rect(1,2,5,7,6,4,[20,20,25]);
  rect(1,2,6,8,4,2,[60,160,200]);
  pix(1,2,7,8,[120,200,240]); pix(1,2,8,8,[120,200,240]);
  // keyboard
  rect(1,2,4,12,8,1,[60,60,70]);

  // GID19 printer
  ft(2,2,[210,210,215]);
  rect(2,2,2,2,12,4,[180,180,185]);
  rect(2,2,3,7,10,4,[230,230,235]);
  pix(2,2,12,3,[80,200,80]); pix(2,2,13,3,[200,80,80]);
  // paper tray with stack
  rect(2,2,4,5,8,2,[255,255,255]);
  pix(2,2,5,5,[245,245,245]); pix(2,2,9,5,[245,245,245]);
  // controls
  rect(2,2,4,3,4,1,[60,60,70]);

  // GID20 CEO chair (red exec)
  ft(3,2,[120,30,40]);
  for(let dx=2;dx<TW-2;dx++){pix(3,2,dx,1,[80,15,25]); pix(3,2,dx,2,[160,50,60]); pix(3,2,dx,8,[80,15,25]);}
  for(let dy=4;dy<11;dy++){pix(3,2,1,dy,[60,15,20]); pix(3,2,TW-2,dy,[60,15,20]);}
  // gold accents
  pix(3,2,2,5,[200,160,60]); pix(3,2,13,5,[200,160,60]);
  pix(3,2,4,TH-2,[20,15,15]); pix(3,2,11,TH-2,[20,15,15]);

  // GID21 wood floor
  ft(4,2,[180,140,95]);
  for(let dy=0;dy<TH;dy+=4) for(let dx=0;dx<TW;dx++) pix(4,2,dx,dy,[140,100,60]);
  for(let dy=0;dy<TH;dy++) pix(4,2,8,dy,[140,100,60]);
  // grain
  for(let dy=2;dy<TH;dy+=4) for(let dx=1;dx<8;dx+=2) pix(4,2,dx,dy,[200,160,110]);

  // GID22 tile floor
  ft(5,2,[225,228,232],[215,218,222]);
  for(let dx=0;dx<TW;dx+=8) for(let dy=0;dy<TH;dy++) pix(5,2,dx,dy,[180,185,190]);
  for(let dy=0;dy<TH;dy+=8) for(let dx=0;dx<TW;dx++) pix(5,2,dx,dy,[180,185,190]);

  // GID23 outdoor deck
  ft(6,2,[160,110,70]);
  for(let dy=0;dy<TH;dy+=4) for(let dx=0;dx<TW;dx++) pix(6,2,dx,dy,[110,70,40]);
  pix(6,2,3,7,[80,140,60]); pix(6,2,11,12,[80,140,60]);
  pix(6,2,4,7,[100,160,70]);

  // GID24 railing
  for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++){
    sp(7*TW+dx,2*TH+dy, 150+dy, 200, 230);
  }
  for(let dy=2;dy<14;dy++){pix(7,2,3,dy,[60,55,50]); pix(7,2,8,dy,[60,55,50]); pix(7,2,13,dy,[60,55,50]);}
  for(let dx=0;dx<TW;dx++) pix(7,2,dx,2,[80,75,70]);
  for(let dx=0;dx<TW;dx++) pix(7,2,dx,3,[100,90,80]);
  for(let dx=0;dx<TW;dx++) pix(7,2,dx,14,[100,90,80]);

  // GID25 marble
  ft(0,3,[238,234,228],[228,224,218]);
  for(let i=0;i<5;i++){ const sx=(i*7)%TW, sy=(i*5)%TH; for(let k=0;k<4;k++){pix(0,3,(sx+k)%TW,(sy+k)%TH,[200,196,190]);}}

  // GID26 cubicle wall
  ft(1,3,[100,110,130]);
  for(let dx=0;dx<TW;dx++){pix(1,3,dx,0,[60,70,90]); pix(1,3,dx,1,[140,150,170]); pix(1,3,dx,TH-1,[60,70,90]);}
  for(let dx=2;dx<TW;dx+=3) for(let dy=3;dy<TH-2;dy+=3) pix(1,3,dx,dy,[80,90,110]);

  // GID27 monitor on desk
  ft(2,3,[185,140,90]);
  for(let dx=0;dx<TW;dx++){pix(2,3,dx,0,[120,80,40]); pix(2,3,dx,TH-1,[120,80,40]);}
  // monitor frame
  rect(2,3,3,2,10,7,[28,28,38]);
  rect(2,3,4,3,8,5,[80,170,210]);
  // screen content lines (code)
  pix(2,3,5,4,[200,255,180]); pix(2,3,6,4,[200,255,180]); pix(2,3,7,4,[200,255,180]);
  pix(2,3,5,5,[140,200,255]); pix(2,3,6,5,[140,200,255]);
  pix(2,3,5,6,[255,200,140]); pix(2,3,6,6,[255,200,140]); pix(2,3,7,6,[255,200,140]);
  pix(2,3,5,7,[200,255,180]); pix(2,3,6,7,[200,255,180]);
  // power LED
  pix(2,3,11,8,[80,255,80]);
  // stand
  rect(2,3,7,9,2,2,[60,60,70]);
  rect(2,3,5,11,6,1,[40,40,50]);
  // keyboard on desk
  rect(2,3,3,13,10,1,[40,40,50]);
  pix(2,3,12,13,[180,180,200]); // mouse
  // mug
  pix(2,3,2,12,[200,200,210]); pix(2,3,2,13,[150,150,160]);

  // GID28 CEO desk with monitor + decor
  ft(3,3,[80,40,30]);
  for(let dx=0;dx<TW;dx++){pix(3,3,dx,0,[40,20,15]); pix(3,3,dx,1,[120,70,55]); pix(3,3,dx,TH-1,[40,20,15]);}
  for(let dx=2;dx<TW-2;dx+=4){for(let dy=3;dy<TH-2;dy++) pix(3,3,dx,dy,[60,30,22]);}
  // monitor
  rect(3,3,4,3,8,5,[20,20,28]);
  rect(3,3,5,4,6,3,[120,180,200]);
  // chart on screen
  pix(3,3,5,5,[80,255,120]); pix(3,3,6,5,[60,200,100]); pix(3,3,7,5,[80,220,140]); pix(3,3,9,5,[200,80,80]);
  // nameplate
  rect(3,3,3,12,5,2,[200,160,80]);
  pix(3,3,4,12,[80,40,20]); pix(3,3,6,12,[80,40,20]);
  // pen holder
  pix(3,3,12,11,[60,60,70]); pix(3,3,12,12,[60,60,70]);
  pix(3,3,12,10,[200,40,40]); pix(3,3,11,10,[40,80,160]);

  // GID29 conference chair
  ft(4,3,[80,90,120]);
  for(let dx=2;dx<TW-2;dx++){pix(4,3,dx,2,[50,60,90]); pix(4,3,dx,3,[110,120,150]); pix(4,3,dx,8,[50,60,90]);}
  for(let dy=4;dy<10;dy++){pix(4,3,1,dy,[50,60,90]); pix(4,3,TW-2,dy,[50,60,90]);}
  rect(4,3,4,9,8,2,[60,70,100]);
  pix(4,3,4,TH-2,[20,20,30]); pix(4,3,11,TH-2,[20,20,30]);
  pix(4,3,7,12,[60,60,75]); pix(4,3,8,12,[60,60,75]);

  // GID30 water cooler
  ft(5,3,[230,232,235]);
  rect(5,3,4,2,8,5,[180,220,240]);
  rect(5,3,5,3,6,3,[200,235,250]);
  // bubbles
  pix(5,3,6,4,[255,255,255]); pix(5,3,8,5,[255,255,255]); pix(5,3,10,4,[255,255,255]);
  rect(5,3,3,7,10,7,[210,210,215]);
  // tap
  pix(5,3,7,9,[80,150,200]); pix(5,3,8,9,[80,150,200]);
  pix(5,3,7,10,[60,60,70]); pix(5,3,8,10,[60,60,70]);
  // cups
  pix(5,3,4,12,[245,245,245]); pix(5,3,11,12,[245,245,245]);

  // GID31 kitchen counter — with sink + tap
  ft(6,3,[200,205,210]);
  for(let dx=0;dx<TW;dx++){pix(6,3,dx,0,[100,100,110]); pix(6,3,dx,1,[230,230,235]);}
  rect(6,3,2,4,12,8,[160,165,175]);
  rect(6,3,4,6,8,4,[80,90,110]);
  // tap
  pix(6,3,7,5,[200,210,220]); pix(6,3,8,5,[200,210,220]);
  pix(6,3,7,4,[180,190,200]); pix(6,3,8,4,[180,190,200]);
  // dish
  pix(6,3,5,7,[245,245,245]); pix(6,3,6,7,[245,245,245]);

  // GID32 glass wall
  for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++) sp(7*TW+dx,3*TH+dy,160+dy*2,210+dy,240);
  for(let dy=0;dy<TH;dy+=3) for(let dx=0;dx<TW;dx++) pix(7,3,dx,dy,[210,230,250]);
  for(let dx=0;dx<TW;dx++){pix(7,3,dx,0,[80,80,90]); pix(7,3,dx,TH-1,[80,80,90]);}

  // GID33 (col0,row4) wall poster — colorful art
  ft(0,4,[238,234,226]);
  // frame
  rect(0,4,3,2,10,12,[80,55,30]);
  rect(0,4,4,3,8,10,[245,240,225]);
  // "art" — gradient bands
  rect(0,4,4,3,8,3,[80,140,200]);
  rect(0,4,4,6,8,2,[230,180,80]);
  rect(0,4,4,8,8,2,[200,80,90]);
  rect(0,4,4,10,8,3,[60,140,90]);
  // signature dot
  pix(0,4,11,12,[40,40,40]);

  // GID34 (col1,row4) wall clock
  ft(1,4,[238,234,226]);
  // clock face
  for(let dy=2;dy<14;dy++) for(let dx=2;dx<14;dx++){
    const cx=8,cy=8,dist=Math.hypot(dx-cx,dy-cy);
    if(dist<6) pix(1,4,dx,dy,[245,245,245]);
    if(dist<6.5 && dist>=5.5) pix(1,4,dx,dy,[40,40,50]);
  }
  // marks
  pix(1,4,8,3,[40,40,50]); pix(1,4,8,13,[40,40,50]);
  pix(1,4,3,8,[40,40,50]); pix(1,4,13,8,[40,40,50]);
  // hands
  pix(1,4,8,7,[40,40,50]); pix(1,4,8,6,[40,40,50]); pix(1,4,8,5,[40,40,50]);
  pix(1,4,9,8,[200,40,40]); pix(1,4,10,8,[200,40,40]);
  pix(1,4,8,8,[40,40,50]);

  // GID35 (col2,row4) cubicle desk corner — laptop on top
  ft(2,4,[185,140,90]);
  for(let dx=0;dx<TW;dx++){pix(2,4,dx,0,[120,80,40]); pix(2,4,dx,TH-1,[120,80,40]);}
  // laptop
  rect(2,4,4,4,8,5,[40,40,50]);
  rect(2,4,5,5,6,3,[100,200,220]);
  pix(2,4,7,6,[60,160,80]); pix(2,4,8,6,[60,160,80]);
  rect(2,4,3,9,10,1,[60,60,70]);
  // notebook + pen
  rect(2,4,3,12,4,2,[200,180,150]);
  pix(2,4,4,13,[80,40,40]);
  pix(2,4,9,12,[200,40,40]); pix(2,4,10,12,[200,40,40]);
  // mug
  rect(2,4,12,11,2,3,[245,245,245]);
  pix(2,4,12,11,[200,80,80]);

  // GID36 (col3,row4) lamp/floor light
  ft(3,4,[212,196,170],[202,186,160]); // floor
  // lamp pole
  for(let dy=2;dy<TH-2;dy++) pix(3,4,8,dy,[60,55,50]);
  // shade
  rect(3,4,5,2,7,3,[240,200,120]);
  pix(3,4,4,3,[230,190,110]); pix(3,4,12,3,[230,190,110]);
  // glow
  pix(3,4,7,5,[255,240,180]); pix(3,4,8,5,[255,240,180]); pix(3,4,9,5,[255,240,180]);
  // base
  rect(3,4,5,TH-3,7,2,[60,55,50]);

  // GID37 (col4,row4) snack vending machine
  ft(4,4,[180,40,40]);
  rect(4,4,1,1,14,14,[200,50,50]);
  // glass front
  rect(4,4,2,2,12,10,[100,150,170]);
  // shelves
  for(let r=0;r<3;r++) rect(4,4,2,4+r*3,12,1,[60,80,90]);
  // snacks
  pix(4,4,4,3,[230,180,80]); pix(4,4,7,3,[80,180,80]); pix(4,4,10,3,[200,80,160]); pix(4,4,12,3,[80,180,200]);
  pix(4,4,4,6,[200,140,40]); pix(4,4,7,6,[200,80,80]); pix(4,4,10,6,[80,180,80]); pix(4,4,12,6,[230,180,80]);
  pix(4,4,4,9,[80,180,200]); pix(4,4,7,9,[200,80,160]); pix(4,4,10,9,[230,180,80]); pix(4,4,12,9,[200,140,40]);
  // dispenser slot
  rect(4,4,2,12,12,2,[40,40,40]);
  // keypad
  pix(4,4,13,13,[60,60,70]);

  // GID38 (col5,row4) potted small plant variant
  ft(5,4,[212,196,170],[202,186,160]); // floor base
  rect(5,4,5,12,6,3,[200,150,80]);
  pix(5,4,4,12,[160,110,60]); pix(5,4,11,12,[160,110,60]);
  // succulent rosette
  pix(5,4,8,7,[80,180,100]); pix(5,4,7,8,[80,180,100]); pix(5,4,9,8,[80,180,100]);
  pix(5,4,6,9,[60,160,80]); pix(5,4,8,9,[120,200,140]); pix(5,4,10,9,[60,160,80]);
  pix(5,4,7,10,[80,180,100]); pix(5,4,9,10,[80,180,100]);
  pix(5,4,8,11,[60,140,80]);

  // GID39 (col6,row4) framed motivational poster
  ft(6,4,[238,234,226]);
  rect(6,4,2,2,12,12,[40,30,20]);
  rect(6,4,3,3,10,10,[245,240,225]);
  // mountains
  pix(6,4,4,9,[80,100,120]); pix(6,4,5,8,[80,100,120]); pix(6,4,6,7,[80,100,120]);
  pix(6,4,7,6,[60,80,100]); pix(6,4,8,5,[60,80,100]); pix(6,4,9,6,[80,100,120]);
  pix(6,4,10,7,[80,100,120]); pix(6,4,11,8,[100,120,140]); pix(6,4,12,9,[100,120,140]);
  // sun
  rect(6,4,9,4,2,2,[240,200,80]);
  // text bar
  rect(6,4,3,11,10,2,[80,140,180]);

  // GID40 (col7,row4) projector screen
  ft(7,4,[238,234,226]);
  // screen
  rect(7,4,1,1,14,11,[245,245,240]);
  rect(7,4,2,2,12,9,[100,140,180]);
  // chart bars
  rect(7,4,3,8,1,2,[80,180,100]);
  rect(7,4,5,6,1,4,[80,180,100]);
  rect(7,4,7,4,1,6,[80,180,100]);
  rect(7,4,9,5,1,5,[230,180,80]);
  rect(7,4,11,7,1,3,[200,80,80]);
  // base bar
  rect(7,4,1,12,14,1,[80,60,40]);
  // cord
  pix(7,4,8,13,[60,60,70]); pix(7,4,8,14,[60,60,70]); pix(7,4,8,15,[60,60,70]);

  // GID41 (col0,row5) office plant tall
  ft(0,5,[212,196,170],[202,186,160]);
  // pot
  rect(0,5,4,12,8,3,[120,70,40]);
  // tall fronds
  pix(0,5,5,11,[40,120,60]); pix(0,5,6,11,[60,140,70]); pix(0,5,8,11,[40,120,60]); pix(0,5,10,11,[60,140,70]);
  pix(0,5,5,9,[60,140,70]); pix(0,5,7,9,[40,120,60]); pix(0,5,9,9,[80,160,80]); pix(0,5,11,9,[60,140,70]);
  pix(0,5,4,7,[40,120,60]); pix(0,5,6,7,[80,160,80]); pix(0,5,8,7,[60,140,70]); pix(0,5,10,7,[40,120,60]); pix(0,5,12,7,[60,140,70]);
  pix(0,5,5,5,[80,160,80]); pix(0,5,7,5,[40,120,60]); pix(0,5,9,5,[80,160,80]); pix(0,5,11,5,[40,120,60]);
  pix(0,5,6,3,[80,180,100]); pix(0,5,8,3,[60,140,70]); pix(0,5,10,3,[80,180,100]);

  // GID42 (col1,row5) carpet variant — beige darker
  ft(1,5,[180,164,140],[170,154,130]);
  for(let i=0;i<8;i++){const fx=2+((i*5)%12),fy=2+((i*7)%12);pix(1,5,fx,fy,[150,134,110]);}

  // GID43 (col2,row5) executive armchair (lounge)
  ft(2,5,[100,70,90]);
  for(let dx=2;dx<TW-2;dx++){pix(2,5,dx,0,[60,40,55]); pix(2,5,dx,1,[120,90,110]);}
  for(let dy=2;dy<11;dy++){pix(2,5,1,dy,[60,40,55]); pix(2,5,TW-2,dy,[60,40,55]);}
  rect(2,5,3,4,10,7,[140,100,120]);
  pix(2,5,3,TH-1,[40,30,40]); pix(2,5,TW-4,TH-1,[40,30,40]);

  // GID44 (col3,row5) coffee table
  ft(3,5,[212,196,170],[202,186,160]);
  rect(3,5,2,5,12,4,[140,90,50]);
  for(let dx=2;dx<TW-2;dx++) pix(3,5,dx,5,[100,60,30]);
  // legs
  pix(3,5,3,9,[100,60,30]); pix(3,5,3,10,[100,60,30]); pix(3,5,3,11,[100,60,30]);
  pix(3,5,12,9,[100,60,30]); pix(3,5,12,10,[100,60,30]); pix(3,5,12,11,[100,60,30]);
  // mug + magazine on table
  pix(3,5,5,4,[245,245,245]); pix(3,5,5,3,[100,60,30]);
  rect(3,5,8,4,4,1,[180,200,220]);

  // GID45 (col4,row5) elevator door / accent wall (decorative)
  ft(4,5,[140,150,170]);
  for(let dx=0;dx<TW;dx++){pix(4,5,dx,0,[80,90,110]); pix(4,5,dx,TH-1,[80,90,110]);}
  for(let dy=0;dy<TH;dy++){pix(4,5,0,dy,[80,90,110]); pix(4,5,TW-1,dy,[80,90,110]);}
  // central seam
  for(let dy=2;dy<TH-2;dy++) pix(4,5,7,dy,[60,70,90]);
  for(let dy=2;dy<TH-2;dy++) pix(4,5,8,dy,[60,70,90]);
  // panel highlight
  for(let dy=3;dy<TH-3;dy+=3) for(let dx=2;dx<7;dx++) pix(4,5,dx,dy,[160,170,190]);

  // GID46 (col5,row5) outdoor table for balcony
  ft(5,5,[160,110,70]);
  for(let dy=0;dy<TH;dy+=4) for(let dx=0;dx<TW;dx++) pix(5,5,dx,dy,[110,70,40]);
  // small table top
  for(let dy=0;dy<TH;dy++) for(let dx=0;dx<TW;dx++){
    const cx=TW/2,cy=TH/2,dist=Math.hypot(dx-cx,dy-cy);
    if(dist<5) pix(5,5,dx,dy,[60,40,30]);
    if(dist<4) pix(5,5,dx,dy,[80,55,40]);
  }
  // cup on top
  pix(5,5,7,8,[245,245,245]); pix(5,5,8,8,[245,245,245]);

  // GID47 (col6,row5) trash bin
  ft(6,5,[212,196,170],[202,186,160]);
  rect(6,5,5,4,6,9,[60,60,70]);
  rect(6,5,4,4,8,1,[80,80,90]);
  // lid
  rect(6,5,4,3,8,1,[40,40,50]);
  // recycling logo
  pix(6,5,7,7,[80,200,100]); pix(6,5,8,7,[80,200,100]);
  pix(6,5,7,8,[80,200,100]); pix(6,5,8,8,[80,200,100]);

  // GID48 (col7,row5) standing whiteboard easel
  ft(7,5,[238,234,226]);
  // legs (tripod)
  pix(7,5,3,TH-2,[60,55,50]); pix(7,5,4,TH-3,[60,55,50]); pix(7,5,5,TH-4,[60,55,50]);
  pix(7,5,12,TH-2,[60,55,50]); pix(7,5,11,TH-3,[60,55,50]); pix(7,5,10,TH-4,[60,55,50]);
  pix(7,5,8,TH-2,[60,55,50]);
  // board
  rect(7,5,2,1,12,9,[80,80,80]);
  rect(7,5,3,2,10,7,[252,252,250]);
  // text strokes
  for(let dx=4;dx<10;dx++) pix(7,5,dx,4,[40,80,160]);
  for(let dx=4;dx<8;dx++) pix(7,5,dx,6,[200,80,80]);

  ctx.putImageData(id,0,0);
  return c.toDataURL();
}

window.OFFICE_ASSETS = { CHARS, generateSpritesheet, generateTileset };
