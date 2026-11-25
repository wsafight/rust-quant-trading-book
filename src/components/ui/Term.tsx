import React, { useEffect, useRef, useState } from 'react';
import { GLOSSARY_BY_ID } from '../../data/glossary';
import { markTermExplored } from '../../lib/progress';

interface Props {
  id: string;
  children?: React.ReactNode;
}

export default function Term({ id, children }: Props) {
  const entry = GLOSSARY_BY_ID[id];
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'center' | 'left' | 'right'>('center');
  const [openAbove, setOpenAbove] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const halfPopover = 170;
      if (rect.left < halfPopover) {
        setAlign('left');
      } else if (vw - rect.right < halfPopover) {
        setAlign('right');
      } else {
        setAlign('center');
      }
      setOpenAbove(vh - rect.bottom < 220 && rect.top > 220);
    };
    updatePosition();
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  if (!entry) {
    return <span>{children ?? id}</span>;
  }

  const label = children ?? entry.term;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      markTermExplored(entry.id);
    }
  };

  return (
    <span ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="inline items-center rounded px-1 py-0.5 font-medium text-emerald-700 dark:text-emerald-300 underline decoration-emerald-500/60 decoration-dashed underline-offset-4 hover:bg-emerald-500/10 transition-colors cursor-pointer"
        title="点击查看白话解释"
      >
        {label}
      </button>

      {open && (
        <span
          role="dialog"
          aria-label={entry.term}
          className={`fixed inset-x-4 bottom-5 sm:inset-x-auto sm:bottom-auto sm:absolute z-50 sm:z-40 block sm:w-80 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#101826] p-3.5 text-left shadow-xl ring-1 ring-slate-950/5 dark:ring-white/10 ${
            openAbove ? 'sm:bottom-full sm:mb-2' : 'sm:top-full sm:mt-2'
          } ${
            align === 'left'
              ? 'sm:left-0'
              : align === 'right'
                ? 'sm:right-0'
                : 'sm:left-1/2 sm:-translate-x-1/2'
          }`}
        >
          <span className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {entry.term}
            </span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              {entry.category}
            </span>
          </span>
          <span className="block text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
            {entry.short}
          </span>
          <span className="mt-2 block rounded-xl bg-emerald-50/80 dark:bg-emerald-950/35 border border-emerald-500/20 px-2.5 py-2 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="text-emerald-700 dark:text-emerald-300 font-semibold">生活类比：</strong>
            {entry.analogy}
          </span>
        </span>
      )}
    </span>
  );
}
