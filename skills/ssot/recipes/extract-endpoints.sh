#!/usr/bin/env bash
#
# extract-endpoints.sh — api-spec 마크다운 표를 Endpoint 표면 TSV 로 추출.
#
# 대상 표 스키마 (air-studio-front/docs/api-spec/*-endpoints.md 공통):
#   | Repository | Method(fn) | HTTP | Path | Client | Request Type | Response Type |
# HTTP 컬럼(3)이 메서드, Path 컬럼(4)이 경로. 표 1행 = Endpoint 표면행 1개.
# 헤더행(`| Repository |`)과 구분선(`|---`)은 제외.
#
# 사용법:
#   extract-endpoints.sh <mdFile> [repoRoot]
#     <mdFile>    api-spec md 파일 (예: docs/api-spec/spring-endpoints.md)
#     [repoRoot]  provenance 를 이 루트 기준 상대경로로 표기 (생략 시 입력 경로 그대로)
#
# 출력: stdout, 각 줄 탭(\t) 4필드:
#   Endpoint<TAB>endpoint.<slug><TAB><METHOD PATH><TAB><provenance>
#     id          endpoint.<METHOD>-<kebab path>  (경로 변수 ${id} → id, 전역 유일)
#     title       "<METHOD> <PATH>" (사람이 읽는 형태, 백틱·꼬리표 제거)
#     provenance  repoRoot 기준 md 파일 경로
#
# 이 TSV 는 coverage.mjs --surface 의 `kind\tid\ttitle\tprovenance` 스키마와 일치.

set -euo pipefail

usage() {
  echo "usage: extract-endpoints.sh <mdFile> [repoRoot]" >&2
  exit 2
}

MD_FILE="${1:-}"
REPO_ROOT="${2:-}"

[ -n "$MD_FILE" ] || usage
[ -f "$MD_FILE" ] || { echo "extract-endpoints: not a file: $MD_FILE" >&2; exit 2; }

MD_ABS="$(cd "$(dirname "$MD_FILE")" && pwd)/$(basename "$MD_FILE")"

if [ -n "$REPO_ROOT" ]; then
  root_abs="$(cd "$REPO_ROOT" && pwd)"
  PROV="${MD_ABS#"$root_abs"/}"
else
  PROV="$MD_FILE"
fi

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/-+/-/g; s/^-//; s/-$//'
}

# 마크다운 표 행만 (선두 `|`), 헤더/구분선 제외.
# 같은 METHOD+PATH 엔드포인트가 여러 repository 함수에 의해 호출되면 표에 여러 행으로
# 나타나지만, Endpoint 표면은 METHOD+PATH 가 키이므로 노드 1개로 수렴해야 한다
# (id 전역 유일 — coverage.mjs scaffold 요구). 따라서 말미에 id 기준 dedup(첫 출현 유지).
grep -E '^\|' "$MD_FILE" \
| grep -vE '^\|\s*-+' \
| grep -viE '^\|\s*Repository\s*\|' \
| while IFS= read -r line; do
    # 선두/말미 파이프 제거 후 '|' 로 컬럼 분해.
    body="${line#|}"
    body="${body%|}"

    IFS='|' read -r _repo _fn http path _rest <<EOF
$body
EOF

    # 트림 헬퍼: 양끝 공백 제거.
    trim() { printf '%s' "$1" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'; }
    http="$(trim "$http")"
    path="$(trim "$path")"

    # HTTP 메서드 검증 — 메서드 컬럼이 아닌 표(다른 스키마)는 통째로 스킵.
    case "$http" in
      GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) : ;;
      *) continue ;;
    esac

    # Path 정제: 백틱 제거, 경로 변수 ${x} → 토큰 'id', 꼬리 주석/쿼리/괄호표기 정리.
    #  - `/api/...` → /api/...
    #  - `(conditional)` `(core half)` 같은 꼬리표는 title 에서 떼고 path 만 사용.
    clean_path="$(printf '%s' "$path" | sed -E 's/`//g')"
    # 꼬리 괄호 주석 제거 (예: " (conditional)").
    clean_path="$(printf '%s' "$clean_path" | sed -E 's/[[:space:]]*\([^)]*\)[[:space:]]*$//')"
    clean_path="$(trim "$clean_path")"
    [ -n "$clean_path" ] || continue

    # 쿼리스트링 제거(슬러그 안정화), 경로 변수 정규화.
    title_path="$clean_path"
    slug_path="$(printf '%s' "$clean_path" \
      | sed -E 's/\?.*$//' \
      | sed -E 's/\$\{[^}]*\}/id/g')"

    slug="$(slugify "${http}-${slug_path}")"
    id="endpoint.${slug}"
    title="${http} ${title_path}"

    printf 'Endpoint\t%s\t%s\t%s\n' "$id" "$title" "$PROV"
  done \
| awk -F'\t' '!seen[$2]++'
