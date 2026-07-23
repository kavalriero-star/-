/* 유틸: 포맷, API, 토스트 */
const Util = (() => {
  const won = (n, d = 0) => (n == null || isNaN(n)) ? "-" :
    Number(n).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (n, d = 1) => (n == null || isNaN(n)) ? "-" :
    (Number(n) * 100).toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%";
  const won_eok = (n) => (n == null) ? "-" : (n / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 2 });

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.error || msg;
        if (Array.isArray(j.details) && j.details.length) msg += " — " + j.details.slice(0, 3).join(" / ");
      } catch (e) {}
      throw new Error(msg);
    }
    return res;
  }
  const getJSON = (p) => api(p).then(r => r.json());
  const postJSON = (p, body) => api(p, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }).then(r => r.json());

  let toastId = 0;
  function toast(msg, type = "ok", ms = 2600, action = null) {
    const wrap = document.getElementById("toasts");
    const el = document.createElement("div");
    el.className = "toast " + (type === "ok" ? "" : type);
    const icon = type === "err" ? "⚠" : type === "warn" ? "!" : "✓";
    el.innerHTML = `<span>${icon}</span><span style="flex:1">${msg}</span>`;
    if (action) {
      const a = document.createElement("a");
      a.className = "toast-action"; a.textContent = action.label; a.href = "#";
      a.onclick = (ev) => { ev.preventDefault(); action.fn(); el.remove(); };
      el.appendChild(a);
    }
    wrap.appendChild(el);
    el.dataset.id = ++toastId;
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 250); }, ms);
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  const deepClone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  return { won, pct, won_eok, getJSON, postJSON, toast, debounce, deepClone, el };
})();
