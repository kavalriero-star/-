"""
엘레멕 원가계산 프로그램 - Flask 서버
=====================================
실행:  python app.py   →  http://127.0.0.1:5000

API
---
  GET  /api/bootstrap        초기 로드 (project + master + 계산결과)
  POST /api/calc             {project, config?} 재계산 (실시간 편집)
  POST /api/export           {project, config?} → 엑셀(.xlsx) 다운로드
  GET  /api/master           마스터(설비/인건비/공통상수)
  GET  /healthz              헬스체크
"""
import copy
import datetime
import io

from flask import Flask, jsonify, request, send_file, send_from_directory

from costcalc import MasterData, load_project, calc_project
from costcalc.analysis import quote_summary, competitor_compare, bep_analysis, price_matrix
from costcalc.excel_export import export_bytes
from costcalc.validate import validate_project, ValidationError
from costcalc.data.build_seed import DEFAULT_PACKAGING, DEFAULT_TRANSPORT

app = Flask(__name__, static_folder="web", static_url_path="")

_BASE_MASTER = MasterData()
_BASE_PROJECT = load_project()


def _master_from(config_override=None):
    if not config_override:
        return _BASE_MASTER
    if not isinstance(config_override, dict):
        raise ValidationError(["config 데이터 형식이 올바르지 않습니다(객체여야 함)."])
    m = _BASE_MASTER.copy()
    # 얕은 병합: 최상위 키 단위로 사용자 config 덮어쓰기
    for k, v in config_override.items():
        if isinstance(v, dict) and isinstance(m.config.get(k), dict):
            m.config[k].update(v)
        else:
            m.config[k] = v
    return m


def _analyze(result, master):
    """계산 결과에 분석(요약/시나리오/경쟁사/BEP)을 덧붙인다."""
    summary = quote_summary(result["assemblies"])
    for a in result["assemblies"]:
        a["matrix"] = price_matrix(a["manufacturing_cost"], a["quote"]["transport"], master)
        a["competitor"] = competitor_compare(a)
        a["bep"] = bep_analysis(a, master)
    result["summary"] = summary
    return result


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/healthz")
def healthz():
    return jsonify(status="ok")


@app.get("/api/bootstrap")
def bootstrap():
    result = _analyze(calc_project(_BASE_PROJECT, _BASE_MASTER), _BASE_MASTER)
    return jsonify({
        "project": _BASE_PROJECT,
        "master": _BASE_MASTER.to_dict(),
        "result": result,
    })


@app.get("/api/master")
def get_master():
    return jsonify(_BASE_MASTER.to_dict())


def _new_part_template(new_id, name="신규 사출품"):
    return {
        "id": new_id, "name": name, "kind": "injection",
        "module": "", "customer": "삼성SDI", "model": "", "material_code": "", "vendor": "",
        "volume": 10000,
        "production": {"ton": 450, "cavity": 1, "cycle_time": 50, "efficiency": 0.9,
                       "shift_hours": 12, "shifts": 2, "work_days": 22},
        "materials": [
            {"name": "NET 재료비", "kind": "net_weight", "sub": "PC", "weight_g": 300,
             "unit_price": 3900, "grade": "", "note": ""},
            {"name": "Insert NUT", "kind": "qty", "sub": "BRASS", "qty": 2,
             "unit_price": 540, "grade": "", "note": "Insert"},
        ],
        "labor": [
            {"name": "사출, 외관검사", "workers": 0.5},
            {"name": "라벨 부착, 검사, 포장", "workers": 0.5},
        ],
        "overhead": {"loss_rate": 0.03, "dedicated_base_monthly": 25000, "dedicated_equipment": []},
    }


def _new_assembly_template(new_id, name="신규 조립품"):
    return {
        "id": new_id, "name": name, "kind": "assembly",
        "module": "", "customer": "삼성SDI", "model": "", "material_code": "", "vendor": "",
        "volume": 10000,
        "quote_lines": [{"customer": "", "type": "", "material_code": "",
                         "name": name, "volume": 10000, "competitor_price": None}],
        "production": {"lines": 1, "cycle_time": 15, "efficiency": 0.9,
                       "shift_hours": 10.5, "shifts": 1, "work_days": 22},
        "materials": [
            {"name": "부품/재료", "kind": "qty", "sub": "", "qty": 1, "unit_price": 0, "note": ""},
        ],
        "labor": [
            {"name": "조립", "workers": 1},
            {"name": "검사 / 포장", "workers": 1},
        ],
        "overhead": {
            "loss_rate": 0.01, "dedicated_base_monthly": 50000,
            "area_m2": 500, "power_kw": 87, "dedicated_equipment": [],
            "packaging": dict(DEFAULT_PACKAGING), "transport": dict(DEFAULT_TRANSPORT),
        },
        "quote": {"admin_rate": 0.065, "profit_rate": 0.05},
    }


def _new_project_template(title="새 견적"):
    """백지 견적(프로젝트) 스캐폴드. 품목은 비어 있고 사용자가 추가한다."""
    today = datetime.date.today().isoformat()
    return {
        "project": {"title": title, "doc_no": "", "revision": "", "customer": "",
                    "date": today, "note": ""},
        "parts": [],
        "assemblies": [],
    }


@app.get("/api/template/<kind>")
def template(kind):
    """신규 템플릿 반환. kind = 'part' | 'assy' | 'project'"""
    new_id = request.args.get("id", f"{kind}_new")
    name = request.args.get("name")
    if kind == "part":
        return jsonify(_new_part_template(new_id, name or "신규 사출품"))
    if kind == "assy":
        return jsonify(_new_assembly_template(new_id, name or "신규 조립품"))
    if kind == "project":
        return jsonify(_new_project_template(name or "새 견적"))
    return jsonify(error="알 수 없는 유형"), 400


@app.post("/api/calc")
def calc():
    payload = request.get_json(force=True, silent=True) or {}
    project = payload.get("project") or _BASE_PROJECT
    try:
        master = _master_from(payload.get("config"))
        validate_project(project, master)
        result = _analyze(calc_project(project, master), master)
    except ValidationError as exc:
        return jsonify(error="입력값 오류", details=exc.errors), 400
    except Exception as exc:  # 계산 중 예외
        return jsonify(error=str(exc)), 400
    return jsonify(result)


@app.post("/api/export")
def export():
    payload = request.get_json(force=True, silent=True) or {}
    project = payload.get("project") or _BASE_PROJECT
    try:
        master = _master_from(payload.get("config"))
        validate_project(project, master)
        result = calc_project(project, master)
        data = export_bytes(result, master)
    except ValidationError as exc:
        return jsonify(error="입력값 오류", details=exc.errors), 400
    except Exception as exc:
        return jsonify(error=str(exc)), 400
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    fname = f"원가견적_{project.get('project',{}).get('doc_no','SDI')}_{ts}.xlsx"
    return send_file(io.BytesIO(data), as_attachment=True, download_name=fname,
                     mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


if __name__ == "__main__":
    import os
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=debug)
