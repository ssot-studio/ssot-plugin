#!/usr/bin/env node
// @repo/mcp — 로컬 멀티소스 SSOT MCP 서버 진입점.
//
// 흐름: loadConfig(ssot-sources.json | SSOT_SOURCES env) → 각 소스를 SourceAdapter 로 로드
//   (git/local-fs 우선 구현) → 메모리 레지스트리(sqlite 불필요) → stdio MCP 서버로 6개 도구 노출.
//
// @repo/core 를 단일 재사용한다: normalize(파서/그래프) · traversal · structure(구조 판별).
// 다른 워크스페이스 패키지(daemon/cli)에 의존하지 않는다 — 자기 패키지 안에서만 동작.
//
// stdout 은 MCP 프로토콜 전용이므로 진단 로그는 전부 stderr 로 보낸다.

import { loadConfig } from './config.js';
import { SourceRegistry } from './registry.js';
import { startMcpServer } from './server.js';

export { loadConfig, validateConfig } from './config.js';
export type { McpConfig, ResolvedConfig, SourceConfig, SourceType } from './config.js';
export { SourceRegistry, LoadedSource } from './registry.js';
export type { SourceAdapter, AdapterLoadResult } from './adapters/index.js';
export { loadSource, getAdapter } from './adapters/index.js';
export * as tools from './tools.js';
export { startMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  process.stderr.write(
    `[ssot-mcp] 설정: ${config.origin} · 소스 ${config.sources.length}개\n`,
  );

  const registry = await SourceRegistry.create(config.sources);
  for (const src of registry.list()) {
    process.stderr.write(
      `[ssot-mcp] 로드됨: ${src.id} (${src.type}) — 노드 ${src.graph.nodes.size} · 엣지 ${src.graph.edges.length}\n`,
    );
  }
  for (const e of registry.loadErrors) {
    process.stderr.write(`[ssot-mcp] 로드 실패: ${e.id} (${e.type}) — ${e.message}\n`);
  }

  await startMcpServer(registry);
  process.stderr.write('[ssot-mcp] stdio MCP 서버 준비 완료.\n');
}

function isMainModule(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('index.js') || entry.endsWith('index.ts');
}

if (isMainModule()) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `[ssot-mcp] 시작 실패: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
