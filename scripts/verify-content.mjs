import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { parse } from 'yaml';

const errors = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const srcFiles = walk('src');
const lessonFiles = fs
  .readdirSync('src/content/lessons')
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''))
  .sort();
const rustFiles = fs
  .readdirSync('src/content/rust-chapters')
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''))
  .sort();

async function loadData(file) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { CURRICULUM } = await loadData('src/data/curriculum.ts');
const { RUST_CURRICULUM } = await loadData('src/data/rustCurriculum.ts');
const { GLOSSARY } = await loadData('src/data/glossary.ts');

// 1. Verify slug sets match between curriculum files and MDX directories
const curSlugs = CURRICULUM.map((entry) => entry.slug).sort();
const rustCurSlugs = RUST_CURRICULUM.map((entry) => entry.slug).sort();
for (const [name, slugs] of [['curriculum', curSlugs], ['rustCurriculum', rustCurSlugs]]) {
  if (new Set(slugs).size !== slugs.length) errors.push(`Duplicate slug in ${name}`);
}

for (const slug of lessonFiles) {
  if (!curSlugs.includes(slug)) errors.push(`Lesson MDX missing from curriculum.ts: ${slug}`);
}
for (const slug of curSlugs) {
  if (!lessonFiles.includes(slug)) errors.push(`curriculum.ts slug missing MDX file: ${slug}`);
}
for (const slug of rustFiles) {
  if (!rustCurSlugs.includes(slug)) errors.push(`Rust chapter MDX missing from rustCurriculum.ts: ${slug}`);
}
for (const slug of rustCurSlugs) {
  if (!rustFiles.includes(slug)) errors.push(`rustCurriculum.ts slug missing MDX file: ${slug}`);
}

// 2. Verify cross-book links and metadata sync between curriculum data and MDX frontmatter
function checkMetadataSync(entries, mdxDir, linkKey, targetSet) {
  for (const entry of entries) {
    const { slug } = entry;
    const dataLink = entry[linkKey];

    if (dataLink && !targetSet.includes(dataLink)) {
      errors.push(`Invalid ${linkKey}="${dataLink}" referenced by ${slug}`);
    }

    const mdxPath = path.join(mdxDir, `${slug}.mdx`);
    if (!fs.existsSync(mdxPath)) continue;
    const frontmatter = fs.readFileSync(mdxPath, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!frontmatter) {
      errors.push(`Missing frontmatter: ${mdxPath}`);
      continue;
    }
    let metadata;
    try {
      metadata = parse(frontmatter[1]);
    } catch (error) {
      errors.push(`Invalid YAML in ${mdxPath}: ${error.message}`);
      continue;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (['slug', 'quantCore', 'status'].includes(key)) continue;
      if (!isDeepStrictEqual(value, metadata?.[key])) {
        errors.push(`${key} mismatch for ${slug}: data=${JSON.stringify(value)} vs mdx=${JSON.stringify(metadata?.[key])}`);
      }
    }
    if ((dataLink || '') !== (metadata?.[linkKey] || '')) {
      errors.push(`${linkKey} mismatch for ${slug}`);
    }
  }
}

checkMetadataSync(CURRICULUM, 'src/content/lessons', 'rustChapterSlug', rustFiles);
checkMetadataSync(RUST_CURRICULUM, 'src/content/rust-chapters', 'quantLessonSlug', lessonFiles);

// 3. Verify every <Term id="..."> exists in glossary.ts
const glossaryIds = new Set(GLOSSARY.map((entry) => entry.id));
if (glossaryIds.size !== GLOSSARY.length) errors.push('Duplicate glossary term id');
for (const entry of GLOSSARY) {
  if (entry.lessonSlug && !curSlugs.includes(entry.lessonSlug)) {
    errors.push(`Invalid lessonSlug="${entry.lessonSlug}" in glossary term ${entry.id}`);
  }
}
for (const f of srcFiles.filter((p) => p.endsWith('.mdx'))) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/<Term\b[^>]*\bid=["']([^"']+)["']/g)) {
    if (!glossaryIds.has(m[1])) {
      errors.push(`Unknown glossary term id="${m[1]}" in ${f}`);
    }
  }
}

// 4. Verify code/ file references exist on disk
for (const f of srcFiles.filter((p) => /\.(mdx|ts|tsx|astro)$/.test(p))) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/\b(code\/[a-zA-Z0-9_/.-]+\.(rs|toml|json|jsonl|md))\b/g)) {
    if (!fs.existsSync(m[1])) {
      errors.push(`Missing companion file reference "${m[1]}" in ${f}`);
    }
  }
}

// 5. Disallow hardcoded root-relative internal links that break under SITE_BASE
for (const f of srcFiles.filter((p) => /\.(mdx|ts|tsx|astro)$/.test(p))) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (/(\]\(\/(lessons|rust)|href=["']\/(lessons|rust|favicon)|window\.location\.href\s*=\s*["']\/)/.test(line)) {
      if (!line.includes('withBase') && !line.includes('normalizedBase')) {
        errors.push(`Hardcoded root-relative URL at ${f}:${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

// 6. Verify every interactive lab registers a unique non-empty markLabComplete ID
const labFiles = fs
  .readdirSync('src/components/labs')
  .filter((f) => f.endsWith('.tsx'))
  .sort();
const labIdToFile = new Map();
for (const file of labFiles) {
  const full = path.join('src/components/labs', file);
  const txt = fs.readFileSync(full, 'utf8');
  const ids = new Set([...txt.matchAll(/markLabComplete\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]));
  if (ids.size === 0) {
    errors.push(`Lab component missing markLabComplete("<id>") call: ${full}`);
  }
  for (const id of ids) {
    if (labIdToFile.has(id)) {
      errors.push(`Duplicate lab completion id "${id}" in ${full} and ${labIdToFile.get(id)}`);
    } else {
      labIdToFile.set(id, full);
    }
  }
}
if (labFiles.length !== lessonFiles.length) {
  errors.push(`Lab count (${labFiles.length}) does not match lesson count (${lessonFiles.length})`);
}

if (errors.length > 0) {
  console.error(`Content verification failed with ${errors.length} error(s):`);
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log(
  `Content verification passed: ${lessonFiles.length} lessons, ${labFiles.length} labs, ${rustFiles.length} Rust chapters, ${glossaryIds.size} glossary terms.`,
);
