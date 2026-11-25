export interface CodeAnnotation {
  id: string;
  /** Exact substring to highlight inside the code */
  match: string;
  /** Short badge label, e.g. "BTreeMap" */
  label: string;
  /** Plain-language explanation of what this Rust syntax means */
  plain: string;
  /** What trading bug or pitfall this Rust construct prevents */
  guard: string;
  /** Whether this is the concept's first appearance in the curriculum */
  firstAppearance?: boolean;
}

export interface TokenSegment {
  text: string;
  annotation?: CodeAnnotation;
}

const IDENT_CHAR = /[A-Za-z0-9_]/;

function splitWithBoundaries(text: string, needle: string): Array<{ text: string; matched: boolean }> {
  if (!needle) return [{ text, matched: false }];
  const checkStart = IDENT_CHAR.test(needle[0]);
  const checkEnd = IDENT_CHAR.test(needle[needle.length - 1]);
  const out: Array<{ text: string; matched: boolean }> = [];
  let cursor = 0;
  let searchFrom = 0;

  while (searchFrom <= text.length - needle.length) {
    const idx = text.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const beforeOk = !checkStart || idx === 0 || !IDENT_CHAR.test(text[idx - 1]);
    const afterIdx = idx + needle.length;
    const afterOk = !checkEnd || afterIdx === text.length || !IDENT_CHAR.test(text[afterIdx]);
    if (beforeOk && afterOk) {
      if (idx > cursor) out.push({ text: text.slice(cursor, idx), matched: false });
      out.push({ text: needle, matched: true });
      cursor = afterIdx;
      searchFrom = afterIdx;
    } else {
      searchFrom = idx + 1;
    }
  }

  if (cursor < text.length) out.push({ text: text.slice(cursor), matched: false });
  return out.length > 0 ? out : [{ text, matched: false }];
}

export function tokenizeLine(line: string, annotations: CodeAnnotation[]): TokenSegment[] {
  let segments: TokenSegment[] = [{ text: line }];
  const sorted = [...annotations].sort((a, b) => b.match.length - a.match.length);

  for (const ann of sorted) {
    if (!ann.match) continue;
    const nextSegments: TokenSegment[] = [];
    for (const seg of segments) {
      if (seg.annotation) {
        nextSegments.push(seg);
        continue;
      }
      for (const piece of splitWithBoundaries(seg.text, ann.match)) {
        nextSegments.push(piece.matched ? { text: piece.text, annotation: ann } : { text: piece.text });
      }
    }
    segments = nextSegments;
  }

  return segments;
}
