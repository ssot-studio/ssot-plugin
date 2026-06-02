# SSOT Plugin

Claude Code 플러그인 — 제품·도메인·시스템 맥락 **SSOT(Single Source of Truth)** 를 생성·채우고·검증하고·질의한다.
**스킬**(작성·검증)과 **MCP 서버**(조회·질의)를 함께 제공한다. 한 번 설치하면 모든 프로젝트의 SSOT 레포에 재사용된다.

## 구성

| 구성 | 역할 |
|------|------|
| `skills/ssot/` | SSOT 작성·검증 스킬 — init / add / fill / coverage / verify / build-graph |
| `mcp/dist/index.js` | 멀티소스 MCP 서버 — 등록된 SSOT 소스를 읽어 search / impact / neighbors / gaps 질의 |
| `vendor/core.mjs` | `@ssot-studio/core` 빌드물 (vendor) — skills·mcp 가 공유하는 단일 로직 |

> 모노레포가 아니라 독립 레포다. plugin 은 루트부터 clone 되므로 `node_modules` 없이 동작해야 한다 —
> 그래서 core 는 `vendor/` 로, MCP 는 SDK 까지 번들한 `mcp/dist/index.js` 로 포함한다(install 불필요).

## 사용 — 작성/검증 (스킬)

데이터 레포(SSOT `.md` 보유)를 clone 한 뒤 그 디렉토리에서:

```
/ssot init                  # 새 SSOT 골격 설치
/ssot coverage --scaffold   # 코드 스캔 → 빠진 노드 자리 생성
/ssot fill                  # 코드·문서에서 4축 채우기
/ssot verify                # 검증 → _gaps.md
/ssot build-graph           # _catalog.json 재생성
```

## 사용 — 조회/질의 (MCP)

`ssot-sources.json`(로컬 config)에 SSOT 소스를 등록하면 MCP 가 읽는다. clone 불필요(git 어댑터가 캐시).

```jsonc
{ "sources": [
  { "id": "my-project", "type": "git", "url": "https://github.com/your-org/ssot-data.git" },
  { "id": "side-A", "type": "local-fs", "dir": "~/dev/.../my-side-ssot/ssot" }
]}
```

현재 어댑터: `git` · `local-fs` 구현. `rest`/`web`/`jira`/`confluence` 는 stub(추후 구현).

## org

`https://github.com/ssot-studio` (public). 형제 레포: `ssot-core`(로직 원본), `ssot-web`(뷰어).
