# SSOT Plugin

Claude Code 플러그인 — 제품·도메인·시스템 맥락 **SSOT(Single Source of Truth)** 를 생성·채우고·검증하고·질의한다.
**MCP 서버**(상시 조회·질의)와 **스킬**(작성·검증·제안)을 함께 제공한다. 한 번 설치하면 모든 프로젝트의 SSOT 레포에 재사용된다.

## 사용법 한눈에

| 하고 싶은 것 | 어떻게 | 호출 방식 |
|------|------|----------|
| **조회·질의** ("X 뭐야 / 누가 쓰나 / X 바꾸면 영향? / X와 Y 관계? / 어디에 구현?") | **그냥 평문으로 질문한다** — MCP 가 자동으로 SSOT 를 조회해 근거와 함께 답한다 | 스킬 호출 불필요 |
| **작성·검증·제안** (노드 추가 / 채우기 / 커버리지 / 검증 / 제안 PR / 생명주기 동기화) | `/ssot:ssot` 스킬 | 명시 호출 |

> 스킬이 상시 설치돼 있어도 호출하지 않으면 부담은 0이다 — 상시 동작하는 것은 MCP 뿐이다.

## 설치

```
/plugin marketplace add ssot-studio/ssot-plugin
/plugin install ssot@ssot-studio
```

설치하면 MCP 서버(`ssot_*` 도구)와 스킬(`/ssot:ssot`)이 **함께** 등록된다. 조회할 SSOT 소스는 로컬 `ssot-sources.json` 에 등록한다(아래 "조회/질의" 참고).

### 업데이트

```
/plugin marketplace update ssot-studio
/plugin install ssot@ssot-studio
/reload-plugins
```

> Claude Code 가 구버전이면 `marketplace.json` 의 source 를 인식 못 할 수 있다 — `claude --version` 확인 후 최신으로 업그레이드.

## 구성

| 구성 | 역할 |
|------|------|
| `mcp/dist/index.js` | 멀티소스 MCP 서버 — 등록된 SSOT 소스를 읽어 search / get_node / impact / neighbors / gaps 질의 (상시 동작) |
| `skills/ssot/` | SSOT 작성·검증 스킬 — init / add / fill / coverage / verify / propose / ingest / sync-lifecycle |
| `vendor/core.mjs` | `@ssot-studio/core` 빌드물 (vendor) — skills·mcp 가 공유하는 단일 로직 |

> 모노레포가 아니라 독립 레포다. plugin 은 루트부터 clone 되므로 `node_modules` 없이 동작해야 한다 —
> 그래서 core 는 `vendor/` 로, MCP 는 SDK 까지 번들한 `mcp/dist/index.js` 로 포함한다(install 불필요).

## 조회/질의 (MCP — 상시 동작)

평문 질문이 오면 MCP 가 등록된 소스를 읽어 자동으로 답한다. `ssot-sources.json`(로컬 config)에 SSOT 소스를 등록하면 MCP 가 읽는다. clone 불필요(git 어댑터가 캐시).

```jsonc
{ "sources": [
  { "id": "my-project", "type": "git", "url": "https://github.com/your-org/ssot-data.git", "ssotPath": "ssot" },
  { "id": "side-A", "type": "local-fs", "dir": "~/dev/.../my-side-ssot/ssot" }
]}
```

현재 어댑터: `git` · `local-fs` 구현. `rest`/`web`/`jira`/`confluence` 는 stub(추후 구현).

### MCP 도구

| 도구 | 역할 |
|------|------|
| `ssot_list_sources` | 등록된 소스 목록 + 노드/엣지 수 |
| `ssot_search` | 제목·정의·목적·소유자 부분일치 검색 + 태그 필터 (`tags`, `namespace:value` — namespace 내 OR / namespace 간 AND). `query`·`tags` 중 하나 이상 |
| `ssot_list_tags` | 노드 tags 를 네임스페이스(domain/status/type 등)별로 집계 — 각 태그의 노드 수 포함 |
| `ssot_get_node` | 노드 1건 (4축 facet + 본문, lazy 머지) |
| `ssot_impact` | impacts/relatesTo/governs 트래버설 — 파급 영향 |
| `ssot_neighbors` | depth-N 인접 (out/in/both) |
| `ssot_gaps` | 완전성 갭 (끊긴 엣지 / 측면 누락 / 미완 / 고아 owner) |
| `ssot_flag` | 조회 중 발견한 문제를 이슈 본문 + `gh` 커맨드로 구성 (읽기전용 — 실행 안 함) |

## 작성/검증/제안 (스킬)

데이터 레포(SSOT `.md` 보유)를 clone 한 뒤 그 디렉토리에서 `/ssot:ssot` 로 호출한다.

```
/ssot init                  # 새 SSOT 골격 설치
/ssot coverage --scaffold   # 코드 스캔 → 빠진 노드 자리 생성
/ssot fill                  # 코드·문서에서 4축 채우기
/ssot verify                # 검증 → _gaps.md
/ssot propose               # 정합→PR / 충돌→이슈+draft / 근간→Decision
/ssot ingest                # 외부 문서/기획 들여오기
/ssot sync-lifecycle        # 코드 존재 여부로 lifecycle(active/planned) 동기화
```

## org

`https://github.com/ssot-studio` (public). 형제 레포: `ssot-core`(로직 원본), `ssot-web`(뷰어).
