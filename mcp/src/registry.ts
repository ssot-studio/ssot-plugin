// registry.ts — 등록된 모든 SSOT 소스를 메모리에 로드·보관한다(sqlite 불필요).
//
// 각 소스는 LoadedSource 로 보유: 정규화 그래프 + 인접 인덱스(반복 트래버설 O(1)) + 본문
// lazy 캐시. 본문은 structure 판별·노드 상세에서 필요할 때만 fetchMarkdown 으로 채운다
// (core.loadBody 가 frontmatter 권위 머지까지 수행). 한 소스 로드 실패는 다른 소스를 막지 않는다.

import {
  buildAdjacencyIndex,
  loadBody,
  type AdjacencyIndex,
  type SsotGraph,
  type SsotNode,
} from '@repo/core';
import type { SourceConfig } from './config.js';
import type { AdapterLoadResult } from './adapters/types.js';
import { loadSource } from './adapters/index.js';

/** 메모리에 적재된 단일 소스. */
export class LoadedSource {
  readonly id: string;
  readonly label: string;
  readonly type: SourceConfig['type'];
  readonly graph: SsotGraph;
  private adjacency: AdjacencyIndex;
  private readonly fetchMarkdown?: (node: SsotNode) => Promise<string>;
  /** 본문 머지를 이미 수행한 노드 id(중복 IO 방지). */
  private readonly hydrated = new Set<string>();

  constructor(config: SourceConfig, result: AdapterLoadResult) {
    this.id = config.id;
    this.label = config.label ?? config.id;
    this.type = config.type;
    this.graph = result.graph;
    this.fetchMarkdown = result.fetchMarkdown;
    this.adjacency = buildAdjacencyIndex(result.graph);
  }

  get index(): AdjacencyIndex {
    return this.adjacency;
  }

  getNode(id: string): SsotNode | undefined {
    return this.graph.nodes.get(id);
  }

  hasBodySupport(): boolean {
    return typeof this.fetchMarkdown === 'function';
  }

  /**
   * 노드 본문을 lazy 로드해 frontmatter 권위로 facet 을 머지하고 그래프 Map 을 갱신한다.
   * 이미 머지했거나 본문 미지원 소스면 현재 노드를 그대로 반환. 본문 로드 실패는 throw 하지 않고
   * undefined 본문으로 둔다(상세/구조 판별이 본문 없이도 동작).
   */
  async hydrateBody(id: string): Promise<SsotNode | undefined> {
    const node = this.graph.nodes.get(id);
    if (!node) return undefined;
    if (this.hydrated.has(id) || !this.fetchMarkdown) return node;
    try {
      const { node: merged, errors } = await loadBody(
        { fetchMarkdown: this.fetchMarkdown },
        node,
      );
      this.graph.nodes.set(id, merged);
      if (errors.length > 0) this.graph.parseErrors.push(...errors);
      this.hydrated.add(id);
      return merged;
    } catch {
      // 본문이 없거나 못 읽으면 골격 노드를 그대로 쓴다.
      this.hydrated.add(id);
      return node;
    }
  }
}

export interface SourceLoadError {
  id: string;
  type: SourceConfig['type'];
  message: string;
}

/** 등록된 소스 전체를 보관하는 레지스트리. */
export class SourceRegistry {
  private readonly sources = new Map<string, LoadedSource>();
  private readonly errors: SourceLoadError[] = [];

  /** 설정 배열을 모두 로드한다. 개별 실패는 errors 에 모으고 나머지를 계속 로드한다. */
  static async create(configs: SourceConfig[]): Promise<SourceRegistry> {
    const registry = new SourceRegistry();
    await Promise.all(
      configs.map(async (config) => {
        try {
          const result = await loadSource(config);
          registry.sources.set(config.id, new LoadedSource(config, result));
        } catch (err) {
          registry.errors.push({
            id: config.id,
            type: config.type,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
    return registry;
  }

  get loadErrors(): readonly SourceLoadError[] {
    return this.errors;
  }

  list(): LoadedSource[] {
    return [...this.sources.values()];
  }

  get(id: string): LoadedSource | undefined {
    return this.sources.get(id);
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }
}
