/** 태그 필터/그룹핑이 요구하는 최소 노드 형상. */
export interface HasTags {
    id: string;
    tags: readonly string[];
}
/** 네임스페이스 → 사람이 읽는 라벨. */
export declare const NAMESPACE_LABELS: Record<string, string>;
export interface ParsedTag {
    /** 원본 "namespace:value" 문자열 — 필터 선택의 키. */
    raw: string;
    namespace: string;
    value: string;
}
export interface TagNamespaceGroup {
    namespace: string;
    /** 이 네임스페이스에 속한 태그들 (value 기준 정렬). */
    tags: {
        value: string;
        raw: string;
        count: number;
    }[];
}
/** "namespace:value" 파싱. ':' 가 없으면 namespace='etc'. value 에 ':' 가 더 있으면 첫 ':' 만 분리. */
export declare function parseTag(raw: string): ParsedTag;
/**
 * 노드 집합의 tags 를 수집해 네임스페이스별로 그룹핑한다.
 * - 네임스페이스 순서: 알려진 순서(domain/area/status/…) → 그 외 알파벳 → etc 는 항상 마지막.
 * - 각 네임스페이스 내 태그는 value 알파벳 순, 사용 횟수(count) 동반.
 */
export declare function collectTagGroups(nodes: Iterable<HasTags>): TagNamespaceGroup[];
/**
 * 선택된 태그 집합으로 노드를 통과시킬지 판정한다.
 * - 같은 네임스페이스 내 여러 선택 → OR (하나라도 가지면 통과).
 * - 서로 다른 네임스페이스 간 → AND (모든 선택 네임스페이스를 각각 만족해야 통과).
 * - 선택 없음 → 전부 통과.
 */
export declare function nodeMatchesTags(node: HasTags, selected: ReadonlySet<string>): boolean;
/** 선택된 태그 필터를 통과하는 노드 id 집합. selected 비면 null (= 필터 비활성, 전체 표시). */
export declare function filterNodeIds(nodes: Iterable<HasTags>, selected: ReadonlySet<string>): Set<string> | null;
