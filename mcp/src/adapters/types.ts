// adapters/types.ts — SourceAdapter 인터페이스.
//
// 단일 책임: 소스 설정(어디서 읽을지) → SsotGraph(정규화 모델). "어떻게 정규화하는지"는
// @repo/core.normalize 가 단일 정의하므로 어댑터는 (a) raw _catalog.json 확보,
// (b) core.normalize 호출, (c) 노드 본문 lazy fetch 콜백 제공만 한다.

import type { SsotGraph, SsotNode } from '@repo/core';
import type { SourceConfig } from '../config.js';

/** 어댑터가 반환하는 로드 결과. 본문은 lazy(필요 시 fetchMarkdown). */
export interface AdapterLoadResult {
  graph: SsotGraph;
  /**
   * 노드 본문(.md) 원문 fetch. structure 판별·노드 상세에서 lazy 로 호출.
   * 소스가 본문을 제공하지 않으면 undefined.
   */
  fetchMarkdown?: (node: SsotNode) => Promise<string>;
}

/**
 * SourceAdapter — type 별 구현. load(sourceConfig) → SsotGraph(+ lazy body).
 * config 객체의 type 으로 디스패치되며, 각 어댑터는 자신이 받는 구체 SourceConfig 만 처리한다.
 */
export interface SourceAdapter<C extends SourceConfig = SourceConfig> {
  readonly type: C['type'];
  load(config: C): Promise<AdapterLoadResult>;
}
