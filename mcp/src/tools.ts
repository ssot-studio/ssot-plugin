// tools.ts — MCP 도구 6종의 순수 로직(전송 계층과 분리).
//
//   ssot_list_sources                      등록된 소스 목록 + 노드/엣지 수
//   ssot_get_node(source, id)              노드 1건(본문 포함, lazy 머지)
//   ssot_search(source?, query, tags?)     제목/정의/목적/소유자 부분일치 검색 + 태그 필터(전역/단일)
//   ssot_list_tags(source?)                노드 tags 를 네임스페이스별로 집계(태그 카탈로그)
//   ssot_impact(source, id)                impacts/relatesTo/governs 트래버설(파급 영향)
//   ssot_neighbors(source, id, depth)      depth-N 인접(out/in/both)
//   ssot_gaps(source)                      완전성 갭(끊긴 엣지/측면 누락/미완/고아 owner)
//   ssot_flag(...)                         조회 중 발견한 문제를 이슈 본문+gh 커맨드로 구성(읽기전용 — 실행 안 함)
//
// 트래버설·구조 판별은 @repo/core 를 재사용한다(로직 재구현 금지).
// ssot_flag 는 데이터/원격을 일절 건드리지 않는다 — MCP 읽기전용 원칙(실제 이슈 생성은 사람/스킬).

import {
  classify,
  collectTagGroups,
  nodeMatchesTags,
  reachable,
  type EdgeFilter,
  type SsotEdge,
  type SsotNode,
} from '@repo/core';
import type { LoadedSource, SourceRegistry } from './registry.js';

// ── 직렬화 헬퍼 ──────────────────────────────────────────────────

export interface NodeSummary {
  source: string;
  id: string;
  kind: string;
  title: string;
  confidence: string;
  lifecycle: string;
  owner: string;
  authority: string;
  openCount: number;
  /** 분류 태그 — "namespace:value"(예: 'domain:auth', 'status:active', 'type:endpoint'). */
  tags: string[];
}

function summarize(sourceId: string, node: SsotNode): NodeSummary {
  return {
    source: sourceId,
    id: node.id,
    kind: node.kind,
    title: node.title,
    confidence: node.facets.meta.confidence,
    lifecycle: node.facets.meta.lifecycle,
    owner: node.facets.meta.owner,
    authority: node.authority,
    openCount: node.openCount,
    tags: node.tags,
  };
}

class ToolError extends Error {}

function requireSource(registry: SourceRegistry, sourceId: string): LoadedSource {
  const src = registry.get(sourceId);
  if (!src) {
    const known = registry
      .list()
      .map((s) => s.id)
      .join(', ');
    throw new ToolError(`알 수 없는 source: "${sourceId}" (등록된 소스: ${known || '없음'})`);
  }
  return src;
}

export { ToolError };

// ── ssot_list_sources ─────────────────────────────────────────────

export interface SourceInfo {
  id: string;
  label: string;
  type: string;
  nodeCount: number;
  edgeCount: number;
  parseErrors: number;
  bodySupported: boolean;
  generatedFrom: string;
}

export function listSources(registry: SourceRegistry): {
  sources: SourceInfo[];
  loadErrors: readonly { id: string; type: string; message: string }[];
  /** 등록된 소스가 0개일 때만 채워지는 안내(신규 설치 정상 상태). */
  guidance?: string;
} {
  const sources: SourceInfo[] = registry.list().map((s) => ({
    id: s.id,
    label: s.label,
    type: s.type,
    nodeCount: s.graph.nodes.size,
    edgeCount: s.graph.edges.length,
    parseErrors: s.graph.parseErrors.length,
    bodySupported: s.hasBodySupport(),
    generatedFrom: s.graph.generatedFrom,
  }));
  if (sources.length === 0) {
    return {
      sources,
      loadErrors: registry.loadErrors,
      guidance:
        `등록된 SSOT 소스가 없습니다 (설정 출처: ${registry.origin}). ` +
        'ssot-sources.json 을 SSOT_SOURCES_FILE 경로(${CLAUDE_PLUGIN_DATA}/ssot-sources.json)에 ' +
        '만들거나 SSOT_SOURCES env 로 소스를 등록하세요.',
    };
  }
  return { sources, loadErrors: registry.loadErrors };
}

// ── ssot_get_node ─────────────────────────────────────────────────

export interface NodeDetail extends NodeSummary {
  file: string;
  source_path?: string;
  facets: SsotNode['facets'];
  body?: {
    markdown: string;
    sections: { heading: string; level: number }[];
    openItems: { checked: boolean; text: string }[];
  };
  /**
   * 노드가 미검증(confidence !== 'high')이거나 미완(openCount > 0)일 때, 조회 호스트에게
   * JIT 캡처를 유도하는 힌트. MCP만 쓰는 호스트도 ssot_flag 로 이슈 캡처가 가능함을 안내.
   */
  captureHint?: string;
}

export async function getNode(
  registry: SourceRegistry,
  sourceId: string,
  id: string,
): Promise<NodeDetail> {
  const src = requireSource(registry, sourceId);
  const node = (await src.hydrateBody(id)) ?? src.getNode(id);
  if (!node) {
    throw new ToolError(`노드 없음: "${id}" (source: ${sourceId})`);
  }
  const detail: NodeDetail = {
    ...summarize(sourceId, node),
    file: node.file,
    facets: node.facets,
  };
  if (node.source) detail.source_path = node.source;
  if (node.body) {
    detail.body = {
      markdown: node.body.markdown,
      sections: node.body.sections.map((s) => ({ heading: s.heading, level: s.level })),
      openItems: node.body.openItems,
    };
  }
  if (node.facets.meta.confidence !== 'high' || node.openCount > 0) {
    detail.captureHint =
      '이 노드는 미검증/빈칸입니다. 사용자가 관련 지식을 제시하면 ssot_flag(type=competency-gap 또는 rationale-fragment)로 이슈 캡처를 제안하세요. (MCP만 쓰는 호스트도 캡처 가능)';
  }
  return detail;
}

// ── ssot_search ───────────────────────────────────────────────────

function matchScore(node: SsotNode, terms: string[]): number {
  const haystacks: { text: string; weight: number }[] = [
    { text: node.title, weight: 5 },
    { text: node.id, weight: 4 },
    { text: node.facets.semantics.definition ?? '', weight: 3 },
    { text: node.facets.purpose.purpose ?? '', weight: 3 },
    { text: node.facets.purpose.value ?? '', weight: 2 },
    { text: node.facets.meta.owner, weight: 1 },
    { text: node.kind, weight: 1 },
  ];
  let score = 0;
  for (const term of terms) {
    for (const h of haystacks) {
      if (h.text.toLowerCase().includes(term)) score += h.weight;
    }
  }
  return score;
}

export interface SearchHit extends NodeSummary {
  score: number;
}

/**
 * 노드 검색. query(키워드 부분일치) 와 tags(분류 필터)를 함께 받는다.
 * - query 만: 제목/id/정의/목적/소유자 부분일치(가중 점수).
 * - tags 만: 해당 태그를 가진 노드 전체(태그는 namespace 내 OR, namespace 간 AND).
 * - 둘 다: 키워드 매치 AND 태그 매치(교집합).
 * query 가 비고 tags 만 주어지면 키워드 점수 없이 태그 필터만 적용한다.
 */
export function search(
  registry: SourceRegistry,
  query: string,
  sourceId?: string,
  limit = 50,
  tags?: string[],
): SearchHit[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const tagSet = new Set((tags ?? []).filter((t) => typeof t === 'string' && t.trim() !== ''));
  const hasQuery = terms.length > 0;
  const hasTags = tagSet.size > 0;
  // query 도 tags 도 없으면 빈 결과(전체 덤프 방지).
  if (!hasQuery && !hasTags) return [];

  const targets = sourceId ? [requireSource(registry, sourceId)] : registry.list();
  const hits: SearchHit[] = [];
  for (const src of targets) {
    for (const node of src.graph.nodes.values()) {
      if (hasTags && !nodeMatchesTags(node, tagSet)) continue;
      const score = hasQuery ? matchScore(node, terms) : 1;
      if (hasQuery && score === 0) continue;
      hits.push({ ...summarize(src.id, node), score });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, Math.max(1, limit));
}

// ── ssot_list_tags ────────────────────────────────────────────────

export interface TagCatalog {
  /** 집계 대상 — 단일 source id 또는 'all'(전역). */
  source: string;
  /** 네임스페이스별 태그 목록(각 태그의 노드 수 동반). 빈 namespace 는 제외. */
  namespaces: {
    namespace: string;
    tags: { tag: string; value: string; count: number }[];
  }[];
}

/**
 * 등록된 노드의 tags 를 네임스페이스별로 집계한다(어떤 태그가 있는지 카탈로그).
 * count 는 그 태그를 가진 노드 수. core.collectTagGroups 재사용(웹 필터와 동일 규칙).
 */
export function listTags(registry: SourceRegistry, sourceId?: string): TagCatalog {
  const targets = sourceId ? [requireSource(registry, sourceId)] : registry.list();
  const allNodes: SsotNode[] = [];
  for (const src of targets) {
    for (const node of src.graph.nodes.values()) allNodes.push(node);
  }
  const groups = collectTagGroups(allNodes);
  return {
    source: sourceId ?? 'all',
    namespaces: groups.map((g) => ({
      namespace: g.namespace,
      tags: g.tags.map((t) => ({ tag: t.raw, value: t.value, count: t.count })),
    })),
  };
}

// ── ssot_impact ───────────────────────────────────────────────────

/** 파급 관계: impacts / governs / relatesTo. 한쪽이라도 매치하면 통과(OR). */
const IMPACT_RELS = new Set<string>(['impacts', 'governs', 'relatesTo']);

function impactFilterEdges(edges: SsotEdge[]): SsotEdge[] {
  return edges.filter((e) => IMPACT_RELS.has(e.rel));
}

export interface ImpactResult {
  source: string;
  root: NodeSummary;
  /** 파급 도달 노드(시작 노드 제외). */
  impacted: NodeSummary[];
  /** 파급 경로를 이룬 직접 엣지. */
  edges: { from: string; to: string; rel: string; relationType?: string }[];
}

/**
 * impacts/relatesTo/governs 를 따라 out 방향으로 도달 가능한 노드 집합.
 * core.reachable 을 관계 필터를 직접 적용해 여러 rel(OR) 로 확장한다.
 */
export function impact(
  registry: SourceRegistry,
  sourceId: string,
  id: string,
  maxDepth = 5,
): ImpactResult {
  const src = requireSource(registry, sourceId);
  const root = src.getNode(id);
  if (!root) throw new ToolError(`노드 없음: "${id}" (source: ${sourceId})`);

  const idx = src.index;
  const visited = new Set<string>([id]);
  const reached = new Set<string>();
  const usedEdges: SsotEdge[] = [];
  let frontier: string[] = [id];
  let depth = 0;
  const cap = Math.max(1, Math.min(maxDepth, 10));
  while (frontier.length > 0 && depth < cap) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const edge of impactFilterEdges(idx.out.get(cur) ?? [])) {
        usedEdges.push(edge);
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        reached.add(edge.to);
        next.push(edge.to);
      }
    }
    frontier = next;
    depth++;
  }

  const impacted: NodeSummary[] = [...reached]
    .map((nid) => src.getNode(nid))
    .filter((n): n is SsotNode => n !== undefined)
    .map((n) => summarize(sourceId, n))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  return {
    source: sourceId,
    root: summarize(sourceId, root),
    impacted,
    edges: usedEdges.map((e) => ({
      from: e.from,
      to: e.to,
      rel: e.rel,
      ...(e.relationType !== undefined ? { relationType: e.relationType } : {}),
    })),
  };
}

// ── ssot_neighbors ────────────────────────────────────────────────

export interface NeighborsResult {
  source: string;
  root: NodeSummary;
  dir: 'out' | 'in' | 'both';
  depth: number;
  neighbors: NodeSummary[];
  /** 1-hop 이웃 + 중심 노드의 유도 서브그래프 구조 종류(core.classify). */
  structure?: { kind: string; reason: string };
}

export function neighbors(
  registry: SourceRegistry,
  sourceId: string,
  id: string,
  depth = 1,
  dir: 'out' | 'in' | 'both' = 'both',
  filter?: EdgeFilter,
): NeighborsResult {
  const src = requireSource(registry, sourceId);
  const root = src.getNode(id);
  if (!root) throw new ToolError(`노드 없음: "${id}" (source: ${sourceId})`);

  const cap = Math.max(1, Math.min(depth, 10));
  const idx = src.index;
  const found = new Set<string>();
  if (dir === 'out' || dir === 'both') {
    for (const nid of reachable(src.graph, id, { filter, maxDepth: cap, reverse: false }, idx)) {
      found.add(nid);
    }
  }
  if (dir === 'in' || dir === 'both') {
    for (const nid of reachable(src.graph, id, { filter, maxDepth: cap, reverse: true }, idx)) {
      found.add(nid);
    }
  }
  found.delete(id);

  const list: NodeSummary[] = [...found]
    .map((nid) => src.getNode(nid))
    .filter((n): n is SsotNode => n !== undefined)
    .map((n) => summarize(sourceId, n))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));

  const result: NeighborsResult = {
    source: sourceId,
    root: summarize(sourceId, root),
    dir,
    depth: cap,
    neighbors: list,
  };
  const structure = classifyNeighborhood(src, id);
  if (structure) result.structure = structure;
  return result;
}

// ── ssot_gaps ─────────────────────────────────────────────────────

export interface GapsResult {
  source: string;
  totals: { nodes: number; edges: number };
  /** 끊긴 엣지(존재하지 않는 노드를 가리킴) — 연결 완전성 결함(치명). */
  danglingEdges: { from: string; to: string; rel: string; missing: string }[];
  /** high-confidence 인데 핵심 측면이 빈 노드 — 측면 완전성 결함. */
  missingFacets: { id: string; kind: string; missing: string[] }[];
  /** 진행중(low-confidence) 노드 — 정보. */
  inProgress: { id: string; confidence: string; openCount: number }[];
  /** owner 미지정(TBD) — 정보. */
  orphanOwners: { id: string; kind: string }[];
  /** core.normalize 단계에서 적재된 파싱 에러. */
  parseErrors: { kind: string; nodeId?: string; message: string }[];
}

/** kind 별로 high-confidence 노드에 기대하는 핵심 측면. */
function requiredFacets(node: SsotNode): string[] {
  const f = node.facets;
  const missing: string[] = [];
  if (!f.semantics.definition) missing.push('definition');
  if (!f.purpose.purpose) missing.push('purpose');
  // 관계가 하나도 없으면(고립 노드) 관계 측면 누락으로 본다.
  const hasAnyRel =
    f.semantics.relatesTo.length > 0 ||
    f.semantics.governedBy.length > 0 ||
    f.semantics.governs.length > 0 ||
    f.realization.realizedBy.length > 0 ||
    f.realization.dependsOn.length > 0 ||
    f.realization.impacts.length > 0;
  if (!hasAnyRel) missing.push('relations');
  return missing;
}

export function gaps(registry: SourceRegistry, sourceId: string): GapsResult {
  const src = requireSource(registry, sourceId);
  const { graph } = src;

  const dangling: GapsResult['danglingEdges'] = [];
  for (const e of graph.edges) {
    if (!graph.nodes.has(e.from)) {
      dangling.push({ from: e.from, to: e.to, rel: e.rel, missing: e.from });
    } else if (!graph.nodes.has(e.to)) {
      dangling.push({ from: e.from, to: e.to, rel: e.rel, missing: e.to });
    }
  }

  const missingFacets: GapsResult['missingFacets'] = [];
  const inProgress: GapsResult['inProgress'] = [];
  const orphanOwners: GapsResult['orphanOwners'] = [];

  for (const node of graph.nodes.values()) {
    const conf = node.facets.meta.confidence;
    if (conf === 'high') {
      const missing = requiredFacets(node);
      if (missing.length > 0) missingFacets.push({ id: node.id, kind: node.kind, missing });
    } else {
      inProgress.push({ id: node.id, confidence: conf, openCount: node.openCount });
    }
    const owner = node.facets.meta.owner;
    if (!owner || owner === 'TBD') orphanOwners.push({ id: node.id, kind: node.kind });
  }

  const sortById = <T extends { id: string }>(xs: T[]): T[] =>
    xs.sort((a, b) => a.id.localeCompare(b.id));

  return {
    source: sourceId,
    totals: { nodes: graph.nodes.size, edges: graph.edges.length },
    danglingEdges: dangling,
    missingFacets: sortById(missingFacets),
    inProgress: sortById(inProgress),
    orphanOwners: sortById(orphanOwners),
    parseErrors: graph.parseErrors.map((p) => ({
      kind: p.kind,
      ...(p.nodeId !== undefined ? { nodeId: p.nodeId } : {}),
      message: p.message,
    })),
  };
}

// ── ssot_flag ─────────────────────────────────────────────────────
// 조회 중 발견한 SSOT 문제를 "이슈로 등록할 재료"로 구성한다. MCP는 읽기전용이므로
// 데이터/원격을 절대 건드리지 않는다 — 이슈 본문 + gh 커맨드 텍스트만 반환하고,
// 실제 생성은 사람/스킬(scripts/flag.mjs --apply)이 수행한다. skills/ssot/scripts/flag.mjs 와
// 동일한 본문·라벨 규약을 쓴다(단일 정의).

// 두 계열(family)을 다룬다:
//   · 문제(flag)   : dangling/contradiction/missing/other — 조회 중 발견한 SSOT 결함.
//   · 캡처(capture): competency-gap/rationale-fragment — JIT 캡처(schema-on-read).
//                     조회/대화 중 생긴 "변경거리"를 그 시점에 이슈로만 적재(PR/브랜치/커밋 금지).
//                     owner 검증 전엔 진실이 아니다(inferred/unverified) — 별도 큐레이션 에이전트가
//                     dedup·구조화 후 propose 로 승격한다.
// skills/ssot/scripts/flag.mjs 와 본문·라벨·제목 prefix·family·추가필드를 100% 동일하게 유지한다.

export type FlagType =
  | 'dangling'
  | 'contradiction'
  | 'missing'
  | 'other'
  | 'competency-gap'
  | 'rationale-fragment';

const FLAG_TYPE_LABEL: Record<FlagType, string> = {
  dangling: 'ssot-dangling',
  contradiction: 'ssot-contradiction',
  missing: 'ssot-missing',
  other: 'ssot-flag',
  'competency-gap': 'ssot-competency-gap',
  'rationale-fragment': 'ssot-rationale',
};
const FLAG_TYPE_DESC: Record<FlagType, string> = {
  dangling: '끊긴 엣지 — 존재하지 않는 노드를 가리킴(연결 완전성 결함).',
  contradiction: '모순 — 두 노드/불변식/결정이 서로 충돌.',
  missing: '누락 — 코드/사실은 있으나 SSOT 항목이 없음.',
  other: '조회 중 발견한 SSOT 문제.',
  'competency-gap':
    '미답 질문 — 조회로 답하지 못한 competency question. 빠진 슬롯(Decision/Invariant 등) 신호.',
  'rationale-fragment': '근거 조각 — 질문자가 자발적으로 제시한 의견/근거. 검증 전 후보(inferred).',
};

const ALL_FLAG_TYPES: readonly FlagType[] = [
  'dangling',
  'contradiction',
  'missing',
  'other',
  'competency-gap',
  'rationale-fragment',
];

type FlagFamily = 'flag' | 'capture';
const CAPTURE_TYPES: ReadonlySet<FlagType> = new Set<FlagType>([
  'competency-gap',
  'rationale-fragment',
]);
function flagFamily(type: FlagType): FlagFamily {
  return CAPTURE_TYPES.has(type) ? 'capture' : 'flag';
}

type CaptureConfidence = 'unverified' | 'inferred';
const DEFAULT_CONFIDENCE: Record<'competency-gap' | 'rationale-fragment', CaptureConfidence> = {
  'competency-gap': 'unverified',
  'rationale-fragment': 'inferred',
};

export interface FlagResult {
  type: FlagType;
  /** 계열: 문제(flag) vs JIT 캡처(capture). */
  family: FlagFamily;
  title: string;
  labels: string[];
  /** gh issue 본문 마크다운. */
  body: string;
  /** 사람/스킬이 그대로 실행할 gh 커맨드(MCP는 실행하지 않음). */
  ghCommand: string;
  note: string;
}

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function flag(args: {
  type?: string;
  title: string;
  detail?: string;
  nodes?: string[];
  repo?: string;
  question?: string;
  asker?: string;
  confidence?: string;
}): FlagResult {
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  if (!title) throw new ToolError('인자 "title" 은 비어있지 않은 문자열이어야 합니다.');
  const type: FlagType = ALL_FLAG_TYPES.includes(args.type as FlagType)
    ? (args.type as FlagType)
    : 'other';
  const nodes = Array.isArray(args.nodes) ? args.nodes.filter((n) => typeof n === 'string') : [];
  const detail =
    typeof args.detail === 'string' && args.detail.trim() ? args.detail : '- [ ] OPEN: 상세 서술 필요.';
  const family = flagFamily(type);

  let body: string;
  let labels: string[];
  if (family === 'capture') {
    const captureType = type as 'competency-gap' | 'rationale-fragment';
    const question =
      typeof args.question === 'string' && args.question.trim() ? args.question.trim() : '(미지정)';
    const asker =
      typeof args.asker === 'string' && args.asker.trim() ? args.asker.trim() : '(미지정)';
    const confidence =
      typeof args.confidence === 'string' && args.confidence.trim()
        ? args.confidence.trim()
        : DEFAULT_CONFIDENCE[captureType];
    body = [
      `## SSOT capture: ${type}`,
      '',
      `- 종류: **${type}** — ${FLAG_TYPE_DESC[type]}`,
      `- 원본 질문: ${question}`,
      `- 질문자(추정 owner 후보): ${asker}`,
      nodes.length
        ? `- 관련/대상 노드: ${nodes.map((n) => `\`${n}\``).join(', ')}`
        : '- 관련/대상 노드: (미지정 — 신규 슬롯 후보)',
      `- confidence: **${confidence}** (owner 검증 전까지 진실 아님)`,
      '',
      '### 상세',
      '',
      detail,
      '',
      '---',
      '_JIT 캡처(읽기전용). 별도 큐레이션 에이전트가 dedup·구조화 후 propose로 승격한다. PR은 클론된 레포에서만. owner 검증 전엔 inferred/unverified._',
    ].join('\n');
    labels = ['ssot-capture', FLAG_TYPE_LABEL[type]].filter((v, i, a) => a.indexOf(v) === i);
  } else {
    body = [
      `## SSOT flag: ${type}`,
      '',
      `- 종류: **${type}** — ${FLAG_TYPE_DESC[type]}`,
      nodes.length ? `- 관련 노드: ${nodes.map((n) => `\`${n}\``).join(', ')}` : '- 관련 노드: (미지정)',
      '',
      '### 상세',
      '',
      detail,
      '',
      '---',
      '_조회 중 발견(읽기전용). 데이터는 직접 수정하지 않고 이슈로 등록 — 사람이 판단._',
    ].join('\n');
    labels = ['ssot-flag', FLAG_TYPE_LABEL[type]].filter((v, i, a) => a.indexOf(v) === i);
  }

  const titlePrefix = family === 'capture' ? '[ssot:capture] ' : '[ssot:flag] ';
  const fullTitle = `${titlePrefix}${title}`;
  const parts = ['gh', 'issue', 'create', '--title', shq(fullTitle), '--body', shq(body)];
  for (const l of labels) parts.push('--label', shq(l));
  if (args.repo) parts.push('--repo', shq(args.repo));

  return {
    type,
    family,
    title: fullTitle,
    labels,
    body,
    ghCommand: parts.join(' '),
    note: 'MCP는 읽기전용 — 이슈를 생성하지 않았습니다. 위 ghCommand 를 사람/스킬이 실행하거나 scripts/flag.mjs --apply 를 쓰세요.',
  };
}

/** structure 판별 보조 — 인접 서브그래프의 구조 종류(graph/tree/table/stateMachine). */
export function classifyNeighborhood(
  src: LoadedSource,
  centerId: string,
): { kind: string; reason: string } | undefined {
  const center = src.getNode(centerId);
  if (!center) return undefined;
  const ids = new Set<string>([centerId]);
  for (const e of src.index.out.get(centerId) ?? []) ids.add(e.to);
  for (const e of src.index.in.get(centerId) ?? []) ids.add(e.from);
  const nodes = [...ids].map((id) => src.getNode(id)).filter((n): n is SsotNode => n !== undefined);
  const edges = src.graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const { kind, reason } = classify({ nodes, edges });
  return { kind, reason };
}
