"""
입력 검증
=========
계산 전에 project/master 를 검증하여, 잘못된 입력이 500 오류가 아니라
명확한 한국어 메시지의 400 응답이 되도록 한다. (원가 도메인 검토 P0: 입력검증)
"""
from __future__ import annotations
from typing import List

REQUIRED_PROD_INJ = ["ton", "cavity", "cycle_time", "efficiency", "shift_hours", "shifts", "work_days"]
REQUIRED_PROD_ASSY = ["lines", "cycle_time", "efficiency", "shift_hours", "shifts", "work_days"]


class ValidationError(ValueError):
    def __init__(self, errors: List[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


def _pos(v):
    return isinstance(v, (int, float)) and v > 0


def _nonneg(v):
    return isinstance(v, (int, float)) and v >= 0


def validate_project(project: dict, master) -> None:
    """문제가 있으면 ValidationError(list) 를 raise. 없으면 조용히 통과."""
    errors: List[str] = []
    if not isinstance(project, dict):
        raise ValidationError(["project 데이터 형식이 올바르지 않습니다."])

    parts = project.get("parts", [])
    assemblies = project.get("assemblies", [])
    part_ids = {p.get("id") for p in parts}
    tons = set(master.ton_options())

    def check_prod(name, prod, keys):
        for k in keys:
            v = prod.get(k)
            if v is None:
                errors.append(f"[{name}] 생산 파라미터 '{k}' 누락")
            elif k in ("cycle_time", "shift_hours", "shifts") and not _pos(v):
                errors.append(f"[{name}] '{k}'는 0보다 커야 합니다 (현재 {v})")
            elif k == "efficiency" and not (0 < v <= 1.5):
                errors.append(f"[{name}] 작업효율은 0~1.5 범위여야 합니다 (현재 {v})")
            elif k == "cavity" and not _pos(v):
                errors.append(f"[{name}] cavity는 0보다 커야 합니다 (현재 {v})")
            elif k == "lines" and not _pos(v):
                errors.append(f"[{name}] 라인수는 0보다 커야 합니다 (현재 {v})")

    def check_common(name, item, is_assy):
        if not isinstance(item.get("production"), dict):
            errors.append(f"[{name}] 생산 파라미터(production)가 없습니다")
        if not isinstance(item.get("materials"), list):
            errors.append(f"[{name}] 재료 목록(materials)이 없습니다")
        if not isinstance(item.get("labor"), list):
            errors.append(f"[{name}] 공정 목록(labor)이 없습니다")
        ov = item.get("overhead")
        if not isinstance(ov, dict):
            errors.append(f"[{name}] 제조경비 파라미터(overhead)가 없습니다")
            return
        if not _nonneg(ov.get("loss_rate")):
            errors.append(f"[{name}] LOSS율이 유효하지 않습니다 (현재 {ov.get('loss_rate')})")
        if not _pos(ov.get("dedicated_base_monthly")):
            errors.append(f"[{name}] 전용설비 기준물량이 유효하지 않습니다")
        if not isinstance(ov.get("dedicated_equipment"), list):
            errors.append(f"[{name}] 전용설비 목록이 없습니다")
        if is_assy:
            for k in ("area_m2", "power_kw"):
                if not _nonneg(ov.get(k)):
                    errors.append(f"[{name}] 제조경비 '{k}'가 유효하지 않습니다")
            if not isinstance(ov.get("packaging"), dict):
                errors.append(f"[{name}] 포장 파라미터(packaging)가 없습니다")
            if not isinstance(ov.get("transport"), dict):
                errors.append(f"[{name}] 운송 파라미터(transport)가 없습니다")

    for p in parts:
        name = p.get("name", p.get("id", "사출품"))
        prod = p.get("production", {})
        check_prod(name, prod, REQUIRED_PROD_INJ)
        if prod.get("ton") is not None and prod.get("ton") not in tons:
            errors.append(f"[{name}] 설비 기준표에 없는 톤수 {prod.get('ton')} "
                          f"(등록: {sorted(tons)})")
        if not _pos(p.get("volume")):
            errors.append(f"[{name}] 월 물량은 0보다 커야 합니다 (현재 {p.get('volume')})")
        check_common(name, p, is_assy=False)
        _check_materials(name, p.get("materials", []), part_ids, errors, allow_ref=False)

    for a in assemblies:
        name = a.get("name", a.get("id", "조립품"))
        check_prod(name, a.get("production", {}), REQUIRED_PROD_ASSY)
        if not _pos(a.get("volume")):
            errors.append(f"[{name}] 월 물량은 0보다 커야 합니다 (현재 {a.get('volume')})")
        check_common(name, a, is_assy=True)
        _check_materials(name, a.get("materials", []), part_ids, errors, allow_ref=True)
        q = a.get("quote", {})
        for rk in ("admin_rate", "profit_rate"):
            if not _nonneg(q.get(rk)):
                errors.append(f"[{name}] {rk}는 0 이상이어야 합니다 (현재 {q.get(rk)})")

    if errors:
        raise ValidationError(errors)


def _check_materials(name, materials, part_ids, errors, allow_ref):
    for i, m in enumerate(materials):
        kind = m.get("kind")
        tag = f"[{name}] 재료 {i+1}({m.get('name','')})"
        if kind not in ("net_weight", "qty", "busbar", "part_ref"):
            errors.append(f"{tag}: 알 수 없는 유형 '{kind}'")
            continue
        if kind == "net_weight":
            if not _nonneg(m.get("weight_g")): errors.append(f"{tag}: 중량(weight_g)이 유효하지 않습니다")
            if not _nonneg(m.get("unit_price")): errors.append(f"{tag}: 단가가 유효하지 않습니다")
        elif kind == "qty":
            if not _nonneg(m.get("qty")): errors.append(f"{tag}: 수량이 유효하지 않습니다")
            if not _nonneg(m.get("unit_price")): errors.append(f"{tag}: 단가가 유효하지 않습니다")
        elif kind == "busbar":
            if not _nonneg(m.get("qty")): errors.append(f"{tag}: 수량이 유효하지 않습니다")
            if not _nonneg(m.get("base_price")): errors.append(f"{tag}: 기준단가가 유효하지 않습니다")
        elif kind == "part_ref":
            if not allow_ref:
                errors.append(f"{tag}: 사출품(part_ref)은 조립품에서만 사용할 수 있습니다")
            elif m.get("ref") not in part_ids:
                errors.append(f"{tag}: 참조 사출품 '{m.get('ref')}'을(를) 찾을 수 없습니다")
