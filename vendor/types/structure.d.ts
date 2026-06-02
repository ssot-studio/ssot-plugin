import { type SsotEdge, type SsotNode } from './types.js';
export type StructureKind = 'graph' | 'tree' | 'table' | 'stateMachine';
export interface StructureSignals {
    size: number;
    /** |E| / |S| (자기 자신 제외 내부 엣지 밀도). */
    edgeDensity: number;
    /** 계층성(contains/owns/realizedBy 등) rel 비율. */
    containmentRatio: number;
    /** 비계층(relatesTo/impacts/dependsOn 등) 관계 수. */
    symmetricRels: number;
    /** 단일 kind 비율(최빈 kind / size). */
    kindHomogeneity: number;
    /** 동일 facet 키 집합 보유 노드 비율. */
    facetUniformity: number;
    /** 본문에 'A | B | C' 상태 enum 존재. */
    hasStateEnum: boolean;
    /** 본문에 '→' 전이 서술 존재. */
    hasTransitionProse: boolean;
}
export interface ClassifyThresholds {
    treeContainmentRatio: number;
    tableKindHomogeneity: number;
    tableFacetUniformity: number;
    tableMaxEdgeDensity: number;
}
export declare const DEFAULT_THRESHOLDS: ClassifyThresholds;
/** 노드 본문 마크다운에서 상태 enum / 전이 서술 신호를 추출. */
export declare function detectStateSignals(markdown: string): {
    hasStateEnum: boolean;
    hasTransitionProse: boolean;
};
/**
 * 노드 부분집합 + 내부 엣지에서 신호를 계산.
 * stateMachine 신호는 본문 의존 — body 미로드 시 false(상위 판별이 graph/tree/table 로 귀결).
 */
export declare function computeSignals(nodes: SsotNode[], edges: SsotEdge[]): StructureSignals;
/**
 * 유도 서브그래프가 트리형(각 노드 in-degree ≤ 1, 사이클 없음)인지 검사.
 * 계층성 엣지만으로 판정한다.
 */
export declare function isTreeShaped(nodeIds: Set<string>, edges: SsotEdge[]): boolean;
export interface ClassifyInput {
    nodes: SsotNode[];
    edges: SsotEdge[];
}
export interface ClassifyResult {
    kind: StructureKind;
    signals: StructureSignals;
    /** 판별 이유(디버깅/UI 설명용). */
    reason: string;
}
/** 신호 → 구조 종류. 소거식 우선순위로 첫 매치 채택. */
export declare function classifyStructure(signals: StructureSignals, nodeIds: Set<string>, edges: SsotEdge[], thresholds?: ClassifyThresholds): {
    kind: StructureKind;
    reason: string;
};
/** 입력(노드+엣지) → 신호 계산 + 분류 한 번에. */
export declare function classify(input: ClassifyInput, thresholds?: ClassifyThresholds): ClassifyResult;
