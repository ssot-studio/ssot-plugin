<p align="center">
  <img src="assets/logo.svg" alt="SSOT Studio" width="380">
</p>

# SSOT Plugin

Claude Code 플러그인 — 제품·도메인·시스템 맥락 **SSOT(Single Source of Truth)** 를 생성·검증·질의한다. **MCP 서버**(상시 조회)와 **스킬**(작성·검증·제안)을 함께 제공하며, 한 번 설치하면 모든 프로젝트의 SSOT 레포에 재사용된다.

## 사용법 한눈에

| 하고 싶은 것 | 어떻게 | 호출 |
|------|------|------|
| **조회·질의** ("X 뭐야 / 누가 쓰나 / X 바꾸면 영향? / X와 Y 관계? / 어디에 구현?") | `/ssot:ssot "질문"` — 등록된 SSOT 를 조회해 근거와 함께 답한다 | 스킬 (권장) |
| **작성·검증·제안** (노드 추가 / 채우기 / 커버리지 / 검증 / 제안 PR / 생명주기) | `/ssot:ssot` 스킬 | 명시 호출 |

> 평문 질문(예: "X 뭐야?")도 MCP 가 자동으로 SSOT 를 조회해 답한다. 다만 자동 조회는 모델 판단에 의존하므로, **어떤 SSOT 를 근거로 답하는지 확실히 하려면 `/ssot:ssot "질문"` 으로 명시 호출**한다.

## 설치

```
/plugin marketplace add https://github.com/ssot-studio/ssot-plugin.git
/plugin install ssot@ssot-studio
```

MCP 서버(`ssot_*` 도구)와 스킬(`/ssot:ssot`)이 함께 등록된다. 조회할 소스는 아래에서 직접 등록한다.

**업데이트:**
```
/plugin marketplace update ssot-studio
/plugin install ssot@ssot-studio
/reload-plugins
```
> 소스 설정 기능은 **0.4.0+** 필요 — 구버전이면 `claude --version` 확인 후 업그레이드.

## 데이터 소스 등록 (사용자별)

조회할 SSOT 소스는 사용자마다 다르므로 플러그인에 박지 않고 각자 등록한다. **소스가 없어도 MCP 는 정상 기동하며**(빈 목록), 등록 즉시 조회가 동작한다.

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
      "id": "local-ssot",
      "type": "local-fs",
      "dir": "<당신의 SSOT 레포 경로>/ssot"
    }
  ]
}
```

> `id` 는 식별자일 뿐이다. `url`·`dir` 에는 자기 환경 값을 넣되, 커밋한다면 절대경로 대신 `${HOME}` 등 변수를 쓴다.

어댑터: `git` · `local-fs` 구현. `rest`/`web`/`jira`/`confluence` 는 stub.

### 등록 방법 (우선순위 順)

MCP 는 다음 순서로 소스 설정을 찾아 먼저 발견되는 것을 쓴다. **소스는 프로젝트마다 다르므로 기본 경로가 프로젝트별로 격리된다.**

| 우선순위 | 방식 | 지정 |
|------|------|------|
| 1 | `SSOT_SOURCES` (env 인라인 JSON) | 셸 `export SSOT_SOURCES='{"sources":[...]}'` 또는 `settings.json` 의 env |
| 2 | `SSOT_SOURCES_FILE` (파일 경로) | 명시하면 이 경로만 본다. `~/.claude.json` 의 `projects[<path>].mcpServers.ssot.env` 로 지정 |
| 3 | `<프로젝트 루트>/.claude/ssot-sources.json` | **기본값** — 프로젝트별 격리. 별도 설정 없이 여기 파일을 두면 잡힌다 |
| 4 | `<cwd>/ssot-sources.json` | 하위호환(단독 실행) |

각 파일 경로에는 **`.local` 형제 파일이 우선**한다 — 같은 폴더에 `<name>.local.json`(예: `ssot-sources.local.json`)이 있으면 원본 대신 그것을 쓴다. 로컬 작업본 직접 조회 등 개인·워커별 오버라이드를 커밋 대상 공유 파일과 분리하는 용도이며, `.gitignore` 에 `*.local.json` 을 넣어 커밋에서 제외한다.

가장 쉬운 방법은 프로젝트 루트에 `.claude/ssot-sources.json` 을 두는 것 — 별도 env 없이 그 프로젝트에서만 잡힌다. 다른 경로를 쓰려면 `~/.claude.json` 에서 `SSOT_SOURCES_FILE` 을 지정한다.

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

`.mcp.json`·`~/.claude.json` 의 값에서 다음이 치환된다(Claude Code 제공).

| 변수 | 의미 |
|------|------|
| `${CLAUDE_PROJECT_DIR}` | 프로젝트 루트 (기본 소스 경로의 기준) |
| `${CLAUDE_PLUGIN_ROOT}` | 플러그인 설치 루트 (캐시 — 업데이트 시 교체될 수 있음) |
| `${CLAUDE_PLUGIN_DATA}` | 플러그인 영속 데이터 디렉토리 (업데이트 후 유지) |
| `${HOME}` 등 | 시스템 환경변수 |

> 틸드(`~`) 와 `${VAR:-default}` 폴백 문법은 확장하지 않는다 — `${HOME}` 같은 단순 `${VAR}` 만 쓴다.

## 구성

| 구성 | 역할 |
|------|------|
| `mcp/dist/index.js` | 멀티소스 MCP 서버 — search / get_node / impact / neighbors / gaps 질의 (상시 동작) |
| `skills/ssot/` | 작성·검증 스킬 — init / add / fill / coverage / verify / sync / refresh / propose / ingest / sync-lifecycle |
| `vendor/core.mjs` | `@ssot-studio/core` 빌드물 — skills·mcp 가 공유하는 단일 로직 |

> 독립 레포라 `node_modules` 없이 동작한다 — core 는 `vendor/`, MCP 는 SDK 까지 번들한 `mcp/dist/index.js` 로 포함한다.

## 조회/질의 (MCP — 상시 동작)

`/ssot:ssot "질문"` 으로 물으면 MCP 가 등록된 소스를 읽어 근거와 함께 답한다 — 어떤 SSOT 를 근거로 삼는지 확실히 하려는 권장 경로다. 평문 질문도 MCP 가 자동으로 조회하지만 모델 판단에 의존한다. 등록 방법은 위 "[데이터 소스 등록](#데이터-소스-등록-사용자별)" 참고.

| 도구 | 역할 |
|------|------|
| `ssot_list_sources` | 등록된 소스 목록 + 노드/엣지 수 |
| `ssot_search` | 제목·정의·목적·소유자 검색 + 태그 필터 (`tags`, `namespace:value`). `query`·`tags` 중 하나 이상 |
| `ssot_list_tags` | 노드 tags 를 네임스페이스별로 집계 (태그별 노드 수 포함) |
| `ssot_get_node` | 노드 1건 (4축 facet + 본문) |
| `ssot_impact` | impacts/relatesTo/governs 트래버설 — 파급 영향 |
| `ssot_neighbors` | depth-N 인접 (out/in/both) |
| `ssot_gaps` | 완전성 갭 (끊긴 엣지 / 측면 누락 / 미완 / 고아 owner) |
| `ssot_flag` | 발견한 문제를 이슈 본문 + `gh` 커맨드로 구성 (읽기전용) |

## 작성/검증/제안 (스킬)

데이터 레포(SSOT `.md` 보유)를 clone 한 뒤 그 디렉토리에서 `/ssot:ssot` 로 호출한다.

```
/ssot init                  # 새 SSOT 골격 설치 (+ 소스 레포 config HITL 인테이크)
/ssot coverage --scaffold   # 코드 스캔 → 빠진 노드 자리 생성
/ssot fill                  # 코드·문서에서 4축 채우기
/ssot verify                # 검증 → _gaps.md
/ssot sync                  # mirrored 노드를 원본(source) 파일에서 재생성
/ssot refresh               # 코드→SSOT 증분 최신화 — 핀된 ref 스냅샷 기준 변경분만 (반복 실행용)
/ssot propose               # 정합→PR / 충돌→이슈+draft / 근간→Decision
/ssot ingest                # 외부 문서/기획 들여오기
/ssot sync-lifecycle        # 코드 존재 여부로 lifecycle(active/planned) 동기화
```

> `refresh` 는 어떤 제품 코드 레포·경로·**ref(정확한 시점 스냅샷)** 를 기준으로 삼는지 핀한 git-untracked build config(`${CLAUDE_PLUGIN_DATA}/ssot-build-config.json`)를 읽는다 — 없으면 HITL 로 받아 기록한다. 위 조회용 `ssot-sources.json` 과는 별개다(이건 빌드·최신화용).

## org

`https://github.com/ssot-studio` (public). 형제 레포: `ssot-core`(로직 원본), `ssot-web`(뷰어).
