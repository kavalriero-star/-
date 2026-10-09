# 룬북 개인용 · 데이터 모델

저장 데이터의 키는 영문, 값은 한국어다. 작품 폴더 하나가 작품 하나이며 열린 형식(JSON, Markdown)만 쓴다.
AI 출력 JSON의 최상위 키는 한국어지만 `값` 안쪽은 이 문서의 키를 그대로 써서, 확정하면 변환 없이 저장된다(`PROMPTS.md`).

## 1. 폴더 구조

```
룬북데이터/                        코드 폴더와 분리한다. OneDrive 같은 동기화 폴더는 피한다
  app.json                         앱 설정(비밀 없음): 작업별 AI, 대필 레벨, 호출 상한
  works/<작품ID>/
    work.json                      아래 2절의 project: 장르, 혼합 정책, 목표 분량, 위저드 진행 상태, 선호 규칙
    bible/
      world.json                   시대, 전제, 세계 철칙, 장소, 비밀 공개 범위
      systems/sy_0001.json         힘의 체계(마법·각성·내공·신분 등)
      factions/fc_0001.json        세력
      characters/ch_0001.json
      relations.json
      timeline.json
      threads.json                 떡밥(복선)
    chapters/
      index.json                   회차 순서
      ep001.md                     회차 본문. 장면 구분은 <!-- sc_0001 --> 마커
    scenes/sc_0001.json            장면 메타(목적, 갈등, 훅, 라벨, 메모)
    ai/
      wizard.jsonl                 위저드 리비전 로그(append-only)
      feedback.jsonl               추천 카드 평가 로그
    .history/<회차ID>/<시각>.md    10분 단위 자동 버전
  backups/<날짜>/                  폴더 복사본
```

아래 2절의 예시 파일 이름 중 `project.json`은 `work.json`, 최상위의 `world.json` 등은 `bible/` 아래에 있다는 뜻으로 읽는다.
모든 JSON에는 `schemaVersion`(정수)과 편집 충돌 검사용 `rev`(정수)가 있다. 알 수 없는 필드는 마이그레이션에서 보존한다.

`id`는 접두어 + 4자리 일련번호(`ch_0001`)이고 표시명과 분리한다. 이름이 바뀌어도 참조가 깨지지 않는다.
`aliases[]`가 본문 고유명사 자동 연결의 사전이 된다. 조사가 붙은 형태("도윤이", "도윤의")도 같은 이름으로 인식한다.
모든 파일은 같은 폴더에 임시 파일로 쓴 뒤 이름을 바꾸는 방식으로 저장한다(원자적 저장, `DESIGN_SPEC.md` 8.8절).

## 2. 핵심 엔티티

```jsonc
// project.json
{"id":"pj_0001","schema_ver":1,"title":"균열 아래 청운문",
 "genres":["hunter","wuxia"],"genre_weights":{"hunter":60,"wuxia":40},
 "mix_policy":{
   "primary":"hunter",
   "system_relation":"translate",            // replace | layer | parallel | translate
   "vocab_zones":[{"id":"z_combat","style":"wuxia"},{"id":"z_daily","style":"modern"}],
   "accuracy_level":"loose",                  // strict | loose | off  (역사 요소가 있을 때)
   "rank_mapping":[{"from":"sy_0001:3","to":"sy_0002:C"}],
   "knowledge_holders":[]},
 "logline":"E급 헌터가 게이트 심층에서 사라진 무림 문파의 석비를 발견한다","tone":["진지","사이다"],
 "target":{"eps":200,"chars_per_ep":5500},
 "assist_level":"L1",                         // L0 | L1 | L2 (예시문 허용 범위, 기본 L1)
 "ai":{"primary":"claude","per_task":{"worldbuild":"claude","expression":"chatgpt"},"auto_fallback":false},
 "pref_rules":[],                             // 최대 12줄, 작가가 확정한 선호 규칙
 "wizard":{"step":"W6","done":["W0","W1","W2","W3","W4","W5"]},
 "exceptions":[]}                             // '의도한 것'으로 확정한 모순 경고

// world.json
{"id":"wd_0001","era":{"kind":"modern","year":2031,"calendar":"gregorian"},
 "premise":"7년 전 서울 지하로 무림이 눌려 들어왔고 게이트는 그 균열이다",
 "rules":[{"id":"ru_0001","text":"게이트 안에서는 내공이 마력으로 환산된다","hard":true}],
 "places":[{"id":"pl_0001","name":"강남 게이트존","aliases":["강남존"],"travel":[{"to":"pl_0002","days":0.3}]}],
 "secrecy":{"public":["ru_0001"],"hidden":[]}}

// systems/sy_0001.json  (kind: magic | awakening | internal_energy | status_ladder | history_anchor)
{"id":"sy_0001","kind":"internal_energy","name":"내공","aliases":["기"],"source":"단전 축적",
 "unit":{"name":"갑자","years":60},"cost":"운기 중 무방비","limits":["영약 없이는 수련 연수만큼만 축적"],
 "ladder":[{"rank":1,"name":"삼류"},{"rank":2,"name":"일류"},{"rank":3,"name":"절정"}],
 "maps_to":[{"system":"sy_0002","rule":"1갑자≈마력 3000"}],"vocab_zone":"z_combat"}

// factions/fc_0001.json
{"id":"fc_0001","name":"한국헌터협회","aliases":["협회"],"kind":"org","goal":"각성자 독점 관리",
 "resources":["심사권"],"allies":[],"enemies":["fc_0002"],"rank_system":"sy_0002","leader":"ch_0003","active_until":null}

// characters/ch_0001.json
{"id":"ch_0001","role":"protagonist","name":"한도윤","aliases":["도윤"],"age":{"value":29,"at":"ev_0001"},
 "appearance_hook":"오른손 흉터","desire":{"want":"빚 청산","need":"혼자 짊어지지 않는 법"},
 "lack":"가족을 잃음","false_belief":"강해지면 사람을 잃지 않는다",
 "secrets":[{"id":"sec_0001","text":"실제 내공은 2갑자","known_by":["ch_0002"],"reveal_ep":60}],
 "abilities":[{"system":"sy_0001","rank":3,"skills":["청운검"]}],"weaknesses":["대인 신뢰 부족"],
 "voice":{"style":"짧고 건조한 평어체","tics":["…"],"samples":[],"address":{"ch_0002":"어르신"},"banned_words":[]},
 "affiliations":["fc_0002"],"status":{"alive":true,"death_ep":null},
 "arc":{"start":"고립","turns":[{"ep":40,"text":"협회 제안 수락"}],"end":"공동체의 구심점"},
 "ai_filled":false,                           // 'AI가 알아서'로 채운 항목이면 true (설정집에서 필터)
 "ext":{}}                                    // 역할별 추가 필드(아래 3절)

// relations.json
{"id":"rel_0001","a":"ch_0001","b":"ch_0002","type":"master-disciple","a_to_b":"존경","b_to_a":"경계","public":true,
 "since":"ev_0001","changes":[{"ep":40,"to":"배신","event":"ev_0007"}]}

// timeline.json
{"id":"ev_0001","title":"게이트 심층 석비 발견","when":{"t":"2031-03-02","order":10},"ep_range":[1,1],
 "participants":["ch_0001"],"place":"pl_0001","effects":[{"type":"rank_change","char":"ch_0001","system":"sy_0002","to":"E"}],
 "reveals":[],"canon":true}

// threads.json  (떡밥)
{"id":"th_0001","title":"할아버지의 공책","planted_ep":1,"due_ep":null,
 "status":"active",                           // active | imminent | neglected | resolved (기본: 10회 경과 시 neglected)
 "links":["ch_0001"],"note":""}

// scenes/sc_0001.json
{"id":"sc_0001","ep":1,"order":3,"pov":"ch_0001","place":"pl_0001","time":"ev_0001","characters":["ch_0001"],
 "goal":"석비의 글자를 확인한다","conflict":"교신 두절","hook":"석비가 반응한다",
 "hook_type":"반전",                          // 질문 | 위기 | 반전 | 폭로 | 예고
 "label":"중립",                              // 사이다 | 고구마 | 중립
 "status":"drafting","text_ref":"episodes/ep001.md#sc_0001","memo":[]}
```

## 3. 인물 역할별 확장 (`ext`)

| 역할 | 추가 필드 |
|---|---|
| 주인공 | `cheat{text,cost}`, `goal_eps`, `reader_pleasure` |
| 조연 | `function`(조력/라이벌/멘토/연애/코믹), `spotlight_eps[]` |
| 적대자 | `motive`, `justification`(스스로 옳다고 믿는 이유), `mirror_trait`, `escalation[]`, `defeat_condition` |

## 4. 위저드 로그와 피드백 로그

```jsonc
// wizard/log.jsonl  한 줄 = 한 리비전 (append-only, 되돌리기는 이전 리비전을 새 줄로 복원)
{"q":"character.lack","rev":7,"state":"confirmed",   // confirmed | auto | skipped
 "value":{"lack":"가족을 잃음"},"source":"후보2+수정","depends":["world.premise"],"needs_review":false,"ts":"..."}

// feedback.jsonl  추천 카드 평가
{"card":"direction","option":"B","action":"adopt",   // adopt | save | hide | like | dislike
 "reason":"too_obvious","ai":"claude","ts":"..."}
```

위저드 문항 하나는 데이터 모델 경로(`target_path`)와 값 스키마를 가진다. 확정하면 후보의 `값`이 그 경로에 저장된다.
앞 문항을 고치면 그 항목에 의존하는 뒤 문항에 `needs_review`만 표시하고 자동으로 지우지 않는다.

## 5. 규칙 기반 모순 점검 10개

모든 경고에 [원고 고치기] [설정 고치기] [의도한 것으로 확정] 선택지가 붙는다. 확정한 경고는 `project.exceptions[]`에 저장되어 다시 뜨지 않는다.

| # | 입력 → 판정 | 경고 문구 예 |
|---|---|---|
| 1 | 인물의 `abilities.rank`가 체계 `ladder`에 없음 | "'화경'은 '내공' 체계에 정의되지 않았습니다." |
| 2 | 내공 연수(갑자×60)가 나이에서 수련 가능 기간을 넘고 영약·기연 태그가 없음 | "29세 인물의 내공 3갑자(180년)는 수련 기간을 초과합니다." |
| 3 | `death_ep`보다 뒤 회차 장면에 등장(회상 표시 없음) | "한도윤은 12화에서 사망했는데 30화에 등장합니다." |
| 4 | 소속 id가 없거나 `active_until`을 지남 | "소속 '암천회'가 22화에서 해체됐습니다." |
| 5 | 관계 역방향 불일치, 부모의 나이가 자식 이하 | "'부모' 관계인데 나이가 역전되었습니다." |
| 6 | 비밀을 모르는 인물이 공개 전에 해당 키워드를 말함 (키워드 매칭, 오탐 가능) | "이 비밀은 60화에 공개 예정인데 25화 대사에서 언급됩니다." |
| 7 | 실존 인물의 생몰년 밖 장면 시점 | "이순신(1545–1598)은 1600년 장면에 등장할 수 없습니다." |
| 8 | 연속 장면의 이동 거리(`travel.days`)가 경과일보다 큼 | "서울→무당산은 3일 거리인데 장면 간 경과는 1일입니다." |
| 9 | 어휘 구역 밖에서 체계 용어 사용, 또는 역사+엄격에서 금지 어휘 사전 매칭 (사전 기반, 한계 있음) | "일상 구역에서 '내공'이 쓰였습니다. 의도한 혼용인가요?" |
| 10 | 같은 인물의 등급이 장면 사이에서 바뀌었는데 `rank_change` 사건이 없음 | "35화 절정 → 40화 일류로 바뀌었으나 변화 사건이 없습니다." |

한계: 점검은 구조화 필드(수치, 생사, 소속, 등급, 시간·거리)와 이름·키워드 매칭에 한정한다. 자유 서술에서 사실을 뽑는 판정(예: "그는 오른팔로 검을 들었다")은
규칙으로 안정적이지 않으므로 AI 설정 점검(`PROMPTS.md` T5)이 규칙 엔진이 낸 후보를 판정하는 방식으로 분담한다.
경고 위치는 장면 단위가 기본이고, 이름·수치가 본문에서 정확히 일치할 때만 문장 단위로 표시한다.
