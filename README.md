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

설치하면 MCP 서버(`ssot_*` 도구)와 스킬(`/ssot:ssot`)이 **함께** 등록된다. 조회할 SSOT 소스는 사용자마다 다르므로 플러그인에 박지 않는다 — 자기 환경에서 직접 등록한다(아래 "데이터 소스 등록 (사용자별)" 참고).

### 업데이트

```
/plugin marketplace update ssot-studio
/plugin install ssot@ssot-studio
/reload-plugins
```

> Claude Code 가 구버전이면 `marketplace.json` 의 source 를 인식 못 할 수 있다 — `claude --version` 확인 후 최신으로 업그레이드.

## 데이터 소스 등록 (사용자별)

조회할 SSOT 데이터 소스 경로는 사용자마다 다르다. 플러그인에는 개인 절대경로를 박지 않으며, 각자 자기 환경에서 등록한다. **소스를 하나도 등록하지 않아도 MCP 는 정상 기동한다**(빈 목록 반환) — 등록하면 그때부터 조회·질의가 동작한다.

### `ssot-sources.json` 형식

```jsonc
{
  "sources": [
    // git 소스 — 원격 SSOT 레포 (git 어댑터가 캐시, clone 불필요)
    {
      "id": "my-product",
      "type": "git",
      "url": "https://github.com/<your-org>/<your-ssot>.git",
      "ssotPath": "ssot"
    },
    // local-fs 소스 — 로컬에 있는 SSOT 디렉토리
    {
      "id": "air-studio",
      "type": "local-fs",
      "dir": "<당신의 SSOT 레포 경로>/ssot"
    }
  ]
}
```

> `id` 는 소스 식별자일 뿐이다(`air-studio` 는 예시 id). `url`·`dir` 에는 자기 환경의 실제 값을 넣되, README 에 커밋할 경우 개인 절대경로 대신 변수(`${HOME}` 등)를 쓴다.

현재 어댑터: `git` · `local-fs` 구현. `rest`/`web`/`jira`/`confluence` 는 stub(추후 구현).

### 등록 방법 (우선순위 順)

MCP 는 다음 순서로 소스 설정을 찾고, 먼저 발견되는 것을 사용한다.

| 우선순위 | 방식 | 지정 |
|------|------|------|
| 1 | `SSOT_SOURCES` (env 인라인 JSON) | 셸 `export SSOT_SOURCES='{"sources":[...]}'` 또는 `settings.json` 의 env |
| 2 | `SSOT_SOURCES_FILE` (파일 경로) | 기본값 `${CLAUDE_PLUGIN_DATA}/ssot-sources.json`. `~/.claude.json` 의 `projects[<path>].mcpServers.ssot.env.SSOT_SOURCES_FILE` 로 프로젝트별 오버라이드 가능 |
| 3 | `<cwd>/ssot-sources.json` | 현재 작업 디렉토리의 파일 |

**가장 쉬운 방법** — `${CLAUDE_PLUGIN_DATA}/ssot-sources.json` 파일을 만든다. 이 경로는 플러그인을 업데이트해도 유지되는 영속 데이터 디렉토리다(캐시 `${CLAUDE_PLUGIN_ROOT}` 와 달리 버전 업그레이드 후에도 남는다). 별도 env 설정 없이 기본값으로 잡힌다.

프로젝트마다 다른 파일을 쓰고 싶으면 `~/.claude.json` 의 해당 프로젝트 항목에서 경로를 지정한다.

```jsonc
{
  "projects": {
    "<프로젝트 경로>": {
      "mcpServers": {
        "ssot": {
          "env": { "SSOT_SOURCES_FILE": "${HOME}/my-ssot-sources.json" }
        }
      }
    }
  }
}
```

### 변수 확장

경로·env 값에서 다음 변수가 확장된다.

| 변수 | 의미 |
|------|------|
| `${CLAUDE_PLUGIN_DATA}` | 플러그인 영속 데이터 디렉토리 (업데이트 후 유지) |
| `${CLAUDE_PLUGIN_ROOT}` | 플러그인 설치 루트 (캐시 — 업데이트 시 교체될 수 있음) |
| `${HOME}` | 홈 디렉토리 |
| `${VAR:-default}` | `VAR` 가 없으면 `default` 사용 |

> 틸드(`~`) 는 확장하지 않는다 — 홈 경로는 `${HOME}` 으로 쓴다.

### 버전

본 설계는 **0.4.0** 부터 제공된다. 설치된 버전이 낮으면 업데이트한다.

```
/plugin marketplace update ssot-studio
/plugin install ssot@ssot-studio
/reload-plugins
```

## 구성

| 구성 | 역할 |
|------|------|
| `mcp/dist/index.js` | 멀티소스 MCP 서버 — 등록된 SSOT 소스를 읽어 search / get_node / impact / neighbors / gaps 질의 (상시 동작) |
| `skills/ssot/` | SSOT 작성·검증 스킬 — init / add / fill / coverage / verify / propose / ingest / sync-lifecycle |
| `vendor/core.mjs` | `@ssot-studio/core` 빌드물 (vendor) — skills·mcp 가 공유하는 단일 로직 |

> 모노레포가 아니라 독립 레포다. plugin 은 루트부터 clone 되므로 `node_modules` 없이 동작해야 한다 —
> 그래서 core 는 `vendor/` 로, MCP 는 SDK 까지 번들한 `mcp/dist/index.js` 로 포함한다(install 불필요).

## 조회/질의 (MCP — 상시 동작)

평문 질문이 오면 MCP 가 등록된 소스를 읽어 자동으로 답한다. 소스 등록 방법·형식은 위 "[데이터 소스 등록 (사용자별)](#데이터-소스-등록-사용자별)" 참고. 소스를 등록하지 않았으면 빈 목록으로 동작하고, 등록하는 즉시 조회가 가능해진다.

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
