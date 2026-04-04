class ChatPanel {
  constructor() {
    this.messagesEl = document.getElementById('chat-messages');
    this.inputEl = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('chat-send');
    this.selectorEl = document.getElementById('target-agent');

    this.setupEvents();
    this.setupSocketListeners();
  }

  setupEvents() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });
  }

  setupSocketListeners() {
    const sm = window.socketManager;

    sm.on('sync:state', (data) => {
      this.updateAgentSelector(data.agents);
    });

    sm.on('agent:spawn', (data) => {
      this.addAgentToSelector(data.agent);
    });

    sm.on('chat:typing', (data) => {
      this.showTyping(data.agentId);
    });

    sm.on('chat:response', (data) => {
      this.removeTyping();
      this.addMessage(data.agentName || 'Agent', data.message, 'agent', data.toolCalls);
    });

    sm.on('report:ready', (data) => {
      this.removeTyping();
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-msg report-ready';
      msgEl.innerHTML = `
        <div class="msg-name">📄 보고서 완성</div>
        <div class="msg-text">${this.escapeHtml(data.title.substring(0, 40))}</div>
        <a href="${data.url}" target="_blank" class="report-link">📥 PDF 다운로드</a>
      `;
      this.messagesEl.appendChild(msgEl);
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  updateAgentSelector(agents) {
    this.selectorEl.innerHTML = '';
    for (const agent of agents) {
      const option = document.createElement('option');
      option.value = agent.id;
      option.textContent = `${agent.name} (${agent.role})`;
      this.selectorEl.appendChild(option);
    }

    // Select the currently selected agent if any
    if (window.clientAgentManager && window.clientAgentManager.selectedAgentId) {
      this.selectorEl.value = window.clientAgentManager.selectedAgentId;
    }
  }

  addAgentToSelector(agent) {
    const option = document.createElement('option');
    option.value = agent.id;
    option.textContent = `${agent.name} (${agent.role})`;
    this.selectorEl.appendChild(option);
  }

  sendMessage() {
    const message = this.inputEl.value.trim();
    if (!message) return;

    const agentId = this.selectorEl.value;
    const deptEl = document.getElementById('dept-select');
    const department = deptEl ? deptEl.value : '기획';

    this.addMessage('나', `[${department}] ${message}`, 'user');
    window.socketManager.emit('chat:message', { agentId, message, department });
    this.inputEl.value = '';
    this.inputEl.focus();
  }

  addMessage(name, text, type, toolCalls = []) {
    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${type}`;

    let toolCallsHtml = '';
    if (toolCalls && toolCalls.length > 0) {
      const calls = toolCalls
        .map(tc => `<div class="tool-call">${tc.name}(${JSON.stringify(tc.input).substring(0, 60)})</div>`)
        .join('');
      toolCallsHtml = `<div class="tool-calls">${calls}</div>`;
    }

    msgEl.innerHTML = `
      <div class="msg-name">${name}</div>
      <div class="msg-text">${this.escapeHtml(text)}</div>
      ${toolCallsHtml}
    `;

    this.messagesEl.appendChild(msgEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  showTyping(agentId) {
    this.removeTyping();
    const el = document.createElement('div');
    el.className = 'typing-indicator';
    el.id = 'typing-indicator';
    el.textContent = '생각 중...';
    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.ChatPanel = ChatPanel;
export default ChatPanel;
