// adapters/git.ts — 회사 SSOT 처럼 git 레포에 사는 docs/ssot 를 로드.
//
// 동작: 캐시 디렉토리에 레포를 clone(최초) 또는 pull(갱신)한 뒤, 레포 안의 ssotPath(기본
// 'docs/ssot')를 local-fs 로더로 위임한다. git CLI 를 child_process 로 호출(별도 의존성 0).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { GitSourceConfig } from '../config.js';
import type { AdapterLoadResult, SourceAdapter } from './types.js';
import { loadLocalFs } from './local-fs.js';

interface GitRun {
  code: number;
  stdout: string;
  stderr: string;
}

function runGit(args: string[], cwd?: string): Promise<GitRun> {
  return new Promise<GitRun>((res) => {
    const child = spawn('git', args, { cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('close', (code) => res({ code: code ?? 1, stdout, stderr }));
    child.on('error', (err) => res({ code: 127, stdout, stderr: stderr + err.message }));
  });
}

async function git(args: string[], cwd: string | undefined, what: string): Promise<void> {
  const r = await runGit(args, cwd);
  if (r.code !== 0) {
    throw new Error(`git ${what} 실패 (code ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
  }
}

function defaultCacheDir(id: string): string {
  return join(tmpdir(), 'ssot-mcp', id);
}

/** 이 디렉토리를 우리가 클론해 소유한다는 표식. 이게 없는 디렉토리는 절대 지우지 않는다. */
const OWNED_MARKER = '.ssot-cache';

/** 캐시된 클론이 가리키는 origin. 레포가 아니거나 origin 이 없으면 null. */
async function cachedOrigin(cacheRoot: string): Promise<string | null> {
  const r = await runGit(['remote', 'get-url', 'origin'], cacheRoot);
  return r.code === 0 ? r.stdout.trim() || null : null;
}

/**
 * 같은 레포를 가리키는 url 인지 비교한다. 표기 차이(후행 슬래시·`.git` 접미사·scheme/host 대소문자)만으로
 * 다른 레포로 오판하면 매번 통째로 재클론하게 된다.
 *
 * 경로는 소문자화하지 않는다 — 경로 대소문자를 구별하는 자체호스팅 서버에서 `org/Repo` 와
 * `org/repo` 는 서로 다른 레포일 수 있다. scheme 과 host 만 소문자로 맞춘다.
 */
function sameRepo(a: string, b: string): boolean {
  const norm = (u: string) =>
    u
      .trim()
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')
      .replace(/^([A-Za-z+.-]+:\/\/)?([^/]*)/, (_m, scheme: string | undefined, host: string) =>
        `${(scheme ?? '').toLowerCase()}${host.toLowerCase()}`,
      );
  return norm(a) === norm(b);
}

/**
 * 레포를 캐시에 확보한다.
 *   - 최초: clone --depth 1 (+ ref 지정 시 --branch)
 *   - 캐시가 다른 레포를 가리키면: 버리고 다시 clone
 *   - 기존 + pull!==false: fetch + checkout/reset 으로 ref 동기화
 * 반환: 레포 작업트리 루트 절대경로.
 *
 * 캐시가 있어도 **선언된 url 과 다른 레포를 가리키면 버리고 다시 클론한다.** 그러지 않으면 소스
 * url 을 바꿨을 때(레포 이전 등) 캐시의 옛 origin 으로 fetch 가 계속 성공해, 아무 경고 없이
 * **옛 원천을 진실로 쓰게 된다** — 단일 진실원천 도구에서 가장 나쁜 실패다. 조용히 틀린 답을
 * 주느니 다시 클론하는 비용을 치른다.
 *
 * 단, **우리 것이 확실한 디렉토리만** 지운다. 기본 캐시 경로는 우리가 만든 것이니 그대로 지우고,
 * 사용자가 `cacheDir` 로 직접 지정한 경로는 소유 표식이 있을 때만 지운다 — 그 설정이 실수로 실작업
 * 레포를 가리키면 통째로 날아가기 때문이다. 표식이 없으면 지우지 않고 중단해 사람에게 알린다.
 */
async function ensureRepo(config: GitSourceConfig): Promise<string> {
  const userChoseDir = Boolean(config.cacheDir);
  const cacheRoot = config.cacheDir ? resolve(config.cacheDir) : defaultCacheDir(config.id);
  const gitDir = join(cacheRoot, '.git');
  const pull = config.pull !== false;

  if (existsSync(gitDir)) {
    const origin = await cachedOrigin(cacheRoot);
    if (origin && !sameRepo(origin, config.url)) {
      if (userChoseDir && !existsSync(join(cacheRoot, OWNED_MARKER))) {
        throw new Error(
          `소스 '${config.id}' 의 cacheDir 이 다른 레포를 가리키는데, 우리가 만든 캐시라는 표식이 없다 — 지우지 않고 중단한다.\n` +
            `  경로: ${cacheRoot}\n  그곳의 origin: ${origin}\n  선언된 url: ${config.url}\n` +
            `  cacheDir 이 실작업 레포를 가리키고 있지 않은지 먼저 확인하라.\n` +
            `  캐시가 맞다면 그 디렉토리를 지우고 다시 실행하면 된다(재클론되며 표식이 생긴다).`,
        );
      }
      console.warn(
        `[ssot] 소스 '${config.id}' 의 원천이 바뀌었다 — 캐시를 버리고 다시 클론한다.\n` +
          `  이전: ${origin}\n  현재: ${config.url}`,
      );
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }

  if (!existsSync(gitDir)) {
    await mkdir(cacheRoot, { recursive: true });
    const cloneArgs = ['clone', '--depth', '1'];
    if (config.ref) cloneArgs.push('--branch', config.ref);
    cloneArgs.push(config.url, cacheRoot);
    await git(cloneArgs, undefined, `clone ${config.url}`);
    await writeFile(join(cacheRoot, OWNED_MARKER), `${config.url}\n`);
    return cacheRoot;
  }

  if (pull) {
    if (config.ref) {
      await git(['fetch', '--depth', '1', 'origin', config.ref], cacheRoot, 'fetch');
      await git(['checkout', '-f', config.ref], cacheRoot, `checkout ${config.ref}`);
      await git(['reset', '--hard', `origin/${config.ref}`], cacheRoot, 'reset');
    } else {
      await git(['pull', '--ff-only'], cacheRoot, 'pull');
    }
  }
  return cacheRoot;
}

export const gitAdapter: SourceAdapter<GitSourceConfig> = {
  type: 'git',
  async load(config: GitSourceConfig): Promise<AdapterLoadResult> {
    const repoRoot = await ensureRepo(config);
    const ssotDir = join(repoRoot, config.ssotPath ?? 'docs/ssot');
    return loadLocalFs(ssotDir);
  },
};
