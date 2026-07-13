// config.ts — 멀티소스 등록 설정. ssot-sources.json(파일) 또는 SSOT_SOURCES(env JSON)로
// 여러 SSOT 소스를 선언한다. 각 소스는 type 별 SourceAdapter 가 load 한다.
//
// 설계: 설정은 "무엇을 어디서 읽을지"의 단일 진실이고, "어떻게 정규화할지"는 @repo/core 다.
// 본 패키지는 자기 패키지 안에서만 동작한다 — 다른 워크스페이스 패키지(daemon/cli)에 의존하지 않고
// core 의 normalize/traversal/structure 만 재사용한다.

import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, resolve, join, extname } from 'node:path';

/** 지원 소스 타입. git / local-fs 우선 구현, 나머지는 인터페이스 + stub. */
export type SourceType = 'git' | 'local-fs' | 'rest' | 'web' | 'jira' | 'confluence';

export const SOURCE_TYPES: readonly SourceType[] = [
  'git',
  'local-fs',
  'rest',
  'web',
  'jira',
  'confluence',
] as const;

/** 모든 소스 공통 메타. */
interface SourceBase {
  /** 소스 식별자(도구 인자 source 값). 고유해야 한다. */
  id: string;
  /** 사람용 표시명. */
  label?: string;
  type: SourceType;
}

/** local-fs — 로컬 디렉토리에 이미 존재하는 docs/ssot (_catalog.json + 노드 .md). */
export interface LocalFsSourceConfig extends SourceBase {
  type: 'local-fs';
  /** _catalog.json 과 노드 .md 가 있는 SSOT 디렉토리(절대/상대). */
  dir: string;
}

/** git — 원격 레포를 clone/pull 한 뒤 그 안의 ssotPath 를 local-fs 로 로드. */
export interface GitSourceConfig extends SourceBase {
  type: 'git';
  /** 클론 대상 원격 URL. */
  url: string;
  /** 브랜치/태그/커밋(기본 레포 기본 브랜치). */
  ref?: string;
  /** 레포 루트 기준 SSOT 디렉토리 상대경로(기본 'docs/ssot'). */
  ssotPath?: string;
  /** 클론 캐시 위치(기본 OS tmp 하위 ssot-mcp/<id>). */
  cacheDir?: string;
  /** load 시 git pull 로 갱신할지(기본 true). */
  pull?: boolean;
}

/** rest — HTTP 로 _catalog.json 등을 가져오는 소스(인터페이스 + stub). */
export interface RestSourceConfig extends SourceBase {
  type: 'rest';
  /** _catalog.json 을 반환하는 엔드포인트. */
  catalogUrl: string;
  /** 노드 본문 .md base URL (옵션). */
  bodyBaseUrl?: string;
  headers?: Record<string, string>;
}

/** web — 정적 호스팅된 SSOT 디렉토리 base URL(인터페이스 + stub). */
export interface WebSourceConfig extends SourceBase {
  type: 'web';
  /** _catalog.json 이 있는 base URL. */
  baseUrl: string;
}

/** jira — 이슈 트래커 기반 소스(인터페이스 + stub). */
export interface JiraSourceConfig extends SourceBase {
  type: 'jira';
  baseUrl: string;
  project: string;
  jql?: string;
  /** 인증 토큰 env 변수명(값 자체를 설정에 박지 않는다). */
  tokenEnv?: string;
}

/** confluence — 위키 기반 소스(인터페이스 + stub). */
export interface ConfluenceSourceConfig extends SourceBase {
  type: 'confluence';
  baseUrl: string;
  spaceKey: string;
  tokenEnv?: string;
}

export type SourceConfig =
  | LocalFsSourceConfig
  | GitSourceConfig
  | RestSourceConfig
  | WebSourceConfig
  | JiraSourceConfig
  | ConfluenceSourceConfig;

export interface McpConfig {
  sources: SourceConfig[];
}

/** 설정 해석 결과 — 어디서 읽었는지(진단용) 포함. */
export interface ResolvedConfig extends McpConfig {
  origin: string;
}

const ENV_INLINE = 'SSOT_SOURCES';
const ENV_FILE = 'SSOT_SOURCES_FILE';
const DEFAULT_FILENAME = 'ssot-sources.json';
/** 프로젝트별 기본 소스 설정 디렉토리(프로젝트 루트 기준). */
const DEFAULT_SUBDIR = '.claude';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 알 수 없는 입력을 McpConfig 로 검증·정규화. 잘못된 소스는 명확한 에러로 거른다. */
export function validateConfig(input: unknown, origin: string): McpConfig {
  if (!isRecord(input)) {
    throw new Error(`[${origin}] 설정 루트는 객체여야 합니다.`);
  }
  const rawSources = input.sources;
  if (!Array.isArray(rawSources)) {
    throw new Error(`[${origin}] "sources" 는 배열이어야 합니다.`);
  }
  const seen = new Set<string>();
  const sources: SourceConfig[] = rawSources.map((raw, i) =>
    validateSource(raw, i, origin, seen),
  );
  return { sources };
}

function validateSource(
  raw: unknown,
  index: number,
  origin: string,
  seen: Set<string>,
): SourceConfig {
  const where = `[${origin}] sources[${index}]`;
  if (!isRecord(raw)) throw new Error(`${where} 는 객체여야 합니다.`);

  const id = raw.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error(`${where} 에 문자열 "id" 가 필요합니다.`);
  }
  if (seen.has(id)) throw new Error(`${where} id 중복: "${id}"`);
  seen.add(id);

  const type = raw.type;
  if (typeof type !== 'string' || !(SOURCE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`${where} type 이 올바르지 않습니다: ${String(type)} (허용: ${SOURCE_TYPES.join(', ')})`);
  }
  const label = typeof raw.label === 'string' ? raw.label : undefined;

  switch (type as SourceType) {
    case 'local-fs': {
      const dir = raw.dir;
      if (typeof dir !== 'string' || dir.trim() === '') {
        throw new Error(`${where} local-fs 소스에는 "dir" 가 필요합니다.`);
      }
      return { id, label, type: 'local-fs', dir };
    }
    case 'git': {
      const url = raw.url;
      if (typeof url !== 'string' || url.trim() === '') {
        throw new Error(`${where} git 소스에는 "url" 이 필요합니다.`);
      }
      return {
        id,
        label,
        type: 'git',
        url,
        ref: typeof raw.ref === 'string' ? raw.ref : undefined,
        ssotPath: typeof raw.ssotPath === 'string' ? raw.ssotPath : undefined,
        cacheDir: typeof raw.cacheDir === 'string' ? raw.cacheDir : undefined,
        pull: typeof raw.pull === 'boolean' ? raw.pull : undefined,
      };
    }
    case 'rest': {
      const catalogUrl = raw.catalogUrl;
      if (typeof catalogUrl !== 'string' || catalogUrl.trim() === '') {
        throw new Error(`${where} rest 소스에는 "catalogUrl" 이 필요합니다.`);
      }
      return {
        id,
        label,
        type: 'rest',
        catalogUrl,
        bodyBaseUrl: typeof raw.bodyBaseUrl === 'string' ? raw.bodyBaseUrl : undefined,
        headers: isRecord(raw.headers) ? (raw.headers as Record<string, string>) : undefined,
      };
    }
    case 'web': {
      const baseUrl = raw.baseUrl;
      if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
        throw new Error(`${where} web 소스에는 "baseUrl" 이 필요합니다.`);
      }
      return { id, label, type: 'web', baseUrl };
    }
    case 'jira': {
      const baseUrl = raw.baseUrl;
      const project = raw.project;
      if (typeof baseUrl !== 'string' || typeof project !== 'string') {
        throw new Error(`${where} jira 소스에는 "baseUrl" 과 "project" 가 필요합니다.`);
      }
      return {
        id,
        label,
        type: 'jira',
        baseUrl,
        project,
        jql: typeof raw.jql === 'string' ? raw.jql : undefined,
        tokenEnv: typeof raw.tokenEnv === 'string' ? raw.tokenEnv : undefined,
      };
    }
    case 'confluence': {
      const baseUrl = raw.baseUrl;
      const spaceKey = raw.spaceKey;
      if (typeof baseUrl !== 'string' || typeof spaceKey !== 'string') {
        throw new Error(`${where} confluence 소스에는 "baseUrl" 과 "spaceKey" 가 필요합니다.`);
      }
      return {
        id,
        label,
        type: 'confluence',
        baseUrl,
        spaceKey,
        tokenEnv: typeof raw.tokenEnv === 'string' ? raw.tokenEnv : undefined,
      };
    }
    default:
      throw new Error(`${where} 미지원 type: ${type}`);
  }
}

/** 프로젝트 루트 = CLAUDE_PROJECT_DIR(치환된 실제 경로) 우선, 없으면 현재 cwd. */
function projectRoot(cwd: string): string {
  const dir = process.env.CLAUDE_PROJECT_DIR;
  if (dir && dir.trim() !== '' && !isUnsubstituted(dir)) return dir;
  return cwd;
}

/** ${...} 플레이스홀더가 치환되지 않고 남았는지(치환 실패) 검사. */
function isUnsubstituted(value: string): boolean {
  return value.includes('${');
}

/** 파일 경로의 `.local` 형제 경로. 예: <dir>/ssot-sources.json → <dir>/ssot-sources.local.json */
function localSibling(path: string): string {
  const ext = extname(path);
  const base = ext ? path.slice(0, -ext.length) : path;
  return `${base}.local${ext}`;
}

/**
 * 후보 파일을 `.local` 우선으로 해석한다.
 * 같은 폴더의 `<name>.local<ext>`(개인 오버라이드, gitignore 대상)가 있으면 그것을,
 * 없으면 원본 파일을, 둘 다 없으면 null.
 */
function resolveWithLocal(path: string): string | null {
  const local = localSibling(path);
  if (existsSync(local)) return local;
  if (existsSync(path)) return path;
  return null;
}

/**
 * 설정 파일 후보 목록(우선순위 順). 각 후보는 resolveWithLocal 로 `.local` 형제를 우선 적용한다.
 *   1) SSOT_SOURCES_FILE(치환된 값)                  — 사용자 명시. 있으면 이것만 본다.
 *   2) <CLAUDE_PROJECT_DIR|cwd>/.claude/ssot-sources.json — 프로젝트별 기본
 *   3) <cwd>/ssot-sources.json                        — 하위호환(단독 실행)
 */
function fileCandidates(cwd: string): string[] {
  const fileEnv = process.env[ENV_FILE];
  if (fileEnv && fileEnv.trim() !== '' && !isUnsubstituted(fileEnv)) {
    return [isAbsolute(fileEnv) ? fileEnv : resolve(cwd, fileEnv)];
  }
  return [
    join(projectRoot(cwd), DEFAULT_SUBDIR, DEFAULT_FILENAME),
    resolve(cwd, DEFAULT_FILENAME),
  ];
}

/**
 * 설정 로드 우선순위:
 *   1) SSOT_SOURCES              — 인라인 JSON 문자열(env)
 *   2) SSOT_SOURCES_FILE         — 명시 파일 경로(+ `.local` 형제 우선)
 *   3) <프로젝트 루트>/.claude/ssot-sources.json  — 프로젝트별 기본(+ `.local`)
 *   4) <cwd>/ssot-sources.json  — 하위호환(+ `.local`)
 * 어느 것도 없으면 빈 sources(서버는 뜨되 소스 0 — 신규/미등록의 정상 상태).
 * 파일이 존재하는데 파싱/검증 실패면 loadFromFile 안에서 throw(사용자 실수 노출).
 */
export function loadConfig(cwd: string = process.cwd()): ResolvedConfig {
  const inline = process.env[ENV_INLINE];
  if (inline && inline.trim() !== '') {
    const parsed = parseJson(inline, ENV_INLINE);
    return { ...validateConfig(parsed, ENV_INLINE), origin: ENV_INLINE };
  }

  const candidates = fileCandidates(cwd);
  for (const cand of candidates) {
    const resolved = resolveWithLocal(cand);
    if (resolved) return loadFromFile(resolved);
  }

  return { sources: [], origin: `파일 없음: ${candidates[0]} — 소스 미등록` };
}

/**
 * 파일을 읽어 검증한다. 호출 측은 파일 존재를 먼저 보장해야 한다(부재는 graceful 처리 대상이므로
 * 여기서 다루지 않는다). 파일이 존재하는데 JSON 파싱/검증에 실패하면 원인을 노출하기 위해 throw.
 */
function loadFromFile(path: string): ResolvedConfig {
  if (!existsSync(path)) {
    throw new Error(`설정 파일을 찾을 수 없습니다: ${path}`);
  }
  const text = readFileSync(path, 'utf8');
  const parsed = parseJson(text, path);
  return { ...validateConfig(parsed, path), origin: path };
}

function parseJson(text: string, origin: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`[${origin}] JSON 파싱 실패: ${msg}`);
  }
}
