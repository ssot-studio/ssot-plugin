import { type Confidence, type Lifecycle, type ParseError, type RelatesEdge } from './types.js';
export declare function asStringArray(v: unknown): string[];
export declare function asString(v: unknown): string | undefined;
export declare function asConfidence(v: unknown): Confidence;
export declare function asLifecycle(v: unknown): Lifecycle;
/** lastVerified: 'YYYY-MM-DD' 만 유효, '0000-00-00'/빈값/형식위반은 null. */
export declare function asLastVerified(v: unknown): string | null;
/**
 * catalog 의 lossy relatesTo 문자열을 RelatesEdge 로 복원.
 * 형태: '{ to: concept.agent, type: builds, note: 임의 텍스트(콤마/슬래시 포함 가능) }'
 *
 * note 본문에 콤마가 들어갈 수 있어 단순 콤마 분리는 불가 — 키 위치 기준으로 자른다.
 * to/type 누락이면 null 반환(호출부가 parseError 적재).
 */
export declare function parseRelatesString(input: string): RelatesEdge | null;
/** relatesTo 값(문자열 | 객체 혼재 배열)을 RelatesEdge[] 로 복원. */
export declare function normalizeRelatesToValue(v: unknown, nodeId: string, errors: ParseError[]): RelatesEdge[];
