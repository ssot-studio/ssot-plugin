#!/usr/bin/env node
// sync-lifecycle.mjs — "코드가 생겼는데 lifecycle:planned 인" 노드를 검출해 active 전환을 *제안* 한다.
//   자동 전환 금지(LLM이 임의로 active로 바꾸지 않는다) — 사람이 검토·머지하는 PR만 제안한다.
//
// 판정: lifecycle=planned 인데 implementedIn 경로가 실존(코드가 생김) → active 후보.
//   (coverage 와 같은 "코드↔SSOT" 정신. verify 의 drift 검사와 반대 방향: 여기선 "코드가 생겼나".)
//
// 사용:
//   node sync-lifecycle.mjs <ssotDir> [--root <dir>] [--repo <o/n>] [--base <branch>] [--apply]
//   기본: planned→active 후보를 리포트(_lifecycle.md) + 전환 PR 커맨드를 "제시"만.
//   --apply: 후보 노드의 lifecycle 을 active 로 바꾸고 git 브랜치 + gh pr create 까지 수행.
// 의존성 없음(node 표준 + governance.mjs).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadCatalog, ghPrCmd, gitBranchCmds } from './governance.mjs';

const argv = process.argv.slice(2);
const ssotDir = argv[0];
const rootDir = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : process.cwd();
const repo = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : '';
const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : '';
const apply = argv.includes('--apply');
if (!ssotDir) { console.error('usage: node sync-lifecycle.mjs <ssotDir> [--root <dir>] [--repo <o/n>] [--base <branch>] [--apply]'); process.exit(2); }

const cat = loadCatalog(ssotDir);

// planned 인데 코드가 실존하는 노드 = active 전환 후보.
const candidates = [];
for (const n of cat.nodes) {
  if (n.lifecycle !== 'planned') continue;
  const impl = Array.isArray(n.facets?.implementedIn) ? n.facets.implementedIn : [];
  const existing = impl.filter(p => {
    if (!p) return false;
    const token = String(p).split(/\s+/)[0].replace(/[)\].,]+$/, '');
    return token && existsSync(join(rootDir, token));
  });
  if (existing.length) candidates.push({ id: n.id, file: n.file, title: n.title, paths: existing });
}

// 리포트
const L = [];
L.push('# SSOT lifecycle 전환 후보 (_lifecycle.md)');
L.push('');
L.push('> `planned` 인데 코드 provenance(implementedIn)가 실존 → `active` 전환 후보. 자동 전환 금지 — PR 제안만.');
L.push('');
L.push(`- 전환 후보(planned→active): **${candidates.length}**`);
L.push('');
if (candidates.length === 0) L.push('_없음 — planned 노드 중 코드가 생긴 것 없음_');
else for (const c of candidates) L.push(`- \`${c.id}\` (\`${c.file}\`) — 코드 실존: ${c.paths.map(p => `\`${p}\``).join(', ')}`);
L.push('');
writeFileSync(join(ssotDir, '_lifecycle.md'), L.join('\n'));

console.log(`sync-lifecycle: planned→active 후보 ${candidates.length}건 → ${join(ssotDir, '_lifecycle.md')}`);
for (const c of candidates) console.log(`  · ${c.id} ← ${c.paths[0]}`);

if (candidates.length === 0) process.exit(0);

const branch = 'ssot/lifecycle/planned-to-active';
const prTitle = `[ssot] lifecycle: planned→active (${candidates.length}건)`;
const prBody = [
  '## planned → active 전환 제안', '',
  '아래 노드는 `planned`(기획됨) 였으나 코드 provenance가 실존 → 구현됨(`active`)으로 전환.',
  '자동 전환이 아니라 사람 검토용 제안이다.', '',
  ...candidates.map(c => `- \`${c.id}\` — ${c.title} (코드: ${c.paths.map(p => `\`${p}\``).join(', ')})`),
  '', '---', '_ai-proposed: 검토·머지는 사람. main 직접 push 금지._',
].join('\n');

if (!apply) {
  console.log('\n--- 실행할 계획(미적용) ---');
  console.log(`  ${candidates.length}개 노드 frontmatter: lifecycle: planned → active`);
  console.log(`  $ ${gitBranchCmds(branch, base)}`);
  console.log(`  $ ${ghPrCmd({ title: prTitle, body: prBody, base, head: branch, labels: ['ai-proposed'], repo })}`);
  console.log('\n(--apply 로 전환 + 브랜치 + PR 생성.)');
  process.exit(0);
}

// --apply: frontmatter lifecycle 교체 → 브랜치 → PR
for (const c of candidates) {
  const p = join(ssotDir, c.file);
  let content = readFileSync(p, 'utf8');
  if (/^lifecycle:\s*planned\s*$/m.test(content)) {
    content = content.replace(/^lifecycle:\s*planned\s*$/m, 'lifecycle: active');
    writeFileSync(p, content);
    console.log(`  ✓ ${c.id}: lifecycle planned → active`);
  } else {
    console.error(`  ✗ ${c.id}: 'lifecycle: planned' 라인을 못 찾음(수동 확인).`);
  }
}
function run(cmd) {
  try {
    const outp = execFileSync('sh', ['-c', cmd], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`  ✓ ${cmd.split(' ').slice(0, 3).join(' ')} → ${String(outp).trim().split('\n').pop()}`);
  } catch (err) {
    console.error(`  ✗ 실패: ${cmd}\n    ${err.stderr ? String(err.stderr).trim() : err.message}`);
  }
}
run(gitBranchCmds(branch, base));
run(ghPrCmd({ title: prTitle, body: prBody, base, head: branch, labels: ['ai-proposed'], repo }));
console.log('\n전환 PR 제안 완료. 머지는 사람.');
