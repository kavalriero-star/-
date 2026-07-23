"""입력 검증 테스트."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from costcalc import MasterData, load_project
from costcalc.validate import validate_project, ValidationError
from costcalc.engine import calc_project, daily_capa


@pytest.fixture(scope="module")
def master():
    return MasterData()


@pytest.fixture
def project():
    return load_project()


def test_valid_project_passes(project, master):
    validate_project(project, master)  # 예외 없어야 함


def test_zero_cycle_time_raises(project, master):
    project["parts"][0]["production"]["cycle_time"] = 0
    with pytest.raises(ValidationError) as ei:
        validate_project(project, master)
    assert any("Cycle" in e or "cycle_time" in e for e in ei.value.errors)


def test_zero_volume_raises(project, master):
    project["assemblies"][0]["volume"] = 0
    with pytest.raises(ValidationError):
        validate_project(project, master)


def test_unknown_ton_raises(project, master):
    project["parts"][0]["production"]["ton"] = 999
    with pytest.raises(ValidationError) as ei:
        validate_project(project, master)
    assert any("톤수" in e for e in ei.value.errors)


def test_missing_part_ref_raises(project, master):
    project["assemblies"][0]["materials"][0]["ref"] = "nonexistent"
    with pytest.raises(ValidationError) as ei:
        validate_project(project, master)
    assert any("참조" in e for e in ei.value.errors)


def test_efficiency_out_of_range(project, master):
    project["parts"][0]["production"]["efficiency"] = 2.0
    with pytest.raises(ValidationError):
        validate_project(project, master)


def test_daily_capa_zero_ct_raises():
    with pytest.raises(ValueError):
        daily_capa({"cycle_time": 0, "efficiency": 0.9, "shift_hours": 10, "shifts": 1, "lines": 1})


def test_empty_materials_still_calculates(project, master):
    """빈 재료 리스트여도 계산은 되어야 한다(재료비 0)."""
    project["parts"][0]["materials"] = []
    validate_project(project, master)
    res = calc_project(project, master)
    part = next(p for p in res["parts"] if p["id"] == "part_inner_cover_a")
    assert part["material_total"] == 0
