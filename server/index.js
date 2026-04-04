const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./config');
const apiRoutes = require('./routes/api');
const { setupSocketHandlers } = require('./socket/handlers');
const { agentManager } = require('./services/agentManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', apiRoutes);

// Initialize default agents
agentManager.createAgent('Atlas', 'Project Manager', 0, { x: 4, y: 4 });
agentManager.createAgent('Nova', 'Developer', 1, { x: 8, y: 4 });
agentManager.createAgent('Pixel', 'Designer', 2, { x: 23, y: 4 });

// Setup socket
setupSocketHandlers(io, agentManager);

server.listen(config.port, () => {
  console.log(`🏢 Pixel Office AI running at http://localhost:${config.port}`);
  if (!config.anthropicApiKey) {
    console.log('⚠️  No ANTHROPIC_API_KEY set. AI features will use mock responses.');
  }
});
