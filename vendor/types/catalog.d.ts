import { type EdgeRel, type SsotGraph } from './types.js';
export interface RawCatalogNode {
    id: string;
    kind: string;
    title: string;
    file: string;
    confidence?: string;
    owner?: string;
    lifecycle?: string;
    lastVerified?: string;
    openCount?: number;
    /** 분류 태그 — "namespace:value" 형식. catalog top-level. */
    tags?: unknown;
    facets?: Record<string, unknown>;
}
export interface RawCatalogEdge {
    from: string;
    to: string;
    rel: string;
}
export interface RawCatalogPath {
    from: string;
    field: string;
    raw: string;
}
export interface RawCatalog {
    generatedFrom: string;
    nodeCount: number;
    edgeCount: number;
    nodes: RawCatalogNode[];
    edges: RawCatalogEdge[];
    paths: RawCatalogPath[];
    parseErrors?: unknown[];
}
/**
 * catalog edge.rel 을 정규화. 'relatesTo:owns' → { rel:'relatesTo', relationType:'owns' }.
 * 알 수 없는 rel 은 null(호출부가 parseError 적재).
 */
export declare function splitEdgeRel(rel: string): {
    rel: EdgeRel;
    relationType?: string;
} | null;
/**
 * RawCatalog → SsotGraph.
 * (1) edges[].rel 을 ':' 로 split → relationType 복원.
 * (2) catalog facets.relatesTo 의 문자열 복원(본문 로드 시 객체형으로 덮어쓸 hint).
 * (3) facet → 4축 그룹 매핑.
 * (4) 끊긴 엣지(to/from 미존재 노드) 탐지해 parseErrors 적재.
 */
export declare function normalize(raw: RawCatalog): SsotGraph;
