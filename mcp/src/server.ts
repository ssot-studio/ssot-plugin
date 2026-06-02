// server.ts — stdio MCP 서버. 등록된 SSOT 소스 레지스트리를 6개 도구로 노출한다.
//
// 저수준 Server + setRequestHandler 를 사용한다(McpServer/zod 헬퍼 대신) — 입력 스키마를 raw
// JSON Schema 로 선언해 zod 를 직접 의존하지 않기 위함. 도구 로직은 tools.ts(순수)에 위임.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { SourceRegistry } from './registry.js';
import {
  ToolError,
  getNode,
  gaps,
  impact,
  listSources,
  neighbors,
  search,
  flag,
} from './tools.js';

const SERVER_NAME = 'ssot';
const SERVER_VERSION = '0.0.0';

const SOURCE_PROP = {
  type: 'string',
  description: '대상 SSOT 소스 id (ssot_list_sources 로 확인).',
} as const;

const TOOLS: Tool[] = [
  {
    name: 'ssot_list_sources',
    description:
      '등록된 모든 SSOT 소스를 나열한다. 각 소스의 type / 노드 수 / 엣지 수 / 본문 지원 여부 / 로드 에러를 반환.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'ssot_get_node',
    description:
      '소스에서 단일 노드를 4축 facet(정체성·의미·관계·메타) + 본문 마크다운까지 반환한다. 본문은 lazy 로드 후 frontmatter 권위로 머지된다.',
    inputSchema: {
      type: 'object',
      properties: { source: SOURCE_PROP, id: { type: 'string', description: '노드 id (예: domain.chat).' } },
      required: ['source', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'ssot_search',
    description:
      '제목·id·정의·목적·소유자 부분일치로 노드를 검색한다. source 생략 시 등록된 모든 소스를 전역 검색.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '공백 구분 검색어(부분일치, 대소문자 무시).' },
        source: { type: 'string', description: '특정 소스로 한정(생략 시 전역).' },
        limit: { type: 'number', description: '최대 결과 수(기본 50).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'ssot_impact',
    description:
      '한 노드에서 impacts / relatesTo / governs 관계를 따라 파급되는 영향 범위를 트래버설한다. 무엇을 건드리면 어디까지 흔들리는지.',
    inputSchema: {
      type: 'object',
      properties: {
        source: SOURCE_PROP,
        id: { type: 'string', description: '시작 노드 id.' },
        depth: { type: 'number', description: '최대 파급 깊이(1~10, 기본 5).' },
      },
      required: ['source', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'ssot_neighbors',
    description:
      'depth-N 인접 노드를 반환한다(out/in/both). 1-hop 이웃의 유도 서브그래프 구조 종류(graph/tree/table/stateMachine)도 함께 분류한다.',
    inputSchema: {
      type: 'object',
      properties: {
        source: SOURCE_PROP,
        id: { type: 'string', description: '중심 노드 id.' },
        depth: { type: 'number', description: '탐색 깊이(1~10, 기본 1).' },
        dir: {
          type: 'string',
          enum: ['out', 'in', 'both'],
          description: '방향(기본 both).',
        },
      },
      required: ['source', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'ssot_gaps',
    description:
      '소스의 완전성 갭을 보고한다: 끊긴 엣지(치명) · high-confidence 측면 누락(결함) · 진행중 노드(정보) · 고아 owner(정보) · 파싱 에러.',
    inputSchema: {
      type: 'object',
      properties: { source: SOURCE_PROP },
      required: ['source'],
      additionalProperties: false,
    },
  },
  {
    name: 'ssot_flag',
    description:
      '조회 중 발견한 SSOT 문제(dangling/contradiction/missing/other)를 GitHub 이슈로 등록할 본문 + gh 커맨드로 구성한다. MCP는 읽기전용이므로 이슈를 직접 생성하지 않고 본문·커맨드 텍스트만 반환한다 — 실제 생성은 사람/스킬이 수행.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '이슈 제목(짧은 요약).' },
        type: {
          type: 'string',
          enum: ['dangling', 'contradiction', 'missing', 'other'],
          description: '문제 종류(기본 other).',
        },
        detail: { type: 'string', description: '상세 설명(마크다운).' },
        nodes: { type: 'array', items: { type: 'string' }, description: '관련 노드 id 목록.' },
        repo: { type: 'string', description: '대상 레포(owner/name). 생략 시 현재 레포.' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
];

function asString(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new ToolError(`인자 "${name}" 은 비어있지 않은 문자열이어야 합니다.`);
  }
  return v;
}

function asOptString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

function asOptNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

async function dispatch(
  registry: SourceRegistry,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'ssot_list_sources':
      return listSources(registry);
    case 'ssot_get_node':
      return getNode(registry, asString(args.source, 'source'), asString(args.id, 'id'));
    case 'ssot_search':
      return search(
        registry,
        asString(args.query, 'query'),
        asOptString(args.source),
        asOptNumber(args.limit) ?? 50,
      );
    case 'ssot_impact':
      return impact(
        registry,
        asString(args.source, 'source'),
        asString(args.id, 'id'),
        asOptNumber(args.depth) ?? 5,
      );
    case 'ssot_neighbors': {
      const dir = asOptString(args.dir);
      return neighbors(
        registry,
        asString(args.source, 'source'),
        asString(args.id, 'id'),
        asOptNumber(args.depth) ?? 1,
        dir === 'out' || dir === 'in' || dir === 'both' ? dir : 'both',
      );
    }
    case 'ssot_gaps':
      return gaps(registry, asString(args.source, 'source'));
    case 'ssot_flag':
      return flag({
        title: asString(args.title, 'title'),
        type: asOptString(args.type),
        detail: asOptString(args.detail),
        nodes: Array.isArray(args.nodes) ? args.nodes.filter((n): n is string => typeof n === 'string') : [],
        repo: asOptString(args.repo),
      });
    default:
      throw new ToolError(`알 수 없는 도구: ${name}`);
  }
}

/** 레지스트리를 stdio MCP 서버로 노출한다. 호출 측이 프로세스를 살아있게 유지한다. */
export async function startMcpServer(registry: SourceRegistry): Promise<Server> {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
    const { name, arguments: rawArgs } = request.params;
    const args = (rawArgs ?? {}) as Record<string, unknown>;
    try {
      const result = await dispatch(registry, name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: message }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
