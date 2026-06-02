import { type RawCatalog } from './catalog.js';
import { type ParseError, type SsotGraph, type SsotNode, type SsotNodeBody } from './types.js';
/** catalog 로드 + 정규화. */
export interface SsotCatalogLoader {
    /** _catalog.json 원시 객체를 가져온다(fetch/fs 는 구현체 책임). */
    loadCatalog(): Promise<RawCatalog>;
    /** RawCatalog → SsotGraph 정규화. */
    normalize(raw: RawCatalog): SsotGraph;
}
/** 노드 본문(.md) 로드. */
export interface SsotNodeBodyLoader {
    /** node.file 의 마크다운 원문을 가져온다(fetch/fs 는 구현체 책임). */
    fetchMarkdown(node: SsotNode): Promise<string>;
}
/**
 * 기본 catalog 로더 — fetchRaw 콜백만 주입하면 normalize 를 표준 구현으로 제공.
 * (Node: fs.readFile→JSON.parse, 브라우저: fetch→json 을 fetchRaw 로 넘긴다.)
 */
export declare class DefaultCatalogLoader implements SsotCatalogLoader {
    private readonly fetchRaw;
    constructor(fetchRaw: () => Promise<RawCatalog>);
    loadCatalog(): Promise<RawCatalog>;
    normalize(raw: RawCatalog): SsotGraph;
}
export interface LoadBodyResult {
    body: SsotNodeBody;
    /** frontmatter 권위 머지가 적용된 새 노드. */
    node: SsotNode;
    errors: ParseError[];
}
/**
 * 노드 본문을 로드해 파싱하고, frontmatter(권위)로 노드 facet 을 머지.
 * 머지 결과 노드와 본문을 반환 — 호출부가 그래프 Map 을 갱신한다.
 */
export declare function loadBody(loader: SsotNodeBodyLoader, node: SsotNode): Promise<LoadBodyResult>;
/**
 * 본문 로드 + 그래프 Map 인플레이스 갱신 편의 함수.
 * 머지된 노드를 graph.nodes 에 set 하고, 발생한 parseErrors 를 누적한다.
 */
export declare function hydrateNodeBody(graph: SsotGraph, loader: SsotNodeBodyLoader, nodeId: string): Promise<SsotNode | undefined>;
