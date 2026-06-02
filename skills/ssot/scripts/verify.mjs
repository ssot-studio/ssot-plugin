#!/usr/bin/env node
// verify.mjs — 카탈로그 그래프의 완전성을 결정적으로 검증하고 _gaps.md를 생성한다.
// 의존성 없음. 사용: node verify.mjs <ssotDir> [cadenceDays=90]
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const SCHEMA_PATH = join(SCRIPT_DIR, '..', 'reference', 'schema', 'ssot-v1.schema.json');

const argv = process.argv.slice(2);
const ssotDir = argv[0];
// --root: implementedIn(provenance) 경로의 기준 디렉토리. 멀티레포 SSOT는 레포들의 공통 조상(워크스페이스 루트)을 준다. 기본 cwd.
let rootDir = process.cwd();
const ri = argv.indexOf('--root');
if (ri >= 0 && argv[ri + 1]) rootDir = argv[ri + 1];
const cadenceDays = Number(argv.slice(1).find(a => /^\d+$/.test(a)) || 90);
if (!ssotDir) { console.error('usage: node verify.mjs <ssotDir> [cadenceDays] [--root <dir>]'); process.exit(2); }

const catalogPath = join(ssotDir, '_catalog.json');
if (!existsSync(catalogPath)) { console.error(`먼저 build-graph.mjs 를 실행하세요. (${catalogPath} 없음)`); process.exit(2); }
const cat = JSON.parse(readFileSync(catalogPath, 'utf8'));
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

const REQUIRED_FACETS = schema['x-required-facets-by-kind'];
const REQUIRED_SECTIONS = schema['x-required-sections-by-kind'] || {};
const EDGE_TYPES = schema['x-edge-types'] || {};
const STD_EDGE_TYPES = new Set(Object.keys(EDGE_TYPES).filter(k => k !== '_comment'));
const KIND_ENUM = schema.properties.kind.enum;
const CONF_ENUM = schema.properties.confidence.enum;
const ID_PATTERN = new RegExp(schema.properties.id.pattern);
// id prefix(소문자) → kind 단일 진실(x-id-prefix-to-kind). id prefix 와 kind 가 어긋나면 결함.
const ID_PREFIX_TO_KIND = { ...(schema['x-id-prefix-to-kind'] || {}) };
delete ID_PREFIX_TO_KIND._comment;
const REF = schema['x-id-reference-fields'];
const NODE_REF_FIELDS = [...REF.idList, ...REF.objectList]; // 대상 id를 가리키는 필드
const TAG_NAMESPACES = new Set(Object.keys((schema['x-tags'] || {}).namespaces || {}));
const TAG_PATTERN = new RegExp(schema.properties.tags?.items?.pattern || '^.+$');

const ids = new Set(cat.nodes.map(n => n.id));
const out = {
  schemaErrors: [], duplicateIds: [], danglingEdges: [],
  missingFacets: [], pendingFacets: [], drift: [], stale: [], orphanOwners: [], mirrorIssues: [],
  nonStdEdgeTypes: [], missingSections: [], pendingSections: [],
  badTags: [], activeWithoutCode: [], kindMismatch: [],
};

// 1. 스키마 적합성
const seen = new Map();
for (const n of cat.nodes) {
  const e = [];
  if (!n.id) e.push('id 없음');
  else if (!ID_PATTERN.test(n.id)) e.push(`id 형식 위반: ${n.id}`);
  if (!n.kind) e.push('kind 없음');
  else if (!KIND_ENUM.includes(n.kind)) e.push(`kind enum 위반: ${n.kind}`);
  // id-prefix↔kind 일관성: prefix 가 가리키는 kind 와 실제 kind 가 어긋나면 결함
  if (n.id && n.kind) {
    const prefix = n.id.split('.', 1)[0];
    const expected = ID_PREFIX_TO_KIND[prefix];
    if (expected && n.kind !== expected) {
      out.kindMismatch.push({ id: n.id, file: n.file, kind: n.kind, expected });
    }
  }
  if (!n.title) e.push('title 없음');
  if (!n.confidence) e.push('confidence 없음');
  else if (!CONF_ENUM.includes(n.confidence)) e.push(`confidence enum 위반: ${n.confidence}`);
  if (e.length) out.schemaErrors.push({ file: n.file, id: n.id || '(없음)', errors: e });
  if (n.id) seen.set(n.id, (seen.get(n.id) || 0) + 1);
}
// 2. id 유일성
for (const [id, count] of seen) if (count > 1) out.duplicateIds.push({ id, count });

// 3. 끊긴 엣지 (연결 완전성)
for (const ed of cat.edges) {
  if (!ids.has(ed.to)) out.danglingEdges.push({ from: ed.from, to: ed.to, rel: ed.rel });
}

// 4. 측면 완전성 — high-confidence는 필수 측면이 비면 gap, 그 외는 pending(정보성)
function isEmpty(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0); }
for (const n of cat.nodes) {
  const req = REQUIRED_FACETS[n.kind] || [];
  const empties = req.filter(f => isEmpty(n.facets[f]));
  if (empties.length === 0) continue;
  if (n.confidence === 'high') out.missingFacets.push({ id: n.id, file: n.file, fields: empties });
  else out.pendingFacets.push({ id: n.id, file: n.file, confidence: n.confidence, fields: empties, openCount: n.openCount });
}

// 5. implementedIn 코드 경로 실존 (코드 drift)
for (const p of cat.paths) {
  if (p.field !== 'implementedIn') continue;
  const token = p.raw.split(/\s+/)[0].replace(/[)\].,]+$/, ''); // 주석 꼬리 제거
  if (!token) continue;
  if (!existsSync(join(rootDir, token))) out.drift.push({ from: p.from, path: token });
}

// 6. lastVerified cadence 만료 (stale)
const now = new Date();
for (const n of cat.nodes) {
  if (!n.lastVerified) continue;
  const d = new Date(n.lastVerified);
  if (isNaN(d.getTime())) continue;
  const ageDays = Math.floor((now - d) / 86400000);
  if (ageDays > cadenceDays) out.stale.push({ id: n.id, lastVerified: n.lastVerified, ageDays });
}

// 6b. mirror-drift (mirrored 노드: source 실존 + source가 노드보다 최신이면 재sync 필요)
for (const n of cat.nodes) {
  if (n.facets.authority !== 'mirrored') continue;
  const src = n.facets.source;
  if (!src) { out.mirrorIssues.push({ id: n.id, issue: 'mirrored 인데 source 없음' }); continue; }
  if (!existsSync(join(rootDir, src))) { out.mirrorIssues.push({ id: n.id, issue: `source 부재: ${src}` }); continue; }
  try {
    const sm = statSync(join(rootDir, src)).mtimeMs;
    const nm = statSync(join(ssotDir, n.file)).mtimeMs;
    if (sm > nm + 1000) out.mirrorIssues.push({ id: n.id, issue: `mirror-drift: source가 더 최신 → 재sync 필요 (${src})` });
  } catch { /* stat 실패 무시 */ }
}

// 7. 고아 owner (정보성)
for (const n of cat.nodes) if (!n.owner || n.owner === 'TBD') out.orphanOwners.push({ id: n.id, file: n.file });

// 8. 엣지 어휘 — relatesTo:<type> 의 type 이 표준 어휘집(x-edge-types)에 없으면 정보 레벨(차단 아님, 권장)
if (STD_EDGE_TYPES.size) {
  const seenNonStd = new Map(); // type → 사용 건수
  for (const ed of cat.edges) {
    const m = /^relatesTo:(.+)$/.exec(ed.rel || '');
    if (!m) continue;
    const t = m[1];
    if (t === '?' || STD_EDGE_TYPES.has(t)) continue;
    if (!seenNonStd.has(t)) seenNonStd.set(t, []);
    seenNonStd.get(t).push(ed.from);
  }
  for (const [type, froms] of seenNonStd) out.nonStdEdgeTypes.push({ type, count: froms.length, sample: froms[0] });
}

// 9. 본문 섹션 완전성 — 표준 섹션(x-required-sections-by-kind) 누락. high-conf=결함, 그 외=정보(측면미완과 동일 정신)
for (const n of cat.nodes) {
  const req = REQUIRED_SECTIONS[n.kind];
  if (!req || !req.length) continue;
  const have = new Set(n.sections || []);
  const missing = req.filter(s => !have.has(s));
  if (missing.length === 0) continue;
  if (n.confidence === 'high') out.missingSections.push({ id: n.id, file: n.file, sections: missing });
  else out.pendingSections.push({ id: n.id, file: n.file, confidence: n.confidence, sections: missing });
}

// 10. tags 통제 어휘 — 'namespace:value' 형식 + 허용 네임스페이스(x-tags). 위반 시 경고(정보, 차단 아님)
for (const n of cat.nodes) {
  const tags = Array.isArray(n.tags) ? n.tags : (Array.isArray(n.facets.tags) ? n.facets.tags : []);
  if (!tags.length) continue;
  const bad = [];
  for (const t of tags) {
    const s = String(t);
    if (!TAG_PATTERN.test(s)) { bad.push(`${s} (형식: namespace:value 아님)`); continue; }
    const ns = s.split(':')[0];
    if (TAG_NAMESPACES.size && !TAG_NAMESPACES.has(ns)) bad.push(`${s} (비허용 네임스페이스 '${ns}')`);
  }
  if (bad.length) out.badTags.push({ id: n.id, file: n.file, tags: bad });
}

// 11. lifecycle=active 인데 코드 provenance(implementedIn) 비어있음 — 경고(정보).
//     implementedIn 이 kind 의 필수 측면인 경우(코드를 갖는 게 정상인 kind)만 검사해 노이즈 억제.
for (const n of cat.nodes) {
  if (n.lifecycle !== 'active') continue;
  if (!(REQUIRED_FACETS[n.kind] || []).includes('implementedIn')) continue;
  const impl = n.facets.implementedIn;
  if (!Array.isArray(impl) || impl.length === 0) out.activeWithoutCode.push({ id: n.id, file: n.file });
}

// ---------- _gaps.md 작성 ----------
const L = [];
L.push('# SSOT 완전성 검증 리포트 (_gaps.md)');
L.push('');
L.push('> 이 파일은 `verify.mjs`가 생성한 결정적 검증 결과다. 직접 편집하지 말 것. 빈칸은 에러가 아니라 채워야 할 작업 목록이다.');
L.push('');
L.push(`- 대상(노드): **${cat.nodeCount}** · 엣지: **${cat.edgeCount}** · 코드링크: **${cat.paths.length}**`);
L.push(`- cadence 기준: ${cadenceDays}일`);
L.push('');

const fatal = out.schemaErrors.length + out.duplicateIds.length + out.danglingEdges.length + out.kindMismatch.length + (cat.parseErrors?.length || 0);
L.push('## 요약');
L.push('');
L.push('| 검사 | 분류 | 건수 |');
L.push('|------|------|------|');
L.push(`| frontmatter 파싱 오류 | 치명 | ${cat.parseErrors?.length || 0} |`);
L.push(`| 스키마 위반 | 치명 | ${out.schemaErrors.length} |`);
L.push(`| id-prefix↔kind 불일치 | 치명 | ${out.kindMismatch.length} |`);
L.push(`| id 중복 | 치명 | ${out.duplicateIds.length} |`);
L.push(`| 끊긴 엣지(연결 완전성) | 치명 | ${out.danglingEdges.length} |`);
L.push(`| 측면 누락(high-conf, 측면 완전성) | 결함 | ${out.missingFacets.length} |`);
L.push(`| 측면 미완(low-conf, 진행중) | 정보 | ${out.pendingFacets.length} |`);
L.push(`| 본문 섹션 누락(high-conf) | 결함 | ${out.missingSections.length} |`);
L.push(`| 본문 섹션 미완(low-conf, 진행중) | 정보 | ${out.pendingSections.length} |`);
L.push(`| 코드 drift(implementedIn 경로 부재) | 결함 | ${out.drift.length} |`);
L.push(`| mirror-drift(미러 동기화) | 결함 | ${out.mirrorIssues.length} |`);
L.push(`| 비표준 엣지 type(어휘 권장) | 정보 | ${out.nonStdEdgeTypes.length} |`);
L.push(`| 비통제 tags(x-tags 네임스페이스 위반) | 정보 | ${out.badTags.length} |`);
L.push(`| active인데 코드 provenance 없음 | 정보 | ${out.activeWithoutCode.length} |`);
L.push(`| cadence 만료(stale) | 정보 | ${out.stale.length} |`);
L.push(`| 고아 owner(TBD) | 정보 | ${out.orphanOwners.length} |`);
L.push('');

function section(title, arr, fmt) {
  L.push(`## ${title} (${arr.length})`);
  L.push('');
  if (arr.length === 0) { L.push('_없음_'); L.push(''); return; }
  for (const x of arr) L.push('- ' + fmt(x));
  L.push('');
}
if (cat.parseErrors?.length) section('frontmatter 파싱 오류', cat.parseErrors, x => `\`${x.file}\` — ${x.reason}`);
section('스키마 위반 (치명)', out.schemaErrors, x => `\`${x.file}\` (${x.id}) — ${x.errors.join('; ')}`);
section('id-prefix↔kind 불일치 (치명)', out.kindMismatch, x => `\`${x.id}\` (\`${x.file}\`) — kind:\`${x.kind}\` 인데 prefix 상 \`${x.expected}\` 여야 함`);
section('id 중복 (치명)', out.duplicateIds, x => `\`${x.id}\` — ${x.count}회`);
section('끊긴 엣지 — 연결 완전성 (치명: "여기 빈칸")', out.danglingEdges, x => `\`${x.from}\` --(${x.rel})--> \`${x.to}\` ← 대상 \`${x.to}\` 가 없음`);
section('측면 누락 — high-confidence인데 필수 측면이 빔 (결함)', out.missingFacets, x => `\`${x.id}\` (\`${x.file}\`) — 빈 측면: ${x.fields.join(', ')}`);
section('측면 미완 — 진행중(low-confidence) (정보)', out.pendingFacets, x => `\`${x.id}\` [${x.confidence}] — 미완 측면: ${x.fields.join(', ')} (OPEN ${x.openCount})`);
section('본문 섹션 누락 — high-confidence인데 표준 섹션이 빔 (결함)', out.missingSections, x => `\`${x.id}\` (\`${x.file}\`) — 빠진 섹션: ${x.sections.join(', ')}`);
section('본문 섹션 미완 — 진행중(low-confidence) (정보)', out.pendingSections, x => `\`${x.id}\` [${x.confidence}] — 빠진 섹션: ${x.sections.join(', ')}`);
section('코드 drift — implementedIn 경로 부재 (결함)', out.drift, x => `\`${x.from}\` → 경로 없음: \`${x.path}\``);
section('mirror-drift — 미러가 원본과 어긋남/부재 (결함)', out.mirrorIssues, x => `\`${x.id}\` — ${x.issue}`);
section('비표준 엣지 type — 표준 어휘집(x-edge-types) 밖 (정보·권장)', out.nonStdEdgeTypes, x => `\`relatesTo:${x.type}\` — ${x.count}회 (예: \`${x.sample}\`) → 표준 type 권장`);
section('비통제 tags — x-tags 네임스페이스/형식 위반 (정보·권장)', out.badTags, x => `\`${x.id}\` (\`${x.file}\`) — ${x.tags.join(', ')}`);
section('active인데 코드 provenance(implementedIn) 없음 (정보)', out.activeWithoutCode, x => `\`${x.id}\` (\`${x.file}\`) — implementedIn 비어있음`);
section('cadence 만료 — 재검증 필요 (정보)', out.stale, x => `\`${x.id}\` — lastVerified ${x.lastVerified} (${x.ageDays}일 경과)`);
section('고아 owner — owner:TBD (정보)', out.orphanOwners, x => `\`${x.id}\` (\`${x.file}\`)`);

const gapsPath = join(ssotDir, '_gaps.md');
writeFileSync(gapsPath, L.join('\n'));

// stdout 요약
console.log(`verify: nodes=${cat.nodeCount} edges=${cat.edgeCount}`);
console.log(`  치명(구조): parse=${cat.parseErrors?.length || 0} schema=${out.schemaErrors.length} kindMismatch=${out.kindMismatch.length} dupId=${out.duplicateIds.length} dangling=${out.danglingEdges.length}`);
console.log(`  결함: 측면누락=${out.missingFacets.length} 섹션누락=${out.missingSections.length} drift=${out.drift.length} mirror=${out.mirrorIssues.length}`);
console.log(`  정보: 측면미완=${out.pendingFacets.length} 섹션미완=${out.pendingSections.length} 비표준엣지=${out.nonStdEdgeTypes.length} 비통제tags=${out.badTags.length} active무코드=${out.activeWithoutCode.length} stale=${out.stale.length} 고아owner=${out.orphanOwners.length}`);
console.log(`  → ${relative(process.cwd(), gapsPath)}`);
process.exit(fatal > 0 ? 1 : 0);
