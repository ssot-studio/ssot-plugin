// adapters/index.ts — type → SourceAdapter 디스패치.

import type { SourceConfig, SourceType } from '../config.js';
import type { AdapterLoadResult, SourceAdapter } from './types.js';
import { localFsAdapter } from './local-fs.js';
import { gitAdapter } from './git.js';
import { confluenceAdapter, jiraAdapter, restAdapter, webAdapter } from './stubs.js';

const ADAPTERS: Record<SourceType, SourceAdapter> = {
  'local-fs': localFsAdapter as SourceAdapter,
  git: gitAdapter as SourceAdapter,
  rest: restAdapter as SourceAdapter,
  web: webAdapter as SourceAdapter,
  jira: jiraAdapter as SourceAdapter,
  confluence: confluenceAdapter as SourceAdapter,
};

export function getAdapter(type: SourceType): SourceAdapter {
  return ADAPTERS[type];
}

/** 설정 1건을 해당 어댑터로 로드. */
export function loadSource(config: SourceConfig): Promise<AdapterLoadResult> {
  return getAdapter(config.type).load(config);
}

export type { AdapterLoadResult, SourceAdapter } from './types.js';
