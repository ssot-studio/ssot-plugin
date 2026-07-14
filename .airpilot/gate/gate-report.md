## 🤖 airpilot run-gate 결과 (로컬 · 서브에이전트)

대상: unpushed 커밋 `c04a18a` — `.claude-plugin/marketplace.json` · `mcp/src/adapters/git.ts` · `mcp/dist/index.js`

### ✅ consistency-check · 통과 [feature] — 직전 차단 결함(marketplace.json 0.7.1 잔존) 해소. 버전 선언 3곳이 모두 0.7.2 로 정합.
- ℹ️ `marketplace.json`:10 — plugins[0].version = 0.7.2 로 plugin.json:3 · mcp/package.json:3 과 일치. 레포 전체 `0.7.1` 잔존 문자열 0건, JSON 파싱 정상. → 없음(확인 완료).
- 🟢 `marketplace.json`:10 — 세 매니페스트가 한 버전 라인으로 커플링돼 있으나 그 규약이 문서화·강제되지 않는다. 직전 결함이 정확히 이 미문서화 커플링에서 나왔고(한 곳 누락), 이번 커밋은 값만 맞췄을 뿐 재발 방지 장치는 없다. → 릴리즈 절차에 '세 매니페스트 동시 상향'을 명문화하거나 세 값 일치를 검사하는 스크립트로 결정적으로 강제한다(후속 사안, 차단 아님).

### ✅ review · 통과 [feature] — 소유 표식으로 파괴 경로가 fail-closed 로 닫히고 sameRepo 정규화로 thrash 해소. 중점검증 3건 모두 실측 안전 확인.
- ℹ️ `git.ts`:91 — **중점검증 ① 기존 캐시 회귀 없음.** 표식 검사가 `userChoseDir &&` 로 **사용자 지정 cacheDir 에만** 걸린다. 표식 없는 기존 기본 캐시(tmpdir/ssot-mcp/&lt;id&gt;)는 종전대로 삭제·재클론되고 그 재클론이 표식을 심는다(:112). url 이 안 바뀐 기존 캐시는 sameRepo 로 삭제 분기를 아예 타지 않아 표식 없이도 영구 정상 — 표식은 삭제 가드에만 쓰이므로 부재가 무해하다. → 없음(확인 완료).
- ℹ️ `git.ts`:62 — **중점검증 ② sameRepo 오판 여지 없음.** 정규화가 호스트를 문자열에 보존하므로 우려된 '호스트가 다른데 경로만 같은 경우'(github.com/o/r vs gitlab.com/o/r)는 정규화 후에도 다른 문자열이라 false positive 가 나지 않는다(9종 케이스 실행 검증). 반대 미스매치(ssh↔https·자격정보·포트)는 안전측 false negative 이고 1회 재클론 후 origin 이 수렴해 thrash 로 남지 않는다. → 없음(확인 완료).
- ℹ️ `git.ts`:112 — **중점검증 ③ `.ssot-cache` 는 checkout/reset 에 영향받지 않음.** 표식은 untracked 파일이고 `git checkout -f`·`git reset --hard`(:119-120)는 untracked 를 제거하지 않는다. 실제 레포로 clone→표식→fetch→checkout -f→reset --hard 를 돌려 표식 생존(`?? .ssot-cache`)을 확인했다. 레포에 `git clean` 호출이 0건이라 표식을 지우는 경로가 아예 없다. → 없음(확인 완료).
- 🟢 `git.ts`:92 — 표식 없는 사용자 cacheDir + url 변경 시 throw(의도된 fail-closed, 방향은 옳다)인데 에러가 **해소 방법**을 알려주지 않는다. 0.7.2 이전에 사용자 cacheDir 로 만들어진 정상 캐시는 표식이 없어 url 변경 순간 하드 스톱을 맞고 스스로 복구할 길을 모른다. → 메시지에 조치 1줄 추가: '우리가 만든 캐시가 맞다면 디렉토리를 지우거나 그 안에 .ssot-cache 를 만든 뒤 재실행하라.'
- 🟢 `git.ts`:62 — norm 이 url **전체**를 소문자화한다. 대소문자를 구별하는 자체호스팅 서버에서 경로만 대소문자가 다른 별개 레포는 같다고 판정돼, 막으려던 '옛 원천을 조용히 쓰는' 실패가 그 좁은 경우에 남는다(주요 호스트는 경로 대소문자 비민감이라 노출 가능성 매우 낮음). → scheme·host 만 소문자화하고 경로는 원형 유지.
- 🟢 `git.ts`:49 — 소유 판정이 파일 '존재'만 본다. 원천 레포가 우연히 `.ssot-cache` 를 추적하면 위조 표식으로 작동해 삭제 가드를 통과시킨다(병리적). → 표식 내용(클론 시 기록한 url)까지 확인해 소유로 인정한다.

### ✅ impact-analysis · 통과 [impact] — 변경이 gitAdapter 내부(ensureRepo)에 국한, 공개 계약 불변.
- ℹ️ `git.ts`:131 — ensureRepo 의 유일한 호출처는 gitAdapter.load 이고 반환 계약(작업트리 루트) 동일. 표식은 레포 루트에 놓이는데 로더는 ssotPath(기본 docs/ssot) 하위만 스캔하므로 SSOT 노드 집합에 섞이지 않는다. → 없음.
- 🟢 `git.ts`:84 — 서로 다른 url 의 두 소스에 같은 cacheDir 을 명시하면 여전히 상호 thrash 가능(설정 오용 경로). 이번 변경으로 악화되지 않았고 오히려 표식 없으면 throw 로 멈춘다. → config 로드 시 cacheDir 중복을 거부하거나 하위에 &lt;id&gt; 서브디렉토리를 강제한다.

### ✅ test · 자문 [feature] — 레포에 테스트 하네스가 없다(scripts = build·typecheck). 이번 커밋만의 결함 아님.
- 🟢 `git.ts`:82 — ensureRepo 의 5분기가 자동 회귀 테스트로 고정돼 있지 않아, 이후 리팩터가 파괴 가드를 조용히 되돌릴 수 있다. → 로컬 레포 2개로 origin 교체·표식 유무 시나리오를 도는 최소 통합 테스트 도입. 특히 '표식 없는 사용자 cacheDir 은 삭제되지 않는다'를 회귀로 고정할 가치가 크다.

### ✅ normalize · 자문 [standard] — `npx tsc --noEmit` 통과(exit 0). 커밋된 `mcp/dist/index.js` 가 src 재빌드 결과와 일치(재빌드 후 dist diff 공백) — dist 표류 없음. 스타일·명명은 기존 관습과 일치.

---
### 🟢 통과 — 차단 결함 0건. 직전 게이트의 blocker 1 + medium 2 가 모두 해소됐고 신규 결함 없음. 남은 지적은 전부 low/자문이라 푸시를 막지 않는다.
