import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { loadProgress, markRustConceptExplored, PROGRESS_EVENT } from '../../lib/progress';

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

interface AnnotatedCodeProps {
  title: string;
  filePath?: string;
  code: string;
  annotations: CodeAnnotation[];
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

export default function AnnotatedCode({
  title,
  filePath,
  code,
  annotations,
}: AnnotatedCodeProps) {
  const [activeId, setActiveId] = useState<string | null>(annotations[0]?.id ?? null);
  const [explored, setExplored] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => setExplored(loadProgress().exploredRustConcepts);
    sync();
    window.addEventListener(PROGRESS_EVENT, sync);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, sync);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleSelect = (ann: CodeAnnotation) => {
    setActiveId(ann.id);
    markRustConceptExplored(ann.id);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code.trimEnd());
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1600);
    } catch {
      // Ignore clipboard errors in restricted environments
    }
  };

  const activeAnn = annotations.find((a) => a.id === activeId) ?? null;
  const tokenizedLines = useMemo(
    () => code.trimEnd().split('\n').map((line) => tokenizeLine(line, annotations)),
    [code, annotations],
  );

  return (
    <div className="my-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1621] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/80">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-5 items-center rounded bg-amber-500/15 px-1.5 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-500/25">
            Rust 干中学
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filePath && (
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              {filePath}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-300 transition-colors cursor-pointer"
          >
            {copied ? '已复制 ✓' : '复制代码'}
          </button>
        </div>
      </div>

      {/* Quick Concept Chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/70 dark:bg-slate-900/40">
        <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">
          点击高亮语法点读：
        </span>
        {annotations.map((ann) => {
          const isSelected = ann.id === activeId;
          const isSeen = explored.includes(ann.id);
          return (
            <button
              key={ann.id}
              type="button"
              onClick={() => handleSelect(ann)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11.5px] transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold shadow-xs'
                  : isSeen
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25 hover:border-emerald-500/60'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25 hover:border-amber-500/60'
              }`}
            >
              <span>{ann.label}</span>
              {isSeen && !isSelected && <span className="text-[10px]">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Code Area */}
      <div className="overflow-x-auto bg-[#0d1117] text-slate-200 p-4 font-mono text-[13px] leading-[1.7]">
        {tokenizedLines.map((segments, idx) => {
          return (
            <div key={idx} className="flex">
              <span className="select-none w-8 shrink-0 text-right pr-3 text-slate-600 text-[11.5px]">
                {idx + 1}
              </span>
              <span className="whitespace-pre">
                {segments.map((seg, sIdx) => {
                  if (!seg.annotation) {
                    return <Fragment key={sIdx}>{seg.text}</Fragment>;
                  }
                  const isSelected = seg.annotation.id === activeId;
                  return (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => handleSelect(seg.annotation!)}
                      className={`inline rounded px-1 py-0.5 -my-0.5 font-mono transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-400/30 text-amber-200 ring-1 ring-amber-400'
                          : 'bg-amber-500/15 text-amber-300 underline decoration-amber-400/60 decoration-dashed underline-offset-4 hover:bg-amber-500/25'
                      }`}
                      title={`点击查看「${seg.annotation.label}」大白话解释`}
                    >
                      {seg.text}
                    </button>
                  );
                })}
              </span>
            </div>
          );
        })}
      </div>

      {/* In-place Explanation Drawer */}
      {activeAnn && (
        <div className="border-t border-amber-500/25 bg-amber-50/70 dark:bg-amber-950/20 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <code className="rounded bg-amber-500/20 px-2 py-0.5 font-mono text-xs font-bold text-amber-900 dark:text-amber-200">
              {activeAnn.label}
            </code>
            <span className="text-[11px] rounded-full px-2 py-0.5 bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {activeAnn.firstAppearance === false ? '复现巩固 · 忘了随时点' : '首次出场 · 核心语法'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[13.5px] leading-relaxed">
            <div className="rounded-xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                ① 大白话是什么意思
              </div>
              <p className="text-slate-800 dark:text-slate-200 m-0!">{activeAnn.plain}</p>
            </div>
            <div className="rounded-xl bg-white/80 dark:bg-slate-900/60 border border-emerald-500/25 p-3">
              <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                ② 在这笔交易逻辑里防住了什么坑
              </div>
              <p className="text-slate-800 dark:text-slate-200 m-0!">{activeAnn.guard}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
