// Native-feeling pull-to-refresh for the installed PWA. In standalone mode
// there is no address bar and no built-in browser pull-to-refresh (see the
// hardReset note in app.js), so we synthesise the gesture: pulling down at the
// very top of the page past a threshold runs onRefresh(); below it, snaps back.

export function initPullToRefresh(onRefresh) {
  const THRESHOLD = 70;  // px of pull needed to trigger a refresh
  const MAX = 120;       // cap on how far the indicator travels

  const indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  indicator.innerHTML = '<span class="ptr-spinner">🔄</span>';
  document.body.appendChild(indicator);
  const spinner = indicator.firstElementChild;

  let startY = 0, pulling = false, dist = 0, refreshing = false;
  const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

  function setPull(d) {
    dist = d;
    const travel = Math.min(d, MAX);
    indicator.style.transform = `translateX(-50%) translateY(${travel}px)`;
    indicator.style.opacity = String(Math.min(1, d / THRESHOLD));
    spinner.style.transform = `rotate(${d * 2.6}deg)`;
    indicator.classList.toggle('ptr-ready', d >= THRESHOLD);
  }

  function reset() {
    refreshing = false;
    indicator.classList.remove('ptr-spin', 'ptr-ready');
    indicator.style.transition = 'transform .25s ease, opacity .25s ease';
    spinner.style.transform = '';
    setPull(0);
    setTimeout(() => { indicator.style.transition = ''; }, 260);
  }

  window.addEventListener('touchstart', (e) => {
    if (refreshing || e.touches.length !== 1 || !atTop()) { pulling = false; return; }
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || !atTop()) { if (dist) setPull(0); pulling = false; return; }
    setPull(Math.pow(dy, 0.85)); // damped travel for a rubber-band feel
    if (e.cancelable) e.preventDefault(); // suppress native overscroll while pulling
  }, { passive: false });

  function end() {
    if (!pulling) return;
    pulling = false;
    if (dist >= THRESHOLD && !refreshing) {
      refreshing = true;
      indicator.classList.add('ptr-spin');
      spinner.style.transform = '';
      indicator.style.transition = 'transform .2s ease';
      indicator.style.transform = `translateX(-50%) translateY(${THRESHOLD}px)`;
      indicator.style.opacity = '1';
      Promise.resolve(onRefresh()).catch(() => {});
      setTimeout(reset, 4000); // fallback if onRefresh didn't reload the page
    } else {
      reset();
    }
  }
  window.addEventListener('touchend', end, { passive: true });
  window.addEventListener('touchcancel', end, { passive: true });
}
