# 껄무새 매크로 실행기 (Macro Runner)

코딩을 모르는 회원도 **더블클릭 한 번**으로 매크로를 돌릴 수 있게 만든 GUI 실행기입니다.
터미널·파이썬 설치가 필요 없는 단일 `.exe` 로 배포합니다.

## 화면(요청 사양)
1. **매크로 파일 선택** — 껄무새 빌더에서 내려받은 `*.ggm.json`
2. **바이낸스 실거래 여부** — 체크 시 메인넷(실제 자금), 해제 시 테스트넷(가짜 자금)
3. **바이낸스 API 키 / 시크릿** — 로컬 메모리에서만 사용(서버 전송·저장·로깅 안 함)
4. **껄무새 회원 키** — 마이페이지에서 발급받아 입력

## 동작
- 시작하면 서버에 세션을 만들고, 몇 초마다 상태(현재가·포지션·손익)를 올립니다.
- 마이페이지 **내 매크로 실행 현황**에서 실시간으로 보이고, 종료 버튼으로 원격 종료됩니다.
  - **매크로만 종료**: 루프만 멈춤(열린 포지션 유지)
  - **청산 후 종료**: 보유 포지션을 시장가로 정리한 뒤 종료
- 거래소 API 키/시크릿은 **서버로 전송되지 않습니다**. 서버로 가는 건 회원 키 + 구동 상태뿐입니다.

## 개발자: 실행/빌드
```bash
# 소스로 바로 실행(테스트)
pip install -r requirements.txt
python macro_runner.py

# 단일 exe 빌드 (파일명은 영문 권장 — Release URL 깨짐 방지. 창 제목은 그대로 한글)
pip install pyinstaller
pyinstaller --onefile --noconsole --name ggparrot-runner macro_runner.py
# 결과물: dist/ggparrot-runner.exe
```

### 배포 (GitHub Releases 권장)
1. 위에서 만든 `dist/ggparrot-runner.exe` 를 레포의 **Releases** 에 첨부해 publish
2. 첨부 파일의 다운로드 링크를 복사 (예: `.../releases/download/runner-v1/ggparrot-runner.exe`)
3. 백엔드 환경변수 `RUNNER_DOWNLOAD_URL` 에 그 링크를 설정
   → 다운로드 페이지 버튼이 자동으로 그 링크로 연결됨(서버에 파일을 둘 필요 없음)
- 레포가 **비공개면** 링크로 로그인 없이 못 받으니, 레포를 공개로 하거나 exe 전용 공개 레포를 쓰세요.
- 서버에 직접 파일을 두려면 대신 `RUNNER_EXE_PATH` 를 그 경로로 설정하세요.

### 서버 주소
기본값은 배포 서버(`https://gg-parrot.onrender.com`)입니다. 바꾸려면 빌드 전에
환경변수를 설정하거나 `macro_runner.py` 상단의 `SERVER_BASE` 를 수정하세요.
```bash
# 예: 로컬 백엔드로 테스트
GGP_SERVER_BASE=http://localhost:8000 python macro_runner.py
```

### 1회 주문 상한 등(선택)
- `MAX_ORDER_USDT` (기본 100): 1회 주문 상한(USDT)
- `ORDER_CAP_BASIS` (`notional`|`margin`): 선물 상한 기준
- `GGP_MEMBER_KEY`: 회원 키 입력칸 기본값

## ⚠️ 배포 시 주의
- **서명 안 한 exe** 는 Windows SmartScreen/백신 경고가 뜰 수 있습니다. 코린이 이탈을
  줄이려면 코드 서명 인증서가 필요합니다(안내 문구로 우회법을 함께 제공하세요).
- **실거래(메인넷)** 는 실제 자금이 움직입니다. 본 도구는 투자 조언이 아니며,
  손익 책임은 사용자 본인에게 있습니다. 실서비스 배포 전 법무·컴플라이언스 검토를 권합니다.
