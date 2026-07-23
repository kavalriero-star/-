/* 뷰 렌더러 — State를 받아 HTML 문자열을 반환.
   편집 입력에는 data-bind="kind:id:path" 부여 → app.js가 위임 처리 */
const Render = (() => {
  const { won, pct } = Util;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const bind = (kind, id, path, val, cls = "cell", extra = "") =>
    `<input class="${cls}" data-bind="${kind}:${id}:${path}" value="${val}" ${extra}>`;
  const bindText = (kind, id, path, val) => bind(kind, id, path, val ?? "", "cell text");

  // ---- 견적 요약 ----
  const projField = (label, key, val) =>
    `<div class="field"><label>${label}</label><input class="text" data-projbind="${key}" value="${(val ?? "").toString().replace(/"/g,'&quot;')}"></div>`;

  function summary(S) {
    const r = S.result, sm = r.summary;
    const pj = (S.project && S.project.project) || {};
    const nAssy = r.assemblies.length, nLine = sm.lines.length;
    let h = `<div class="view-head"><h1>견적 요약</h1>
      <span class="sub">${esc(pj.title || "")}</span><div class="spacer"></div>
      <button class="btn btn-sm" onclick="App.exportExcel()">⬇ 엑셀</button></div>`;

    // 견적 정보 (편집)
    h += `<div class="card"><div class="card-head"><h3>견적 정보</h3>
      <span class="sub">이 견적의 기본 정보</span></div><div class="card-body"><div class="pgrid">
      ${projField("견적명", "title", pj.title)}
      ${projField("문서번호", "doc_no", pj.doc_no)}
      ${projField("리비전", "revision", pj.revision)}
      ${projField("고객사", "customer", pj.customer)}
      ${projField("작성일", "date", pj.date)}
      </div></div></div>`;

    if (nAssy === 0 && r.parts.length === 0) {
      h += `<div class="card"><div class="card-body" style="text-align:center;padding:48px 20px">
        <div style="font-size:38px">🗂️</div>
        <h3 style="margin:12px 0 6px">아직 품목이 없습니다</h3>
        <p class="muted" style="margin:0 0 18px">좌측 사이드바의 <b>＋</b> 버튼으로 신규 조립품·사출품을 추가해 원가 견적을 시작하세요.</p>
        <button class="btn btn-primary btn-sm" onclick="App.addProduct('assy')">＋ 신규 조립품 추가</button>
        <button class="btn btn-sm" onclick="App.addProduct('part')">＋ 신규 사출품 추가</button>
      </div></div>`;
      return h;
    }

    h += `<div class="kpi-grid">
      <div class="kpi accent"><div class="label">연간 매출 합계</div><div class="value">${won(sm.total_year/1e8,1)}<span class="unit">억원</span></div></div>
      <div class="kpi"><div class="label">월 매출 합계</div><div class="value">${won(sm.total_month/1e6,0)}<span class="unit">백만원</span></div></div>
      <div class="kpi"><div class="label">견적 품목</div><div class="value">${nLine}<span class="unit">건 / ${nAssy}종</span></div></div>
      <div class="kpi"><div class="label">월 생산물량</div><div class="value">${won(sm.lines.reduce((a,l)=>a+l.volume,0))}<span class="unit">EA</span></div></div>
    </div>`;
    h += `<div class="card"><div class="card-head"><h3>품목별 견적</h3>
      <span class="sub">판가 = 제조원가 × (1 + 관리비율 + 영업이익율) + 운반비</span></div>
      <div class="card-body"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>품목</th><th>고객</th><th>Type</th><th>자재코드</th><th class="r">관리비</th><th class="r">영업이익</th>
      <th class="r">제조원가</th><th class="r">판가</th><th class="r">물량/월</th><th class="r">매출/월</th></tr></thead><tbody>`;
    for (const l of sm.lines) {
      h += `<tr><td>${l.module}</td><td class="c">${l.customer||""}</td><td class="c">${l.type||""}</td>
        <td class="c num">${l.material_code||""}</td><td class="r">${pct(l.admin_rate)}</td><td class="r">${pct(l.profit_rate)}</td>
        <td class="r">${won(l.mfg_cost)}</td><td class="r"><b>${won(l.price)}</b></td>
        <td class="r">${won(l.volume)}</td><td class="r">${won(l.sales_month)}</td></tr>`;
    }
    h += `<tr class="total"><td colspan="8">합계</td><td class="r">${won(sm.lines.reduce((a,l)=>a+l.volume,0))}</td>
      <td class="r">${won(sm.total_month)}</td></tr></tbody></table></div></div></div>`;
    return h;
  }

  // ---- 판가 시나리오 ----
  function scenario(S) {
    let h = `<div class="view-head"><h1>판가 시나리오</h1><span class="sub">영업이익율 × 관리비율 민감도 (현재 견적값 강조)</span></div>`;
    for (const a of S.result.assemblies) {
      const mx = a.matrix;
      h += `<div class="card"><div class="card-head"><h3>${a.name}</h3>
        <span class="sub">제조원가 ${won(a.manufacturing_cost)} · 운반비 ${won(a.quote.transport,1)}</span></div>
        <div class="card-body"><div class="tbl-wrap"><table class="tbl"><thead><tr>
        <th>관리비 \\ 영업이익</th>`;
      mx.profit_rates.forEach(p => h += `<th class="r">${pct(p)}</th>`);
      h += `</tr></thead><tbody>`;
      for (const row of mx.rows) {
        h += `<tr><td><b>${pct(row.admin_rate)}</b></td>`;
        for (const c of row.cells) {
          const base = Math.abs(c.admin_rate - a.quote.admin_rate) < 1e-9 && Math.abs(c.profit_rate - a.quote.profit_rate) < 1e-9;
          h += `<td class="r ${base ? "mx-base" : ""}">${won(c.price)}</td>`;
        }
        h += `</tr>`;
      }
      h += `</tbody></table></div></div></div>`;
    }
    return h;
  }

  // ---- 경쟁사 비교 ----
  function competitor(S) {
    let h = `<div class="view-head"><h1>경쟁사 비교</h1><span class="sub">당사 견적가 vs 신흥정밀 양산판가</span></div>`;
    h += `<div class="card"><div class="card-body"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>품명</th><th>고객</th><th>자재코드</th><th class="r">당사 견적가</th>
      <th class="r">경쟁사가</th><th class="r">차이</th><th class="r">차이%</th></tr></thead><tbody>`;
    for (const a of S.result.assemblies) {
      for (const c of a.competitor) {
        const cls = c.diff > 0 ? "neg" : "pos";
        h += `<tr><td>${c.name}</td><td class="c">${c.customer}</td><td class="c num">${c.material_code}</td>
          <td class="r"><b>${won(c.our_price)}</b></td><td class="r">${won(c.competitor_price)}</td>
          <td class="r pill-diff ${cls}">${c.diff>0?"+":""}${won(c.diff)}</td>
          <td class="r pill-diff ${cls}">${pct(c.diff_pct,2)}</td></tr>`;
      }
    }
    h += `</tbody></table></div><p class="hint">차이(+)는 당사가가 경쟁사보다 높음을 의미합니다.</p></div></div>`;
    return h;
  }

  // ---- 손익 BEP ----
  function bep(S) {
    let h = `<div class="view-head"><h1>손익 · BEP</h1><span class="sub">공헌이익 및 손익분기 물량</span></div>`;
    h += `<div class="card"><div class="card-body"><div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>품목</th><th class="r">물량/월</th><th class="r">판가</th><th class="r">개당 변동비</th>
      <th class="r">개당 공헌이익</th><th class="r">공헌이익율</th><th class="r">BEP 물량</th><th class="r">BEP 매출</th></tr></thead><tbody>`;
    for (const a of S.result.assemblies) {
      const b = a.bep;
      h += `<tr><td>${a.name}</td><td class="r">${won(b.volume)}</td><td class="r">${won(b.price)}</td>
        <td class="r">${won(b.unit_variable)}</td><td class="r"><b>${won(b.contribution)}</b></td>
        <td class="r">${pct(b.cm_ratio)}</td><td class="r">${won(b.bep_qty)}</td><td class="r">${won(b.bep_sales)}</td></tr>`;
    }
    h += `</tbody></table></div><p class="hint">고정비: 감가상각·건물·수선·기타·관리비 / 변동비: 재료·복리후생·수도광열·소모품·포장·운반 (노무비 전액 변동 가정)</p></div></div>`;
    return h;
  }

  // ---- 원가 상세 (사출/조립 공통) ----
  function detail(S, kind, id) {
    const res = (kind === "assy" ? S.result.assemblies : S.result.parts).find(x => x.id === id);
    const proj = (kind === "assy" ? S.project.assemblies : S.project.parts).find(x => x.id === id);
    if (!res || !proj) return `<p>품목을 찾을 수 없습니다.</p>`;
    const isAssy = kind === "assy";
    const badge = isAssy ? `<span class="badge asy">조립품</span>` : `<span class="badge inj">사출품</span>`;

    let h = `<div class="view-head"><h1>${res.name}</h1>${badge}
      <span class="sub">${res.material_code||""} · 월물량 ${won(res.volume)} · 일Capa ${won(res.capa,1)}</span>
      <div class="spacer"></div>
      <button class="btn btn-sm" onclick="App.duplicateProduct('${kind}','${id}')">⧉ 복제</button>
      <button class="btn btn-sm" onclick="App.deleteProduct('${kind}','${id}')">🗑 삭제</button>
      <button class="btn btn-sm" onclick="App.exportExcel()">⬇ 엑셀</button></div>`;

    // 품목 정보 (편집)
    h += `<div class="card"><div class="card-head"><h3>품목 정보</h3></div><div class="card-body"><div class="pgrid">`;
    h += field("품목명", bindText(kind,id,"name",proj.name));
    h += field("자재코드", bindText(kind,id,"material_code",proj.material_code||""));
    h += field("모델/모듈", bindText(kind,id,"module",proj.module||""));
    h += field("고객사", bindText(kind,id,"customer",proj.customer||""));
    h += `</div></div></div>`;

    // 생산 파라미터
    h += `<div class="card"><div class="card-head"><h3>생산 파라미터</h3></div><div class="card-body"><div class="pgrid">`;
    const p = proj.production;
    if (isAssy) {
      h += field("라인수", bind(kind,id,"production.lines",p.lines));
    } else {
      h += field("사출기 톤수", tonSelect(kind,id,p.ton,S.master));
      h += field("금형 Cavity", bind(kind,id,"production.cavity",p.cavity));
    }
    h += field("Cycle Time(초)", bind(kind,id,"production.cycle_time",p.cycle_time));
    h += field("작업효율", bind(kind,id,"production.efficiency",p.efficiency));
    h += field("작업시간/교대", bind(kind,id,"production.shift_hours",p.shift_hours));
    h += field("교대수", bind(kind,id,"production.shifts",p.shifts));
    h += field("근무일/월", bind(kind,id,"production.work_days",p.work_days));
    h += field("월 물량", bind(kind,id,"volume",proj.volume));
    h += `</div></div></div>`;

    // 재료비 A
    h += sectionBar("재료비 (A)", res.material_total);
    h += `<div class="card"><div class="card-body"><div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th style="width:22%">항목</th><th>재료/업체</th><th class="c">유형</th><th class="r">중량/수량</th>
      <th class="r">단가</th><th class="r">금액</th><th></th></tr></thead><tbody>`;
    const partOpts = (sel) => S.result.parts.map(p =>
      `<option value="${p.id}" ${p.id===sel?"selected":""}>${p.name}</option>`).join("");
    proj.materials.forEach((m, i) => {
      const rm = res.materials[i] || {};
      const kinds = isAssy
        ? {qty:"단가(원/EA)", busbar:"버스바", part_ref:"사출품", net_weight:"사출원재료"}
        : {net_weight:"사출원재료", qty:"단가(원/EA)"};
      const kindSel = `<select class="cell" data-matkind="${kind}:${id}:${i}">` +
        Object.entries(kinds).map(([k,l]) => `<option value="${k}" ${m.kind===k?"selected":""}>${l}</option>`).join("") +
        `</select>`;
      // 중량/수량 · 단가 필드 (유형별)
      let qtyField, priceField, nameField;
      if (m.kind === "net_weight") {
        qtyField = bind(kind,id,`materials.${i}.weight_g`,m.weight_g ?? 0);
        priceField = bind(kind,id,`materials.${i}.unit_price`,m.unit_price ?? 0);
        nameField = bindText(kind,id,`materials.${i}.name`,m.name);
      } else if (m.kind === "busbar") {
        qtyField = bind(kind,id,`materials.${i}.qty`,m.qty ?? 0);
        priceField = bind(kind,id,`materials.${i}.base_price`,m.base_price ?? 0);
        nameField = bindText(kind,id,`materials.${i}.name`,m.name);
      } else if (m.kind === "part_ref") {
        qtyField = bind(kind,id,`materials.${i}.qty`,m.qty ?? 1);
        priceField = `<span class="muted num">${won(rm.unit_price,2)}</span>`;
        nameField = `<select class="cell text" data-str data-bind="${kind}:${id}:materials.${i}.ref">${partOpts(m.ref)}</select>`;
      } else { // qty
        qtyField = bind(kind,id,`materials.${i}.qty`,m.qty ?? 0);
        priceField = bind(kind,id,`materials.${i}.unit_price`,m.unit_price ?? 0);
        nameField = bindText(kind,id,`materials.${i}.name`,m.name);
      }
      h += `<tr><td>${nameField}</td>
        <td>${bindText(kind,id,`materials.${i}.sub`,m.sub||"")}</td>
        <td class="c">${kindSel}</td>
        <td class="r">${qtyField}</td><td class="r">${priceField}</td>
        <td class="calc">${won(rm.amount,2)}</td>
        <td><span class="row-del" data-del="${kind}:${id}:materials:${i}">✕</span></td></tr>`;
    });
    h += `<tr class="total"><td colspan="5">재료비 합계 (A)</td><td class="calc">${won(res.material_total,2)}</td><td></td></tr>`;
    h += `</tbody></table></div>
      <button class="btn btn-sm add-row" data-add="${kind}:${id}:material">+ 재료 행 추가</button></div></div>`;

    // 노무비 B
    h += sectionBar("노무비 (B)", res.labor.total);
    h += `<div class="card"><div class="card-body"><div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th style="width:40%">공정명</th><th class="r">투입인원</th><th class="r">인원×교대</th><th class="r">금액</th><th></th></tr></thead><tbody>`;
    proj.labor.forEach((lp, i) => {
      const rl = res.labor.processes[i] || {};
      h += `<tr><td>${bindText(kind,id,`labor.${i}.name`,lp.name)}</td>
        <td class="r">${bind(kind,id,`labor.${i}.workers`,lp.workers)}</td>
        <td class="calc">${won(rl.worker_shifts,2)}</td><td class="calc">${won(rl.amount,2)}</td>
        <td><span class="row-del" data-del="${kind}:${id}:labor:${i}">✕</span></td></tr>`;
    });
    h += `<tr><td colspan="3">간접노무비 (직접 × ${pct(res.labor.indirect_rate,0)})</td><td class="calc">${won(res.labor.indirect,2)}</td><td></td></tr>`;
    h += `<tr class="total"><td colspan="3">노무비 합계 (B)</td><td class="calc">${won(res.labor.total,2)}</td><td></td></tr>`;
    h += `</tbody></table></div>
      <button class="btn btn-sm add-row" data-add="${kind}:${id}:labor">+ 공정 행 추가</button></div></div>`;

    // 제조경비 C
    h += sectionBar("제조경비 (C)", res.overhead_total);
    h += `<div class="card"><div class="card-body"><div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th style="width:26%">항목</th><th class="r">금액</th><th>산출근거</th></tr></thead><tbody>`;
    for (const o of res.overhead) {
      h += `<tr><td>${o.name}</td><td class="calc">${won(o.amount,2)}</td><td class="basis">${o.basis||""}</td></tr>`;
    }
    h += `<tr class="total"><td>제조경비 합계 (C)</td><td class="calc">${won(res.overhead_total,2)}</td><td></td></tr>`;
    h += `</tbody></table></div></div></div>`;

    // 제조원가 D + 구성비
    h += sectionBar("제조원가 (D) = A + B + C + LOSS", res.manufacturing_cost);
    h += `<div class="card"><div class="card-body">
      <div class="pgrid" style="margin-bottom:14px">
        ${field("LOSS율", bind(kind,id,"overhead.loss_rate",proj.overhead.loss_rate))}
      </div>`;
    const cp = res.composition;
    h += `<div class="comp-bar">
      <span class="comp-mat" style="flex:${cp.material||0.001}" title="재료비">${pct(cp.material,0)}</span>
      <span class="comp-lab" style="flex:${cp.labor||0.001}" title="노무비">${cp.labor>0.04?pct(cp.labor,0):""}</span>
      <span class="comp-oh" style="flex:${cp.overhead||0.001}" title="제조경비">${cp.overhead>0.04?pct(cp.overhead,0):""}</span>
      <span class="comp-loss" style="flex:${cp.loss||0.001}" title="LOSS"></span></div>
      <div class="comp-legend">
        <span><i class="comp-mat"></i>재료비 ${won(res.material_total)} (${pct(cp.material)})</span>
        <span><i class="comp-lab"></i>노무비 ${won(res.labor.total)} (${pct(cp.labor)})</span>
        <span><i class="comp-oh"></i>제조경비 ${won(res.overhead_total)} (${pct(cp.overhead)})</span>
        <span><i class="comp-loss"></i>LOSS ${won(res.loss)} (${pct(cp.loss)})</span></div>`;
    h += `<div style="margin-top:14px;font-size:22px;font-weight:700">제조원가 <span class="num" style="color:var(--navy)">${won(res.manufacturing_cost,2)} 원</span></div>`;
    h += `</div></div>`;

    // 조립품: 판가
    if (isAssy) {
      const q = res.quote;
      h += sectionBar("판가 산출", q.price);
      h += `<div class="card"><div class="card-body">
        <div class="pgrid" style="margin-bottom:14px">
          ${field("관리비율", bind(kind,id,"quote.admin_rate",proj.quote.admin_rate))}
          ${field("영업이익율", bind(kind,id,"quote.profit_rate",proj.quote.profit_rate))}
        </div>
        <div class="tbl-wrap"><table class="tbl"><tbody>
        <tr><td>제조원가</td><td class="calc" style="width:180px">${won(res.manufacturing_cost,2)}</td></tr>
        <tr><td>관리비 (${pct(q.admin_rate)})</td><td class="calc">${won(q.admin_cost,2)}</td></tr>
        <tr><td>영업이익 (${pct(q.profit_rate)})</td><td class="calc">${won(q.profit,2)}</td></tr>
        <tr><td>운반비</td><td class="calc">${won(q.transport,2)}</td></tr>
        <tr class="grand"><td>판 가</td><td class="num r">${won(q.price,2)} 원</td></tr>
        </tbody></table></div></div></div>`;
    }
    return h;
  }

  // ---- 마스터 데이터 ----
  function master(S) {
    const cfg = S.master.config;
    let h = `<div class="view-head"><h1>마스터 · 기준</h1><span class="sub">전사 공통 상수/율 · 설비/인건비 기준표 (버전 ${cfg.version})</span></div>`;
    h += `<div class="card"><div class="card-head"><h3>공통 상수/율</h3><span class="sub">변경 시 전 품목 재계산</span></div>
      <div class="card-body"><div class="pgrid">
      ${field("2교대 일당(원)", cfgBind("labor.rate_per_day", cfg.labor.rate_per_day))}
      ${field("간접노무비율", cfgBind("labor.indirect_rate", cfg.labor.indirect_rate))}
      ${field("복리후생율", cfgBind("overhead_rates.welfare_rate", cfg.overhead_rates.welfare_rate))}
      ${field("소모품율", cfgBind("overhead_rates.consumable_rate", cfg.overhead_rates.consumable_rate))}
      ${field("기타율", cfgBind("overhead_rates.etc_rate", cfg.overhead_rates.etc_rate))}
      ${field("버스바 적용율", cfgBind("material.busbar_discount", cfg.material.busbar_discount))}
      ${field("전력단가(원/kW)", cfgBind("utility.power_unit_price", cfg.utility.power_unit_price))}
      ${field("1회 운임(원)", cfgBind("transport.freight_per_trip", cfg.transport.freight_per_trip))}
      </div><p class="hint">※ 공통 상수는 관리자 관리 항목입니다. 변경분은 저장 시 견적 스냅샷에 함께 기록됩니다.</p></div></div>`;

    // 설비 기준표
    h += `<div class="card"><div class="card-head"><h3>설비 기준표 (사출기 톤수별)</h3></div>
      <div class="card-body"><div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th class="r">톤수</th><th class="r">전력비/일</th><th class="r">건물감가/일</th><th class="r">투자비합계</th>
      <th class="r">투자비감가/일</th><th class="r">수선비/일</th><th class="r">퍼지(kg)</th><th class="r">Setting</th></tr></thead><tbody>`;
    for (const e of S.master.equipment) {
      h += `<tr><td class="r"><b>${e.ton}</b></td><td class="r">${won(e.power_cost_day)}</td><td class="r">${won(e.building_dep_day)}</td>
        <td class="r">${won(e.invest_total)}</td><td class="r">${won(e.invest_dep_day)}</td><td class="r">${won(e.repair_day)}</td>
        <td class="r">${e.purge_kg}</td><td class="r">${won(e.setting_cost)}</td></tr>`;
    }
    h += `</tbody></table></div></div></div>`;

    // 인건비표
    h += `<div class="card"><div class="card-head"><h3>근무형태별 인건비</h3></div>
      <div class="card-body"><div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>근무형태</th><th class="r">일 인건비</th><th class="r">월 추정</th><th class="r">연간총액</th></tr></thead><tbody>`;
    for (const k of Object.keys(S.master.labor)) {
      const l = S.master.labor[k];
      h += `<tr><td>${l.label}</td><td class="r">${won(l.daily_wage)}</td><td class="r">${won(l.monthly)}</td><td class="r">${won(l.annual)}</td></tr>`;
    }
    h += `</tbody></table></div></div></div>`;
    return h;
  }

  // ---- helpers ----
  const field = (label, input) => `<div class="field"><label>${label}</label>${input}</div>`;
  const cfgBind = (path, val) => `<input data-cfg="${path}" value="${val}">`;
  const sectionBar = (label, amt) => `<div class="section-bar">${label}<span class="amt">${won(amt,2)} 원</span></div>`;
  function tonSelect(kind, id, ton, master) {
    let o = master.equipment.map(e => `<option value="${e.ton}" ${e.ton===ton?"selected":""}>${e.ton} 톤</option>`).join("");
    return `<select class="cell" data-bind="${kind}:${id}:production.ton">${o}</select>`;
  }

  function render(S) {
    const v = S.activeView;
    if (v.type === "summary") return summary(S);
    if (v.type === "scenario") return scenario(S);
    if (v.type === "competitor") return competitor(S);
    if (v.type === "bep") return bep(S);
    if (v.type === "master") return master(S);
    if (v.type === "detail") return detail(S, v.kind, v.id);
    return summary(S);
  }
  return { render };
})();
