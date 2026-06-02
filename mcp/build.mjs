import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// @repo/core → vendor core.mjs 인라인 + SDK 번들 → 단일 dist/index.js (clone-동작).
// shebang 은 src/index.ts 에 이미 있으므로 banner 엔 createRequire shim 만 (SDK 의 CJS require 대응).
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  outfile: 'dist/index.js',
  alias: { '@repo/core': resolve(__dirname, '../vendor/core.mjs') },
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});
console.log('✓ dist/index.js');
