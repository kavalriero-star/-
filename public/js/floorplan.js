// ═══════════════════════════════════════════════════════
// Office floor plan — 40×26 tiles, multi-room
// Tile GIDs: 2 carpet, 3 wall, 4 desk, 5 chair, 6 meeting carpet,
//   7 window, 8 door, 9 round table, 10 whiteboard, 11 coffee,
//   12 sofa, 13 plant, 14 server, 15 bookshelf, 16 warm rug,
//   17 toilet, 18 reception, 19 printer, 20 CEO chair,
//   21 wood floor, 22 tile floor, 23 deck, 24 rail,
//   25 marble, 26 cubicle wall, 27 monitor-desk, 28 CEO desk,
//   29 conf chair, 30 water cooler, 31 kitchen, 32 glass wall
// ═══════════════════════════════════════════════════════

const MAP_W = 40, MAP_H = 26;

// Named room regions (rectangles) — used for AI navigation + zone labels
const ROOMS = {
  ceo:        {x1:32, y1:1,  x2:38, y2:7,  label:'CEO 집무실'},
  conference: {x1:14, y1:2,  x2:24, y2:8,  label:'회의실'},
  whiteboard: {x1:25, y1:2,  x2:31, y2:6,  label:'프레젠테이션'},
  reception:  {x1:1,  y1:1,  x2:7,  y2:5,  label:'로비'},
  lounge:     {x1:1,  y1:18, x2:11, y2:24, label:'휴게실 / 카페'},
  balcony:    {x1:32, y1:9,  x2:38, y2:14, label:'발코니'},
  serverRoom: {x1:33, y1:18, x2:38, y2:24, label:'서버룸'},
  toilet:     {x1:14, y1:21, x2:21, y2:24, label:'화장실'},
  workZone:   {x1:14, y1:11, x2:31, y2:18, label:'개방형 사무공간'},
};

// Per-employee desks — 16 employees, 8 dept × 2 each + roles
// Each is {x,y} of CHAIR (sit position), monitor desk is one tile up.
const DESKS = [
  // Row A (workZone top) — 4 desks
  {chair:{x:15,y:13}, monitor:{x:15,y:12}, faceDir:2},
  {chair:{x:18,y:13}, monitor:{x:18,y:12}, faceDir:2},
  {chair:{x:21,y:13}, monitor:{x:21,y:12}, faceDir:2},
  {chair:{x:24,y:13}, monitor:{x:24,y:12}, faceDir:2},
  // Row B
  {chair:{x:15,y:16}, monitor:{x:15,y:17}, faceDir:0},
  {chair:{x:18,y:16}, monitor:{x:18,y:17}, faceDir:0},
  {chair:{x:21,y:16}, monitor:{x:21,y:17}, faceDir:0},
  {chair:{x:24,y:16}, monitor:{x:24,y:17}, faceDir:0},
  // Side bay (left of work zone)
  {chair:{x:9, y:8},  monitor:{x:9, y:7},  faceDir:2},
  {chair:{x:11,y:8},  monitor:{x:11,y:7},  faceDir:2},
  {chair:{x:9, y:11}, monitor:{x:9, y:10}, faceDir:2},
  {chair:{x:11,y:11}, monitor:{x:11,y:10}, faceDir:2},
  {chair:{x:9, y:14}, monitor:{x:9, y:13}, faceDir:2},
  {chair:{x:11,y:14}, monitor:{x:11,y:13}, faceDir:2},
  // CEO + reception
  {chair:{x:36,y:4},  monitor:{x:36,y:3},  faceDir:2, ceo:true},
  {chair:{x:4, y:3},  monitor:{x:4, y:2},  faceDir:2, reception:true},
];

// Conference table seats (around round table at 18-20, 4-6)
const CONFERENCE_SEATS = [
  {x:17, y:3}, {x:19, y:3}, {x:21, y:3},
  {x:17, y:7}, {x:19, y:7}, {x:21, y:7},
  {x:15, y:5}, {x:23, y:5},
];

// Lounge sit spots (sofa + coffee)
const LOUNGE_SPOTS = [
  {x:3, y:21, action:'sofa'}, {x:5, y:21, action:'sofa'},
  {x:7, y:21, action:'sofa'}, {x:9, y:21, action:'sofa'},
  {x:3, y:23, action:'coffee'}, {x:8, y:23, action:'coffee'},
];

// Balcony spots
const BALCONY_SPOTS = [
  {x:34, y:11}, {x:36, y:11}, {x:34, y:13}, {x:36, y:13},
];

// Whiteboard standing spots
const WHITEBOARD_SPOTS = [
  {x:27, y:5}, {x:28, y:5}, {x:29, y:5},
];

// Toilet spots
const TOILET_SPOTS = [
  {x:16, y:23}, {x:18, y:23}, {x:20, y:23},
];

function buildOfficeMap() {
  const MW = MAP_W, MH = MAP_H;
  const floor = new Array(MW*MH).fill(2);   // default carpet
  const obj   = new Array(MW*MH).fill(0);

  const fset = (x,y,g) => { if(x>=0 && x<MW && y>=0 && y<MH) floor[y*MW+x] = g; };
  const oset = (x,y,g) => { if(x>=0 && x<MW && y>=0 && y<MH) obj[y*MW+x] = g; };

  // ── Floor zoning ──────────────────────────────────────
  // CEO marble
  for(let y=ROOMS.ceo.y1; y<=ROOMS.ceo.y2; y++)
    for(let x=ROOMS.ceo.x1; x<=ROOMS.ceo.x2; x++) fset(x,y,25);
  // Conference (purple meeting carpet)
  for(let y=ROOMS.conference.y1; y<=ROOMS.conference.y2; y++)
    for(let x=ROOMS.conference.x1; x<=ROOMS.conference.x2; x++) fset(x,y,6);
  // Whiteboard zone — meeting carpet
  for(let y=ROOMS.whiteboard.y1; y<=ROOMS.whiteboard.y2; y++)
    for(let x=ROOMS.whiteboard.x1; x<=ROOMS.whiteboard.x2; x++) fset(x,y,6);
  // Reception — wood floor
  for(let y=ROOMS.reception.y1; y<=ROOMS.reception.y2; y++)
    for(let x=ROOMS.reception.x1; x<=ROOMS.reception.x2; x++) fset(x,y,21);
  // Lounge — warm rug
  for(let y=ROOMS.lounge.y1; y<=ROOMS.lounge.y2; y++)
    for(let x=ROOMS.lounge.x1; x<=ROOMS.lounge.x2; x++) fset(x,y,16);
  // Balcony — deck
  for(let y=ROOMS.balcony.y1; y<=ROOMS.balcony.y2; y++)
    for(let x=ROOMS.balcony.x1; x<=ROOMS.balcony.x2; x++) fset(x,y,23);
  // Server room — tile-ish dark
  for(let y=ROOMS.serverRoom.y1; y<=ROOMS.serverRoom.y2; y++)
    for(let x=ROOMS.serverRoom.x1; x<=ROOMS.serverRoom.x2; x++) fset(x,y,22);
  // Toilet — tile floor
  for(let y=ROOMS.toilet.y1; y<=ROOMS.toilet.y2; y++)
    for(let x=ROOMS.toilet.x1; x<=ROOMS.toilet.x2; x++) fset(x,y,22);

  // ── Outer walls ───────────────────────────────────────
  for(let x=0; x<MW; x++){ oset(x,0,3); oset(x,MH-1,3); }
  for(let y=0; y<MH; y++){ oset(0,y,3); oset(MW-1,y,3); }

  // Windows in outer wall
  [4,7,11,18,22,27].forEach(wx => oset(wx, 0, 7));
  [3,6,10,14,17,20,23].forEach(wy => oset(0, wy, 7));
  [10,15,20,23,25].forEach(wx => oset(wx, MH-1, 7));
  // Glass wall to balcony (right side)
  for(let wy=10; wy<=13; wy++) oset(MW-1, wy, 32);

  // ── CEO room walls ────────────────────────────────────
  for(let y=ROOMS.ceo.y1-1; y<=ROOMS.ceo.y2+1; y++) oset(31, y, 3);
  for(let x=31; x<MW; x++) oset(x, ROOMS.ceo.y2+1, 3);
  oset(31, 4, 8); // door

  // ── Conference room walls ─────────────────────────────
  // Top + bottom of conference (already outer walls top); left/right partitions
  for(let y=1; y<=ROOMS.conference.y2+1; y++) oset(13, y, 3);
  for(let y=1; y<=ROOMS.conference.y2+1; y++) oset(25, y, 3);
  for(let x=14; x<=24; x++) oset(x, ROOMS.conference.y2+1, 3);
  // Conference door (south side)
  oset(19, ROOMS.conference.y2+1, 8);

  // ── Whiteboard zone wall ──────────────────────────────
  // Right wall of whiteboard zone
  for(let y=1; y<=ROOMS.whiteboard.y2+1; y++) oset(31, y, 3);
  // South wall
  for(let x=26; x<=30; x++) oset(x, ROOMS.whiteboard.y2+1, 3);
  oset(28, ROOMS.whiteboard.y2+1, 8); // door

  // ── Reception walls ───────────────────────────────────
  for(let y=1; y<=ROOMS.reception.y2+1; y++) oset(8, y, 3);
  for(let x=1; x<=7; x++) oset(x, ROOMS.reception.y2+1, 3);
  oset(5, ROOMS.reception.y2+1, 8); // door

  // ── Lounge walls ──────────────────────────────────────
  for(let y=ROOMS.lounge.y1-1; y<=MH-1; y++) oset(12, y, 3);
  for(let x=1; x<=11; x++) oset(x, ROOMS.lounge.y1-1, 3);
  oset(8, ROOMS.lounge.y1-1, 8); // door from work zone

  // ── Server room walls ─────────────────────────────────
  for(let y=ROOMS.serverRoom.y1-1; y<=MH-1; y++) oset(32, y, 3);
  for(let x=33; x<MW; x++) oset(x, ROOMS.serverRoom.y1-1, 3);
  oset(35, ROOMS.serverRoom.y1-1, 8);

  // ── Toilet walls ──────────────────────────────────────
  for(let y=ROOMS.toilet.y1-1; y<=MH-1; y++){ oset(13, y, 3); oset(22, y, 3); }
  for(let x=14; x<=21; x++) oset(x, ROOMS.toilet.y1-1, 3);
  oset(17, ROOMS.toilet.y1-1, 8);

  // ── Balcony rail (right edge of balcony, separates from interior) ──
  for(let y=ROOMS.balcony.y1; y<=ROOMS.balcony.y2; y++){
    // Glass already on column MW-1 at y10-13; outer rail along right side
  }
  // Rail along south edge of balcony
  for(let x=ROOMS.balcony.x1; x<=ROOMS.balcony.x2; x++) oset(x, ROOMS.balcony.y2+1, 24);

  // ── Furniture ─────────────────────────────────────────
  // CEO room
  oset(36, 3, 28); // CEO desk (with monitor)
  oset(36, 4, 20); // CEO chair
  oset(33, 2, 15); // bookshelf
  oset(34, 2, 15); // bookshelf
  oset(35, 2, 15); // bookshelf
  oset(33, 6, 12); // sofa
  oset(34, 6, 13); // plant
  oset(37, 6, 41); // tall plant
  oset(37, 2, 39); // motivational poster
  oset(33, 4, 36); // floor lamp
  oset(33, 5, 44); // coffee table
  oset(38, 3, 33); // wall art
  oset(35, 6, 47); // trash bin

  // Reception desk
  oset(3, 2, 18);
  oset(4, 2, 18);
  oset(5, 2, 18);
  oset(4, 3, 5);  // chair
  oset(2, 4, 41); // tall plant
  oset(6, 4, 41); // tall plant
  oset(7, 2, 34); // wall clock
  oset(2, 2, 33); // wall art
  oset(6, 1, 13); // small plant
  oset(7, 4, 47); // trash bin

  // Conference room — round table center (3x3)
  for(let y=4; y<=6; y++) for(let x=18; x<=20; x++) oset(x,y,9);
  // Conference chairs around table
  oset(17,3,29); oset(19,3,29); oset(21,3,29);
  oset(17,7,29); oset(19,7,29); oset(21,7,29);
  oset(15,5,29); oset(23,5,29);
  oset(14,1,38); oset(24,1,38); // succulents in corners
  // window flair + projector + clock
  oset(15,2,7); oset(23,2,7);
  oset(19,1,40); // projector screen
  oset(14,7,38); oset(24,7,38);

  // Whiteboard zone
  oset(26,2,10); oset(27,2,10); oset(28,2,10); oset(29,2,10); oset(30,2,10);
  oset(26,5,12); // small couch for audience
  oset(27,5,12);
  oset(30,5,38); // succulent
  oset(25,5,48); // standing easel
  oset(30,3,34); // wall clock

  // Open work zone — desks (rows of cubicle desks with monitors)
  // Row A: 4 desks back-to-back at y=12 (monitor) y=13 (chair facing up)
  [15,18,21,24].forEach(x => { oset(x,12,27); oset(x,13,5); });
  // Row B: 4 desks at y=17 monitor + y=16 chair
  [15,18,21,24].forEach(x => { oset(x,17,27); oset(x,16,5); });
  // Cubicle partitions (vertical) when layout=cubicle handled by re-render; default open
  // Side bay desks (left of work zone) — 6 desks
  [{x:9,y:7},{x:11,y:7},{x:9,y:10},{x:11,y:10},{x:9,y:13},{x:11,y:13}].forEach(p => {
    oset(p.x,p.y,27); oset(p.x,p.y+1,5);
  });
  // Plants between bays
  oset(10,9,13); oset(10,12,38); oset(10,15,13);
  // Printer
  oset(13,15,19);
  // Water cooler + vending
  oset(13,12,30);
  oset(13,9,37); // snack vending
  // Wall art on workzone walls
  oset(14,9,33); oset(20,9,39); oset(26,9,34); // wall clock
  oset(31,12,33); // art
  // Trash bins
  oset(13,18,47);

  // Lounge interior
  // Coffee machine + sofa cluster
  oset(2,19,11); oset(3,19,11); // coffee machines
  oset(5,19,31); oset(6,19,31); oset(7,19,31); // kitchen counter
  oset(9,19,30); // water cooler
  // Sofas
  oset(2,21,12); oset(3,21,12); oset(4,21,12);
  oset(7,21,12); oset(8,21,12); oset(9,21,12);
  // Round small table
  oset(5,22,9);
  // Plants
  oset(2,23,41); oset(11,23,41); oset(11,19,38);
  // Bookshelf + decor
  oset(11,20,15);
  oset(4,19,37); // snack vending
  oset(8,19,37); // snack vending
  oset(2,18,33); // wall art
  oset(7,18,33); // wall art
  oset(11,18,34); // wall clock

  // Server room
  oset(34,19,14); oset(35,19,14); oset(36,19,14); oset(37,19,14);
  oset(34,21,14); oset(35,21,14); oset(36,21,14); oset(37,21,14);
  oset(34,23,14); oset(35,23,14);

  // Toilet
  oset(15,22,17); oset(17,22,17); oset(19,22,17); oset(21,22,17);

  // Balcony plants + chairs
  oset(33,10,41); oset(37,10,41);
  oset(34,12,43); oset(36,12,43); // armchairs
  oset(35,11,46); // outdoor table
  oset(33,13,38); oset(37,13,38);

  return {
    type:'map', version:'1.10', orientation:'orthogonal', renderorder:'right-down',
    width:MW, height:MH, tilewidth:16, tileheight:16, infinite:false,
    nextlayerid:3, nextobjectid:1,
    tilesets:[{
      firstgid:1, name:'office-tiles', tilewidth:16, tileheight:16,
      spacing:0, margin:0, columns:8, tilecount:48,
      image:'tiles', imagewidth:128, imageheight:128
    }],
    layers:[
      {id:1, name:'floor',   type:'tilelayer', x:0, y:0, width:MW, height:MH, opacity:1, visible:true, data:floor},
      {id:2, name:'objects', type:'tilelayer', x:0, y:0, width:MW, height:MH, opacity:1, visible:true, data:obj}
    ]
  };
}

// Walkability — true means agents can step there
function buildWalkable(mapData) {
  const W=mapData.width, H=mapData.height;
  const obj = mapData.layers.find(l=>l.name==='objects').data;
  const walk = new Array(W*H);
  // Block these GIDs — walls/furniture (extended with detail tiles)
  const BLOCK = new Set([
    3, 4, 9, 10, 11, 12, 14, 15, 17, 18, 24, 26, 27, 28, 30, 31, 32,
    33, 34, 35, 36, 37, 39, 40, 41, 43, 44, 45, 46, 47, 48
  ]);
  for(let i=0;i<W*H;i++){
    const g = obj[i];
    walk[i] = !BLOCK.has(g);
  }
  return walk;
}

window.OFFICE_MAP = {
  MAP_W, MAP_H, ROOMS, DESKS,
  CONFERENCE_SEATS, LOUNGE_SPOTS, BALCONY_SPOTS,
  WHITEBOARD_SPOTS, TOILET_SPOTS,
  buildOfficeMap, buildWalkable
};
