export type YamlValue = string | number | boolean | null | YamlValue[] | {
    [key: string]: YamlValue;
};
/** YAML 부분집합 문서를 객체로 파싱. */
export declare function parseYaml(src: string): Record<string, unknown>;
export interface FrontmatterSplit {
    frontmatter: Record<string, unknown>;
    body: string;
    /** frontmatter 블록 존재 여부. */
    hasFrontmatter: boolean;
}
/** 마크다운 문서를 frontmatter 객체와 본문으로 분리. */
export declare function splitFrontmatter(doc: string): FrontmatterSplit;
