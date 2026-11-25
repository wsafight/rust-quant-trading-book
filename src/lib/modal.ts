let activeRelease: (() => void) | undefined;

export function activateModal(container: HTMLElement, initialFocus?: HTMLElement | null): () => void {
  activeRelease?.();
  document.dispatchEvent(new CustomEvent('quant-modal-open', { detail: container }));
  const previouslyFocused = document.activeElement;
  const originalOverflow = document.body.style.overflow;
  const inertElements: Array<{ element: HTMLElement; inert: boolean }> = [];
  let branch: HTMLElement = container;
  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling instanceof HTMLElement && sibling !== branch) {
        inertElements.push({ element: sibling, inert: sibling.inert });
        sibling.inert = true;
      }
    }
    if (branch.parentElement === document.body) break;
    branch = branch.parentElement;
  }
  document.body.style.overflow = 'hidden';
  const originalTabIndex = container.getAttribute('tabindex');
  container.tabIndex = -1;
  const focusableElements = () => Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.tabIndex >= 0 && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0);
  const focusFirst = () => (initialFocus?.isConnected ? initialFocus : focusableElements()[0] || container).focus();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const elements = focusableElements();
    const first = elements[0];
    const last = elements.at(-1);
    if (!first) {
      event.preventDefault();
      container.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container)) {
      event.preventDefault();
      first.focus();
    }
  };
  const onFocusIn = (event: FocusEvent) => {
    if (event.target instanceof Node && !container.contains(event.target)) focusFirst();
  };
  container.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusin', onFocusIn);
  focusFirst();
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (activeRelease === release) activeRelease = undefined;
    container.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focusin', onFocusIn);
    for (const { element, inert } of inertElements) element.inert = inert;
    document.body.style.overflow = originalOverflow;
    if (originalTabIndex === null) container.removeAttribute('tabindex');
    else container.setAttribute('tabindex', originalTabIndex);
    if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
  };
  activeRelease = release;
  return release;
}
