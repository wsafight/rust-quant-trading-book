import { loadProgress, PROGRESS_EVENT, type LearningProgress } from './progress';
import { activateModal } from './modal';

const FOCUS_STORAGE_KEY = 'quant-focus-mode';

export interface ReaderLayoutConfig {
  validSlugs: string[];
  getCompleted: (progress: LearningProgress) => string[];
  onToggleComplete: (slug: string) => void;
  sidebarScrollKey: string;
  ids: {
    sidebarScroll: string;
    mobileBtn: string;
    mobileDrawer: string;
    mobileClose: string;
    mobileBackdrop: string;
    completeBtn: string;
    progressText: string;
    progressFill: string;
  };
  dotAttr: string;
  dotDatasetKey: string;
  dotActiveClass: string;
  completeLabels: {
    done: string;
    todo: string;
  };
  completeClasses: {
    done: string;
    todo: string;
  };
}

function readFocusPreference(): boolean {
  try {
    return window.localStorage.getItem(FOCUS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFocusPreference(active: boolean): void {
  try {
    window.localStorage.setItem(FOCUS_STORAGE_KEY, active ? '1' : '0');
  } catch {
    // Ignore storage errors in restricted environments
  }
}

export function initReaderLayout(config: ReaderLayoutConfig): void {
  const progressBar = document.getElementById('reading-progress-bar');
  const updateScroll = () => {
    if (!progressBar) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
    progressBar.style.width = `${pct}%`;
  };
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', updateScroll, { passive: true });
  updateScroll();

  const focusBtn = document.getElementById('focus-mode-btn');
  const applyFocus = (active: boolean) => {
    document.body.classList.toggle('focus-mode', active);
    if (focusBtn) {
      focusBtn.textContent = active ? '退出专注' : '专注模式';
      focusBtn.setAttribute('aria-pressed', String(active));
    }
  };
  applyFocus(readFocusPreference());
  focusBtn?.addEventListener('click', () => {
    const next = !document.body.classList.contains('focus-mode');
    applyFocus(next);
    writeFocusPreference(next);
  });

  const mobileBtn = document.getElementById(config.ids.mobileBtn);
  const mobileDrawer = document.getElementById(config.ids.mobileDrawer);
  const mobileClose = document.getElementById(config.ids.mobileClose);
  const mobileBackdrop = document.getElementById(config.ids.mobileBackdrop);
  let releaseDrawer: (() => void) | undefined;
  const closeDrawer = () => {
    releaseDrawer?.();
    releaseDrawer = undefined;
    mobileDrawer?.classList.add('hidden');
    mobileBtn?.setAttribute('aria-expanded', 'false');
  };
  mobileBtn?.setAttribute('aria-controls', config.ids.mobileDrawer);
  mobileBtn?.setAttribute('aria-expanded', 'false');
  mobileBtn?.addEventListener('click', () => {
    if (!mobileDrawer || releaseDrawer) return;
    mobileDrawer?.classList.remove('hidden');
    mobileBtn.setAttribute('aria-expanded', 'true');
    const activeMobileItem = mobileDrawer?.querySelector<HTMLElement>('[aria-current="page"]');
    activeMobileItem?.scrollIntoView({ block: 'center', behavior: 'instant' });
    releaseDrawer = activateModal(mobileDrawer, mobileClose);
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (event) => {
    if (event.matches) closeDrawer();
  });
  mobileClose?.addEventListener('click', closeDrawer);
  mobileBackdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('quant-modal-open', (event) => {
    if ((event as CustomEvent<HTMLElement>).detail !== mobileDrawer) closeDrawer();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDrawer && !mobileDrawer.classList.contains('hidden')) {
      closeDrawer();
    }
  });

  // Preserve desktop sidebar scroll position across MPA navigations and ensure active item is visible
  const sidebarScroll = document.getElementById(config.ids.sidebarScroll);
  if (sidebarScroll) {
    const saveSidebarScroll = () => {
      try {
        window.sessionStorage.setItem(config.sidebarScrollKey, String(sidebarScroll.scrollTop));
      } catch {
        // Ignore storage errors in restricted environments
      }
    };

    try {
      const saved = window.sessionStorage.getItem(config.sidebarScrollKey);
      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sidebarScroll.scrollTop = parsed;
        }
      }
    } catch {
      // Ignore storage errors
    }

    const activeItem = sidebarScroll.querySelector<HTMLElement>('[aria-current="page"]');
    if (activeItem) {
      const containerRect = sidebarScroll.getBoundingClientRect();
      const itemRect = activeItem.getBoundingClientRect();
      const isOutOfView =
        itemRect.top < containerRect.top + 12 || itemRect.bottom > containerRect.bottom - 12;
      if (isOutOfView) {
        const targetTop =
          sidebarScroll.scrollTop +
          (itemRect.top - containerRect.top) -
          sidebarScroll.clientHeight / 2 +
          itemRect.height / 2;
        sidebarScroll.scrollTop = Math.max(0, targetTop);
        saveSidebarScroll();
      }
    }

    sidebarScroll.addEventListener('scroll', saveSidebarScroll, { passive: true });
    sidebarScroll.addEventListener('click', saveSidebarScroll);
  }

  const completeBtn = document.getElementById(config.ids.completeBtn) as HTMLButtonElement | null;
  const currentSlug = completeBtn?.dataset.slug || '';
  const validSet = new Set(config.validSlugs);

  const renderProgress = () => {
    const progress = loadProgress();
    const completed = config.getCompleted(progress);
    const total = config.validSlugs.length;
    const doneCount = completed.filter((s) => validSet.has(s)).length;

    const textEl = document.getElementById(config.ids.progressText);
    const fillEl = document.getElementById(config.ids.progressFill);
    if (textEl) textEl.textContent = `${doneCount} / ${total}`;
    if (fillEl) fillEl.style.width = `${total > 0 ? (doneCount / total) * 100 : 0}%`;

    document.querySelectorAll<HTMLElement>(`[${config.dotAttr}]`).forEach((dot) => {
      const slug = dot.dataset[config.dotDatasetKey] || '';
      const done = completed.includes(slug);
      dot.classList.toggle(config.dotActiveClass, done);
      dot.classList.toggle('bg-slate-300', !done);
      dot.classList.toggle('dark:bg-slate-700', !done);
    });

    if (completeBtn && currentSlug) {
      const isDone = completed.includes(currentSlug);
      completeBtn.textContent = isDone ? config.completeLabels.done : config.completeLabels.todo;
      completeBtn.className = isDone ? config.completeClasses.done : config.completeClasses.todo;
    }
  };

  completeBtn?.addEventListener('click', () => {
    if (!currentSlug) return;
    config.onToggleComplete(currentSlug);
    renderProgress();
  });

  window.addEventListener(PROGRESS_EVENT, renderProgress);
  renderProgress();
}
