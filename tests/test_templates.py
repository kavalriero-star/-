"""신규 품목 템플릿이 유효하고 계산 가능한지 검증."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as flask_app
from costcalc import MasterData, load_project, calc_project
from costcalc.validate import validate_project


@pytest.fixture(scope="module")
def master():
    return MasterData()


def test_new_part_template_calculates(master):
    project = load_project()
    part = flask_app._new_part_template("part_new_1", "테스트 사출품")
    project["parts"].append(part)
    validate_project(project, master)
    res = calc_project(project, master)
    new = next(p for p in res["parts"] if p["id"] == "part_new_1")
    assert new["manufacturing_cost"] > 0


def test_new_assembly_template_calculates(master):
    project = load_project()
    assy = flask_app._new_assembly_template("assy_new_1", "테스트 조립품")
    project["assemblies"].append(assy)
    validate_project(project, master)
    res = calc_project(project, master)
    new = next(a for a in res["assemblies"] if a["id"] == "assy_new_1")
    assert new["manufacturing_cost"] > 0
    assert new["quote"]["price"] > new["manufacturing_cost"]


def test_new_assembly_can_reference_part(master):
    project = load_project()
    assy = flask_app._new_assembly_template("assy_new_2", "참조 테스트")
    # 재료를 사출품 참조로 전환
    assy["materials"] = [{"name": "사출품", "kind": "part_ref",
                          "ref": "part_inner_cover_a", "qty": 1, "note": ""}]
    project["assemblies"].append(assy)
    validate_project(project, master)
    res = calc_project(project, master)
    new = next(a for a in res["assemblies"] if a["id"] == "assy_new_2")
    part = next(p for p in res["parts"] if p["id"] == "part_inner_cover_a")
    # 재료비 = 사출품 제조원가
    assert new["material_total"] == pytest.approx(part["manufacturing_cost"], abs=0.5)


def test_template_endpoints():
    client = flask_app.app.test_client()
    assert client.get("/api/template/part").status_code == 200
    assert client.get("/api/template/assy").status_code == 200
    assert client.get("/api/template/project").status_code == 200
    assert client.get("/api/template/bogus").status_code == 400


def test_blank_project_calculates(master):
    """백지 견적(품목 0개)도 검증·계산·요약이 오류 없이 동작."""
    blank = flask_app._new_project_template("빈 견적")
    validate_project(blank, master)
    res = calc_project(blank, master)
    assert res["assemblies"] == [] and res["parts"] == []


def test_blank_project_via_api():
    """백지 견적 calc/export API가 200을 반환."""
    client = flask_app.app.test_client()
    blank = flask_app._new_project_template("빈 견적")
    assert client.post("/api/calc", json={"project": blank}).status_code == 200
    assert client.post("/api/export", json={"project": blank}).status_code == 200
