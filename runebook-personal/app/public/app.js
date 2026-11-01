// 룬북 화면. 모든 데이터는 로컬 도우미 API에서 오고, AI 호출은 버튼을 눌렀을 때만 한다.
import { initToken, api, waitJob, imageUrl } from './api.js';
import { renderForm, readForm, checkValue, KO } from './form.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view');
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
const errText = (e) => (e?.details?.length ? `${e.message}: ${e.details.slice(0, 3).join(' / ')}` : e?.message || String(e));

const GENRES = [{ id: 'fantasy', n: '판타지', d: '마법·종족·왕국', c: '--g-fantasy' }, { id: 'hunter', n: '헌터물', d: '게이트·각성·등급', c: '--g-hunter' }, { id: 'wuxia', n: '무협', d: '문파·경지·강호', c: '--g-wuxia' }, { id: 'history', n: '역사물', d: '시대·신분·고증', c: '--g-history' }];
const GENRE_KO = Object.fromEntries(GENRES.map((g) => [g.id, g.n]));
const PROV_KO = { claude: 'Claude', codex: 'ChatGPT(Codex)', mock: '모의 AI' };
const MODE_KO = { draft: '장면 초안', continue: '이어 쓰기', polish: '다듬기', alternate: '번갈아 쓰기' };
let navSeq = 0; // 화면을 옮길 때마다 올린다. 늦게 끝난 이전 화면 작업은 그리지 않는다
const stale = (seq) => seq !== navSeq;
function setRec(fn) { const el = $('#recBody'); if (el) el.innerHTML = fn(); }
const ui = { w: null, prov: null, settings: null, wz: null, wr: null, bib: null, newWork: { genres: [], weight: 60, rel: 'translate', acc: 'loose', title: '', logline: '' } };

// ---------- 공통 ----------
function setTheme(m) {
  const r = document.documentElement;
  if (m === 'system') r.removeAttribute('data-theme'); else r.dataset.theme = m;
  $('#btnTheme').textContent = `테마: ${{ system: '시스템', light: '라이트', dark: '다크' }[m]}`;
  try { localStorage.setItem('rb-theme', m); } catch { /* 무시 */ }
}
$('#btnTheme').addEventListener('click', () => {
  const o = ['system', 'light', 'dark'];
  setTheme(o[(o.indexOf(document.documentElement.dataset.theme || 'system') + 1) % 3]);
});
try { const t = localStorage.getItem('rb-theme'); if (t && t !== 'system') setTheme(t); } catch { /* 무시 */ }

function nav(active) {
  const w = ui.w;
  const links = [['#/', '작품 목록', 'home']];
  if (w) links.push([`#/w/${w}/wizard`, '위저드', 'wizard'], [`#/w/${w}/write`, '집필', 'write'], [`#/w/${w}/bible`, '설정집', 'bible']);
  links.push(['#/settings', 'AI 연결', 'settings']);
  $('#topnav').innerHTML = links.map(([h, n, k]) => `<a href="${h}" ${k === active ? 'aria-current="page"' : ''}>${n}</a>`).join('');
}

async function loadProviders(force) {
  if (!ui.prov || force) ui.prov = await api('GET', `/ai/providers${force ? '?refresh=1' : ''}`);
  const t = ui.prov.textProvider;
  $('#aiState').textContent = `글: ${PROV_KO[t] || t} · 그림: ${ui.prov.imageProvider === 'codex' ? 'ChatGPT(Codex)' : '수동 가져오기'}`;
  return ui.prov;
}

function mockBanner() {
  if (ui.prov?.textProvider !== 'mock') return '';
  return '<div class="banner"><span>지금은 <b>모의 AI</b>로 연결되어 있어 실제 글이 아닌 예시가 나와요.</span><a class="btn sm" href="#/settings">Claude로 바꾸기</a></div>';
}

function jobBox(j, label) {
  const sec = Math.round((j?.elapsedMs || 0) / 1000);
  const where = j?.state === 'queued' ? `대기 ${j.queuePosition}번째` : `${sec}초 · 받은 글자 ${j?.chars ?? 0}`;
  return `<div class="card jobbox"><b>${esc(label)}</b><div class="skel" style="height:40px"></div><div class="row"><span class="muted small">${PROV_KO[j?.provider] || ''} ${where}</span><button class="btn sm" data-act="cancelJob" data-id="${esc(j?.id || '')}">취소</button></div></div>`;
}

// 확인이 필요한 호출(실제 AI, 시간당 상한)을 한 번에 처리한다.
async function startJob(method, path, body) {
  try {
    return await api(method, path, body);
  } catch (e) {
    if (e.code === 'SOFT_CAP') {
      if (await ask(`${e.message}. 그래도 부를까요?`)) return api(method, path, { ...body, confirmOverCap: true });
      return null;
    }
    if (e.code === 'CONFIRM') {
      if (await ask(e.message)) return api(method, path, { ...body, confirm: true });
      return null;
    }
    throw e;
  }
}

// 페이지 안 확인창(브라우저 confirm 대신)
function ask(message) {
  return new Promise((resolve) => {
    const d = document.createElement('div');
    d.className = 'banner';
    d.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:60;max-width:560px';
    d.innerHTML = `<span>${esc(message)}</span><button class="btn sm primary" data-yes>계속</button><button class="btn sm" data-no>그만두기</button>`;
    document.body.appendChild(d);
    d.querySelector('[data-yes]').focus();
    d.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-yes]')) { d.remove(); resolve(true); }
      if (ev.target.closest('[data-no]')) { d.remove(); resolve(false); }
    });
  });
}

// ---------- 라우터 ----------
async function route() {
  navSeq += 1;
  const h = location.hash.replace(/^#/, '') || '/';
  const m = h.match(/^\/w\/(pj_\d{4})\/(wizard|write|bible)(?:\/(ep\d{3}))?$/);
  try {
    await loadProviders();
    if (m) {
      if (ui.w !== m[1]) { ui.wz = null; ui.wr = null; ui.bib = null; }
      ui.w = m[1];
      nav(m[2]);
      if (m[2] === 'wizard') await screenWizard();
      if (m[2] === 'write') await screenWrite(m[3]);
      if (m[2] === 'bible') await screenBible();
    } else if (h === '/new') { nav('home'); screenNew(); } else if (h === '/settings') { nav('settings'); await screenSettings(); } else { nav('home'); await screenHome(); }
  } catch (e) {
    view.innerHTML = `<div class="card errbox" style="margin-top:12px"><b>${esc(errText(e))}</b><p class="muted">${e.code === 'NO_TOKEN' || e.status === 401 ? '도우미 창에 나온 주소(…#t=…)로 다시 열어 주세요.' : '잠시 뒤 다시 시도해 주세요.'}</p></div>`;
  }
}

// ---------- 작품 목록 ----------
async function screenHome() {
  const seq = navSeq;
  const { works } = await api('GET', '/works');
  if (stale(seq)) return;
  view.innerHTML = `<div class="home" style="margin-top:12px">
    <div><h1 class="title">어떤 이야기를 함께 쓸까요?</h1><p class="muted">세계관과 인물은 AI와 한 단계씩 만들고, 본문은 Claude와 함께 쓰고, 그림은 ChatGPT가 그립니다. 앱은 설정과 줄거리를 기억해 매번 AI에게 다시 알려 줍니다.</p></div>
    ${mockBanner()}
    <div><a class="btn primary" href="#/new">새 작품 시작</a></div>
    <div><h2 style="font-size:15px;margin-bottom:8px">작품</h2>
    <div class="stack">${works.length ? works.map((w) => `<a class="card proj" style="border-left-color:var(--g-${esc(w.genres?.[0])});text-decoration:none;color:inherit" href="#/w/${esc(w.id)}/write"><div><b>${esc(w.title)}</b><div class="meta">${esc((w.genres || []).map((g) => GENRE_KO[g]).join(' + '))} · ${esc(w.logline || '')}</div></div></a>`).join('') : '<div class="card empty">아직 작품이 없어요. 새 작품으로 시작해 보세요.</div>'}</div></div></div>`;
}

// ---------- 새 작품 ----------
function screenNew() {
  const n = ui.newWork;
  const two = n.genres.length === 2;
  view.innerHTML = `<div class="gen" style="margin-top:12px">
    <div><h1 class="title">새 작품</h1><p class="muted">장르는 두 개까지 고를 수 있어요. 둘을 고르면 혼합형으로 다룹니다.</p></div>
    <div class="gcards" role="group" aria-label="장르">${GENRES.map((g) => `<button class="card gcard" type="button" style="--gc:var(${g.c})" data-act="genre" data-id="${g.id}" aria-pressed="${n.genres.includes(g.id)}"><b>${g.n}</b><span class="muted">${g.d}</span></button>`).join('')}</div>
    ${two ? `<div class="card mix"><b>혼합 정책</b>
      <div class="row"><label for="nwW">주 장르(${GENRE_KO[n.genres[0]]}) 비중</label><input id="nwW" type="range" min="50" max="90" step="10" value="${n.weight}"><span class="chip">${n.weight} : ${100 - n.weight}</span></div>
      <div class="row"><label for="nwRel">체계 관계</label><select id="nwRel">${[['translate', '대응표(번역)'], ['parallel', '병존'], ['layer', '겹침'], ['replace', '대체']].map(([v, l]) => `<option value="${v}" ${n.rel === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label for="nwAcc">고증 수준</label><select id="nwAcc">${[['loose', '느슨'], ['strict', '엄격'], ['alt_history', '대체역사'], ['off', '끔']].map(([v, l]) => `<option value="${v}" ${n.acc === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>` : ''}
    <div class="field"><label for="nwTitle">제목(가칭)</label><input type="text" id="nwTitle" value="${esc(n.title)}" maxlength="60"></div>
    <div class="field"><label for="nwLog">한 줄 컨셉</label><textarea id="nwLog" rows="3" maxlength="120" placeholder="“___가 ___ 때문에 ___하는 이야기”">${esc(n.logline)}</textarea></div>
    <p class="errline" id="nwErr"></p>
    <div class="actions"><button class="btn primary" data-act="createWork">만들고 위저드 시작</button><a class="btn ghost" href="#/">취소</a></div></div>`;
}

// ---------- 위저드 ----------
const STATUS_MARK = { confirmed: '✓', auto: '◐', skipped: '◌', open: '○' };
async function screenWizard() {
  const seq = navSeq;
  const v = await api('GET', `/works/${ui.w}/wizard`);
  if (stale(seq)) return;
  if (!ui.wz || ui.wz.w !== ui.w) ui.wz = { w: ui.w, cur: null, edit: null, checks: [], job: null, showPrev: false, err: '', undoAsk: null };
  ui.wz.v = v;
  const all = v.steps.flatMap((s) => s.questions);
  if (!ui.wz.cur || !all.some((q) => q.qid === ui.wz.cur)) ui.wz.cur = pickCurrent(v);
  drawWizard();
}

function pickCurrent(v) {
  if (!v.next) return null;
  const withCands = v.next.qids.find((q) => v.cache[q]);
  return withCands || v.next.qids[0];
}

function qOf(qid) {
  for (const s of ui.wz.v.steps) for (const q of s.questions) if (q.qid === qid) return { ...q, step: s.id, stepLabel: s.label };
  return null;
}

function drawWizard() {
  const { v } = ui.wz;
  const left = `<div><b>진행률 ${v.progress.pct}%</b><div class="prog"><i style="width:${v.progress.pct}%"></i></div>${v.canStart ? '<span class="pill ok">✓ 집필 시작 가능</span>' : '<span class="muted small">필수 문항을 채우면 집필을 시작할 수 있어요</span>'}</div>
    ${v.steps.filter((s) => s.questions.length).map((s) => `<div style="margin-top:8px"><div class="muted small">${s.id} ${esc(s.label)}</div>${s.questions.map((q) => `<button type="button" class="step ${q.qid === ui.wz.cur ? 'now' : ''}" data-act="pickQ" data-qid="${esc(q.qid)}"><span class="mk" aria-hidden="true">${q.qid === ui.wz.cur ? '●' : STATUS_MARK[q.status]}</span><span>${esc(q.label)}</span>${q.required ? '<em>필수</em>' : ''}${q.status === 'auto' ? '<em class="ai">AI</em>' : ''}${q.needsReview ? '<em class="ai">재검토</em>' : ''}</button>`).join('')}</div>`).join('')}`;
  const done = v.steps.flatMap((s) => s.questions).filter((q) => q.status === 'confirmed' || q.status === 'auto');
  const right = `<h3 style="font-size:14px;margin-bottom:8px">확정된 설정 ${done.length}개</h3>${done.map((q) => `<div class="sum ${q.status === 'auto' ? 'aifill' : ''}"><h4>${esc(q.label)}${q.status === 'auto' ? '<span class="tag">AI 임의 설정</span>' : ''}${q.needsReview ? '<span class="tag rev">재검토 필요</span>' : ''}</h4><p>${esc(q.summary)}</p>${q.input === 'setup' ? '' : `<div class="tools"><button class="btn sm ghost" data-act="pickQ" data-qid="${esc(q.qid)}">수정</button><button class="btn sm ghost" data-act="undoAsk" data-qid="${esc(q.qid)}">되돌리기</button></div>`}${ui.wz.undoAsk === q.qid ? `<p class="small" style="margin-top:6px">이 설정을 참고한 뒤 문항도 같이 되돌릴까요?</p><div class="tools"><button class="btn sm" data-act="undo" data-qid="${esc(q.qid)}" data-cascade="0">이것만</button><button class="btn sm" data-act="undo" data-qid="${esc(q.qid)}" data-cascade="1">같이</button></div>` : ''}</div>`).join('') || '<div class="sum slot">아직 없어요</div>'}`;
  view.innerHTML = `<div style="margin-top:12px" class="stack">${mockBanner()}<div class="wiz"><aside class="col steps" aria-label="문항 목록">${left}</aside><main class="col" style="background:transparent;padding:0">${wizardMain()}</main><aside class="col" aria-label="확정된 설정">${right}</aside></div></div>`;
}

function wizardMain() {
  const { v, cur, job } = ui.wz;
  if (!cur) {
    return `<div class="turn"><div class="card qbox"><h2 style="font-size:19px">모든 문항을 지나왔어요</h2><p class="muted" style="margin-top:6px">${v.canStart ? '이제 본문을 함께 써 볼까요? 설정집에서 언제든 고칠 수 있어요.' : '필수 문항이 남아 있어요. 왼쪽에서 골라 채워 주세요.'}</p><div class="actions" style="margin-top:12px">${v.canStart ? '<button class="btn primary" data-act="startWriting">집필 시작</button>' : ''}<a class="btn" href="#/w/${esc(ui.w)}/bible">설정집 보기</a></div></div></div>`;
  }
  const q = qOf(cur);
  const cache = v.cache[cur];
  const inBatch = v.next && v.next.qids.includes(cur);
  const head = `<div class="card qbox"><div class="actions"><span class="badge ${esc(ui.prov.perTask.world)}">${esc(PROV_KO[ui.prov.perTask.world] || '')}</span><span class="muted">${esc(q.step)} ${esc(q.stepLabel)} · ${esc(q.label)}</span>${q.required ? '<span class="chip">필수</span>' : ''}${q.status !== 'open' ? `<span class="chip on">${{ confirmed: '확정됨', auto: 'AI 임의 설정', skipped: '나중에' }[q.status]}</span>` : ''}</div><p class="q">${esc(cache?.question || q.question)}</p><p class="muted small">${esc(q.hint || '')}</p>${ui.wz.err ? `<p class="errline">${esc(ui.wz.err)}</p>` : ''}</div>`;
  if (job) return `<div class="turn">${head}${jobBox(job, '후보를 만드는 중이에요')}</div>`;
  if (q.input === 'setup') return `<div class="turn">${head}<div class="card qbox"><p>${esc(q.summary)}</p><p class="muted small">작품을 만들 때 정한 항목이에요.</p></div></div>`;
  if (ui.wz.edit) {
    const base = ui.wz.edit === 'own' ? (q.value || {}) : ui.wz.edit.value;
    return `<div class="turn">${head}<div class="card qbox" id="editBox"><b>${ui.wz.edit === 'own' ? '직접 쓰기' : `고쳐쓰기: ${esc(ui.wz.edit.title || '')}`}</b>${q.example ? `<p class="muted small">예시: ${esc(q.example.title)} — ${esc(q.example.desc)}</p>` : ''}${renderForm(q.value_schema, base)}<p class="errline" id="editErr"></p><div class="actions" style="margin-top:8px"><button class="btn primary" data-act="confirmEdit">이대로 확정</button><button class="btn ghost" data-act="cancelEdit">취소</button></div></div></div>`;
  }
  const candSet = ui.wz.showPrev && cache?.prev ? cache.prev : cache;
  let body;
  if (!candSet) {
    const n = inBatch ? v.next.qids.length : 1;
    body = `<div class="card empty"><p>${q.status === 'open' ? 'AI에게 후보를 받아 볼까요?' : '지금 값을 고치거나 새 후보를 받을 수 있어요.'}</p><p class="muted small">${inBatch && n > 1 ? `이 단계의 문항 ${n}개 후보를 한 번에 받아요(AI 1회 호출).` : 'AI를 1회 부릅니다.'}</p><div class="actions"><button class="btn primary" data-act="propose" data-batch="${inBatch ? 1 : 0}">후보 받기</button><button class="btn" data-act="ownWrite">직접 쓰기</button></div></div>`;
  } else {
    const cards = candSet.candidates.map((c, i) => `<article class="cand ${c.merged ? 'merged' : ''}"><header><label class="ck"><input type="checkbox" data-act="check" data-i="${i}" ${ui.wz.checks.includes(i) ? 'checked' : ''}> <span class="small">합치기</span></label><span class="letter">${c.merged ? '합친 안' : 'ABCD'[i]}${candSet.recommend === i ? ' · 추천' : ''}</span></header><h4>${esc(c.title)}</h4><p>${esc(c.desc)}</p>${c.risk ? `<p class="risk">위험: ${esc(c.risk)}</p>` : ''}<footer><button class="btn sm primary" data-act="pickCand" data-i="${i}">이걸로 확정</button><button class="btn sm ghost" data-act="editCand" data-i="${i}">고쳐쓰기</button></footer></article>`).join('');
    body = `<div class="cands">${cards}<article class="cand own" data-act="ownWrite"><header><span class="letter">+</span></header><h4>직접 쓰기</h4><p class="risk">후보 대신 내가 적습니다.</p></article></div>
      <div class="actions"><button class="btn" data-act="merge" ${ui.wz.checks.length >= 2 ? '' : 'disabled'}>선택한 것 합치기</button>
      <input type="text" id="wzHint" placeholder="다시 제안할 방향(예: 더 어둡게)" style="flex:1;min-width:180px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--card)">
      <button class="btn" data-act="regen">다시 제안 ↻</button>${cache?.prev ? `<button class="btn sm ghost" data-act="togglePrev">${ui.wz.showPrev ? '새 후보 보기' : '이전 후보 보기'}</button>` : ''}</div>`;
  }
  const extra = q.required ? '<p class="muted small">필수 문항은 “AI가 알아서”를 쓸 수 없어요.</p>' : `<div class="actions"><span class="grow"></span><button class="btn sm ghost" data-act="skip">나중에</button>${candSet ? '<button class="btn sm ghost" data-act="auto">건너뛰기: AI가 알아서</button>' : ''}</div>`;
  return `<div class="turn">${head}${body}${q.status === 'open' ? extra : ''}</div>`;
}

async function wizardPropose(body) {
  ui.wz.err = '';
  const j = await startJob('POST', `/works/${ui.w}/wizard/propose`, body);
  if (!j) return;
  ui.wz.job = j;
  drawWizard();
  try {
    await waitJob(j.id, (x) => { ui.wz.job = x; const m = $('.turn'); if (m) drawWizard(); });
    ui.wz.checks = [];
    ui.wz.showPrev = false;
  } catch (e) {
    ui.wz.err = errText(e);
  } finally {
    ui.wz.job = null;
    await screenWizard();
  }
}

async function wizardConfirm(value, opts = {}) {
  const q = qOf(ui.wz.cur);
  try {
    await api('POST', `/works/${ui.w}/wizard/confirm`, { qid: q.qid, value, source: opts.source || '후보', auto: !!opts.auto });
    ui.wz.edit = null;
    ui.wz.checks = [];
    ui.wz.err = '';
    const v = await api('GET', `/works/${ui.w}/wizard`);
    ui.wz.v = v;
    const sameBatchNext = v.next?.qids.find((id) => v.cache[id]);
    ui.wz.cur = sameBatchNext || pickCurrent(v);
    toast(opts.auto ? 'AI가 고른 값으로 채웠어요' : '확정했어요');
    drawWizard();
  } catch (e) {
    const el = $('#editErr');
    if (el) el.textContent = errText(e); else { ui.wz.err = errText(e); drawWizard(); }
  }
}

// ---------- 집필 ----------
async function screenWrite(epId) {
  const seq = navSeq;
  const { episodes } = await api('GET', `/works/${ui.w}/episodes`);
  if (stale(seq)) return;
  if (!episodes.length) {
    view.innerHTML = `<div class="home" style="margin-top:12px">${mockBanner()}<div class="card empty"><p>아직 회차가 없어요. 1화를 만들어 함께 써 볼까요?</p><button class="btn primary" data-act="newEpisode">1화 만들기</button></div></div>`;
    return;
  }
  const ep = epId || ui.wr?.ep || episodes.at(-1).id;
  const e = await api('GET', `/works/${ui.w}/episodes/${ep}`);
  if (stale(seq)) return;
  const keep = ui.wr && ui.wr.w === ui.w ? ui.wr : {};
  ui.wr = { tab: 'co', mode: 'draft', length: 2000, ...keep, w: ui.w, ep, e, episodes, dirty: false };
  if (!ui.wr.focus || !e.scenes.some((s) => s.id === ui.wr.focus)) ui.wr.focus = e.scenes.at(-1)?.id || null;
  if (!ui.wr.bible) ui.wr.bible = await api('GET', `/works/${ui.w}/bible`);
  if (stale(seq)) return;
  drawWrite();
}

function sceneOf(id) { return ui.wr.e.scenes.find((s) => s.id === id); }

function drawWrite() {
  const { e, episodes } = ui.wr;
  const left = `<div class="tree pane" style="padding:12px"><h3>회차</h3><ul>${episodes.map((x) => `<li><button type="button" data-act="openEp" data-ep="${esc(x.id)}" ${x.id === e.id ? 'aria-current="true"' : ''}><span aria-hidden="true">${x.status === 'done' ? '✓' : '●'}</span><span>${esc(x.title)}</span></button></li>`).join('')}</ul>
    <div class="actions" style="margin-top:6px"><button class="btn sm" data-act="newEpisode">새 회차</button></div>
    <h3>장면</h3><ul>${e.scenes.map((s, i) => `<li><button type="button" data-act="focusScene" data-id="${esc(s.id)}" ${s.id === ui.wr.focus ? 'aria-current="true"' : ''}><span>${i + 1}. ${esc(s.meta?.goal || s.id)}</span><span class="cnt">${(s.text || '').replace(/\s/g, '').length}</span></button></li>`).join('')}</ul>
    <div class="actions" style="margin-top:6px"><button class="btn sm" data-act="newScene">새 장면</button><button class="btn sm ghost" data-act="summarizeEp">회차 요약</button></div>
    ${ui.wr.sumJob ? jobBox(ui.wr.sumJob, '회차 요약 중') : ''}${ui.wr.sumDraft ? `<div class="draft"><b>회차 요약 제안</b><textarea id="sumText" rows="6" style="width:100%">${esc(ui.wr.sumDraft.text)}</textarea><div class="actions"><button class="btn sm primary" data-act="acceptSummary">기억에 저장</button><button class="btn sm ghost" data-act="dropSummary">버리기</button></div></div>` : ''}</div>`;
  const editor = `<div class="pane editor"><div class="ed-head"><input type="text" id="epTitle" value="${esc(e.title)}" aria-label="회차 제목" style="font-weight:700;border:0;background:transparent;font-size:15px;min-width:0;flex:1"><span class="muted small" id="saveState">저장됨</span></div>
    <div class="editor-scroll">${e.scenes.length ? e.scenes.map((s, i) => `<section class="scene ${s.id === ui.wr.focus ? 'focus' : ''}" data-scene="${esc(s.id)}"><header><b>${i + 1}. 장면</b><span class="muted small">${esc(s.id)}</span>${s.meta?.ai?.drafts ? `<span class="chip">AI 초안 ${s.meta.ai.accepted?.length || 0}회 반영</span>` : ''}${s.meta?.hook_type ? `<span class="chip">훅: ${esc(s.meta.hook_type)}</span>` : ''}</header>
      <div class="meta"><input type="text" data-meta="goal" data-id="${esc(s.id)}" value="${esc(s.meta?.goal || '')}" placeholder="장면 목적 (예: 석비의 글자를 확인한다)"><textarea rows="2" data-meta="beats" data-id="${esc(s.id)}" placeholder="비트: 한 줄에 하나 (누가, 무엇을, 어떻게 끝나는지)">${esc(s.meta?.beats || '')}</textarea></div>
      <textarea class="ms" data-text="${esc(s.id)}" spellcheck="false" aria-label="${i + 1}번 장면 본문" placeholder="여기에 직접 쓰거나, 오른쪽 '함께 쓰기'에서 Claude에게 초안을 받아 보세요">${esc(s.text)}</textarea></section>`).join('') : '<div class="card empty"><p>장면이 없어요.</p><button class="btn primary" data-act="newScene">첫 장면 추가</button></div>'}</div>
    <div class="ed-foot"><span id="cnt">${e.scenes.reduce((n, s) => n + (s.text || '').replace(/\s/g, '').length, 0).toLocaleString()}자</span><span>회차 rev ${e.rev}</span><span class="grow"></span><span class="muted">AI 초안은 받아들일 때만 원고에 들어가요</span></div></div>`;
  const tabs = [['co', '함께 쓰기'], ['mem', '기억'], ['img', '그림']];
  const right = `<div class="pane rec"><div class="rec-head"><div class="tabs" role="tablist">${tabs.map(([k, n]) => `<button type="button" role="tab" data-act="tab" data-tab="${k}" aria-selected="${ui.wr.tab === k}">${n}</button>`).join('')}</div></div><div class="rec-body" id="recBody">${ui.wr.tab === 'co' ? coPanel() : ui.wr.tab === 'mem' ? memPanel() : imgPanel()}</div></div>`;
  view.innerHTML = `<div style="margin-top:12px" class="stack">${mockBanner()}<div class="write3">${left}${editor}${right}</div></div>`;
  if (ui.wr.tab === 'img') hydrateImages();
}

function ledgerHtml(ledger) {
  if (!ledger) return '';
  return `<div class="ledger"><div class="row"><b>기억 장부</b><span class="muted">${ledger.total.toLocaleString()} / ${ledger.budget.toLocaleString()}자</span></div>${ledger.blocks.map((b) => `<div class="row"><span>${esc(b.layerLabel)} · ${esc(b.label)}${b.pinned ? ' <span class="tag">고정</span>' : ''}</span><span class="muted">${b.chars.toLocaleString()}자${b.mode !== 'full' ? ` · ${{ trimmed: '앞부분 줄임', folded: '접음', summary: '요약으로 줄임' }[b.mode] || b.mode}` : ''}</span></div>`).join('')}${ledger.notes.map((n) => `<p class="muted small">• ${esc(n)}</p>`).join('')}</div>`;
}

function coPanel() {
  const w = ui.wr;
  const s = sceneOf(w.focus);
  if (!s) return '<div class="card empty">장면을 먼저 추가해 주세요.</div>';
  const sel = w.sel && w.sel.id === s.id && w.sel.end > w.sel.start ? w.sel : null;
  const modeBtns = Object.entries(MODE_KO).map(([k, n]) => `<button type="button" data-act="mode" data-mode="${k}" aria-pressed="${w.mode === k}">${n}</button>`).join('');
  let result = '';
  if (w.job) result = jobBox(w.job, `${PROV_KO[w.job.provider] || 'AI'}가 쓰는 중이에요`);
  else if (w.draft?.alternatives) {
    result = `<div class="draft"><b>다듬은 대안</b>${w.draft.alternatives.map((a, i) => `<div class="prose">${esc(a.text)}</div><p class="muted small">${esc(a.note)}</p><button class="btn sm primary" data-act="acceptAlt" data-i="${i}">이걸로 바꾸기</button>`).join('')}<button class="btn sm ghost" data-act="dropDraft">버리기</button></div>`;
  } else if (w.draft) {
    const m = w.draft.memory || {};
    result = `<div class="draft"><div class="row"><b>${esc(MODE_KO[w.draft.mode])} · ${esc(PROV_KO[w.draft.provider] || '')}</b><span class="muted small">${(w.draft.prose || '').replace(/\s/g, '').length}자</span></div>
      ${(w.draft.warnings || []).map((x) => `<p class="errline">▲ ${esc(x.text)}</p>`).join('')}${w.draft.memoryWarning ? `<p class="errline">▲ ${esc(w.draft.memoryWarning)}</p>` : ''}
      <div class="prose">${esc(w.draft.prose)}</div>
      <details ${m.장면요약 ? 'open' : ''}><summary class="small">받아들이면 기억에 반영될 것</summary><dl class="kvlist" style="margin-top:6px">${m.장면요약 ? `<dt>장면 요약</dt><dd>${esc(m.장면요약)}</dd>` : ''}${m.등장?.length ? `<dt>등장</dt><dd>${esc(m.등장.join(', '))}</dd>` : ''}${m.상태변화?.length ? `<dt>상태 변화</dt><dd>${esc(m.상태변화.map((x) => `${x.이름} ${x.항목}=${x.값}`).join('\n'))}</dd>` : ''}${m.떡밥?.심음?.length ? `<dt>심은 떡밥</dt><dd>${esc(m.떡밥.심음.join(', '))}</dd>` : ''}${m.떡밥?.회수?.length ? `<dt>회수한 떡밥</dt><dd>${esc(m.떡밥.회수.join(', '))}</dd>` : ''}${m.새설정후보?.length ? `<dt>새 설정 후보</dt><dd>${esc(m.새설정후보.map((x) => `${x.종류} ${x.이름}`).join(', '))}</dd>` : ''}${m.확인필요?.length ? `<dt>확인 필요</dt><dd>${esc(m.확인필요.join('\n'))}</dd>` : ''}</dl></details>
      <div class="actions"><button class="btn primary" data-act="acceptDraft">받아들이기</button><button class="btn" data-act="redo">다시 쓰기</button><button class="btn ghost" data-act="dropDraft">버리기</button></div></div>`;
  }
  return `<div class="stack"><div class="small muted">대상: ${esc(s.meta?.goal || s.id)}</div>
    <div class="seg" role="group" aria-label="집필 모드">${modeBtns}</div>
    ${w.mode === 'polish' ? `<p class="small ${sel ? '' : 'errline'}">${sel ? `선택한 ${sel.end - sel.start}자를 다듬어요` : '본문에서 다듬을 부분을 먼저 선택해 주세요'}</p>` : ''}
    ${w.mode === 'draft' ? '<p class="muted small">비트는 가운데 장면 칸에 적어요. 비트 순서대로 Claude가 장면 초안을 씁니다.</p>' : ''}
    <div class="formgrid"><div><label for="coReq">요청 <span class="hint">선택</span></label><input type="text" id="coReq" value="${esc(w.request || '')}" placeholder="예: 대사는 짧게, 긴장감 있게"></div>
    ${['draft', 'continue'].includes(w.mode) ? `<div><label for="coLen">분량</label><select id="coLen">${[1000, 2000, 3000, 4000].map((n) => `<option value="${n}" ${w.length === n ? 'selected' : ''}>약 ${n.toLocaleString()}자</option>`).join('')}</select></div>` : ''}</div>
    <div class="actions"><button class="btn primary" data-act="draft" ${w.job ? 'disabled' : ''}>${PROV_KO[ui.prov.perTask.write] || 'AI'}에게 쓰게 하기</button><button class="btn" data-act="preview">기억 미리보기</button></div>
    ${w.ledger ? `<details ${w.showLedger ? 'open' : ''}><summary class="small">이번 호출에 넣는 기억</summary>${ledgerHtml(w.ledger)}</details>` : ''}
    ${w.err ? `<p class="errline">${esc(w.err)}</p>` : ''}${w.acceptNote ? `<div class="sugg card"><b>기억을 갱신했어요</b><p class="small">${esc(w.acceptNote)}</p></div>` : ''}${result}</div>`;
}

function memPanel() {
  const m = ui.wr.mem;
  if (!m) { loadMem(); return '<div class="skel"></div>'; }
  const b = ui.wr.bible;
  const style = b.work.style || {};
  const cards = [...(b.character || []), ...(b.monster || []), ...(b.faction || [])];
  const openThreads = (m.threads || []).filter((t) => !t.resolved_ep);
  const pending = (b.candidates || []).filter((c) => c.status === 'pending');
  return `<div class="stack">
    <div class="card rcard"><b>마지막 기억 장부</b>${m.ledgers?.[0] ? `<p class="muted small">${esc(m.ledgers[0].at?.slice(0, 16).replace('T', ' '))} · ${esc(MODE_KO[m.ledgers[0].mode] || m.ledgers[0].mode)}</p>${ledgerHtml(m.ledgers[0])}` : '<p class="muted small">아직 AI를 부르지 않았어요.</p>'}</div>
    <div class="card rcard"><b>꼭 기억할 것 (고정 기억)</b><p class="muted small">매 호출의 맨 앞에 들어가요. 한 줄에 하나.</p><textarea id="pinNotes" rows="4" style="width:100%">${esc((m.pins?.notes || []).join('\n'))}</textarea>
      <div class="small">고정 카드: ${(m.pins?.cards || []).map((id) => { const c = cards.find((x) => x.id === id); return `<span class="chip">${esc(c?.name || id)} <button class="pillbtn" data-act="unpin" data-id="${esc(id)}" aria-label="고정 해제">×</button></span>`; }).join(' ') || '없음'}</div>
      <div class="row"><select id="pinCard"><option value="">카드 고정 추가…</option>${cards.filter((c) => !(m.pins?.cards || []).includes(c.id)).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button class="btn sm primary" data-act="savePins">저장</button></div></div>
    <div class="card rcard"><b>문체 가이드</b><div class="formgrid"><div><label for="stPov">시점</label><select id="stPov"><option value="">미정</option>${[['first', '1인칭'], ['third_limited', '3인칭 제한'], ['omniscient', '전지']].map(([v, l]) => `<option value="${v}" ${style.pov === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label for="stRules">문체 규칙 <span class="hint">한 줄에 하나</span></label><textarea id="stRules" rows="3">${esc((style.rules || []).join('\n'))}</textarea></div>
      <div><label for="stSample">작가 샘플 문단 <span class="hint">내가 쓴 글 1~3개, 빈 줄 두 개로 구분</span></label><textarea id="stSample" rows="5">${esc((style.samples || []).join('\n\n\n'))}</textarea></div>
      <div><label for="stArt">그림 화풍 <span class="hint">모든 그림 프롬프트 앞에 붙어요</span></label><input type="text" id="stArt" value="${esc(style.art_style || '')}" placeholder="예: 수묵 담채풍 판타지 일러스트"></div></div><button class="btn sm primary" data-act="saveStyle">저장</button></div>
    <div class="card rcard"><b>미회수 떡밥 ${openThreads.length}개</b>${openThreads.map((t) => `<p class="small">• ${esc(t.title)} <span class="muted">(${t.planted_ep}화)</span></p>`).join('') || '<p class="muted small">없음</p>'}</div>
    <div class="card rcard"><b>최근 상태 변화</b>${(m.stateLog || []).slice(-10).reverse().map((s) => `<p class="small">${s.ep}화 · ${esc(s.name || s.entity)} ${esc(s.field)} = ${esc(s.value)}</p>`).join('') || '<p class="muted small">없음</p>'}</div>
    <div class="card rcard"><b>새 설정 후보 ${pending.length}개</b>${pending.map((c) => `<div class="row small"><span>${esc(c.kind)} · <b>${esc(c.name)}</b> ${esc(c.desc)}</span><button class="btn sm" data-act="candAccept" data-id="${esc(c.id)}">카드로 만들기</button><button class="btn sm ghost" data-act="candDismiss" data-id="${esc(c.id)}">버리기</button></div>`).join('') || '<p class="muted small">없음</p>'}</div>
    <div class="card rcard"><b>아크 요약 ${(m.summaries?.arcs || []).length}개</b>${(m.summaries?.arcs || []).map((a) => `<p class="small"><b>${a.from}~${a.to}화 ${esc(a.title || '')}</b> ${esc(a.text)}</p>`).join('') || '<p class="muted small">회차 요약이 10개 쌓이면 아크 요약으로 접을 수 있어요. 오래된 회차를 짧게 기억하게 해서 긴 연재에서도 잊지 않게 해요.</p>'}
      ${m.arcNext ? `<button class="btn sm" data-act="arcPropose" data-from="${m.arcNext.from}" data-to="${m.arcNext.to}">${m.arcNext.from}~${m.arcNext.to}화 아크 요약 만들기</button>` : ''}${ui.wr.arcJob ? jobBox(ui.wr.arcJob, '아크 요약 중') : ''}
      ${ui.wr.arcDraft ? `<div class="draft"><input type="text" id="arcTitle" value="${esc(ui.wr.arcDraft.title)}" aria-label="아크 제목"><textarea id="arcText" rows="6" style="width:100%">${esc(ui.wr.arcDraft.text)}</textarea><div class="actions"><button class="btn sm primary" data-act="acceptArc">기억에 저장</button><button class="btn sm ghost" data-act="dropArc">버리기</button></div></div>` : ''}</div>
    <div class="card rcard"><b>회차 요약</b>${Object.entries(m.summaries?.episodes || {}).map(([no, s]) => `<p class="small"><b>${esc(no)}화</b> ${esc(s.text || s)}</p>`).join('') || '<p class="muted small">회차를 끝내면 “회차 요약”으로 만들어 두세요. 다음 회차를 쓸 때 기억으로 들어가요.</p>'}</div></div>`;
}

async function loadMem() {
  ui.wr.mem = await api('GET', `/works/${ui.w}/memory`);
  ui.wr.mem.arcNext = (await api('GET', `/works/${ui.w}/memory/arc`)).next;
  ui.wr.bible = await api('GET', `/works/${ui.w}/bible`);
  if (ui.wr.tab === 'mem') setRec(memPanel);
}

const IMG_KINDS = { illustration: '장면 일러스트', map: '세계 지도', city: '도시', dungeon: '던전', character: '캐릭터', villain: '빌런', monster: '몬스터', item: '아이템' };
function imgTargets(kind) {
  const b = ui.wr.bible;
  if (['character', 'villain'].includes(kind)) return (b.character || []).map((c) => [c.id, c.name]);
  if (kind === 'monster') return (b.monster || []).map((c) => [c.id, c.name]);
  if (['city', 'dungeon'].includes(kind)) return (b.world?.places || []).map((p) => [p.id, p.name]);
  return [];
}

function imgPanel() {
  const w = ui.wr;
  w.img = w.img || { kind: 'character', target: '', extra: '', prompt: '', images: null, sel: null };
  const g = w.img;
  const targets = imgTargets(g.kind);
  const codex = ui.prov.imageProvider === 'codex';
  const sel = g.sel && g.images?.find((x) => x.id === g.sel);
  return `<div class="stack">
    <div class="formgrid"><div><label for="imKind">무엇을 그릴까요</label><select id="imKind">${Object.entries(IMG_KINDS).map(([k, n]) => `<option value="${k}" ${g.kind === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    ${targets.length ? `<div><label for="imTarget">대상</label><select id="imTarget"><option value="">(선택)</option>${targets.map(([id, n]) => `<option value="${esc(id)}" ${g.target === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>` : g.kind === 'illustration' ? `<p class="small muted">대상: 지금 장면(${esc(w.focus || '')})의 요약과 등장 인물</p>` : ''}
    <div><label for="imExtra">요청 <span class="hint">선택</span></label><input type="text" id="imExtra" value="${esc(g.extra)}" placeholder="예: 비 오는 밤, 역광"></div></div>
    <div class="actions"><button class="btn" data-act="imgPrompt">프롬프트 만들기</button>${codex ? `<button class="btn primary" data-act="imgGenerate" ${w.imgJob ? 'disabled' : ''}>ChatGPT로 그리기</button>` : ''}</div>
    ${g.prompt ? `<div class="formgrid"><div><label for="imPrompt">프롬프트 <span class="hint">고쳐도 돼요</span></label><textarea id="imPrompt" rows="8">${esc(g.prompt)}</textarea></div></div><div class="actions"><button class="btn sm" data-act="copyPrompt">복사</button>${g.refsNote ? `<span class="muted small">${esc(g.refsNote)}</span>` : ''}</div>` : ''}
    ${w.imgJob ? jobBox(w.imgJob, 'ChatGPT가 그리는 중이에요(1~2분 걸릴 수 있어요)') : ''}${w.imgErr ? `<p class="errline">${esc(w.imgErr)}</p>` : ''}
    ${codex ? '' : '<p class="muted small">그림 자동 생성이 꺼져 있어요. 프롬프트를 복사해 ChatGPT에서 그린 뒤 아래로 가져오세요. AI 연결 화면에서 “ChatGPT(Codex)로 그리기”를 켤 수 있어요.</p>'}
    <label class="dropzone" id="drop">ChatGPT에서 만든 그림 가져오기: 여기에 끌어다 놓거나 눌러서 고르기<input type="file" id="imFile" accept="image/png,image/jpeg,image/webp" hidden></label>
    <div class="thumbs" id="thumbs">${g.images ? g.images.slice().reverse().map((x) => `<button type="button" class="thumb" data-act="imgSel" data-id="${esc(x.id)}"><img alt="${esc(x.title)}" data-img="${esc(x.id)}"><span>${esc(IMG_KINDS[x.kind] || x.kind)} · ${esc(x.title)}</span></button>`).join('') : '<div class="skel"></div>'}</div>
    ${sel ? `<div class="card rcard"><b>${esc(sel.title)}</b><div class="mapwrap" id="mapwrap"><img alt="${esc(sel.title)}" data-img="${esc(sel.id)}" ${sel.kind === 'map' ? 'data-act="addPin"' : ''}>${(sel.pins || []).map((p) => `<span class="pin" style="left:${p.x * 100}%;top:${p.y * 100}%">${esc(p.label)}</span>`).join('')}</div>
      ${sel.kind === 'map' ? `<div class="row small"><label for="pinPlace">핀 이름</label><select id="pinPlace">${(ui.wr.bible.world?.places || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><span class="muted">지도를 누르면 그 자리에 장소 핀을 꽂아요</span></div>` : ''}
      <div class="actions">${sel.refs?.[0] ? `<button class="btn sm" data-act="setPortrait" data-id="${esc(sel.id)}" data-ref="${esc(sel.refs[0])}">대표 이미지로</button>` : ''}<button class="btn sm" data-act="insertImg" data-id="${esc(sel.id)}">원고에 넣기</button></div>
      <details><summary class="small">이 그림의 프롬프트</summary><p class="small" style="white-space:pre-wrap">${esc(sel.prompt)}</p></details></div>` : ''}</div>`;
}

async function hydrateImages() {
  const g = ui.wr.img;
  if (!g.images) {
    g.images = (await api('GET', `/works/${ui.w}/images`)).images;
    if (ui.wr.tab === 'img') { setRec(imgPanel); }
  }
  for (const img of $$('img[data-img]')) {
    try { img.src = await imageUrl(ui.w, img.dataset.img); } catch { /* 지워진 파일 */ }
  }
}

function readCo() {
  const w = ui.wr;
  w.request = $('#coReq')?.value || '';
  if ($('#coLen')) w.length = Number($('#coLen').value);
}

async function saveNow() {
  const w = ui.wr;
  if (!w?.dirty) return;
  w.dirty = false;
  const scenes = w.e.scenes.map((s) => ({ id: s.id, text: s.text }));
  try {
    const r = await api('PUT', `/works/${ui.w}/episodes/${w.ep}`, { title: w.e.title, scenes, rev: w.e.rev });
    w.e.rev = r.rev;
    const st = $('#saveState');
    if (st) st.textContent = '저장됨';
  } catch (e) {
    toast(errText(e));
    if (e.status === 409) await screenWrite(w.ep);
  }
}
let saveT;
function scheduleSave() {
  ui.wr.dirty = true;
  const st = $('#saveState');
  if (st) st.textContent = '저장 중…';
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 1200);
}

async function runDraft(extraReq) {
  const w = ui.wr;
  readCo();
  await saveNow();
  w.err = '';
  w.acceptNote = '';
  const body = { ep: w.ep, sceneId: w.focus, mode: w.mode, request: [w.request, extraReq].filter(Boolean).join(' / '), length: w.length };
  if (w.mode === 'polish') {
    if (!w.sel || w.sel.id !== w.focus || w.sel.end <= w.sel.start) { w.err = '다듬을 부분을 먼저 선택해 주세요'; setRec(coPanel); return; }
    body.selection = { start: w.sel.start, end: w.sel.end };
  }
  try {
    const j = await startJob('POST', `/works/${ui.w}/write/draft`, body);
    if (!j) return;
    w.ledger = j.ledger;
    w.job = j;
    w.draft = null;
    setRec(coPanel);
    const done = await waitJob(j.id, (x) => { w.job = x; if (w.tab === 'co') setRec(coPanel); });
    w.draft = { ...done.result, selection: body.selection };
  } catch (e) {
    w.err = errText(e);
  } finally {
    w.job = null;
    if (w.tab === 'co') setRec(coPanel);
  }
}

async function acceptDraft(prose, mode, selection, memory) {
  const w = ui.wr;
  try {
    const r = await api('POST', `/works/${ui.w}/write/accept`, { ep: w.ep, sceneId: w.focus, mode, prose, memory, selection, provider: w.draft?.provider });
    const u = r.updates;
    w.acceptNote = [u.summary ? '장면 요약' : '', u.characters.length ? `등장 ${u.characters.length}명` : '', u.states ? `상태 변화 ${u.states}건` : '', u.threadsPlanted.length ? `떡밥 ${u.threadsPlanted.length}개 심음` : '', u.threadsResolved.length ? `떡밥 ${u.threadsResolved.length}개 회수` : '', u.candidates.length ? `새 설정 후보 ${u.candidates.length}개` : ''].filter(Boolean).join(' · ') || '원고에 넣었어요';
    if (r.warnings?.length) w.acceptNote += ` / 확인할 것: ${r.warnings.map((x) => x.text).join(' / ')}`;
    w.draft = null;
    w.sel = null;
    w.mem = null;
    await screenWrite(w.ep);
    toast('원고에 넣었어요');
  } catch (e) {
    w.err = errText(e);
    setRec(coPanel);
  }
}

// ---------- 설정집 ----------
const BIB_CATS = [['world', '세계'], ['system', '체계'], ['character', '인물'], ['faction', '세력'], ['monster', '몬스터'], ['place', '장소'], ['thread', '떡밥'], ['relation', '관계'], ['event', '사건'], ['ai', 'AI 임의 설정']];
async function screenBible() {
  const seq = navSeq;
  const b = await api('GET', `/works/${ui.w}/bible`);
  if (stale(seq)) return;
  ui.bib = { cat: 'character', sel: null, ...(ui.bib || {}), b };
  drawBible();
}

function bibItems(cat) {
  const b = ui.bib.b;
  const list = {
    world: [{ ...b.world, id: 'wd_0001', name: '세계' }], system: b.system, character: b.character, faction: b.faction, monster: b.monster,
    place: b.world?.places || [], thread: b.thread, relation: b.relation, event: b.event,
  };
  if (cat === 'ai') return [...b.character, ...b.system, ...b.faction, ...b.monster, { ...b.world, id: 'wd_0001', name: '세계' }].filter((e) => e.ai_filled?.length);
  return list[cat] || [];
}

function kindOf(id) { return { ch: 'character', fc: 'faction', sy: 'system', mo: 'monster', wd: 'world' }[String(id).slice(0, 2)]; }

function drawBible() {
  const { cat } = ui.bib;
  const items = bibItems(cat);
  const sel = items.find((x) => x.id === ui.bib.sel) || items[0];
  const editable = sel && kindOf(sel.id) && cat !== 'place';
  const fields = sel ? Object.entries(sel).filter(([k, v]) => !['id', 'rev', 'schemaVersion', 'ai_filled', 'slot', 'portrait'].includes(k) && v !== '' && v !== null && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) : [];
  const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 1).replace(/[{}"[\]]/g, '').trim());
  view.innerHTML = `<div style="margin-top:12px"><h1 class="title">설정집</h1><div class="lib">
    <aside class="col cats-col"><div class="cats">${BIB_CATS.map(([k, n]) => `<button type="button" data-act="bibCat" data-c="${k}" aria-pressed="${cat === k}"><span>${n}</span><span class="muted">${bibItems(k).length}</span></button>`).join('')}</div>
      <div class="stack" style="margin-top:12px"><b class="small">새 카드</b><select id="newKind"><option value="monster">몬스터</option><option value="character">인물</option><option value="faction">세력</option></select><input type="text" id="newName" placeholder="이름" style="border:1px solid var(--line);border-radius:6px;padding:5px 8px;background:var(--card)"><button class="btn sm" data-act="newCard">만들기</button></div></aside>
    <main><div class="lgrid">${items.map((x) => `<button type="button" class="card lc ${x.ai_filled?.length ? 'aifill' : ''}" data-act="bibSel" data-id="${esc(x.id)}" aria-pressed="${sel?.id === x.id}"><b>${esc(x.name || x.title || x.type || x.id)}${x.ai_filled?.length ? ' <span class="tag">AI 임의 설정</span>' : ''}</b><span class="small">${esc(String(x.goal || x.lack || x.premise || x.note || x.desire?.want || x.source || x.a_to_b || '').slice(0, 80))}</span><small>${esc(x.id)}</small></button>`).join('') || '<div class="card empty">아직 없어요. 위저드나 집필 중 새 설정 후보에서 생겨요.</div>'}</div></main>
    <aside class="col" id="bibDet">${sel ? `<div class="det"><h2 style="font-size:16px">${esc(sel.name || sel.title || sel.id)}</h2>${sel.portrait ? `<img class="portrait" alt="대표 이미지" data-img="${esc(sel.portrait)}">` : ''}
      ${sel.ai_filled?.length ? `<div class="sum aifill"><span class="tag">AI 임의 설정</span><p class="small">AI가 알아서 채운 항목: ${esc(sel.ai_filled.join(', '))}</p>${editable ? `<button class="btn sm" data-act="clearAi" data-id="${esc(sel.id)}">내용 확인하고 확정</button>` : ''}</div>` : ''}
      <dl class="kvlist">${fields.map(([k, v]) => `<dt>${esc(KO[k] || k)}</dt><dd>${esc(show(v))}</dd>`).join('')}</dl>
      ${editable ? `<details><summary class="small">고치기</summary><div class="formgrid" id="bibEdit">${['name', 'visual', 'appearance_hook', 'note', 'goal', 'lack', 'premise', 'threat', 'habitat'].filter((k) => k in sel || ['visual', 'note'].includes(k)).map((k) => `<div><label for="be-${k}">${esc(KO[k] || { visual: '고정 외형(그림용)', threat: '위협 등급', habitat: '서식지' }[k] || k)}</label><textarea id="be-${k}" data-field="${k}" rows="2">${esc(typeof sel[k] === 'string' ? sel[k] : '')}</textarea></div>`).join('')}<button class="btn sm primary" data-act="saveCard" data-id="${esc(sel.id)}" data-rev="${sel.rev ?? ''}">저장</button></div></details>` : ''}</div>` : ''}</aside></div></div>`;
  for (const img of $$('img[data-img]')) imageUrl(ui.w, img.dataset.img).then((u) => { img.src = u; }).catch(() => {});
}

// ---------- AI 연결 ----------
async function screenSettings() {
  const seq = navSeq;
  const p = await loadProviders(true);
  const settings = await api('GET', '/settings');
  if (stale(seq)) return;
  ui.settings = settings;
  const s = ui.settings;
  const card = (id) => {
    const x = p.providers[id];
    if (!x) return '';
    const st = !x.installed ? ['bad', '■ 설치 안 됨'] : x.loggedIn ? ['ok', '✓ 로그인됨'] : ['warn', '▲ 로그인 필요'];
    return `<div class="card aic"><header><h2 style="font-size:15px">${esc(PROV_KO[id])}</h2><span class="pill ${st[0]}">${st[1]}</span>${x.version ? `<span class="muted small">${esc(x.version)}</span>` : ''}</header>${(x.warnings || []).map((w) => `<p class="errline">▲ ${esc(w)}</p>`).join('')}<p class="muted small">이 앱에서 부른 횟수: 지난 1시간 ${x.usage?.lastHour ?? 0}회 · 오늘 ${x.usage?.today ?? 0}회</p>${!x.installed && id !== 'mock' ? `<p class="small">${id === 'claude' ? 'Claude Code를 설치하고 터미널에서 <code>claude</code>를 실행해 로그인해 주세요.' : 'Codex CLI를 설치하고 <code>codex login</code>으로 ChatGPT 계정에 로그인해 주세요.'}</p>` : ''}<div class="actions"><button class="btn sm" data-act="testAi" data-p="${id}">연결 테스트${id === 'mock' ? '' : ' (한도 조금 사용)'}</button><span class="muted small" id="test-${id}"></span></div></div>`;
  };
  view.innerHTML = `<div class="set" style="margin-top:12px"><div><h1 class="title">AI 연결</h1><p class="muted">API 키가 아니라 이 PC에 로그인된 구독을 씁니다. 글은 Claude Code(<code>claude -p</code>), 그림은 Codex CLI의 내장 그림 도구로 ChatGPT 구독을 씁니다.</p></div>
    ${card('claude')}${card('codex')}${card('mock')}
    <div class="card aic"><h2 style="font-size:15px">누가 무엇을 하나</h2><div class="tbl">
      <label for="stText">글 (위저드·집필·요약)</label><select id="stText">${['claude', 'codex', 'mock'].map((k) => `<option value="${k}" ${p.textProvider === k ? 'selected' : ''}>${PROV_KO[k]}</option>`).join('')}</select>
      <label for="stImg">그림</label><select id="stImg"><option value="manual" ${p.imageProvider !== 'codex' ? 'selected' : ''}>수동: 프롬프트 복사 → ChatGPT → 가져오기</option><option value="codex" ${p.imageProvider === 'codex' ? 'selected' : ''}>ChatGPT(Codex)로 자동 그리기</option></select>
      <label for="stCap">시간당 호출 상한 <span class="hint">넘으면 확인을 받아요</span></label><input type="number" id="stCap" min="1" max="200" value="${s.hourlyCap}" style="border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:var(--card)">
      <label for="stBudget">집필 기억 예산 <span class="hint">글자 수, 클수록 덜 잊지만 한도를 더 써요</span></label><input type="number" id="stBudget" min="5000" max="200000" step="5000" value="${s.memoryBudget || 60000}" style="border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:var(--card)">
    </div><p class="muted small">그림은 ChatGPT 사용 한도를 글보다 3~5배 빨리 써요(Codex 문서 기준). 구독 사용량 자체는 앱에서 볼 수 없어요.</p><div class="actions"><button class="btn primary" data-act="saveSettings">저장</button></div></div>
    <div class="card aic"><h2 style="font-size:15px">시험용 모의 상태</h2><p class="muted small">모의 AI를 쓸 때 오류 화면을 확인하는 장치예요.</p><select id="stMock">${[['ok', '정상'], ['limit', '사용 한도 도달'], ['login', '로그인 만료'], ['badjson', '형식이 깨진 응답'], ['slow', '느린 응답']].map(([v, l]) => `<option value="${v}" ${s.mockMode === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" data-act="saveMock">적용</button></div></div>`;
}

// ---------- 이벤트 ----------
const ACT = {
  genre: (el) => { const n = ui.newWork; readNew(); const id = el.dataset.id; const i = n.genres.indexOf(id); if (i >= 0) n.genres.splice(i, 1); else if (n.genres.length < 2) n.genres.push(id); else toast('장르는 두 개까지 고를 수 있어요'); screenNew(); },
  createWork: async () => {
    readNew();
    const n = ui.newWork;
    try {
      const w = await api('POST', '/works', { title: n.title, logline: n.logline, genres: n.genres, primaryWeight: n.genres.length === 2 ? n.weight : undefined, mix_policy: n.genres.length === 2 ? { system_relation: n.rel, accuracy_level: n.acc } : undefined });
      ui.newWork = { genres: [], weight: 60, rel: 'translate', acc: 'loose', title: '', logline: '' };
      location.hash = `#/w/${w.id}/wizard`;
    } catch (e) { $('#nwErr').textContent = errText(e); }
  },
  pickQ: (el) => { ui.wz.cur = el.dataset.qid; ui.wz.edit = null; ui.wz.checks = []; ui.wz.showPrev = false; ui.wz.err = ''; drawWizard(); },
  propose: (el) => { const q = qOf(ui.wz.cur); wizardPropose(el.dataset.batch === '1' ? {} : { qids: [q.qid] }); },
  regen: () => { const c = ui.wz.v.cache[ui.wz.cur]; wizardPropose({ qids: [ui.wz.cur], hint: $('#wzHint')?.value || '다른 방향으로', rejected: (c?.candidates || []).map((x) => x.title) }); },
  merge: () => wizardPropose({ merge: { qid: ui.wz.cur, picks: ui.wz.checks, instruction: $('#wzHint')?.value || '' } }),
  check: (el) => { const i = Number(el.dataset.i); const k = ui.wz.checks; const at = k.indexOf(i); if (el.checked && at < 0) k.push(i); if (!el.checked && at >= 0) k.splice(at, 1); const b = $('[data-act="merge"]'); if (b) b.disabled = k.length < 2; },
  pickCand: (el) => { const c = (ui.wz.showPrev ? ui.wz.v.cache[ui.wz.cur].prev : ui.wz.v.cache[ui.wz.cur]).candidates[Number(el.dataset.i)]; wizardConfirm(c.value, { source: `후보: ${c.title}` }); },
  editCand: (el) => { const c = (ui.wz.showPrev ? ui.wz.v.cache[ui.wz.cur].prev : ui.wz.v.cache[ui.wz.cur]).candidates[Number(el.dataset.i)]; ui.wz.edit = { title: c.title, value: c.value }; drawWizard(); },
  ownWrite: () => { ui.wz.edit = 'own'; drawWizard(); },
  cancelEdit: () => { ui.wz.edit = null; drawWizard(); },
  confirmEdit: () => {
    const q = qOf(ui.wz.cur);
    const value = readForm($('#editBox'), q.value_schema);
    const errs = checkValue(q.value_schema, value);
    if (errs.length) { $('#editErr').textContent = `형식에 맞지 않아요: ${errs.slice(0, 3).join(' / ')}`; return; }
    wizardConfirm(value, { source: ui.wz.edit === 'own' ? '직접 입력' : `수정: ${ui.wz.edit.title}` });
  },
  skip: async () => { try { await api('POST', `/works/${ui.w}/wizard/skip`, { qid: ui.wz.cur }); ui.wz.cur = null; await screenWizard(); } catch (e) { ui.wz.err = errText(e); drawWizard(); } },
  auto: () => { const c = ui.wz.v.cache[ui.wz.cur]; wizardConfirm(c.candidates[c.recommend || 0].value, { auto: true, source: 'AI가 알아서' }); },
  togglePrev: () => { ui.wz.showPrev = !ui.wz.showPrev; ui.wz.checks = []; drawWizard(); },
  undoAsk: async (el) => { const q = qOf(el.dataset.qid); if (q.hasDependents) { ui.wz.undoAsk = q.qid; drawWizard(); } else await ACT.undo(el); },
  undo: async (el) => { try { const r = await api('POST', `/works/${ui.w}/wizard/revert`, { qid: el.dataset.qid, cascade: el.dataset.cascade === '1' }); ui.wz.undoAsk = null; ui.wz.cur = el.dataset.qid; toast(`${r.reverted.length}개를 되돌렸어요`); await screenWizard(); } catch (e) { toast(errText(e)); } },
  startWriting: async () => { const { episodes } = await api('GET', `/works/${ui.w}/episodes`); if (!episodes.length) await api('POST', `/works/${ui.w}/episodes`, { title: '1화' }); location.hash = `#/w/${ui.w}/write`; },
  cancelJob: async (el) => { if (el.dataset.id) await api('DELETE', `/ai/jobs/${el.dataset.id}`).catch(() => {}); },
  newEpisode: async () => { await saveNow(); const ep = await api('POST', `/works/${ui.w}/episodes`, {}); if (ui.wr) ui.wr.ep = ep.id; await screenWrite(ep.id); },
  openEp: async (el) => { await saveNow(); ui.wr.sumDraft = null; await screenWrite(el.dataset.ep); },
  newScene: async () => { await saveNow(); const sc = await api('POST', `/works/${ui.w}/episodes/${ui.wr.ep}/scenes`, {}); ui.wr.focus = sc.id; await screenWrite(ui.wr.ep); $(`[data-meta="goal"][data-id="${sc.id}"]`)?.focus(); },
  focusScene: (el) => { ui.wr.focus = el.dataset.id; drawWrite(); $(`[data-text="${el.dataset.id}"]`)?.focus(); },
  tab: (el) => { ui.wr.tab = el.dataset.tab; drawWrite(); },
  mode: (el) => { readCo(); ui.wr.mode = el.dataset.mode; setRec(coPanel); },
  preview: async () => { readCo(); await saveNow(); try { const r = await api('POST', `/works/${ui.w}/write/preview`, { ep: ui.wr.ep, sceneId: ui.wr.focus, mode: ui.wr.mode === 'polish' ? 'draft' : ui.wr.mode, request: ui.wr.request }); ui.wr.ledger = r.ledger; ui.wr.showLedger = true; } catch (e) { ui.wr.err = errText(e); } setRec(coPanel); },
  draft: () => runDraft(),
  redo: () => runDraft('앞선 초안과 다르게'),
  dropDraft: () => { ui.wr.draft = null; setRec(coPanel); },
  acceptDraft: () => { const d = ui.wr.draft; acceptDraft(d.prose, d.mode, d.selection, d.memory); },
  acceptAlt: (el) => { const d = ui.wr.draft; acceptDraft(d.alternatives[Number(el.dataset.i)].text, 'polish', d.selection, null); },
  summarizeEp: async () => {
    await saveNow();
    try {
      const j = await startJob('POST', `/works/${ui.w}/episodes/${ui.wr.ep}/summarize`, {});
      if (!j) return;
      ui.wr.sumJob = j; drawWrite();
      const done = await waitJob(j.id, (x) => { ui.wr.sumJob = x; });
      ui.wr.sumDraft = done.result;
    } catch (e) { toast(errText(e)); } finally { ui.wr.sumJob = null; drawWrite(); }
  },
  acceptSummary: async () => { const r = await api('POST', `/works/${ui.w}/episodes/${ui.wr.ep}/summary`, { text: $('#sumText').value, events: ui.wr.sumDraft.events }); ui.wr.sumDraft = null; ui.wr.mem = null; toast(r.missing.length ? `요약에 빠진 변화: ${r.missing.join(', ')}` : '회차 요약을 기억에 저장했어요'); await screenWrite(ui.wr.ep); },
  dropSummary: () => { ui.wr.sumDraft = null; drawWrite(); },
  arcPropose: async (el) => {
    const range = { from: Number(el.dataset.from), to: Number(el.dataset.to) };
    try {
      const j = await startJob('POST', `/works/${ui.w}/memory/arc/propose`, range);
      if (!j) return;
      ui.wr.arcJob = j; setRec(memPanel);
      const done = await waitJob(j.id, (x) => { ui.wr.arcJob = x; });
      ui.wr.arcDraft = { ...range, ...done.result };
    } catch (e) { toast(errText(e)); } finally { ui.wr.arcJob = null; setRec(memPanel); }
  },
  acceptArc: async () => { const d = ui.wr.arcDraft; const r = await api('POST', `/works/${ui.w}/memory/arc`, { from: d.from, to: d.to, title: $('#arcTitle').value, text: $('#arcText').value }); ui.wr.arcDraft = null; ui.wr.mem = null; toast(r.missing.length ? `요약에 빠진 변화: ${r.missing.slice(0, 3).join(', ')}` : '아크 요약을 기억에 저장했어요'); setRec(memPanel); },
  dropArc: () => { ui.wr.arcDraft = null; setRec(memPanel); },
  savePins: async () => { const m = ui.wr.mem; const add = $('#pinCard').value; const cards = [...(m.pins?.cards || []), ...(add ? [add] : [])]; await api('PUT', `/works/${ui.w}/memory/pins`, { cards, notes: $('#pinNotes').value.split('\n') }); ui.wr.mem = null; toast('고정 기억을 저장했어요'); setRec(memPanel); },
  unpin: async (el) => { const m = ui.wr.mem; await api('PUT', `/works/${ui.w}/memory/pins`, { cards: (m.pins.cards || []).filter((x) => x !== el.dataset.id), notes: m.pins.notes || [] }); ui.wr.mem = null; setRec(memPanel); },
  saveStyle: async () => { await api('PATCH', `/works/${ui.w}/style`, { pov: $('#stPov').value || null, rules: $('#stRules').value.split('\n'), samples: $('#stSample').value.split(/\n\s*\n\s*\n/).map((x) => x.trim()), art_style: $('#stArt').value }); ui.wr.mem = null; ui.wr.bible = null; ui.wr.bible = await api('GET', `/works/${ui.w}/bible`); toast('문체 가이드를 저장했어요'); setRec(memPanel); },
  candAccept: async (el) => { const r = await api('POST', `/works/${ui.w}/candidates/${el.dataset.id}/accept`, {}); toast(r.created ? `${r.created.name} 카드를 만들었어요` : '반영했어요(이 종류는 설정집에서 직접 정리해 주세요)'); ui.wr.mem = null; setRec(memPanel); },
  candDismiss: async (el) => { await api('POST', `/works/${ui.w}/candidates/${el.dataset.id}/dismiss`, {}); ui.wr.mem = null; setRec(memPanel); },
  imgPrompt: async () => {
    const g = ui.wr.img; readImg();
    try {
      const r = await api('POST', `/works/${ui.w}/images/prompt`, { kind: g.kind, refs: g.target ? [g.target] : [], sceneId: g.kind === 'illustration' ? ui.wr.focus : undefined, extra: g.extra });
      g.prompt = r.prompt; g.refsNote = r.references.length ? `대표 이미지 ${r.references.length}장을 참조로 넘겨요` : '';
    } catch (e) { ui.wr.imgErr = errText(e); }
    setRec(imgPanel); hydrateImages();
  },
  copyPrompt: async () => { const t = $('#imPrompt').value; try { await navigator.clipboard.writeText(t); toast('복사했어요. ChatGPT에 붙여 넣으세요'); } catch { $('#imPrompt').select(); toast('직접 선택해 복사해 주세요'); } },
  imgGenerate: async () => {
    const g = ui.wr.img; readImg(); ui.wr.imgErr = '';
    try {
      if (!(await ask('그림은 ChatGPT 사용 한도를 글보다 3~5배 빨리 써요. 지금 그릴까요?'))) return;
      const j = await startJob('POST', `/works/${ui.w}/images/generate`, { confirm: true, kind: g.kind, refs: g.target ? [g.target] : [], sceneId: g.kind === 'illustration' ? ui.wr.focus : undefined, extra: g.extra, prompt: $('#imPrompt')?.value || undefined });
      if (!j) return;
      ui.wr.imgJob = j; setRec(imgPanel);
      const done = await waitJob(j.id, (x) => { ui.wr.imgJob = x; });
      g.images = null; g.sel = done.result.images[0]?.id || null;
      toast('그림을 저장했어요');
    } catch (e) { ui.wr.imgErr = errText(e); } finally { ui.wr.imgJob = null; setRec(imgPanel); hydrateImages(); }
  },
  imgSel: (el) => { ui.wr.img.sel = el.dataset.id; setRec(imgPanel); hydrateImages(); },
  setPortrait: async (el) => { await api('PATCH', `/works/${ui.w}/images/${el.dataset.id}`, { portraitFor: el.dataset.ref }); ui.wr.bible = await api('GET', `/works/${ui.w}/bible`); toast('대표 이미지로 정했어요. 다음 그림부터 참조로 넘겨요'); },
  insertImg: (el) => {
    const s = sceneOf(ui.wr.focus);
    const img = ui.wr.img.images.find((x) => x.id === el.dataset.id);
    if (!s || !img) return;
    const ta = $(`[data-text="${s.id}"]`);
    const at = ta && ta.selectionStart !== undefined ? ta.selectionStart : s.text.length;
    const md = `\n\n![${img.title}](그림:${img.id})\n\n`;
    s.text = s.text.slice(0, at) + md + s.text.slice(at);
    if (ta) ta.value = s.text;
    scheduleSave();
    toast('원고에 그림 자리를 넣었어요');
  },
  addPin: async (el, ev) => {
    const r = el.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width; const y = (ev.clientY - r.top) / r.height;
    const sel = ui.wr.img.images.find((i) => i.id === ui.wr.img.sel);
    const place = $('#pinPlace');
    const label = place?.selectedOptions[0]?.textContent || '장소';
    const pins = [...(sel.pins || []), { place: place?.value || '', label, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }];
    const upd = await api('PATCH', `/works/${ui.w}/images/${sel.id}`, { pins });
    Object.assign(sel, upd);
    setRec(imgPanel); hydrateImages();
  },
  bibCat: (el) => { ui.bib.cat = el.dataset.c; ui.bib.sel = null; drawBible(); },
  bibSel: (el) => { ui.bib.sel = el.dataset.id; drawBible(); },
  clearAi: async (el) => { const k = kindOf(el.dataset.id); await api('PATCH', `/works/${ui.w}/bible/${k}/${el.dataset.id}`, { clearAiFilled: true }); toast('확정했어요'); await screenBible(); },
  saveCard: async (el) => {
    const set = {};
    for (const t of $$('#bibEdit [data-field]')) if (t.value.trim()) set[t.dataset.field] = t.value.trim();
    try { await api('PATCH', `/works/${ui.w}/bible/${kindOf(el.dataset.id)}/${el.dataset.id}`, { set, rev: el.dataset.rev ? Number(el.dataset.rev) : undefined }); toast('저장했어요'); await screenBible(); } catch (e) { toast(errText(e)); }
  },
  newCard: async () => { try { const c = await api('POST', `/works/${ui.w}/bible/${$('#newKind').value}`, { name: $('#newName').value }); ui.bib.cat = $('#newKind').value; ui.bib.sel = c.id; await screenBible(); } catch (e) { toast(errText(e)); } },
  saveSettings: async () => {
    const t = $('#stText').value;
    try {
      await api('PUT', '/settings', { provider: t, perTask: { world: t, write: t, summary: t }, imageProvider: $('#stImg').value, hourlyCap: Number($('#stCap').value) || 20, memoryBudget: Number($('#stBudget').value) || 60000 });
      toast('저장했어요'); await screenSettings();
    } catch (e) { toast(errText(e)); }
  },
  saveMock: async () => { await api('PUT', '/settings', { mockMode: $('#stMock').value }); toast('모의 상태를 바꿨어요'); },
  testAi: async (el) => {
    const out = $(`#test-${el.dataset.p}`);
    try {
      if (el.dataset.p !== 'mock' && !(await ask('실제 AI를 한 번 불러 구독 한도를 조금 써요. 테스트할까요?'))) return;
      const j = await startJob('POST', '/ai/test', { provider: el.dataset.p, confirm: el.dataset.p !== 'mock' });
      if (!j) return;
      out.textContent = '부르는 중…';
      const d = await waitJob(j.id);
      out.textContent = `응답 확인 · ${Math.round((d.meta?.durationMs || 0) / 100) / 10}초`;
    } catch (e) { out.textContent = errText(e); }
  },
};

function readNew() {
  const n = ui.newWork;
  if ($('#nwTitle')) n.title = $('#nwTitle').value;
  if ($('#nwLog')) n.logline = $('#nwLog').value;
  if ($('#nwW')) n.weight = Number($('#nwW').value);
  if ($('#nwRel')) n.rel = $('#nwRel').value;
  if ($('#nwAcc')) n.acc = $('#nwAcc').value;
}
function readImg() {
  const g = ui.wr.img;
  if ($('#imKind')) g.kind = $('#imKind').value;
  g.target = $('#imTarget')?.value || '';
  g.extra = $('#imExtra')?.value || '';
}

view.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.dataset.act === 'check') return;
  if (el.tagName === 'ARTICLE' && ev.target.closest('button,input,label')) return;
  const fn = ACT[el.dataset.act];
  if (fn) { ev.preventDefault(); Promise.resolve(fn(el, ev)).catch((e) => toast(errText(e))); }
});
view.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.dataset.act === 'check') ACT.check(el);
  if (el.id === 'nwW' || el.id === 'nwRel' || el.id === 'nwAcc') { readNew(); screenNew(); }
  if (el.id === 'imKind') { readImg(); ui.wr.img.target = ''; ui.wr.img.prompt = ''; setRec(imgPanel); hydrateImages(); }
  if (el.id === 'imFile' && el.files[0]) uploadImage(el.files[0]);
  if (el.dataset.meta) {
    api('PATCH', `/works/${ui.w}/scenes/${el.dataset.id}`, { [el.dataset.meta]: el.value }).then(() => { const s = sceneOf(el.dataset.id); s.meta = { ...(s.meta || {}), [el.dataset.meta]: el.value }; }).catch((e) => toast(errText(e)));
  }
});
view.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.text && ui.wr) {
    const s = sceneOf(el.dataset.text);
    if (s) { s.text = el.value; scheduleSave(); }
  }
  if (el.id === 'epTitle' && ui.wr) { ui.wr.e.title = el.value; scheduleSave(); }
});
const trackSel = (ev) => {
  const el = ev.target;
  if (!el.dataset?.text || !ui.wr) return;
  ui.wr.focus = el.dataset.text;
  ui.wr.sel = { id: el.dataset.text, start: el.selectionStart, end: el.selectionEnd };
  for (const sec of $$('.scene')) sec.classList.toggle('focus', sec.dataset.scene === el.dataset.text);
};
view.addEventListener('select', trackSel, true);
view.addEventListener('keyup', trackSel);
view.addEventListener('mouseup', trackSel);
view.addEventListener('focusin', (ev) => { if (ev.target.dataset?.text && ui.wr && ui.wr.focus !== ev.target.dataset.text) { ui.wr.focus = ev.target.dataset.text; if (ui.wr.tab === 'co') setRec(coPanel); for (const sec of $$('.scene')) sec.classList.toggle('focus', sec.dataset.scene === ui.wr.focus); } });
view.addEventListener('dragover', (ev) => { const d = ev.target.closest('#drop'); if (d) { ev.preventDefault(); d.classList.add('over'); } });
view.addEventListener('dragleave', (ev) => { ev.target.closest('#drop')?.classList.remove('over'); });
view.addEventListener('drop', (ev) => { const d = ev.target.closest('#drop'); if (d) { ev.preventDefault(); d.classList.remove('over'); const f = ev.dataTransfer.files[0]; if (f) uploadImage(f); } });

async function uploadImage(file) {
  const g = ui.wr.img; readImg();
  const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
  try {
    const item = await api('POST', `/works/${ui.w}/images`, { kind: g.kind, title: file.name.replace(/\.[^.]+$/, '').slice(0, 60), prompt: $('#imPrompt')?.value || g.prompt || '', refs: g.target ? [g.target] : [], sceneId: g.kind === 'illustration' ? ui.wr.focus : null, dataBase64: data, provider: 'manual' });
    g.images = null; g.sel = item.id; toast('그림을 가져왔어요');
  } catch (e) { ui.wr.imgErr = errText(e); }
  setRec(imgPanel); hydrateImages();
}

window.addEventListener('beforeunload', () => { if (ui.wr?.dirty) saveNow(); });
window.addEventListener('hashchange', route);
if (!initToken()) {
  view.innerHTML = '<div class="card errbox" style="margin-top:12px"><b>도우미 주소로 열어 주세요</b><p>룬북.bat을 실행하면 브라우저가 자동으로 열려요. 이 창은 주소에 열쇠(#t=…)가 없어요.</p></div>';
} else route();
