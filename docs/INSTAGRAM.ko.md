# 인스타그램 → 노션 자동 정리

인스타에 올린 게시물이 1시간 안에 노션의 알맞은 탭으로 들어가고, 사이트도 함께 업데이트돼요.

## 해시태그 규칙

| 캡션에 넣을 해시태그 | 들어가는 노션 탭 |
|---|---|
| `#3d` | 3D DESIGN |
| `#ai` | AI GENERATED |
| `#graphic` | 2D GRAPHIC |
| `#touchdesigner` | TOUCHDESIGNER |

- 해시태그가 여러 개면 **캡션에서 먼저 나온 것**을 따라가요.
- `#3dart`, `#aiart`처럼 비슷하기만 한 태그는 해당하지 않아요.
- 게시물은 그 탭 페이지의 **맨 아래에 새 구역**(구분선 + 게시물 링크)으로 들어가요.
- 해시태그가 없는 게시물은 넣지 않고, GitHub → Actions 실행 결과에 "not added"로 남겨요.
- 자동화를 켠 날(2026-11-06) **이후에 올린 게시물만** 넣어요. 이미 노션에 있는 게시물은 다시 넣지 않아요.
- 규칙은 `src/lib/ig-route.ts`의 `HASHTAG_ROUTES`에서 바꿀 수 있어요.

## 처음 한 번 준비하기

1. **인스타 계정을 프로페셔널(크리에이터) 계정으로 전환** — 인스타 앱 → 설정 → 계정 유형 및 도구 → 프로페셔널 계정으로 전환 (무료).
2. **Meta 개발자 앱 만들기** — developers.facebook.com → 내 앱 → 앱 만들기 → 사용 사례 "Instagram에서 메시지 및 콘텐츠 관리" 선택.
3. **인스타 로그인 API 설정** — 앱 대시보드 → Instagram → "Instagram 로그인을 통한 API 설정" → "액세스 토큰 생성"에서 내 인스타 계정을 추가하고 토큰을 만들어요 (권한: `instagram_business_basic`). 토큰은 복사해서 다음 단계에서만 쓰고, 채팅이나 다른 곳에 붙여넣지 마세요.
4. **GitHub에 토큰 저장** — 저장소 → Settings → Secrets and variables → Actions → New repository secret → 이름 `IG_TOKEN`, 값에 토큰.
5. **노션 연결 권한 확인** — notion.so/my-integrations → 사이트용 연결 → 기능(Capabilities)에서 "콘텐츠 삽입"이 켜져 있는지 확인.
6. **(선택) 토큰 자동 갱신** — 인스타 토큰은 60일마다 만료돼요. GitHub → Settings → Developer settings → Fine-grained tokens에서 이 저장소만, 권한 "Secrets: Read and write"로 토큰을 만들어 `GH_SECRETS_TOKEN`이라는 이름의 Secret으로 저장하면 매일 자동으로 새 토큰으로 바꿔요. 안 하면 60일마다 3단계를 다시 해서 `IG_TOKEN`을 바꿔 주세요.

준비가 끝나면 Actions → Deploy → **Run workflow**로 바로 확인할 수 있어요. 실행 결과 요약에 어떤 게시물이 어느 탭에 들어갔는지 나와요.
