# SSOT 표면 추출 레시피 (recipes/)

코드/스펙에서 **SSOT 표면 인벤토리**(빈 노드의 근간)를 기계적으로 뽑아내는 재사용 스크립트 모음.
"표면(surface)" = 채워야 할 노드가 거기 있다는 사실만 아는, 코드 표면에서 자동 추출된 항목.
각 스크립트는 인자로 경로를 받아 어느 프로젝트에든 재사용 가능하며, 출력은 `coverage.mjs --surface`
가 기대하는 TSV 스키마(`kind \t id \t title \t provenance`)와 동일하다.

> 출처: `ssot-decompose` 워크플로우(추출→scaffold→샘플채움→검증)의 즉석 Bash 로직을 재사용
> 가능한 스크립트로 승격한 것. 워크플로우는 이 레시피를 호출하는 얇은 오케스트레이터가 된다.

## 스크립트

| 스크립트 | 입력 | 산출 kind | id 규칙 |
|----------|------|-----------|---------|
| `extract-routes.sh` | 앱 `src/routes` 경로 + 앱약자 | `Screen` | `screen.<앱약자>-<kebab route>` |
| `extract-endpoints.sh` | api-spec md 파일 | `Endpoint` | `endpoint.<METHOD>-<kebab path>` |
| `extract-repositories.sh` | `repositories/src` 경로 | `Concept` | `concept.<kebab domain>` |

공통 출력: **stdout**, 각 줄 탭(`\t`) 4필드 — `kind <TAB> id <TAB> title <TAB> provenance`.
`provenance` 는 (선택) `repoRoot` 인자 기준 상대경로, 미지정 시 입력 경로 그대로.

### extract-routes.sh

```
extract-routes.sh <routesDir> <appAbbr> [repoRoot]
```

- `createFileRoute(...)` 를 호출하는 `.tsx` 파일 1개 = Screen 1행.
- `createRootRoute` 만 쓰는 `__root.tsx`, `routeTree.gen.ts`, `*.gen.tsx` 자동 제외.
- id 의 route-slug 는 `createFileRoute` 의 첫 인자(라우트 path)에서 유도 — 동적 세그먼트
  (`$id`, `$agentId`)·pathless 레이아웃 마커(`_auth`)는 kebab 정규화되어 슬러그에 포함된다.
- `appAbbr` prefix 로 앱 간 id 충돌 방지(여러 앱 출력을 이어 붙여도 안전).
- 루트 인덱스(`/`)는 `screen.<앱약자>-root` 로.

예: `extract-routes.sh apps/app/src/routes app <repoRoot>`

### extract-endpoints.sh

```
extract-endpoints.sh <mdFile> [repoRoot]
```

- 대상 표 스키마: `| Repository | Method(fn) | HTTP | Path | Client | Request | Response |`.
  HTTP 컬럼(3)이 메서드, Path 컬럼(4)이 경로. 헤더/구분선 행은 제외.
- HTTP 메서드 컬럼이 유효하지 않은 표(다른 스키마)의 행은 건너뛴다.
- Path 정제: 백틱 제거, 꼬리 괄호 주석(`(conditional)` 등) 제거, 슬러그에서 쿼리스트링 제거,
  경로 변수 `${x}` → 토큰 `id` 로 정규화.
- 같은 METHOD+PATH 가 여러 repository 함수에 의해 호출돼 표에 중복 등장하면 **id 기준 dedup**
  (첫 출현 유지) — Endpoint 표면은 METHOD+PATH 가 키라 노드 1개로 수렴해야 하기 때문.

예: `extract-endpoints.sh docs/api-spec/spring-endpoints.md <repoRoot>`

### extract-repositories.sh

```
extract-repositories.sh <repositoriesSrcDir> [repoRoot]
```

- `*Repository.ts` 파일 1개 = API 통신 레이어가 다루는 도메인 Concept 1행.
- 파일명에서 `Repository` 접미사를 떼고 PascalCase → kebab 으로 슬러그화
  (예: `AccessControlRepository.ts` → `concept.access-control`, title `AccessControl`).
- `*.d.ts` / `*.test.ts` / `*.spec.ts` 제외.

예: `extract-repositories.sh packages/repositories/src <repoRoot>`

## 표준 절차 (추출 → build-graph → coverage --scaffold → fill)

`<SSOT>` = SSOT 노드 디렉토리, `<REPO>` = 추출 대상 레포 루트, `<SK>` = 이 스킬 루트(`skills/ssot`).

```bash
REC=<SK>/recipes
SCRIPTS=<SK>/scripts

# 1) 추출 — 표면 TSV 생성. 여러 소스를 하나로 합친다.
"$REC/extract-routes.sh"        <REPO>/apps/app/src/routes   app   <REPO> >  /tmp/surface.tsv
"$REC/extract-routes.sh"        <REPO>/apps/admin/src/routes admin <REPO> >> /tmp/surface.tsv
"$REC/extract-routes.sh"        <REPO>/apps/chat/src/routes  chat  <REPO> >> /tmp/surface.tsv
for f in spring fastapi service-runtime core-runtime workbench; do
  "$REC/extract-endpoints.sh"   <REPO>/docs/api-spec/$f-endpoints.md          <REPO> >> /tmp/surface.tsv
done
"$REC/extract-repositories.sh"  <REPO>/packages/repositories/src             <REPO> >> /tmp/surface.tsv

# 1b) 합친 TSV 의 id 전역 유일성 점검 (cross-source 충돌 없어야 함)
cut -f2 /tmp/surface.tsv | sort | uniq -d   # 출력 비어야 정상

# 2) build-graph — 현재 노드 카탈로그 생성 (coverage 가 covered 판정에 사용)
node "$SCRIPTS/build-graph.mjs" <SSOT>

# 3) coverage --scaffold — 표면 중 미커버 항목을 빈 노드로 생성(쪼개기).
#    기존 covered 노드는 스킵, 신규 Screen/Endpoint/Concept 빈 노드만 만들어진다.
#    screens/ endpoints/ concepts/ 디렉토리 자동 생성.
node "$SCRIPTS/coverage.mjs" <SSOT> --surface /tmp/surface.tsv --scaffold --root <REPO>

# 4) build-graph 재실행 — 신규 노드 반영
node "$SCRIPTS/build-graph.mjs" <SSOT>

# 5) verify — 구조 무결성 (dangling/schema/dupId = 0 이어야 함)
node "$SCRIPTS/verify.mjs" <SSOT> 90 --root <REPO>
```

### fill (채움)

scaffold 직후 노드 본문에는 `## 자동 스캐폴드 — 채워야 함 / OPEN: ...` 표시가 남는다 —
이것이 "채울 근간"이다. 방법론(`<SK>/reference/methodology.md`)에 따라 근거 코드/스펙을
정독해 자기완결 본문으로 채운다.

- **Screen**: 화면 목적 / UI 요소·입력 / 표시 데이터·호출 endpoint / 상태·엣지케이스.
  호출하는 endpoint 는 `relatesTo: [{ to: endpoint.<slug>, type: calls }]` 로 연결
  (해당 노드가 **실존할 때만** — 없으면 본문에 경로만 적고 보류, 끊긴 엣지 금지).
- **Endpoint**: METHOD PATH / 요청·응답 / 권한·제약·불변식. 권한은
  `governedBy: [invariant.permission-*]` 로 (실존 노드만).
- **Concept**: 도메인 의미 / 다루는 데이터 / 관련 Screen·Endpoint 와의 `relatesTo`.

채운 뒤 `build-graph` → `verify` 로 `dangling=0` 재확인. `측면미완`(빈 노드)은 아직 안 채운
근간을 뜻하므로 정상 신호다.

## 재실행 안전성

- `coverage --scaffold` 는 이미 covered 인 노드를 스킵하므로 반복 실행해도 기존 채움을 덮어쓰지 않는다.
- 라우트/엔드포인트/Repository 가 추가되면 추출→scaffold 를 다시 돌려 신규 빈 노드만 추가하면 된다.
