import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY_BY_ID } from '../../data/glossary';
import { markTermExplored } from '../../lib/progress';

interface Props {
  id: string;
  children?: ReactNode;
}

interface PopoverPos {
  desktop: boolean;
  top: number;
  left: number;
  openAbove: boolean;
}

const TERM_OPEN_EVENT = 'quant-term-open';

export default function Term({ id, children }: Props) {
  const entry = GLOSSARY_BY_ID[id];
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos>({ desktop: false, top: 0, left: 16, openAbove: false });
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const desktop = vw >= 640;
      const popoverWidth = 320;
      const pad = 16;
      const openAbove = vh - rect.bottom < 220 && rect.top > 220;
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - popoverWidth / 2, pad),
        Math.max(pad, vw - popoverWidth - pad),
      );
      const top = openAbove ? rect.top - 8 : rect.bottom + 8;
      setPos({ desktop, top, left, openAbove });
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
    const onOtherTermOpen = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== instanceId) setOpen(false);
    };
    const onModalOpen = () => setOpen(false);

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener(TERM_OPEN_EVENT, onOtherTermOpen);
    document.addEventListener('quant-modal-open', onModalOpen);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, { passive: true, capture: true });
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener(TERM_OPEN_EVENT, onOtherTermOpen);
      document.removeEventListener('quant-modal-open', onModalOpen);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, { capture: true });
    };
  }, [open, instanceId]);

  if (!entry) {
    return <span>{children ?? id}</span>;
  }

  const label = children ?? entry.term;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      document.dispatchEvent(new CustomEvent(TERM_OPEN_EVENT, { detail: instanceId }));
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
          style={
            pos.desktop
              ? {
                  top: `${pos.top}px`,
                  left: `${pos.left}px`,
                  transform: pos.openAbove ? 'translateY(-100%)' : undefined,
                }
              : undefined
          }
          className="fixed inset-x-4 bottom-5 sm:inset-x-auto sm:bottom-auto z-50 block sm:w-80 rounded-2xl border border-emerald-500/30 bg-white dark:bg-[#101826] p-3.5 text-left shadow-xl ring-1 ring-slate-950/5 dark:ring-white/10"
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
