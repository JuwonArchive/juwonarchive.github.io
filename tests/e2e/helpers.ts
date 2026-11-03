import { expect, type Page } from '@playwright/test';

/** Collect console errors from our own origin (third-party embeds are noisy). */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = msg.location().url;
    if (url && !url.startsWith('http://localhost:4321')) return;
    errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll).toBeLessThanOrEqual(width);
}

/** Main text must be English: uppercase letters, digits and a little punctuation. */
export const ENGLISH_MAIN = /^[A-Z0-9 ·—&'’,.:\-\/→←↗+]+$/;

/** Fails when any word inside the matched elements is split across two lines. */
export async function expectNoBrokenWords(page: Page, selector: string) {
  const broken = await page.locator(selector).evaluateAll((els) => {
    const out: string[] = [];
    for (const el of els) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        for (const m of text.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(node, m.index!);
          r.setEnd(node, m.index! + m[0].length);
          const tops = new Set([...r.getClientRects()].map((rect) => Math.round(rect.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
    }
    return out;
  });
  expect(broken).toEqual([]);
}
