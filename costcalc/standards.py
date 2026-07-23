"""
마스터 데이터 로더
==================
- config.json            : 전사 공통 상수/율
- equipment_standards.json : 설비 기준표(사출기 톤수별)  → 엑셀 VLOOKUP 대체
- labor_rates.json       : 근무형태별 일 인건비
- products.json          : 품목별 견적 파라미터

원가 도메인 검토 반영: 모든 상수/율은 마스터에서 주입되며(하드코딩 금지),
견적은 '어떤 마스터로 계산했는지'를 함께 보관할 수 있도록 dict 로 노출한다.
"""
import json
import os
import copy

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _load(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as fp:
        return json.load(fp)


class MasterData:
    """설비/인건비/공통상수 마스터. 서버 기동 시 1회 로드하여 재사용."""

    def __init__(self, config=None, equipment=None, labor=None):
        self.config = config if config is not None else _load("config.json")
        self.equipment = equipment if equipment is not None else _load("equipment_standards.json")
        self.labor = labor if labor is not None else _load("labor_rates.json")
        self._equip_index = {}
        for row in self.equipment:
            # 동일 톤수 중복 시 첫 행 우선(VLOOKUP 동작과 동일)
            self._equip_index.setdefault(row["ton"], row)

    # -- 설비 기준표 조회 (엑셀 VLOOKUP 대체) --------------------------------
    def equipment_by_ton(self, ton):
        row = self._equip_index.get(ton)
        if row is None:
            raise ValueError(f"설비 기준표에 {ton}톤 사출기가 없습니다. 등록된 톤수: "
                             f"{sorted(self._equip_index)}")
        return row

    def ton_options(self):
        return [r["ton"] for r in self.equipment]

    @property
    def labor_rate(self):
        return self.config["labor"]["rate_per_day"]

    def to_dict(self):
        return {"config": self.config, "equipment": self.equipment, "labor": self.labor}

    def copy(self):
        return MasterData(copy.deepcopy(self.config),
                          copy.deepcopy(self.equipment),
                          copy.deepcopy(self.labor))


def load_project():
    """products.json 전체(project/parts/assemblies) 로드."""
    return _load("products.json")
