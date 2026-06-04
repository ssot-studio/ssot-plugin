# @repo/mcp

로컬 **멀티소스 SSOT MCP 서버**. 여러 SSOT 소스(원격 git 레포 · 로컬 디렉토리 · 원격 REST/web ·
Jira/Confluence)를 설정으로 등록하고, stdio MCP 도구 8종으로 노출한다. `@repo/core`(파서 ·
정규화 그래프 · 구조 판별)를 단일 재사용하며, 그 외 워크스페이스 패키지에 의존하지 않는다(자기 패키지 안에서만 동작).

저장은 메모리만 쓴다 — 각 소스의 `_catalog.json` + 노드 `.md` 를 로드해 정규화 그래프로 들고 있는다
(sqlite 불필요). 노드 본문은 필요할 때만 lazy 로드해 frontmatter 권위로 facet 을 머지한다.

## 도구

| 도구 | 인자 | 반환 |
|------|------|------|
| `ssot_list_sources` | — | 등록된 소스 목록(type · 노드/엣지 수 · 본문 지원 · 로드 에러) |
| `ssot_get_node` | `source`, `id` | 노드 1건(4축 facet + 본문 마크다운, lazy 머지) |
| `ssot_search` | `query`, `source?`, `limit?` | 제목·id·정의·목적·소유자 부분일치(소스 전역 또는 단일) |
| `ssot_list_tags` | `source` | 노드 tags 를 네임스페이스(domain/status/type 등)별로 집계(태그별 노드 수 포함) |
| `ssot_impact` | `source`, `id`, `depth?` | `impacts`/`relatesTo`/`governs` 트래버설 파급 영향 |
| `ssot_neighbors` | `source`, `id`, `depth?`, `dir?` | depth-N 인접(out/in/both) + 1-hop 구조 종류 분류 |
| `ssot_gaps` | `source` | 끊긴 엣지 · 측면 누락 · 진행중 · 고아 owner · 파싱 에러 |
| `ssot_flag` | `title`, `type?`, `detail?`, `nodes?`, `repo?` | 조회 중 발견한 문제를 이슈 본문 + `gh` 커맨드로 구성(**읽기전용 — 생성/변경 안 함**) |

> MCP는 **읽기전용**이다. `ssot_flag`도 데이터·원격을 건드리지 않고 이슈 본문과 `ghCommand` 텍스트만 반환한다 — 실제 이슈 생성·SSOT 변경(propose/ingest/sync-lifecycle)은 `ssot` **스킬**(쓰기 경로)이 담당한다.

## 설정 (멀티소스)

소스는 `ssot-sources.json`(파일) 또는 `SSOT_SOURCES`(env 인라인 JSON)로 선언한다.
로드 우선순위: `SSOT_SOURCES` → `SSOT_SOURCES_FILE` → `<cwd>/ssot-sources.json`.

`type` 별 어댑터가 로드한다 — **git / local-fs 는 구현 완료**, `rest`/`web`/`jira`/`confluence`
는 인터페이스 + stub(호출 시 NotImplemented, 구현 지점은 어댑터 주석에 명시).

```jsonc
{
  "sources": [
    {
      // 원격 SSOT — git 레포를 clone/pull 한 뒤 레포 안의 ssotPath 를 로드
      "id": "my-project",
      "label": "My Product SSOT",
      "type": "git",
      "url": "https://github.com/your-org/ssot-data.git",
      "ref": "main",            // 브랜치/태그/커밋 (옵션, 기본 레포 기본 브랜치)
      "ssotPath": "ssot",         // 레포 루트 기준 SSOT 디렉토리 (옵션, 기본 "docs/ssot")
      "pull": true              // load 마다 갱신 (옵션, 기본 true)
      // "cacheDir": "/tmp/my-cache"  // 클론 캐시 (옵션, 기본 OS tmp/ssot-mcp/<id>)
    },
    {
      // 로컬 SSOT — 이미 존재하는 docs/ssot 디렉토리를 직접 로드
      "id": "local",
      "label": "내 로컬 SSOT",
      "type": "local-fs",
      "dir": "./docs/ssot"
    },
    {
      // rest — HTTP 로 _catalog.json 을 가져오는 소스 (stub: 인터페이스만)
      "id": "remote-api",
      "label": "원격 SSOT API",
      "type": "rest",
      "catalogUrl": "https://ssot.example.com/_catalog.json",
      "bodyBaseUrl": "https://ssot.example.com/",
      "headers": { "Authorization": "Bearer ..." }
    }
  ]
}
```

env 인라인으로 같은 설정을 줄 수도 있다:

```bash
export SSOT_SOURCES='{"sources":[{"id":"local","type":"local-fs","dir":"./docs/ssot"}]}'
```

### 소스 타입별 필드

| type | 필수 | 옵션 | 상태 |
|------|------|------|------|
| `local-fs` | `dir` | — | 구현 |
| `git` | `url` | `ref`, `ssotPath`, `cacheDir`, `pull` | 구현 |
| `rest` | `catalogUrl` | `bodyBaseUrl`, `headers` | stub |
| `web` | `baseUrl` | — | stub |
| `jira` | `baseUrl`, `project` | `jql`, `tokenEnv` | stub |
| `confluence` | `baseUrl`, `spaceKey` | `tokenEnv` | stub |

> 인증 토큰은 설정에 직접 박지 않는다 — `jira`/`confluence` 는 `tokenEnv`(env 변수명)로 가리킨다.

## 등록법 (MCP 클라이언트)

빌드 후(`dist/index.js`) stdio 서버로 등록한다. 레포 루트 `.mcp.json` 은 이미 이 서버를 가리킨다:

```jsonc
{
  "mcpServers": {
    "ssot": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"],
      "env": {
        "SSOT_SOURCES_FILE": "./ssot-sources.json"
      }
    }
  }
}
```

Claude Code 등 다른 클라이언트도 동일하다 — `command`/`args`/`env` 를 그대로 쓰거나, 전역 설치 시
`bin` 이름 `ssot-mcp` 를 `command` 로 지정한다.

## 빌드 / 타입체크

```bash
pnpm turbo run build     --filter @repo/mcp   # tsc → dist
pnpm turbo run typecheck --filter @repo/mcp
```

## 아키텍처

```
config.ts        ssot-sources.json | SSOT_SOURCES → SourceConfig[] (검증)
adapters/
  types.ts       SourceAdapter 인터페이스: load(config) → SsotGraph (+ lazy body)
  local-fs.ts    _catalog.json 읽기 → core.normalize → SsotGraph        [구현]
  git.ts         clone/pull → local-fs 위임                            [구현]
  stubs.ts       rest / web / jira / confluence                       [인터페이스 + stub]
registry.ts      LoadedSource(graph + 인접 인덱스 + lazy body 캐시) 메모리 보관
tools.ts         7개 도구 순수 로직 (core 의 traversal/structure 재사용; ssot_flag 는 읽기전용 이슈 본문 구성)
server.ts        stdio MCP 서버 (@modelcontextprotocol/sdk, raw JSON Schema)
index.ts         진입점: loadConfig → SourceRegistry → startMcpServer
```

**의존 방향**: `@repo/mcp → @repo/core` (단방향). core 의 `normalize`(파서/그래프) ·
`buildAdjacencyIndex`/`reachable`(트래버설) · `classify`(구조 판별) · `loadBody`(본문 권위 머지)를
재사용하며 SSOT 도메인 로직을 재구현하지 않는다.
