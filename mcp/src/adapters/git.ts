// adapters/git.ts — 회사 SSOT 처럼 git 레포에 사는 docs/ssot 를 로드.
//
// 동작: 캐시 디렉토리에 레포를 clone(최초) 또는 pull(갱신)한 뒤, 레포 안의 ssotPath(기본
// 'docs/ssot')를 local-fs 로더로 위임한다. git CLI 를 child_process 로 호출(별도 의존성 0).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
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

/** 캐시된 클론이 가리키는 origin. 레포가 아니거나 origin 이 없으면 null. */
async function cachedOrigin(cacheRoot: string): Promise<string | null> {
  const r = await runGit(['remote', 'get-url', 'origin'], cacheRoot);
  return r.code === 0 ? r.stdout.trim() || null : null;
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
 */
async function ensureRepo(config: GitSourceConfig): Promise<string> {
  const cacheRoot = config.cacheDir ? resolve(config.cacheDir) : defaultCacheDir(config.id);
  const gitDir = join(cacheRoot, '.git');
  const pull = config.pull !== false;

  if (existsSync(gitDir)) {
    const origin = await cachedOrigin(cacheRoot);
    if (origin && origin !== config.url) {
      await rm(cacheRoot, { recursive: true, force: true });
    }
  }

  if (!existsSync(gitDir)) {
    await mkdir(cacheRoot, { recursive: true });
    const cloneArgs = ['clone', '--depth', '1'];
    if (config.ref) cloneArgs.push('--branch', config.ref);
    cloneArgs.push(config.url, cacheRoot);
    await git(cloneArgs, undefined, `clone ${config.url}`);
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
