# GitHub Pages 배포하기

이 폴더는 빌드가 필요 없는 배포용 소스입니다. HTML·CSS·JavaScript와 폰트가 모두 포함되어 있으며, 편집부·피로 표현·원고 제본 기능까지 들어 있습니다. 별도 서버, Cloudflare, API 키, 데이터베이스 설정은 필요 없습니다.

## 1. 새 저장소 만들기

GitHub에서 **New repository**를 선택합니다.

- Owner: 본인 계정 `0826fry`
- Repository name: 예를 들어 `sometimes-bananas`
- Visibility: **Public**
- README 자동 생성: 켜지 않아도 됩니다. 이 폴더에 README가 있습니다.

기존 포트폴리오 저장소 `apple_soap`와 별개로 만들면 두 웹사이트를 따로 운영할 수 있습니다.

## 2. 파일 업로드하기

1. 받은 ZIP의 압축을 풉니다.
2. 압축을 푼 폴더를 열어 `index.html`, `app.js`, `style.css`, `fonts` 폴더 등이 보이는 곳으로 들어갑니다.
3. 저장소에서 **Add file → Upload files**를 누릅니다. 비어 있는 저장소라면 **uploading an existing file** 링크가 보일 수 있습니다.
4. **이 내용물 전체를** 업로드합니다. `fonts`, `tests`, `docs` 폴더도 함께 올립니다.
5. **Commit changes**를 누릅니다.

중요: ZIP 파일 자체나 바깥 폴더 하나를 올리는 것이 아닙니다. 저장소의 Code 첫 화면에 `index.html`이 바로 보여야 합니다. `sometimes-bananas-github-pages/index.html`처럼 한 단계 더 안쪽에 있으면 안 됩니다.

`.nojekyll`도 포함되어 있습니다. Mac Finder에서는 **Command + Shift + .**로 숨김 파일을 표시한 뒤 함께 선택할 수 있습니다. 빠뜨렸다면 GitHub의 **Add file → Create new file**에서 파일명을 `.nojekyll`로 적고, 내용에 `Static site`를 넣어 저장해도 됩니다. 이 파일은 GitHub가 별도 Jekyll 변환을 하지 않도록 합니다.

## 3. Pages 켜기

저장소의 **Settings → Pages → Build and deployment**에서 다음과 같이 설정합니다.

| 항목 | 값 |
| --- | --- |
| Source | Deploy from a branch |
| Branch | main |
| Folder | / (root) |

**Save**를 누릅니다. Source를 GitHub Actions로 바꾸거나 별도 워크플로를 작성할 필요는 없습니다.

**Custom domain은 비워두세요.** `0826fry.github.io/sometimes-bananas/`는 기본 배포 주소이며 이 칸에 입력하는 값이 아닙니다.

## 4. 배포된 주소 열기

저장소 이름을 `sometimes-bananas`로 만들었다면 예상 주소는 다음과 같습니다.

`https://0826fry.github.io/sometimes-bananas/`

이 주소는 아직 만들어지지 않았을 수 있으며, 위 설정으로 배포한 뒤 사용할 수 있습니다. 저장소 이름을 다르게 지으면 마지막 경로도 달라집니다. 정확한 주소는 **Settings → Pages**의 배포 완료 안내에서 확인하세요.

배포 중에는 **Actions**에서 Pages 작업 상태를 확인할 수 있습니다. 초록색 완료 표시가 나온 뒤 주소를 여세요.

## 5. 동작 확인

- 짧은 문장을 맡기면 타이핑과 편집이 진행되는지
- 소리 켬을 누른 뒤 타건음이 나는지
- 바나나 지급과 기운 변화가 작동하는지
- 외주함에서 원고를 나눠 맡길 수 있는지
- 완성 후 영수증과 제본 버튼이 나타나는지
- 책을 파일로 내려받고, 새로고침 후 책장에서 다시 열 수 있는지

## 저장된 기록에 관하여

기록은 주소의 출처(origin)와 현재 브라우저에 저장됩니다. 기존 `chatgpt.site`에서 만들었던 원고·피로·책장은 새 `github.io` 주소로 자동 이전되지 않습니다. 간직하고 싶은 완성본은 기존 사이트에서 책이나 영수증 파일로 내려받아 두세요. 파일을 새 사이트에 다시 불러오는 기능은 현재 없습니다.

같은 GitHub 주소의 코드를 업데이트하는 것만으로 브라우저 기록이 지워지지는 않습니다. 다른 기기·브라우저에서는 별도 기록이며, 브라우저의 사이트 데이터를 삭제하면 저장 내용도 사라집니다.

## 자주 생기는 문제

| 증상 | 확인할 것 |
| --- | --- |
| 저장소 제목이나 README만 보임 | `index.html`이 `main`의 최상단에 있는지, Pages 폴더가 `/ (root)`인지 확인 |
| 404 | Pages 작업 완료 여부와 실제 저장소 이름 확인 |
| 글씨만 나오거나 버튼이 안 됨 | JS·CSS·`fonts` 폴더까지 전부 업로드했는지 확인 |
| 컴퓨터에서 index.html을 더블클릭했더니 기능이 멈춤 | ES 모듈을 사용하므로 배포 주소나 HTTP 서버에서 실행 |
| 수정 내용이 아직 안 보임 | Pages 작업 완료 후 강력 새로고침, 또는 새 탭에서 다시 열기 |
| 소리가 안 남 | 먼저 소리 켬을 누르고, 기기 음량과 브라우저 음소거 상태 확인 |

## 로컬 미리보기 — 선택 사항

Python 3가 이미 설치되어 있다면 `index.html`이 있는 폴더에서 다음 명령을 실행할 수 있습니다.

```sh
python3 -m http.server 8000
```

그다음 `http://localhost:8000/`을 엽니다. GitHub Pages에 올리기 위해 이 과정을 거칠 필요는 없습니다.

## 공식 안내

- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

안내 확인: 2026-11-19
