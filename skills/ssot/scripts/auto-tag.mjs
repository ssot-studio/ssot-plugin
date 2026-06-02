#!/usr/bin/env node
// auto-tag.mjs — SSOT 노드 frontmatter 의 tags[] 에 통제 어휘 태그를 자동 부여한다.
// core(vendor) 파서로 노드를 읽고, 아래 결정적 규칙으로만 태그를 파생한다(추론 남발 금지).
// 기존 tags 는 보존하고 합집합으로 병합(중복 제거). tags 키가 없으면 추가한다.
//
// 파생 규칙:
//   type:{kind 소문자}            — 모든 노드. 예: Endpoint → type:endpoint, Screen → type:screen.
//   status:{lifecycle}            — lifecycle 값이 있을 때만(planned/active/deprecated). 없으면 생략.
//   domain:{slug}                 — (a) domains/ 의 노드면 자기 자신 slug.
//                                   (b) 그 외 노드는 id-참조 엣지(realizedBy/dependsOn/impacts/
//                                       servesPersona/governedBy/governs/decidedBy)와 relatesTo[].to
//                                       의 타깃 중 domain.* 가 있으면 그 slug. 없으면 생략.
//
// 사용: node auto-tag.mjs <ssotDir> [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitFrontmatter } from '../../../vendor/core.mjs';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const SCHEMA_PATH = join(SCRIPT_DIR, '..', 'reference', 'schema', 'ssot-v1.schema.json');

const argv = process.argv.slice(2);
const ssotDir = argv.find((a) => !a.startsWith('--'));
const DRY = argv.includes('--dry');
if (!ssotDir) { console.error('usage: node auto-tag.mjs <ssotDir> [--dry]'); process.exit(2); }
if (!existsSync(ssotDir)) { console.error(`not found: ${ssotDir}`); process.exit(2); }

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
// id-참조 idList 필드(값이 대상 id) — 도메인 소속 판정에 사용.
const ID_LIST_FIELDS = schema['x-id-reference-fields'].idList;
// tags 항목 형식 검증(스키마와 동일): namespace:value, 소문자 kebab.
const TAG_PATTERN = new RegExp(schema.properties.tags.items.pattern);

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

// id 의 slug 부분(prefix 뒤). 예: domain.rag-manager → rag-manager.
function slugOf(id) {
  const i = String(id).indexOf('.');
  return i === -1 ? '' : String(id).slice(i + 1);
}

// frontmatter 에서 domain.* 타깃 slug 집합을 수집(자기 자신이 domain 이면 자기 slug).
function deriveDomains(fm) {
  const out = new Set();
  if (typeof fm.id === 'string' && fm.id.startsWith('domain.')) {
    out.add(slugOf(fm.id));
    return out; // domain 노드는 자기 자신만.
  }
  const consider = (target) => {
    if (typeof target === 'string' && target.startsWith('domain.')) out.add(slugOf(target));
  };
  for (const f of ID_LIST_FIELDS) {
    const v = fm[f];
    if (Array.isArray(v)) for (const t of v) consider(t);
  }
  const rel = fm.relatesTo;
  if (Array.isArray(rel)) for (const o of rel) {
    if (o && typeof o === 'object' && o.to) consider(o.to);
  }
  return out;
}

// 한 노드의 파생 태그 목록(중복 제거 전 raw).
function deriveTags(fm) {
  const tags = [];
  if (typeof fm.kind === 'string' && fm.kind.trim()) tags.push(`type:${fm.kind.trim().toLowerCase()}`);
  if (typeof fm.lifecycle === 'string' && fm.lifecycle.trim()) tags.push(`status:${fm.lifecycle.trim()}`);
  for (const d of deriveDomains(fm)) if (d) tags.push(`domain:${d}`);
  return tags;
}

// frontmatter 블록의 raw 텍스트(--- ... ---)를 추출. core 의 FRONTMATTER_RE 와 동일 의미.
const FM_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;

// tags 줄을 block-list 형식으로 직렬화. 결정적 정렬(namespace 그룹 → 알파벳).
function serializeTags(tags) {
  const sorted = [...tags].sort();
  return 'tags:\n' + sorted.map((t) => `  - ${t}`).join('\n');
}

// frontmatter raw 에서 기존 tags 블록을 제거하고, 새 tags 블록을 끝에 덧붙인다.
// core 파서가 이미 tags 값을 파싱해 주므로, 텍스트 치환은 "tags: 줄 + 하위 리스트/플로우" 만 정확히 들어내면 된다.
function rewriteFrontmatter(fmRaw, mergedTags) {
  const lines = fmRaw.split('\n');
  const kept = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // top-level 'tags:' 키(들여쓰기 0) 시작 감지.
    if (/^tags\s*:/.test(line)) {
      // 인라인 플로우(tags: [..]) 면 그 한 줄만 스킵.
      const after = line.slice(line.indexOf(':') + 1).trim();
      i++;
      if (after === '' ) {
        // 블록 리스트: 들여쓰기된 '- ' 항목들을 스킵.
        while (i < lines.length && /^\s+-\s/.test(lines[i])) i++;
      }
      continue;
    }
    kept.push(line);
    i++;
  }
  // 후행 빈 줄 정리.
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  kept.push(serializeTags(mergedTags));
  return kept.join('\n');
}

const files = collect(ssotDir);
const nsCount = { type: 0, status: 0, domain: 0 };
let changed = 0, skippedNoFm = 0, totalNodes = 0;
const badProduced = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const { frontmatter: fm, hasFrontmatter } = splitFrontmatter(content);
  if (!hasFrontmatter) { skippedNoFm++; continue; }
  totalNodes++;

  const derived = deriveTags(fm);
  const existing = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
  // 합집합 + 중복 제거.
  const merged = [...new Set([...existing, ...derived])];

  // 형식 검증(자체 점검) — 파생 태그가 통제 형식을 어기지 않는지.
  for (const t of derived) if (!TAG_PATTERN.test(t)) badProduced.push({ file: relative(ssotDir, file), tag: t });

  // 네임스페이스별 "노드 수" 카운트(노드가 해당 ns 태그를 1개라도 가지면 +1).
  const hasNs = (ns) => merged.some((t) => t.startsWith(ns + ':'));
  if (hasNs('type')) nsCount.type++;
  if (hasNs('status')) nsCount.status++;
  if (hasNs('domain')) nsCount.domain++;

  // 변경 없으면 파일 건드리지 않음.
  const sameAsExisting = merged.length === existing.length && merged.every((t) => existing.includes(t));
  if (sameAsExisting) continue;

  const m = content.match(FM_RE);
  if (!m) { continue; }
  const newFmInner = rewriteFrontmatter(m[2], merged);
  const newContent = content.replace(FM_RE, `${m[1]}${newFmInner}${m[3]}`);
  if (!DRY) writeFileSync(file, newContent);
  changed++;
}

console.log(`auto-tag: nodes=${totalNodes} changed=${changed}${DRY ? ' (dry-run)' : ''} skippedNoFm=${skippedNoFm}`);
console.log(`  네임스페이스별 노드수: type=${nsCount.type} status=${nsCount.status} domain=${nsCount.domain}`);
if (badProduced.length) {
  console.log(`  ⚠ 형식 위반 파생 태그 ${badProduced.length}건:`);
  for (const b of badProduced.slice(0, 20)) console.log(`    ${b.file}: ${b.tag}`);
}
