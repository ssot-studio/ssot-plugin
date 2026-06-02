#!/usr/bin/env node
// propose.mjs — 변경 제안을 분류(정합/충돌/근간/범위외)하고 라우팅 산출물(브랜치/PR/이슈/ADR/영향리포트)을
//   결정적으로 계산해 "실행 계획"으로 내놓는다. main 직접 push 금지 — 항상 브랜치+PR 또는 이슈.
//
// 입력: 변경 디스크립터 JSON(파일 경로 또는 stdin). 스킬 본문(LLM)이 SSOT 조회로 채운다:
//   {
//     "title": "RBAC 프로젝트 역할 위임",
//     "summary": "...",                         // 사람용 요약
//     "signals": {                               // governance.classifyChange 입력
//       "touchesInvariant": false, "contradictsDecision": false,
//       "isArchitectural": false, "affectedDomains": ["rbac"], "inFourAxes": true
//     },
//     "seedIds": ["domain.rbac", "concept.project-role"],  // 영향분석 시작 노드(기존 그래프 내 id)
//     "newNodes": [ { "id": "concept.role-delegation", "kind": "Concept", "title": "...",
//                     "dir": "concepts", "frontmatter": { ... }, "body": "## 정의\n..." } ],
//     "conflictTargets": ["invariant.permission-sot"],     // 충돌 시 명시
//     "confidence": "inferred"
//   }
//
// 사용:
//   node propose.mjs <ssotDir> --change <descriptor.json> [--root <dir>] [--repo <owner/name>]
//                    [--base <branch>] [--apply]
//   --apply 없으면: 분류 + 만들 파일/브랜치/gh 커맨드를 "제시"만 한다(기본, 안전).
//   --apply 있으면: planned 노드 .md 작성 → git 브랜치 → gh 커맨드 실행까지 수행.
//
// 의존성 없음(node 표준 + governance.mjs). gh/git 은 사용자 계정 컨텍스트를 가정.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  loadCatalog, classifyChange, routePlan, nodeMap,
  ghIssueCmd, ghPrCmd, gitBranchCmds, impactReportMd,
} from './governance.mjs';

const argv = process.argv.slice(2);
const ssotDir = argv[0];
const changeFile = argv.includes('--change') ? argv[argv.indexOf('--change') + 1] : null;
const rootDir = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : process.cwd();
const repo = argv.includes('--repo') ? argv[argv.indexOf('--repo') + 1] : '';
const base = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : '';
const apply = argv.includes('--apply');
if (!ssotDir) { console.error('usage: node propose.mjs <ssotDir> --change <json> [--root <dir>] [--repo <o/n>] [--base <branch>] [--apply]'); process.exit(2); }

const cat = loadCatalog(ssotDir);
const nm = nodeMap(cat);

let change;
if (changeFile) change = JSON.parse(readFileSync(changeFile, 'utf8'));
else { // stdin
  const data = readFileSync(0, 'utf8');
  if (!data.trim()) { console.error('변경 디스크립터를 --change <json> 또는 stdin 으로 주세요.'); process.exit(2); }
  change = JSON.parse(data);
}

const title = change.title || '(제목 없음)';
const slug = (change.title || 'change').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'change';
const seedIds = Array.isArray(change.seedIds) ? change.seedIds : [];
const newNodes = Array.isArray(change.newNodes) ? change.newNodes : [];

// 1. 분류 → 라우팅
const { route, reasons } = classifyChange(change.signals || {});
const plan = routePlan(route);

// 2. seed/conflict 노드 실존 검증(끊긴 참조 조기 경고)
const unknownSeeds = seedIds.filter(id => !nm.has(id));
const conflictTargets = (Array.isArray(change.conflictTargets) ? change.conflictTargets : []).filter(Boolean);
const unknownConflicts = conflictTargets.filter(id => !nm.has(id));

// 3. 영향 리포트(필요 라우트만)
const impactMd = plan.impactReport && seedIds.length ? impactReportMd(cat, seedIds, { maxDepth: 5 }) : '';

// 4. 산출물 명세 계산
const branch = `ssot/propose/${slug}`;
const KIND_DIR = { Platform: '.', Persona: 'personas', Domain: 'domains', Concept: 'concepts', Capability: 'capabilities', SystemComponent: 'components', Integration: 'integrations', Invariant: 'invariants', Decision: 'decisions', EngineeringRule: 'rules', Screen: 'screens', Endpoint: 'endpoints', Flow: 'flows' };

function buildNodeFile(node) {
  // planned 노드 .md 본문 구성. frontmatter 는 lifecycle=planned, confidence 보수적.
  const fm = { ...(node.frontmatter || {}) };
  fm.id = node.id; fm.kind = node.kind; fm.title = node.title;
  if (route !== 'aligned') fm.lifecycle = fm.lifecycle || 'planned';
  else fm.lifecycle = fm.lifecycle || 'planned'; // 제안 단계는 코드 없음 → planned
  fm.confidence = fm.confidence || change.confidence || 'unverified';
  fm.owner = fm.owner || 'TBD';
  const fmLines = Object.entries(fm).map(([k, v]) =>
    Array.isArray(v) ? `${k}: ${JSON.stringify(v)}` : `${k}: ${v}`);
  const body = node.body || `## 미확정 (OPEN)\n- [ ] OPEN: 제안 단계 — 내용 보강 필요.\n`;
  return `---\n${fmLines.join('\n')}\n---\n\n${body}\n`;
}

const adrId = `decision.${slug}`;
function buildAdrFile() {
  const fm = [
    `id: ${adrId}`, `kind: Decision`, `title: ${title}`,
    `purpose: "${(change.summary || '').replace(/"/g, "'")}"`, `definition: ""`,
    `relatesTo: ${JSON.stringify(seedIds.map(to => ({ to, type: 'relates-to' })))}`,
    `supersedes: []`, `owner: TBD`, `lifecycle: active`,
    `confidence: ${change.confidence || 'inferred'}`, `lastVerified: ""`,
  ];
  const body = [
    '## 맥락 (Context)', change.summary || '- [ ] OPEN: 맥락 서술 필요.', '',
    '## 결정 (Decision)', '- [ ] OPEN: 결정 내용 작성 필요.', '',
    '## 근거와 결과 (Consequences)', impactMd || '- [ ] OPEN: 영향/결과 서술 필요.', '',
  ].join('\n');
  return `---\n${fm.join('\n')}\n---\n\n> Decision은 append-only다. 바뀌면 새 Decision을 supersedes로 잇는다.\n\n${body}\n`;
}

// PR/이슈 본문
function prBody() {
  const L = [];
  L.push(`## 제안: ${title}`, '', change.summary || '', '');
  L.push(`- 분류(route): **${route}** — ${reasons.join('; ')}`);
  L.push(`- confidence: ${change.confidence || 'unverified'}`);
  if (newNodes.length) L.push(`- 신규 planned 노드: ${newNodes.map(n => `\`${n.id}\``).join(', ')}`);
  if (conflictTargets.length) L.push(`- 충돌 대상(검토 필수): ${conflictTargets.map(id => `\`${id}\``).join(', ')}`);
  L.push('');
  if (impactMd) { L.push(impactMd); L.push(''); }
  L.push('---', '_ai-proposed: 사람이 검토·머지한다. main 직접 push 금지._');
  return L.join('\n');
}
function issueBody() {
  const L = [];
  L.push(`## ${route === 'out-of-scope' ? '제안 거부' : route === 'conflict' ? 'SSOT 충돌' : '근간 변경 검토'}: ${title}`, '');
  L.push(change.summary || '', '');
  L.push(`- 분류(route): **${route}** — ${reasons.join('; ')}`);
  if (route === 'out-of-scope') L.push('- 사유: SSOT 4축(제품/도메인/시스템/거버넌스) 비대상. SSOT 변경으로 받지 않음.');
  if (conflictTargets.length) L.push(`- 충돌/관련 대상: ${conflictTargets.map(id => `\`${id}\``).join(', ')}`);
  if (unknownConflicts.length) L.push(`- ⚠ 그래프에 없는 충돌 대상: ${unknownConflicts.join(', ')}`);
  L.push('');
  if (impactMd) { L.push(impactMd); }
  return L.join('\n');
}

// 5. 보고 / 실행
const report = [];
report.push(`propose: route=${route} (${reasons.join('; ')})`);
report.push(`  분류 근거: 불변식저촉=${!!(change.signals||{}).touchesInvariant} Decision모순=${!!(change.signals||{}).contradictsDecision} 아키텍처=${!!(change.signals||{}).isArchitectural} 도메인수=${((change.signals||{}).affectedDomains||[]).length} 4축대상=${(change.signals||{}).inFourAxes !== false}`);
if (unknownSeeds.length) report.push(`  ⚠ 그래프에 없는 seedId: ${unknownSeeds.join(', ')} (끊긴 참조 — 확인 필요)`);
report.push(`  계획: 브랜치=${plan.branch ? branch : '없음'} PR=${plan.pr || '없음'} 이슈=${plan.issue} ADR=${plan.adr} 영향리포트=${plan.impactReport}`);

const ghCmds = [];
if (plan.branch) ghCmds.push(gitBranchCmds(branch, base));
if (plan.pr) ghCmds.push(ghPrCmd({ title: `[ssot] ${title}`, body: prBody(), base, head: branch, labels: plan.prLabels, draft: plan.pr === 'draft', repo }));
if (plan.issue) ghCmds.push(ghIssueCmd({ title: `[ssot:${route}] ${title}`, body: issueBody(), labels: plan.prLabels.filter(l => l !== 'ai-proposed' || route === 'aligned'), repo }));

const writes = []; // {path, content}
if (plan.branch) {
  for (const node of newNodes) {
    const dir = KIND_DIR[node.kind] || 'concepts';
    const slugN = node.id.split('.')[1] || node.id;
    const targetDir = dir === '.' ? ssotDir : join(ssotDir, dir);
    writes.push({ path: join(targetDir, slugN + '.md'), content: buildNodeFile(node), dir: targetDir });
  }
  if (plan.adr) {
    const targetDir = join(ssotDir, 'decisions');
    writes.push({ path: join(targetDir, slug + '.md'), content: buildAdrFile(), dir: targetDir });
  }
  if (plan.impactReport && impactMd) {
    writes.push({ path: join(ssotDir, `_impact-${slug}.md`), content: `# 영향 리포트 — ${title}\n\n${impactMd}\n`, dir: ssotDir });
  }
}

if (!apply) {
  console.log(report.join('\n'));
  console.log('\n--- 작성할 파일(미적용) ---');
  for (const w of writes) console.log(`  + ${w.path}`);
  if (!writes.length) console.log('  (없음 — 거부 라우트거나 신규 노드 없음)');
  console.log('\n--- 실행할 명령(미적용) ---');
  for (const c of ghCmds) console.log(`  $ ${c}`);
  console.log('\n(--apply 로 파일 작성 + 브랜치/PR/이슈 생성. 미적용 시 위 계획만 출력.)');
  process.exit(0);
}

// --apply: 파일 작성 → git 브랜치 → gh
for (const w of writes) {
  if (!existsSync(w.dir)) mkdirSync(w.dir, { recursive: true });
  if (existsSync(w.path)) { console.error(`  ✗ 이미 존재(보존): ${w.path}`); continue; }
  writeFileSync(w.path, w.content);
  console.log(`  ✓ 작성: ${w.path}`);
}
function run(cmd) {
  // shell 파이프 없는 단순 명령은 sh -c 로 실행(인용 보존). 실패는 보고만 하고 계속.
  try {
    const outp = execFileSync('sh', ['-c', cmd], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`  ✓ ${cmd.split(' ').slice(0, 3).join(' ')} → ${String(outp).trim().split('\n').pop()}`);
  } catch (err) {
    console.error(`  ✗ 실패: ${cmd}\n    ${err.stderr ? String(err.stderr).trim() : err.message}`);
  }
}
for (const c of ghCmds) run(c);
console.log(report.join('\n'));
console.log('\n적용 완료. PR/이슈는 사람이 검토·머지한다 (main 직접 push 금지).');
