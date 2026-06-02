// adapters/stubs.ts — rest / web / jira / confluence 어댑터의 인터페이스 + stub.
//
// SourceAdapter 계약은 type 별로 동일하다(load(config) → SsotGraph). 아래 어댑터는 계약을
// 구현하되 본문 로직은 NotImplemented 로 막아둔다 — 향후 구현 지점을 명확히 남기기 위한
// 자리표시자다. 각 stub 은 "무엇을 어떻게 가져올지"의 설계 메모를 주석으로 보유한다.

import type {
  ConfluenceSourceConfig,
  JiraSourceConfig,
  RestSourceConfig,
  WebSourceConfig,
} from '../config.js';
import type { AdapterLoadResult, SourceAdapter } from './types.js';

function notImplemented(type: string): never {
  throw new Error(
    `'${type}' 소스 어댑터는 아직 구현되지 않았습니다(stub). ` +
      `현재 구현된 타입: git, local-fs. ` +
      `구현 시 catalog 확보 → @repo/core.normalize → SsotGraph 로 동일 계약을 따르면 됩니다.`,
  );
}

/**
 * rest — HTTP 로 _catalog.json(과 노드 .md)을 가져온다.
 * 구현 방향: fetch(config.catalogUrl, { headers }) → JSON → core.normalize.
 *   fetchMarkdown 은 config.bodyBaseUrl + node.file 을 fetch.
 */
export const restAdapter: SourceAdapter<RestSourceConfig> = {
  type: 'rest',
  load(_config: RestSourceConfig): Promise<AdapterLoadResult> {
    return Promise.reject(notImplemented('rest'));
  },
};

/**
 * web — 정적 호스팅된 SSOT 디렉토리(baseUrl/_catalog.json + baseUrl/<file>).
 * 구현 방향: rest 와 동일하나 base URL 규약(정적 디렉토리)만 다르다.
 */
export const webAdapter: SourceAdapter<WebSourceConfig> = {
  type: 'web',
  load(_config: WebSourceConfig): Promise<AdapterLoadResult> {
    return Promise.reject(notImplemented('web'));
  },
};

/**
 * jira — 이슈/에픽을 SSOT 노드로 투영.
 * 구현 방향: JQL 검색 → 이슈를 SsotNode(kind 매핑) 로 변환 → RawCatalog 합성 → core.normalize.
 *   인증은 config.tokenEnv 가 가리키는 env 변수에서 읽는다(설정에 토큰 금지).
 */
export const jiraAdapter: SourceAdapter<JiraSourceConfig> = {
  type: 'jira',
  load(_config: JiraSourceConfig): Promise<AdapterLoadResult> {
    return Promise.reject(notImplemented('jira'));
  },
};

/**
 * confluence — 스페이스 페이지를 SSOT 노드로 투영.
 * 구현 방향: space content API → 페이지를 SsotNode 로 변환 → RawCatalog 합성 → core.normalize.
 */
export const confluenceAdapter: SourceAdapter<ConfluenceSourceConfig> = {
  type: 'confluence',
  load(_config: ConfluenceSourceConfig): Promise<AdapterLoadResult> {
    return Promise.reject(notImplemented('confluence'));
  },
};
