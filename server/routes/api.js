const express = require('express');
const router = express.Router();
const { agentManager } = require('../services/agentManager');

router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/agents', (req, res) => {
  res.json({ agents: agentManager.getAllAgents() });
});

router.get('/locations', (req, res) => {
  res.json({ locations: agentManager.getNamedLocations() });
});

module.exports = router;
