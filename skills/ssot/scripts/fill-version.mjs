#!/usr/bin/env node
// fill-version.mjs — SSOT 노드에 현 제품 버전(스냅샷 기준선)을 일괄 부여한다.
// core(vendor) 파서로 노드를 읽고, 결정적 규칙으로만 frontmatter 의 introducedIn 필드와
// tags[] 의 version 태그를 채운다(추론 남발 금지). 멱등 — 이미 채워진 노드는 건드리지 않는다.
//
// 채우는 규칙 (CURRENT = v2.5.4):
//   - lifecycle:planned   → 제외(미래 노드). introducedIn/version 태그 부여 안 함.
//   - lifecycle:active/deprecated (현 스냅샷 멤버) →
//       introducedIn: <CURRENT>  (이미 값이 있으면 보존 — 더 이른 도입버전을 덮지 않음)
//       tags += version:<CURRENT-kebab>  (기존 태그 보존, 합집합·중복 제거)
//   - lifecycle 미지정 → 스키마상 active 로 간주(스냅샷 멤버) → 위 active 규칙 적용.
//
// 버전 표현 분리(스키마 일치):
//   - introducedIn 필드: 정밀 dotted 형식 v2.5.4 (스키마 pattern ^v\d+\.\d+\.\d+$).
//   - version 태그: 스키마 tags pattern(^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*$) 상 값에 '.' 불가.
//                   → kebab 정규화 version:v2-5-4 (x-tags 의 version 네임스페이스 예시와 동일).
//                   dotted 태그(version:v2.5.4)는 verify 의 비통제tags 위반이 되므로 쓰지 않는다.
//
// 사용: node fill-version.mjs <ssotDir> [--version vX.Y.Z] [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../../../vendor/core.mjs';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const SCHEMA_PATH = join(SCRIPT_DIR, '..', 'reference', 'schema', 'ssot-v1.schema.json');

const argv = process.argv.slice(2);
const ssotDir = argv.find((a) => !a.startsWith('--'));
const DRY = argv.includes('--dry');
const vi = argv.indexOf('--version');
const CURRENT = vi >= 0 && argv[vi + 1] ? argv[vi + 1] : 'v2.5.4';
if (!ssotDir) { console.error('usage: node fill-version.mjs <ssotDir> [--version vX.Y.Z] [--dry]'); process.exit(2); }
if (!existsSync(ssotDir)) { console.error(`not found: ${ssotDir}`); process.exit(2); }

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const VERSION_FIELD_PATTERN = new RegExp(schema.properties.introducedIn.pattern);
const TAG_PATTERN = new RegExp(schema.properties.tags.items.pattern);
const TAG_NAMESPACES = new Set(Object.keys((schema['x-tags'] || {}).namespaces || {}));

// introducedIn 필드 값(정밀 dotted) 검증.
if (!VERSION_FIELD_PATTERN.test(CURRENT)) {
  console.error(`버전 형식 위반(introducedIn pattern): ${CURRENT}`); process.exit(2);
}
// version 태그용 kebab 정규화: 'v2.5.4' → 'version:v2-5-4'.
const VERSION_TAG = `version:${CURRENT.replace(/\./g, '-')}`;
if (!TAG_PATTERN.test(VERSION_TAG)) {
  console.error(`version 태그가 스키마 tags pattern 위반: ${VERSION_TAG}`); process.exit(2);
}
if (TAG_NAMESPACES.size && !TAG_NAMESPACES.has('version')) {
  console.error(`'version' 이 x-tags 허용 네임스페이스가 아님`); process.exit(2);
}

function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collect(full, acc);
    else if (name.endsWith('.md') && name.toLowerCase() !== 'readme.md') acc.push(full);
  }
  return acc;
}

// 스냅샷 멤버 판정: planned 제외. lifecycle 미지정은 스키마상 active 로 간주(스냅샷 멤버).
function isSnapshotMember(fm) {
  const lc = typeof fm.lifecycle === 'string' ? fm.lifecycle.trim() : '';
  return lc !== 'planned';
}

const FM_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;

// tags 블록 직렬화(결정적 정렬).
function serializeTags(tags) {
  const sorted = [...tags].sort();
  return 'tags:\n' + sorted.map((t) => `  - ${t}`).join('\n');
}

// frontmatter raw 재작성: tags 블록을 새 합집합으로 교체하고, introducedIn 을 보장한다.
// introducedIn 이 이미 있으면 보존(덮지 않음). 없으면 추가.
function rewriteFrontmatter(fmRaw, { mergedTags, needIntroducedIn }) {
  const lines = fmRaw.split('\n');
  const kept = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^tags\s*:/.test(line)) {
      const after = line.slice(line.indexOf(':') + 1).trim();
      i++;
      if (after === '') {
        while (i < lines.length && /^\s+-\s/.test(lines[i])) i++;
      }
      continue;
    }
    kept.push(line);
    i++;
  }
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  // introducedIn 은 스칼라 키 — tags 블록 앞(다른 스칼라 측면 옆)에 둔다.
  if (needIntroducedIn) kept.push(`introducedIn: ${CURRENT}`);
  kept.push(serializeTags(mergedTags));
  return kept.join('\n');
}

const files = collect(ssotDir);
let totalNodes = 0, skippedPlanned = 0, changed = 0, skippedNoFm = 0;
let introducedFilled = 0, introducedPreserved = 0, versionTagFilled = 0;
const plannedIds = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const { frontmatter: fm, hasFrontmatter } = splitFrontmatter(content);
  if (!hasFrontmatter) { skippedNoFm++; continue; }
  totalNodes++;

  if (!isSnapshotMember(fm)) {
    skippedPlanned++;
    if (typeof fm.id === 'string') plannedIds.push(fm.id);
    continue;
  }

  // version 태그 합집합.
  const existing = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  const merged = [...new Set([...existing, VERSION_TAG])];
  const tagsChanged = !(merged.length === existing.length && merged.every((t) => existing.includes(t)));

  // introducedIn: 이미 dotted 버전 값이 있으면 보존(더 이른 도입버전 비파괴), 없으면 채움.
  const hasIntroduced = typeof fm.introducedIn === 'string' && fm.introducedIn.trim() !== '';
  const needIntroducedIn = !hasIntroduced;

  if (hasIntroduced) introducedPreserved++;

  if (!tagsChanged && !needIntroducedIn) continue; // 멱등: 변경 없음.

  if (needIntroducedIn) introducedFilled++;
  if (tagsChanged) versionTagFilled++;

  const m = content.match(FM_RE);
  if (!m) continue;
  const newFmInner = rewriteFrontmatter(m[2], { mergedTags: merged, needIntroducedIn });
  const newContent = content.replace(FM_RE, `${m[1]}${newFmInner}${m[3]}`);
  if (!DRY) writeFileSync(file, newContent);
  changed++;
}

console.log(`fill-version: CURRENT=${CURRENT} tag=${VERSION_TAG}${DRY ? ' (dry-run)' : ''}`);
console.log(`  nodes=${totalNodes} changed=${changed} skippedPlanned=${skippedPlanned} skippedNoFm=${skippedNoFm}`);
console.log(`  introducedIn: filled=${introducedFilled} preserved=${introducedPreserved}`);
console.log(`  version 태그(${VERSION_TAG}) 신규부여=${versionTagFilled}`);
if (plannedIds.length) console.log(`  제외(planned/future): ${plannedIds.join(', ')}`);
