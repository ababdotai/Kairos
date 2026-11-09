/** Settings cards use the same folded reading path as the note timeline. */
function mountSettingsTimeline() {
  const view = document.getElementById('settingsView');
  const grid = view?.querySelector('.settings-grid');
  const scroller = document.getElementById('mainContent');
  if (!grid || grid.querySelector('.settings-rail')) return;
  const cards = [...grid.querySelectorAll(':scope > .settings-section')];
  const ns = 'http://www.w3.org/2000/svg';
  const rail = document.createElementNS(ns, 'svg');
  rail.classList.add('settings-rail');
  rail.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  rail.append(path);
  grid.prepend(rail);
  cards.forEach(card => {
    const dot = document.createElement('span');
    dot.className = 'settings-node';
    dot.setAttribute('aria-hidden', 'true');
    card.prepend(dot);
  });
  let frame;
  function draw() {
    frame = null;
    if (!grid.clientWidth) return;
    const cols = grid.clientWidth >= 800 ? 2 : 1;
    grid.style.setProperty('--settings-columns', cols);
    cards.forEach((card, i) => {
      card.style.setProperty('grid-column', String(Math.floor(i / cols) % 2 ? cols - i % cols : i % cols + 1), 'important');
      card.style.gridRow = String(Math.floor(i / cols) + 1);
    });
    const box = grid.getBoundingClientRect();
    rail.setAttribute('viewBox', `0 0 ${box.width} ${grid.scrollHeight}`);
    let d = '', previous;
    cards.forEach((card, i) => {
      const rect = card.getBoundingClientRect();
      const point = { x: rect.left - box.left + rect.width / 2, y: rect.top - box.top - 14 };
      if (!i) d = `M ${point.x} ${point.y}`;
      else if (Math.floor(i / cols) === Math.floor((i - 1) / cols)) d += ` L ${point.x} ${point.y}`;
      else {
        const edge = Math.floor((i - 1) / cols) % 2 ? 3 : box.width - 3;
        const mid = (previous.y + point.y) / 2;
        d += ` C ${edge} ${previous.y}, ${edge} ${previous.y}, ${edge} ${mid} S ${edge} ${point.y}, ${point.x} ${point.y}`;
      }
      previous = point;
    });
    path.setAttribute('d', d);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
  const observer = new ResizeObserver(schedule);
  observer.observe(grid);
  cards.forEach(card => observer.observe(card));
  let scrollbarTimer;
  const onScroll = () => {
    view.classList.toggle('settings-scrolled', scroller.scrollTop > 30);
    scroller.classList.add('settings-is-scrolling');
    clearTimeout(scrollbarTimer);
    scrollbarTimer = setTimeout(() => scroller.classList.remove('settings-is-scrolling'), 900);
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', () => {
    clearTimeout(scrollbarTimer);
    observer.disconnect();
    cancelAnimationFrame(frame);
    scroller.removeEventListener('scroll', onScroll);
  }, { once: true });
  onScroll();
  schedule();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSettingsTimeline, {once:true});
else mountSettingsTimeline();
