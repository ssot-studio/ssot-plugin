#!/usr/bin/env node
// refresh.mjs — 코드→SSOT 증분 재조정(periodic refresh)의 결정적(deterministic) 절반.
//   pinned-ref 스냅샷 diff + 파일→노드 매핑 + 기획의도/드리프트 분기 + orphan 탐지
//   → 구조화 worklist + 사람용 리포트 산출.
//   LLM 추출/노드 본문 작성은 하지 않는다 — 그건 스킬 레이어가 worklist 를 읽어 뒤에 수행한다.
//
// INTENT ↔ PROGRESS 분리:
//   CONFIG(INTENT — 외부·git-untracked, HITL 스킬 레이어가 작성)  = 어느 레포/경로/타깃 ref 인가.
//                                                                    refresh 는 이 파일을 READ 만 한다.
//   STATE(PROGRESS — 내부, <ssotDir>/_sync-state.json, 데이터와 함께 git-track) = 레포별 마지막 sync ref.
//                                                                    refresh 가 소유(생성/갱신).
//   ref 전진은 --advance 로 "요청 시에만" 하며, config 의 pinned ref(→sha)를 state 에 기록한다.
// 의존성 없음(node 표준만). 사용:
//   node refresh.mjs <ssotDir> [--config <path>] [--root <dir>] [--check] [--advance]
//   <ssotDir> : 대상 SSOT 데이터 디렉토리. build config 의 projects[].ssotDir 와 일치하는 프로젝트를 고른다.
//   --config  : build config 파일 경로. 미지정 시 env SSOT_BUILD_CONFIG_FILE →
//               $CLAUDE_PLUGIN_DATA/ssot-build-config.json 순으로 탐색(config.ts 규약 미러).
//   --root    : 워크스페이스 루트(레포 path 와 노드 implementedIn 경로의 기준). 명시 시 config.root 를 오버라이드.
//               미지정 시 config 의 project.root 사용. 둘 다 없으면 에러.
//   --check   : 보고만(파일 미기록). drift(changed/added/deleted/divergence) 있으면 exit 1. hook 용.
//   --advance : 스킬 레이어가 노드 갱신을 성공적으로 쓴 뒤 호출. 각 레포 state.syncedRef 를
//               config 의 pinned ref(→sha)로 전진시키고 state 를 기록한다(diff 재계산 안 함, config 불변).
//               실패/중단된 쓰기는 syncedRef 를 그대로 둬서 plan 재실행이 같은 변경을 다시 처리한다(idempotent/safe).
//   (기본 = PLAN 모드: worklist + 리포트 산출, state 변경 없음.)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const ssotDir = argv[0];
const checkOnly = argv.includes('--check');
const doAdvance = argv.includes('--advance');
const ci = argv.indexOf('--config');
const explicitConfig = ci >= 0 && argv[ci + 1] ? argv[ci + 1] : null;
const ri = argv.indexOf('--root');
const explicitRoot = ri >= 0 && argv[ri + 1] ? argv[ri + 1] : null;
if (!ssotDir || ssotDir.startsWith('--')) {
  console.error('usage: node refresh.mjs <ssotDir> [--config <path>] [--root <dir>] [--check] [--advance]');
  process.exit(2);
}

const today = new Date().toISOString().slice(0, 10);
const ssotDirAbs = resolve(ssotDir);
const catalogPath = join(ssotDir, '_catalog.json');
const statePath = join(ssotDir, '_sync-state.json');

// ---------- 1. build config(INTENT) 해석 — config.ts 의 env→file→default 우선순위 미러 ----------
//   우선순위: 1) --config <path>  2) env SSOT_BUILD_CONFIG_FILE  3) $CLAUDE_PLUGIN_DATA/ssot-build-config.json
//   refresh 는 config 를 절대 날조하지 않는다(INTENT 는 사람/스킬의 몫) — 없으면 exit 2 로 안내.
function resolveBuildConfig() {
  const candidates = [];
  if (explicitConfig) candidates.push({ src: '--config', path: resolve(explicitConfig) });
  const envFile = process.env.SSOT_BUILD_CONFIG_FILE;
  if (envFile && envFile.trim()) candidates.push({ src: 'SSOT_BUILD_CONFIG_FILE', path: resolve(envFile) });
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData && pluginData.trim()) candidates.push({ src: 'CLAUDE_PLUGIN_DATA', path: join(pluginData, 'ssot-build-config.json') });
  for (const c of candidates) if (existsSync(c.path)) return { path: c.path, src: c.src, candidates };
  return { path: null, candidates };
}

const cfgResolved = resolveBuildConfig();
if (!cfgResolved.path) {
  console.error('build config(빌드 설정) 없음 — INTENT(어느 레포/경로/타깃 ref)는 refresh 가 만들지 않습니다.');
  console.error('  `/ssot init` 또는 refresh 의 HITL 인테이크로 build config 를 생성하세요.');
  console.error('  탐색한 경로 후보(우선순위 순):');
  if (cfgResolved.candidates.length === 0) {
    console.error('    (후보 없음 — --config <path> 또는 env SSOT_BUILD_CONFIG_FILE, 또는 CLAUDE_PLUGIN_DATA 를 설정하세요.)');
  } else {
    for (const c of cfgResolved.candidates) console.error(`    - [${c.src}] ${c.path}`);
  }
  process.exit(2);
}

let cfg;
try { cfg = JSON.parse(readFileSync(cfgResolved.path, 'utf8')); }
catch (err) { console.error(`build config 파싱 실패 (${cfgResolved.path}): ${String(err.message).split('\n')[0]}`); process.exit(2); }
const projects = Array.isArray(cfg.projects) ? cfg.projects : [];

// ssotDir(CLI 인자)와 project.ssotDir 를 각각 절대경로로 정규화해 비교 → 대상 프로젝트 선택.
const project = projects.find(p => p && p.ssotDir && resolve(p.ssotDir) === ssotDirAbs);
if (!project) {
  console.error(`build config 에 ssotDir 가 일치하는 프로젝트가 없습니다: ${ssotDirAbs}`);
  console.error(`  (설정: ${cfgResolved.path})`);
  console.error('  사용 가능한 프로젝트 id:');
  if (projects.length === 0) console.error('    (projects 비어 있음)');
  else for (const p of projects) console.error(`    - ${p.id || '(id 없음)'} → ${p.ssotDir ? resolve(p.ssotDir) : '(ssotDir 없음)'}`);
  process.exit(2);
}

// effective root: 명시 --root 가 config.root 를 오버라이드. 둘 다 없으면 에러.
let effectiveRoot;
if (explicitRoot) effectiveRoot = resolve(explicitRoot);
else if (project.root) effectiveRoot = resolve(project.root);
else {
  console.error('effective root 를 결정할 수 없습니다 — --root <dir> 를 넘기거나 build config 의 project.root 를 설정하세요.');
  process.exit(2);
}

const configRepos = Array.isArray(project.repos) ? project.repos : [];
if (configRepos.length === 0) {
  console.error(`build config 프로젝트 "${project.id}" 에 repos 가 비어 있습니다: ${cfgResolved.path}`);
  console.error('  최소 한 개의 레포 매핑(id / path / ref / globs)을 채운 뒤 다시 실행하세요.');
  process.exit(2);
}

// ---------- 2. 카탈로그 로드 (build-graph 산출물) ----------
if (!existsSync(catalogPath)) { console.error(`build-graph 를 먼저 실행하세요. (${catalogPath} 없음)`); process.exit(2); }
const cat = JSON.parse(readFileSync(catalogPath, 'utf8'));

// ---------- 3. state(PROGRESS) 로드 — 없으면 모든 레포를 syncedRef:"" (첫 sync) 로 취급 ----------
let state = { repos: [], lastRun: '' };
if (existsSync(statePath)) {
  try { state = JSON.parse(readFileSync(statePath, 'utf8')); }
  catch (err) { console.error(`_sync-state.json 파싱 실패 (${statePath}): ${String(err.message).split('\n')[0]}`); process.exit(2); }
}
const syncedByRepo = new Map();       // repo.id → syncedRef(sha) ('' = 미sync)
for (const r of (Array.isArray(state.repos) ? state.repos : [])) syncedByRepo.set(r.id, r.syncedRef || '');

// ---------- glob → RegExp (전체 상대경로에 anchor) ----------
// 지원: ** (세그먼트 경계 넘음), * (한 세그먼트 내), ? (한 글자, / 제외).
function globToRegExp(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { // '**'
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } // '**/' = 0개 이상 세그먼트
        else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp(re + '$');
}
function matchesAnyGlob(relPath, globs) {
  if (!globs || globs.length === 0) return true; // 빈 globs = 전부 통과
  return globs.some(g => globToRegExp(g).test(relPath));
}

// ---------- git 헬퍼 (배열 인자, 셸 보간 없음) ----------
function git(repoAbs, args) {
  return execFileSync('git', ['-C', repoAbs, ...args], { cwd: repoAbs, encoding: 'utf8' });
}

// ---------- 4. --advance 모드: diff 재계산 없이 state.syncedRef 를 config pinned ref(sha)로 전진 ----------
//   config(INTENT)는 건드리지 않는다 — state(PROGRESS)만 기록.
if (doAdvance) {
  const advanced = [], problems = [];
  const newRepos = [];
  for (const repo of configRepos) {
    const repoAbs = join(effectiveRoot, repo.path || '');
    const prev = syncedByRepo.get(repo.id) || '';
    if (!existsSync(repoAbs) || !existsSync(join(repoAbs, '.git'))) {
      problems.push({ id: repo.id, issue: '제품 레포가 로컬에 없음/git 아님 — ref 전진 건너뜀 (클론·pull 필요)' });
      newRepos.push({ id: repo.id, syncedRef: prev }); // 기존 진행상태 보존
      continue;
    }
    let resolvedRef;
    try { resolvedRef = git(repoAbs, ['rev-parse', repo.ref]).trim(); }
    catch (err) {
      problems.push({ id: repo.id, issue: `ref 해석 실패(${repo.ref}): ${String(err.message).split('\n')[0]}` });
      newRepos.push({ id: repo.id, syncedRef: prev });
      continue;
    }
    newRepos.push({ id: repo.id, syncedRef: resolvedRef });
    advanced.push({ id: repo.id, from: prev || '(미sync)', to: resolvedRef, configRef: repo.ref });
  }
  const newState = { repos: newRepos, lastRun: today };
  writeFileSync(statePath, JSON.stringify(newState, null, 2) + '\n');
  console.log(`refresh --advance: ref 전진 ${advanced.length} · 문제 ${problems.length} (레포 ${configRepos.length}개)`);
  for (const a of advanced) console.log(`  ✓ ${a.id}: ${a.from.slice(0, 12)} → ${a.to.slice(0, 12)} (config ref: ${a.configRef})`);
  for (const p of problems) console.log(`  ✗ ${p.id} — ${p.issue}`);
  console.log(`  ⤷ ${statePath} 기록됨. 다음 plan 실행은 여기서부터의 변경만 처리합니다.`);
  process.exit(problems.length ? 1 : 0);
}

// ---------- 5. 파일→노드 인덱스 (catalog.paths 의 implementedIn) ----------
// raw 값을 file-granular(실제 파일 경로) vs repo-granular(레포 디렉토리)로 분류.
//   file-granular = 마지막 세그먼트에 '.' 있음 (파일명). repo-granular = 그 외.
const fileIndex = new Map();       // root 기준 파일경로 → Set<nodeId>
const repoGranular = [];           // { path, from } — 파일 단위 provenance 없는 레포 단위 링크
for (const p of cat.paths) {
  if (p.field !== 'implementedIn') continue;
  const token = String(p.raw).split(/\s+/)[0].replace(/[)\].,]+$/, ''); // 주석 꼬리 제거(verify 와 동일)
  if (!token) continue;
  const base = token.split('/').pop();
  const isFile = base.includes('.'); // 파일명에 확장자/점 → file-granular
  if (isFile) {
    if (!fileIndex.has(token)) fileIndex.set(token, new Set());
    fileIndex.get(token).add(p.from);
  } else {
    repoGranular.push({ path: token, from: p.from });
  }
}
const nodesForFile = f => Array.from(fileIndex.get(f) || []);

// ---------- 6. 노드-메타 인덱스 (divergence 분기용) ----------
// 기획의도(design-intent) 노드 = lifecycle==='planned' 또는 confidence==='high'.
//   코드 as-is 로 조용히 덮어쓰면 안 되는 노드 → divergence 버킷(스킬이 OPEN flag).
const nodeMeta = new Map();        // nodeId → { lifecycle, confidence }
for (const n of (Array.isArray(cat.nodes) ? cat.nodes : [])) {
  nodeMeta.set(n.id, { lifecycle: n.lifecycle || '', confidence: n.confidence || '' });
}
function isDesignIntent(nodeId) {
  const m = nodeMeta.get(nodeId);
  return !!m && (m.lifecycle === 'planned' || m.confidence === 'high');
}

// ---------- 7. 레포별 변경 파일 산출 (pinned 스냅샷 diff, working-tree 무관) ----------
const problems = [];               // { id, issue }
const repoReport = [];             // { id, path, syncedRef, configRef, resolvedRef, changedCount }
const changes = { added: [], modified: [], deleted: [] }; // { file(root 기준), repoId }

for (const repo of configRepos) {
  const repoAbs = join(effectiveRoot, repo.path || '');
  if (!existsSync(repoAbs) || !existsSync(join(repoAbs, '.git'))) {
    problems.push({ id: repo.id, issue: `제품 레포가 로컬에 없음/git 아님 — 클론·pull 필요 (${repo.path})` });
    continue;
  }
  // pinned ref → sha (commit/tag/branch 모두 해석). 이게 SSOT 를 빌드하는 정확한 코드 스냅샷.
  let resolvedRef;
  try { resolvedRef = git(repoAbs, ['rev-parse', repo.ref]).trim(); }
  catch (err) { problems.push({ id: repo.id, issue: `ref 해석 실패(${repo.ref}): ${String(err.message).split('\n')[0]}` }); continue; }
  const syncedRef = syncedByRepo.get(repo.id) || '';

  // 변경 파일: syncedRef 있으면 snapshot→snapshot diff, 없으면(첫 sync) pinned ref 의 트리 전체를 added 로.
  const localAdded = [], localModified = [], localDeleted = [];
  try {
    if (syncedRef) {
      // syncedRef → resolvedRef 스냅샷 대 스냅샷 diff (working tree 와 독립).
      const out = git(repoAbs, ['diff', '--name-status', syncedRef, resolvedRef]);
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('\t');
        const status = parts[0];
        if (status.startsWith('R')) {           // rename → old=Deleted, new=Added
          if (parts[1]) localDeleted.push(parts[1]);
          if (parts[2]) localAdded.push(parts[2]);
        } else if (status.startsWith('A')) {
          if (parts[1]) localAdded.push(parts[1]);
        } else if (status.startsWith('M')) {
          if (parts[1]) localModified.push(parts[1]);
        } else if (status.startsWith('D')) {
          if (parts[1]) localDeleted.push(parts[1]);
        } else if (parts[1]) {                  // C(copy) 등 → 안전하게 modified 취급
          localModified.push(parts[1]);
        }
      }
    } else {
      // 첫 sync: pinned ref 의 트리 전체(ls-tree — working tree 가 아니라 그 ref 의 스냅샷).
      const out = git(repoAbs, ['ls-tree', '-r', '--name-only', resolvedRef]);
      for (const f of out.split('\n')) if (f.trim()) localAdded.push(f);
    }
  } catch (err) {
    problems.push({ id: repo.id, issue: `diff/ls-tree 실패: ${String(err.message).split('\n')[0]}` });
    continue;
  }

  // globs 필터(레포 상대경로 기준) → root 기준 경로로 prefix.
  const globs = Array.isArray(repo.globs) ? repo.globs : [];
  const prefix = f => (repo.path ? repo.path.replace(/\/+$/, '') + '/' : '') + f;
  const keep = arr => arr.filter(f => matchesAnyGlob(f, globs)).map(prefix);
  const addedF = keep(localAdded), modifiedF = keep(localModified), deletedF = keep(localDeleted);
  const changedCount = addedF.length + modifiedF.length + deletedF.length;

  for (const f of addedF) changes.added.push({ file: f, repoId: repo.id });
  for (const f of modifiedF) changes.modified.push({ file: f, repoId: repo.id });
  for (const f of deletedF) changes.deleted.push({ file: f, repoId: repo.id });

  repoReport.push({ id: repo.id, path: repo.path || '', syncedRef, configRef: repo.ref, resolvedRef, changedCount });
  // 변경 없음 + syncedRef===resolvedRef → no-op(SCN-1): worklist 항목은 안 생김.
}

// ---------- 8. worklist 버킷 구성 ----------
// 버킷 = git 상태(added/modified/deleted) + divergence(기획의도 노드).
//   매핑된 노드는 노드 클래스로 분기한다: design-intent → divergence, 그 외 → drift-candidate.
//   한 파일이 modified(드리프트 노드)와 divergence(기획의도 노드)에 동시에 나타날 수 있다 — 정상.
const modified = [], added = [], deleted = [], divergence = [];

function splitMapped(file, repoId, nodes) {
  const intent = nodes.filter(isDesignIntent);   // planned / confidence high → 덮어쓰지 말고 OPEN flag
  const drift = nodes.filter(id => !isDesignIntent(id)); // active + inferred/unverified → 드리프트 후보
  return { intent, drift };
}

for (const c of changes.modified) {
  const nodes = nodesForFile(c.file);
  if (!nodes.length) { modified.push({ file: c.file, repo: c.repoId, nodes: [], reason: 'unmapped-change' }); continue; } // 레포 단위 provenance만 — LLM이 노드 식별 후 implementedIn에 파일경로 기입(SCN-7)
  const { intent, drift } = splitMapped(c.file, c.repoId, nodes);
  if (drift.length) modified.push({ file: c.file, repo: c.repoId, nodes: drift, reason: 'drift-candidate' });
  if (intent.length) divergence.push({ file: c.file, repo: c.repoId, nodes: intent, reason: 'design-intent-vs-code' });
}
for (const c of changes.added) {
  const nodes = nodesForFile(c.file);
  if (!nodes.length) { added.push({ file: c.file, repo: c.repoId, nodes: [], reason: 'new-surface' }); continue; } // 새 표면 — LLM이 새 노드 작성
  const { intent, drift } = splitMapped(c.file, c.repoId, nodes);
  if (drift.length) added.push({ file: c.file, repo: c.repoId, nodes: drift, reason: 'drift-candidate' }); // 이미 매핑된 파일(첫 sync 등) → 재검증 대상
  if (intent.length) divergence.push({ file: c.file, repo: c.repoId, nodes: intent, reason: 'design-intent-vs-code' });
}
for (const c of changes.deleted) {
  const nodes = nodesForFile(c.file);
  if (nodes.length) deleted.push({ file: c.file, repo: c.repoId, nodes, reason: 'orphan' });        // SCN-4: source 삭제된 노드 → deprecated 후보(자동 삭제 금지)
  else deleted.push({ file: c.file, repo: c.repoId, nodes: [], reason: 'deleted-unmapped' });
}

const totalDrift = modified.length + added.length + deleted.length + divergence.length;

// ---------- --check: 파일 미기록, 요약 한 줄 + drift 있으면 exit 1 ----------
if (checkOnly) {
  console.log(`refresh --check: 변경 ${totalDrift}(수정 ${modified.length} · 추가 ${added.length} · 삭제 ${deleted.length} · 발산 ${divergence.length}) · 문제 ${problems.length} (레포 ${configRepos.length}개)`);
  for (const p of problems) console.log(`  ✗ ${p.id} — ${p.issue}`);
  process.exit(totalDrift > 0 ? 1 : 0);
}

// ---------- 9. worklist JSON 기록 ----------
const worklist = {
  generatedAt: today,
  root: effectiveRoot,
  project: project.id,
  config: cfgResolved.path,
  repos: repoReport.map(r => ({ id: r.id, path: r.path, syncedRef: r.syncedRef, configRef: r.configRef, resolvedRef: r.resolvedRef, changedCount: r.changedCount })),
  modified, added, deleted, divergence, problems,
};
const worklistPath = join(ssotDir, '_refresh.worklist.json');
writeFileSync(worklistPath, JSON.stringify(worklist, null, 2) + '\n');

// ---------- 10. 사람용 리포트 (_refresh.md) ----------
const CAP = 50; // 긴 목록은 앞 50개만, 잘렸음을 반드시 알림(조용한 cap 금지)
function bucketLines(title, items, fmt) {
  const L = [];
  L.push(`## ${title} — ${items.length}건`);
  L.push('');
  if (items.length === 0) { L.push('_없음_'); L.push(''); return L; }
  const shown = items.slice(0, CAP);
  for (const it of shown) L.push('- ' + fmt(it));
  if (items.length > CAP) L.push(`- _(+${items.length - CAP} more — 전체는 _refresh.worklist.json 참조)_`);
  L.push('');
  return L;
}

const L = [];
L.push('# SSOT 리프레시 리포트 (_refresh.md) — 코드→SSOT 증분 재조정');
L.push('');
L.push(`- 생성: ${today} · project: \`${project.id}\` · root: \`${effectiveRoot}\``);
L.push(`- config: \`${cfgResolved.path}\``);
L.push(`- 변경 합계: **${totalDrift}** (수정 ${modified.length} · 추가 ${added.length} · 삭제 ${deleted.length} · 발산 ${divergence.length}) · 문제 ${problems.length}`);
L.push('');
L.push('## 레포별 요약');
L.push('');
if (repoReport.length === 0) L.push('_처리된 레포 없음 (아래 문제 목록 참조)_');
else {
  L.push('| 레포 | path | syncedRef | configRef | resolvedRef | 변경 |');
  L.push('|------|------|-----------|-----------|-------------|------|');
  for (const r of repoReport) {
    const syncedShort = r.syncedRef ? r.syncedRef.slice(0, 12) : '(미sync)';
    const noop = r.changedCount === 0 && r.syncedRef === r.resolvedRef ? ' (no-op)' : '';
    L.push(`| ${r.id} | \`${r.path}\` | ${syncedShort} | ${r.configRef} | ${r.resolvedRef.slice(0, 12)} | ${r.changedCount}${noop} |`);
  }
}
L.push('');
L.push(...bucketLines('수정 (modified)', modified, it => `\`${it.file}\` — ${it.reason}${it.nodes.length ? ` → ${it.nodes.join(', ')}` : ''}`));
L.push(...bucketLines('추가 (added)', added, it => `\`${it.file}\` — ${it.reason}${it.nodes.length ? ` → ${it.nodes.join(', ')}` : ''}`));
L.push(...bucketLines('삭제 (deleted)', deleted, it => `\`${it.file}\` — ${it.reason}${it.nodes.length ? ` → ${it.nodes.join(', ')}` : ''}`));
L.push('## 발산 (divergence) — 기획 의도 노드');
L.push('');
L.push('> 이 노드들은 lifecycle=planned 또는 confidence=high 인 **기획 의도**다. 코드 as-is 로 조용히 덮어쓰지 말 것 —');
L.push('> 스킬 레이어가 노드에 OPEN flag 를 달아 사람이 "기획 유지 vs 코드로 수렴"을 판단하게 한다.');
L.push('');
if (divergence.length === 0) L.push('_없음_');
else {
  const shown = divergence.slice(0, CAP);
  for (const it of shown) L.push(`- \`${it.file}\` — ${it.reason} → ${it.nodes.join(', ')} (repo: ${it.repo})`);
  if (divergence.length > CAP) L.push(`- _(+${divergence.length - CAP} more — 전체는 _refresh.worklist.json 참조)_`);
}
L.push('');
L.push('## 문제 — 처리 못 한 레포');
L.push('');
if (problems.length === 0) L.push('_없음_');
else for (const p of problems) L.push(`- ⚠ \`${p.id}\` — ${p.issue}`);
L.push('');
L.push('## 다음 단계');
L.push('');
L.push('- 스킬 레이어(`/ssot refresh`)가 `_refresh.worklist.json` 을 읽어 노드를 추출/갱신/신설한다.');
L.push('- `divergence` 항목은 덮어쓰지 말고 노드에 OPEN flag 를 달아 사람 판단으로 넘긴다.');
L.push('- 쓰기가 성공하면 `node refresh.mjs <ssotDir> --advance` 로 각 레포 syncedRef 를 config pinned ref(sha)로 전진시킨다.');
L.push('- 쓰기 실패/중단 시 --advance 를 하지 않으면 syncedRef 가 그대로라 plan 재실행이 같은 변경을 다시 처리한다(safe).');
L.push('');
const reportPath = join(ssotDir, '_refresh.md');
writeFileSync(reportPath, L.join('\n'));

// ---------- 보고 ----------
console.log(`refresh: 변경 ${totalDrift}(수정 ${modified.length} · 추가 ${added.length} · 삭제 ${deleted.length} · 발산 ${divergence.length}) · 문제 ${problems.length} (레포 ${configRepos.length}개)`);
for (const p of problems) console.log(`  ✗ ${p.id} — ${p.issue}`);
console.log(`  → ${worklistPath}`);
console.log(`  → ${reportPath}`);
console.log('  ⤷ state 전진 안 함(plan 모드). 스킬이 노드 쓴 뒤 --advance 로 syncedRef 를 전진시키세요.');
process.exit(0);
