# 픽셀 다마고치
- `./start.sh` 서버 + cloudflared 빠른 터널을 재시작하고 공개 URL을 PUBLIC_URL.txt에 씁니다
- 서버만 실행: `nohup node server.js >> server.log 2>&1 &` (포트 3456, PORT 환경변수로 변경 가능)
- 테스트: `node test/smoke.js`, `node test/practice.js`, `node test/sim.js`, `python3 test/browser.py http://localhost:3456`
- 로그인 교체: auth.js의 resolvePlayer()
- 미니게임: 배구(volley.js, 1:1), 스네이크(snake.js, 1~6명) — `node test/snake.js`, `python3 test/browser_snake.py`
## Render 배포
GitHub에 push 후 Render에서 Blueprint(render.yaml)로 생성. PORT는 Render가 주입. 무료 플랜은 디스크가 없어 data.json이 재시작 시 초기화됨(DATA_DIR + 디스크로 해결).
