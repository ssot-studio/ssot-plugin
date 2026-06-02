#!/usr/bin/env node
// coverage.mjs — 코드→SSOT 커버리지 검사. 코드 표면이 SSOT 노드로 "항목화"됐는지 본다.
//   --scaffold: 갭을 빈 노드(authored)/미러 노드(mirrored)로 자동 생성 → "채울 근간".
// 의존성 없음. 사용: node coverage.mjs <ssotDir> --surface <tsv> [--scaffold] [--root <dir>]
//   surface tsv 각 줄: kind \t id \t title \t provenance [\t authority \t source]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const SKELETON_DIR = join(SCRIPT_DIR, '..', 'reference', 'skeleton');

const argv = process.argv.slice(2);
const ssotDir = argv[0];
const surfaceFile = argv.includes('--surface') ? argv[argv.indexOf('--surface') + 1] : null;
const rootDir = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : process.cwd();
const doScaffold = argv.includes('--scaffold');
if (!ssotDir || !surfaceFile) { console.error('usage: node coverage.mjs <ssotDir> --surface <tsv> [--scaffold] [--root <dir>]'); process.exit(2); }

const catalogPath = join(ssotDir, '_catalog.json');
if (!existsSync(catalogPath)) { console.error('build-graph 를 먼저 실행하세요.'); process.exit(2); }
const cat = JSON.parse(readFileSync(catalogPath, 'utf8'));

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const idset = new Set(cat.nodes.map(n => n.id));
const titleNorms = cat.nodes.map(n => norm(n.id) + '|' + norm(n.title));

const KIND_DIR = { Platform: '.', Persona: 'personas', Domain: 'domains', Concept: 'concepts', Capability: 'capabilities', SystemComponent: 'components', Integration: 'integrations', Invariant: 'invariants', Decision: 'decisions', EngineeringRule: 'rules', Screen: 'screens', Endpoint: 'endpoints', Flow: 'flows' };

const rows = readFileSync(surfaceFile, 'utf8').split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim());
const gaps = [], covered = [];
for (const row of rows) {
  const [kind, id, title, provenance, authority, source] = row.split('\t');
  if (!id) continue;
  const key = norm(id.split('.')[1] || id);
  // 커버 = id 정확 매칭 OR 노드 id/title에 핵심 토큰 포함 (본문 언급은 불인정 — '항목'이어야 함)
  const isCov = idset.has(id) || (key.length >= 3 && titleNorms.some(t => t.includes(key)));
  if (isCov) covered.push(id);
  else gaps.push({ kind: kind || 'Concept', id, title: title || id, provenance: provenance || '', authority: authority || 'authored', source: source || '' });
}

const created = [];
if (doScaffold) {
  for (const g of gaps) {
    const dir = KIND_DIR[g.kind] || 'concepts';
    const slug = g.id.split('.')[1] || g.id;
    const targetDir = dir === '.' ? ssotDir : join(ssotDir, dir);
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
    const path = join(targetDir, slug + '.md');
    if (existsSync(path)) continue; // 기존 노드 보존

    let content;
    if (g.authority === 'mirrored' && g.source && existsSync(join(rootDir, g.source))) {
      const orig = readFileSync(join(rootDir, g.source), 'utf8');
      // 본문은 sync.mjs 와 동일한 마커로 래핑한다 — 이후 source 변경 시 sync 가 마커 구간만 교체하고
      // 사람이 미러에 붙인 frontmatter 엣지(impacts/relatesTo)·마커 밖 메모는 보존한다.
      const block = `<!--SSOT:MIRROR-START-->\n> 이 노드는 \`${g.source}\` 의 **미러**다. SSOT에서 직접 편집 금지 — 원본을 고치고 \`sync\`로 갱신한다.\n\n${orig}\n<!--SSOT:MIRROR-END-->`;
      content = `---\nid: ${g.id}\nkind: ${g.kind}\ntitle: ${g.title}\nauthority: mirrored\nsource: ${g.source}\ndefinition: ${g.source} 의 미러 (본문은 원본 복제)\nowner: TBD\nlifecycle: active\nconfidence: high\nlastVerified: 0000-00-00\n---\n\n${block}\n`;
    } else {
      const skPath = join(SKELETON_DIR, g.kind + '.md');
      let sk = existsSync(skPath) ? readFileSync(skPath, 'utf8')
        : `---\nid: ${g.id}\nkind: ${g.kind}\ntitle: ${g.title}\nconfidence: unverified\nowner: TBD\n---\n`;
      sk = sk.replace(/^id: .*/m, `id: ${g.id}`).replace(/^kind: .*/m, `kind: ${g.kind}`).replace(/^title: .*/m, `title: ${g.title}`);
      content = sk + `\n## 자동 스캐폴드 — 채워야 함\n- [ ] OPEN: 코드 표면에서 자동 추출된 항목. 내용·관계·kind를 검증/작성 필요.\n- provenance: ${g.provenance || '(미상)'}\n`;
    }
    writeFileSync(path, content);
    created.push(g.id);
  }
}

const L = [];
L.push('# SSOT 커버리지 리포트 (_coverage.md) — 코드→SSOT');
L.push('');
L.push(`- 코드 표면: **${rows.length}** · 항목화됨(covered): **${covered.length}** · 갭(미항목화): **${gaps.length}**`);
if (doScaffold) L.push(`- scaffold 생성: **${created.length}**`);
L.push('');
L.push('## 갭 — 코드에 있으나 SSOT에 항목 없음 (자격 미달)');
L.push('');
if (gaps.length === 0) L.push('_없음 — code-derivable 완전_');
else for (const g of gaps) L.push(`- [${g.kind}] \`${g.id}\` (${g.title})${g.authority === 'mirrored' ? ' [mirrored]' : ''} ← ${g.provenance || g.source}`);
L.push('');
writeFileSync(join(ssotDir, '_coverage.md'), L.join('\n'));

console.log(`coverage: surface=${rows.length} covered=${covered.length} gap=${gaps.length}` + (doScaffold ? ` scaffolded=${created.length}` : ''));
console.log(`  → ${join(ssotDir, '_coverage.md')}`);
