# 룬북 개인용 · 데이터 모델

저장 데이터의 키는 영문, 값은 한국어다(enum 값은 영문 소문자). 작품 폴더 하나가 작품 하나이며 열린 형식(JSON, Markdown)만 쓴다.
AI 출력 JSON의 최상위 키는 한국어지만 `값` 안쪽은 이 문서의 키를 그대로 써서, 확정하면 변환 없이 저장된다(`PROMPTS.md`). 새 개체의 id와 교차 참조는 6절의 규칙으로 앱이 처리한다.

## 1. 폴더 구조

```
룬북데이터/                        코드 폴더와 분리한다. OneDrive 같은 동기화 폴더는 피한다
  app.json                         앱 기본 설정(비밀 없음): 기본 AI, 작업별 AI, 대필 레벨, 호출 상한
  packs/                           장르 팩 데이터: 금지어, 호칭, 시대 어휘, 어휘 구역 사전 (3.3절, 사용자가 고칠 수 있음)
  works/<작품ID>/
    work.json                      아래 2절의 project. app.json의 설정을 작품별로 덮어쓸 수 있다
    bible/
      world.json                   시대, 전제, 세계 철칙, 장소, 사회(종족·국가), 비밀 공개 범위
      systems/sy_0001.json         힘의 체계(마법·각성·내공·신분 등)
      factions/fc_0001.json        세력
      characters/ch_0001.json
      relations.json
      timeline.json
      threads.json                 떡밥(복선)
    chapters/
      index.json                   회차 순서
      ep001.md                     회차 본문. 장면 구분은 <!-- sc_0001 --> 마커
    scenes/sc_0001.json            장면 메타(목적, 갈등, 훅, 라벨, 요약, 메모)
    ai/
      wizard.jsonl                 위저드 확정·되돌리기 로그(append-only)
      feedback.jsonl               추천 카드 평가 로그
      cache/                       후보·추천 응답 캐시(새로고침과 되돌리기 때 재호출 방지)
      queue.json                   "나중에 보내기"로 저장한 요청
    .history/<회차ID>/<시각>.md    10분 단위 자동 버전
  backups/<날짜>/                  폴더 복사본
```

문서 표기 규칙(이 문서와 `DESIGN_SPEC.md`, `PROMPTS.md`가 같다):
- 2절 예시의 `project`는 `work.json`, 최상위의 `world`·`relations`·`timeline`·`threads`는 `bible/` 아래 파일이다.
- 모든 JSON에 `schemaVersion`(정수)과 편집 충돌 검사용 `rev`(정수)가 있다. 알 수 없는 필드는 마이그레이션에서 보존한다.
- 목록 파일(`relations`, `timeline`, `threads`, `chapters/index`)은 `{"schemaVersion":1,"rev":1,"items":[…]}` 형태다.
- 위저드 로그의 순번은 문서 `rev`와 구분하려고 `seq`라 부른다.
- AI 공급자 id는 `claude`, `codex`다. 화면에는 "Claude", "ChatGPT"로 표시한다.
- `id`는 접두어 + 4자리 일련번호(`ch_0001`)이고 표시명과 분리한다. 이름이 바뀌어도 참조가 깨지지 않는다.
- 본문 파일(`chapters/ep001.md`)이 원고의 유일한 진실이다. 장면의 순서와 경계는 본문의 마커 순서로 정하고, `scenes/*.json`에는 순서를 저장하지 않는다.
- 모든 파일은 같은 폴더에 임시 파일로 쓴 뒤 이름을 바꾸는 방식으로 저장한다(원자적 저장, `DESIGN_SPEC.md` 8.8절).

## 2. 핵심 엔티티

```jsonc
// work.json
{"id":"pj_0001","schemaVersion":1,"rev":1,"title":"균열 아래 청운문",
 "genres":["hunter","wuxia"],"genre_weights":{"hunter":60,"wuxia":40},
 "tags":["빙의"],                              // genres에 없는 설정 꼬리표: 빙의, 회귀, 이세계 등
 "style":{"pov":"third_limited","notes":""},   // first | third_limited | omniscient (W0에서 묻는다)
 "mix_policy":{
   "primary":"hunter",
   "system_relation":"translate",              // replace | layer | parallel | translate
   "vocab_zones":[{"id":"z_combat","style":"wuxia"},{"id":"z_daily","style":"modern"}],
   "accuracy_level":"loose",                   // strict | loose | alt_history | off
   "rank_mapping":[{"from":"sy_0001:3","to":"sy_0002:C"}],
   "knowledge_holders":[],
   "ext":{}},                                  // 회귀 횟수, 시간 흐름비, 편도/왕복 등 조합별 추가 규칙
 "logline":"E급 헌터가 게이트 심층에서 사라진 무림 문파의 석비를 발견한다","tone":["진지","사이다"],
 "target":{"eps":200,"chars_per_ep":5500},
 "assist_level":"L1",                          // L0 | L1 (기본 L1). L2는 호출 단위 옵션이라 저장하지 않는다
 "ai":{"primary":"claude","per_task":{"world":"claude","ctx":"claude","dir":"claude","exp":"codex","check":"claude"},"auto_fallback":false},
 "pref_rules":[],                              // 최대 12줄, 작가가 확정한 선호 규칙
 "wizard":{"step":"W6","done":["W0","W1","W2","W3","W4","W5"]},
 "exceptions":[]}                              // '의도한 것'으로 확정한 모순 경고

// world.json
{"id":"wd_0001","schemaVersion":1,"rev":1,"era":{"kind":"modern","year":2031,"calendar":"gregorian"},
 "premise":"7년 전 서울 지하로 무림이 눌려 들어왔고 게이트는 그 균열이다",
 "rules":[{"id":"ru_0001","text":"게이트 안에서는 내공이 마력으로 환산된다","hard":true}],
 "places":[{"id":"pl_0001","name":"강남 게이트존","aliases":["강남존"],"travel":[{"to":"pl_0002","days":0.3}]}],
 "society":{"races":[],"nations":[],"reactions":[{"id":"sr_0001","text":"각성자 병역 특례 논란"}]},
 "secrecy":{"public":["ru_0001"],"hidden":[]}}

// systems/sy_0001.json  (kind: magic | awakening | internal_energy | status_ladder | history_anchor)
{"id":"sy_0001","kind":"internal_energy","name":"내공","aliases":["기"],"source":"단전 축적",
 "unit":{"name":"갑자","years":60},"cost":"운기 중 무방비","limits":["영약 없이는 수련 연수만큼만 축적"],
 "ladder":[{"rank":1,"name":"삼류"},{"rank":2,"name":"일류"},{"rank":3,"name":"절정"}],   // 모든 체계가 ladder 키를 쓴다(무협 경지도 ladder)
 "maps_to":[{"system":"sy_0002","rule":"1갑자≈마력 3000"}],"vocab_zone":"z_combat",
 "stat_schema":[]}                             // 헌터물 상태창 항목 예: [{"key":"level"},{"key":"strength"}]

// history_anchor 체계의 추가 필드
//   "real_figures":[{"name":"이순신","born":1545,"died":1598,"involvement":1}],
//   "status_ladder":[…], "office_ranks":[…], "fact_policy":"…", "divergence_point":"…"

// factions/fc_0001.json
{"id":"fc_0001","name":"한국헌터협회","aliases":["협회"],"kind":"org","goal":"각성자 독점 관리",
 "resources":["심사권"],"allies":[],"enemies":["fc_0002"],"rank_system":"sy_0002","leader":"ch_0003","active_until":null}

// characters/ch_0001.json
{"id":"ch_0001","role":"protagonist","name":"한도윤","aliases":["도윤"],"age":{"value":29,"at":"ev_0001"},
 "appearance_hook":"오른손 흉터","intro_scene":"단독 임무 중 석비 앞에 선다",
 "desire":{"want":"빚 청산","need":"혼자 짊어지지 않는 법"},
 "lack":"가족을 잃음","false_belief":"강해지면 사람을 잃지 않는다",
 "secrets":[{"id":"sec_0001","text":"실제 내공은 2갑자","known_by":["ch_0002"],"reveal_ep":60}],
 "abilities":[{"system":"sy_0001","rank":3,"energy_years":null,"skills":["청운검"],"cost":"운기 중 무방비"}],
 "stats":{"level":17},"weaknesses":["대인 신뢰 부족"],
 "voice":{"style":"짧고 건조한 평어체","tics":["…"],"samples":[],"address":{"ch_0002":"어르신"},"banned_words":[]},
 "affiliations":["fc_0002"],"status":{"alive":true,"death_ep":null},
 "arc":{"start":"고립","turns":[{"ep":40,"text":"협회 제안 수락"}],"end":"공동체의 구심점"},
 "ai_filled":[],                               // 'AI가 알아서'로 채운 필드 경로 목록. 예: ["desire.need","secrets"] (개체 종류와 상관없이 모든 엔티티에 있다)
 "ext":{}}                                     // 역할별 추가 필드(3절)

// relations.json 의 items[] 한 건
{"id":"rel_0001","a":"ch_0001","b":"ch_0002","type":"master-disciple","a_to_b":"존경","b_to_a":"경계","public":true,
 "since":"ev_0001","changes":[{"ep":40,"to":"배신","event":"ev_0007"}]}

// timeline.json 의 items[] 한 건
{"id":"ev_0001","title":"게이트 심층 석비 발견","when":{"t":"2031-03-02","order":10},"ep_range":[1,1],
 "participants":["ch_0001"],"place":"pl_0001","effects":[{"type":"rank_change","char":"ch_0001","system":"sy_0002","to":"E"}],
 "reveals":[],"canon":true}

// threads.json 의 items[] 한 건 (떡밥)
// status는 저장하지 않는다. planted_ep, due_ep, 현재 회차로 계산한다:
//   resolved_ep가 있으면 resolved / due_ep까지 2회 이내면 imminent / 심은 지 10회 넘고 언급이 없으면 neglected / 그 외 active
{"id":"th_0001","title":"할아버지의 공책","planted_ep":1,"due_ep":null,"resolved_ep":null,"links":["ch_0001"],"note":""}

// scenes/sc_0001.json  (장면 순서는 본문 마커 순서가 기준이라 order 필드가 없다)
{"id":"sc_0001","schemaVersion":1,"rev":1,"ep":1,"pov":"ch_0001","place":"pl_0001","time":"ev_0001","characters":["ch_0001"],
 "goal":"석비의 글자를 확인한다","conflict":"교신 두절","hook":"석비가 반응한다",
 "flashback":false,                            // 사망 인물이 회상으로만 등장하는 장면이면 true (규칙 #3에서 제외)
 "summary":"",                                 // 3줄 이내. AI가 제안하고 작가가 확인한 것만 저장
 "hook_type":"반전",                           // 질문 | 위기 | 반전 | 폭로 | 예고  (AI 제안을 작가가 확인)
 "label":"중립",                               // 사이다 | 고구마 | 중립  (AI 제안을 작가가 확인)
 "status":"drafting","memo":[]}
```

## 3. 인물 역할별 확장과 장르 팩

### 3.1 역할별 확장 (`ext`)

| 역할 | 추가 필드 |
|---|---|
| 주인공 | `cheat{text,cost}`, `goal_eps`, `reader_pleasure` |
| 조연 | `function`(조력/라이벌/멘토/연애/코믹), `spotlight_eps[]` |
| 적대자 | `motive`, `justification`(스스로 옳다고 믿는 이유), `mirror_trait`, `escalation[]`, `defeat_condition` |

### 3.2 키 이름 통일

| 개념 | 키와 값 |
|---|---|
| 고증 수준 | `mix_policy.accuracy_level`: `strict`(엄격), `loose`(느슨), `alt_history`(대체역사), `off`(끔) |
| 등급·경지 사다리 | 모든 체계가 `ladder`. 무협의 경지도 `ladder`다 |
| 신분·관직 | `history_anchor` 체계의 `status_ladder`, `office_ranks` |
| 시점 | `work.style.pov` |

### 3.3 장르 팩 (`packs/*.json`)

금지어, 호칭, 시대 어휘, 어휘 구역 사전은 앱이 만들어 줄 수 없는 데이터라서 별도 산출물로 둔다. 초안은 AI가 만들고 작가가 확정한다.
항목은 `{"term":"스트레스","zone":"modern","avoid_in":["history:strict"],"note":"…"}` 형태이고, 규칙 #9와 표현 추천의 장르 금지어 검사가 읽는다.
팩이 비어 있어도 앱은 동작한다(규칙 #9가 꺼진다). 장르 팩 초안 만들기는 M2의 작업이다(`DESIGN_SPEC.md` 9절).

## 4. 위저드 로그와 피드백 로그

```jsonc
// ai/wizard.jsonl  한 줄 = 확정·되돌리기 1건 (append-only. 되돌리기는 이전 값을 복원하는 새 줄을 추가한다)
{"qid":"character.lack","seq":7,"state":"confirmed",   // confirmed | auto | skipped | reverted
 "value":{"lack":"가족을 잃음"},"source":"후보2+수정","depends":["character.name_role"],"needs_review":false,"ts":"…"}

// ai/feedback.jsonl  추천 카드 평가
{"card":"direction","option":"B","action":"adopt",    // adopt | save | hide | like | dislike
 "reason":"too_obvious","ai":"claude","ts":"…"}       // reason: mismatch | obvious | wild | voice | known | genre | similar
```

앞 문항을 고치면 그 항목에 의존하는 뒤 문항에 `needs_review`만 표시하고 자동으로 지우지 않는다.

## 5. 규칙 기반 모순 점검

모든 경고에 [원고 고치기] [설정 고치기] [의도한 것으로 확정] 선택지가 붙는다. 확정한 경고는 `work.exceptions[]`에 저장되어 다시 뜨지 않는다.

### 5.1 M2에 넣는 규칙 (입력 필드가 스키마에 있고 이름·수치 비교로 판정 가능)

| # | 입력 → 판정 | 경고 문구 예 |
|---|---|---|
| 1 | 인물의 `abilities.rank`가 체계 `ladder`에 없음 | "'화경'은 '내공' 체계에 정의되지 않았습니다." |
| 3 | `status.death_ep`보다 뒤 회차 장면의 `characters`에 있고 `flashback`이 아님 | "한도윤은 12화에서 사망했는데 30화에 등장합니다." |
| 4 | 소속 id가 없거나 `active_until`을 지남 | "소속 '암천회'가 22화에서 해체됐습니다." |
| 5 | 관계 역방향 불일치, 부모의 나이가 자식 이하 | "'부모' 관계인데 나이가 역전되었습니다." |
| 8 | 연속 장면의 이동 거리(`travel.days`)가 경과일보다 큼 | "서울→무당산은 3일 거리인데 장면 간 경과는 1일입니다." |
| 9 | 어휘 구역 밖에서 체계 용어 사용, 또는 역사+엄격에서 금지어 사전 매칭 (사전 기반, 한계 있음) | "일상 구역에서 '내공'이 쓰였습니다. 의도한 혼용인가요?" |

규칙 #3과 #8의 "장면에 등장", "경과일"은 장면 메타(`characters`, `time`)를 작가가 확인한 값 기준이다. 본문에서 자동으로 뽑지 않는다.

### 5.2 후순위 규칙 (입력 필드가 아직 없거나 본문에서 사실을 뽑아야 함)

| # | 입력 → 판정 | 필요한 것 |
|---|---|---|
| 2 | 내공 연수(갑자×60)가 나이에서 수련 가능 기간을 넘고 영약·기연 태그가 없음 | `abilities[].energy_years` 입력과 "수련 시작 나이" 규칙 |
| 6 | 비밀을 모르는 인물이 공개 전에 해당 키워드를 말함 | 본문의 화자 판별. 키워드 매칭이라 오탐이 많다 |
| 7 | 실존 인물의 생몰년 밖 장면 시점 | `history_anchor.real_figures[].born/died`와 연호·음력 변환 |
| 10 | 같은 인물의 등급이 장면 사이에서 바뀌었는데 `rank_change` 사건이 없음 | 장면별 관측 등급 기록 |

### 5.3 한계와 AI 분담

점검은 구조화 필드(수치, 생사, 소속, 등급, 시간·거리)와 이름·키워드 매칭에 한정한다. 자유 서술에서 사실을 뽑는 판정(예: "그는 오른팔로 검을 들었다")은 규칙으로 안정적이지 않다.
그런 판정은 규칙 엔진이 낸 후보를 AI 설정 점검(`PROMPTS.md` 3절 T6)이 판정하는 방식으로 분담한다.
경고 위치는 장면 단위가 기본이고, 이름·수치가 본문에서 정확히 일치할 때만 문장 단위로 표시한다.

## 6. 위저드 문항 은행

문항 은행은 앱과 함께 배포하는 데이터 파일(`questions/*.json`)이고 작품 데이터가 아니다. UI, 프롬프트, 검증기가 같은 파일을 읽는다.

```jsonc
{"qid":"character.lack","step":"W6","label":"가지지 못한 것, 잃은 것",
 "genres":["*"],                                  // 장르 필터. "*"는 모든 장르, 그 외는 ["hunter"] 같은 목록
 "roles":["protagonist","supporting"],            // 인물 문항일 때만
 "required":true,                                 // true면 "AI가 알아서" 불가. 핵심 문항(core)과 같다
 "target":{"entity":"character","path":"lack","merge":"set"},
 "depends":["character.name_role"],               // 정적 선행 문항. 이 문항의 확정값 전문을 프롬프트에 넣는다
 "value_schema":{"type":"string","maxLength":120},// JSON Schema 부분집합. 후보의 값 검증에 쓴다
 "hint":"상실한 대상과 시점을 한 문장으로"}
```

규칙:
- **id 발급:** AI는 새 개체(인물, 세력, 장소)를 `@새:이름` 임시 키로만 쓰고, 기존 개체는 자료 블록에 적힌 id로만 참조한다. 확정할 때 앱이 `ch_0003` 같은 id를 발급하고 같은 단계의 임시 키 참조를 치환한다. 존재하지 않는 id를 쓴 후보는 스키마 위반으로 처리한다.
- **병합:** `set`은 값을 덮어쓴다. `append`는 배열 끝에 추가한다(같은 제목은 제외). `merge_object`는 키 단위로 병합한다. 확정한 뒤 수정은 항상 `set`이다.
- **아직 없는 개체를 가리키는 참조**(`known_by`, `travel.to`, `rank_mapping` 등)는 `null`로 저장하고 W8·W10에서 채우도록 안내한다.
- **핵심 문항 7개:** `work.genres`(W0), `work.logline`(W1), `world.premise`와 `world.rules`(W2), 주인공의 `name_role`, `desire`, `lack`(W6). "집필 시작 가능" 배지는 이 7개가 확정되면 켠다. 시안은 대표 6단계라서 필수 단계 2개(세계의 뿌리, 주인공)로 줄여 표시한다.
- **호출 묶음:** 한 단계의 문항을 최대 4개까지 한 번의 AI 호출로 받는다(`PROMPTS.md` T1). 화면은 문항을 한 번에 하나씩 보여 준다.
- **인물 문항:** 주인공은 0번 "이름·나이·역할"부터 9문항, 조연은 단축형 3문항(이름·역할 / 욕망·결핍 / 말투·비밀), 적대자는 5번 대신 `justification`과 `mirror_trait`를 묻는다(`DESIGN_SPEC.md` 2.3절).

## 7. 이름 연결 규칙

고유명사 밑줄, 카드 선별 점수, 규칙 #3·#9가 모두 이 매칭을 쓴다.

1. 이름과 별칭(`aliases`)을 모두 사전에 넣고 **가장 긴 것부터** 맞춘다. "한도윤"이 있으면 그 안의 "도윤"은 따로 잡지 않는다. 같은 카드의 이름과 별칭이 겹치면 한 번만 연결한다.
2. 직후에 **조사 목록**(은·는·이·가·을·를·의·에·에게·와·과·도·만·으로·로·께·이다·입니다 등)이 오거나, 한글 음절이 오지 않아야 연결한다. "도윤이"는 이름 + 조사 "이"로 처리하고, "도윤아"처럼 호격이 오면 호격 조사 목록에 넣는다.
3. **2글자 미만 별칭은 자동 연결에서 제외한다.** 카드에 등록할 때 "한 글자 별칭은 자동 연결되지 않습니다"라고 알린다(예: 별칭 "기").
4. 서로 다른 카드가 같은 별칭을 가지면 **모호함** 표시를 하고 연결하지 않는다. 등록할 때 충돌을 알린다.
5. 앱이 만드는 문장(경고문 등)은 받침 판정 함수로 은/는, 이/가, 을/를을 고른다.
6. 한글 입력 중에는 글자 조합이 끝난 뒤에만 연결한다.
