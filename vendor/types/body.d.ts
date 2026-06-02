import { type MarkdownSection, type OpenItem, type ParseError, type SsotNode, type SsotNodeBody } from './types.js';
interface ParsedMarkdown {
    sections: MarkdownSection[];
    openItems: OpenItem[];
}
/**
 * 본문 마크다운을 heading 단위 섹션으로 분해하고, 코드블록·OPEN 체크박스를 추출.
 * 코드블록 내부의 '#' 는 heading 으로 오인하지 않는다.
 */
export declare function parseMarkdownBody(markdown: string): ParsedMarkdown;
/** 마크다운 문서 전체 → SsotNodeBody. */
export declare function parseNodeBody(doc: string): SsotNodeBody;
/**
 * 본문 frontmatter 로 노드 facet 을 덮어쓴다(권위 확정).
 * frontmatter 에 존재하는 키만 덮어쓴다 — 부재 키는 catalog 힌트 값을 보존.
 * relatesTo 는 frontmatter 의 객체 리스트가 정규형이므로 항상 우선.
 * 머지 결과 노드를 반환(원본은 수정하지 않는 복사 머지).
 */
export declare function mergeBodyIntoNode(node: SsotNode, body: SsotNodeBody, errors?: ParseError[]): SsotNode;
export {};
