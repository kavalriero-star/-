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
agentManager.createAgent('태호', 'CEO', 2, { x: 19, y: 12 });
agentManager.createAgent('민준', '프로젝트 매니저', 0, { x: 4, y: 5 });
agentManager.createAgent('지훈', '개발자', 1, { x: 8, y: 5 });
agentManager.createAgent('소연', '디자이너', 3, { x: 23, y: 5 });
agentManager.createAgent('현우', 'QA 테스터', 4, { x: 4, y: 12 });
agentManager.createAgent('유나', '데이터 분석가', 5, { x: 8, y: 12 });

// Setup socket
setupSocketHandlers(io, agentManager);

server.listen(config.port, () => {
  console.log(`🏢 Pixel Office AI running at http://localhost:${config.port}`);
  if (config.anthropicApiKey) {
    console.log('✅ Anthropic Claude 모드로 실행 중');
  } else if (config.geminiApiKey) {
    console.log('✅ Google Gemini 모드로 실행 중');
  } else {
    console.log('⚠️  API 키 없음. Mock 모드로 실행 중.');
  }
});
