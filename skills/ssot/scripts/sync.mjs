#!/usr/bin/env node
// sync.mjs — mirrored 노드를 source(원본 레포 파일)에서 재생성한다 (단방향 source→SSOT).
//   coverage --scaffold 가 "처음 만든" 미러를, source 변경 후 "다시 내려받아 갱신"하는 모드.
//   verify 가 잡는 mirror-drift(소스가 미러보다 최신)를 해소하는 짝이다.
// 의존성 없음(node 표준만). 사용:
//   node sync.mjs <ssotDir> [--root <dir>] [--check] [--id <node-id>]
//   --root  : source 경로의 기준 디렉토리(멀티레포면 워크스페이스 루트). 기본 cwd. verify/coverage 와 동일 규약.
//   --check : 쓰지 않고 "재sync 필요한 미러"만 보고(exit 1 if any). pre-commit/hook 용.
//   --id    : 특정 노드만 sync.
//
// 동작 원리:
//   mirrored 노드 = [SSOT가 관리하는 frontmatter] + [<!--SSOT:MIRROR-START--> ~ END 사이의 source 본문 복제].
//   sync 는 frontmatter(사람이 미러에 붙인 제품/컴포넌트 엣지 포함)는 보존하고,
//   마커 구간의 본문만 source 최신 내용으로 교체한다. lastVerified 를 오늘로 갱신하고 파일 mtime 을 올려
//   verify 의 mirror-drift 를 클리어한다. source→SSOT 단방향이므로 source 는 절대 건드리지 않는다.

import { readFileSync, writeFileSync, existsSync, statSync, utimesSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK_START = '<!--SSOT:MIRROR-START-->';
const MARK_END = '<!--SSOT:MIRROR-END-->';

const argv = process.argv.slice(2);
const ssotDir = argv[0];
let rootDir = process.cwd();
const ri = argv.indexOf('--root');
if (ri >= 0 && argv[ri + 1]) rootDir = argv[ri + 1];
const checkOnly = argv.includes('--check');
const onlyId = argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : null;
if (!ssotDir) { console.error('usage: node sync.mjs <ssotDir> [--root <dir>] [--check] [--id <node-id>]'); process.exit(2); }

const catalogPath = join(ssotDir, '_catalog.json');
if (!existsSync(catalogPath)) { console.error(`먼저 build-graph.mjs 를 실행하세요. (${catalogPath} 없음)`); process.exit(2); }
const cat = JSON.parse(readFileSync(catalogPath, 'utf8'));

const today = new Date().toISOString().slice(0, 10);

// frontmatter 의 한 스칼라 키를 in-place 로 교체/삽입 (frontmatter 블록 안에서만).
function setFrontmatterScalar(content, key, value) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  const fm = content.slice(0, end);
  const rest = content.slice(end);
  const re = new RegExp(`^(${key}):.*$`, 'm');
  if (re.test(fm)) return fm.replace(re, `$1: ${value}`) + rest;
  // 없으면 frontmatter 끝(마지막 \n--- 직전이 아니라 fm 블록 끝)에 삽입
  return fm.replace(/\n*$/, `\n${key}: ${value}`) + rest;
}

// 마커가 있으면 그 구간만, 없으면(구버전 미러) frontmatter 아래 본문 전체를 source 본문으로 교체.
function replaceMirrorBody(content, mirrorBlock) {
  const wrapped = `${MARK_START}\n${mirrorBlock}\n${MARK_END}`;
  const s = content.indexOf(MARK_START);
  const e = content.indexOf(MARK_END);
  if (s !== -1 && e !== -1 && e > s) {
    return content.slice(0, s) + wrapped + content.slice(e + MARK_END.length);
  }
  // 마커 없는 구버전 미러: frontmatter 직후를 표준 미러 본문(안내문 + 마커 래핑)으로 정규화.
  const fmEnd = content.indexOf('\n---', 3);
  const head = fmEnd === -1 ? content : content.slice(0, fmEnd + 4);
  return `${head}\n\n${wrapped}\n`;
}

// source 본문 = 원본 파일 전체를 안내문과 함께 복제 (coverage --scaffold 와 동일한 형상).
function buildMirrorBlock(source, orig) {
  return `> 이 노드는 \`${source}\` 의 **미러**다. SSOT에서 직접 편집 금지 — 원본을 고치고 \`sync\`로 갱신한다.\n\n${orig}`;
}

const mirrors = cat.nodes.filter(n => n.facets?.authority === 'mirrored' && (!onlyId || n.id === onlyId));
const needSync = [], synced = [], problems = [];

for (const n of mirrors) {
  const src = n.facets.source;
  const nodePath = join(ssotDir, n.file);
  if (!src) { problems.push({ id: n.id, issue: 'mirrored 인데 source 없음 — 수동 확인 필요' }); continue; }
  const srcAbs = join(rootDir, src);
  if (!existsSync(srcAbs)) { problems.push({ id: n.id, issue: `source 부재: ${src}` }); continue; }

  let srcM, nodeM;
  try { srcM = statSync(srcAbs).mtimeMs; nodeM = statSync(nodePath).mtimeMs; }
  catch (err) { problems.push({ id: n.id, issue: `stat 실패: ${err.message}` }); continue; }

  // drift = source 가 미러보다 최신. 1s 여유로 동률 무시(verify 와 동일 기준).
  const drifted = srcM > nodeM + 1000;
  if (!drifted) continue;

  if (checkOnly) { needSync.push({ id: n.id, source: src }); continue; }

  const orig = readFileSync(srcAbs, 'utf8');
  let content = readFileSync(nodePath, 'utf8');
  content = replaceMirrorBody(content, buildMirrorBlock(src, orig));
  content = setFrontmatterScalar(content, 'lastVerified', today);
  writeFileSync(nodePath, content);
  // mtime 을 source 보다 뒤로 올려 verify 의 mirror-drift 를 클리어.
  const after = new Date(srcM + 2000);
  try { utimesSync(nodePath, after, after); } catch { /* utimes 실패 무시 */ }
  synced.push({ id: n.id, source: src });
}

// ---------- 보고 ----------
if (checkOnly) {
  if (needSync.length === 0 && problems.length === 0) {
    console.log(`sync --check: 미러 ${mirrors.length}개 모두 최신 (재sync 불필요)`);
    process.exit(0);
  }
  console.log(`sync --check: 재sync 필요 ${needSync.length} · 문제 ${problems.length} (미러 ${mirrors.length}개 중)`);
  for (const x of needSync) console.log(`  ⚠ ${x.id} ← source 변경됨: ${x.source} (sync 실행 필요)`);
  for (const p of problems) console.log(`  ✗ ${p.id} — ${p.issue}`);
  process.exit(1);
}

console.log(`sync: 미러 ${mirrors.length}개 · 갱신 ${synced.length} · 문제 ${problems.length}`);
for (const x of synced) console.log(`  ✓ ${x.id} ← ${x.source}`);
for (const p of problems) console.log(`  ✗ ${p.id} — ${p.issue}`);
if (synced.length) console.log('  ⤷ 갱신된 미러의 frontmatter 엣지(impacts/relatesTo)는 보존됨. 본문만 source로 교체.');
process.exit(problems.length ? 1 : 0);
