#!/usr/bin/env node
// 버전 선언 3곳이 일치하는지 검사한다.
//
// plugin.json 은 플러그인이 스스로 밝히는 버전, marketplace.json 은 설치 소스가 광고하는 버전,
// mcp/package.json 은 MCP 번들의 버전이다. 셋이 어긋나면 "고쳤는데 배포되지 않는" 상태가 된다 —
// 0.7.2 릴리즈에서 marketplace.json 만 0.7.1 로 남아 실제로 그 사고가 났다.
import fs from 'node:fs';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));

const declared = {
  '.claude-plugin/plugin.json': read('.claude-plugin/plugin.json').version,
  '.claude-plugin/marketplace.json': read('.claude-plugin/marketplace.json').plugins?.[0]?.version,
  'mcp/package.json': read('mcp/package.json').version,
};

const versions = [...new Set(Object.values(declared))];
if (versions.length === 1 && versions[0]) {
  console.log(`✅ 버전 일치: ${versions[0]}`);
  process.exit(0);
}

console.error('🔴 버전 선언이 어긋난다 — 릴리즈하면 마켓플레이스가 옛 버전을 광고한다.\n');
for (const [file, v] of Object.entries(declared)) console.error(`  ${v ?? '(없음)'}\t${file}`);
console.error('\n세 곳을 같은 값으로 맞춰라.');
process.exit(1);
