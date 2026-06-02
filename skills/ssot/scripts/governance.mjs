#!/usr/bin/env node
// governance.mjs — 거버넌스 모드(propose / ingest / sync-lifecycle / flag)가 공유하는 순수 헬퍼.
//   "데이터 변경 = 제안(PR/이슈)" 원칙의 공통 부품을 한곳에 모은다(로직 중복 금지).
//   - 카탈로그 로딩 / 그래프 트래버설(영향분석) — verify.mjs 와 동일하게 _catalog.json edges 를 직접 순회.
//   - 변경 분류(정합/충돌/근간/범위외) 라우팅 규칙.
//   - gh 커맨드 텍스트 생성(직접 실행은 호출 측 스크립트가 --apply 시에만; 기본은 "제시").
// 의존성 없음(node 표준만). core.mjs 의 그래프 형상(_catalog.json)을 그대로 소비한다.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── 카탈로그 로딩 ────────────────────────────────────────────────
export function loadCatalog(ssotDir) {
  const p = join(ssotDir, '_catalog.json');
  if (!existsSync(p)) {
    throw new Error(`먼저 build-graph.mjs 를 실행하세요. (${p} 없음)`);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

// 인접 인덱스(out/in). 영향분석 트래버설용. catalog.edges 가 단일 진실.
export function buildIndex(cat) {
  const out = new Map(), inn = new Map();
  for (const e of cat.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
    if (!inn.has(e.to)) inn.set(e.to, []);
    inn.get(e.to).push(e);
  }
  return { out, inn };
}

// ── 영향분석 트래버설 ────────────────────────────────────────────
// 개념적 파급 엣지: impacts / governs / relatesTo:* / decidedBy. (MCP ssot_impact 와 동일 정신)
const IMPACT_RELS = new Set(['impacts', 'governs', 'governedBy', 'decidedBy']);
function isImpactEdge(rel) {
  if (!rel) return false;
  if (IMPACT_RELS.has(rel)) return true;
  return rel.startsWith('relatesTo:');
}

// seedIds 에서 out + in 양방향으로 파급 도달 노드 집합(시작 제외)과 경로 엣지를 반환.
export function impactClosure(cat, seedIds, maxDepth = 5) {
  const idx = buildIndex(cat);
  const visited = new Set(seedIds);
  const reached = new Set();
  const usedEdges = [];
  let frontier = [...seedIds];
  const cap = Math.max(1, Math.min(maxDepth, 10));
  for (let d = 0; d < cap && frontier.length; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const e of [...(idx.out.get(cur) || []), ...(idx.inn.get(cur) || [])]) {
        if (!isImpactEdge(e.rel)) continue;
        const other = e.from === cur ? e.to : e.from;
        usedEdges.push(e);
        if (visited.has(other)) continue;
        visited.add(other);
        reached.add(other);
        next.push(other);
      }
    }
    frontier = next;
  }
  for (const s of seedIds) reached.delete(s);
  return { impacted: [...reached], edges: usedEdges };
}

// id → 노드 룩업.
export function nodeMap(cat) {
  const m = new Map();
  for (const n of cat.nodes) m.set(n.id, n);
  return m;
}

// ── 변경 분류 / 라우팅 ───────────────────────────────────────────
// 사용자 위임 확정 규칙(스킬 SKILL.md 의 "충돌 라우팅" 과 1:1):
//   정합(aligned)   → planned 노드 PR (label ai-proposed)
//   충돌(conflict)  → 이슈 + draft PR (충돌 invariant/decision 명시)
//   근간(foundational) → Decision(ADR) 초안 + 영향 리포트 + 이슈
//   범위외(out-of-scope) → 거부 + 이슈로 사유 기록
// 애매하면 보수적으로 "더 무거운" 경로(foundational > conflict > aligned).
export const ROUTES = ['aligned', 'conflict', 'foundational', 'out-of-scope'];

// 신호 기반 분류. signals 는 LLM(스킬 본문)이 SSOT 조회로 채운 객체:
//   { touchesInvariant: bool, contradictsDecision: bool, isArchitectural: bool,
//     affectedDomains: string[], inFourAxes: bool }
// 결정적 규칙으로 ROUTE 를 정한다 — LLM 추론의 산물을 일관되게 라우팅하기 위함.
export function classifyChange(signals = {}) {
  const reasons = [];
  if (signals.inFourAxes === false) {
    reasons.push('4축(제품/도메인/시스템/거버넌스) 비대상');
    return { route: 'out-of-scope', reasons };
  }
  const domains = Array.isArray(signals.affectedDomains) ? signals.affectedDomains : [];
  if (signals.isArchitectural || domains.length >= 3) {
    reasons.push(signals.isArchitectural ? '아키텍처 근간 변경' : `다수 도메인(${domains.length}) 파급`);
    return { route: 'foundational', reasons };
  }
  if (signals.touchesInvariant || signals.contradictsDecision) {
    reasons.push(signals.touchesInvariant ? '불변식(invariant) 저촉' : 'Decision 모순');
    return { route: 'conflict', reasons };
  }
  reasons.push('기존 그래프와 정합(신규/보강)');
  return { route: 'aligned', reasons };
}

// 라우트별 산출물 명세(스킬이 무엇을 만들지 안내). 결정적.
export function routePlan(route) {
  switch (route) {
    case 'aligned':
      return { branch: true, pr: 'normal', issue: false, adr: false, impactReport: false, prLabels: ['ai-proposed'] };
    case 'conflict':
      return { branch: true, pr: 'draft', issue: true, adr: false, impactReport: true, prLabels: ['ai-proposed', 'ssot-conflict'] };
    case 'foundational':
      return { branch: true, pr: 'draft', issue: true, adr: true, impactReport: true, prLabels: ['ai-proposed', 'ssot-foundational'] };
    case 'out-of-scope':
      return { branch: false, pr: false, issue: true, adr: false, impactReport: false, prLabels: ['ssot-rejected'] };
    default:
      throw new Error(`알 수 없는 route: ${route}`);
  }
}

// ── gh / git 커맨드 텍스트 ───────────────────────────────────────
// 직접 실행하지 않고 "제시"한다(MCP/스킬 안전 원칙). 호출 측이 --apply 시에만 실행.
const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`; // single-quote escape for shell

export function ghIssueCmd({ title, body, labels = [], repo }) {
  const parts = ['gh', 'issue', 'create', '--title', sh(title), '--body', sh(body)];
  for (const l of labels) parts.push('--label', sh(l));
  if (repo) parts.push('--repo', sh(repo));
  return parts.join(' ');
}

export function ghPrCmd({ title, body, base, head, labels = [], draft = false, repo }) {
  const parts = ['gh', 'pr', 'create', '--title', sh(title), '--body', sh(body)];
  if (base) parts.push('--base', sh(base));
  if (head) parts.push('--head', sh(head));
  if (draft) parts.push('--draft');
  for (const l of labels) parts.push('--label', sh(l));
  if (repo) parts.push('--repo', sh(repo));
  return parts.join(' ');
}

export function gitBranchCmds(branch, base) {
  // 현재 체크아웃 기반 분기(04-git.md): 명시 base 가 있으면 그 위, 없으면 HEAD.
  return base ? `git switch -c ${sh(branch)} ${sh(base)}` : `git switch -c ${sh(branch)}`;
}

// 영향 리포트 마크다운(traversal 결과를 사람이 검토 가능한 형태로).
export function impactReportMd(cat, seedIds, { maxDepth = 5 } = {}) {
  const nm = nodeMap(cat);
  const { impacted, edges } = impactClosure(cat, seedIds, maxDepth);
  const L = [];
  L.push('## 영향 리포트 (impact)');
  L.push('');
  L.push(`- 시작 노드: ${seedIds.map(s => `\`${s}\``).join(', ')}`);
  L.push(`- 파급 도달 노드: **${impacted.length}** (깊이 ≤ ${maxDepth}, impacts/governs/relatesTo/decidedBy)`);
  L.push('');
  if (impacted.length === 0) { L.push('_파급 없음 — 고립 변경_'); return L.join('\n'); }
  const byKind = new Map();
  for (const id of impacted) {
    const n = nm.get(id);
    const k = n?.kind || '(미상)';
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k).push({ id, title: n?.title || '', lifecycle: n?.lifecycle || '', conf: n?.confidence || '' });
  }
  for (const [kind, arr] of [...byKind].sort((a, b) => a[0].localeCompare(b[0]))) {
    L.push(`### ${kind} (${arr.length})`);
    for (const x of arr.sort((a, b) => a.id.localeCompare(b.id))) {
      L.push(`- \`${x.id}\` — ${x.title}${x.lifecycle ? ` [${x.lifecycle}]` : ''}${x.conf ? ` (${x.conf})` : ''}`);
    }
    L.push('');
  }
  return L.join('\n');
}
