#!/usr/bin/env node
// build-graph.mjs — SSOT .md frontmatter 파싱 → _catalog.json. @ssot-studio/core(vendor) 재사용.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../../../vendor/core.mjs';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const SCHEMA_PATH = join(SCRIPT_DIR, '..', 'reference', 'schema', 'ssot-v1.schema.json');

const ssotDir = process.argv[2];
if (!ssotDir) { console.error('usage: node build-graph.mjs <ssotDir>'); process.exit(2); }
if (!existsSync(ssotDir)) { console.error(`not found: ${ssotDir}`); process.exit(2); }

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const REF = schema['x-id-reference-fields'];
const ID_LIST_FIELDS = REF.idList;
const OBJ_LIST_FIELDS = REF.objectList;
const PATH_LIST_FIELDS = REF.pathList;

function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collect(full, acc);
    else if (name.endsWith('.md') && name.toLowerCase() !== 'readme.md') acc.push(full);
  }
  return acc;
}

const files = collect(ssotDir);
const nodes = [], edges = [], paths = [], parseErrors = [];

for (const file of files) {
  const rel = relative(ssotDir, file);
  const content = readFileSync(file, 'utf8');
  const { frontmatter: fm, body, hasFrontmatter } = splitFrontmatter(content);
  if (!hasFrontmatter) { parseErrors.push({ file: rel, reason: 'frontmatter 없음/형식 오류' }); continue; }
  const openItems = (body.match(/^\s*-\s*\[\s*\]\s*OPEN:/gim) || []).length;
  const sections = (body.match(/^##[^#].*$/gm) || []).map(h => h.replace(/^##\s*/, '').trim());

  nodes.push({
    id: fm.id, kind: fm.kind, title: fm.title, file: rel,
    confidence: fm.confidence || '', owner: fm.owner || '',
    lifecycle: fm.lifecycle || '', lastVerified: fm.lastVerified || '',
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    introducedIn: fm.introducedIn || '', targetVersion: fm.targetVersion || '',
    openCount: openItems, sections, facets: fm,
  });

  for (const f of ID_LIST_FIELDS) {
    const v = fm[f];
    if (Array.isArray(v)) for (const to of v) if (to) edges.push({ from: fm.id, to: String(to), rel: f });
  }
  for (const f of OBJ_LIST_FIELDS) {
    const v = fm[f];
    if (Array.isArray(v)) for (const o of v) {
      if (o && typeof o === 'object' && o.to) edges.push({ from: fm.id, to: String(o.to), rel: `${f}:${o.type || '?'}` });
    }
  }
  for (const f of PATH_LIST_FIELDS) {
    const v = fm[f];
    if (Array.isArray(v)) for (const p of v) if (p) paths.push({ from: fm.id, field: f, raw: String(p) });
  }
}

const catalog = { generatedFrom: ssotDir, nodeCount: nodes.length, edgeCount: edges.length, nodes, edges, paths, parseErrors };
const outPath = join(ssotDir, '_catalog.json');
writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`catalog: ${nodes.length} nodes, ${edges.length} edges, ${paths.length} code-links → ${relative(process.cwd(), outPath)}`);
if (parseErrors.length) console.log(`  ⚠ ${parseErrors.length} parse error(s)`);
