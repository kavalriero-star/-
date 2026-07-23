"""
시드 데이터 생성기
==================
업로드된 견적 검토 엑셀
(SDI U6A5/U8A1 Inner Cover Ass'y 見積檢討 2600723 R6) 에서
추출·검증한 값으로 products.json / config.json 을 생성한다.

- config.json : 전사 공통 마스터 상수/율 (관리자 관리, 버전 부여)
- products.json : 품목별 견적 파라미터 (견적담당 편집)

각 조립품(ASSY) 제조원가는 아래 목표값과 일치해야 한다(엔진 검증 기준):
  Inner Cover ASSY A(A5)      16914.93
  Inner Cover ASSY B(A5)      16936.36
  ASSY Holder BUSBAR A(U8)    19866.18
  ASSY Holder BUSBAR B(U8)    19886.66
사출품 제조원가 목표값:
  Inner Cover A (A5)           4374.02
  Inner Cover B (A5)           4374.06
  Holder BUSBAR A(U8)          5378.30
  Holder BUSBAR B(U8)          5377.38
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# 전사 공통 마스터 상수/율  (원가 도메인 검토 반영: 상수·율 전부 외부화)
# ---------------------------------------------------------------------------
CONFIG = {
    "version": "R6-2600723",
    "currency": "KRW",
    "labor": {
        # 원가 기준표 '근무형태별 인건비 예상표' M열(일 인건비)
        "rate_per_day": 182806.46181818182,   # 2교대 일당(기본 적용)
        "rate_table": {
            "day": 163492.14136363636,        # 주간
            "night_fixed": 202121.27454545454, # 야간 고정
            "two_shift": 182806.46181818182,   # 2교대
            "holiday": 201569.1906818182       # 휴일(격주)
        },
        "indirect_rate": 0.30                  # 간접노무비 = 직접노무비 × 30%
    },
    "overhead_rates": {
        "welfare_rate": 0.15,       # 복리후생비 = 노무비 × 15%
        "consumable_rate": 0.005,   # 소모품 = (재료비+노무비) × 0.5%
        "etc_rate": 0.005,          # 기타   = (재료비+노무비) × 0.5%
        "repair_rate_on_invest": 0.06  # 조립 수선비 = 전용설비감가 × 6%
    },
    "depreciation": {
        "equip_years": 6,           # 설비 투자비 감가 내용연수(년)
        "operating_days": 264,      # 연간 가동일수
        "dedicated_years": 3,       # 전용설비 감가 내용연수(년)
        "months_per_year": 12
    },
    "building": {
        # 건물 감가(원/일) = 제조면적(㎡) × land_value / divisor1 / divisor2 / days
        # 8,500,000,000 / 14000 / 20 / 264  = ㎡·일당 단가
        "land_value": 8500000000,
        "divisor1": 14000,
        "divisor2": 20,
        "days": 264,
        "cost_per_m2_day": 8500000000 / 14000 / 20 / 264
    },
    "utility": {
        "power_unit_price": 180,   # 전력단가 원/kW
        # 사출품 전력비 = kW × 180 × 21 × 0.5  (21h = 10.5h × 2교대)
        "part_hours": 21,
        "part_factor": 0.5,
        # 조립품 전력비 = kW × 180 × 12 × 0.5
        "assembly_hours": 12,
        "assembly_factor": 0.5
    },
    "material": {
        "busbar_discount": 0.9,    # 버스바 적용단가 = 기준단가 × 0.9
        "setting_material_multiplier": 5  # Setting 산식 내 재료비 배수(초도분)
    },
    "loss_rate": {
        "injection": 0.03,   # 사출품 LOSS율 기본
        "assembly": 0.01     # 조립품 LOSS율 기본
    },
    "quote": {
        # 판가 = 제조원가 × (1 + 관리비율 + 영업이익율) + 운반비
        "default_admin_rate": 0.065,
        "default_profit_rate": 0.04,
        "scenario_profit_rates": [0.04, 0.03, 0.05, 0.07, 0.10],
        "scenario_admin_rates": [0.065, 0.108]
    },
    "transport": {
        "freight_per_trip": 700000,   # 1회 운임(원)
        "box_per_5ton": 168,          # 5톤 적재 Box 수 (4×3×14)
        "load_factor": 0.9            # 용적율
    }
}

# 기본 포장비 파라미터(조립품 공통) — O80 = 단프라 + 비닐 + 니트롱지 + 파렛트
DEFAULT_PACKAGING = {
    "danpla_box_price": 40000, "danpla_returns": 25, "pack_unit": 10,   # 단프라 = 40000/25/10 = 160
    "vinyl_numer": 1400, "vinyl_denom": 23300, "vinyl_pack_unit": 1,    # 비닐 = (1400/23300)/1
    "netrong_price": 0, "netrong_qty": 0,                               # 니트롱지
    "pallet_price": 17000, "pallet_pack_factor": 12, "pallet_div": 5    # 파렛트 = 17000/(4*3*pack_unit)/5
}
# 기본 운송비 파라미터(조립품 공통)
DEFAULT_TRANSPORT = {"box_qty": 10}   # 총적재 = box_qty × 168, 용적 × 0.9, 운임/용적


def net(name, weight, price, sub="", grade="", note=""):
    return {"name": name, "kind": "net_weight", "sub": sub, "weight_g": weight,
            "unit_price": price, "grade": grade, "note": note}

def qty(name, q, price, sub="", grade="", note="지정도급"):
    return {"name": name, "kind": "qty", "sub": sub, "qty": q,
            "unit_price": price, "grade": grade, "note": note}

def busbar(name, q, base_price):
    return {"name": name, "kind": "busbar", "qty": q, "base_price": base_price, "note": ""}

def part_ref(name, ref_id, q=1):
    return {"name": name, "kind": "part_ref", "ref": ref_id, "qty": q, "note": "사출품 롤업원가"}


# ---------------------------------------------------------------------------
# 사출품 (injection parts)
# ---------------------------------------------------------------------------
PARTS = [
    {
        "id": "part_inner_cover_a", "name": "Inner Cover A (A5)", "kind": "injection",
        "module": "U6A5", "customer": "삼성SDI", "model": "U6A5",
        "material_code": "V143-00042A", "vendor": "삼진엘앤디",
        "volume": 20000,
        "production": {"ton": 450, "cavity": 1, "cycle_time": 50, "efficiency": 0.9,
                       "shift_hours": 12, "shifts": 2, "work_days": 22},
        "materials": [
            net("NET 재료비", 521.33, 3900, sub="PC", grade="UF-1002"),
            qty("M8 Insert NUT", 2, 540, sub="BRASS", grade="M8 * L15", note="Insert"),
            qty("M4 Insert NUT", 6, 62, sub="BRASS", grade="M4 * L4.8", note="Insert"),
        ],
        "labor": [
            {"name": "사출, 외관검사", "workers": 0.5},
            {"name": "라벨 부착, 비전검사, 포장", "workers": 0.5},
        ],
        "overhead": {
            "loss_rate": 0.03, "dedicated_base_monthly": 25000,
            "dedicated_equipment": [
                {"name": "인서트 자동 공급기", "price": 106000000,
                 "note": "90,000,000 ⇒ 106,000,000 (인서트 변경 투자 증가)"},
                {"name": "인서트 비전 검사기", "price": 23000000, "note": "비전검사기 추가"},
            ],
        },
    },
    {
        "id": "part_inner_cover_b", "name": "Inner Cover B (A5)", "kind": "injection",
        "module": "U6A5", "customer": "삼성SDI", "model": "U6A5",
        "material_code": "V143-00041A", "vendor": "삼진엘앤디",
        "volume": 20000,
        "production": {"ton": 450, "cavity": 1, "cycle_time": 50, "efficiency": 0.9,
                       "shift_hours": 12, "shifts": 2, "work_days": 22},
        "materials": [
            net("NET 재료비", 521.34, 3900, sub="PC", grade="UF-1002"),
            qty("M8 Insert NUT", 2, 540, sub="BRASS", grade="M8 * L15", note="Insert"),
            qty("M4 Insert NUT", 6, 62, sub="BRASS", grade="M4 * L4.8", note="Insert"),
        ],
        "labor": [
            {"name": "사출, 외관검사", "workers": 0.5},
            {"name": "라벨 부착, 검사, 포장", "workers": 0.5},
        ],
        "overhead": {
            "loss_rate": 0.03, "dedicated_base_monthly": 25000,
            "dedicated_equipment": [
                {"name": "인서트 자동 공급기", "price": 106000000, "note": ""},
                {"name": "인서트 비전 검사기", "price": 23000000, "note": ""},
            ],
        },
    },
    {
        "id": "part_holder_busbar_a", "name": "Holder BUSBAR A(U8)", "kind": "injection",
        "module": "U8A1", "customer": "삼성SDI", "model": "U8A1",
        "material_code": "", "vendor": "삼진엘앤디",
        "volume": 5000,
        "production": {"ton": 450, "cavity": 1, "cycle_time": 50, "efficiency": 0.9,
                       "shift_hours": 12, "shifts": 2, "work_days": 22},
        "materials": [
            net("NET 재료비", 476.55, 4200, sub="PC", grade="HN1022"),
            qty("M8 Insert NUT", 4, 540, sub="BRASS", grade="M8 * L15", note="Insert"),
            qty("M4 Insert NUT", 6, 62, sub="BRASS", grade="M4 * L4.8", note="Insert"),
        ],
        "labor": [
            {"name": "사출, 외관검사", "workers": 0.5},
            {"name": "라벨 부착, 검사, 포장", "workers": 0.5},
        ],
        "overhead": {
            "loss_rate": 0.03, "dedicated_base_monthly": 50000,
            "dedicated_equipment": [
                {"name": "인서트 자동 공급기", "price": 90000000, "note": "U6A5, U8A1 공용 생산 대응"},
            ],
        },
    },
    {
        "id": "part_holder_busbar_b", "name": "Holder BUSBAR B(U8)", "kind": "injection",
        "module": "U8A1", "customer": "삼성SDI", "model": "U8A1",
        "material_code": "", "vendor": "삼진엘앤디",
        "volume": 5000,
        "production": {"ton": 450, "cavity": 1, "cycle_time": 50, "efficiency": 0.9,
                       "shift_hours": 12, "shifts": 2, "work_days": 22},
        "materials": [
            net("NET 재료비", 476.34, 4200, sub="PC", grade="HN1022"),
            qty("M8 Insert NUT", 4, 540, sub="BRASS", grade="M8 * L15", note="Insert"),
            qty("M4 Insert NUT", 6, 62, sub="BRASS", grade="M4 * L4.8", note="Insert"),
        ],
        "labor": [
            {"name": "사출, 외관검사", "workers": 0.5},
            {"name": "라벨 부착, 검사, 포장", "workers": 0.5},
        ],
        "overhead": {
            "loss_rate": 0.03, "dedicated_base_monthly": 50000,
            "dedicated_equipment": [
                {"name": "인서트 자동 공급기", "price": 90000000, "note": "U6A5, U8A1 공용 생산 대응"},
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# 조립품 (assemblies)
# ---------------------------------------------------------------------------
ASSEMBLIES = [
    {
        "id": "assy_inner_cover_a", "name": "Inner Cover ASSY A(A5)", "kind": "assembly",
        "module": "U6A5", "customer": "삼성SDI", "model": "U6A5",
        "material_code": "V045-0126AA", "vendor": "삼진엘앤디",
        "volume": 20000,
        "quote_lines": [
            {"customer": "공용", "type": "Type A", "material_code": "V045-0126AA",
             "name": "U6A5_Inner Cover Ass'y Type A", "volume": 20000, "competitor_price": 19000}
        ],
        "production": {"lines": 1, "cycle_time": 15, "efficiency": 0.9,
                       "shift_hours": 10.5, "shifts": 1, "work_days": 22},
        "materials": [
            part_ref("Inner Cover A (A5)", "part_inner_cover_a", 1),
            busbar("Busbar A", 2, 440.5),
            busbar("Busbar VT", 4, 458.9),
            busbar("Busbar V", 3, 464),
            qty("VOLTAGE SENSING", 1, 1407, sub="대하전선"),
            qty("TEMP SENSING", 1, 5300, sub="레트론"),
            qty("RIVET", 13, 13, sub="서울금속"),
            qty("REAR LABEL A", 1, 108, sub="창대라벨", grade="W130*L241 T0.1"),
        ],
        "labor": [
            {"name": "Busbar 수동 조립", "workers": 1},
            {"name": "Busbar LR 조립", "workers": 1},
            {"name": "하네스 조립", "workers": 2},
            {"name": "Rivet 조립", "workers": 3},
            {"name": "IR/비전 검사", "workers": 1},
            {"name": "라벨 부착 / 포장", "workers": 1},
        ],
        "overhead": {
            "loss_rate": 0.01, "dedicated_base_monthly": 50000,
            "area_m2": 500, "power_kw": 87,
            "dedicated_equipment": [
                {"name": "버스바 조립기", "price": 52000000, "note": "20,000,000 ⇒ 52,000,000 (3기종 혼용)"},
                {"name": "조립 컨베어, 작업다이", "price": 10000000, "note": ""},
                {"name": "리벳", "price": 53100000, "note": "13,000,000 ⇒ 53,100,000 (카운터 추가)"},
                {"name": "IR, 비전 검사기", "price": 211000000, "note": "238,000,000 ⇒ 211,000,000"},
            ],
            "packaging": dict(DEFAULT_PACKAGING),
            "transport": dict(DEFAULT_TRANSPORT),
        },
        "quote": {"admin_rate": 0.065, "profit_rate": 0.04},
    },
    {
        "id": "assy_inner_cover_b", "name": "Inner Cover ASSY B(A5)", "kind": "assembly",
        "module": "U6A5", "customer": "삼성SDI", "model": "U6A5",
        "material_code": "V045-0125AA", "vendor": "삼진엘앤디",
        "volume": 20000,
        "quote_lines": [
            {"customer": "공용", "type": "Type B", "material_code": "V045-0125AA",
             "name": "U6A5_Inner Cover Ass'y Type B", "volume": 20000, "competitor_price": 19000}
        ],
        "production": {"lines": 1, "cycle_time": 15, "efficiency": 0.9,
                       "shift_hours": 10.5, "shifts": 1, "work_days": 22},
        "materials": [
            part_ref("Inner Cover B (A5)", "part_inner_cover_b", 1),
            busbar("Busbar A", 2, 440.5),
            busbar("Busbar VT", 4, 458.9),
            busbar("Busbar V", 3, 464),
            qty("VOLTAGE SENSING", 1, 1428, sub="대하전선"),
            qty("TEMP SENSING", 1, 5300, sub="레트론"),
            qty("RIVET", 13, 13, sub="서울금속"),
            qty("REAR LABEL B", 1, 108, sub="창대라벨", grade="W130*L241 T0.1"),
        ],
        "labor": [
            {"name": "Busbar 수동 조립", "workers": 1},
            {"name": "Busbar LR 조립", "workers": 1},
            {"name": "하네스 조립", "workers": 2},
            {"name": "Rivet 조립", "workers": 3},
            {"name": "IR/비전 검사", "workers": 1},
            {"name": "라벨 부착 / 포장", "workers": 1},
        ],
        "overhead": {
            "loss_rate": 0.01, "dedicated_base_monthly": 50000,
            "area_m2": 500, "power_kw": 87,
            "dedicated_equipment": [
                {"name": "버스바 조립기", "price": 52000000, "note": ""},
                {"name": "조립 컨베어, 작업다이", "price": 10000000, "note": ""},
                {"name": "리벳", "price": 53100000, "note": ""},
                {"name": "IR, 비전 검사기", "price": 211000000, "note": ""},
            ],
            "packaging": dict(DEFAULT_PACKAGING),
            "transport": dict(DEFAULT_TRANSPORT),
        },
        "quote": {"admin_rate": 0.065, "profit_rate": 0.04},
    },
    {
        "id": "assy_holder_busbar_a", "name": "ASSY Holder BUSBAR A(U8)", "kind": "assembly",
        "module": "U8A1", "customer": "삼성SDI", "model": "U8A1",
        "material_code": "V045-0158AA", "vendor": "삼진엘앤디",
        "volume": 5000,
        "quote_lines": [
            {"customer": "슈나이더外", "type": "Type A", "material_code": "V045-0158AA",
             "name": "ASSY-HOLDER BUSBAR A", "volume": 2500, "competitor_price": 23000},
            {"customer": "슈나이더向", "type": "Type A", "material_code": "V045-0187AA",
             "name": "ASSY-HOLDER BUSBAR A (Schneider)", "volume": 2500, "competitor_price": 23000},
        ],
        "production": {"lines": 1, "cycle_time": 15, "efficiency": 0.9,
                       "shift_hours": 10.5, "shifts": 1, "work_days": 22},
        "materials": [
            part_ref("Holder BUSBAR A(U8)", "part_holder_busbar_a", 1),
            busbar("Busbar-ANGLE", 2, 656.7),
            busbar("Busbar-CTC LONG", 4, 638.2),
            busbar("Busbar-CTC SHORT", 3, 639.6),
            qty("VOLTAGE SENSING", 1, 1407, sub="대하전선"),
            qty("TEMP SENSING", 1, 5700, sub="레트론"),
            qty("RIVET", 13, 13, sub="서울금속"),
            qty("REAR LABEL B", 1, 114, sub="창대라벨", grade="W130*L241 T0.1"),
        ],
        "labor": [
            {"name": "Busbar 수동 조립", "workers": 1},
            {"name": "Busbar LR 조립", "workers": 1},
            {"name": "하네스 조립", "workers": 3},
            {"name": "Rivet 조립", "workers": 2},
            {"name": "IR/비전 검사", "workers": 1},
            {"name": "라벨 부착 / 포장", "workers": 1},
        ],
        "overhead": {
            "loss_rate": 0.01, "dedicated_base_monthly": 50000,
            "area_m2": 500, "power_kw": 87,
            "dedicated_equipment": [
                {"name": "버스바 조립기", "price": 20000000, "note": ""},
                {"name": "조립 컨베어, 작업다이", "price": 10000000, "note": ""},
                {"name": "리벳", "price": 13000000, "note": ""},
                {"name": "IR, 비전 검사기", "price": 238000000, "note": ""},
                {"name": "라벨 출력기", "price": 600000, "note": ""},
            ],
            "packaging": dict(DEFAULT_PACKAGING),
            "transport": dict(DEFAULT_TRANSPORT),
        },
        "quote": {"admin_rate": 0.075, "profit_rate": 0.07},
    },
    {
        "id": "assy_holder_busbar_b", "name": "ASSY Holder BUSBAR B(U8)", "kind": "assembly",
        "module": "U8A1", "customer": "삼성SDI", "model": "U8A1",
        "material_code": "V045-0159AA", "vendor": "삼진엘앤디",
        "volume": 5000,
        "quote_lines": [
            {"customer": "슈나이더外", "type": "Type B", "material_code": "V045-0159AA",
             "name": "ASSY-HOLDER BUSBAR B", "volume": 2500, "competitor_price": 23000},
            {"customer": "슈나이더向", "type": "Type B", "material_code": "V045-0188AA",
             "name": "ASSY-HOLDER BUSBAR B (Schneider)", "volume": 2500, "competitor_price": 23000},
        ],
        "production": {"lines": 1, "cycle_time": 15, "efficiency": 0.9,
                       "shift_hours": 10.5, "shifts": 1, "work_days": 22},
        "materials": [
            part_ref("Holder BUSBAR B(U8)", "part_holder_busbar_b", 1),
            busbar("Busbar-ANGLE", 2, 656.7),
            busbar("Busbar-CTC LONG", 4, 638.2),
            busbar("Busbar-CTC SHORT", 3, 639.6),
            qty("VOLTAGE SENSING", 1, 1428, sub="대하전선"),
            qty("TEMP SENSING", 1, 5700, sub="레트론"),
            qty("RIVET", 13, 13, sub="서울금속"),
            qty("REAR LABEL B", 1, 114, sub="창대라벨", grade="W130*L241 T0.1"),
        ],
        "labor": [
            {"name": "Busbar 수동 조립", "workers": 1},
            {"name": "Busbar LR 조립", "workers": 1},
            {"name": "하네스 조립", "workers": 3},
            {"name": "Rivet 조립", "workers": 2},
            {"name": "IR/비전 검사", "workers": 1},
            {"name": "라벨 부착 / 포장", "workers": 1},
        ],
        "overhead": {
            "loss_rate": 0.01, "dedicated_base_monthly": 50000,
            "area_m2": 500, "power_kw": 87,
            "dedicated_equipment": [
                {"name": "버스바 조립기", "price": 20000000, "note": ""},
                {"name": "조립 컨베어, 작업다이", "price": 10000000, "note": ""},
                {"name": "리벳", "price": 13000000, "note": ""},
                {"name": "IR, 비전 검사기", "price": 238000000, "note": ""},
                {"name": "라벨 출력기", "price": 600000, "note": ""},
            ],
            "packaging": dict(DEFAULT_PACKAGING),
            "transport": dict(DEFAULT_TRANSPORT),
        },
        "quote": {"admin_rate": 0.075, "profit_rate": 0.07},
    },
]

PROJECT = {
    "title": "U6A5 · U8A1 INNER COVER ASS'Y 이원화 견적 검토",
    "doc_no": "2600723", "revision": "R6", "customer": "삼성SDI",
    "date": "2026-07-23",
    "note": "타사50 : 삼진50 M/S 기준. 당사 월 5만개 (U6A5 4만, U8A1 1만).",
}


def main():
    with open(os.path.join(HERE, "config.json"), "w", encoding="utf-8") as fp:
        json.dump(CONFIG, fp, ensure_ascii=False, indent=2)
    with open(os.path.join(HERE, "products.json"), "w", encoding="utf-8") as fp:
        json.dump({"project": PROJECT, "parts": PARTS, "assemblies": ASSEMBLIES},
                  fp, ensure_ascii=False, indent=2)
    print("config.json + products.json 생성 완료:",
          len(PARTS), "사출품 +", len(ASSEMBLIES), "조립품")


if __name__ == "__main__":
    main()
