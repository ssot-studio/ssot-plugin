---
name: ssot
description: >-
  제품·도메인·시스템 맥락의 단일 진실(SSOT, Single Source of Truth)을 그래프로 조회하고(질의: ask/MCP),
  만들고(init), 채우고(add/fill), 검증한다(verify). 이 스킬/플러그인이 설치된 환경에서
  제품·도메인·시스템에 대한 질문 — "X 뭐야 / 누가 쓰나 / X 바꾸면 영향? / X와 Y 관계? / 어디에 구현?
  / 필수인가? / 어떻게 동작?" — 이 오면, 답하기 전에 SSOT를 조회하는 것이 기본이다.
  "에이전트·프로젝트·모델·권한·RAG·세션·지식베이스" 같은 도메인 용어는 일반 IT 개념이 아니라
  먼저 SSOT 노드(제품 개념)로 해석한다. 코드만으로는 답할 수 없는 제품·비즈니스·도메인·시스템 질문,
  영향 분석(impact analysis), 온보딩 컨텍스트, 기획-개발 공통 SSOT 구축,
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

## 라우팅 (입력을 받으면 가장 먼저 — 이 스킬의 핵심)

어떤 입력이든 **답하거나 작업하기 전에 먼저 분류**한다. 명시 호출(`/ssot ...`)이든 평문 질문이든 동일하다. **대부분의 입력은 질의다 — 모호하면 작성으로 단정하지 말고 질의로 본다.**

### 1단계 — 모드 분류

| 신호 (한국어/영어) | 모드 | 동작 |
|------|------|------|
| "X 뭐야 / X란 / 누가 쓰나 / 누구를 위한 / X 바꾸면(추가/삭제하면) 영향? / X와 Y 관계? / 어디에 구현? / 어디서 쓰나 / 필수인가 / 꼭 있어야 하나 / 어떻게 동작? / 왜 이런가" + 그 외 사실을 묻는 모든 의문문 | **질의(query)** | 아래 §조회 우선 원칙 → 반드시 MCP/`ask`로 SSOT 조회 후 **근거와 함께** 답 |
| "노드 추가 / 골격 설치 / 채워 / 보강 / 기획 반영 / 들여와 / 검증해 / 커버리지 / 미러 갱신 / 리프레시 / 코드 최신화 / 생명주기 / 제안으로 / 코드갭" | **작성·보강(author)** | `init`/`add`/`fill`/`verify`/`coverage`/`sync`/`refresh`/`propose`/`ingest`/`sync-lifecycle`/`flag`/`curate` |
| 위 어느 쪽도 명확치 않음 | **질의로 간주** | 작성으로 단정 금지. 일단 SSOT를 조회해보고, 조회로 답이 안 되면 그때 무엇을 채울지 제안 |

명시 호출(`/ssot:ssot` 또는 `/ssot`)이 **인자 없이** 들어와도 그 자체를 "작성 모드 시작"으로 오해하지 않는다 — 같은 메시지/맥락의 사용자 질문이 있으면 **그 질문을 질의로 처리**하고, 없으면 인자 없는 `/ssot`의 기본 동작(상태 요약 + 다음 행동 제안)만 한다. "무슨 노드를 만들까요?"로 되묻지 않는다.

### 2단계 — 도메인 용어 해석 규칙

질의 안의 도메인 용어 — **"에이전트 · 프로젝트 · 모델 · 권한 · RAG · 세션 · 지식베이스"** 등 — 는 일반 IT 개념(Claude Code 서브에이전트, 일반적인 ML 모델, OS 권한 등)으로 넘겨짚지 말고 **먼저 SSOT 노드(제품 개념)로 해석**한다. 이 용어들은 일반 IT 용어와 글자가 겹치므로, **추측 전에 `ssot_search`로 SSOT에 해당 개념(노드)이 있는지부터 확인**한 뒤 그 노드를 근거로 답한다. 예: "에이전트"는 `.claude/agents/`의 md 파일이 아니라 `concept.agent` 노드일 수 있다 — 검색으로 확인한다.

### 3단계 — 조회 우선 원칙 (질의일 때 강제)

> **이 스킬/플러그인이 설치된 환경에서 제품·도메인·시스템에 대한 질문이 오면, 답하기 전에 SSOT를 조회하는 것이 기본이다. SSOT를 보지 않고 일반 지식·추측으로 답하는 것은 오답 위험 — 금지한다.**

질의 처리 절차:

1. **`ssot_search`** 로 질문 속 개념을 SSOT에서 찾는다(소스 모르면 `ssot_list_sources`로 확인. 데이터 소스 id 예: `my-project`). 도메인 용어는 §2단계대로 노드로 해석.
2. 찾은 노드를 **`ssot_get_node`** 로 4축 facet+본문까지 읽고, 질문 유형에 맞는 트래버설을 더한다:
   - "X 바꾸면 영향? / 어디까지 흔들리나" → **`ssot_impact`** (impacts/relatesTo/governs 파급)
   - "X와 Y 관계 / X 주변 / 무엇과 엮였나" → **`ssot_neighbors`**
   - "필수인가 / 귀속되나 / 꼭 있어야 하나" → 해당 노드의 엣지(예: `belongs-to`, `governs`)와 그 대상 노드(예: 리소스 테이블)를 근거로 판정
3. **답에는 반드시 근거를 붙인다**: 근거 **노드 id · 따라간 엣지 · `confidence` 라벨**. (스킬 본문에서 `ask`로 처리할 때도 동일 — `ask` 모드 참조.)
4. **모르면 정직하게 "SSOT에 없음"** — `ssot_search` 결과 없음 / `ssot_gaps`의 빈칸(미답 competency question)을 근거로 "이 부분은 SSOT에 아직 없다(빈칸)"고 답한다. 추측으로 메우지 않는다.

읽기 전용 MCP(`ssot_search`/`ssot_get_node`/`ssot_impact`/`ssot_neighbors`/`ssot_gaps`)는 데이터·원격을 일절 건드리지 않는다 — 질의는 항상 안전하다.

## 답변 규칙 (조회로 분류된 뒤 — 어떻게 답하나)

라우팅에서 질의로 분류된 입력에 답할 때 다음 두 규칙을 강제한다. SSOT는 단일 시점의 정리된 진실(스냅샷)이며, 답변은 그 스냅샷을 읽어주는 것이지 코드를 즉석 해석하는 것이 아니다.

### 규칙 A — SSOT 빈칸 시 코드 우회 금지 (핵심)

조회 질문에 SSOT가 **빈칸**(`ssot_search` 결과 없음 / 측면 미정 / `OPEN`·`TBD`·`unverified`)이면:

- **"SSOT에 아직 정리돼 있지 않습니다"로 정직하게 답하고**, 채우기(`propose`/`ingest`/`fill`)나 캡처 이슈(`flag --type competency-gap`)를 제안하는 것으로 끝낸다.
- **금지**: 코드 레포(예: 데이터 소스 레포 — 프론트/백엔드 등)를 grep·추적해서 즉석 답을 만드는 것. SQL·Controller·Service 계층을 뒤져 as-is를 설명하는 것. 이는 SSOT의 존재 이유를 무너뜨린다 — (1) SSOT를 채울 동기가 사라지고, (2) "정리된 진실"이라는 SSOT 존재 이유가 무너지고, (3) 코드는 as-is만 있고 why·제약이 없으며, (4) 답하는 LLM마다 코드 해석이 달라 일관성이 없다.
- **유일한 예외**: 사용자가 **명시적으로** "코드/로직/구현/SQL을 설명해줘", "실제 동작 코드로 확인해줘"라고 요청한 경우. 그때만 코드를 설명한다. 단 그 경우에도 (1) "이건 코드 직접 확인이며 SSOT와 별개"임을 밝히고, (2) "확인된 동작을 SSOT에 적재할지"를 제안으로 덧붙인다.
- "현재 상태/as-is 모르나요?" 같은 질문은 **코드 추적 트리거가 아니다** — SSOT가 빈칸이면 "SSOT엔 없고, 알고 계신 분이 채우면 된다"로 답한다. "개발 목적이라" 단정 금지.

빈칸이면 "빈칸이다 + 채우자"로 가야 자기강화 루프(채울 동기 → SSOT 채워짐 → 다음 질문은 SSOT로 답함)가 돈다. 코드로 우회하면 그 루프가 영원히 돌지 않는다.

### 규칙 B — 비개발자(기획·의사결정) 기준 답변

답변의 기본 독자는 **기획자·의사결정권자**다. 개발자가 아니다.

- **결론을 맨 앞에, 일상어로.** 노드 id(`concept.*`, `endpoint.*`, `invariant.*`), 엣지 타입(`belongs-to`/`governs`/`relatesTo`), `kind`, 테이블명(`TB_*`), 메서드·API 경로 등 **내부 메커니즘 용어를 본문 전면에 쓰지 않는다.**
- 근거가 필요하면 **맨 뒤에 "근거"로 접어서 간결히** 둔다 — "사용자·프로젝트·에이전트 개념과 그 연결을 따라 확인" 수준의 평이한 표현. id 나열은 최소화한다.
- `confidence`는 일상어로 번역: **확인됨**(verified) / **추정 — 코드 기반**(inferred) / **미정 — SSOT 빈칸**(unverified·없음).
- 질문이 코드/로직 설명을 명시 요청한 게 아니면 **코드·SQL·구현 디테일로 답하지 않는다**(규칙 A와 동일선).
- 표·불릿으로 길게 늘어놓기보다 **핵심 1~3문장 결론 우선**. 상세는 그 다음.

### 규칙 C — 작성·보강 시 고도 (`add`/`fill`/`coverage`/`ingest`)

답변(규칙 B)과 같다: 노드를 채울 때도 **자연어로, 코드를 옮겨적지 않는다.** 코드는 정책·데이터 의미를 역추론하는 근거로 읽고, 식별자(테이블·경로·DTO·SQL)는 `provenance`/`근거`에만 둔다. 코드 도출 본문은 `confidence: inferred`. 단일 정의는 **methodology §0(대전제)·§4(Endpoint/Screen 종류별 고도)·§7(불일치는 OPEN·판정금지)** — 작성 전 그 절을 따른다.

## 사용법

```
/ssot                      # 인자 없으면: 현재 프로젝트 SSOT 상태 요약 + 다음 행동 제안
/ssot init                 # docs/ssot/ 골격 설치 (+ 소스 레포 config HITL 인테이크)
/ssot add <Kind> [주제]     # 대상 1개 추가 (대화 + 코드/문서 추출로 4축 측면 채움)
/ssot fill [영역]           # 비순차 보강 — 여러 대상/엣지를 한 번에 채움
/ssot verify               # 완전성 검증 (SSOT→코드 drift + mirror-drift) → docs/ssot/_gaps.md
/ssot coverage [--scaffold] # 코드→SSOT 커버리지: 코드 표면이 항목화됐나. --scaffold로 갭을 빈/미러 노드 자동 생성
/ssot sync [--check]       # mirrored 노드를 source(원본 레포 파일)에서 재생성. --check는 드리프트만 보고(쓰기 없음)
/ssot refresh              # 코드→SSOT 증분 최신화 — config.ref 스냅샷 기준 변경분만 노드 갱신/신설 (반복 실행용)
/ssot ask "<질문>"          # 그래프 트래버설로 임의 질문에 답 (confidence·근거 id 동반)

# ── 거버넌스 모드 (변경을 "제안"으로 라우팅 — main 직접 push 금지) ──
/ssot propose "<변경>"      # 변경을 분류(정합/충돌/근간/범위외)해 PR/이슈/ADR로 라우팅
/ssot ingest <문서경로>     # 외부 기획 문서(자유형식)를 SSOT 노드/엣지로 매핑 → propose로 위임
/ssot sync-lifecycle       # "코드 생겼는데 planned"를 검출 → active 전환 PR 제안(자동 전환 금지)
/ssot flag "<문제>"         # 조회 중 발견한 문제(dangling/모순/누락) 또는 JIT 캡처(competency-gap/rationale-fragment)를 gh 이슈로 등록
/ssot curate               # ssot-capture 이슈 큐를 dedup·클러스터·디스크립터화 → propose로 위임 (별도 에이전트 주기 실행 권장)
```

`<Kind>` ∈ `Platform · Persona · Domain · Concept · Capability · SystemComponent · Integration · Invariant · Decision`

> `init`/`refresh`의 소스 레포 매핑(build config)은 `$CLAUDE_PLUGIN_DATA/ssot-build-config.json`에 둔다 — MCP의 `ssot-sources.json`과 같은 플러그인 데이터 디렉토리, git-untracked·per-machine(머신마다 로컬 경로가 다름).

## 모드별 동작

### `init`
1. `reference/schema/`, `reference/skeleton/`을 대상 프로젝트 `docs/ssot/`로 복사한다.
2. `docs/ssot/README.md`를 생성한다(= `reference/methodology.md`를 그 프로젝트용으로 안내하는 진입 문서. 방법론 본문은 복사하되 "이 프로젝트의 SSOT" 맥락 한 단락을 머리에 붙인다).
3. `docs/ssot/{personas,domains,concepts,capabilities,components,integrations,invariants,decisions}/` 빈 디렉토리와 `platform.md`(skeleton 복사) 생성.
4. `node ~/.claude/skills/ssot/scripts/build-graph.mjs docs/ssot` 로 빈 카탈로그 생성 후, 상태를 요약 보고.
5. **소스 레포 매핑(HITL 구조화 인테이크)** — 골격만 세우는 데 그치지 않고, 이 SSOT가 *어떤 제품 코드에서 도출/최신화되는지*도 함께 잡는다. build config(`$CLAUDE_PLUGIN_DATA/ssot-build-config.json`)가 없으면 각 소스 레포마다 `id / 로컬 경로(root 기준) / ref(커밋·태그 권장 = 재현 가능 스냅샷, 브랜치 = 추적) / globs`를 **하나씩 묻고 즉시 검증**한다(경로 실존 · git 레포 여부 · `git rev-parse <ref>` resolve). 자유 프롬프트가 아니라 **HITL 구조화 입력**이다 — 매 실행 재현 가능해야 하므로 값을 확정적으로 받는다. 확정되면 `$CLAUDE_PLUGIN_DATA/ssot-build-config.json`에 기록한다(git-untracked — 데이터 레포엔 넣지 않는다). config 스키마·resolve 순서는 `refresh` 절 참조.
   - **왜 ref를 핀하나**: SSOT는 코드↔산출물의 기준점이라 "어떤 커밋의 코드에서 이 as-is가 나왔나"가 추적돼야 재현·검증된다. ref 없이 그때그때 HEAD로 만들면 기준점이 흔들린다.

### `add <Kind> [주제]`
1. `reference/skeleton/<Kind>.md`를 해당 디렉토리에 `id` 기반 파일명으로 복사.
2. **4축 측면을 채운다.** 코드/기존 문서에서 확인 가능한 것은 추출하고, 사람만 아는 것(목적·페르소나·불변식의 옳음)은 사용자에게 묻는다. **모르는 칸은 비우지 말고 명시적 빈칸으로**: `owner: TBD`, `confidence: unverified|inferred`, 본문 `- [ ] OPEN: ...`.
3. **자기완결적으로 본문을 채운다 (§1b 필수).** 본문에 그 대상의 **원본 데이터를 그대로 담는다** — 권한이면 역할·키·평가 흐름 전체, 엔티티면 테이블·FK·제약 전체. "다른 문서 참조"로 때우지 않는다. `implementedIn`은 근거가 아니라 현재 구현 위치(provenance, drift 추적)일 뿐이다. 판정: "코드와 다른 문서가 다 사라져도 이 노드만으로 재현 가능한가?"
4. 코드에서 추론한 값은 `confidence: inferred`로 표기(사람 확인 전).
5. 추가 후 `verify`를 돌려 새로 생긴 끊긴 링크(이 대상이 가리키는 아직 없는 대상)를 빈칸으로 보고.

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

### `refresh` (코드→SSOT 증분 최신화 — 반복 실행용)

`sync`가 mirrored 노드를 원본에서 통째로 다시 내려받는 짝이라면, `refresh`는 **authored 노드**를 제품 코드의 변경분만 골라 따라가게 하는 반복 실행 오케스트레이터다. 이미 구축된 SSOT를 진화하는 제품 레포에 맞춰 주기적으로 최신화한다. 결정적 절반은 스크립트가, 비결정 절반(config 인테이크 · 본문 갱신·신설 판단)은 스킬 본문(LLM)이 소유한다.

**config 확인 우선 (HITL — 스크립트 실행 전):**
refresh는 항상 build config를 먼저 확정한 뒤 돌린다. config는 "어떤 커밋 기준으로 도출하나"(의도)이고, 이 값이 diff의 목표점이다.
- **config 없음** → 위 `init`과 동일한 구조화 인테이크(소스 레포별 `id / 경로 / ref / globs`, 즉시 검증)로 받아 `$CLAUDE_PLUGIN_DATA/ssot-build-config.json`에 기록한다.
- **config 있음** → 로드해 **사용자에게 보여주고 확인**받은 뒤 진행한다(무단 사용 금지). "이 스냅샷(`ref`) 기준으로 갈까요, `ref`를 올릴까요?" — 사용자가 `config.ref`를 새 커밋으로 bump하면 그 델타만 최신화한다.
- diff는 언제나 **`state.syncedRef → config.ref`(핀된 스냅샷)** 이지 임의 HEAD가 아니다.

**CONFIG(의도) / STATE(진행) 분리:**
- **CONFIG** — `$CLAUDE_PLUGIN_DATA/ssot-build-config.json` (git-untracked · per-machine, HITL이 작성; MCP `ssot-sources.json`과 같은 플러그인 데이터 디렉토리, 로컬 경로가 머신마다 달라 여기 둔다). refresh.mjs는 `--config <path>` → 환경변수 `SSOT_BUILD_CONFIG_FILE` → `$CLAUDE_PLUGIN_DATA/ssot-build-config.json` 순으로 resolve한다.
  ```jsonc
  { "projects": [
    { "id": "air-studio",
      "ssotDir": "<이 SSOT 데이터 디렉토리 절대경로>",
      "root": "<워크스페이스 루트 = --root>",
      "repos": [ { "id":"air-studio-app", "path":"<root 기준 레포 상대경로>", "ref":"<커밋|태그|브랜치>", "globs":["src/**/*.java"] } ] }
  ]}
  ```
- **STATE(진행)** — `<ssotDir>/_sync-state.json`: `{ "repos":[{ "id","syncedRef" }], "lastRun" }`. 스크립트가 소유하며 `--advance`로만 전진한다.

**결정적 (스크립트 — 이미 구현됨):**
```
node ~/.claude/skills/ssot/scripts/build-graph.mjs <ssotDir>
node ~/.claude/skills/ssot/scripts/refresh.mjs <ssotDir> --config <path> --root <워크스페이스루트>   # plan: worklist 산출
# … 스킬이 노드를 쓴 뒤 …
node ~/.claude/skills/ssot/scripts/refresh.mjs <ssotDir> --config <path> --advance                    # state ref 전진
```
- **plan 모드**(기본): 각 소스 레포의 `state.syncedRef → config.ref` git diff로 변경/추가/삭제 파일을 게이트하고, `implementedIn`(file-granular)으로 노드에 매핑해 `_refresh.worklist.json` + `_refresh.md`를 낸다.
- **`--check`**: hook용 — 쓰지 않고 drift가 있으면 exit 1.
- **`--advance`**: 쓰기 성공 후에만 호출해 `state.syncedRef`를 `config.ref`로 전진(멱등 — 재실행 안전).
- **런타임 전제**: 실행 위치에 각 소스 레포가 클론·pull돼 있고 `config.ref`가 resolve 가능해야 한다(회사 private 레포면 접근 권한 필요).

**비결정 (스킬 본문 — LLM, 규모 크면 서브에이전트 스웜):**
스킬은 `_refresh.worklist.json`을 읽어 버킷별로 처리한다. 노드 수가 많으면 파일/노드 단위로 병렬 서브에이전트를 띄운다. worklist 구조:
```jsonc
{
  "repos":      [{ "id","path","syncedRef","configRef","resolvedRef","changedCount" }],
  "modified":   [{ "file","repo","nodes":["id"…],"reason":"drift-candidate"|"unmapped-change" }],
  "added":      [{ "file","repo","nodes":[…],"reason":"drift-candidate"|"new-surface" }],
  "deleted":    [{ "file","repo","nodes":[…],"reason":"orphan"|"deleted-unmapped" }],
  "divergence": [{ "file","repo","nodes":[…],"reason":"design-intent-vs-code" }],
  "problems":   [{ "id","issue" }]
}
```
버킷별 동작:
- **modified · drift-candidate**: **active이면서 `inferred`/`unverified`인 노드에만** 적용된다(변경 소스가 `planned` 또는 `confidence:high` 노드에 매핑되면 modified가 아니라 divergence 버킷으로 빠진다). 매핑된 노드의 옛 본문 + 변경 소스 파일을 대조해 정책·동작이 실제로 바뀌었는지 판정하고, 바뀐 부분만 노드 본문을 **자연어로** 갱신한다(코드 옮겨적기 금지 — 규칙 C / methodology §0). `confidence: inferred`, `lastVerified: <오늘>`로 갱신.
- **modified · unmapped-change**: 레포 단위 provenance뿐이라 노드 매핑이 없다. 변경 소스 내용으로 어떤 기존 노드가 영향받는지 식별하고(없으면 new-surface로 강등), 그 노드의 `implementedIn`에 이 파일 경로를 심어 다음 회차 diff 게이트를 정밀화한다(provenance 정밀화).
- **divergence · design-intent-vs-code**: 변경 소스가 `planned`(기획 의도) 또는 `confidence:high`(사람 검증) 노드에 매핑된 경우. **본문을 코드 as-is로 덮어쓰지 않는다.** 대신 그 노드에 `- [ ] OPEN: 기획(이 노드) vs 코드(<파일>) 불일치 — 어느 쪽이 맞는지 사람 판정 필요`를 남겨 divergence를 드러낸다(methodology §7: 불일치는 판정 금지). SSOT는 코드의 사본이 아니라 기획↔코드의 기준점이므로, 코드가 바뀌었다고 기획 의도를 지우지 않는다.
- **added · new-surface**: SSOT에 없는 새 표면 → 해당 kind(Endpoint/Screen 등) 노드를 신설한다. 최소 scaffold(빈 골격 + `- [ ] OPEN`)를 만들되, 소스에서 4축 측면을 추론 가능하면 채운다(`confidence: inferred`). `implementedIn`에 소스 파일 경로 기입.
- **deleted · orphan**: 소스가 삭제된 노드 → **자동 삭제·자동 deprecated 전환 금지**. `lifecycle: deprecated` 전환은 사람 판단 영역이므로, 노드에 `- [ ] OPEN: source 삭제됨 — deprecated 여부 확인 필요`를 남기고 리포트한다.
- **problems**: 로컬에 없는/git 아닌 레포 — 사용자에게 "클론·pull 필요"로 보고. 그 레포는 이번 회차 skip.

**쓰기 규약 (핵심)**: refresh는 변경을 **SSOT 작업트리에 직접 write**하고 **PR/이슈/브랜치/propose로 라우팅하지 않는다**. 이는 거버넌스 모드(`propose` 등)와 의도적으로 다르다 — refresh는 코드 사실을 따라가는 기계적 최신화라 사람 리뷰 게이트를 강제하지 않는다(커밋은 사용자가 한다). 쓰기가 모두 끝나면 `refresh.mjs --advance`로 ref를 전진시킨다. 일부라도 실패하면 `--advance`를 건너뛰어 재실행이 같은 변경을 다시 처리하게 둔다.

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
- **refresh의 경계**: 변경 파일 게이트(git diff)·노드 매핑·orphan 검출은 결정적(스크립트)이지만, 바뀐 소스가 정책·동작을 실제로 바꿨는지의 **본문 갱신**과 orphan의 **deprecated 여부 판정**은 사람/LLM 영역이다 — 코드가 사라졌다고 자동으로 노드를 지우거나 상태를 내리지 않는다(위 "authored 노드 내용 정확성은 사람 owner 영역"과 동일선).

## 다른 축과의 구별
이 스킬은 **제품·도메인·시스템 맥락(제품 축)** 전용이다. "코드를 어떻게 짜는가"(린트·타입·스타일·아키텍처 규칙 = 엔지니어링 축)는 대상이 아니다. 둘은 `implementedIn` 링크로만 만난다.
