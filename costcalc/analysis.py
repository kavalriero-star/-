"""
견적 분석 모듈
==============
- 판가 민감도 매트릭스 (영업이익율 × 관리비율)
- 경쟁사 판가 대비 비교
- 손익분기(BEP) / 공헌이익  (고정비·변동비 재분류 반영)
- 프로젝트 견적 요약 (매출/월, 매출/년)

원가 도메인 검토 반영:
  · 노무비의 고정/변동 성격을 파라미터로 분리(cost_behavior)하여 BEP 신뢰성 확보
  · 감가상각·건물감가·수선비는 고정비, 재료/복리후생/수도광열/소모품/포장/기타는 변동비로 기본 분류
"""
from __future__ import annotations
from typing import Dict, List

from .engine import calc_price
from .standards import MasterData

# 제조경비 항목별 고정/변동 분류 (기본값; 마스터 config["overhead_behavior"]로 재정의 가능)
# 감가상각·수선비만 기간 고정비, 나머지(재료·노무 비례 항목)는 변동비로 분류.
OVERHEAD_BEHAVIOR = {
    "설비 감가[사출,부대장치]": "fixed",
    "전용 설비": "fixed",
    "건물 감가": "fixed",
    "수선비": "fixed",
    "복리후생비": "variable",
    "수도광열비": "variable",
    "소모품": "variable",
    "Setting 비용": "variable",
    "포장비": "variable",
    "기타": "variable",   # (재료+노무)×0.5% → 변동
}


def price_matrix(mfg_cost: float, transport: float, master: MasterData) -> dict:
    """영업이익율 × 관리비율 조합별 판가 매트릭스."""
    q = master.config["quote"]
    profits = q["scenario_profit_rates"]
    admins = q["scenario_admin_rates"]
    rows = []
    for adm in admins:
        cells = []
        for pr in profits:
            price = calc_price(mfg_cost, adm, pr, transport)
            cells.append({"admin_rate": adm, "profit_rate": pr,
                          "price": round(price, 2),
                          "profit_amount": round(mfg_cost * pr, 2),
                          "admin_amount": round(mfg_cost * adm, 2)})
        rows.append({"admin_rate": adm, "cells": cells})
    return {"profit_rates": profits, "admin_rates": admins, "rows": rows}


def competitor_compare(assy_result: dict) -> List[dict]:
    """견적가 vs 경쟁사(신흥정밀) 양산판가 비교."""
    out = []
    price = assy_result["quote"]["price"]
    for line in assy_result.get("quote_lines", []):
        comp = line.get("competitor_price")
        diff = price - comp if comp else None
        pct = (diff / comp) if (comp and comp) else None
        out.append({
            "customer": line.get("customer", ""), "type": line.get("type", ""),
            "material_code": line.get("material_code", ""), "name": line.get("name", ""),
            "our_price": round(price, 2), "competitor_price": comp,
            "diff": round(diff, 2) if diff is not None else None,
            "diff_pct": round(pct, 4) if pct is not None else None,
        })
    return out


def bep_analysis(assy_result: dict, master: MasterData,
                 labor_fixed_ratio: float = 0.0) -> dict:
    """
    손익분기 분석. 개당 기준으로 고정비/변동비를 분해한 뒤 물량으로 환산.

    labor_fixed_ratio : 노무비 중 고정비(상주인력) 비율 (0=전액 변동, 1=전액 고정).
                        원본 엑셀은 전액 변동 가정이므로 기본 0.
    """
    volume = assy_result["volume"]
    price = assy_result["quote"]["price"]
    behavior = dict(OVERHEAD_BEHAVIOR)
    behavior.update(master.config.get("overhead_behavior", {}))

    # 개당 변동비/고정비 분해
    material = assy_result["material_total"]          # 변동비
    labor = assy_result["labor"]["total"]
    labor_fixed = labor * labor_fixed_ratio
    labor_var = labor - labor_fixed

    oh_fixed = oh_var = 0.0
    for o in assy_result["overhead"]:
        if behavior.get(o["name"], "variable") == "fixed":
            oh_fixed += o["amount"]
        else:
            oh_var += o["amount"]

    loss = assy_result["loss"]                        # 변동비(재료 스크랩 성격)
    admin = assy_result["quote"]["admin_cost"]        # 제조원가 비례 → 변동비
    transport = assy_result["quote"]["transport"]     # 변동비

    unit_var = material + labor_var + oh_var + loss + transport + admin
    unit_fixed = labor_fixed + oh_fixed
    # 주의: unit_fixed × volume 은 '계획물량 기준 단위원가'에서 역산한 근사 월고정비.
    #       감가상각 총액이 물량과 무관하게 일정하다는 가정하의 손익분기 추정치이다.

    contribution = price - unit_var                   # 개당 공헌이익
    total_fixed = unit_fixed * volume                 # 월 고정비 총액
    cm_ratio = contribution / price if price else 0.0
    bep_qty = total_fixed / contribution if contribution > 0 else None
    bep_sales = bep_qty * price if bep_qty else None

    return {
        "volume": volume, "price": round(price, 2),
        "unit_variable": round(unit_var, 2),
        "unit_fixed": round(unit_fixed, 2),
        "contribution": round(contribution, 2),
        "cm_ratio": round(cm_ratio, 4),
        "monthly_fixed_total": round(total_fixed, 0),
        "bep_qty": round(bep_qty, 0) if bep_qty else None,
        "bep_sales": round(bep_sales, 0) if bep_sales else None,
        "labor_fixed_ratio": labor_fixed_ratio,
    }


def quote_summary(assemblies: List[dict]) -> dict:
    """프로젝트 전체 견적 요약: 품목(견적라인)별 판가·매출/월·매출/년 + 합계."""
    lines = []
    tot_month = tot_year = 0.0
    for a in assemblies:
        price = a["quote"]["price"]
        for ln in a.get("quote_lines", []):
            vol = ln.get("volume", 0)
            sales_m = price * vol
            sales_y = sales_m * 12
            tot_month += sales_m
            tot_year += sales_y
            lines.append({
                "module": a["name"], "customer": ln.get("customer", ""),
                "type": ln.get("type", ""), "material_code": ln.get("material_code", ""),
                "name": ln.get("name", ""),
                "admin_rate": a["quote"]["admin_rate"], "profit_rate": a["quote"]["profit_rate"],
                "profit_amount": a["quote"]["profit"],
                "mfg_cost": a["manufacturing_cost"], "price": round(price, 2),
                "volume": vol, "sales_month": round(sales_m, 0), "sales_year": round(sales_y, 0),
            })
    return {"lines": lines, "total_month": round(tot_month, 0),
            "total_year": round(tot_year, 0)}
