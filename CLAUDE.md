# SSOT Plugin — 작업 규칙 (메인테이너용)

> 이 문서는 **이 레포를 개발·유지보수할 때만** 로드되는 작업 메모리다 — 플러그인을 설치한 사용자 세션에는 로드되지 않는다. 소비자용 설명은 `README.md` 를 본다.

소비자가 Claude Code 에 설치하는 **배포물**이다. 스킬(작성·검증) + MCP(조회)를 담는다.
로직 원본은 `ssot-core` 레포이며, 여기엔 그 빌드물(vendor)만 들어온다.

## 불변 규칙

| 규칙 | 사유 |
|------|------|
| **`vendor/core.mjs` 직접 수정 금지** | `ssot-core` 가 원본. 수정은 거기서 → 빌드 → vendor sync |
| **skills 스크립트는 `../../../vendor/core.mjs` 를 import** | 파서·그래프 로직 재구현 금지 (중복 0) |
| **`mcp/dist/index.js` 는 커밋한다** | clone-동작 — install 없이 MCP 기동 |
| **`vendor/` 는 커밋한다** | clone-동작 — skills 가 즉시 import |
| **`.md` 노드 작성은 데이터 레포에서** | plugin 은 도구. 데이터는 각 프로젝트 SSOT 레포 |

## 변경 후 필수

- mcp 소스 변경 시: `cd mcp && pnpm build` → `dist/index.js` 갱신 후 커밋
- core 변경 시: `ssot-core` 에서 빌드 → vendor sync → 여기 `vendor/` 갱신

## 하지 말 것

- core 로직을 skills/mcp 에 재구현 (중복 — ssot-core 단일)
- 데이터 레포에 스킬/플러그인 코드 넣기 (데이터는 순수 유지, 도구는 plugin)
