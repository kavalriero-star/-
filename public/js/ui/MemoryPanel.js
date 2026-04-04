class MemoryPanel {
  constructor() {
    this.panelEl = document.getElementById('memory-panel');
    this.listEl = document.getElementById('memory-list');
    this.toggleBtn = document.getElementById('memory-toggle');
    this.countEl = document.getElementById('memory-count');
    this.collapsed = false;

    this.setupEvents();
    this.setupSocketListeners();

    // 초기 메모리 목록 요청
    window.socketManager.emit('memory:request');
  }

  setupEvents() {
    this.toggleBtn?.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.listEl.style.display = this.collapsed ? 'none' : 'block';
      this.toggleBtn.textContent = this.collapsed ? '▶' : '▼';
    });
  }

  setupSocketListeners() {
    const sm = window.socketManager;

    sm.on('memory:list', (data) => {
      this.renderMemoryList(data.grouped);
    });

    sm.on('memory:saved', (data) => {
      // 새 메모리가 저장되면 목록 갱신
      window.socketManager.emit('memory:request');
    });
  }

  renderMemoryList(grouped) {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';

    const categories = Object.keys(grouped);
    let total = 0;

    if (categories.length === 0) {
      this.listEl.innerHTML = '<div class="memory-empty">저장된 업무 기록이 없습니다</div>';
      this.updateCount(0);
      return;
    }

    for (const category of categories) {
      const items = grouped[category];
      total += items.length;

      const catEl = document.createElement('div');
      catEl.className = 'memory-category';

      const catHeader = document.createElement('div');
      catHeader.className = 'memory-cat-header';
      catHeader.innerHTML = `
        <span class="memory-cat-icon">${this.getCategoryIcon(category)}</span>
        <span class="memory-cat-name">${category}</span>
        <span class="memory-cat-count">${items.length}</span>
      `;

      const itemsEl = document.createElement('div');
      itemsEl.className = 'memory-items';

      for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'memory-item';
        itemEl.innerHTML = `
          <div class="memory-item-title">${this.escapeHtml(item.title)}</div>
          <div class="memory-item-date">${item.date || ''}</div>
          ${item.pdfUrl ? `<a href="${item.pdfUrl}" target="_blank" class="memory-item-pdf">📄 PDF</a>` : ''}
        `;
        itemEl.addEventListener('click', () => {
          // 클릭 시 채팅 입력창에 제목 채우기 (참고용)
          const chatInput = document.getElementById('chat-input');
          if (chatInput) {
            chatInput.value = `[참고: ${item.title}] `;
            chatInput.focus();
          }
        });
        itemsEl.appendChild(itemEl);
      }

      // 카테고리 헤더 클릭으로 펼치기/접기
      let catCollapsed = false;
      catHeader.addEventListener('click', () => {
        catCollapsed = !catCollapsed;
        itemsEl.style.display = catCollapsed ? 'none' : 'block';
        catHeader.querySelector('.memory-cat-count').style.opacity = catCollapsed ? '0.5' : '1';
      });

      catEl.appendChild(catHeader);
      catEl.appendChild(itemsEl);
      this.listEl.appendChild(catEl);
    }

    this.updateCount(total);
  }

  updateCount(n) {
    if (this.countEl) {
      this.countEl.textContent = n > 0 ? `(${n})` : '';
    }
  }

  getCategoryIcon(category) {
    const icons = {
      '기획': '📋', '개발': '💻', '마케팅': '📢',
      '디자인': '🎨', '분석': '📊', 'QA': '🔍',
      '재무': '💰', '일반': '📁',
    };
    return icons[category] || '📁';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.MemoryPanel = MemoryPanel;
export default MemoryPanel;
