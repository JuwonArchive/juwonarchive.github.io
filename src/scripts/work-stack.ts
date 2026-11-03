/** Desktop stacked-card browsing: wheel, arrow keys and clicks move the active card. */
export function mountWorkStack(stack: HTMLElement): void {
  const cards = [...stack.querySelectorAll<HTMLAnchorElement>('a.work-card')];
  if (!cards.length) return;
  const desktop = window.matchMedia('(min-width: 768px)');
  let active = 0;
  let lastMove = 0;

  const show = (index: number) => {
    active = Math.max(0, Math.min(cards.length - 1, index));
    stack.style.setProperty('--active', String(active));
    cards.forEach((card, i) => {
      card.toggleAttribute('data-active', i === active);
      card.toggleAttribute('data-past', i < active);
      card.tabIndex = i === active || !desktop.matches ? 0 : -1;
    });
    if (desktop.matches) document.body.style.setProperty('--page-bg', cards[active].style.getPropertyValue('--tint'));
    else document.body.style.removeProperty('--page-bg');
  };

  const step = (dir: number) => {
    const now = performance.now();
    if (now - lastMove < 350) return;
    lastMove = now;
    show(active + dir);
  };

  window.addEventListener(
    'wheel',
    (e) => {
      // Leave ctrl/cmd+wheel (browser zoom) alone.
      if (!desktop.matches || e.ctrlKey || e.metaKey || Math.abs(e.deltaY) < 4) return;
      e.preventDefault();
      step(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (!desktop.matches) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      show(active + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      show(active - 1);
    }
  });

  cards.forEach((card, i) => {
    card.addEventListener('click', (e) => {
      // A click on a card behind the active one brings it forward instead of navigating.
      if (desktop.matches && i !== active) {
        e.preventDefault();
        show(i);
      }
    });
  });

  desktop.addEventListener('change', () => show(active));
  show(0);
}
