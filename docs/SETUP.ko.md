# 사이트 연결 안내서

처음 한 번만 하면 돼요. 끝나면 노션에 올린 내용이 **1시간 안에** 사이트에 자동으로 반영돼요.

---

## 1. 노션 Projects 표에 "영문 제목" 칸 추가하기 (선택)

사이트의 큰 제목은 모두 영어로 나와요. 작업마다 영어 제목을 직접 정하고 싶을 때만 하세요.

1. 노션에서 **JUWON's ARCHIVES** 페이지를 열어요.
2. Projects 표 맨 오른쪽 **＋** 를 눌러요.
3. 종류는 **텍스트**, 이름은 정확히 **`영문 제목`** 으로 만들어요.
4. 원하는 작업에 영어 제목을 적어요. 예: `Motion Works`

비워 두면 이렇게 들어가요: 3D 디자인 → 3D DESIGN, AI 생성 → AI GENERATED, 2D → 2D GRAPHIC, TouchDesigner → TOUCHDESIGNER

## 2. 노션 연결 키 만들기 (5분)

1. https://www.notion.so/profile/integrations 에 들어가요.
2. **새 API 통합(New integration)** 을 눌러요.
   - 이름: `portfolio-site` (아무거나 괜찮아요)
   - 워크스페이스: JUWON's ARCHIVES가 있는 곳
   - 유형: **내부(Internal)**
3. 저장한 뒤 나오는 **내부 통합 시크릿(Internal Integration Secret)** 을 복사해 두세요. `ntn_` 으로 시작하는 긴 글자예요.
   - ⚠️ 이 키는 비밀번호와 같아요. 다른 사람에게 보내거나 공개된 곳에 붙여 넣지 마세요.
4. 노션으로 돌아가 **JUWON's ARCHIVES** 페이지 오른쪽 위 **⋯** → **연결(Connections)** → 방금 만든 `portfolio-site` 를 선택해요.
   - 하위 페이지와 표에도 자동으로 적용돼요.

## 3. GitHub 준비하기

1. https://github.com 에 가입해요. 이미 계정이 있으면 건너뛰세요.
2. 오른쪽 위 **＋ → New repository** 를 눌러요.
   - Repository name: **`<내 아이디>.github.io`** (예: 아이디가 `juwon` 이면 `juwon.github.io`)
   - **Public** 을 선택해요. 무료로 사이트를 운영하려면 공개여야 해요. 공개되는 건 사이트 코드뿐이고, 노션 키는 공개되지 않아요.
   - 나머지는 건드리지 말고 **Create repository**
3. 만든 저장소에서 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: **`NOTION_TOKEN`**
   - Secret: 2단계에서 복사한 키
4. **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿔요.

## 4. 코드 올리기

Claude에게 "저장소 만들었어, 아이디는 ○○○야"라고 알려 주세요. 코드는 Claude가 올려 드려요.

## 5. 첫 업데이트 실행하기

1. 저장소의 **Actions** 탭 → 왼쪽 **Deploy** → 오른쪽 **Run workflow** → 초록 버튼
2. 3~5분 뒤 초록색 체크가 뜨면 완성이에요.
3. 사이트 주소: **`https://<내 아이디>.github.io`**

---

## 그다음부터는

- **노션에 작업을 올리기만 하면 돼요.** 1시간마다 사이트가 노션을 확인하고, 바뀐 게 있을 때만 업데이트해요.
- **급할 때**: Actions → Deploy → **Run workflow** 를 누르면 바로 업데이트돼요.
- **새 작업 추가**: Projects 표에 새 줄을 만들고 커버 이미지를 넣은 뒤, 페이지 안에 글·이미지·영상·인스타그램 링크를 넣어요.
- **영상은 95MB 이하**로 올려 주세요. 더 크면 사이트에는 "VIEW ON NOTION" 버튼만 나와요. 큰 영상은 인스타그램이나 유튜브에 올리고 링크를 넣는 걸 추천해요.

## 문제가 생기면

- 업데이트가 실패하면 GitHub가 메일을 보내요. 그동안 사이트는 **마지막 정상 상태 그대로** 유지돼요.
- Actions 탭에서 빨간 ✕ 를 눌러 보면 이유가 적혀 있어요. 자주 있는 경우는 이래요.
  - `NOTION_TOKEN is not set` → 3-3단계의 Secret 이름을 확인하세요.
  - `Could not find block` / `unauthorized` → 2-4단계(페이지에 연결 추가)를 확인하세요.
  - `has no English title` 경고 → 실패는 아니에요. 해당 작업에 `영문 제목`을 채우면 사라져요.
