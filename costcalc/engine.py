"""
원가 계산 엔진
==============
견적 검토 엑셀의 '제조원가 테이블' 계산 로직을 그대로 재현한다.

계산 구조 (상향식):
    재료비(A) + 노무비(B) + 제조경비(C) + LOSS = 제조원가(D)
    판가 = 제조원가 × (1 + 관리비율 + 영업이익율) + 운반비

2단계 롤업:
    사출품 제조원가  →  조립품 재료비(A)로 투입  →  조립품 제조원가  →  판가

모든 결과는 라인아이템 단위로 노출하여(산출근거 드릴다운) 검증·감사에 대비한다.
결과 dict 의 금액 단위는 원(₩), 개당 기준.
"""
from __future__ import annotations
from typing import Dict, List, Optional

from .standards import MasterData


def _round(x, n=6):
    return round(x, n) if isinstance(x, (int, float)) else x


# ---------------------------------------------------------------------------
# 공통: 생산 Capa
# ---------------------------------------------------------------------------
def daily_capa(prod: dict) -> float:
    """일 Capa[설비당] = (작업시간/교대 × 교대수) × 3600 ÷ CT(초) × 효율 × (cavity|라인수)"""
    ct = prod.get("cycle_time", 0)
    if not ct or ct <= 0:
        raise ValueError("Cycle Time(초)은 0보다 커야 합니다.")
    hours_per_day = prod["shift_hours"] * prod["shifts"]
    mult = prod.get("cavity", prod.get("lines", 1))
    capa = hours_per_day * 3600 / ct * prod["efficiency"] * mult
    if capa <= 0:
        raise ValueError("일 Capa가 0 이하입니다. 작업시간·교대수·효율·cavity/라인수를 확인하세요.")
    return capa


# ---------------------------------------------------------------------------
# 재료비(A)
# ---------------------------------------------------------------------------
def _material_lines(materials: List[dict], master: MasterData,
                    part_costs: Optional[Dict[str, float]] = None):
    cfg = master.config
    discount = cfg["material"]["busbar_discount"]
    lines = []
    for m in materials:
        kind = m["kind"]
        if kind == "net_weight":                       # 사출 원재료: 중량(g) × 단가(원/kg) ÷ 1000
            unit = m["unit_price"]
            amount = m["weight_g"] * unit / 1000
            basis = f'{m["weight_g"]}g × {unit:,}원/kg ÷ 1000'
        elif kind == "qty":                            # Insert/지정도급: 수량 × 단가(원/EA)
            unit = m["unit_price"]
            amount = m["qty"] * unit
            basis = f'{m["qty"]} × {unit:,}원'
        elif kind == "busbar":                          # 버스바: 수량 × (기준단가 × 0.9)
            unit = m["base_price"] * discount
            amount = m["qty"] * unit
            basis = f'{m["qty"]} × ({m["base_price"]:,} × {discount})'
        elif kind == "part_ref":                        # 사출품 롤업원가 × 수량
            pc = part_costs or {}
            if m.get("ref") not in pc:
                raise ValueError(f"참조 사출품 '{m.get('ref')}'을(를) 찾을 수 없습니다 "
                                 f"(재료: {m.get('name','')}).")
            ref_cost = pc[m["ref"]]
            unit = ref_cost
            amount = m["qty"] * ref_cost
            basis = f'{m["qty"]} × 사출품원가 {ref_cost:,.2f}'
        else:
            raise ValueError(f"알 수 없는 재료 유형: {kind}")
        lines.append({"name": m["name"], "sub": m.get("sub", ""), "kind": kind,
                      "grade": m.get("grade", ""), "unit_price": _round(unit, 4),
                      "amount": _round(amount, 4), "basis": basis,
                      "note": m.get("note", "")})
    return lines


def _first_net_unit_price(materials: List[dict]) -> float:
    for m in materials:
        if m["kind"] == "net_weight":
            return m["unit_price"]
    return 0.0


# ---------------------------------------------------------------------------
# 노무비(B)
# ---------------------------------------------------------------------------
def _labor_block(processes: List[dict], prod: dict, master: MasterData):
    cfg = master.config
    rate = cfg["labor"]["rate_per_day"]
    indirect_rate = cfg["labor"]["indirect_rate"]
    capa = daily_capa(prod)
    shifts = prod["shifts"]
    total_workers = sum(p["workers"] for p in processes)
    worker_shifts = total_workers * shifts
    direct = worker_shifts * rate / capa   # capa는 daily_capa에서 이미 >0 보장
    indirect = direct * indirect_rate
    proc_lines = []
    for p in processes:
        ws = p["workers"] * shifts
        amt = ws * rate / capa
        proc_lines.append({"name": p["name"], "workers": p["workers"],
                           "worker_shifts": _round(ws, 4), "amount": _round(amt, 4)})
    return {
        "processes": proc_lines,
        "total_workers": _round(total_workers, 4),
        "worker_shifts": _round(worker_shifts, 4),
        "direct": _round(direct, 4),
        "indirect": _round(indirect, 4),
        "indirect_rate": indirect_rate,
        "total": _round(direct + indirect, 4),
    }


# ---------------------------------------------------------------------------
# 포장비 / 운송비 (조립품)
# ---------------------------------------------------------------------------
def packaging_cost(pk: dict) -> dict:
    danpla = pk["danpla_box_price"] / pk["danpla_returns"] / pk["pack_unit"]
    vinyl = (pk["vinyl_numer"] / pk["vinyl_denom"]) / pk["vinyl_pack_unit"]
    netrong = pk["netrong_price"] * pk["netrong_qty"] / pk["pack_unit"]
    pallet = pk["pallet_price"] / (pk["pallet_pack_factor"] * pk["pack_unit"]) / pk["pallet_div"]
    total = danpla + vinyl + netrong + pallet
    return {"danpla": _round(danpla, 4), "vinyl": _round(vinyl, 6),
            "netrong": _round(netrong, 4), "pallet": _round(pallet, 4),
            "total": _round(total, 4)}


def transport_cost(tp: dict, master: MasterData) -> dict:
    cfg = master.config["transport"]
    total_load = tp["box_qty"] * cfg["box_per_5ton"]
    usable = total_load * cfg["load_factor"]
    per_unit = cfg["freight_per_trip"] / usable if usable else 0.0
    return {"total_load": total_load, "usable": _round(usable, 2),
            "freight_per_trip": cfg["freight_per_trip"], "per_unit": _round(per_unit, 4)}


# ---------------------------------------------------------------------------
# 사출품(injection) 제조원가
# ---------------------------------------------------------------------------
def calc_injection(part: dict, master: MasterData) -> dict:
    cfg = master.config
    prod = part["production"]
    ov = part["overhead"]
    capa = daily_capa(prod)
    equip = master.equipment_by_ton(prod["ton"])

    mats = _material_lines(part["materials"], master)
    material_total = sum(m["amount"] for m in mats)

    labor = _labor_block(part["labor"], prod, master)
    labor_total = labor["total"]

    dep = cfg["depreciation"]
    r = cfg["overhead_rates"]
    dedicated_sum = sum(e["price"] for e in ov["dedicated_equipment"])
    dedicated_base = ov["dedicated_base_monthly"] * dep["months_per_year"] * dep["dedicated_years"]
    net_price = _first_net_unit_price(part["materials"])

    equip_dep = equip["invest_dep_day"] / capa
    dedicated_dep = dedicated_sum / dedicated_base if dedicated_base else 0.0
    building = equip["building_dep_day"] / capa
    welfare = labor_total * r["welfare_rate"]
    utility = equip["power_cost_day"] / capa
    consumable = (material_total + labor_total) * r["consumable_rate"]
    repair = equip["repair_day"] / capa
    setting_daily = (equip["setting_cost"] + net_price * equip["purge_kg"]
                     + material_total * cfg["material"]["setting_material_multiplier"])
    setting = setting_daily / part["volume"] if part["volume"] else 0.0
    etc = (material_total + labor_total) * r["etc_rate"]

    oh_lines = [
        {"name": "설비 감가[사출,부대장치]", "amount": _round(equip_dep, 4),
         "basis": f'투자비감가 {equip["invest_dep_day"]:,.0f}원/일 ÷ 일Capa {capa:,.1f}'},
        {"name": "전용 설비", "amount": _round(dedicated_dep, 4),
         "basis": f'{dedicated_sum:,}원 ÷ ({ov["dedicated_base_monthly"]:,}/월×12×3년)'},
        {"name": "건물 감가", "amount": _round(building, 4),
         "basis": f'{equip["building_dep_day"]:,.0f}원/일 ÷ 일Capa'},
        {"name": "복리후생비", "amount": _round(welfare, 4),
         "basis": f'노무비 × {r["welfare_rate"]:.0%}'},
        {"name": "수도광열비", "amount": _round(utility, 4),
         "basis": f'{equip["power_cost_day"]:,.0f}원/일 ÷ 일Capa'},
        {"name": "소모품", "amount": _round(consumable, 4),
         "basis": f'(재료비+노무비) × {r["consumable_rate"]:.1%}'},
        {"name": "수선비", "amount": _round(repair, 4),
         "basis": f'{equip["repair_day"]:,.0f}원/일 ÷ 일Capa'},
        {"name": "Setting 비용", "amount": _round(setting, 4),
         "basis": f'(Setting {equip["setting_cost"]:,.0f} + 단가×퍼지 + 재료비×5) ÷ 물량'},
        {"name": "기타", "amount": _round(etc, 4),
         "basis": f'(재료비+노무비) × {r["etc_rate"]:.1%}'},
    ]
    overhead_total = sum(o["amount"] for o in oh_lines)

    subtotal = material_total + labor_total + overhead_total
    loss_rate = ov["loss_rate"]
    loss = subtotal * loss_rate
    mfg = subtotal + loss

    return {
        "id": part["id"], "name": part["name"], "kind": "injection",
        "material_code": part.get("material_code", ""),
        "capa": _round(capa, 4), "volume": part["volume"],
        "materials": mats, "material_total": _round(material_total, 4),
        "labor": labor,
        "overhead": oh_lines, "overhead_total": _round(overhead_total, 4),
        "loss_rate": loss_rate, "loss": _round(loss, 4),
        "manufacturing_cost": _round(mfg, 4),
        "composition": {
            "material": _round(material_total / mfg, 6) if mfg else 0,
            "labor": _round(labor_total / mfg, 6) if mfg else 0,
            "overhead": _round(overhead_total / mfg, 6) if mfg else 0,
            "loss": _round(loss / mfg, 6) if mfg else 0,
        },
    }


# ---------------------------------------------------------------------------
# 조립품(assembly) 제조원가 + 판가
# ---------------------------------------------------------------------------
def calc_assembly(assy: dict, master: MasterData, part_costs: Dict[str, float]) -> dict:
    cfg = master.config
    prod = assy["production"]
    ov = assy["overhead"]
    capa = daily_capa(prod)

    mats = _material_lines(assy["materials"], master, part_costs)
    material_total = sum(m["amount"] for m in mats)

    labor = _labor_block(assy["labor"], prod, master)
    labor_total = labor["total"]

    dep = cfg["depreciation"]
    r = cfg["overhead_rates"]
    util = cfg["utility"]
    dedicated_sum = sum(e["price"] for e in ov["dedicated_equipment"])
    dedicated_base = ov["dedicated_base_monthly"] * dep["months_per_year"] * dep["dedicated_years"]

    dedicated_dep = dedicated_sum / dedicated_base if dedicated_base else 0.0
    building_day = ov["area_m2"] * cfg["building"]["cost_per_m2_day"]
    building = building_day / capa
    welfare = labor_total * r["welfare_rate"]
    utility_day = ov["power_kw"] * util["power_unit_price"] * util["assembly_hours"] * util["assembly_factor"]
    utility = utility_day / capa
    consumable = (material_total + labor_total) * r["consumable_rate"]
    repair = dedicated_dep * r["repair_rate_on_invest"]
    pack = packaging_cost(ov["packaging"])
    etc = (material_total + labor_total) * r["etc_rate"]

    oh_lines = [
        {"name": "전용 설비", "amount": _round(dedicated_dep, 4),
         "basis": f'{dedicated_sum:,}원 ÷ ({ov["dedicated_base_monthly"]:,}/월×12×3년)'},
        {"name": "건물 감가", "amount": _round(building, 4),
         "basis": f'{ov["area_m2"]}㎡ × {cfg["building"]["cost_per_m2_day"]:,.1f}원/㎡·일 ÷ 일Capa'},
        {"name": "복리후생비", "amount": _round(welfare, 4),
         "basis": f'노무비 × {r["welfare_rate"]:.0%}'},
        {"name": "수도광열비", "amount": _round(utility, 4),
         "basis": f'{ov["power_kw"]}kW × 180 × 12 × 0.5 ÷ 일Capa'},
        {"name": "소모품", "amount": _round(consumable, 4),
         "basis": f'(재료비+노무비) × {r["consumable_rate"]:.1%}'},
        {"name": "수선비", "amount": _round(repair, 4),
         "basis": f'전용설비감가 × {r["repair_rate_on_invest"]:.0%}'},
        {"name": "포장비", "amount": _round(pack["total"], 4),
         "basis": f'단프라 {pack["danpla"]:.1f}+비닐+니트롱지+파렛트 {pack["pallet"]:.1f}'},
        {"name": "기타", "amount": _round(etc, 4),
         "basis": f'(재료비+노무비) × {r["etc_rate"]:.1%}'},
    ]
    overhead_total = sum(o["amount"] for o in oh_lines)

    subtotal = material_total + labor_total + overhead_total
    loss_rate = ov["loss_rate"]
    loss = subtotal * loss_rate
    mfg = subtotal + loss

    transport = transport_cost(ov["transport"], master)
    q = assy["quote"]
    price = calc_price(mfg, q["admin_rate"], q["profit_rate"], transport["per_unit"])

    return {
        "id": assy["id"], "name": assy["name"], "kind": "assembly",
        "material_code": assy.get("material_code", ""),
        "capa": _round(capa, 4), "volume": assy["volume"],
        "materials": mats, "material_total": _round(material_total, 4),
        "labor": labor,
        "overhead": oh_lines, "overhead_total": _round(overhead_total, 4),
        "packaging": pack, "transport": transport,
        "loss_rate": loss_rate, "loss": _round(loss, 4),
        "manufacturing_cost": _round(mfg, 4),
        "quote": {
            "admin_rate": q["admin_rate"], "profit_rate": q["profit_rate"],
            "admin_cost": _round(mfg * q["admin_rate"], 4),
            "profit": _round(mfg * q["profit_rate"], 4),
            "transport": transport["per_unit"],
            "price": _round(price, 4),
        },
        "quote_lines": assy.get("quote_lines", []),
        "composition": {
            "material": _round(material_total / mfg, 6) if mfg else 0,
            "labor": _round(labor_total / mfg, 6) if mfg else 0,
            "overhead": _round(overhead_total / mfg, 6) if mfg else 0,
            "loss": _round(loss / mfg, 6) if mfg else 0,
        },
    }


def calc_price(mfg_cost: float, admin_rate: float, profit_rate: float,
               transport: float = 0.0) -> float:
    """판가 = 제조원가 × (1 + 관리비율 + 영업이익율) + 운반비"""
    return mfg_cost * (1 + admin_rate + profit_rate) + transport


# ---------------------------------------------------------------------------
# 프로젝트 전체 계산 (사출품 → 조립품 롤업)
# ---------------------------------------------------------------------------
def calc_project(project: dict, master: MasterData) -> dict:
    part_results = {}
    part_costs = {}
    for part in project["parts"]:
        res = calc_injection(part, master)
        part_results[part["id"]] = res
        part_costs[part["id"]] = res["manufacturing_cost"]

    assy_results = []
    for assy in project["assemblies"]:
        assy_results.append(calc_assembly(assy, master, part_costs))

    return {
        "project": project.get("project", {}),
        "parts": list(part_results.values()),
        "assemblies": assy_results,
    }
