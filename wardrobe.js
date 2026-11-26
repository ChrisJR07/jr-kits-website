const capacity = 15;
const fullMessage = 'Wardrobe full · 15 jerseys. Remove a jersey to add another.';
const personalKey = 'jr-kits:wardrobe:v1';
const barcelonaKey = 'jr-kits:barcelona-order:v1';

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* The wardrobe is still available for this visit. */ }
}

export function setupWardrobe({ get, element, button, photo, products, sizes, teamOrder, openKit, addLines, notify, onBag, wardrobePage, personal }) {
  const byId = new Map(products.map(kit => [kit.id, kit]));
  const stored = read(personalKey, {});
  const named = typeof stored?.name === 'string' ? stored.name.slice(0, 60) : '';
  const entries = Array.isArray(stored?.kits) ? stored.kits.filter(kit => byId.has(kit?.jerseyId)) : [];
  const mine = {
    name: named,
    kits: [...new Map(entries.map(kit => [kit.jerseyId, kit])).values()],
  };
  const available = teamOrder.filter(id => byId.has(id));
  const savedOrder = read(barcelonaKey, []);
  const barcelona = [...new Set([...(Array.isArray(savedOrder) ? savedOrder.filter(id => available.includes(id)) : []), ...available])];
  const rack = get('rack');
  const scroller = get('rack-scroll');
  const standing = get('rack-status');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let drag = null;
  let skipClick = false;

  const order = () => personal ? mine.kits.map(kit => kit.jerseyId) : barcelona;
  const currentName = () => mine.name.trim() || 'My wardrobe';

  function pin(line) {
    const entry = mine.kits.find(kit => kit.jerseyId === line.jerseyId);
    if (!entry && mine.kits.length >= capacity) {
      notify(fullMessage);
      return false;
    }
    if (entry) Object.assign(entry, line);
    else mine.kits.push(line);
    save(personalKey, mine);
    if (wardrobePage && personal) render();
    notify(mine.kits.length >= capacity ? fullMessage : entry ? 'Wardrobe jersey updated' : 'Jersey added to your wardrobe');
    return true;
  }

  function remove(id) {
    const index = mine.kits.findIndex(entry => entry.jerseyId === id);
    if (index < 0) return;
    mine.kits.splice(index, 1);
    save(personalKey, mine);
    render();
  }

  function move(from, to) {
    const items = personal ? mine.kits : barcelona;
    items.splice(to, 0, items.splice(from, 1)[0]);
    save(personal ? personalKey : barcelonaKey, personal ? mine : barcelona);
  }

  function syncControls() {
    const cards = [...rack.children];
    for (const [i, card] of cards.entries()) {
      card.style.setProperty('--stack', String(cards.length - i));
      card.style.setProperty('--rest', ((i % 5) - 2) * 0.85 + 'deg');
    }
  }

  function insertAt(card, to) {
    const children = [...rack.children].filter(node => node !== card);
    const positions = new Map(children.map(node => [node, node.offsetLeft]));
    rack.insertBefore(card, children[to] ?? null);
    if (reducedMotion.matches) return;
    for (const node of children) {
      const offset = positions.get(node) - node.offsetLeft;
      node.getAnimations().forEach(animation => animation.cancel());
      if (offset) node.animate([{ transform: 'translateX(' + offset + 'px)' }, { transform: 'none' }],
        { duration: 245, easing: 'cubic-bezier(.2,.75,.3,1)' });
    }
  }

  function moveBy(id, delta) {
    const ids = order().slice(0, capacity);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    const card = rack.children[from];
    move(from, to);
    insertAt(card, to);
    syncControls();
    card.querySelector('.rack-shirt').focus();
    card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    standing.textContent = byId.get(id).subtitle + ' moved to position ' + (to + 1) + '.';
  }

  function render() {
    const ids = order().slice(0, capacity);
    rack.style.setProperty('--gaps', Math.max(1, ids.length - 1));
    rack.style.setProperty('--count', ids.length);
    get('rack-name').textContent = personal ? currentName() : 'FC Barcelona';
    get('rack-count').textContent = personal ? ids.length + ' / 15 jerseys' : ids.length + ' jerseys';
    get('add-wardrobe').disabled = ids.length === 0;
    rack.replaceChildren(...ids.map(id => {
      const kit = byId.get(id);
      const entry = personal ? mine.kits.find(item => item.jerseyId === id) : undefined;
      const card = element('li', '', 'rack-card');
      card.dataset.id = id;
      const shirt = button('', () => {
        if (!skipClick) openKit(kit, entry);
      }, 'rack-shirt');
      shirt.setAttribute('aria-label', 'View ' + kit.club + ' ' + kit.subtitle);
      const hanger = element('span', '', 'hanger');
      hanger.setAttribute('aria-hidden', 'true');
      shirt.append(hanger);
      const imagePath = kit.rackImage ?? kit.tile ?? kit.image;
      if (imagePath) {
        const image = photo(imagePath, '', 'rack-image');
        if (kit.rackImage) image.classList.add('rack-cutout');
        image.draggable = false;
        image.loading = 'lazy';
        shirt.append(image);
      } else {
        shirt.append(element('span', 'Photo on request', 'rack-no-photo'));
      }
      shirt.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0) return;
        skipClick = false;
        drag = { card, shirt, id, pointer: event.pointerId, start: event.clientX, x: event.clientX,
          startLeft: card.offsetLeft, scroll: scroller.scrollLeft, from: [...rack.children].indexOf(card), active: false };
      });
      shirt.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        moveBy(id, event.key === 'ArrowLeft' ? -1 : 1);
      });
      card.append(shirt);
      return card;
    }));
    syncControls();
    standing.textContent = personal && mine.kits.length >= capacity ? fullMessage : ids.length ? 'Select a jersey for details. Drag it along the rail or use the left and right arrow keys to move it.' : 'Your wardrobe is empty. Add jerseys from the shop to get started.';
  }

  function animateDrag() {
    if (!drag?.active) return;
    const { card, shirt, start, startLeft, scroll, x } = drag;
    const bounds = scroller.getBoundingClientRect();
    const edge = Math.min(62, bounds.width / 4);
    if (x > bounds.right - edge) scroller.scrollLeft += Math.min(15, (x - bounds.right + edge) / 4);
    if (x < bounds.left + edge) scroller.scrollLeft -= Math.min(15, (bounds.left + edge - x) / 4);
    const travel = x - start + scroller.scrollLeft - scroll;
    const center = startLeft + card.offsetWidth / 2 + travel;
    const nodes = [...rack.children];
    const from = nodes.indexOf(card);
    const next = nodes[from + 1];
    const previous = nodes[from - 1];
    if (next && center > next.offsetLeft + next.offsetWidth * 0.2) insertAt(card, from + 1);
    if (previous && center < previous.offsetLeft + previous.offsetWidth * 0.8) insertAt(card, from - 1);
    const dx = travel + startLeft - card.offsetLeft;
    const speed = x - (drag.lastX ?? x);
    drag.lastX = x;
    drag.velocity = (drag.velocity ?? 0) * 0.80 - speed * 0.17 - (drag.angle ?? 0) * 0.075;
    drag.angle = Math.max(-15, Math.min(15, (drag.angle ?? 0) + drag.velocity));
    const angle = reducedMotion.matches ? 0 : drag.angle;
    shirt.style.setProperty('--drag-x', dx + 'px');
    shirt.style.setProperty('--drag-angle', angle + 'deg');
    drag.frame = requestAnimationFrame(animateDrag);
  }

  function endDrag(event, cancelled = false) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const { frame, card, shirt, id, from, active } = drag;
    drag = null;
    if (!active) return;
    cancelAnimationFrame(frame);
    if (cancelled) insertAt(card, from);
    const to = [...rack.children].indexOf(card);
    if (!cancelled && from !== to) {
      move(from, to);
      standing.textContent = byId.get(id).subtitle + ' moved to position ' + (to + 1) + '.';
    }
    if (!reducedMotion.matches && !cancelled) {
      const swing = Math.max(-12, Math.min(12, (parseFloat(shirt.style.getPropertyValue('--drag-angle')) || 3)));
      shirt.animate([{rotate: swing + 'deg'}, {rotate: (-swing * .48) + 'deg'}, {rotate: (swing * .18) + 'deg'}, {rotate: '0deg'}], {duration: 510, easing: 'ease-out'});
    }
    card.classList.remove('is-dragging');
    shirt.style.removeProperty('--drag-x');
    shirt.style.removeProperty('--drag-angle');
    skipClick = true;
    setTimeout(() => { skipClick = false; }, 0);
    syncControls();
  }

  scroller.addEventListener('pointermove', event => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const offset = event.clientX - drag.start;
    if (!drag.active && Math.abs(offset) < 8) return;
    drag.x = event.clientX;
    if (!drag.active) {
      drag.active = true;
      scroller.setPointerCapture(event.pointerId);
      drag.card.classList.add('is-dragging');
      drag.frame = requestAnimationFrame(animateDrag);
    }
  });
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', event => endDrag(event, true));
  scroller.addEventListener('lostpointercapture', event => {
    if (event.target === scroller) endDrag(event, true);
  });
  window.addEventListener('pointerup', event => endDrag(event, true));

  if (!wardrobePage) return { pin, remove, fullMessage };

  get('wardrobe-link').setAttribute('aria-current', 'page');
  get(personal ? 'personal-tab' : 'barcelona-tab').setAttribute('aria-current', 'page');
  if (personal) {
    get('wardrobe-title').textContent = currentName();
    get('wardrobe-description').textContent = 'Choose jerseys and sizes, arrange your rail, then add the whole wardrobe to your bag.';
    get('my-wardrobe-link').hidden = true;
    get('wardrobe-tools').hidden = false;
    const name = get('wardrobe-name');
    name.value = mine.name;
    name.oninput = () => {
      mine.name = name.value;
      get('rack-name').textContent = currentName();
      get('wardrobe-title').textContent = currentName();
      save(personalKey, mine);
    };

    const picker = get('pick-dialog');
    const search = get('pick-search');
    function renderPicker() {
      const query = search.value.trim().toLowerCase();
      const existing = new Set(mine.kits.map(kit => kit.jerseyId));
      const choices = products.filter(kit => !existing.has(kit.id)
        && (kit.club + ' ' + kit.subtitle + (kit.club === 'Barcelona' ? ' Barça Barca' : '')).toLowerCase().includes(query));
      const results = get('pick-results');
      if (mine.kits.length >= capacity) {
        results.replaceChildren(element('p', fullMessage));
        return;
      }
      results.replaceChildren(...choices.slice(0, 24).map(kit => {
        const control = button(kit.club + ' · ' + kit.subtitle, () => {
          pin({ jerseyId: kit.id, size: '', printName: '', printNumber: '' });
          renderPicker();
          search.focus();
        }, 'button');
        return control;
      }));
      if (choices.length > 24) results.append(element('p', 'Search to narrow the results.', 'muted'));
      if (!choices.length) results.append(element('p', 'No matching jerseys to add.', 'muted'));
    }
    search.oninput = renderPicker;
    get('pick-kits').onclick = () => {
      search.value = '';
      renderPicker();
      picker.showModal();
      search.focus();
    };
    get('add-wardrobe').onclick = () => {
      if (mine.kits.length > capacity) {
        standing.textContent = 'Your older wardrobe has extra saved jerseys. Remove jerseys until 15 remain to add the wardrobe to your bag.';
        return;
      }
      const missing = mine.kits.findIndex(line => !sizes.includes(line.size) || byId.get(line.jerseyId).sizes[line.size] === 'out');
      if (missing !== -1) {
        standing.textContent = 'Choose an available size for ' + byId.get(mine.kits[missing].jerseyId).subtitle + '.';
        const item = mine.kits[missing];
        openKit(byId.get(item.jerseyId), item);
        return;
      }
      if (addLines(mine.kits)) onBag();
    };
  }
  render();
  return { pin, remove, fullMessage };
}
