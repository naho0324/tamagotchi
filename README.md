# 픽셀 다마고치
## 구조 (로컬 저장)
- 펫·코인·아이템은 **각 브라우저의 localStorage**(`tg_save`)에 저장돼요. 서버에는 저장 파일(data.json)이 없어요 → 나중에 Android/PC 앱(WebView, Capacitor, Electron 등)으로 감싸기 쉬워요.
- 돌봄 규칙은 `game.js` 하나를 서버와 클라이언트가 같이 써요(UMD, 브라우저에서는 `/game.js` → `window.Game`). 스탯 감소·성장·병·죽음·오프라인 따라잡기(타임스탬프, 최대 14일)와 상점이 모두 클라이언트에서 돌아요.
- 방에 들어가거나 미니게임에 참여할 때 클라이언트가 펫 스냅샷(이름, 캐릭터, 단계, 스탯)을 보내고, 서버는 값을 범위 안으로 가볍게 정리(clamp)만 해요. 결과(`apply` 이벤트: 코인 +, 에너지 -)를 받으면 클라이언트가 자기 저장에 반영해요. 조작은 막지 않아요(친구끼리 노는 게임).
- 💾 백업: 홈의 "백업" 버튼 → 내보내기 코드(`TG1.` + base64 JSON)를 복사 / 다른 기기에서 붙여넣고 확인 후 불러오기.
## 방 (광장)
- 공개 광장은 없어요. "방 만들기"로 6자리 코드(0/O/1/I/L 제외)를 만들고 친구는 "코드로 참여". 최대 6명, 모두 나가면 방은 사라져요.
- 배구 매칭 대기열, 스네이크, 보스 레이드 모두 방 안에서만 열려요. 🤖 연습 경기는 그대로.
## 보스 레이드 데미지
성장 단계별 배율: 알 x0.5 · 아기 x1 · 어린이 x1.5 · 어른 x2.2 (대기실에 표시). 보스 HP = (500 + 300×인원) × 난이도 배율(쉬움 .6 / 보통 .85 / 어려움 1.5) — 쉬움은 아기 단계 혼자서도 깰 수 있게 맞춰져 있어요.
## 실행/테스트
- `./start.sh` 서버 + cloudflared 빠른 터널, 또는 `nohup node server.js >> server.log 2>&1 &` (포트 3456, PORT로 변경)
- `npm test` (서버 실행 중일 때): sim, rooms, smoke, snake, raid, energy. `RAID_TRIALS=5`로 레이드 반복.
- 브라우저: `python3 test/browser_rooms.py`, `test/browser.py URL`, `test/browser_snake.py`, `test/browser_raid.py`, `test/browser_sprites.py URL`. 부화를 빠르게: 페이지 주소에 `?hatch=1500`.
- 로그인 교체: auth.js의 resolvePlayer() (지금은 로컬 닉네임)
## Render 배포
GitHub에 push 후 Render Blueprint(render.yaml)로 생성. 서버는 상태 저장이 없어서 무료 플랜 재시작에도 펫이 사라지지 않아요(방만 초기화).
