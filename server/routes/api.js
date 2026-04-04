const express = require('express');
const router = express.Router();
const { agentManager } = require('../services/agentManager');
const claudeService = require('../services/claude');
const { loadMemories, detectCategory } = require('../services/memoryManager');

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/agents', (req, res) => {
  res.json({ agents: agentManager.getAllAgents() });
});

router.get('/locations', (req, res) => {
  res.json({ locations: agentManager.getNamedLocations() });
});

router.get('/ai-mode', (req, res) => {
  res.json({ mode: claudeService.getMode() });
});

router.post('/settings/api-key', (req, res) => {
  const { anthropicKey, geminiKey } = req.body;
  claudeService.setApiKeys(anthropicKey, geminiKey);
  res.json({ mode: claudeService.getMode() });
});

// 전체 메모리 목록 (카테고리별 그룹)
router.get('/memories', (req, res) => {
  const { category } = req.query;
  const memories = loadMemories(category || null);
  // 카테고리별 그룹화
  const grouped = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category].push({
      title: m.title,
      date: m.date,
      pdfUrl: m.pdfUrl,
      dirName: m.dirName,
      agents: (m.agents || []).map(a => ({ name: a.name, role: a.role })),
    });
  }
  res.json({ grouped, total: memories.length });
});

// 특정 메모리 상세
router.get('/memories/:category/:dirName', (req, res) => {
  const { loadMemories } = require('../services/memoryManager');
  const memories = loadMemories(req.params.category);
  const found = memories.find(m => m.dirName === req.params.dirName);
  if (!found) return res.status(404).json({ error: 'Not found' });
  res.json(found);
});

module.exports = router;
