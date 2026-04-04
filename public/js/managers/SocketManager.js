class SocketManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    this.socket = io();

    this.socket.on('connect', () => {
      console.log('Connected to server');
      const statusBar = document.getElementById('status-bar');
      statusBar.textContent = '연결됨 ✓';
      statusBar.className = 'connected';
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      const statusBar = document.getElementById('status-bar');
      statusBar.textContent = '연결 끊김';
      statusBar.className = '';
    });

    // Forward all game events to registered listeners
    const events = [
      'sync:state', 'agent:move', 'agent:speak', 'agent:state',
      'agent:spawn', 'agent:remove', 'chat:response', 'chat:typing',
      'report:ready', 'memory:saved', 'memory:list',
    ];

    for (const event of events) {
      this.socket.on(event, (data) => {
        const callbacks = this.listeners.get(event) || [];
        for (const cb of callbacks) cb(data);
      });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  requestSync() {
    this.emit('sync:request');
  }
}

// Global singleton
window.socketManager = new SocketManager();
export default window.socketManager;
