// ═══════════════════════════════════════════════════════
// 16 employees, dept routing, autonomous behavior schedules
// ═══════════════════════════════════════════════════════

const AGENTS_DATA = [
  // Leadership
  { id:'a01', name:'태호', role:'CEO',          dept:'경영', spriteIndex:2,  homeDesk:14 },
  { id:'a02', name:'민준', role:'프로젝트 매니저', dept:'기획', spriteIndex:0,  homeDesk:0  },
  // Engineering
  { id:'a03', name:'지훈', role:'시니어 개발자',  dept:'개발', spriteIndex:1,  homeDesk:1  },
  { id:'a04', name:'성민', role:'백엔드 개발자',  dept:'개발', spriteIndex:13, homeDesk:2  },
  { id:'a05', name:'재현', role:'프론트 개발자',  dept:'개발', spriteIndex:11, homeDesk:3  },
  // Design / Data
  { id:'a06', name:'소연', role:'프로덕트 디자이너', dept:'기획', spriteIndex:3,  homeDesk:4  },
  { id:'a07', name:'유나', role:'데이터 분석가',  dept:'개발', spriteIndex:5,  homeDesk:5  },
  // QA / Ops
  { id:'a08', name:'현우', role:'QA 테스터',     dept:'품질', spriteIndex:4,  homeDesk:6  },
  { id:'a09', name:'다은', role:'DevOps',        dept:'개발', spriteIndex:8,  homeDesk:7  },
  // Sales / Buying
  { id:'a10', name:'서윤', role:'영업 팀장',     dept:'영업', spriteIndex:10, homeDesk:8  },
  { id:'a11', name:'준호', role:'영업 매니저',   dept:'영업', spriteIndex:6,  homeDesk:9  },
  { id:'a12', name:'예린', role:'구매 담당',     dept:'구매', spriteIndex:9,  homeDesk:10 },
  // Manufacturing / HR / Finance
  { id:'a13', name:'태민', role:'제조 매니저',   dept:'제조', spriteIndex:7,  homeDesk:11 },
  { id:'a14', name:'하늘', role:'인사 담당',     dept:'인사', spriteIndex:12, homeDesk:12 },
  { id:'a15', name:'시우', role:'재무 담당',     dept:'재무', spriteIndex:14, homeDesk:13 },
  // Reception
  { id:'a16', name:'아린', role:'리셉션',        dept:'경영', spriteIndex:15, homeDesk:15 },
];

// Initialize positions at home desks
AGENTS_DATA.forEach(a => {
  const desk = window.OFFICE_MAP.DESKS[a.homeDesk];
  a.x = desk.chair.x;
  a.y = desk.chair.y;
  a.faceDir = desk.faceDir != null ? desk.faceDir : 3;
  a.state = 'idle';
  a.energy = 100; // 0-100; depletes while working, restores in lounge
  a.task = null;
  a.behavior = 'desk'; // 'desk'|'meeting'|'lounge'|'balcony'|'whiteboard'|'toilet'|'wandering'|'chatting'
  a.behaviorUntil = 0;
});

// Department → primary handler chain (who works on which dept's task)
const CHAIN_BY_DEPT = {
  '기획': ['CEO','프로젝트 매니저','프로덕트 디자이너','시니어 개발자','QA 테스터','데이터 분석가'],
  '개발': ['CEO','프로젝트 매니저','시니어 개발자','백엔드 개발자','프론트 개발자','QA 테스터'],
  '영업': ['CEO','영업 팀장','영업 매니저','데이터 분석가','프로젝트 매니저','QA 테스터'],
  '구매': ['CEO','구매 담당','재무 담당','프로젝트 매니저','QA 테스터','데이터 분석가'],
  '제조': ['CEO','제조 매니저','구매 담당','QA 테스터','데이터 분석가','프로젝트 매니저'],
  '품질': ['CEO','QA 테스터','시니어 개발자','프로덕트 디자이너','데이터 분석가','프로젝트 매니저'],
  '인사': ['CEO','인사 담당','프로젝트 매니저','재무 담당','QA 테스터','데이터 분석가'],
  '재무': ['CEO','재무 담당','데이터 분석가','프로젝트 매니저','QA 테스터','시니어 개발자'],
};

// ═══════════════════════════════════════════════════════
// Autonomy AI — each tick, agents may transition behaviors
// ═══════════════════════════════════════════════════════
const TM = window.OFFICE_MAP;

function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function chance(p){ return Math.random() < p; }

// Simple BFS pathfinding on walkable grid
function findPath(walk, W, H, sx, sy, tx, ty) {
  if(sx===tx && sy===ty) return [];
  const idx = (x,y)=>y*W+x;
  const visited = new Uint8Array(W*H);
  const prev = new Int32Array(W*H).fill(-1);
  const q = [idx(sx,sy)];
  visited[idx(sx,sy)] = 1;
  let head=0;
  const goal = idx(tx,ty);
  while(head<q.length){
    const cur = q[head++];
    if(cur===goal){
      const path=[];
      let n=goal;
      while(n!==idx(sx,sy)){
        path.push({x:n%W, y:Math.floor(n/W)});
        n = prev[n];
        if(n<0) break;
      }
      return path.reverse();
    }
    const cx=cur%W, cy=Math.floor(cur/W);
    const ns=[[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]];
    for(const [nx,ny] of ns){
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const ni = idx(nx,ny);
      if(visited[ni]) continue;
      // Allow the goal even if it's a chair (we sit on chairs)
      const isGoal = (nx===tx && ny===ty);
      if(!walk[ni] && !isGoal) continue;
      visited[ni]=1;
      prev[ni]=cur;
      q.push(ni);
    }
  }
  return null;
}

// Find nearest free spot in array {x,y}[] (not occupied by another agent)
function findFreeSpot(spots, occupied){
  const shuffled = [...spots].sort(()=>Math.random()-0.5);
  for(const s of shuffled){
    const key = `${s.x},${s.y}`;
    if(!occupied.has(key)) return s;
  }
  return null;
}

// Build occupancy map from AGENTS_DATA
function buildOccupancy(exceptId){
  const occ = new Set();
  for(const a of AGENTS_DATA){
    if(a.id===exceptId) continue;
    if(a.target) occ.add(`${a.target.x},${a.target.y}`);
    occ.add(`${a.x},${a.y}`);
  }
  return occ;
}

// ═══════════════════════════════════════════════════════
// Behavior selection
// ═══════════════════════════════════════════════════════
function chooseBehavior(agent, ctx) {
  // ctx: { hour, autonomyEnabled, busyAgents: Set<id> }
  if(ctx.busyAgents && ctx.busyAgents.has(agent.id)) return null; // task chain has it
  if(!ctx.autonomyEnabled) return null;

  const h = ctx.hour;

  // Lunch hour 12-13 → most go to lounge
  if(h>=12 && h<13) {
    if(agent.behavior!=='lounge' && chance(0.6)) return 'lounge';
  }
  // After 6pm → wander, balcony, toilet, lounge
  if(h>=18 || h<9) {
    if(chance(0.3)) return pickRandom(['lounge','balcony','toilet','desk']);
  }

  // Energy below 30 → forced break
  if(agent.energy < 30 && chance(0.4)) return pickRandom(['lounge','balcony']);

  // CEO / PM occasional walk-around
  if((agent.role==='CEO' || agent.role==='프로젝트 매니저') && chance(0.05)) {
    return pickRandom(['whiteboard','wandering','desk']);
  }

  // Default: small chance to do something
  if(chance(0.04)) {
    return pickRandom(['lounge','toilet','balcony','wandering','whiteboard','desk','desk','desk']);
  }
  return null;
}

// Get target spot for behavior
function targetForBehavior(agent, behavior, occupied) {
  switch(behavior) {
    case 'desk': {
      const desk = TM.DESKS[agent.homeDesk];
      return desk.chair;
    }
    case 'lounge': {
      return findFreeSpot(TM.LOUNGE_SPOTS, occupied);
    }
    case 'balcony': {
      return findFreeSpot(TM.BALCONY_SPOTS, occupied);
    }
    case 'whiteboard': {
      return findFreeSpot(TM.WHITEBOARD_SPOTS, occupied);
    }
    case 'toilet': {
      return findFreeSpot(TM.TOILET_SPOTS, occupied);
    }
    case 'meeting': {
      return findFreeSpot(TM.CONFERENCE_SEATS, occupied);
    }
    case 'wandering': {
      // Pick a random walkable cell in work zone
      const r = TM.ROOMS.workZone;
      for(let tries=0; tries<10; tries++){
        const x = r.x1 + Math.floor(Math.random()*(r.x2-r.x1));
        const y = r.y1 + Math.floor(Math.random()*(r.y2-r.y1));
        const key=`${x},${y}`;
        if(!occupied.has(key)) return {x,y};
      }
      return null;
    }
    default: return null;
  }
}

// State color mapping for behavior
function stateForBehavior(behavior) {
  if(behavior==='desk') return 'working';
  if(behavior==='lounge') return 'coffee';
  if(behavior==='balcony') return 'coffee';
  if(behavior==='whiteboard') return 'meeting';
  if(behavior==='toilet') return 'toilet';
  if(behavior==='meeting') return 'meeting';
  if(behavior==='wandering') return 'moving';
  return 'idle';
}

window.OFFICE_AGENTS = {
  AGENTS_DATA, CHAIN_BY_DEPT,
  findPath, findFreeSpot, buildOccupancy,
  chooseBehavior, targetForBehavior, stateForBehavior,
  pickRandom, chance,
};
