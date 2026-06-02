---
name: ssot
description: >-
  제품·도메인·시스템 맥락의 단일 진실(SSOT, Single Source of Truth)을 모듈형 대상 파일 + 관계 그래프로
  만들고(init), 채우고(add/fill), 완전성을 검증하고(verify), 임의의 질문에 답한다(ask).
  "이 서비스는 누가/왜 쓰나", "X를 추가/변경하면 영향 범위가 어디까지인가",
  "백엔드 변경이 프론트엔드 어디에 영향을 주나" 같이 코드만으로는 답할 수 없는
  제품·비즈니스·도메인·시스템 전반의 질문에 답할 재료를 정리할 때 사용한다.
  도메인 지식 정리, 영향 분석(impact analysis), 온보딩 컨텍스트, 기획-개발 공통 SSOT 구축,
  "도메인 문서/지식베이스를 만들고 최신화" 요청에 트리거된다. 특정 프레임워크에 종속되지 않으며 어떤 프로젝트에서든 동작한다.
  코드 스타일/아키텍처 규칙(엔지니어링 축)이 아니라 제품·도메인 맥락(제품 축) 전용이다.
---

# ssot — 제품·도메인·시스템 맥락 SSOT 도구

## 이 스킬이 푸는 문제

운영 중인 제품은 "누구를 위한 것이고, 개념이 어떻게 얽혀 있고, 한쪽을 건드리면 어디까지 흔들리는가"를 아무도 전체적으로 보지 못한다. 그 지식은 코드와 사람 머릿속에만 있다. 코드는 "현재 동작(as-is)"은 담아도 **"이 관계가 깨면 안 되는 제약인지 · 누구를 위한 것인지 · 왜 이렇게 됐는지"**는 담지 못한다.

이 스킬은 그 빠진 맥락을 **모든 대상을 주변과 끊김없이 연결한 그래프**로 외부화한다. 목적은 닫힌 질문 목록에 답을 박는 게 아니라, **예측 못 한 임의의 질문에도 답할 재료가 있는 완전성**을 만드는 것이다.

> 자세한 방법론·정보 모델·정책은 **반드시 `reference/methodology.md`를 먼저 읽고** 따른다. 이 파일은 진입점·모드 분기만 규정한다.

## 두 가지 완전성 (이 스킬의 모든 동작이 지키는 것)

1. **측면 완전성** — 어떤 대상이든 4축(① 비즈니스·제품 ② 도메인 개념·관계·불변식 ③ 시스템·경계·영향 전파 ④ 거버넌스·근거·생명주기) 측면이 빠지지 않는다. *빠진 측면 = 영원히 답 못 하는 질문군.*
2. **연결 완전성** — 각 측면이 다른 대상을 가리키는 링크라서 추적이 끊기지 않는다. *끊긴 링크 = "여기 빈칸".*

빈칸은 **에러가 아니라 일급 상태**다(`TBD`/`OPEN`/`confidence: unverified`/대상 부재). 누가 먼저든, 어느 부분부터든 채울 수 있다.

## 사용법

```
/ssot                      # 인자 없으면: 현재 프로젝트 SSOT 상태 요약 + 다음 행동 제안
/ssot init                 # 현재 프로젝트에 docs/ssot/ 골격 설치
/ssot add <Kind> [주제]     # 대상 1개 추가 (대화 + 코드/문서 추출로 4축 측면 채움)
/ssot fill [영역]           # 비순차 보강 — 여러 대상/엣지를 한 번에 채움
/ssot verify               # 완전성 검증 (SSOT→코드 drift + mirror-drift) → docs/ssot/_gaps.md
/ssot coverage [--scaffold] # 코드→SSOT 커버리지: 코드 표면이 항목화됐나. --scaffold로 갭을 빈/미러 노드 자동 생성
/ssot sync [--check]       # mirrored 노드를 source(원본 레포 파일)에서 재생성. --check는 드리프트만 보고(쓰기 없음)
/ssot ask "<질문>"          # 그래프 트래버설로 임의 질문에 답 (confidence·근거 id 동반)

# ── 거버넌스 모드 (변경을 "제안"으로 라우팅 — main 직접 push 금지) ──
/ssot propose "<변경>"      # 변경을 분류(정합/충돌/근간/범위외)해 PR/이슈/ADR로 라우팅
/ssot ingest <문서경로>     # 외부 기획 문서(자유형식)를 SSOT 노드/엣지로 매핑 → propose로 위임
/ssot sync-lifecycle       # "코드 생겼는데 planned"를 검출 → active 전환 PR 제안(자동 전환 금지)
/ssot flag "<문제>"         # 조회 중 발견한 문제(dangling/모순/누락) 또는 JIT 캡처(competency-gap/rationale-fragment)를 gh 이슈로 등록
/ssot curate               # ssot-capture 이슈 큐를 dedup·클러스터·디스크립터화 → propose로 위임 (별도 에이전트 주기 실행 권장)
```

`<Kind>` ∈ `Platform · Persona · Domain · Concept · Capability · SystemComponent · Integration · Invariant · Decision`

## 모드별 동작

### `init`
1. `reference/schema/`, `reference/skeleton/`을 대상 프로젝트 `docs/ssot/`로 복사한다.
2. `docs/ssot/README.md`를 생성한다(= `reference/methodology.md`를 그 프로젝트용으로 안내하는 진입 문서. 방법론 본문은 복사하되 "이 프로젝트의 SSOT" 맥락 한 단락을 머리에 붙인다).
3. `docs/ssot/{personas,domains,concepts,capabilities,components,integrations,invariants,decisions}/` 빈 디렉토리와 `platform.md`(skeleton 복사) 생성.
4. `node ~/.claude/skills/ssot/scripts/build-graph.mjs docs/ssot` 로 빈 카탈로그 생성 후, 상태를 요약 보고.

### `add <Kind> [주제]`
1. `reference/skeleton/<Kind>.md`를 해당 디렉토리에 `id` 기반 파일명으로 복사.
2. **4축 측면을 채운다.** 코드/기존 문서에서 확인 가능한 것은 추출하고, 사람만 아는 것(목적·페르소나·불변식의 옳음)은 사용자에게 묻는다. **모르는 칸은 비우지 말고 명시적 빈칸으로**: `owner: TBD`, `confidence: unverified|inferred`, 본문 `- [ ] OPEN: ...`.
3. **자기완결적으로 본문을 채운다 (§1b 필수).** 본문에 그 대상의 **원본 데이터를 그대로 담는다** — 권한이면 역할·키·평가 흐름 전체, 엔티티면 테이블·FK·제약 전체. "다른 문서 참조"로 때우지 않는다. `implementedIn`은 근거가 아니라 현재 구현 위치(provenance, drift 추적)일 뿐이다. 판정: "코드와 다른 문서가 다 사라져도 이 노드만으로 재현 가능한가?"
3. 코드에서 추론한 값은 `confidence: inferred`로 표기(사람 확인 전).
4. 추가 후 `verify`를 돌려 새로 생긴 끊긴 링크(이 대상이 가리키는 아직 없는 대상)를 빈칸으로 보고.

### `fill [영역]`
- 비순차 보강. 코드·기존 문서(`docs/api-spec/` 등 정합성 자산 우선 import)·사용자 입력에서 대상과 엣지를 추출해 여러 대상을 채운다. 시작 순서를 전제하지 않는다. 각 대상은 고립돼도 가치가 있고(글로서리), 엣지가 붙을수록 영향분석이 복리로 강해진다.

### `verify` (결정적 — 스크립트)
```
node ~/.claude/skills/ssot/scripts/build-graph.mjs docs/ssot                 # 카탈로그(_catalog.json) 빌드
node ~/.claude/skills/ssot/scripts/verify.mjs docs/ssot [cadenceDays] [--root <워크스페이스루트>]   # 검증 → _gaps.md
```
멀티레포 SSOT(여러 레포를 가로지름)면 `--root`에 레포들의 공통 조상을 준다. 예: SSOT가 `your-frontend/docs/ssot`에 있고 `your-org/*`도 참조하면 `--root ..`(공통 부모). `implementedIn` 경로는 그 root 기준 상대경로로 적는다.
검사: 스키마 적합성 / 끊긴 엣지(연결 완전성) / 측면 슬롯 누락(측면 완전성) / id 유일성·중복 결정 / `implementedIn` 경로 실존(코드 drift) / `lastVerified` cadence 만료. 결과를 `_gaps.md`에 집계하고 사용자에게 요약 보고.

### `coverage` / `scaffold` (결정적 — 스크립트)
```
node ~/.claude/skills/ssot/scripts/build-graph.mjs docs/ssot
node ~/.claude/skills/ssot/scripts/coverage.mjs docs/ssot --surface <tsv> [--scaffold] --root <워크스페이스루트>
```
- **코드→SSOT 검사**: 코드 표면 인벤토리(tsv: `kind⇥id⇥title⇥provenance[⇥authority⇥source]`)와 SSOT를 대조해 **미항목화 갭**을 `_coverage.md`로 리포트. verify(SSOT→코드)와 **양방향**이며, 둘 다 0이어야 code-derivable 완전(§1c).
- **`--scaffold`**: 갭을 노드로 자동 생성 — authored면 빈 스켈레톤+OPEN, mirrored면 `source` 원본을 본문에 복제한 미러(§1d, §1e). "채울 근간"을 만든다.
- 표면 추출은 프로젝트별로 만든다: repository 파일·권한 상수·BE 모듈 디렉토리·`.claude/rules/*`(mirrored) 등. (예시 추출 스크립트는 프로젝트 README/도구에 둔다.)

### `sync` (결정적 — 스크립트)
```
node ~/.claude/skills/ssot/scripts/build-graph.mjs docs/ssot
node ~/.claude/skills/ssot/scripts/sync.mjs docs/ssot [--root <워크스페이스루트>] [--check] [--id <node-id>]
```
- **mirrored 노드 재생성 (source→SSOT 단방향).** `coverage --scaffold`가 *처음* 만든 미러를, 원본(`source`)이 바뀐 뒤 *다시 내려받아 갱신*하는 짝이다. `verify`가 잡는 **mirror-drift**(source가 미러보다 최신)를 해소한다.
- **무엇을 바꾸나**: 노드의 `<!--SSOT:MIRROR-START--> … END-->` 마커 구간 본문만 source 최신 내용으로 교체하고, `lastVerified`를 오늘로 갱신한다. **frontmatter는 보존** — 사람이 미러에 붙인 제품·컴포넌트 엣지(`impacts`/`relatesTo` 등, §1e "미러 ↔ 제품 노드 엣지")와 마커 밖 메모는 그대로 유지된다. `source`는 원본이므로 **절대 건드리지 않는다**(단방향 보장).
- **`--check`**: 쓰지 않고 재sync가 필요한 미러만 보고하고 드리프트가 있으면 exit 1. pre-commit / PostToolUse hook 에서 "원본 룰을 고쳤는데 SSOT 미러를 안 내렸다"를 차단·경고하는 용도.
- **`--root`**: `source` 경로의 기준 디렉토리. 멀티레포 SSOT면 레포들의 공통 조상(워크스페이스 루트). verify/coverage와 동일 규약.
- source 부재·`source` 미기재 등은 **문제로 보고**(exit 1)하되 자동 추측하지 않는다 — 원본이 사라진 미러는 사람이 판단할 영역이다.

### 변경 시 자동 갱신 — hook 스니펫
"코드/룰을 고치면 SSOT가 자동으로 따라온다"를 강제하는 두 갈래. **sync**(미러 재생성)와 **coverage**(갭 검출)를 변경 시점에 건다.

**(A) Git pre-commit** — 원본 룰 변경을 커밋할 때 SSOT 미러 드리프트·커버리지 갭을 막는다. `.husky/pre-commit` 또는 `.git/hooks/pre-commit`:
```sh
#!/bin/sh
# SSOT 미러가 source(.claude/rules/* 등) 변경을 못 따라왔으면 차단.
SSOT=docs/ssot
[ -f "$SSOT/_catalog.json" ] || node ~/.claude/skills/ssot/scripts/build-graph.mjs "$SSOT" >/dev/null
node ~/.claude/skills/ssot/scripts/build-graph.mjs "$SSOT" >/dev/null
if ! node ~/.claude/skills/ssot/scripts/sync.mjs "$SSOT" --root . --check; then
  echo "→ 원본 변경이 SSOT 미러에 반영 안 됨. 'node ~/.claude/skills/ssot/scripts/sync.mjs $SSOT --root .' 실행 후 결과를 함께 커밋하세요." >&2
  exit 1
fi
# coverage 갭(코드에 있으나 SSOT에 항목 없음)은 차단이 아니라 경고만 — 채울 항목을 사람에게 알림.
# (surface.tsv 추출은 프로젝트별 도구; 없으면 이 블록 생략)
if [ -f scripts/ssot-surface.sh ]; then
  sh scripts/ssot-surface.sh > /tmp/ssot-surface.tsv
  node ~/.claude/skills/ssot/scripts/coverage.mjs "$SSOT" --surface /tmp/ssot-surface.tsv --root . || true
  echo "→ coverage 갭은 $SSOT/_coverage.md 참고. 새 코드 표면을 SSOT 항목으로 채우세요(경고만, 커밋은 진행)." >&2
fi
```

**(B) Claude Code PostToolUse hook** — Claude가 `.claude/rules/*`·`CLAUDE.md`를 편집한 직후 미러 드리프트를 알린다. `settings.json`:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "f=\"$CLAUDE_TOOL_FILE_PATH\"; case \"$f\" in *.claude/rules/*|*CLAUDE.md) node ~/.claude/skills/ssot/scripts/build-graph.mjs docs/ssot >/dev/null 2>&1; node ~/.claude/skills/ssot/scripts/sync.mjs docs/ssot --root . --check >&2 || echo '[ssot] 룰 원본이 바뀌었습니다 — /ssot sync 로 미러를 갱신하세요.' >&2 ;; esac"
          }
        ]
      }
    ]
  }
}
```
두 hook 모두 **차단이 목적이 아니라 "채울 항목을 사람에게 노출"**하는 게 핵심이다 — 빈칸·드리프트는 에러가 아니라 일급 작업 상태(§ 두 가지 완전성)이므로, sync는 자동 실행하되 coverage 갭은 경고로 흘려 사람이 채우게 한다.

### `ask "<질문>"`
1. `build-graph.mjs`로 최신 `_catalog.json`을 만든다(없거나 오래됐으면).
2. `_catalog.json` + 관련 대상 파일 본문을 읽어 **그래프 트래버설로 답을 조립**한다. 영향 분석 질문은 대상에서 시작해 `impacts`/`relatesTo`/`governs`/`consumesApi`를 따라 역·정방향 확장.
3. 답에는 반드시 **근거 대상 id 목록**과 **confidence 라벨**을 붙인다. 추적 중 끊긴 링크/빈칸을 만나면 "이 부분은 SSOT에 아직 없음(빈칸)"이라고 정직하게 표시한다 — 추측으로 메우지 않는다.

#### JIT 캡처 (ask 중 변경거리 적재 — 이슈 전용)

`ask`는 **답 먼저** 하고(질문을 가로채지 않음), 그 다음 변경거리가 있으면 캡처를 *제안*한다. 캡처는 GitHub 이슈로만 적재한다 — **PR/브랜치/커밋 금지**(조회 세션은 보통 데이터 레포를 클론하지 않은 상태).

| 단계 | 규칙 |
|------|------|
| **답 먼저** | confidence·빈칸을 정직히 표시하며 먼저 답한다. 캡처가 답을 지연·대체하지 않는다. |
| **EV 게이트** | 답이 why/decision급 빈칸(미답 competency question)에 의존했거나 질문자가 근거/의견을 자발적으로 제시한 경우에만 캡처 제안. **value(슬롯) × P(질문자=owner) > 방해비용**일 때만 — trivial 필드엔 침묵. |
| **owner 추론은 추측** | 단정 금지. dialog로 확인("이거 당신 결정 같은데 맞아요/아니면 누구?"). 확인 전 내용은 `inferred`. |
| **oracle 역량** | 질문자가 owner가 아니면 답은 `high` 불가 → `competency-gap`(빈 슬롯 신호)으로만 로깅. |
| **적재 수단** | `node scripts/flag.mjs --type competency-gap\|rationale-fragment --question <q> --asker <a> --confidence <unverified\|inferred> [--nodes a,b] [--apply]` (또는 MCP `ssot_flag`). **이슈만** 만든다. |

schema-on-read: 캡처 시점엔 포맷을 강제하지 않는다 — 나중에 `curate`가 dedup·구조화해 `propose`로 승격한다.

## 거버넌스 모드 — 변경을 "제안"으로 라우팅

핵심 원칙: **MCP는 읽기전용, 스킬은 제안(쓰기).** 거버넌스 모드는 SSOT 데이터를 직접 `main`에 쓰지 않는다 — 항상 브랜치 + `gh pr create`(라벨 `ai-proposed`) 또는 `gh issue create`로 내놓고, **사람이 검토·머지**한다. `main` 직접 push는 절대 금지.

스크립트는 `verify`/`coverage`/`sync`와 동일하게 `_catalog.json`(build-graph 산출물)을 소비하고, 공통 부품(트래버설·분류·gh 커맨드)은 `scripts/governance.mjs`에 모은다(로직 중복 금지). 모든 거버넌스 스크립트는 **기본이 "계획 제시"(dry-run)** 이고, `--apply`를 줄 때만 파일 작성·브랜치·gh를 실행한다.

> 거버넌스 스크립트의 gh/git은 **사용자 계정 컨텍스트**를 가정한다. 대상 레포는 SSOT 데이터 레포(또는 `--repo <owner/name>`로 지정).

### `propose "<변경>"`

변경 제안을 받아 **영향·충돌 분석 → 분류 → 라우팅**한다.

1. **분석(LLM, 스킬 본문)**: MCP(`ssot_impact`/`ssot_neighbors`/`ssot_search`) 또는 `governance.impactClosure`로 영향 범위와 충돌 대상을 조사한다. 그 결과를 **변경 디스크립터 JSON**으로 구성한다:
   - `signals`: `{ touchesInvariant, contradictsDecision, isArchitectural, affectedDomains[], inFourAxes }` — 분류 입력.
   - `seedIds`: 영향분석 시작 노드(기존 그래프 내 id). `newNodes`: 추가할 planned 노드. `conflictTargets`: 충돌 대상 id.
2. **분류·라우팅(결정적)**: `node scripts/propose.mjs <ssotDir> --change <json> --root <루트> [--repo <o/n>] [--base <branch>] [--apply]`
   - 분류 규칙(`governance.classifyChange`)과 라우트별 산출물:

   | route | 트리거 | 산출물 |
   |-------|--------|--------|
   | **aligned**(정합) | 4축 대상 + 불변식/Decision 무저촉 + 도메인<3 | planned 노드 `.md` + 브랜치 + PR(`ai-proposed`) |
   | **conflict**(충돌) | 불변식 저촉 또는 Decision 모순 | 이슈(충돌 대상 명시) + **draft** PR + 영향 리포트 |
   | **foundational**(근간) | 아키텍처 변경 또는 도메인 ≥3 파급 | Decision(ADR) 초안 + 영향 리포트 + 이슈 + draft PR |
   | **out-of-scope**(범위외) | `inFourAxes=false` | 거부 + 이슈(사유 기록). 노드/브랜치 없음 |

   - **애매하면 보수적으로 더 무거운 경로**(foundational > conflict > aligned). 분류는 결정적이되, `signals`를 무겁게 잡는 것이 LLM의 보수성이다.
   - 제안 단계 신규 노드는 `lifecycle: planned` + `confidence: unverified|inferred`(코드 없음). `--apply`로 `.md` 작성 후 `verify`를 돌려 새 끊긴 링크를 빈칸으로 보고.

### `ingest <문서경로>`

외부 기획 문서(자유형식 — 워드/마크다운/노션 export 등)를 SSOT 그래프로 들여온다.

1. **매핑(LLM, 스킬 본문)**: 문서를 읽어 (a) 영향받는 **기존 노드**(`ssot_search`로 매칭)와 (b) 새로 생길 **planned 노드/엣지**를 식별한다. 기존 노드를 가리키는 엣지는 `seedIds`로, 새 항목은 `newNodes`로 정리한다.
2. **위임**: 그 결과를 `propose`의 변경 디스크립터로 만들어 `propose`에 그대로 넘긴다(PR 생성은 propose가 담당). ingest는 별도 쓰기 경로를 만들지 않는다 — **항상 propose로 수렴**해 같은 라우팅·같은 안전장치를 탄다.

### `sync-lifecycle`

`node scripts/sync-lifecycle.mjs <ssotDir> --root <루트> [--repo <o/n>] [--base <branch>] [--apply]`

- **검출**: `lifecycle: planned`인데 `implementedIn` 경로가 **실존**(코드가 생김)하는 노드 → `active` 전환 후보. `_lifecycle.md`로 리포트.
- **제안만**: LLM이 임의로 `active`로 바꾸지 않는다. `--apply`는 후보의 frontmatter를 `active`로 바꾸고 **전환 PR**(`ai-proposed`)을 제안할 뿐, 머지는 사람이 한다. `coverage`(코드↔SSOT)와 같은 정신의 반대 방향 검사다.

### `flag "<문제>"`

조회 중 발견한 SSOT **문제**(문제 계열) 또는 변경거리 **캡처**(캡처 계열)를 GitHub 이슈로 등록한다. JIT 캡처는 **이슈 전용** — schema-on-read로 적재만 하고, 나중에 `curate`가 구조화한다. **PR/브랜치 금지.**

| 계열 | type | 라벨 | 제목 prefix | 설명 |
|------|------|------|-------------|------|
| **flag**(문제) | `dangling` | `ssot-flag` | `[ssot:flag] ` | 끊긴 엣지 — 존재하지 않는 노드를 가리킴 |
| | `contradiction` | `ssot-flag` | `[ssot:flag] ` | 노드 간 모순 |
| | `missing` | `ssot-flag` | `[ssot:flag] ` | 있어야 할 노드/슬롯 누락 |
| | `other` | `ssot-flag` | `[ssot:flag] ` | 기타 구조 문제 |
| **capture**(캡처) | `competency-gap` | `ssot-capture` | `[ssot:capture] ` | 미답 질문 — 조회로 답하지 못한 competency question. 빈 슬롯(Decision/Invariant 등) 신호. 기본 `confidence=unverified` |
| | `rationale-fragment` | `ssot-capture` | `[ssot:capture] ` | 근거 조각 — 질문자가 자발적으로 제시한 의견/근거. 검증 전 후보 `confidence=inferred` |

**캡처 메타 필드**(family=capture): `--question`(원본 조회 질문), `--asker`(추정 owner 후보), `--confidence`(`unverified`|`inferred`), `--nodes`(대상/관련 노드 id, 기존 필드 재사용). owner 검증 전엔 진실이 아니다 — `high` 승격 불가.

- **스킬**: `node scripts/flag.mjs --type <dangling|contradiction|missing|other|competency-gap|rationale-fragment> --title <t> --detail <md> [--nodes a,b] [--question <q>] [--asker <a>] [--confidence <unverified|inferred>] [--repo <o/n>] [--apply]` (또는 `--json <file|->`). 기본은 이슈 본문 + `gh issue create` 커맨드를 **제시**, `--apply`로 실행.
- **MCP**: `ssot_flag` 도구(읽기전용)는 **데이터·원격을 일절 건드리지 않고** 이슈 본문 + `ghCommand` 텍스트만 반환한다. 실제 생성은 사람/스킬(`flag.mjs --apply`)이 한다. 본문·라벨·prefix 규약은 `flag.mjs`와 **단일 정의로 100% 일치**(한쪽만 바꾸면 안 됨).

### `curate`

`ssot-capture` 라벨 이슈 큐(JIT 캡처 적재물)를 주기적으로 검토해 **dedup·클러스터 → 변경 디스크립터 구성 → `propose`에 위임**한다. 별도 큐레이션 에이전트로 트리거/cadence에 맞춰 실행하길 권장한다.

1. **조회**: `gh issue list --label ssot-capture --state open`로 캡처 큐를 가져온다.
2. **클러스터(LLM)**: 같은 갭을 가리키는 이슈를 묶는다(같은 갭 → 노드 1개). 중복은 합치고, 흩어진 근거 조각은 한 대상으로 모은다.
3. **디스크립터 작성(LLM)**: 클러스터별로 `propose`의 변경 디스크립터 JSON을 만든다.
   - `competency-gap` → 빈 슬롯 scaffold(`- [ ] OPEN`).
   - `rationale-fragment` → `inferred` 내용 초안.
   - 둘 다 **owner 검증 전 `high` 불가** — `confidence: unverified|inferred` 유지.
4. **위임**: `node scripts/propose.mjs <ssotDir> --change <json> [--root ..] [--repo o/n]`. `propose`에 수렴해 같은 라우팅·안전장치를 탄다 — **별도 쓰기 경로를 만들지 않는다**(단일 수렴).

| 가드 | 규칙 |
|------|------|
| **클론 가드**(절대 제약) | 데이터 레포가 **로컬 클론된 경우에만** `propose --apply`(브랜치+PR) 가능. 클론 안 됐으면 PR 불가 → 이슈 통합/정리만. 기본 **dry-run(제시)**, PR은 최소로. |
| **swamp 가드** | curate가 실제로 주기적으로 돌지 않으면 이슈가 썩어 vaporization을 이슈트래커로 옮긴 것일 뿐이다. 트리거/cadence로 실행을 보장하라. |

## 경계 (정직하게)
- **결정적(스크립트)**: 구조 무결성 — 끊긴 링크, 측면 누락, id 중복, 경로 실존, cadence.
- **자동 검증 불가(사람 owner 영역)**: `impacts`/`relatesTo`의 의미적 정확성, `Invariant`의 옳음, 비즈니스 진실. `verify`는 "검증되었나(lastVerified)"만 강제하고 "내용이 맞나"는 강제하지 못한다.

## 다른 축과의 구별
이 스킬은 **제품·도메인·시스템 맥락(제품 축)** 전용이다. "코드를 어떻게 짜는가"(린트·타입·스타일·아키텍처 규칙 = 엔지니어링 축)는 대상이 아니다. 둘은 `implementedIn` 링크로만 만난다.
