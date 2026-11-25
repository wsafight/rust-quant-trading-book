import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { JSDOM } from 'jsdom';

async function loadModule(file) {
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

test('Rust context respects deployment bases and complete route segments', async () => {
  const { isRustPath } = await loadModule('src/lib/route.ts');
  for (const base of ['/', '/rust-quant-trading-book/', '/rust-quant-trading-book']) {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    for (const route of ['', 'lessons/01-order-book-impact', 'rusty', 'rust-other/chapter']) {
      assert.equal(isRustPath(`${prefix}${route}`, base), false);
    }
    for (const route of ['rust', 'rust/', 'rust/r01-domain-modeling']) {
      assert.equal(isRustPath(`${prefix}${route}`, base), true);
    }
  }
  assert.equal(isRustPath('/outside/rust', '/rust-quant-trading-book/'), false);
});

test('Modal contains keyboard focus, isolates the background, and restores state', async () => {
  const dom = new JSDOM('<body style="overflow: auto"><main><button id="trigger">Open</button></main><aside inert></aside><section><div id="dialog"><button id="first">First</button><button disabled>Disabled</button><button id="last">Last</button></div><button id="sibling">Outside</button></section></body>');
  const previous = new Map();
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'CustomEvent']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }
  dom.window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  const background = document.querySelector('main');
  const existingInert = document.querySelector('aside');
  existingInert.inert = true;
  const trigger = document.getElementById('trigger');
  const first = document.getElementById('first');
  const last = document.getElementById('last');
  const dialog = document.getElementById('dialog');
  try {
    const { activateModal } = await loadModule('src/lib/modal.ts');
    trigger.focus();
    const release = activateModal(dialog, first);
    assert.equal(document.activeElement, first);
    assert.equal(background.inert, true);
    assert.equal(document.getElementById('sibling').inert, true);
    assert.equal(document.body.style.overflow, 'hidden');
    last.focus();
    last.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, first);
    first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, last);
    trigger.focus();
    assert.equal(document.activeElement, first);
    release();
    assert.equal(document.activeElement, trigger);
    assert.equal(background.inert, undefined);
    assert.equal(existingInert.inert, true);
    assert.equal(document.body.style.overflow, 'auto');
    assert.equal(dialog.hasAttribute('tabindex'), false);

    const empty = document.createElement('div');
    document.body.append(empty);
    const releaseEmpty = activateModal(empty);
    assert.equal(document.activeElement, empty);
    empty.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(document.activeElement, empty);
    releaseEmpty();

    const secondDialog = document.createElement('div');
    const secondButton = document.createElement('button');
    secondDialog.append(secondButton);
    document.body.append(secondDialog);
    trigger.focus();
    const releaseFirst = activateModal(dialog, first);
    const releaseSecond = activateModal(secondDialog, secondButton);
    releaseFirst();
    assert.equal(document.activeElement, secondButton);
    assert.equal(background.inert, true);
    assert.equal(dialog.parentElement.inert, true);
    assert.equal(document.body.style.overflow, 'hidden');
    releaseSecond();
    assert.equal(document.activeElement, trigger);
    assert.equal(background.inert, undefined);
    assert.equal(existingInert.inert, true);
    assert.equal(document.body.style.overflow, 'auto');
  } finally {
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('Progress persistence handles toggles, deduplication, reset, and malformed storage', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
  const previous = new Map();
  for (const key of ['window', 'CustomEvent']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  }

  try {
    const progress = await loadModule('src/lib/progress.ts');
    let eventCount = 0;
    dom.window.addEventListener(progress.PROGRESS_EVENT, () => {
      eventCount += 1;
    });

    assert.deepEqual(progress.loadProgress(), {
      completedLessons: [],
      completedLabs: [],
      exploredTerms: [],
      completedRustChapters: [],
      exploredRustConcepts: [],
    });

    dom.window.localStorage.setItem('quant-interactive-progress-v1', '{not valid json');
    assert.deepEqual(progress.loadProgress().completedLessons, []);

    dom.window.localStorage.setItem(
      'quant-interactive-progress-v1',
      JSON.stringify({ completedLessons: ['01-order-book-impact'], completedLabs: 'bad' }),
    );
    const partial = progress.loadProgress();
    assert.deepEqual(partial.completedLessons, ['01-order-book-impact']);
    assert.deepEqual(partial.completedLabs, []);

    progress.toggleLessonComplete('01-order-book-impact');
    assert.deepEqual(progress.loadProgress().completedLessons, []);
    progress.toggleLessonComplete('02-adverse-selection-markout');
    assert.deepEqual(progress.loadProgress().completedLessons, ['02-adverse-selection-markout']);

    progress.toggleRustChapterComplete('r01-domain-modeling');
    assert.deepEqual(progress.loadProgress().completedRustChapters, ['r01-domain-modeling']);

    progress.markLabComplete('lab-order-book');
    progress.markLabComplete('lab-order-book');
    assert.deepEqual(progress.loadProgress().completedLabs, ['lab-order-book']);

    progress.markTermExplored('order-book');
    progress.markTermExplored('order-book');
    assert.deepEqual(progress.loadProgress().exploredTerms, ['order-book']);

    progress.markRustConceptExplored('btreemap');
    progress.markRustConceptExplored('btreemap');
    assert.deepEqual(progress.loadProgress().exploredRustConcepts, ['btreemap']);

    assert.equal(eventCount, 6);

    progress.resetProgress();
    assert.deepEqual(progress.loadProgress(), {
      completedLessons: [],
      completedLabs: [],
      exploredTerms: [],
      completedRustChapters: [],
      exploredRustConcepts: [],
    });
    assert.equal(eventCount, 7);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('Code tokenizer respects identifier boundaries and longest-match priority', async () => {
  const { tokenizeLine } = await loadModule('src/lib/codeTokens.ts');
  const annotations = [
    { id: 'i64', match: 'i64', label: 'i64', plain: '', guard: '' },
    { id: 'ok', match: 'Ok', label: 'Ok', plain: '', guard: '' },
    { id: 'mut', match: 'mut', label: 'mut', plain: '', guard: '' },
    { id: 'mut-self', match: '&mut self', label: '&mut self', plain: '', guard: '' },
  ];

  const segments = tokenizeLine('fn apply(&mut self, my_i64_qty: i64, book: OrderBook) -> Result<(), E> { Ok(()) }', annotations);
  const matched = segments.filter((s) => s.annotation).map((s) => `${s.annotation.id}:${s.text}`);
  assert.deepEqual(matched, ['mut-self:&mut self', 'i64:i64', 'ok:Ok']);
});
