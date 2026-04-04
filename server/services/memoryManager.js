const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../../public/memory');

const CATEGORIES = {
  '기획': ['기획', '계획', '아이디어', '전략', '방향', '로드맵', 'plan'],
  '개발': ['개발', '코딩', '구현', '기능', '시스템', '서버', '앱', 'dev', 'api'],
  '마케팅': ['마케팅', '광고', '홍보', '캠페인', '브랜드', '프로모션'],
  '디자인': ['디자인', 'ui', 'ux', '화면', '레이아웃', '와이어프레임'],
  '분석': ['분석', '데이터', '통계', '리포트', '보고서', '결과', '성과'],
  'QA': ['테스트', 'qa', '검토', '검수', '버그', '오류'],
  '재무': ['비용', '예산', '수익', '투자', '재무', '회계'],
};

function detectCategory(title) {
  const t = title.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(kw => t.includes(kw))) return cat;
  }
  return '일반';
}

function sanitizeFilename(str) {
  return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 50).trim();
}

function saveMemory(title, workLogs, pdfUrl) {
  const category = detectCategory(title);
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = sanitizeFilename(title);
  const dirName = `${date}_${safeTitle}`;
  const projectDir = path.join(MEMORY_DIR, category, dirName);

  fs.mkdirSync(projectDir, { recursive: true });

  const memoryData = {
    title,
    category,
    date: new Date().toISOString(),
    pdfUrl: pdfUrl || null,
    agents: workLogs.map(log => ({
      name: log.agentName,
      role: log.role,
      content: log.content,
    })),
  };

  fs.writeFileSync(
    path.join(projectDir, 'memory.json'),
    JSON.stringify(memoryData, null, 2),
    'utf8'
  );

  console.log(`[Memory] 저장됨: ${category}/${dirName}`);
  return { category, dirName };
}

function loadMemories(category = null, limit = 50) {
  if (!fs.existsSync(MEMORY_DIR)) return [];

  const memories = [];
  let categories;
  try {
    categories = category
      ? [category]
      : fs.readdirSync(MEMORY_DIR).filter(f =>
          fs.statSync(path.join(MEMORY_DIR, f)).isDirectory()
        );
  } catch (e) {
    return [];
  }

  for (const cat of categories) {
    const catDir = path.join(MEMORY_DIR, cat);
    if (!fs.existsSync(catDir)) continue;

    const projects = fs.readdirSync(catDir)
      .filter(f => fs.statSync(path.join(catDir, f)).isDirectory())
      .sort()
      .reverse();

    for (const proj of projects) {
      const memFile = path.join(catDir, proj, 'memory.json');
      if (fs.existsSync(memFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(memFile, 'utf8'));
          memories.push({ ...data, dirName: proj });
        } catch (e) { /* skip corrupt files */ }
      }
    }
  }

  return memories.slice(0, limit);
}

function getRelevantMemories(currentTask, limit = 3) {
  const all = loadMemories();
  if (all.length === 0) return [];

  const keywords = currentTask.toLowerCase().split(/[\s,.\-]+/).filter(k => k.length > 1);
  const scored = all.map(m => {
    const text = (m.title + ' ' + (m.agents || []).map(a => a.content || '').join(' ')).toLowerCase();
    const score = keywords.filter(kw => text.includes(kw)).length;
    return { ...m, score };
  });

  return scored
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}

function formatMemoryContext(memories) {
  if (!memories || memories.length === 0) return '';
  const lines = memories.map(m => {
    const agentSummary = (m.agents || [])
      .map(a => `  - ${a.name}(${a.role}): ${(a.content || '').substring(0, 100)}`)
      .join('\n');
    return `[${m.category}] ${m.title} (${m.date?.slice(0, 10)})\n${agentSummary}`;
  });
  return `\n## 관련 과거 업무 기록\n${lines.join('\n---\n')}`;
}

module.exports = { saveMemory, loadMemories, getRelevantMemories, formatMemoryContext, detectCategory };
