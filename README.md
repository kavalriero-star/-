# 🏢 Pixel Office AI - 가상 오피스 AI 에이전트

가상 사무실에서 일하는 픽셀 아트 캐릭터 형태의 AI 에이전트 프로젝트입니다.
Phaser.js 기반 2D 가상 오피스에서 Claude AI가 구동하는 에이전트들이 협업합니다.

## 주요 기능

- **픽셀 아트 가상 오피스**: 16x16 타일 기반의 2D 사무실 환경
- **AI 에이전트**: Claude API를 활용한 지능형 캐릭터 (Atlas, Nova, Pixel)
- **도구 사용 (Tool Use)**: 이동, 대화, 작업, 에이전트 생성, 상호작용
- **실시간 통신**: Socket.io 기반 실시간 상태 동기화
- **채팅 인터페이스**: 에이전트에게 자연어로 명령 전송

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | Phaser.js 3, HTML/CSS, ES Modules |
| 백엔드 | Node.js, Express |
| AI | Anthropic Claude API (Tool Use) |
| 통신 | Socket.io |
| 에셋 | pngjs로 프로그래매틱 생성 |

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env
# .env 파일에 ANTHROPIC_API_KEY 입력

# 3. 실행 (에셋 자동 생성 + 서버 시작)
npm start
```

브라우저에서 `http://localhost:3000` 접속

> **참고**: API 키 없이도 Mock 모드로 동작합니다.

## 프로젝트 구조

```
├── server/
│   ├── index.js              # Express + Socket.io 서버
│   ├── config.js             # 환경설정
│   ├── routes/api.js         # REST API
│   ├── services/
│   │   ├── claude.js         # Claude API + Tool Use 루프
│   │   └── agentManager.js   # 에이전트 상태 관리
│   ├── tools/                # AI 도구 정의
│   │   ├── movement.js       # move_to
│   │   ├── speech.js         # speak
│   │   ├── work.js           # work_on_task
│   │   ├── spawn.js          # spawn_agent
│   │   └── interact.js       # interact_with_agent
│   └── socket/handlers.js    # 소켓 이벤트 핸들러
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── main.js           # Phaser 게임 초기화
│       ├── scenes/           # Boot, Office, UI 씬
│       ├── entities/         # Agent 스프라이트
│       ├── managers/         # Socket, Agent 매니저
│       └── ui/               # 채팅, 정보 패널
└── scripts/
    └── generate-assets.js    # 픽셀 아트 에셋 생성기
```

## 기본 에이전트

| 이름 | 역할 | 색상 |
|------|------|------|
| Atlas | Project Manager | 🔵 파랑 |
| Nova | Developer | 🟢 초록 |
| Pixel | Designer | 🟣 보라 |

## 채팅 명령 예시

- `"회의실로 이동해"` → 에이전트가 회의실로 이동
- `"새로운 QA 테스터를 불러줘"` → 새 서브 에이전트 생성
- `"코드 리뷰 작업을 시작해"` → 작업 상태로 전환
- `"Nova에게 버그 리포트를 전달해"` → 에이전트 간 상호작용

## 라이선스

MIT
