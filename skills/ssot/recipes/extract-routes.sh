#!/usr/bin/env bash
#
# extract-routes.sh — TanStack Router 라우트를 Screen 표면 TSV 로 추출.
#
# 라우트 파일(.tsx) 중 `createFileRoute(...)` 를 호출하는 파일 1개 = Screen 표면행 1개.
# `createRootRoute` 만 쓰는 __root.tsx, routeTree.gen.ts, pathless 레이아웃 전용 파일은 제외.
#
# 사용법:
#   extract-routes.sh <routesDir> <appAbbr> [repoRoot]
#     <routesDir>  앱의 src/routes 절대/상대 경로 (예: apps/air-studio-app/src/routes)
#     <appAbbr>    앱 약자 (예: app | admin | chat) — id prefix 및 slug 충돌 방지용
#     [repoRoot]   provenance 경로를 이 루트 기준 상대경로로 표기 (생략 시 입력 경로 그대로)
#
# 출력: stdout, 각 줄 탭(\t) 4필드:
#   Screen<TAB>screen.<appAbbr>-<route-slug><TAB><title><TAB><provenance>
#     id          screen.<appAbbr>-<kebab route>  (전역 유일)
#     title       사람이 읽는 화면 경로 (예: "app /studio/agent/create")
#     provenance  repoRoot 기준 라우트 파일 경로
#
# 이 TSV 는 coverage.mjs --surface 가 기대하는 `kind\tid\ttitle\tprovenance` 스키마와 일치.

set -euo pipefail

usage() {
  echo "usage: extract-routes.sh <routesDir> <appAbbr> [repoRoot]" >&2
  exit 2
}

ROUTES_DIR="${1:-}"
APP_ABBR="${2:-}"
REPO_ROOT="${3:-}"

[ -n "$ROUTES_DIR" ] || usage
[ -n "$APP_ABBR" ] || usage
[ -d "$ROUTES_DIR" ] || { echo "extract-routes: not a directory: $ROUTES_DIR" >&2; exit 2; }

# 절대경로 정규화 (provenance 상대화에 필요)
ROUTES_DIR_ABS="$(cd "$ROUTES_DIR" && pwd)"

# kebab-case 정규화: 영숫자만 남기고 나머지는 '-', 소문자, 중복/양끝 '-' 제거.
slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/-+/-/g; s/^-//; s/-$//'
}

# createFileRoute 를 호출하는 파일만 대상. (createRootRoute 만 있는 __root.tsx 자동 제외)
find "$ROUTES_DIR_ABS" -type f -name '*.tsx' \
  ! -name 'routeTree.gen.ts' \
  ! -name '*.gen.tsx' \
  -print0 \
| sort -z \
| while IFS= read -r -d '' file; do
    grep -q 'createFileRoute' "$file" || continue

    # createFileRoute('<path>') 의 첫 인자(라우트 path)를 권위 있는 경로로 사용.
    # 없으면(드묾) 파일 경로에서 유도.
    route_path="$(
      grep -oE "createFileRoute\(\s*['\"][^'\"]*['\"]" "$file" \
        | head -n1 \
        | sed -E "s/createFileRoute\(\s*['\"]([^'\"]*)['\"]/\1/"
    )"
    if [ -z "$route_path" ]; then
      # fallback: routes 디렉토리 기준 상대 파일경로에서 확장자/index 정리
      rel="${file#"$ROUTES_DIR_ABS"/}"
      route_path="/${rel%.tsx}"
      route_path="${route_path%/index}"
    fi

    # 동적 세그먼트($id, $agentId)와 pathless 레이아웃 마커(_auth 등)를 slug 친화적으로.
    slug="$(slugify "${APP_ABBR}-${route_path}")"
    # route_path 가 '/' 뿐이면(루트 인덱스) slug 가 appAbbr 만 남음 → -root 부여
    [ "$slug" = "$(slugify "$APP_ABBR")" ] && slug="$(slugify "$APP_ABBR")-root"

    id="screen.${slug}"
    title="${APP_ABBR} ${route_path}"

    if [ -n "$REPO_ROOT" ]; then
      root_abs="$(cd "$REPO_ROOT" && pwd)"
      prov="${file#"$root_abs"/}"
    else
      prov="$file"
    fi

    printf 'Screen\t%s\t%s\t%s\n' "$id" "$title" "$prov"
  done
