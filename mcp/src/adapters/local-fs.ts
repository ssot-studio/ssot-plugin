// adapters/local-fs.ts — 로컬 디렉토리의 docs/ssot 를 로드.
//
// _catalog.json 을 읽어 core.normalize 로 SsotGraph 를 만들고, 노드 본문(.md)은 lazy fetch.
// 노드 .md 경로는 catalog 의 generatedFrom(절대) 또는 SSOT 디렉토리 기준으로 해석한다.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { normalize, type RawCatalog, type SsotNode } from '@repo/core';
import type { LocalFsSourceConfig } from '../config.js';
import type { AdapterLoadResult, SourceAdapter } from './types.js';

/** SSOT 디렉토리에서 _catalog.json 을 읽어 RawCatalog 로 파싱. */
async function readCatalog(ssotDir: string): Promise<RawCatalog> {
  const path = join(ssotDir, '_catalog.json');
  if (!existsSync(path)) {
    throw new Error(`_catalog.json 없음: ${path}`);
  }
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as RawCatalog;
}

/**
 * 노드 본문 .md 절대 경로 해석.
 * node.file 은 catalog.generatedFrom 기준 상대경로다. generatedFrom 이 절대경로이고 실재하면
 * 그것을 우선하고(원본 위치), 아니면 로드한 SSOT 디렉토리 기준으로 해석한다(이식 가능).
 */
export function resolveNodeFile(ssotDir: string, generatedFrom: string, file: string): string {
  if (isAbsolute(file)) return file;
  if (generatedFrom && isAbsolute(generatedFrom) && existsSync(generatedFrom)) {
    return resolve(generatedFrom, file);
  }
  return resolve(ssotDir, file);
}

/** local-fs 로딩 코어 — git 어댑터가 클론 후 재사용한다. */
export async function loadLocalFs(ssotDir: string): Promise<AdapterLoadResult> {
  const abs = resolve(ssotDir);
  if (!existsSync(abs)) {
    throw new Error(`SSOT 디렉토리 없음: ${abs}`);
  }
  const raw = await readCatalog(abs);
  const graph = normalize(raw);

  const fetchMarkdown = async (node: SsotNode): Promise<string> => {
    const path = resolveNodeFile(abs, graph.generatedFrom, node.file);
    if (!existsSync(path)) {
      throw new Error(`노드 본문 없음: ${path}`);
    }
    return readFile(path, 'utf8');
  };

  return { graph, fetchMarkdown };
}

export const localFsAdapter: SourceAdapter<LocalFsSourceConfig> = {
  type: 'local-fs',
  load(config: LocalFsSourceConfig): Promise<AdapterLoadResult> {
    return loadLocalFs(config.dir);
  },
};
