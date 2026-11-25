export interface LearningProgress {
  completedLessons: string[];
  completedLabs: string[];
  exploredTerms: string[];
  completedRustChapters: string[];
  exploredRustConcepts: string[];
}

const STORAGE_KEY = 'quant-interactive-progress-v1';
export const PROGRESS_EVENT = 'quant-progress-updated';

const EMPTY_PROGRESS: LearningProgress = {
  completedLessons: [],
  completedLabs: [],
  exploredTerms: [],
  completedRustChapters: [],
  exploredRustConcepts: [],
};

export function loadProgress(): LearningProgress {
  if (typeof window === 'undefined') return EMPTY_PROGRESS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PROGRESS;
    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      completedLessons: Array.isArray(parsed.completedLessons) ? parsed.completedLessons : [],
      completedLabs: Array.isArray(parsed.completedLabs) ? parsed.completedLabs : [],
      exploredTerms: Array.isArray(parsed.exploredTerms) ? parsed.exploredTerms : [],
      completedRustChapters: Array.isArray(parsed.completedRustChapters)
        ? parsed.completedRustChapters
        : [],
      exploredRustConcepts: Array.isArray(parsed.exploredRustConcepts)
        ? parsed.exploredRustConcepts
        : [],
    };
  } catch {
    return EMPTY_PROGRESS;
  }
}

function saveProgress(next: LearningProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: next }));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export function toggleLessonComplete(slug: string): LearningProgress {
  const current = loadProgress();
  const exists = current.completedLessons.includes(slug);
  const completedLessons = exists
    ? current.completedLessons.filter((s) => s !== slug)
    : [...current.completedLessons, slug];
  const next = { ...current, completedLessons };
  saveProgress(next);
  return next;
}

export function toggleRustChapterComplete(slug: string): LearningProgress {
  const current = loadProgress();
  const exists = current.completedRustChapters.includes(slug);
  const completedRustChapters = exists
    ? current.completedRustChapters.filter((s) => s !== slug)
    : [...current.completedRustChapters, slug];
  const next = { ...current, completedRustChapters };
  saveProgress(next);
  return next;
}

export function markLabComplete(labId: string): LearningProgress {
  const current = loadProgress();
  if (current.completedLabs.includes(labId)) return current;
  const next = {
    ...current,
    completedLabs: [...current.completedLabs, labId],
  };
  saveProgress(next);
  return next;
}

export function markTermExplored(termId: string): LearningProgress {
  const current = loadProgress();
  if (current.exploredTerms.includes(termId)) return current;
  const next = {
    ...current,
    exploredTerms: [...current.exploredTerms, termId],
  };
  saveProgress(next);
  return next;
}

export function markRustConceptExplored(conceptId: string): LearningProgress {
  const current = loadProgress();
  if (current.exploredRustConcepts.includes(conceptId)) return current;
  const next = {
    ...current,
    exploredRustConcepts: [...current.exploredRustConcepts, conceptId],
  };
  saveProgress(next);
  return next;
}

export function resetProgress(): LearningProgress {
  saveProgress(EMPTY_PROGRESS);
  return EMPTY_PROGRESS;
}
