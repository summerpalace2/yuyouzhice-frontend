// Layout changes keep the map, transcript and composer mounted.
export function switchPlanningPane(state, mode, { focusInput = false, stopId, day } = {}) {
  const page = typeof document !== 'undefined' && document.querySelector('.planning-workspace');
  if (!page) return;
  const mobile = window.matchMedia('(max-width: 960px)').matches;
  const assistant = mode === 'assistant' || mode === 'expanded';
  if (mobile && assistant && page.dataset.pane !== 'assistant') state.itineraryScroll = window.scrollY;
  state.planningPane = assistant ? 'assistant' : 'itinerary';
  state.planningExpanded = mode === 'expanded';
  state.chatDockOpen = assistant || (!mobile && mode === 'locate');
  page.dataset.pane = state.planningPane;
  page.dataset.expanded = String(state.planningExpanded);
  page.dataset.dock = String(state.chatDockOpen);
  for (const button of page.querySelectorAll('[data-pane-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.paneChoice === state.planningPane));
  }

  if (assistant) {
    const focus = focusInput ? page.querySelector('#chat-input') : page.querySelector('#planning-assistant');
    focus?.focus({ preventScroll: true });
    return;
  }
  const input = page.querySelector('#chat-input');
  if (input === document.activeElement) input.blur();
  state.mapInstance?.resize?.();
  if (mobile) window.scrollTo(0, state.itineraryScroll || 0);
  const target = findChangeElement(page, stopId, day);
  if (target) {
    target.tabIndex = -1;
    target.classList.remove('workspace-change-highlight');
    const reveal = () => {
      target.focus({ preventScroll: true });
      target.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      target.classList.add('workspace-change-highlight');
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reveal);
    else reveal();
  } else {
    const button = [...page.querySelectorAll('[data-action="open-chat-dock"],[data-pane-choice="itinerary"]')]
      .find(el => el.getClientRects().length);
    button?.focus({ preventScroll: true });
  }
}

function findChangeElement(page, stopId, day) {
  const stop = stopId && [...page.querySelectorAll('article[data-stop-id]')].find(el => el.dataset.stopId === stopId);
  return stop || (day && [...page.querySelectorAll('[data-trip-day]')].find(el => el.dataset.tripDay === String(day)));
}

export function highlightAppliedChange(card, state) {
  const destination = changeDestination(card, state);
  const page = typeof document !== 'undefined' && document.querySelector('.planning-workspace');
  const el = destination && page ? findChangeElement(page, destination.id, destination.day) : null;
  if (!el) return;
  el.classList.remove('workspace-change-highlight');
  const apply = () => {
    el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    el.classList.add('workspace-change-highlight');
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  else apply();
}

// Use the authoritative receipt and proposal diff. A removed stop links to its day.
export function changeDestination(card, state) {
  const data = card.receipt?.data;
  if (card.status !== 'approved' || !data?.applied || !state.trip ||
      data.currentVersion !== state.trip.version || String(card.plannerSessionId || data.sessionId) !== String(state.sessionId)) return null;
  const days = state.trip.days || [];
  const changes = Array.isArray(card.args?.stopChanges) ? card.args.stopChanges : [];
  for (const change of changes) {
    const day = days.find(d => d.stops?.some(s => s.id === change.key));
    if (day) return { day: day.day, id: change.key };
  }
  for (const change of changes) {
    const day = change.after?.day ?? change.before?.day;
    if (days.some(d => d.day === day)) return { day };
  }
  return {};
}

export function observePlanningViewport() {
  const root = document.documentElement;
  const bar = document.querySelector('#topbar-mount');
  if (bar && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => root.style.setProperty('--planning-topbar', bar.offsetHeight + 'px')).observe(bar);
  }
  const viewport = window.visualViewport;
  if (!viewport) return;
  function update() {
    root.style.setProperty('--planning-visible-height', viewport.height + 'px');
    root.style.setProperty('--planning-visible-top', viewport.offsetTop + 'px');
  }
  update();
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
}
