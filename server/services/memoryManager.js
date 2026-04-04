const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, '../../public/memory');

// 8개 부서 카테고리
const DEPARTMENTS = ['기획', '개발', '영업', '구매', '제조', '품질', '인사', '재무'];

const CATEGORIES = {
  '기획': ['기획', '계획', '전략', '방향', '로드맵', '아이디어', 'plan'],
  '개발': ['개발', '코딩', '구현', '기능', '시스템', '서버', '앱', 'dev', 'api', '소프트웨어'],
  '영업': ['영업', '판매', '매출', '고객', '계약', '수주', '마케팅', '홍보'],
  '구매': ['구매', '조달', '발주', '공급', '협력사', '자재', '재고'],
  '제조': ['제조', '생산', '공정', '제품', '품목', '설비', '라인'],
  '품질': ['품질', '테스트', 'qa', '검토', '검수', '버그', '오류', '기준', '표준'],
  '인사': ['인사', '채용', '교육', '복리', '직원', '조직', '급여', '평가'],
  '재무': ['재무', '비용', '예산', '수익', '투자', '회계', '결산', '세금'],
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

function saveMemory(title, workLogs, pdfUrl, department = null) {
  const category = (department && DEPARTMENTS.includes(department))
    ? department
    : detectCategory(title);
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

module.exports = { saveMemory, loadMemories, getRelevantMemories, formatMemoryContext, detectCategory, DEPARTMENTS };
