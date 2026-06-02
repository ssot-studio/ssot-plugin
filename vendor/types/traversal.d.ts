import { type EdgeRel, type SsotEdge, type SsotGraph, type SsotNode } from './types.js';
export interface EdgeFilter {
    /** 특정 관계만. 미지정이면 전체. */
    rel?: EdgeRel;
    /** rel='relatesTo' 일 때 relationType 일치 필터. */
    relationType?: string;
}
/** id 에서 나가는(out) 엣지. */
export declare function outgoingEdges(graph: SsotGraph, id: string, filter?: EdgeFilter): SsotEdge[];
/** id 로 들어오는(in / 역방향) 엣지. */
export declare function incomingEdges(graph: SsotGraph, id: string, filter?: EdgeFilter): SsotEdge[];
/** id 에서 한 단계 인접한 노드 id (out 방향). */
export declare function neighbors(graph: SsotGraph, id: string, filter?: EdgeFilter): string[];
/** id 로 들어오는 역방향 인접 노드 id. */
export declare function reverseNeighbors(graph: SsotGraph, id: string, filter?: EdgeFilter): string[];
export interface AdjacencyIndex {
    out: Map<string, SsotEdge[]>;
    in: Map<string, SsotEdge[]>;
}
/** edges 를 from/to 키로 한 번에 그룹핑. 반복 트래버설 전 호출. */
export declare function buildAdjacencyIndex(graph: SsotGraph): AdjacencyIndex;
export interface InducedSubgraph {
    /** S — 노드 id 집합. */
    nodeIds: Set<string>;
    /** S 의 유도 서브그래프 내부 엣지(양 끝이 S 안). */
    edges: SsotEdge[];
}
/** 노드 부분집합 S 의 유도 서브그래프(내부 엣지)를 추출. */
export declare function inducedSubgraph(graph: SsotGraph, nodeIds: Iterable<string>): InducedSubgraph;
export interface TraverseOptions {
    filter?: EdgeFilter;
    /** 최대 깊이(미지정=무한). 시작 노드는 depth 0. */
    maxDepth?: number;
    /** 역방향(in) 탐색 여부. 기본 false(out 방향). */
    reverse?: boolean;
}
/**
 * BFS 로 도달 가능한 노드 id 집합(시작 노드 제외). 사이클 안전.
 * index 를 넘기면 O(1) 인접 조회로 가속.
 */
export declare function reachable(graph: SsotGraph, startId: string, options?: TraverseOptions, index?: AdjacencyIndex): Set<string>;
/** 노드 조회 헬퍼(없으면 undefined). */
export declare function getNode(graph: SsotGraph, id: string): SsotNode | undefined;
