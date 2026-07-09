#!/usr/bin/env node
// refresh.smoke.mjs — refresh.mjs 의 자기완결(self-contained) 스모크 테스트.
//   OS temp 아래에 진짜 tiny git 레포 + SSOT 픽스처 + 외부 build config 를 만들고 refresh.mjs 를
//   end-to-end 로 돌려, config/state 분리 · pinned-ref 스냅샷 diff · divergence 분기 · --advance 를 assert 한다.
//   네트워크 불요·재실행 가능(idempotent)·finally 정리.
// 사용: node refresh.smoke.mjs   (모든 케이스 ✓ 면 exit 0, 하나라도 실패면 non-zero)

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refreshPath = join(__dirname, 'refresh.mjs');

// ---------- 임시 작업공간 (pid 파생 — 무작위/시각 의존 없음) ----------
const baseTmp = join(tmpdir(), `ssot-refresh-smoke-${process.pid}`);
const root = join(baseTmp, 'workspace');       // effective root (멀티레포 워크스페이스 루트)
const repoName = 'repo';                        // root 기준 레포 디렉토리명 = implementedIn prefix
const repoDir = join(root, repoName);
const ssotDir = join(baseTmp, 'ssot');          // 대상 SSOT 데이터 디렉토리 (state 는 여기 안에)
const configPath = join(baseTmp, 'ssot-build-config.json'); // 외부 build config (INTENT — git-untracked)
const missingConfig = join(baseTmp, 'no-such-config.json'); // CASE 0 전용 (존재하지 않음)
const statePath = join(ssotDir, '_sync-state.json');

// 노드 3종: NODE-A(active+inferred → drift-candidate), NODE-P(planned → divergence), NODE-H(confidence high → divergence).
const NODE_A = 'NODE-A';
const NODE_P = 'NODE-P';
const NODE_H = 'NODE-H';
// catalog: refresh.mjs 는 cat.nodes(lifecycle/confidence) + cat.paths(implementedIn) 를 읽는다.
//   A.java → NODE-A(active, inferred), P.java → NODE-P(planned), H.java → NODE-H(confidence high).
const catalog = {
  nodes: [
    { id: NODE_A, kind: 'concept', title: 'A', lifecycle: 'active', confidence: 'inferred' },
    { id: NODE_P, kind: 'concept', title: 'P', lifecycle: 'planned', confidence: 'inferred' },
    { id: NODE_H, kind: 'concept', title: 'H', lifecycle: 'active', confidence: 'high' },
  ],
  edges: [],
  paths: [
    { from: NODE_A, field: 'implementedIn', raw: `${repoName}/src/A.java` },
    { from: NODE_P, field: 'implementedIn', raw: `${repoName}/src/P.java` },
    { from: NODE_H, field: 'implementedIn', raw: `${repoName}/src/H.java` },
  ],
};

// ---------- 헬퍼 ----------
function git(args, opts = {}) {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', ...opts });
}
function writeJson(p, obj) { writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

// build config 를 특정 pinned ref 로 (재)작성. INTENT 파일 — refresh 는 READ 만.
function writeConfig(pinnedRef) {
  writeJson(configPath, {
    projects: [
      { id: 'air-studio', ssotDir, root, repos: [{ id: 'repoX', path: repoName, ref: pinnedRef, globs: ['src/**'] }] },
    ],
  });
}

// refresh.mjs 실행 → { status, stdout, stderr } (non-zero 여도 throw 하지 않고 status 캡처).
function runRefresh(args) {
  try {
    const stdout = execFileSync('node', [refreshPath, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? String(err.stdout) : '',
      stderr: err.stderr ? String(err.stderr) : '',
    };
  }
}

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`      ${err && err.message ? err.message.split('\n').join('\n      ') : err}`);
  }
}

// worklist 버킷에서 파일 항목 찾기.
function findEntry(bucket, file) {
  return bucket.find(e => e.file === file);
}

try {
  // ---------- 픽스처 구성 ----------
  rmSync(baseTmp, { recursive: true, force: true }); // 재실행 대비 (idempotent)
  mkdirSync(root, { recursive: true });
  mkdirSync(ssotDir, { recursive: true });

  // 진짜 tiny git 레포 — commit C1: A + P + H.
  mkdirSync(join(repoDir, 'src'), { recursive: true });
  writeFileSync(join(repoDir, 'src', 'A.java'), 'class A {}\n');
  writeFileSync(join(repoDir, 'src', 'P.java'), 'class P {}\n');
  writeFileSync(join(repoDir, 'src', 'H.java'), 'class H {}\n');
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'smoke@example.test']);
  git(['config', 'user.name', 'Smoke Test']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'C1: A + P + H']);
  const commit1 = git(['rev-parse', 'HEAD']).trim();

  // catalog(build-graph 산출물 대역)는 ssotDir 에 둔다.
  writeJson(join(ssotDir, '_catalog.json'), catalog);

  const repoRelA = `${repoName}/src/A.java`; // root 기준 (refresh.mjs prefix 규약과 동일)
  const repoRelP = `${repoName}/src/P.java`;
  const repoRelH = `${repoName}/src/H.java`;

  const worklistPath = join(ssotDir, '_refresh.worklist.json');

  // ========== CASE 0: config 해석 불가 (--config 가 없는 파일 지목) → exit 2 ==========
  check('CASE 0: build config 없음 — --config 가 부재 경로 → exit 2', () => {
    assert.equal(existsSync(missingConfig), false, '사전: config 파일이 없어야 함');
    const r = runRefresh([ssotDir, '--config', missingConfig, '--root', root]);
    assert.equal(r.status, 2, `config 없으면 exit 2 여야 함 (got ${r.status})`);
    assert.match(r.stderr, /build config/, 'stderr 에 build config 없음 안내가 있어야 함');
    assert.equal(existsSync(statePath), false, 'refresh 는 config 없을 때 state 를 만들지 않는다');
  });

  // ========== CASE 1: first-run pinned — config.ref=C1, state 없음(syncedRef:"") → ls-tree 전체 added ==========
  writeConfig(commit1); // pinned ref = C1 (특정 커밋 sha)
  check('CASE 1: first-run pinned — ls-tree@C1 전체가 added, syncedRef ""', () => {
    assert.equal(existsSync(statePath), false, '사전: state 는 아직 없음 → 첫 sync');
    const r = runRefresh([ssotDir, '--config', configPath, '--root', root]);
    assert.equal(r.status, 0, `plan 모드 exit 0 여야 함 (got ${r.status}); stderr=${r.stderr}`);
    assert.equal(existsSync(worklistPath), true, '_refresh.worklist.json 이 기록돼야 함');
    const wl = readJson(worklistPath);

    // ls-tree(HEAD 아님)로 pinned ref 의 트리 전체가 added.
    const a = findEntry(wl.added, repoRelA);
    assert.ok(a, `added 에 ${repoRelA} 가 있어야 함`);
    assert.equal(a.reason, 'drift-candidate', 'A.java(active+inferred) → drift-candidate');
    assert.deepEqual(a.nodes, [NODE_A], 'A.java 는 NODE-A 로 매핑');
    assert.equal(a.repo, 'repoX', 'repo id 는 repoX');

    // P.java(planned) 와 H.java(confidence high) 는 divergence 로 분기 (added drift 아님).
    assert.ok(!findEntry(wl.added, repoRelP), 'P.java 는 added drift 에 없어야 함(divergence 로 감)');
    assert.ok(!findEntry(wl.added, repoRelH), 'H.java 는 added drift 에 없어야 함(divergence 로 감)');
    const dp = findEntry(wl.divergence, repoRelP);
    assert.ok(dp, `divergence 에 ${repoRelP} 가 있어야 함`);
    assert.equal(dp.reason, 'design-intent-vs-code', 'planned 노드 → design-intent-vs-code');
    assert.deepEqual(dp.nodes, [NODE_P], 'P.java divergence 는 NODE-P');
    const dh = findEntry(wl.divergence, repoRelH);
    assert.ok(dh, `divergence 에 ${repoRelH} 가 있어야 함`);
    assert.deepEqual(dh.nodes, [NODE_H], 'H.java divergence 는 NODE-H(confidence high)');

    // repo 리포트: syncedRef 는 첫 sync 라 빈 문자열, configRef=C1, resolvedRef=C1.
    const rr = wl.repos.find(x => x.id === 'repoX');
    assert.ok(rr, 'worklist.repos 에 repoX');
    assert.equal(rr.syncedRef, '', '첫 sync syncedRef 는 ""');
    assert.equal(rr.configRef, commit1, 'configRef = C1');
    assert.equal(rr.resolvedRef, commit1, 'resolvedRef = C1 (rev-parse)');

    assert.equal(wl.modified.length, 0, '첫 sync 에 modified 없음');
    assert.equal(wl.deleted.length, 0, '첫 sync 에 deleted 없음');
  });

  // ========== CASE 2: SCN-11 pinned 스냅샷 diff (HEAD 아님, config.ref 기준) ==========
  check('CASE 2: SCN-11 — advance→syncedRef=C1, C2 커밋해도 config.ref=C1 이면 변경 0; C2 로 bump 하면 델타', () => {
    // advance → syncedRef = C1 (resolved sha).
    const adv = runRefresh([ssotDir, '--config', configPath, '--root', root, '--advance']);
    assert.equal(adv.status, 0, `--advance exit 0 여야 함 (got ${adv.status}); stderr=${adv.stderr}`);
    let state = readJson(statePath);
    let repo = state.repos.find(x => x.id === 'repoX');
    assert.ok(repo, 'state.repos 에 repoX');
    assert.equal(repo.syncedRef, commit1, `syncedRef 가 C1(${commit1.slice(0, 12)}) 로 전진`);
    assert.equal(repo.ref, undefined, 'state 는 progress 만 — path/globs/ref(target) 없음');

    // C2: 새 파일 N.java 추가 + A.java 수정. (working tree 는 이제 C2 = HEAD)
    writeFileSync(join(repoDir, 'src', 'N.java'), 'class N {}\n');
    writeFileSync(join(repoDir, 'src', 'A.java'), 'class A { int x; }\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'C2: add N, modify A']);
    const commit2 = git(['rev-parse', 'HEAD']).trim();
    assert.notEqual(commit2, commit1, 'C2 는 C1 과 달라야 함');

    // config.ref 는 여전히 C1 → diff(syncedRef=C1 → resolvedRef=C1) = 스냅샷 고정 → 변경 0.
    //   (HEAD 를 봤다면 C1→C2 델타가 나왔을 것 — pinned 임을 증명.)
    let r = runRefresh([ssotDir, '--config', configPath, '--root', root]);
    assert.equal(r.status, 0, `plan exit 0 (got ${r.status}); stderr=${r.stderr}`);
    let wl = readJson(worklistPath);
    assert.equal(wl.added.length, 0, 'config.ref=C1 이면 added 0 (HEAD 무시, pinned)');
    assert.equal(wl.modified.length, 0, 'config.ref=C1 이면 modified 0 (pinned)');
    assert.equal(wl.divergence.length, 0, 'config.ref=C1 이면 divergence 0 (pinned)');
    const rrPinned = wl.repos.find(x => x.id === 'repoX');
    assert.equal(rrPinned.resolvedRef, commit1, 'resolvedRef 는 여전히 C1');

    // config.ref 를 C2 로 bump → diff(syncedRef=C1 → resolvedRef=C2) = C1→C2 델타.
    writeConfig(commit2);
    r = runRefresh([ssotDir, '--config', configPath, '--root', root]);
    assert.equal(r.status, 0, `plan exit 0 (got ${r.status}); stderr=${r.stderr}`);
    wl = readJson(worklistPath);

    const nAdded = findEntry(wl.added, `${repoName}/src/N.java`);
    assert.ok(nAdded, 'N.java 가 added 에 있어야 함 (C1→C2 델타)');
    assert.equal(nAdded.reason, 'new-surface', 'N.java 미매핑 → new-surface');
    const aMod = findEntry(wl.modified, repoRelA);
    assert.ok(aMod, 'A.java 가 modified 에 있어야 함 (C1→C2 델타)');
    assert.equal(aMod.reason, 'drift-candidate', 'A.java(active+inferred) 수정 → drift-candidate');
    assert.deepEqual(aMod.nodes, [NODE_A], 'A.java modified 는 NODE-A');

    const rrC2 = wl.repos.find(x => x.id === 'repoX');
    assert.equal(rrC2.syncedRef, commit1, 'syncedRef 는 아직 C1 (advance 전)');
    assert.equal(rrC2.configRef, commit2, 'configRef = C2');
    assert.equal(rrC2.resolvedRef, commit2, 'resolvedRef = C2');

    // 다음 케이스를 위해 config.ref=C2 유지 + commit2 를 외부에서 참조.
    globalThis.__commit2 = commit2;
  });

  // ========== CASE 3: SCN-8 divergence 분기 (planned/high → divergence, active+inferred → modified) ==========
  check('CASE 3: SCN-8 — P.java(planned) 수정→divergence, H.java(high) 수정→divergence, A.java→modified drift', () => {
    const commit2 = globalThis.__commit2;
    // C3: P.java(planned) + H.java(high) + A.java(active+inferred) 모두 수정.
    writeFileSync(join(repoDir, 'src', 'P.java'), 'class P { int y; }\n');
    writeFileSync(join(repoDir, 'src', 'H.java'), 'class H { int z; }\n');
    writeFileSync(join(repoDir, 'src', 'A.java'), 'class A { int x; long w; }\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'C3: modify P, H, A']);
    const commit3 = git(['rev-parse', 'HEAD']).trim();

    // 아직 syncedRef=C1 (advance 안 함), config.ref=C2 → 먼저 advance 로 syncedRef=C2 로 올린 뒤 config.ref=C3.
    let adv = runRefresh([ssotDir, '--config', configPath, '--root', root, '--advance']);
    assert.equal(adv.status, 0, `--advance(C2) exit 0 (got ${adv.status}); stderr=${adv.stderr}`);
    assert.equal(readJson(statePath).repos.find(x => x.id === 'repoX').syncedRef, commit2, 'syncedRef=C2');

    writeConfig(commit3); // pinned ref = C3
    const r = runRefresh([ssotDir, '--config', configPath, '--root', root]);
    assert.equal(r.status, 0, `plan exit 0 (got ${r.status}); stderr=${r.stderr}`);
    const wl = readJson(worklistPath);

    // P.java(planned) → divergence, NOT modified drift.
    const pDiv = findEntry(wl.divergence, repoRelP);
    assert.ok(pDiv, `divergence 에 ${repoRelP}`);
    assert.equal(pDiv.reason, 'design-intent-vs-code', 'planned 수정 → design-intent-vs-code');
    assert.deepEqual(pDiv.nodes, [NODE_P], 'P divergence 는 NODE-P');
    assert.ok(!findEntry(wl.modified, repoRelP), 'P.java 는 modified drift 에 없어야 함');

    // H.java(confidence high) → divergence.
    const hDiv = findEntry(wl.divergence, repoRelH);
    assert.ok(hDiv, `divergence 에 ${repoRelH}`);
    assert.deepEqual(hDiv.nodes, [NODE_H], 'H divergence 는 NODE-H');
    assert.ok(!findEntry(wl.modified, repoRelH), 'H.java 는 modified drift 에 없어야 함');

    // A.java(active+inferred) → modified drift-candidate.
    const aMod = findEntry(wl.modified, repoRelA);
    assert.ok(aMod, `modified 에 ${repoRelA}`);
    assert.equal(aMod.reason, 'drift-candidate', 'active+inferred 수정 → drift-candidate');
    assert.deepEqual(aMod.nodes, [NODE_A], 'A modified 는 NODE-A');
    assert.ok(!findEntry(wl.divergence, repoRelA), 'A.java 는 divergence 에 없어야 함');

    // --check: divergence 를 drift 로 셈 → exit 1.
    const chk = runRefresh([ssotDir, '--config', configPath, '--root', root, '--check']);
    assert.equal(chk.status, 1, `divergence 있으면 --check exit 1 (got ${chk.status})`);

    globalThis.__commit3 = commit3;
  });

  // ========== CASE 4: SCN-12 advance — syncedRef=resolved config ref, config 파일 불변 ==========
  check('CASE 4: SCN-12 — advance 는 syncedRef 를 config ref(C3) sha 로, config 파일은 byte-identical', () => {
    const commit3 = globalThis.__commit3;
    const before = readFileSync(configPath); // Buffer — byte 비교용

    const adv = runRefresh([ssotDir, '--config', configPath, '--root', root, '--advance']);
    assert.equal(adv.status, 0, `--advance exit 0 (got ${adv.status}); stderr=${adv.stderr}`);
    const state = readJson(statePath);
    const repo = state.repos.find(x => x.id === 'repoX');
    assert.equal(repo.syncedRef, commit3, `syncedRef 가 config ref C3(${commit3.slice(0, 12)}) sha 로 전진`);
    assert.equal(state.lastRun && state.lastRun.length, 10, 'lastRun 은 YYYY-MM-DD');

    // config(INTENT) 는 advance 로 절대 바뀌지 않아야 함.
    const after = readFileSync(configPath);
    assert.ok(before.equals(after), 'build config 는 advance 후 byte-identical 이어야 함');

    // advance 후 재실행 plan → syncedRef=C3=resolvedRef → no-op.
    const r = runRefresh([ssotDir, '--config', configPath, '--root', root]);
    assert.equal(r.status, 0, 'no-op plan exit 0');
    const wl = readJson(worklistPath);
    assert.equal(wl.added.length + wl.modified.length + wl.deleted.length + wl.divergence.length, 0, 'advance 후 변경 0 (no-op)');
    const chk = runRefresh([ssotDir, '--config', configPath, '--root', root, '--check']);
    assert.equal(chk.status, 0, `clean --check exit 0 (got ${chk.status})`);
  });
} finally {
  rmSync(baseTmp, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\nrefresh.smoke: ${failed} 케이스 실패`);
  process.exit(1);
}
console.log('\nrefresh.smoke: 모든 케이스 통과 ✓');
process.exit(0);
