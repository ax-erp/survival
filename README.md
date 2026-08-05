# 🎰 AX Survival (Pachinko Survival Lottery)

웹 기반의 3D 입체 물리 엔진(Matter.js)을 활용한 **250명 대규모 서바이벌 추첨 시스템**입니다.  
사내 이벤트, 엑셀 명단 추첨, 경품 행사 등에서 드라마틱하고 흥미진진한 1등 당첨자 추첨을 연출할 수 있습니다.

---

## 🚀 빠른 시작 (Quick Start)

### 1. 사전 요구사항 (Prerequisites)
- **Node.js** v18.0.0 이상
- **npm** v9.0.0 이상

### 2. 설치 (Installation)
프로젝트 레포지토리를 클론하거나 이동한 후 의존성 패키지를 설치합니다.

```bash
cd pachinko
npm install
```

### 3. 개발 서버 실행 (Development Server)
```bash
npm run dev
```
실행 후 브라우저에서 `http://localhost:5173` 에 접속합니다.

---

## 🛠️ 빌드 및 배포 (Build & Deployment)

### 프로덕션 번들 생성 (Build)
```bash
npm run build
```
빌드가 완료되면 `dist/` 디렉토리에 정적 파일이 생성됩니다.

### 프로덕션 빌드 미리보기 (Preview)
```bash
npm run preview
```

---

## 💡 주요 기능 (Key Features)

### 1. ⏱ 소요 시간 맞춤 설정 (0.5분 ~ 10분)
- **0.5분(30초 초고속)**부터 **10분(마라톤 추첨)**까지 추첨 시간을 자유롭게 설정할 수 있습니다.
- 설정된 시간 비율에 맞춰 **1단 ~ 4단 문(Gate)이 차례로 자동 개방**됩니다.

### 2. 📁 엑셀 / CSV 스마트 업로드
- **자동 맵핑:** 헤더 이름을 자동으로 감지하여 `이름`과 `사번`을 `이름 (사번)` 형식으로 자동 결합합니다. (시스템 헤더 문구 자동 제외)
- **샘플 제공:** 버튼 클릭 한 번으로 `250_샘플.xlsx` 양식 파일을 바로 다운로드할 수 있습니다.

### 3. 🏛 3D 5단계 서바이벌 물리 기믹
- **1단계:** 상단 피라미드 핀 필드 & 양옆 초대형 꽝 구멍
- **2단계:** 3D 입체 대형 회전 핀 판 (`Y = 308px` 회전 중심)
- **3단계:** 정교한 지그재그 장애물 & 바깥쪽 꽝 구멍
- **4단계:** 중형 회전 핀 판 (`Y = 651px` 회전 중심) & 개방 문
- **5단계:** **A형 메카닉 아치 방어 지형(Cyber-Shield Archway)** & 회전 수반 (1등 당첨 구멍 1개 + 꽝 구멍 2개)

### 4. 🎬 1등 당첨 순간 슬로우 모션 리플레이 & 확대 줌
- **실시간 프레임 레코딩:** 1등 골인 직전/직후 최근 7초간의 물리 데이터를 자동 기록합니다.
- **0.5배속 슬로우 모션:** 1등 골인 순간을 0.5배속으로 다시 감상할 수 있습니다.
- **1.8x 확대 줌:** 리플레이 재생 시 5단계 수반으로 **1.8배속 카메라 줌 인**되며, 화면 클릭으로 `1.8x 확대 줌 ↔ 전체보기`를 언제든 전환할 수 있습니다.
- **원클릭 재추첨:** 당첨 팝업이나 대시보드에서 `🔄 리셋 후 바로 다시 추첨하기` 버튼으로 즉시 다음 추첨을 진행할 수 있습니다.

### 5. 👋 안티 스턱 (Anti-Stuck) 시스템 & 강제 흔들기
- **자동 흔들기:** 특정 단계에 구슬이 2.5초 / 4.5초 이상 멈춰 있을 경우 부드러운 교란력을 가해 아래 단계로 내려보냅니다.
- **수동 강제 흔들기:** `👋 기계 강제 흔들기` 버튼을 눌러 기계 전체를 흔들 수 있습니다.

### 6. 📊 250개 구슬 생존/탈락 대시보드
- **250구 매트릭스:** 생존(초록), 탈락(빨강), 1등 당첨(골드) 상태를 실시간 시각화합니다.
- **검색 & 필터:** 구슬 번호(`#77`)나 참가자 이름으로 개별 구슬을 빠르게 조회할 수 있습니다.

---

## 🛠️ 기술 스택 (Tech Stack)

| 구분 | 기술 / 라이브러리 |
|---|---|
| **Core Framework** | Vanilla HTML5 Canvas / Modern JavaScript (ES Modules) |
| **Build Tool** | [Vite](https://vitejs.dev/) |
| **Physics Engine** | [Matter.js](https://brm.io/matter-js/) (2D Canvas Rigid Body Physics) |
| **Spreadsheet Engine** | [XLSX (SheetJS)](https://sheetjs.com/) |
| **Styling** | Modern CSS3 (Glassmorphic Dark UI, Neon Effects, Responsive Layout) |
| **Audio** | Web Audio API Custom Synthesizer |

---

## 📂 프로젝트 구조 (Project Structure)

```
pachinko/
├── index.html                  # 메인 UI HTML 구조 & 모달 팝업
├── package.json                # 의존성 및 빌드 스크립트
├── vite.config.js              # Vite 설정
├── src/
│   ├── main.js                 # UI 이벤트 연결 및 애플리케이션 진입점
│   ├── style.css               # 다크 모드 글라스모피즘 스타일시트
│   ├── physics/
│   │   └── pachinkoEngine.js   # Matter.js 기반 물리 렌더링 엔진 & 리플레이
│   └── utils/
│       ├── audioSynth.js       # Web Audio API 사운드 효과음
│       └── excelParser.js      # 엑셀 파서 & 250_샘플.xlsx 생성기
└── README.md                   # 프로젝트 사용 가이드 문서
```

---

## 📄 라이선스 (License)

이 프로젝트는 MIT 라이선스를 따릅니다.
