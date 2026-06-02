// src/types.ts
var SSOT_KINDS = [
  "Platform",
  "Persona",
  "Domain",
  "Concept",
  "Capability",
  "SystemComponent",
  "Integration",
  "Invariant",
  "Decision",
  "EngineeringRule"
];
var ID_PREFIX_TO_KIND = {
  platform: "Platform",
  persona: "Persona",
  domain: "Domain",
  concept: "Concept",
  capability: "Capability",
  component: "SystemComponent",
  integration: "Integration",
  invariant: "Invariant",
  decision: "Decision",
  rule: "EngineeringRule"
};
var EDGE_RELS = [
  "realizedBy",
  "servesPersona",
  "governedBy",
  "impacts",
  "governs",
  "dependsOn",
  "decidedBy",
  "relatesTo"
];

// src/yaml.ts
function tokenize(src) {
  const out = [];
  for (const raw of src.split("\n")) {
    const stripped = stripInlineComment(raw);
    if (stripped.trim() === "") continue;
    const indent = stripped.length - stripped.trimStart().length;
    out.push({ indent, text: stripped.trim(), raw });
  }
  return out;
}
function stripInlineComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble) {
      if (i === 0 || line[i - 1] === " " || line[i - 1] === "	") {
        return line.slice(0, i);
      }
    }
  }
  return line;
}
function parseScalar(token) {
  const t = token.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2 || t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1);
  }
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (inner === "") return [];
    return splitFlow(inner).map((p) => parseScalar(p));
  }
  if (t.startsWith("{") && t.endsWith("}")) {
    const inner = t.slice(1, -1).trim();
    if (inner === "") return {};
    const obj = {};
    for (const pair of splitFlow(inner)) {
      const kv = splitKeyValue(pair);
      if (kv) obj[kv.key] = parseScalar(kv.rest);
    }
    return obj;
  }
  if (/^-?\d+$/.test(t) && !/^0\d/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  return t;
}
function splitFlow(inner) {
  const parts = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let cur = "";
  for (const ch of inner) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      if (ch === "[" || ch === "{") depth++;
      else if (ch === "]" || ch === "}") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim() !== "") parts.push(cur.trim());
  return parts;
}
function splitKeyValue(text) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = text[i + 1];
      if (next === void 0 || next === " " || next === "	") {
        return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
      }
    }
  }
  return null;
}
function parseBlockMapping(lines, start, baseIndent) {
  const obj = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) {
      i++;
      continue;
    }
    const kv = splitKeyValue(line.text);
    if (!kv) {
      i++;
      continue;
    }
    const { key, rest } = kv;
    if (rest !== "") {
      obj[key] = parseScalar(rest);
      i++;
      continue;
    }
    const childIndent = i + 1 < lines.length ? lines[i + 1].indent : -1;
    if (childIndent > baseIndent && lines[i + 1].text.startsWith("- ")) {
      const seq = parseBlockSequence(lines, i + 1, childIndent);
      obj[key] = seq.value;
      i = seq.next;
    } else if (childIndent > baseIndent && lines[i + 1].text === "-") {
      const seq = parseBlockSequence(lines, i + 1, childIndent);
      obj[key] = seq.value;
      i = seq.next;
    } else if (childIndent > baseIndent) {
      const nested = parseBlockMapping(lines, i + 1, childIndent);
      obj[key] = nested.value;
      i = nested.next;
    } else {
      obj[key] = null;
      i++;
    }
  }
  return { value: obj, next: i };
}
function parseBlockSequence(lines, start, seqIndent) {
  const arr = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < seqIndent || !line.text.startsWith("-")) break;
    const afterDash = line.text.slice(1).trim();
    const isFlow = afterDash.startsWith("{") || afterDash.startsWith("[");
    const kv = afterDash === "" || isFlow ? null : splitKeyValue(afterDash);
    if (isFlow) {
      arr.push(parseScalar(afterDash));
      i++;
    } else if (kv) {
      const item = {};
      if (kv.rest !== "") item[kv.key] = parseScalar(kv.rest);
      else item[kv.key] = null;
      const itemKeyIndent = seqIndent + (line.text.length - line.text.slice(1).trimStart().length);
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (l.indent <= seqIndent) break;
        if (l.text.startsWith("- ") && l.indent === seqIndent) break;
        const sub = splitKeyValue(l.text);
        if (!sub) {
          i++;
          continue;
        }
        if (sub.rest !== "") {
          item[sub.key] = parseScalar(sub.rest);
          i++;
        } else {
          const childIndent = i + 1 < lines.length ? lines[i + 1].indent : -1;
          if (childIndent > l.indent) {
            const nested = parseBlockMapping(lines, i + 1, childIndent);
            item[sub.key] = nested.value;
            i = nested.next;
          } else {
            item[sub.key] = null;
            i++;
          }
        }
      }
      arr.push(item);
    } else {
      arr.push(parseScalar(afterDash));
      i++;
    }
  }
  return { value: arr, next: i };
}
function parseYaml(src) {
  const lines = tokenize(src);
  if (lines.length === 0) return {};
  const baseIndent = lines[0].indent;
  const { value } = parseBlockMapping(lines, 0, baseIndent);
  return value;
}
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function splitFrontmatter(doc) {
  const m = doc.match(FRONTMATTER_RE);
  if (!m) {
    return { frontmatter: {}, body: doc, hasFrontmatter: false };
  }
  return {
    frontmatter: parseYaml(m[1]),
    body: doc.slice(m[0].length),
    hasFrontmatter: true
  };
}

// src/facet-coerce.ts
function asStringArray(v) {
  if (Array.isArray(v)) {
    return v.filter((x) => typeof x === "string");
  }
  if (typeof v === "string" && v.trim() !== "") return [v];
  return [];
}
function asString(v) {
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}
var CONFIDENCES = ["high", "inferred", "unverified"];
var LIFECYCLES = ["proposed", "active", "deprecated"];
function asConfidence(v) {
  return CONFIDENCES.includes(v) ? v : "unverified";
}
function asLifecycle(v) {
  return LIFECYCLES.includes(v) ? v : "active";
}
function asLastVerified(v) {
  if (typeof v !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  if (v === "0000-00-00") return null;
  return v;
}
var RELATES_TO_KEY = /(?:^|,)\s*to\s*:/;
var RELATES_TYPE_KEY = /,\s*type\s*:/;
var RELATES_NOTE_KEY = /,\s*note\s*:/;
function parseRelatesString(input) {
  let s = input.trim();
  if (s.startsWith("{")) s = s.slice(1);
  if (s.endsWith("}")) s = s.slice(0, -1);
  s = s.trim();
  const toMatch = s.match(RELATES_TO_KEY);
  if (!toMatch || toMatch.index === void 0) return null;
  const afterTo = s.slice(toMatch.index + toMatch[0].length);
  const typeRel = afterTo.search(RELATES_TYPE_KEY);
  if (typeRel === -1) return null;
  const toVal = afterTo.slice(0, typeRel).trim();
  const afterType = afterTo.slice(typeRel).replace(RELATES_TYPE_KEY, "");
  const noteRel = afterType.search(RELATES_NOTE_KEY);
  const typeVal = (noteRel === -1 ? afterType : afterType.slice(0, noteRel)).trim();
  if (toVal === "" || typeVal === "") return null;
  const edge = { to: toVal, type: typeVal };
  if (noteRel !== -1) {
    const noteVal = afterType.slice(noteRel).replace(RELATES_NOTE_KEY, "").trim();
    if (noteVal !== "") edge.note = noteVal;
  }
  return edge;
}
function normalizeRelatesToValue(v, nodeId, errors) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const rec = item;
      const to = asString(rec.to);
      const type = asString(rec.type);
      if (to && type) {
        const edge = { to, type };
        const note = asString(rec.note);
        if (note) edge.note = note;
        out.push(edge);
      } else {
        errors.push({
          kind: "invalidRelatesTo",
          nodeId,
          message: "relatesTo \uAC1D\uCCB4\uC5D0 to/type \uB204\uB77D",
          raw: JSON.stringify(item)
        });
      }
    } else if (typeof item === "string") {
      const parsed = parseRelatesString(item);
      if (parsed) out.push(parsed);
      else {
        errors.push({
          kind: "invalidRelatesTo",
          nodeId,
          message: "relatesTo \uBB38\uC790\uC5F4 \uD30C\uC2F1 \uC2E4\uD328",
          raw: item
        });
      }
    }
  }
  return out;
}

// src/catalog.ts
function asAuthority(v) {
  return v === "mirrored" ? "mirrored" : "authored";
}
function splitEdgeRel(rel) {
  const colon = rel.indexOf(":");
  if (colon === -1) {
    return EDGE_RELS.includes(rel) ? { rel } : null;
  }
  const head = rel.slice(0, colon);
  const tail = rel.slice(colon + 1).trim();
  if (head === "relatesTo") {
    return { rel: "relatesTo", relationType: tail === "" ? void 0 : tail };
  }
  return EDGE_RELS.includes(head) ? { rel: head } : null;
}
var ID_PATTERN = /^(platform|persona|domain|concept|capability|component|integration|invariant|decision|rule)\.[a-z0-9][a-z0-9-]*$/;
function asKind(v, id, errors) {
  if (typeof v === "string" && SSOT_KINDS.includes(v)) {
    return v;
  }
  const prefix = id.split(".", 1)[0];
  const fromPrefix = ID_PREFIX_TO_KIND[prefix];
  if (fromPrefix) {
    return fromPrefix;
  }
  errors.push({
    kind: "unknownKind",
    nodeId: id,
    message: `\uC54C \uC218 \uC5C6\uB294 kind: ${String(v)}`,
    raw: String(v)
  });
  return "Concept";
}
function buildFacets(raw, node, errors) {
  return {
    purpose: {
      purpose: asString(raw.purpose),
      value: asString(raw.value),
      servesPersona: asStringArray(raw.servesPersona)
    },
    semantics: {
      definition: asString(raw.definition),
      relatesTo: normalizeRelatesToValue(raw.relatesTo, node.id, errors),
      governedBy: asStringArray(raw.governedBy),
      governs: asStringArray(raw.governs)
    },
    realization: {
      realizedBy: asStringArray(raw.realizedBy),
      implementedIn: asStringArray(raw.implementedIn).map((rawPath) => ({
        from: node.id,
        raw: rawPath,
        field: "implementedIn"
      })),
      dependsOn: asStringArray(raw.dependsOn),
      consumesApi: asStringArray(raw.consumesApi),
      providesApi: asStringArray(raw.providesApi),
      impacts: asStringArray(raw.impacts),
      integratesWith: asStringArray(raw.integratesWith)
    },
    meta: {
      owner: asString(raw.owner) ?? asString(node.owner) ?? "TBD",
      decidedBy: asStringArray(raw.decidedBy),
      lifecycle: asLifecycle(raw.lifecycle ?? node.lifecycle),
      confidence: asConfidence(raw.confidence ?? node.confidence),
      lastVerified: asLastVerified(raw.lastVerified ?? node.lastVerified)
    }
  };
}
function buildNode(raw, errors) {
  if (!ID_PATTERN.test(raw.id)) {
    errors.push({
      kind: "invalidId",
      nodeId: raw.id,
      message: `id \uD328\uD134 \uC704\uBC18: ${raw.id}`,
      raw: raw.id
    });
  }
  const facetsRaw = raw.facets ?? {};
  const node = {
    id: raw.id,
    kind: asKind(raw.kind ?? facetsRaw.kind, raw.id, errors),
    title: raw.title ?? asString(facetsRaw.title) ?? raw.id,
    file: raw.file,
    authority: asAuthority(facetsRaw.authority),
    facets: buildFacets(facetsRaw, raw, errors),
    openCount: typeof raw.openCount === "number" ? raw.openCount : 0
  };
  const source = asString(facetsRaw.source);
  if (source) node.source = source;
  return node;
}
function normalize(raw) {
  const errors = [];
  const nodes = /* @__PURE__ */ new Map();
  for (const rn of raw.nodes) {
    const node = buildNode(rn, errors);
    nodes.set(node.id, node);
  }
  const edges = [];
  for (const re of raw.edges) {
    const split = splitEdgeRel(re.rel);
    if (!split) {
      errors.push({
        kind: "danglingEdge",
        message: `\uC54C \uC218 \uC5C6\uB294 edge rel: ${re.rel}`,
        raw: `${re.from} -> ${re.to} (${re.rel})`
      });
      continue;
    }
    const edge = { from: re.from, to: re.to, rel: split.rel };
    if (split.relationType !== void 0) edge.relationType = split.relationType;
    edges.push(edge);
    if (!nodes.has(re.from)) {
      errors.push({
        kind: "danglingEdge",
        nodeId: re.from,
        message: `\uC5E3\uC9C0 from \uB178\uB4DC \uBBF8\uC874\uC7AC: ${re.from}`,
        raw: `${re.from} -> ${re.to} (${re.rel})`
      });
    }
    if (!nodes.has(re.to)) {
      errors.push({
        kind: "danglingEdge",
        nodeId: re.to,
        message: `\uC5E3\uC9C0 to \uB178\uB4DC \uBBF8\uC874\uC7AC: ${re.to}`,
        raw: `${re.from} -> ${re.to} (${re.rel})`
      });
    }
  }
  const paths = raw.paths.filter((p) => p.field === "implementedIn").map((p) => ({ from: p.from, raw: p.raw, field: "implementedIn" }));
  return {
    generatedFrom: raw.generatedFrom,
    nodes,
    edges,
    paths,
    parseErrors: errors
  };
}

// src/body.ts
var HEADING_RE = /^(#{1,6})\s+(.*)$/;
var FENCE_RE = /^```(.*)$/;
var CHECK_RE = /^\s*-\s*\[([ xX])\]\s*(.*)$/;
function parseMarkdownBody(markdown) {
  const lines = markdown.split("\n");
  const sections = [];
  const openItems = [];
  let current = { heading: "", level: 0, content: "", codeBlocks: [] };
  const contentLines = [];
  let inFence = false;
  let fenceLang;
  let fenceText = [];
  const flushContent = () => {
    current.content = contentLines.join("\n").trim();
    if (current.heading !== "" || current.content !== "" || current.codeBlocks.length > 0) {
      sections.push(current);
    }
    contentLines.length = 0;
  };
  for (const line of lines) {
    const fence = line.match(FENCE_RE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[1].trim() === "" ? void 0 : fence[1].trim();
        fenceText = [];
      } else {
        inFence = false;
        const block = { text: fenceText.join("\n") };
        if (fenceLang) block.lang = fenceLang;
        current.codeBlocks.push(block);
        contentLines.push(line);
      }
      if (inFence) contentLines.push(line);
      continue;
    }
    if (inFence) {
      fenceText.push(line);
      contentLines.push(line);
      continue;
    }
    const check = line.match(CHECK_RE);
    if (check) {
      openItems.push({ checked: check[1].toLowerCase() === "x", text: check[2].trim() });
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      flushContent();
      current = {
        heading: heading[2].trim(),
        level: heading[1].length,
        content: "",
        codeBlocks: []
      };
      continue;
    }
    contentLines.push(line);
  }
  flushContent();
  return { sections, openItems };
}
function parseNodeBody(doc) {
  const { frontmatter, body } = splitFrontmatter(doc);
  const { sections, openItems } = parseMarkdownBody(body);
  return { frontmatter, markdown: body, sections, openItems };
}
function mergeBodyIntoNode(node, body, errors = []) {
  const fm = body.frontmatter;
  const merged = {
    ...node,
    facets: {
      purpose: { ...node.facets.purpose },
      semantics: { ...node.facets.semantics },
      realization: { ...node.facets.realization },
      meta: { ...node.facets.meta }
    },
    body
  };
  if ("purpose" in fm) merged.facets.purpose.purpose = asString(fm.purpose) ?? merged.facets.purpose.purpose;
  if ("value" in fm) merged.facets.purpose.value = asString(fm.value) ?? merged.facets.purpose.value;
  if ("servesPersona" in fm) merged.facets.purpose.servesPersona = asStringArray(fm.servesPersona);
  if ("definition" in fm) merged.facets.semantics.definition = asString(fm.definition) ?? merged.facets.semantics.definition;
  if ("relatesTo" in fm) merged.facets.semantics.relatesTo = normalizeRelatesToValue(fm.relatesTo, node.id, errors);
  if ("governedBy" in fm) merged.facets.semantics.governedBy = asStringArray(fm.governedBy);
  if ("governs" in fm) merged.facets.semantics.governs = asStringArray(fm.governs);
  if ("realizedBy" in fm) merged.facets.realization.realizedBy = asStringArray(fm.realizedBy);
  if ("dependsOn" in fm) merged.facets.realization.dependsOn = asStringArray(fm.dependsOn);
  if ("consumesApi" in fm) merged.facets.realization.consumesApi = asStringArray(fm.consumesApi);
  if ("providesApi" in fm) merged.facets.realization.providesApi = asStringArray(fm.providesApi);
  if ("impacts" in fm) merged.facets.realization.impacts = asStringArray(fm.impacts);
  if ("integratesWith" in fm) merged.facets.realization.integratesWith = asStringArray(fm.integratesWith);
  if ("implementedIn" in fm) {
    merged.facets.realization.implementedIn = asStringArray(fm.implementedIn).map((raw) => ({
      from: node.id,
      raw,
      field: "implementedIn"
    }));
  }
  if ("owner" in fm) merged.facets.meta.owner = asString(fm.owner) ?? merged.facets.meta.owner;
  if ("decidedBy" in fm) merged.facets.meta.decidedBy = asStringArray(fm.decidedBy);
  if ("lifecycle" in fm) merged.facets.meta.lifecycle = asLifecycle(fm.lifecycle);
  if ("confidence" in fm) merged.facets.meta.confidence = asConfidence(fm.confidence);
  if ("lastVerified" in fm) merged.facets.meta.lastVerified = asLastVerified(fm.lastVerified);
  if ("authority" in fm) merged.authority = fm.authority === "mirrored" ? "mirrored" : "authored";
  if ("source" in fm) {
    const src = asString(fm.source);
    if (src) merged.source = src;
  }
  merged.openCount = body.openItems.filter((o) => !o.checked).length;
  return merged;
}

// src/loader.ts
var DefaultCatalogLoader = class {
  constructor(fetchRaw) {
    this.fetchRaw = fetchRaw;
  }
  loadCatalog() {
    return this.fetchRaw();
  }
  normalize(raw) {
    return normalize(raw);
  }
};
async function loadBody(loader, node) {
  const markdown = await loader.fetchMarkdown(node);
  const body = parseNodeBody(markdown);
  const errors = [];
  const merged = mergeBodyIntoNode(node, body, errors);
  return { body, node: merged, errors };
}
async function hydrateNodeBody(graph, loader, nodeId) {
  const node = graph.nodes.get(nodeId);
  if (!node) return void 0;
  const { node: merged, errors } = await loadBody(loader, node);
  graph.nodes.set(nodeId, merged);
  if (errors.length > 0) graph.parseErrors.push(...errors);
  return merged;
}

// src/traversal.ts
function matches(edge, filter) {
  if (!filter) return true;
  if (filter.rel !== void 0 && edge.rel !== filter.rel) return false;
  if (filter.relationType !== void 0 && edge.relationType !== filter.relationType) return false;
  return true;
}
function outgoingEdges(graph, id, filter) {
  return graph.edges.filter((e) => e.from === id && matches(e, filter));
}
function incomingEdges(graph, id, filter) {
  return graph.edges.filter((e) => e.to === id && matches(e, filter));
}
function neighbors(graph, id, filter) {
  return unique(outgoingEdges(graph, id, filter).map((e) => e.to));
}
function reverseNeighbors(graph, id, filter) {
  return unique(incomingEdges(graph, id, filter).map((e) => e.from));
}
function unique(xs) {
  return [...new Set(xs)];
}
function buildAdjacencyIndex(graph) {
  const out = /* @__PURE__ */ new Map();
  const inIdx = /* @__PURE__ */ new Map();
  for (const edge of graph.edges) {
    push(out, edge.from, edge);
    push(inIdx, edge.to, edge);
  }
  return { out, in: inIdx };
}
function push(map, key, edge) {
  const arr = map.get(key);
  if (arr) arr.push(edge);
  else map.set(key, [edge]);
}
function inducedSubgraph(graph, nodeIds) {
  const set = new Set(nodeIds);
  const edges = graph.edges.filter((e) => set.has(e.from) && set.has(e.to));
  return { nodeIds: set, edges };
}
function reachable(graph, startId, options = {}, index) {
  const { filter, maxDepth = Infinity, reverse = false } = options;
  const idx = index ?? buildAdjacencyIndex(graph);
  const visited = /* @__PURE__ */ new Set([startId]);
  const result = /* @__PURE__ */ new Set();
  let frontier = [startId];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next = [];
    for (const id of frontier) {
      const edges = (reverse ? idx.in.get(id) : idx.out.get(id)) ?? [];
      for (const edge of edges) {
        if (filter && !matches(edge, filter)) continue;
        const target = reverse ? edge.from : edge.to;
        if (visited.has(target)) continue;
        visited.add(target);
        result.add(target);
        next.push(target);
      }
    }
    frontier = next;
    depth++;
  }
  return result;
}
function getNode(graph, id) {
  return graph.nodes.get(id);
}

// src/structure.ts
var DEFAULT_THRESHOLDS = {
  treeContainmentRatio: 0.8,
  tableKindHomogeneity: 0.9,
  tableFacetUniformity: 0.7,
  tableMaxEdgeDensity: 0.2
};
var CONTAINMENT_RELS = /* @__PURE__ */ new Set([
  "realizedBy",
  "servesPersona",
  "governs",
  "owns",
  "contains"
]);
var CONTAINMENT_RELATION_TYPES = /* @__PURE__ */ new Set(["owns", "contains", "has", "includes"]);
var SYMMETRIC_RELS = /* @__PURE__ */ new Set(["impacts", "dependsOn"]);
function isContainmentEdge(e) {
  if (e.rel === "relatesTo") {
    return e.relationType !== void 0 && CONTAINMENT_RELATION_TYPES.has(e.relationType);
  }
  return CONTAINMENT_RELS.has(e.rel);
}
function isSymmetricEdge(e) {
  if (SYMMETRIC_RELS.has(e.rel)) return true;
  if (e.rel === "relatesTo") {
    return !(e.relationType !== void 0 && CONTAINMENT_RELATION_TYPES.has(e.relationType));
  }
  return false;
}
var STATE_ENUM_RE = /\b[A-Z][A-Z0-9_]{1,}(?:\s*\|\s*[A-Z][A-Z0-9_]{1,}){1,}/;
var TRANSITION_RE = /\S\s*(?:→|->|=>)\s*\S/;
var STATE_CONTEXT_RE = /(status|state|상태|생명주기|lifecycle)/i;
function detectStateSignals(markdown) {
  const hasEnumRaw = STATE_ENUM_RE.test(markdown);
  const hasStateEnum = hasEnumRaw && (STATE_CONTEXT_RE.test(markdown) || hasEnumRaw);
  const hasTransitionProse = TRANSITION_RE.test(markdown);
  return { hasStateEnum, hasTransitionProse };
}
function facetKeySet(node) {
  const keys = [];
  const f = node.facets;
  if (f.purpose.purpose) keys.push("purpose");
  if (f.purpose.value) keys.push("value");
  if (f.purpose.servesPersona.length) keys.push("servesPersona");
  if (f.semantics.definition) keys.push("definition");
  if (f.semantics.relatesTo.length) keys.push("relatesTo");
  if (f.semantics.governedBy.length) keys.push("governedBy");
  if (f.semantics.governs.length) keys.push("governs");
  if (f.realization.realizedBy.length) keys.push("realizedBy");
  if (f.realization.implementedIn.length) keys.push("implementedIn");
  if (f.realization.dependsOn.length) keys.push("dependsOn");
  if (f.realization.consumesApi.length) keys.push("consumesApi");
  if (f.realization.providesApi.length) keys.push("providesApi");
  if (f.realization.impacts.length) keys.push("impacts");
  if (f.realization.integratesWith.length) keys.push("integratesWith");
  if (f.meta.decidedBy.length) keys.push("decidedBy");
  return keys.sort().join(",");
}
function computeSignals(nodes, edges) {
  const size = nodes.length;
  if (size === 0) {
    return {
      size: 0,
      edgeDensity: 0,
      containmentRatio: 0,
      symmetricRels: 0,
      kindHomogeneity: 0,
      facetUniformity: 0,
      hasStateEnum: false,
      hasTransitionProse: false
    };
  }
  const containment = edges.filter(isContainmentEdge).length;
  const symmetric = edges.filter(isSymmetricEdge).length;
  const containmentRatio = edges.length === 0 ? 0 : containment / edges.length;
  const kindCount = /* @__PURE__ */ new Map();
  for (const n of nodes) kindCount.set(n.kind, (kindCount.get(n.kind) ?? 0) + 1);
  const maxKind = Math.max(...kindCount.values());
  const kindHomogeneity = maxKind / size;
  const facetCount = /* @__PURE__ */ new Map();
  for (const n of nodes) {
    const key = facetKeySet(n);
    facetCount.set(key, (facetCount.get(key) ?? 0) + 1);
  }
  const maxFacet = Math.max(...facetCount.values());
  const facetUniformity = maxFacet / size;
  let hasStateEnum = false;
  let hasTransitionProse = false;
  for (const n of nodes) {
    if (n.body) {
      const sig = detectStateSignals(n.body.markdown);
      if (sig.hasStateEnum) hasStateEnum = true;
      if (sig.hasTransitionProse) hasTransitionProse = true;
    }
  }
  return {
    size,
    edgeDensity: edges.length / size,
    containmentRatio,
    symmetricRels: symmetric,
    kindHomogeneity,
    facetUniformity,
    hasStateEnum,
    hasTransitionProse
  };
}
function isTreeShaped(nodeIds, edges) {
  const hierEdges = edges.filter(isContainmentEdge);
  if (hierEdges.length === 0) return false;
  const indeg = /* @__PURE__ */ new Map();
  const adj = /* @__PURE__ */ new Map();
  for (const id of nodeIds) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of hierEdges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)?.push(e.to);
  }
  for (const d of indeg.values()) {
    if (d > 1) return false;
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = /* @__PURE__ */ new Map();
  for (const id of nodeIds) color.set(id, WHITE);
  const hasCycle = (u) => {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) return true;
      if (c === WHITE && hasCycle(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  };
  for (const id of nodeIds) {
    if (color.get(id) === WHITE && hasCycle(id)) return false;
  }
  return true;
}
function classifyStructure(signals, nodeIds, edges, thresholds = DEFAULT_THRESHOLDS) {
  if (signals.hasStateEnum && signals.hasTransitionProse) {
    return {
      kind: "stateMachine",
      reason: "\uBCF8\uBB38\uC5D0 \uC0C1\uD0DC enum + \uC804\uC774 \uC11C\uC220 \uB3D9\uC2DC \uC874\uC7AC"
    };
  }
  if (signals.containmentRatio >= thresholds.treeContainmentRatio && isTreeShaped(nodeIds, edges)) {
    return {
      kind: "tree",
      reason: `\uACC4\uCE35 \uAD00\uACC4 \uC9C0\uBC30(containmentRatio=${signals.containmentRatio.toFixed(2)}) + \uB2E8\uC77C\uB8E8\uD2B8 acyclic`
    };
  }
  if (signals.kindHomogeneity >= thresholds.tableKindHomogeneity && signals.facetUniformity >= thresholds.tableFacetUniformity && signals.edgeDensity < thresholds.tableMaxEdgeDensity) {
    return {
      kind: "table",
      reason: `\uADE0\uC9C8 \uC9D1\uD569(kindHomogeneity=${signals.kindHomogeneity.toFixed(2)}, facetUniformity=${signals.facetUniformity.toFixed(2)}) + \uB0AE\uC740 edgeDensity(${signals.edgeDensity.toFixed(2)})`
    };
  }
  return {
    kind: "graph",
    reason: signals.symmetricRels > 0 ? `\uBE44\uACC4\uCE35 \uAD00\uACC4(symmetricRels=${signals.symmetricRels}) \uC874\uC7AC \u2192 \uADF8\uB798\uD504` : "\uD63C\uD569 kind / \uAD00\uACC4\uC5E3\uC9C0 \uC911\uC2EC \u2192 \uADF8\uB798\uD504(fallback)"
  };
}
function classify(input, thresholds = DEFAULT_THRESHOLDS) {
  const signals = computeSignals(input.nodes, input.edges);
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  const { kind, reason } = classifyStructure(signals, nodeIds, input.edges, thresholds);
  return { kind, signals, reason };
}
export {
  DEFAULT_THRESHOLDS,
  DefaultCatalogLoader,
  EDGE_RELS,
  ID_PREFIX_TO_KIND,
  SSOT_KINDS,
  asConfidence,
  asLastVerified,
  asLifecycle,
  asString,
  asStringArray,
  buildAdjacencyIndex,
  classify,
  classifyStructure,
  computeSignals,
  detectStateSignals,
  getNode,
  hydrateNodeBody,
  incomingEdges,
  inducedSubgraph,
  isTreeShaped,
  loadBody,
  mergeBodyIntoNode,
  neighbors,
  normalize,
  normalizeRelatesToValue,
  outgoingEdges,
  parseMarkdownBody,
  parseNodeBody,
  parseRelatesString,
  parseYaml,
  reachable,
  reverseNeighbors,
  splitEdgeRel,
  splitFrontmatter
};
