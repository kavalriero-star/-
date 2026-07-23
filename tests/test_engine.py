"""
원가 계산 엔진 검증 테스트
==========================
견적 검토 엑셀(SDI U6A5/U8A1 2600723 R6)의 '제조원가 테이블' 실제 산출값과
엔진 계산 결과가 일치하는지 검증한다. (전문가 검토 단계의 '수치 재현' 근거)
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from costcalc import MasterData, load_project
from costcalc.engine import (
    calc_injection, calc_assembly, calc_project, calc_price,
    daily_capa, packaging_cost, transport_cost,
)

TOL = 0.5  # 원 단위 허용오차(부동소수/반올림)

# 엑셀에서 확인된 제조원가 목표값
PART_TARGETS = {
    "part_inner_cover_a": 4374.015,
    "part_inner_cover_b": 4374.056,
    "part_holder_busbar_a": 5378.296,
    "part_holder_busbar_b": 5377.378,
}
ASSY_TARGETS = {
    "assy_inner_cover_a": 16914.933,
    "assy_inner_cover_b": 16936.355,
    "assy_holder_busbar_a": 19866.180,
    "assy_holder_busbar_b": 19886.665,
}
# 엑셀 요약(1차 견적) 판가
PRICE_TARGETS = {
    "assy_inner_cover_a": 19153.964,
    "assy_inner_cover_b": 19177.636,
    "assy_holder_busbar_a": 23209.739,
    "assy_holder_busbar_b": 23233.194,
}


@pytest.fixture(scope="module")
def master():
    return MasterData()


@pytest.fixture(scope="module")
def project():
    return load_project()


@pytest.fixture(scope="module")
def result(project, master):
    return calc_project(project, master)


# -- Capa / 포장 / 운송 기초식 -------------------------------------------------
def test_daily_capa_injection():
    prod = {"cavity": 1, "cycle_time": 50, "efficiency": 0.9,
            "shift_hours": 12, "shifts": 2}
    assert daily_capa(prod) == pytest.approx(1555.2, abs=0.01)


def test_daily_capa_assembly():
    prod = {"lines": 1, "cycle_time": 15, "efficiency": 0.9,
            "shift_hours": 10.5, "shifts": 1}
    assert daily_capa(prod) == pytest.approx(2268, abs=0.01)


def test_packaging_cost(master):
    from costcalc.data.build_seed import DEFAULT_PACKAGING
    pk = packaging_cost(DEFAULT_PACKAGING)
    assert pk["total"] == pytest.approx(188.393, abs=0.01)


def test_transport_cost(master):
    from costcalc.data.build_seed import DEFAULT_TRANSPORT
    tp = transport_cost(DEFAULT_TRANSPORT, master)
    assert tp["per_unit"] == pytest.approx(462.963, abs=0.01)


# -- 사출품 제조원가 재현 -----------------------------------------------------
@pytest.mark.parametrize("pid,target", PART_TARGETS.items())
def test_injection_manufacturing_cost(project, master, pid, target):
    part = next(p for p in project["parts"] if p["id"] == pid)
    res = calc_injection(part, master)
    assert res["manufacturing_cost"] == pytest.approx(target, abs=TOL), \
        f'{pid}: {res["manufacturing_cost"]} != {target}'


# -- 조립품 제조원가 재현 -----------------------------------------------------
@pytest.mark.parametrize("aid,target", ASSY_TARGETS.items())
def test_assembly_manufacturing_cost(result, aid, target):
    res = next(a for a in result["assemblies"] if a["id"] == aid)
    assert res["manufacturing_cost"] == pytest.approx(target, abs=TOL), \
        f'{aid}: {res["manufacturing_cost"]} != {target}'


# -- 판가 재현 ---------------------------------------------------------------
@pytest.mark.parametrize("aid,target", PRICE_TARGETS.items())
def test_assembly_price(result, aid, target):
    res = next(a for a in result["assemblies"] if a["id"] == aid)
    assert res["quote"]["price"] == pytest.approx(target, abs=TOL), \
        f'{aid}: {res["quote"]["price"]} != {target}'


# -- 판가 산식 -----------------------------------------------------------------
def test_price_formula():
    # 판가 = 제조원가 × (1+관리비+영업이익) + 운반비
    assert calc_price(16914.933, 0.065, 0.04, 462.963) == pytest.approx(19153.96, abs=0.1)


# -- 구성비 합계 = 100% -------------------------------------------------------
def test_composition_sums_to_one(result):
    for a in result["assemblies"]:
        comp = a["composition"]
        assert sum(comp.values()) == pytest.approx(1.0, abs=1e-6)


# -- 재료비(A) 구성 검증 (사출품 롤업 반영) ------------------------------------
def test_assembly_material_includes_part_rollup(result):
    a = next(x for x in result["assemblies"] if x["id"] == "assy_inner_cover_a")
    part_line = next(m for m in a["materials"] if m["kind"] == "part_ref")
    assert part_line["amount"] == pytest.approx(4374.015, abs=TOL)
    assert a["material_total"] == pytest.approx(15055.755, abs=TOL)
