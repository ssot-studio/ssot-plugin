#!/usr/bin/env node
// flag.mjs — 조회 중 발견한 SSOT 문제(dangling/모순/누락)를 gh 이슈로 등록할 수 있게
//   이슈 본문을 구성하고 gh 커맨드를 "제시" 한다. 데이터는 직접 건드리지 않는다(읽기전용 원칙).
//   기본은 커맨드 제시만, --apply 시에만 gh issue create 실행.
//
//   두 계열(family)을 다룬다:
//     · 문제(flag)   : dangling/contradiction/missing/other — 조회 중 발견한 SSOT 결함.
//                       라벨 'ssot-flag', 제목 prefix '[ssot:flag] '.
//     · 캡처(capture): competency-gap/rationale-fragment — JIT 캡처(schema-on-read).
//                       조회/대화 중 생긴 "변경거리"를 그 시점에 이슈로만 적재한다(PR/브랜치/커밋 금지).
//                       라벨 'ssot-capture', 제목 prefix '[ssot:capture] '.
//                       competency-gap: 미답 질문(빠진 슬롯 신호), 기본 confidence=unverified.
//                       rationale-fragment: 질문자가 자발 제시한 근거 조각, 기본 confidence=inferred.
//       캡처는 owner 검증 전엔 진실이 아니다(inferred/unverified). 별도 큐레이션 에이전트가
//       dedup·구조화 후 propose 로 승격한다.
//
//   MCP ssot_flag 도구와 동일한 본문 규약을 쓴다 — MCP(읽기전용)는 본문+커맨드 텍스트만 반환하고,
//   실제 이슈 생성은 사람/스킬이 한다. 이 스크립트는 스킬 측 진입점이자 MCP가 참조하는 단일 정의다.
//
// 사용:
//   node flag.mjs --type <dangling|contradiction|missing|other|competency-gap|rationale-fragment>
//                 --title <t> --detail <md>
//                 [--nodes id1,id2] [--question <q>] [--asker <name>]
//                 [--confidence <unverified|inferred>] [--repo <o/n>] [--apply]
//   또는 디스크립터 JSON: node flag.mjs --json <file|->
//     { "type": "...", "title": "...", "detail": "...", "nodes": ["..."],
//       "question": "...", "asker": "...", "confidence": "..." }
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ghIssueCmd } from './governance.mjs';

const argv = process.argv.slice(2);
function opt(name) { return argv.includes(name) ? argv[argv.indexOf(name) + 1] : null; }
const apply = argv.includes('--apply');
const repo = opt('--repo') || '';

let f;
const jsonArg = opt('--json');
if (jsonArg) {
  const raw = jsonArg === '-' ? readFileSync(0, 'utf8') : readFileSync(jsonArg, 'utf8');
  f = JSON.parse(raw);
} else {
  f = {
    type: opt('--type') || 'other',
    title: opt('--title') || '',
    detail: opt('--detail') || '',
    nodes: (opt('--nodes') || '').split(',').map(s => s.trim()).filter(Boolean),
    question: opt('--question') || '',
    asker: opt('--asker') || '',
    confidence: opt('--confidence') || '',
  };
}
if (!f.title) { console.error('flag: --title (또는 --json 의 title) 필수.'); process.exit(2); }

const TYPE_LABEL = {
  dangling: 'ssot-dangling', contradiction: 'ssot-contradiction',
  missing: 'ssot-missing', other: 'ssot-flag',
  'competency-gap': 'ssot-competency-gap', 'rationale-fragment': 'ssot-rationale',
};
const TYPE_DESC = {
  dangling: '끊긴 엣지 — 존재하지 않는 노드를 가리킴(연결 완전성 결함).',
  contradiction: '모순 — 두 노드/불변식/결정이 서로 충돌.',
  missing: '누락 — 코드/사실은 있으나 SSOT 항목이 없음.',
  other: '조회 중 발견한 SSOT 문제.',
  'competency-gap': '미답 질문 — 조회로 답하지 못한 competency question. 빠진 슬롯(Decision/Invariant 등) 신호.',
  'rationale-fragment': '근거 조각 — 질문자가 자발적으로 제시한 의견/근거. 검증 전 후보(inferred).',
};
// family 판정: capture(JIT) vs flag(문제).
const CAPTURE_TYPES = new Set(['competency-gap', 'rationale-fragment']);
function family(t) { return CAPTURE_TYPES.has(t) ? 'capture' : 'flag'; }
// capture 기본 confidence.
const DEFAULT_CONFIDENCE = { 'competency-gap': 'unverified', 'rationale-fragment': 'inferred' };

const type = TYPE_LABEL[f.type] ? f.type : 'other';
const nodes = Array.isArray(f.nodes) ? f.nodes : [];
const fam = family(type);

let body;
let labels;
if (fam === 'capture') {
  const question = (f.question || '').trim() || '(미지정)';
  const asker = (f.asker || '').trim() || '(미지정)';
  const confidence = (f.confidence || '').trim() || DEFAULT_CONFIDENCE[type];
  body = [
    `## SSOT capture: ${type}`, '',
    `- 종류: **${type}** — ${TYPE_DESC[type]}`,
    `- 원본 질문: ${question}`,
    `- 질문자(추정 owner 후보): ${asker}`,
    nodes.length
      ? `- 관련/대상 노드: ${nodes.map(n => `\`${n}\``).join(', ')}`
      : '- 관련/대상 노드: (미지정 — 신규 슬롯 후보)',
    `- confidence: **${confidence}** (owner 검증 전까지 진실 아님)`,
    '', '### 상세', '', f.detail || '- [ ] OPEN: 상세 서술 필요.',
    '', '---',
    '_JIT 캡처(읽기전용). 별도 큐레이션 에이전트가 dedup·구조화 후 propose로 승격한다. PR은 클론된 레포에서만. owner 검증 전엔 inferred/unverified._',
  ].join('\n');
  labels = ['ssot-capture', TYPE_LABEL[type]].filter((v, i, a) => a.indexOf(v) === i);
} else {
  body = [
    `## SSOT flag: ${type}`, '',
    `- 종류: **${type}** — ${TYPE_DESC[type]}`,
    nodes.length ? `- 관련 노드: ${nodes.map(n => `\`${n}\``).join(', ')}` : '- 관련 노드: (미지정)',
    '', '### 상세', '', f.detail || '- [ ] OPEN: 상세 서술 필요.',
    '', '---', '_조회 중 발견(읽기전용). 데이터는 직접 수정하지 않고 이슈로 등록 — 사람이 판단._',
  ].join('\n');
  labels = ['ssot-flag', TYPE_LABEL[type]].filter((v, i, a) => a.indexOf(v) === i);
}

const titlePrefix = fam === 'capture' ? '[ssot:capture] ' : '[ssot:flag] ';
const cmd = ghIssueCmd({ title: `${titlePrefix}${f.title}`, body, labels, repo });

if (!apply) {
  console.log(`flag: family=${fam} type=${type} nodes=${nodes.length}`);
  console.log('\n--- 이슈 본문(미적용) ---\n');
  console.log(body);
  console.log('\n--- 실행할 명령(미적용) ---');
  console.log(`  $ ${cmd}`);
  console.log('\n(--apply 로 gh issue create 실행. 기본은 제시만 — 읽기전용 안전.)');
  process.exit(0);
}
try {
  const outp = execFileSync('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`flag: 이슈 생성됨 → ${String(outp).trim().split('\n').pop()}`);
} catch (err) {
  console.error(`flag: gh issue create 실패\n  ${err.stderr ? String(err.stderr).trim() : err.message}`);
  process.exit(1);
}
