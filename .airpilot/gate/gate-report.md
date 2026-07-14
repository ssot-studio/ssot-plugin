## 🤖 airpilot run-gate 결과 (로컬 · 서브에이전트)

### ❌ review · 지적 [feature] — 핵심 수정(캐시 origin 검증)의 방향은 안전측(fail-safe)이나, url 문자열 완전일치 비교로 인한 불필요 재클론과 사용자 지정 cacheDir 파괴 위험·무경고 삭제가 남는다.
- 🟡 `git.ts`:73 — url 정규화 없이 문자열 완전일치(origin !== config.url)로 비교한다. 같은 레포라도 표기가 다르면(.git 접미사 유무, 후행 슬래시, ssh(git@host:o/r) <-> https(https://host/o/r), 호스트 대소문자, 자격정보 포함 url) 매번 '다른 레포'로 판정돼 캐시를 지우고 재클론한다. 방향은 안전측(옛 원천을 쓰지 않음)이라 차단급은 아니지만, 선언 url 표기만 바꿔도 매 load 마다 full re-clone 이 도는 성능 함정이다. → 비교 전 정규화: 후행 / 와 .git 제거, ssh scp-like 표기를 https 형태로 환산, 호스트 소문자화, 자격정보 제거 후 비교.
- 🟡 `git.ts`:74 — rm(cacheRoot, {recursive:true, force:true}) 는 config.cacheDir 를 존중한다(삭제 대상이 항상 cacheRoot 이고 그 밖으로 나가지 않는다). 다만 사용자가 cacheDir 을 자기 실작업 레포/공유 디렉토리로 잘못 지정하면(그 디렉토리는 .git 이 있고 origin 이 다르다) 그 디렉토리를 통째로 삭제한다. 종전 코드는 그 상황에서 fetch 만 했기에 파괴적이지 않았다 — 이번 변경이 새로 만든 파괴 경로다. 가드가 'origin && origin !== url' 뿐이라 '캐시가 아닌 진짜 레포'를 구별하지 못한다. → 캐시 소유 마커(클론 직후 cacheRoot 에 .ssot-mcp-cache 스탬프 기록)를 두고 그 마커가 있는 디렉토리만 rm 한다. 마커가 없으면 삭제 대신 에러로 중단해 cacheDir 오설정을 사용자가 인지하게 한다.
- 🟢 `git.ts`:74 — 캐시 폐기·재클론이 완전히 조용하다. 원천 url 이 바뀌었다는 사실은 SSOT 도구에서 사용자가 알아야 할 사건인데 경고/로그가 남지 않는다. → stderr 에 '소스 <id>: 캐시 origin(<old>) != 선언 url(<new>) -> 캐시 폐기 후 재클론' 1줄 기록.
- ℹ️ `git.ts`:49 — 중점검증 확인 결과 — cachedOrigin() 은 안전하다. runGit 은 spawn error 도 child.on('error') 로 흡수해 code 127 로 resolve 하므로 throw 하지 않고(git.ts:33), 비-레포/origin 부재/git 미설치 모두 code!==0 -> null 로 귀결된다. null 이면 삭제 분기를 타지 않아 기존 동작(fetch/pull)이 유지된다. 즉 '조건 과잉'은 위 정규화 부재 한 갈래뿐이고, 비-레포 오삭제는 없다. → 없음(확인 완료).

### ❌ consistency-check · 지적 [feature] — 릴리즈 매니페스트 버전 불일치 — plugin.json 은 0.7.2 인데 marketplace.json 은 0.7.1 에 멈춰 있다(직전 릴리즈 커밋은 둘을 함께 올렸음).
- 🔴 `marketplace.json`:9 — 이 커밋이 .claude-plugin/plugin.json 과 mcp/package.json 을 0.7.2 로 올리면서 .claude-plugin/marketplace.json 의 plugins[0].version 은 0.7.1 로 남겼다. 직전 릴리즈 커밋 af5a717 은 plugin.json 과 marketplace.json 을 함께 0.7.1 로 올렸으므로 두 파일은 커플링된 릴리즈 매니페스트이며 이번 누락은 규약 위반이다. marketplace.json 은 설치 소스가 광고하는 버전이라, 0.7.1 로 남으면 이 사일런트 결함 수정(0.7.2)이 마켓플레이스 소비자에게 업데이트로 노출되지 않는다 — '고쳤는데 배포되지 않는' 상태. → .claude-plugin/marketplace.json 의 plugins[0].version 을 0.7.2 로 올려 plugin.json 과 일치시킨다.
- 🟢 `package.json`:3 — mcp/package.json 이 0.6.0 -> 0.7.2 로 MINOR 두 칸을 건너뛰며 플러그인 버전 라인에 강제 정렬됐다. 미배포 내부 패키지라 실해는 없으나, 독립 라인이던 것을 말없이 통합한 것이라 의도가 기록되지 않았다. → 두 버전을 한 라인으로 묶는 것이 의도라면 릴리즈 절차(README/CLAUDE.md)에 '플러그인·mcp·marketplace 세 매니페스트를 동시에 올린다'를 명문화한다.

### ✅ impact-analysis · 통과 [impact] — ensureRepo 는 gitAdapter.load 단일 호출처이며 공개 계약 변경 없음. 다만 여러 소스가 같은 cacheDir 를 공유하면 캐시 thrash 가능(설정 오용 경로).
- 🟢 `git.ts`:67 — cacheDir 은 소스별 선택 필드이고 기본값이 <tmp>/ssot-mcp/<id> 로 id 격리라 충돌이 없다. 그러나 서로 다른 url 을 가진 두 git 소스에 같은 cacheDir 을 명시하면, 각 load 가 상대의 캐시를 origin 불일치로 판정해 지우고 재클론하는 thrash 가 된다(변경 전에는 조용히 서로의 원천을 오독하는 더 나쁜 상태였으므로 회귀는 아니다). 동시 load 시 rm 과 다른 요청의 읽기가 경합할 수도 있다. → config 로드 시 git 소스 간 cacheDir 중복을 검증해 거부하거나, cacheDir 하위에 id 서브디렉토리를 강제한다.

### ✅ test · 자문 [feature] — 레포에 테스트 하네스 자체가 없다(mcp/package.json scripts = build·typecheck 뿐). 이번 변경만의 결함은 아니나 새 분기 5종이 무검증이다.
- 🟢 `git.ts`:66 — ensureRepo 의 새 분기(origin 일치->유지 / 불일치->재클론 / origin null(비-레포·remote 없음)->유지 / url 표기차 / 사용자 cacheDir)가 전부 자동검증 없이 수동 e2e 확인에만 의존한다. 레포에 테스트 러너가 없어 이번 변경만의 책임으로 보긴 어렵다. → tmp 에 로컬 bare 레포 2개를 만들어 origin 교체 시나리오를 도는 최소 통합 테스트 도입.

### ✅ normalize · 자문 [standard] — 스타일·명명은 파일 기존 관습과 일치. typecheck 통과, dist 번들은 src 재빌드 결과와 일치(재빌드 시 diff 없음).

---
### 🔴 차단 — 아래 critical/high 를 고친 뒤 커밋하세요.