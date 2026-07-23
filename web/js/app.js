/* 앱 컨트롤러 — 상태, 이벤트 위임, 실시간 재계산, 저장/내보내기 */
const App = (() => {
  const { getJSON, postJSON, toast, debounce, deepClone } = Util;
  const LS_PROJECTS = "elemec_projects_v2";

  let State = {
    project: null,      // 편집 대상 (parts/assemblies/project)
    master: null,       // { config, equipment, labor }
    result: null,       // 서버 계산 결과 (+ 분석)
    activeView: { type: "summary" },
  };
  // 다중 견적(프로젝트) 관리: 여러 견적을 저장·전환. SAMPLE = 서버 기본(SDI) 스냅샷.
  let Projects = { activeId: null, items: {} };   // items[id] = { id, project, config }
  let SAMPLE = null;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const projName = (it) => (it.project.project && it.project.project.title) || "(제목없음)";
  const activeItem = () => Projects.items[Projects.activeId];

  // 중첩 경로 세터: "materials.3.unit_price"
  function setPath(obj, path, val) {
    const keys = path.split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = val;
  }
  function findEntry(kind, id) {
    const arr = kind === "assy" ? State.project.assemblies : State.project.parts;
    return arr.find(x => x.id === id);
  }
  const num = (s) => { const n = parseFloat(String(s).replace(/,/g, "")); return isNaN(n) ? 0 : n; };

  // ---- 재계산 ----
  function setBusy(b, text) {
    const s = document.getElementById("calcStatus");
    s.classList.toggle("busy", b);
    document.getElementById("calcStatusText").textContent = text || (b ? "계산 중…" : "계산 완료");
  }
  const recalc = debounce(async () => {
    setBusy(true);
    try {
      const result = await postJSON("/api/calc", { project: State.project, config: State.master.config });
      State.result = result;
      updateMeta(); buildNav(); draw();   // 계산셀/네비 태그 실시간 반영 (포커스 복원 포함)
      persist();
      setBusy(false, "계산 완료");
    } catch (e) {
      setBusy(false, "오류");
      toast("계산 오류: " + e.message, "err", 4000);
    }
  }, 240);

  // ---- 렌더 (편집 중 포커스/커서 복원) ----
  function draw() {
    const a = document.activeElement;
    let focus = null;
    if (a && (a.dataset.bind || a.dataset.cfg || a.dataset.projbind)) {
      const key = a.dataset.bind ? "bind" : a.dataset.cfg ? "cfg" : "projbind";
      focus = { key, val: a.dataset[key], s: a.selectionStart, e: a.selectionEnd };
    }
    document.getElementById("view").innerHTML = Render.render(State);
    document.querySelectorAll(".nav-item").forEach(n => {
      const v = State.activeView;
      const on = (n.dataset.view === v.type) || (n.dataset.detail && v.type === "detail" && n.dataset.detail === `${v.kind}:${v.id}`);
      n.classList.toggle("active", !!on);
    });
    if (focus) {
      const t = document.querySelector(`[data-${focus.key}="${focus.val}"]`);
      if (t) { t.focus(); try { t.setSelectionRange(focus.s, focus.e); } catch (e) {} }
    }
    applyValidationHints();
  }
  function updateMeta() {
    const p = State.project.project || {};
    const sm = State.result?.summary;
    document.getElementById("projMeta").innerHTML =
      `<b>${p.doc_no||""}-${p.revision||""}</b> · ${p.customer||""} · 연 매출 <b>${sm?Util.won(sm.total_year/1e8,1):"-"}억</b>`;
  }

  // ---- 네비게이션 ----
  function buildNav() {
    const na = document.getElementById("navAssemblies");
    const np = document.getElementById("navParts");
    na.innerHTML = ""; np.innerHTML = "";
    State.result.assemblies.forEach(a => na.appendChild(navItem("assy", a)));
    State.result.parts.forEach(p => np.appendChild(navItem("part", p)));
  }
  function navItem(kind, x) {
    const d = Util.el("div", "nav-item");
    d.dataset.detail = `${kind}:${x.id}`;
    d.innerHTML = `<span class="ic">${kind==="assy"?"◫":"▪"}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.name}</span>
      <span class="tag">${Util.won(x.kind==="assembly"?x.quote.price:x.manufacturing_cost)}</span>`;
    d.onclick = () => { State.activeView = { type: "detail", kind, id: x.id }; draw(); };
    return d;
  }

  // ---- 이벤트 위임 ----
  function wire() {
    document.querySelectorAll(".nav-item[data-view]").forEach(n =>
      n.onclick = () => { State.activeView = { type: n.dataset.view }; draw(); });

    const view = document.getElementById("view");
    // 입력 편집
    view.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.bind) {
        const [kind, id, path] = t.dataset.bind.split(":");
        const entry = findEntry(kind, id);
        const isText = t.classList.contains("text");
        setPath(entry, path, isText ? t.value : num(t.value));
        recalc();
      } else if (t.dataset.cfg) {
        setPath(State.master.config, t.dataset.cfg, num(t.value));
        recalc();
      } else if (t.dataset.projbind) {
        if (!State.project.project) State.project.project = {};
        setPath(State.project.project, t.dataset.projbind, t.value);
        updateMeta(); renderProjectSwitcher(); persist();
      }
    });
    // 셀렉트 변경: 톤수(숫자) / 참조 사출품(문자) / 재료 유형 전환
    view.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.matkind) {
        const [kind, id, idx] = t.dataset.matkind.split(":");
        changeMaterialKind(findEntry(kind, id), parseInt(idx), t.value);
        recalc();
      } else if (t.tagName === "SELECT" && t.dataset.bind) {
        const [kind, id, path] = t.dataset.bind.split(":");
        setPath(findEntry(kind, id), path, t.dataset.str !== undefined ? t.value : num(t.value));
        recalc();
      }
    });
    // 행 추가/삭제
    view.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      const del = e.target.closest("[data-del]");
      if (add) {
        const [kind, id, what] = add.dataset.add.split(":");
        const entry = findEntry(kind, id);
        if (what === "material") entry.materials.push({ name: "신규 재료", kind: "qty", sub: "", qty: 1, unit_price: 0, note: "" });
        else entry.labor.push({ name: "신규 공정", workers: 1 });
        recalc();
      } else if (del) {
        const [kind, id, what, idx] = del.dataset.del.split(":");
        findEntry(kind, id)[what].splice(parseInt(idx), 1);
        recalc();
      }
    });

    // 키보드 이동: Enter/방향키로 같은 열의 위·아래 입력셀로 (대량입력 편의)
    const rowInputs = (row) => Array.from(row.querySelectorAll("input.cell, select.cell"));
    view.addEventListener("keydown", (e) => {
      const t = e.target;
      if (!t.classList || !t.classList.contains("cell")) return;
      if (!["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
      const tr = t.closest("tr"), table = t.closest("table");
      if (!tr || !table) return;
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const col = rowInputs(tr).indexOf(t);
      const dir = e.key === "ArrowUp" ? -1 : 1;
      for (let i = rows.indexOf(tr) + dir; i >= 0 && i < rows.length; i += dir) {
        const ins = rowInputs(rows[i]);
        if (ins[col]) { e.preventDefault(); ins[col].focus(); ins[col].select && ins[col].select(); break; }
      }
    });

    // 엑셀 붙여넣기: 탭/개행 텍스트를 표에 매핑 (DOM 위치 기준 2D)
    view.addEventListener("paste", (e) => {
      const t = e.target;
      if (!t.classList || !t.classList.contains("cell")) return;
      const text = (e.clipboardData || window.clipboardData).getData("text");
      if (!text || !/[\t\n]/.test(text)) return;   // 단일 값은 기본 동작
      e.preventDefault();
      const table = t.closest("table"), tr = t.closest("tr");
      const rows = Array.from(table.querySelectorAll("tbody tr"));
      const startRow = rows.indexOf(tr), startCol = rowInputs(tr).indexOf(t);
      const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map(l => l.split("\t"));
      let filled = 0;
      matrix.forEach((cols, i) => {
        const row = rows[startRow + i]; if (!row) return;
        const ins = rowInputs(row);
        cols.forEach((val, j) => {
          const inp = ins[startCol + j];
          if (inp && !inp.disabled) {
            inp.value = val.trim();
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            filled++;
          }
        });
      });
      if (filled) toast(`${filled}개 셀에 붙여넣기 완료`);
    });
  }

  // 확정 시점 소프트 유효성 피드백(허용하되 경고) + 상단 배지
  function applyValidationHints() {
    let warn = 0;
    document.querySelectorAll('#view input.cell[data-bind]').forEach(inp => {
      const path = inp.dataset.bind.split(":")[2] || "";
      const v = parseFloat(String(inp.value).replace(/,/g, ""));
      inp.classList.remove("invalid", "warn"); inp.removeAttribute("title");
      if (isNaN(v)) return;
      if (path.endsWith("profit_rate")) {
        if (v < 0) { inp.classList.add("invalid"); inp.title = "영업이익율은 0 이상이어야 합니다"; warn++; }
        else if (v < 0.03) { inp.classList.add("warn"); inp.title = `영업이익율 ${(v*100).toFixed(1)}% — 사내 권장 최저 3% 미달`; warn++; }
        else if (v > 0.20) { inp.classList.add("warn"); inp.title = `영업이익율 ${(v*100).toFixed(1)}% — 이례적으로 높음`; warn++; }
      } else if (path.endsWith("loss_rate")) {
        if (v < 0) { inp.classList.add("invalid"); warn++; }
        else if (v > 0.10) { inp.classList.add("warn"); inp.title = `LOSS율 ${(v*100).toFixed(1)}% — 10% 초과`; warn++; }
      } else if (path.endsWith("efficiency")) {
        if (v <= 0 || v > 1) { inp.classList.add("warn"); inp.title = "작업효율 권장 범위 0~1"; warn++; }
      } else if (path.endsWith("admin_rate")) {
        if (v < 0) { inp.classList.add("invalid"); warn++; }
      } else if (v < 0) { inp.classList.add("warn"); inp.title = "음수 입력"; warn++; }
    });
    const badge = document.getElementById("warnBadge");
    if (badge) {
      badge.style.display = warn ? "inline-flex" : "none";
      badge.textContent = warn ? `⚠ 경고 ${warn}` : "";
    }
  }
  // 재료 유형 전환 시 유형별 필수 필드 초기화
  function changeMaterialKind(entry, idx, newKind) {
    const m = entry.materials[idx];
    m.kind = newKind;
    if (newKind === "net_weight") {
      if (m.weight_g == null) m.weight_g = 0;
      if (m.unit_price == null) m.unit_price = 0;
    } else if (newKind === "qty") {
      if (m.qty == null) m.qty = 1;
      if (m.unit_price == null) m.unit_price = 0;
    } else if (newKind === "busbar") {
      if (m.qty == null) m.qty = 1;
      if (m.base_price == null) m.base_price = 0;
    } else if (newKind === "part_ref") {
      if (!m.ref) m.ref = (State.project.parts[0] || {}).id || "";
      if (m.qty == null) m.qty = 1;
    }
  }

  // ---- 품목 추가/복제/삭제 ----
  function uniqueId(prefix) {
    const ids = new Set([...State.project.parts, ...State.project.assemblies].map(x => x.id));
    let i = 1, id = `${prefix}_${i}`;
    while (ids.has(id)) { i++; id = `${prefix}_${i}`; }
    return id;
  }
  async function addProduct(kind) {
    const id = uniqueId(kind === "assy" ? "assy_new" : "part_new");
    try {
      const tmpl = await getJSON(`/api/template/${kind}?id=${encodeURIComponent(id)}`);
      (kind === "assy" ? State.project.assemblies : State.project.parts).push(tmpl);
      State.activeView = { type: "detail", kind, id };
      await recalc();
      toast(`신규 ${kind === "assy" ? "조립품" : "사출품"}을 추가했습니다. 값을 편집하세요.`);
    } catch (e) { toast("추가 실패: " + e.message, "err"); }
  }
  function duplicateProduct(kind, id) {
    const arr = kind === "assy" ? State.project.assemblies : State.project.parts;
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return;
    const copy = deepClone(arr[idx]);
    copy.id = uniqueId(kind === "assy" ? "assy_new" : "part_new");
    copy.name = arr[idx].name + " (복사)";
    if (copy.quote_lines) copy.quote_lines.forEach(l => { l.name = (l.name || "") + " (복사)"; });
    arr.splice(idx + 1, 0, copy);
    State.activeView = { type: "detail", kind, id: copy.id };
    recalc();
    toast("품목을 복제했습니다");
  }
  function deleteProduct(kind, id) {
    const arr = kind === "assy" ? State.project.assemblies : State.project.parts;
    const idx = arr.findIndex(x => x.id === id);
    if (idx < 0) return;
    // 사출품이 조립품에서 참조 중이면 삭제 차단
    if (kind === "part") {
      const used = State.project.assemblies.some(a =>
        (a.materials || []).some(m => m.kind === "part_ref" && m.ref === id));
      if (used) { toast("이 사출품을 참조하는 조립품이 있어 삭제할 수 없습니다.", "err", 4000); return; }
    }
    const removed = deepClone(arr[idx]);
    arr.splice(idx, 1);
    State.activeView = { type: "summary" };
    recalc();
    toast(`'${removed.name}' 삭제됨`, "warn", 5000, {
      label: "실행취소", fn: () => {
        arr.splice(Math.min(idx, arr.length), 0, removed);
        State.activeView = { type: "detail", kind, id: removed.id };
        recalc(); toast("삭제를 취소했습니다");
      }
    });
  }

  // ---- 견적(프로젝트) 관리 ----
  function saveProjects() { try { localStorage.setItem(LS_PROJECTS, JSON.stringify(Projects)); } catch (e) {} }
  function newProjId() {
    let n = Date.now().toString(36), id = "proj_" + n, i = 0;
    while (Projects.items[id]) id = `proj_${n}_${++i}`;
    return id;
  }
  function renderProjectSwitcher() {
    const sel = document.getElementById("projSelect");
    if (!sel) return;
    sel.innerHTML = Object.keys(Projects.items).map(id =>
      `<option value="${id}" ${id === Projects.activeId ? "selected" : ""}>${esc(projName(Projects.items[id]))}</option>`).join("");
  }
  function loadActiveIntoState() {
    const it = activeItem();
    State.project = it.project;
    State.master.config = it.config || deepClone(SAMPLE.config);
  }
  async function switchProject(id) {
    if (!Projects.items[id] || id === Projects.activeId) return;
    persist();
    Projects.activeId = id;
    loadActiveIntoState();
    State.activeView = { type: "summary" };
    await recalc(); renderProjectSwitcher();
    toast(`'${projName(activeItem())}' 견적으로 전환했습니다`);
  }
  async function newProject() {
    persist();
    try {
      const tmpl = await getJSON("/api/template/project");
      const id = newProjId();
      Projects.items[id] = { id, project: tmpl, config: deepClone(SAMPLE.config) };
      Projects.activeId = id;
      loadActiveIntoState();
      State.activeView = { type: "summary" };
      await recalc(); renderProjectSwitcher();
      toast("새 견적을 만들었습니다. 사이드바 ＋로 신규 모델을 추가하세요.");
    } catch (e) { toast("새 견적 생성 실패: " + e.message, "err"); }
  }
  async function deleteProject() {
    if (Object.keys(Projects.items).length <= 1) { toast("최소 1개 견적은 유지됩니다.", "warn"); return; }
    if (!confirm(`'${projName(activeItem())}' 견적을 삭제할까요?`)) return;
    const removed = { id: Projects.activeId, ...activeItem() };
    const removedId = Projects.activeId;
    delete Projects.items[removedId];
    Projects.activeId = Object.keys(Projects.items)[0];
    loadActiveIntoState();
    State.activeView = { type: "summary" };
    await recalc(); renderProjectSwitcher();
    toast(`'${projName(removed)}' 견적 삭제됨`, "warn", 5000, {
      label: "실행취소", fn: () => {
        Projects.items[removedId] = { id: removedId, project: removed.project, config: removed.config };
        Projects.activeId = removedId; loadActiveIntoState();
        recalc(); renderProjectSwitcher(); toast("삭제를 취소했습니다");
      }
    });
  }

  // ---- 액션: 저장/불러오기/내보내기/초기화/테마 ----
  function persist() {
    const it = activeItem();
    if (it) { it.project = State.project; it.config = State.master.config; saveProjects(); }
  }
  function saveFile() {
    const blob = new Blob([JSON.stringify({ project: State.project, config: State.master.config }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `원가견적_${(State.project.project||{}).doc_no||"SDI"}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast("견적 데이터를 저장했습니다");
  }
  function loadFile() { document.getElementById("fileInput").click(); }
  async function onFile(e) {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.project) State.project = data.project;
      if (data.config) State.master.config = data.config;
      await recalc(); renderProjectSwitcher();
      toast("견적 데이터를 현재 견적으로 불러왔습니다");
    } catch (err) { toast("불러오기 실패: " + err.message, "err"); }
    e.target.value = "";
  }
  async function exportExcel() {
    setBusy(true, "엑셀 생성 중…");
    try {
      const res = await fetch("/api/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: State.project, config: State.master.config })
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      // RFC5987 filename*=UTF-8''… 우선, 없으면 filename= 폴백
      let name = "원가견적.xlsx";
      const mStar = cd.match(/filename\*=UTF-8''([^;]+)/i);
      const mPlain = cd.match(/filename="?([^";]+)"?/i);
      if (mStar) { try { name = decodeURIComponent(mStar[1]); } catch (e) {} }
      else if (mPlain) name = mPlain[1];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
      setBusy(false, "다운로드 완료"); toast("엑셀 파일을 다운로드했습니다");
    } catch (e) { setBusy(false, "오류"); toast("엑셀 생성 실패: " + e.message, "err", 4000); }
  }
  async function reset() {
    if (!confirm("모든 견적/편집을 초기(SDI 샘플) 상태로 되돌립니다. 계속할까요?")) return;
    localStorage.removeItem(LS_PROJECTS);
    await bootstrap(true);
    toast("초기 상태로 되돌렸습니다");
  }
  function toggleTheme() {
    const r = document.documentElement;
    const next = r.dataset.theme === "dark" ? "light" : "dark";
    r.dataset.theme = next; localStorage.setItem("elemec_theme", next);
  }

  // ---- 부트스트랩 ----
  async function bootstrap(forceServer = false) {
    const boot = await getJSON("/api/bootstrap");
    State.master = boot.master;
    SAMPLE = { project: boot.project, config: deepClone(boot.master.config) };

    let saved = null;
    if (!forceServer) {
      try { saved = JSON.parse(localStorage.getItem(LS_PROJECTS) || "null"); } catch (e) {}
    }
    if (saved && saved.items && Object.keys(saved.items).length) {
      Projects = saved;
      if (!Projects.items[Projects.activeId]) Projects.activeId = Object.keys(Projects.items)[0];
    } else {
      Projects = {
        activeId: "sample_sdi",
        items: { sample_sdi: { id: "sample_sdi", project: boot.project, config: deepClone(boot.master.config) } },
      };
    }
    loadActiveIntoState();
    try {
      State.result = await postJSON("/api/calc", { project: State.project, config: State.master.config });
    } catch (e) { State.result = boot.result; }
    buildNav(); updateMeta(); renderProjectSwitcher(); draw();
    setBusy(false, "계산 완료");
    if (saved) toast("이전 견적을 복원했습니다", "warn");
  }

  function init() {
    const savedTheme = localStorage.getItem("elemec_theme");
    if (savedTheme) document.documentElement.dataset.theme = savedTheme;
    document.getElementById("btnTheme").onclick = toggleTheme;
    document.getElementById("btnSave").onclick = saveFile;
    document.getElementById("btnLoad").onclick = loadFile;
    document.getElementById("btnReset").onclick = reset;
    document.getElementById("btnExport").onclick = exportExcel;
    document.getElementById("fileInput").onchange = onFile;
    document.getElementById("addAssy").onclick = () => addProduct("assy");
    document.getElementById("addPart").onclick = () => addProduct("part");
    document.getElementById("projSelect").onchange = (e) => switchProject(e.target.value);
    document.getElementById("btnNewProj").onclick = newProject;
    document.getElementById("btnDelProj").onclick = deleteProject;
    wire();
    bootstrap().catch(e => toast("초기화 실패: " + e.message, "err", 5000));
  }

  document.addEventListener("DOMContentLoaded", init);
  return { exportExcel, addProduct, duplicateProduct, deleteProduct };
})();
