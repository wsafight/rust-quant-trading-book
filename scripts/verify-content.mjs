import fs from 'node:fs';
import path from 'node:path';

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

const curSrc = fs.readFileSync('src/data/curriculum.ts', 'utf8');
const rustCurSrc = fs.readFileSync('src/data/rustCurriculum.ts', 'utf8');
const glossarySrc = fs.readFileSync('src/data/glossary.ts', 'utf8');

// 1. Verify slug sets match between curriculum files and MDX directories
const curSlugs = [...curSrc.matchAll(/\bslug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
const rustCurSlugs = [...rustCurSrc.matchAll(/\bslug:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();

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
function checkMetadataSync(sourceText, mdxDir, linkKey, targetSet) {
  const blocks = [...sourceText.matchAll(/\{[^{}]*slug:\s*['"]([^'"]+)['"][^{}]*\}/g)];
  for (const match of blocks) {
    const slug = match[1];
    const block = match[0];
    const dataTitle = (block.match(/title:\s*['"]([^'"]+)['"]/) || [])[1];
    const dataMin = (block.match(/readMinutes:\s*(\d+)/) || [])[1];
    const dataLink = (block.match(new RegExp(`${linkKey}:\\s*['"]([^'"]+)['"]`)) || [])[1];

    if (dataLink && !targetSet.includes(dataLink)) {
      errors.push(`Invalid ${linkKey}="${dataLink}" referenced by ${slug}`);
    }

    const mdxPath = path.join(mdxDir, `${slug}.mdx`);
    if (!fs.existsSync(mdxPath)) continue;
    const fm = fs.readFileSync(mdxPath, 'utf8').split('---')[1] || '';
    const fmTitle = (fm.match(/^title:\s*["']?(.+?)["']?\s*$/m) || [])[1];
    const fmMin = (fm.match(/^readMinutes:\s*(\d+)/m) || [])[1];
    const fmLink = (fm.match(new RegExp(`^${linkKey}:\\s*["']?(.+?)["']?\\s*$`, 'm')) || [])[1];

    if (dataTitle !== fmTitle) {
      errors.push(`Title mismatch for ${slug}: data="${dataTitle}" vs mdx="${fmTitle}"`);
    }
    if (dataMin !== fmMin) {
      errors.push(`readMinutes mismatch for ${slug}: data=${dataMin} vs mdx=${fmMin}`);
    }
    if ((dataLink || '') !== (fmLink || '')) {
      errors.push(`${linkKey} mismatch for ${slug}: data="${dataLink || ''}" vs mdx="${fmLink || ''}"`);
    }
  }
}

checkMetadataSync(curSrc, 'src/content/lessons', 'rustChapterSlug', rustFiles);
checkMetadataSync(rustCurSrc, 'src/content/rust-chapters', 'quantLessonSlug', lessonFiles);

// 3. Verify every <Term id="..."> exists in glossary.ts
const glossaryIds = new Set([...glossarySrc.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
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
