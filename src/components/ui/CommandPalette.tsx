import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CURRICULUM } from '../../data/curriculum';
import { GLOSSARY, type GlossaryEntry } from '../../data/glossary';
import { RUST_CURRICULUM, RUST_PARTS } from '../../data/rustCurriculum';
import { loadProgress, markTermExplored, PROGRESS_EVENT } from '../../lib/progress';
import { isRustPath } from '../../lib/route';
import { activateModal } from '../../lib/modal';

interface Props {
  baseUrl?: string;
}

type TabMode = 'search' | 'glossary' | 'rust-map';

interface SearchResultItem {
  key: string;
  badge: string;
  badgeClass: string;
  title: string;
  subtitle: string;
  href: string;
  done?: boolean;
}

const GLOSSARY_CATEGORIES: Array<GlossaryEntry['category']> = [
  '基础入门',
  '盘口与成交',
  '合约与账本',
  '策略与统计',
  '系统与风控',
  '进阶策略与期权',
];

export default function CommandPalette({ baseUrl = '/' }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabMode>('search');
  const [glossaryCategory, setGlossaryCategory] = useState<string>('全部');
  const [partFilter, setPartFilter] = useState<number>(0);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [completedRust, setCompletedRust] = useState<string[]>([]);
  const [exploredTerms, setExploredTerms] = useState<string[]>([]);
  const [exploredRustCount, setExploredRustCount] = useState(0);
  const [isRustContext, setIsRustContext] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const lessonUrl = (slug: string) => `${normalizedBase}lessons/${slug}`;
  const rustUrl = (slug: string) => `${normalizedBase}rust/${slug}`;

  useEffect(() => {
    setIsRustContext(isRustPath(window.location.pathname, baseUrl));
    const sync = () => {
      const p = loadProgress();
      setCompletedLessons(p.completedLessons);
      setCompletedRust(p.completedRustChapters);
      setExploredTerms(p.exploredTerms);
      setExploredRustCount(p.exploredRustConcepts.length);
    };
    sync();
    window.addEventListener(PROGRESS_EVENT, sync);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTab('search');
        setOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    const onOpenEvent = (e: Event) => {
      const custom = e as CustomEvent<{ tab?: TabMode }>;
      setTab(custom.detail?.tab || 'search');
      setOpen(true);
    };
    const onModalOpen = (event: Event) => {
      if ((event as CustomEvent<HTMLElement>).detail !== dialogRef.current) setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('quant-open-palette', onOpenEvent);
    document.addEventListener('quant-modal-open', onModalOpen);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, sync);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('quant-open-palette', onOpenEvent);
      document.removeEventListener('quant-modal-open', onModalOpen);
    };
  }, []);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    return activateModal(dialogRef.current, inputRef.current);
  }, [open]);

  useEffect(() => {
    if (open && tab === 'search') inputRef.current?.focus();
  }, [open, tab]);

  const searchResults = useMemo<SearchResultItem[]>(() => {
    const q = query.trim().toLowerCase();

    const lessonItems: SearchResultItem[] = CURRICULUM.filter((l) => {
      if (!q) return true;
      return [l.lessonCode, l.title, l.subtitle, l.quantCore, l.labName, l.stageName]
        .join(' ')
        .toLowerCase()
        .includes(q);
    }).map((l) => ({
      key: `lesson-${l.slug}`,
      badge: l.lessonCode,
      badgeClass: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
      title: l.title,
      subtitle: `${l.stageName} · ${l.labName}`,
      href: lessonUrl(l.slug),
      done: completedLessons.includes(l.slug),
    }));

    const termItems: SearchResultItem[] = q
      ? GLOSSARY.filter((g) =>
          [g.term, g.short, g.analogy, g.category].join(' ').toLowerCase().includes(q),
        ).map((g) => ({
          key: `term-${g.id}`,
          badge: '术语',
          badgeClass: 'bg-teal-500/12 text-teal-700 dark:text-teal-300',
          title: g.term,
          subtitle: g.short,
          href: g.lessonSlug ? lessonUrl(g.lessonSlug) : normalizedBase,
        }))
      : [];

    const rustItems: SearchResultItem[] = RUST_CURRICULUM.filter((r) => {
      if (!q) return true;
      return [r.chapterCode, r.title, r.subtitle, r.engineeringGoal, ...r.rustConcepts]
        .join(' ')
        .toLowerCase()
        .includes(q);
    }).map((r) => ({
      key: `rust-${r.slug}`,
      badge: r.chapterCode,
      badgeClass: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
      title: `[Rust实战] ${r.title}`,
      subtitle: r.rustConcepts.join(' · '),
      href: rustUrl(r.slug),
      done: completedRust.includes(r.slug),
    }));

    return isRustContext
      ? [...termItems, ...rustItems, ...lessonItems]
      : [...termItems, ...lessonItems, ...rustItems];
  }, [query, completedLessons, completedRust, isRustContext]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, tab, open]);

  useEffect(() => {
    if (!open || tab !== 'search') return;
    const active = listRef.current?.querySelector<HTMLElement>('[data-palette-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, open, tab]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = searchResults[selectedIndex];
      if (target) {
        window.location.href = target.href;
      }
    }
  };

  if (!open) return null;

  const filteredGlossary =
    glossaryCategory === '全部'
      ? GLOSSARY
      : GLOSSARY.filter((g) => g.category === glossaryCategory);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/65 backdrop-blur-sm px-4 pt-[8vh]"
      onClick={() => setOpen(false)}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="全站检索与术语词典"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0f1621] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Mode Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('search')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                tab === 'search'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              ⌘K 全站检索
            </button>
            <button
              type="button"
              onClick={() => setTab('glossary')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                tab === 'glossary'
                  ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              小白术语词典（{exploredTerms.length}/{GLOSSARY.length}）
            </button>
            <button
              type="button"
              onClick={() => setTab('rust-map')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold cursor-pointer transition-colors ${
                tab === 'rust-map'
                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Rust 实战图谱（已点读 {exploredRustCount} 项）
            </button>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-2 py-0.5 font-mono text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            ESC
          </button>
        </div>

        {tab === 'search' && (
          <div>
            <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
              <input
                ref={inputRef}
                type="text"
                aria-label="搜索课程、术语或 Rust 概念"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="输入任意关键词：bps、做空、滑点、爆仓、期权、凯利、或 Rust 语法（BTreeMap、enum）..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>

            <div ref={listRef} className="max-h-[58vh] overflow-y-auto p-2 space-y-1">
              {searchResults.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">
                  没有匹配 “{query}” 的内容，试试搜索「菜市场」「bps」「爆仓」「回测」「期权」。
                </div>
              ) : (
                searchResults.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <a
                      key={item.key}
                      href={item.href}
                      data-palette-selected={isSelected ? 'true' : undefined}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                        isSelected
                          ? 'bg-emerald-500/12 border border-emerald-500/30'
                          : 'border border-transparent hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span
                        className={`shrink-0 inline-flex h-7 min-w-10 items-center justify-center rounded-lg px-1.5 font-mono text-[11px] font-bold ${item.badgeClass}`}
                      >
                        {item.badge}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </span>
                          {item.done && (
                            <span className="shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              ✓ 已完成
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </div>
        )}

        {tab === 'glossary' && (
          <div className="max-h-[62vh] overflow-y-auto p-4 space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {['全部', ...GLOSSARY_CATEGORIES].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGlossaryCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer border transition-colors ${
                    glossaryCategory === cat
                      ? 'bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredGlossary.map((entry) => {
                const seen = exploredTerms.includes(entry.id);
                return (
                  <div
                    key={entry.id}
                    onClick={() => markTermExplored(entry.id)}
                    className={`rounded-xl border p-3.5 transition-colors cursor-pointer ${
                      seen
                        ? 'border-teal-500/35 bg-teal-500/5'
                        : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 hover:border-teal-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {entry.term}
                      </span>
                      <span className="text-[10px] text-slate-400">{entry.category}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {entry.short}
                    </p>
                    <p className="mt-2 rounded-lg bg-white/80 dark:bg-slate-950/50 px-2.5 py-1.5 text-[11.5px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      <strong className="text-teal-700 dark:text-teal-300">类比：</strong>
                      {entry.analogy}
                    </p>
                    {entry.lessonSlug && (
                      <a
                        href={lessonUrl(entry.lessonSlug)}
                        className="mt-2 inline-block text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        去对应课程体验 →
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'rust-map' && (
          <div className="max-h-[62vh] overflow-y-auto p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPartFilter(0)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold cursor-pointer border transition-colors ${
                    partFilter === 0
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  全部 4 篇
                </button>
                {RUST_PARTS.map((pt) => (
                  <button
                    key={pt.part}
                    type="button"
                    onClick={() => setPartFilter(pt.part)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-mono font-semibold cursor-pointer border transition-colors ${
                      partFilter === pt.part
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    P{pt.part}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] text-slate-500">
                书二已完成 {completedRust.length}/{RUST_CURRICULUM.length} 章
              </span>
            </div>

            {RUST_PARTS.filter((pt) => partFilter === 0 || pt.part === partFilter).map((pt) => {
              const items = RUST_CURRICULUM.filter((c) => c.part === pt.part);
              return (
                <div key={pt.part} className="space-y-2">
                  <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500">
                    Part 0{pt.part} · {pt.name}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {items.map((chapter) => {
                      const done = completedRust.includes(chapter.slug);
                      return (
                        <a
                          key={chapter.slug}
                          href={rustUrl(chapter.slug)}
                          className={`rounded-xl border p-3 transition-colors ${
                            done
                              ? 'border-emerald-500/35 bg-emerald-500/5 hover:border-emerald-500/60'
                              : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 hover:border-amber-500/50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100 mb-1.5">
                            <span className="truncate">
                              {chapter.chapterCode}. {chapter.title}
                            </span>
                            {done && (
                              <span className="shrink-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {chapter.rustConcepts.map((rc) => (
                              <span
                                key={rc}
                                className="rounded bg-amber-500/12 border border-amber-500/25 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                              >
                                {rc}
                              </span>
                            ))}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
