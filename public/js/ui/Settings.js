class Settings {
  constructor() {
    const btn = document.getElementById('settings-btn');
    const modal = document.getElementById('settings-modal');
    const saveBtn = document.getElementById('settings-save');
    const cancelBtn = document.getElementById('settings-cancel');
    const msg = document.getElementById('settings-msg');

    if (!btn || !modal) return;

    btn.addEventListener('click', () => {
      modal.style.display = 'flex';
    });

    cancelBtn?.addEventListener('click', () => {
      modal.style.display = 'none';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    saveBtn?.addEventListener('click', async () => {
      const anthropicKey = document.getElementById('input-anthropic-key')?.value.trim();
      const geminiKey = document.getElementById('input-gemini-key')?.value.trim();

      try {
        const res = await fetch('/api/settings/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anthropicKey, geminiKey }),
        });
        const data = await res.json();
        if (msg) {
          msg.textContent = data.message || '저장되었습니다.';
          msg.style.color = res.ok ? '#4ade80' : '#f87171';
        }
        if (res.ok) setTimeout(() => { modal.style.display = 'none'; }, 1200);
      } catch (e) {
        if (msg) { msg.textContent = '오류: ' + e.message; msg.style.color = '#f87171'; }
      }
    });
  }
}

window.Settings = Settings;
export default Settings;
