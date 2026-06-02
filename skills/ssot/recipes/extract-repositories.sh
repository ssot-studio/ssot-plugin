#!/usr/bin/env bash
#
# extract-repositories.sh — *Repository.ts 파일명을 Concept 표면 TSV 로 추출.
#
# packages/repositories/src 의 `*Repository.ts` 파일 1개 = API 통신 레이어가 다루는
# 도메인 개념(Concept) 1개. 파일명에서 'Repository' 접미사를 떼고 도메인명을 개념으로 본다.
#
# 사용법:
#   extract-repositories.sh <repositoriesSrcDir> [repoRoot]
#     <repositoriesSrcDir>  packages/repositories/src 경로
#     [repoRoot]            provenance 상대화 기준 (생략 시 입력 경로 그대로)
#
# 출력: stdout, 각 줄 탭(\t) 4필드:
#   Concept<TAB>concept.<slug><TAB><DomainName><TAB><provenance>
#     id          concept.<kebab domain>  (예: AccessControlRepository → concept.access-control)
#     title       도메인 PascalName (예: "AccessControl")
#     provenance  repoRoot 기준 Repository 파일 경로
#
# 이 TSV 는 coverage.mjs --surface 의 `kind\tid\ttitle\tprovenance` 스키마와 일치.

set -euo pipefail

usage() {
  echo "usage: extract-repositories.sh <repositoriesSrcDir> [repoRoot]" >&2
  exit 2
}

SRC_DIR="${1:-}"
REPO_ROOT="${2:-}"

[ -n "$SRC_DIR" ] || usage
[ -d "$SRC_DIR" ] || { echo "extract-repositories: not a directory: $SRC_DIR" >&2; exit 2; }

SRC_ABS="$(cd "$SRC_DIR" && pwd)"

# PascalCase → kebab-case (대문자 경계마다 '-' 삽입 후 소문자화).
kebab() {
  printf '%s' "$1" \
    | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g; s/([A-Z]+)([A-Z][a-z])/\1-\2/g' \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/-+/-/g; s/^-//; s/-$//'
}

find "$SRC_ABS" -type f -name '*Repository.ts' \
  ! -name '*.d.ts' \
  ! -name '*.test.ts' \
  ! -name '*.spec.ts' \
  -print0 \
| sort -z \
| while IFS= read -r -d '' file; do
    base="$(basename "$file" .ts)"        # AccessControlRepository
    domain="${base%Repository}"           # AccessControl
    [ -n "$domain" ] || continue

    slug="$(kebab "$domain")"
    id="concept.${slug}"

    if [ -n "$REPO_ROOT" ]; then
      root_abs="$(cd "$REPO_ROOT" && pwd)"
      prov="${file#"$root_abs"/}"
    else
      prov="$file"
    fi

    printf 'Concept\t%s\t%s\t%s\n' "$id" "$domain" "$prov"
  done
