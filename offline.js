(() => {
"use strict";
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

function setupWardrobe({ get, element, button, photo, products, sizes, teamOrder, openKit, addLines, notify, onBag, wardrobePage, personal }) {
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



const page = new URLSearchParams(location.search);
const wardrobePage = page.get('view') === 'wardrobe';
const personal = page.get('rack') === 'mine';

const get = id => document.getElementById(id);
const money = amount => 'TZS ' + amount.toLocaleString('en-US');
const asset = path => '.' + path;
const storageKey = 'jr-kits:order-bag:v1';
const pageSize = 12;

if (wardrobePage) {
  get('shop-view').hidden = true;
  get('wardrobe-view').hidden = false;
  get('focus-search').hidden = true;
  get('skip').href = '#rack-scroll';
  get('skip').textContent = 'Skip to jerseys';
  document.title = (personal ? 'My Wardrobe' : 'The Barcelona Wardrobe') + ' | JR KITS';
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, handler, className) {
  const node = element('button', label, className);
  node.type = 'button';
  node.addEventListener('click', handler);
  return node;
}

function photo(path, alt, className) {
  const image = element('img', '', className);
  image.alt = alt;
  image.src = asset(path);
  image.addEventListener('error', () => { image.hidden = true; });
  return image;
}

const dialogs = [...document.querySelectorAll('dialog')];
for (const dialog of dialogs) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  });
}

async function start() {
  const catalogue = {"hero":[{"img":"/assets/barcelona/barcelona-home-2026-27-front.webp","tag":"Latest drops","title":"The Barça Drop","text":"Explore the latest Barcelona jerseys and standout editions, with front and back photos.","cta":"Shop Barcelona","href":"#latest","theme":"barca"},{"img":"/assets/real-madrid/rm-home-2026-27-white-green-front.jpg","tag":"Real Madrid","title":"Real Madrid kits","text":"Explore the collection in front and back views.","cta":"Shop Real Madrid","theme":"","category":"All","team":"Real Madrid","fit":"contain"}],"products":[{"id":"rm-retro-white-purple","club":"Real Madrid","subtitle":"1990s Retro · White & Purple V-Neck","type":"Short Sleeve","side":"Vintage","badge":"Vintage","vintage":true,"category":"Vintage","image":"/assets/real-madrid/rm-retro-white-purple-front.jpg","backImage":"/assets/real-madrid/rm-retro-white-purple-back.jpg","tile":"/assets/real-madrid/rm-retro-white-purple-tile.webp","rackImage":"/assets/real-madrid/rm-retro-white-purple-rack.webp","price":30000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"}},{"id":"real-madrid-away-2026-27","club":"Real Madrid","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"Away · 2026/27 · Aurora Ivy","category":"Club Kits","badge":"Away","image":"/assets/real-madrid/real-madrid-away-2026-27-front.jpg","tile":"/assets/real-madrid/real-madrid-away-2026-27-tile.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/real-madrid/real-madrid-away-2026-27-back.jpg","rackImage":"/assets/real-madrid/real-madrid-away-2026-27-rack.webp"},{"id":"rm-home-2026-27-white-green","club":"Real Madrid","subtitle":"Home · 2026/27 · White, Green & Pink","type":"Short Sleeve","side":"Home","badge":"Home","vintage":false,"category":"Club Kits","image":"/assets/real-madrid/rm-home-2026-27-white-green-front.jpg","backImage":"/assets/real-madrid/rm-home-2026-27-white-green-back.jpg","tile":"/assets/real-madrid/rm-home-2026-27-white-green-tile.webp","rackImage":"/assets/real-madrid/rm-home-2026-27-white-green-rack.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"}},{"id":"rm-third-wild-pink","club":"Real Madrid","subtitle":"Third · 2026/27 · Wild Pink","type":"Short Sleeve","side":"Third","badge":"Third","vintage":false,"category":"Club Kits","image":"/assets/real-madrid/rm-third-wild-pink-front.jpg","backImage":"/assets/real-madrid/rm-third-wild-pink-back.jpg","tile":"/assets/real-madrid/rm-third-wild-pink-tile.webp","rackImage":"/assets/real-madrid/rm-third-wild-pink-rack.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"}},{"id":"rm-hot-pink-geometric","club":"Real Madrid","subtitle":"Hot Pink Geometric Special","type":"Short Sleeve","side":"Special","badge":"Special","vintage":false,"category":"Special / Retro","image":"/assets/real-madrid/rm-hot-pink-geometric-front.jpg","backImage":"/assets/real-madrid/rm-hot-pink-geometric-back.jpg","tile":"/assets/real-madrid/rm-hot-pink-geometric-tile.webp","rackImage":"/assets/real-madrid/rm-hot-pink-geometric-rack.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"}},{"id":"rm-away","club":"Real Madrid","subtitle":"Green Monogram Polo · Louis Vuitton Design","category":"Special / Retro","type":"Short Sleeve","badge":"Special","image":"/assets/real-madrid/rm-away-front.jpg","vintage":false,"price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"side":"Special","backImage":"/assets/real-madrid/rm-away-back.jpg","tile":"/assets/real-madrid/rm-away-tile.webp","rackImage":"/assets/real-madrid/rm-away-rack.webp"},{"id":"rm-white-monogram","club":"Real Madrid","subtitle":"White Monogram Polo · Louis Vuitton Design","type":"Short Sleeve","side":"Special","badge":"Special","vintage":false,"category":"Special / Retro","image":"/assets/real-madrid/rm-white-monogram-front.jpg","backImage":"/assets/real-madrid/rm-white-monogram-back.jpg","tile":"/assets/real-madrid/rm-white-monogram-tile.webp","rackImage":"/assets/real-madrid/rm-white-monogram-rack.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"}},{"id":"rm-retro-royal-blue","club":"Real Madrid","subtitle":"Vintage Polo · Royal Blue & Yellow","type":"Short Sleeve","side":"Vintage","badge":"Vintage","vintage":true,"category":"Vintage","image":"/assets/real-madrid/rm-retro-royal-blue-front.jpg","backImage":"/assets/real-madrid/rm-retro-royal-blue-back.jpg","tile":"/assets/real-madrid/rm-retro-royal-blue-tile.webp","rackImage":"/assets/real-madrid/rm-retro-royal-blue-rack.webp","price":30000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"}},{"id":"barcelona-away-2026-27","club":"Barcelona","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"Away Kobe Mamba · 2026/27","category":"Club Kits","badge":"Away","image":"/assets/barcelona/barcelona-away-2026-27-front.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"wardrobe":"Barcelona","backImage":"/assets/barcelona/barcelona-away-2026-27-back.webp","feature":"Hot pick","rackImage":"/assets/barcelona/barcelona-away-2026-27-rack.webp"},{"id":"barcelona-home-2026-27","club":"Barcelona","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"Home · 2026/27","category":"Club Kits","badge":"Home","image":"/assets/barcelona/barcelona-home-2026-27-front.webp","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"wardrobe":"Barcelona","backImage":"/assets/barcelona/barcelona-home-2026-27-back.webp","feature":"Latest drop","rackImage":"/assets/barcelona/barcelona-home-2026-27-rack.webp"},{"id":"arsenal-home-2026-27","club":"Arsenal","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","image":"/assets/jr-collection/arsenal-2026-27-home-front.webp","tile":"/assets/jr-collection/arsenal-2026-27-home-front.webp","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/jr-collection/arsenal-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"ac-milan-home-2026-27","club":"AC Milan","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","image":"/assets/jr-collection/ac-milan-2026-27-home-front.webp","tile":"/assets/jr-collection/ac-milan-2026-27-home-front.webp","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/jr-collection/ac-milan-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"ac-milan-away-2026-27","club":"AC Milan","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","image":"/assets/jr-collection/ac-milan-2026-27-away-front.webp","tile":"/assets/jr-collection/ac-milan-2026-27-away-front.webp","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/jr-collection/ac-milan-2026-27-away-back.webp","backLabel":"Back reconstruction"},{"id":"bayern-munich-away-2026-27","club":"Bayern Munich","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","image":"/assets/jr-collection/bayern-munich-2026-27-away-front.webp","tile":"/assets/jr-collection/bayern-munich-2026-27-away-front.webp","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/jr-collection/bayern-munich-2026-27-away-back.webp","backLabel":"Back reconstruction"},{"id":"brighton-home-2026-27","club":"Brighton","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","image":"/assets/jr-collection/brighton-2026-27-home-front.webp","tile":"/assets/jr-collection/brighton-2026-27-home-front.webp","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/jr-collection/brighton-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"bayer-leverkusen-home-2026-27","club":"Bayer Leverkusen","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","image":"/assets/jr-collection/bayer-leverkusen-2026-27-home-front.webp","tile":"/assets/jr-collection/bayer-leverkusen-2026-27-home-front.webp","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"backImage":"/assets/jr-collection/bayer-leverkusen-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"barcelona-green-frost","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Third","subtitle":"Third Green Frost · 2026/27","vintage":false,"badge":"Third","category":"Club Kits","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-green-frost-front.webp","backImage":"/assets/barcelona/barcelona-green-frost-back.webp","feature":"Latest drop","rackImage":"/assets/barcelona/barcelona-green-frost-rack.webp"},{"id":"barcelona-sant-jordi","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Fourth","subtitle":"Fourth Sant Jordi · 2026/27","vintage":false,"badge":"Fourth","category":"Club Kits","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-sant-jordi-front.webp","backImage":"/assets/barcelona/barcelona-sant-jordi-back.webp","feature":"Latest drop","rackImage":"/assets/barcelona/barcelona-sant-jordi-rack.webp"},{"id":"barcelona-kobe-mamba-gk","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Away","subtitle":"Away GK Kobe Mamba · 2026/27","vintage":false,"badge":"Away","category":"Club Kits","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-kobe-mamba-gk-front.webp","backImage":"/assets/barcelona/barcelona-kobe-mamba-gk-back.webp","rackImage":"/assets/barcelona/barcelona-kobe-mamba-gk-rack.webp"},{"id":"barcelona-kobe-lightning","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Training Kit","side":"Away","subtitle":"Away Pre-Match Kobe Lightning · 2026/27","vintage":false,"badge":"Away","category":"Training Kits","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-kobe-lightning-front.webp","backImage":"/assets/barcelona/barcelona-kobe-lightning-back.webp","rackImage":"/assets/barcelona/barcelona-kobe-lightning-rack.webp"},{"id":"barcelona-home-golf-wang","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Home","subtitle":"Home Golf Wang · 2026/27","vintage":false,"badge":"Home","category":"Special / Retro","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-home-golf-wang-front.webp","backImage":"/assets/barcelona/barcelona-home-golf-wang-back.webp","rackImage":"/assets/barcelona/barcelona-home-golf-wang-rack.webp"},{"id":"barcelona-teal-golf-wang","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Polo","subtitle":"Teal Golf Wang Polo · 2026/27","vintage":false,"badge":"Polo","category":"Special / Retro","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-teal-golf-wang-front.webp","backImage":"/assets/barcelona/barcelona-teal-golf-wang-back.webp","rackImage":"/assets/barcelona/barcelona-teal-golf-wang-rack.webp"},{"id":"barcelona-cactus-jack","club":"Barcelona","price":30000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Retro","subtitle":"Cactus Jack Retro · 2000/01","vintage":true,"badge":"Retro","category":"Vintage","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-cactus-jack-front.webp","backImage":"/assets/barcelona/barcelona-cactus-jack-back.webp","feature":"Hot pick","rackImage":"/assets/barcelona/barcelona-cactus-jack-rack.webp"},{"id":"barcelona-olivia-rodrigo","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Retro","subtitle":"Olivia Rodrigo Retro · 2003/04","vintage":true,"badge":"Retro","category":"Vintage","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-olivia-rodrigo-front.webp","backImage":"/assets/barcelona/barcelona-olivia-rodrigo-back.webp","rackImage":"/assets/barcelona/barcelona-olivia-rodrigo-rack.webp"},{"id":"barcelona-blackout-futura","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Special","subtitle":"Blackout Futura Special","vintage":false,"badge":"Special","category":"Special / Retro","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-blackout-futura-front.webp","backImage":"/assets/barcelona/barcelona-blackout-futura-back.webp","feature":"Hot pick","rackImage":"/assets/barcelona/barcelona-blackout-futura-rack.webp"},{"id":"barcelona-kobe-burgundy","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Polo","subtitle":"Kobe Burgundy Floral Polo","vintage":false,"badge":"Polo","category":"Special / Retro","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-kobe-burgundy-front.webp","backImage":"/assets/barcelona/barcelona-kobe-burgundy-back.webp","rackImage":"/assets/barcelona/barcelona-kobe-burgundy-rack.webp"},{"id":"barcelona-offwhite-retro","club":"Barcelona","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"type":"Short Sleeve","side":"Retro","subtitle":"Off-White Blue Band Retro Polo","vintage":true,"badge":"Retro","category":"Vintage","wardrobe":"Barcelona","image":"/assets/barcelona/barcelona-offwhite-retro-front.webp","backImage":"/assets/barcelona/barcelona-offwhite-retro-back.webp","rackImage":"/assets/barcelona/barcelona-offwhite-retro-rack.webp"},{"id":"jr-argentina-2026-messi-farewell","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Special","type":"Short Sleeve","subtitle":"2026 Messi Farewell","category":"International Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/argentina-2026-messi-farewell-front.webp","tile":"/assets/jr-collection/argentina-2026-messi-farewell-front.webp","backImage":"/assets/jr-collection/argentina-2026-messi-farewell-back.webp","backLabel":"Back reconstruction"},{"id":"jr-argentina-2026-away-world-champions-badge","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Away","type":"Short Sleeve","subtitle":"2026 Away World Champions Badge","category":"International Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/argentina-2026-away-world-champions-badge-front.webp","tile":"/assets/jr-collection/argentina-2026-away-world-champions-badge-front.webp","backImage":"/assets/jr-collection/argentina-2026-away-world-champions-badge-back.webp","backLabel":"Back reconstruction"},{"id":"jr-algeria-2026-away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Algeria","side":"Away","type":"Short Sleeve","subtitle":"2026 Away","category":"International Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/algeria-2026-away-front.webp","tile":"/assets/jr-collection/algeria-2026-away-front.webp","backImage":"/assets/jr-collection/algeria-2026-away-back.webp","backLabel":"Back reconstruction"},{"id":"jr-ac-milan-2026-27-third","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"AC Milan","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/jr-collection/ac-milan-2026-27-third-front.webp","tile":"/assets/jr-collection/ac-milan-2026-27-third-front.webp","backImage":"/assets/jr-collection/ac-milan-2026-27-third-back.webp","backLabel":"Back reconstruction"},{"id":"jr-as-roma-2026-27-away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"AS Roma","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/as-roma-2026-27-away-front.webp","tile":"/assets/jr-collection/as-roma-2026-27-away-front.webp","backImage":"/assets/jr-collection/as-roma-2026-27-away-back.webp","backLabel":"Back reconstruction"},{"id":"jr-arsenal-2026-27-goalkeeper-1-grey","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Goalkeeper","type":"Short Sleeve","subtitle":"2026/27 Goalkeeper 1 Grey","category":"Club Kits","badge":"Goalkeeper","vintage":false,"image":"/assets/jr-collection/arsenal-2026-27-goalkeeper-1-grey-front.webp","tile":"/assets/jr-collection/arsenal-2026-27-goalkeeper-1-grey-front.webp","backImage":"/assets/jr-collection/arsenal-2026-27-goalkeeper-1-grey-back.webp","backLabel":"Back reconstruction"},{"id":"jr-arsenal-2026-27-home-league-patch","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home League Patch","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/arsenal-2026-27-home-league-patch-front.webp","tile":"/assets/jr-collection/arsenal-2026-27-home-league-patch-front.webp","backImage":"/assets/jr-collection/arsenal-2026-27-home-league-patch-back.webp","backLabel":"Back reconstruction"},{"id":"jr-como-1907-2026-27-home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Como 1907","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/como-1907-2026-27-home-front.webp","tile":"/assets/jr-collection/como-1907-2026-27-home-front.webp","backImage":"/assets/jr-collection/como-1907-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"jr-atletico-madrid-2026-27-away-kraken","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Atlético Madrid","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away Kraken","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/atletico-madrid-2026-27-away-kraken-front.webp","tile":"/assets/jr-collection/atletico-madrid-2026-27-away-kraken-front.webp","backImage":"/assets/jr-collection/atletico-madrid-2026-27-away-kraken-back.webp","backLabel":"Back reconstruction"},{"id":"jr-as-monaco-2026-27-home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"AS Monaco","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/as-monaco-2026-27-home-front.webp","tile":"/assets/jr-collection/as-monaco-2026-27-home-front.webp","backImage":"/assets/jr-collection/as-monaco-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"jr-atlante-2026-27-away-110th-caliente","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Atlante FC","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away 110th Caliente","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/atlante-2026-27-away-110th-caliente-front.webp","tile":"/assets/jr-collection/atlante-2026-27-away-110th-caliente-front.webp","backImage":"/assets/jr-collection/atlante-2026-27-away-110th-caliente-back.webp","backLabel":"Back reconstruction"},{"id":"jr-aston-villa-2026-27-home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Aston Villa","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/aston-villa-2026-27-home-front.webp","tile":"/assets/jr-collection/aston-villa-2026-27-home-front.webp","backImage":"/assets/jr-collection/aston-villa-2026-27-home-back.webp","backLabel":"Back reconstruction"},{"id":"jr-aston-villa-white-claret-gold-retro","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Aston Villa","side":"Special","type":"Short Sleeve","subtitle":"White Claret Gold Retro","category":"Club Kits","badge":"Special","vintage":true,"image":"/assets/jr-collection/aston-villa-white-claret-gold-retro-front.webp","tile":"/assets/jr-collection/aston-villa-white-claret-gold-retro-front.webp","backImage":"/assets/jr-collection/aston-villa-white-claret-gold-retro-back.webp","backLabel":"Back preview"},{"id":"jr-atlante-2026-27-home-110th-sponsorless","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Atlante FC","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home 110th Sponsorless","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/atlante-2026-27-home-110th-sponsorless-front.webp","tile":"/assets/jr-collection/atlante-2026-27-home-110th-sponsorless-front.webp","backImage":"/assets/jr-collection/atlante-2026-27-home-110th-sponsorless-back.webp","backLabel":"Back reconstruction"},{"id":"jr-besiktas-2026-27-third","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Beşiktaş","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/jr-collection/besiktas-2026-27-third-front.webp","tile":"/assets/jr-collection/besiktas-2026-27-third-front.webp","backImage":"/assets/jr-collection/besiktas-2026-27-third-back.webp","backLabel":"Back preview"},{"id":"jr-brighton-2026-27-third","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Brighton","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/jr-collection/brighton-2026-27-third-front.webp","tile":"/assets/jr-collection/brighton-2026-27-third-front.webp","backImage":"/assets/jr-collection/brighton-2026-27-third-back.webp","backLabel":"Back"},{"id":"jr-como-1907-2026-27-away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Como 1907","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/como-1907-2026-27-away-front.webp","tile":"/assets/jr-collection/como-1907-2026-27-away-front.webp","backImage":"/assets/jr-collection/como-1907-2026-27-away-back.webp","backLabel":"Back reconstruction"},{"id":"jr-chivas-guadalajara-2026-27-home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chivas Guadalajara","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/chivas-guadalajara-2026-27-home-front.webp","tile":"/assets/jr-collection/chivas-guadalajara-2026-27-home-front.webp","backImage":"/assets/jr-collection/chivas-guadalajara-2026-27-home-back.webp","backLabel":"Back preview"},{"id":"jr-chivas-guadalajara-2026-27-away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chivas Guadalajara","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/chivas-guadalajara-2026-27-away-front.webp","tile":"/assets/jr-collection/chivas-guadalajara-2026-27-away-front.webp","backImage":"/assets/jr-collection/chivas-guadalajara-2026-27-away-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-white-gold-landmarks-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"White Gold Landmarks Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-white-gold-landmarks-polo-front.webp","tile":"/assets/jr-collection/arsenal-white-gold-landmarks-polo-front.webp","backImage":"/assets/jr-collection/arsenal-white-gold-landmarks-polo-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-2026-27-third","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third Yellow","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/stock-studio/arsenal-2026-27-third-yellow-front.webp","tile":"/assets/stock-studio/arsenal-2026-27-third-yellow-tile.webp","backImage":"/assets/stock-studio/arsenal-2026-27-third-yellow-back.webp","backLabel":"Back · studio reconstruction","newPhotos":true},{"id":"jr-atletico-madrid-2026-27-away-plain-sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Atlético Madrid","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away Plain Sleeve","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/atletico-madrid-2026-27-away-plain-sleeve-front.webp","tile":"/assets/jr-collection/atletico-madrid-2026-27-away-plain-sleeve-front.webp","backImage":"/assets/jr-collection/atletico-madrid-2026-27-away-plain-sleeve-back.webp","backLabel":"Back preview"},{"id":"jr-al-nassr-navy-gold-kafd","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Al Nassr","side":"Special","type":"Short Sleeve","subtitle":"Navy Gold KAFD","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/al-nassr-navy-gold-kafd-front.webp","tile":"/assets/jr-collection/al-nassr-navy-gold-kafd-front.webp","backImage":"/assets/jr-collection/al-nassr-navy-gold-kafd-back.webp","backLabel":"Back preview"},{"id":"jr-argentina-navy-retro-afa","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Vintage","type":"Short Sleeve","subtitle":"Navy Light Blue Trefoil Retro","category":"Vintage","badge":"Vintage","vintage":true,"image":"/assets/stock-studio/argentina-navy-light-blue-trefoil-retro-front.webp","tile":"/assets/stock-studio/argentina-navy-light-blue-trefoil-retro-tile.webp","newPhotos":true,"versionNote":"Version to confirm"},{"id":"jr-arsenal-yellow-navy-pinstripe-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Yellow Navy Pinstripe Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-yellow-navy-pinstripe-polo-front.webp","tile":"/assets/jr-collection/arsenal-yellow-navy-pinstripe-polo-front.webp","backImage":"/assets/jr-collection/arsenal-yellow-navy-pinstripe-polo-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-teal-navy-gold-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Teal Navy Gold Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-teal-navy-gold-polo-front.webp","tile":"/assets/jr-collection/arsenal-teal-navy-gold-polo-front.webp","backImage":"/assets/jr-collection/arsenal-teal-navy-gold-polo-back.webp","backLabel":"Back preview"},{"id":"jr-argentina-2026-messi-farewell-goalkeeper","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Goalkeeper","type":"Short Sleeve","subtitle":"2026 Messi Farewell Goalkeeper","category":"International Kits","badge":"Goalkeeper","vintage":false,"image":"/assets/jr-collection/argentina-2026-messi-farewell-goalkeeper-front.webp","tile":"/assets/jr-collection/argentina-2026-messi-farewell-goalkeeper-front.webp","backImage":"/assets/jr-collection/argentina-2026-messi-farewell-goalkeeper-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-navy-white-red-retro","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Navy White Red Retro","category":"Club Kits","badge":"Special","vintage":true,"image":"/assets/jr-collection/arsenal-navy-white-red-retro-front.webp","tile":"/assets/jr-collection/arsenal-navy-white-red-retro-front.webp","backImage":"/assets/jr-collection/arsenal-navy-white-red-retro-back.webp","backLabel":"Back preview"},{"id":"jr-cd-olimpia-2026-27-home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"CD Olimpia","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/cd-olimpia-2026-27-home-front.webp","tile":"/assets/jr-collection/cd-olimpia-2026-27-home-front.webp","backImage":"/assets/jr-collection/cd-olimpia-2026-27-home-back.webp","backLabel":"Back preview"},{"id":"jr-argentina-navy-sky-blue-messi-graphic","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Special","type":"Short Sleeve","subtitle":"Navy Sky Blue Messi Graphic","category":"International Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/argentina-navy-sky-blue-messi-graphic-front.webp","tile":"/assets/jr-collection/argentina-navy-sky-blue-messi-graphic-front.webp","backImage":"/assets/jr-collection/argentina-navy-sky-blue-messi-graphic-back.webp","backLabel":"Back preview"},{"id":"jr-como-1907-black-colour-crest","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Como 1907","side":"Special","type":"Short Sleeve","subtitle":"Black Colour Crest","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/como-1907-black-colour-crest-front.webp","tile":"/assets/jr-collection/como-1907-black-colour-crest-front.webp","backImage":"/assets/jr-collection/como-1907-black-colour-crest-back.webp","backLabel":"Back preview"},{"id":"jr-como-1907-2026-27-third","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Como 1907","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/jr-collection/como-1907-2026-27-third-front.webp","tile":"/assets/jr-collection/como-1907-2026-27-third-front.webp","backImage":"/assets/jr-collection/como-1907-2026-27-third-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-white-green-emirates-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"White Green Emirates Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-white-green-emirates-polo-front.webp","tile":"/assets/jr-collection/arsenal-white-green-emirates-polo-front.webp","backImage":"/assets/jr-collection/arsenal-white-green-emirates-polo-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-black-gold-architectural-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Black Gold Architectural Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-black-gold-architectural-polo-front.webp","tile":"/assets/jr-collection/arsenal-black-gold-architectural-polo-front.webp","backImage":"/assets/jr-collection/arsenal-black-gold-architectural-polo-back.webp","backLabel":"Back preview"},{"id":"jr-argentina-2026-messi-farewell-pre-match","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Special","type":"Short Sleeve","subtitle":"2026 Messi Farewell Pre Match","category":"International Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/argentina-2026-messi-farewell-pre-match-front.webp","tile":"/assets/jr-collection/argentina-2026-messi-farewell-pre-match-front.webp","backImage":"/assets/jr-collection/argentina-2026-messi-farewell-pre-match-back.webp","backLabel":"Back preview"},{"id":"jr-corinthians-116th-anniversary-beige-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Corinthians","side":"Special","type":"Short Sleeve","subtitle":"116th Anniversary Beige Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/corinthians-116th-anniversary-beige-polo-front.webp","tile":"/assets/jr-collection/corinthians-116th-anniversary-beige-polo-front.webp","backImage":"/assets/jr-collection/corinthians-116th-anniversary-beige-polo-back.webp","backLabel":"Back"},{"id":"jr-algeria-2026-pre-match-white-green","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Algeria","side":"Special","type":"Short Sleeve","subtitle":"2026 Pre Match White Green","category":"International Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/algeria-2026-pre-match-white-green-front.webp","tile":"/assets/jr-collection/algeria-2026-pre-match-white-green-front.webp","backImage":"/assets/jr-collection/algeria-2026-pre-match-white-green-back.webp","backLabel":"Back reconstruction"},{"id":"jr-chelsea-2026-27-away-usdc-world-champions","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chelsea","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away USDC World Champions","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/chelsea-2026-27-away-usdc-world-champions-front.webp","tile":"/assets/jr-collection/chelsea-2026-27-away-usdc-world-champions-front.webp","backImage":"/assets/jr-collection/chelsea-2026-27-away-usdc-world-champions-back.webp","backLabel":"Back reconstruction"},{"id":"jr-chelsea-2026-27-home-usdc","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chelsea","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home USDC","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/chelsea-2026-27-home-usdc-front.webp","tile":"/assets/jr-collection/chelsea-2026-27-home-usdc-front.webp","backImage":"/assets/jr-collection/chelsea-2026-27-home-usdc-back.webp","backLabel":"Back reconstruction"},{"id":"jr-argentina-2026-home-world-champions-badge","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Argentina","side":"Home","type":"Short Sleeve","subtitle":"2026 Home World Champions Badge","category":"International Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/argentina-2026-home-world-champions-badge-front.webp","tile":"/assets/jr-collection/argentina-2026-home-world-champions-badge-front.webp","backImage":"/assets/jr-collection/argentina-2026-home-world-champions-badge-back.webp","backLabel":"Back reconstruction"},{"id":"jr-arsenal-2026-27-away-league-patch","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away League Patch","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/arsenal-2026-27-away-league-patch-front.webp","tile":"/assets/jr-collection/arsenal-2026-27-away-league-patch-front.webp","backImage":"/assets/jr-collection/arsenal-2026-27-away-league-patch-back.webp","backLabel":"Back preview"},{"id":"jr-al-nassr-2026-27-third-sponsorless","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Al Nassr","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third Sponsorless","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/jr-collection/al-nassr-2026-27-third-sponsorless-front.webp","tile":"/assets/jr-collection/al-nassr-2026-27-third-sponsorless-front.webp","backImage":"/assets/jr-collection/al-nassr-2026-27-third-sponsorless-back.webp","backLabel":"Back preview"},{"id":"jr-al-nassr-2026-27-away-humain","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Al Nassr","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away HUMAIN","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/al-nassr-2026-27-away-humain-front.webp","tile":"/assets/jr-collection/al-nassr-2026-27-away-humain-front.webp","backImage":"/assets/jr-collection/al-nassr-2026-27-away-humain-back.webp","backLabel":"Back preview"},{"id":"jr-al-nassr-2026-27-home-humain","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Al Nassr","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home HUMAIN","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/al-nassr-2026-27-home-humain-front.webp","tile":"/assets/jr-collection/al-nassr-2026-27-home-humain-front.webp","backImage":"/assets/jr-collection/al-nassr-2026-27-home-humain-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-black-white-graphic-henley","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Black White Graphic Henley","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-black-white-graphic-henley-front.webp","tile":"/assets/jr-collection/arsenal-black-white-graphic-henley-front.webp","backImage":"/assets/jr-collection/arsenal-black-white-graphic-henley-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-black-red-graphic-henley","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Black Red Graphic Henley","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-black-red-graphic-henley-front.webp","tile":"/assets/jr-collection/arsenal-black-red-graphic-henley-front.webp","backImage":"/assets/jr-collection/arsenal-black-red-graphic-henley-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-red-white-graphic-henley","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Red White Graphic Henley","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-red-white-graphic-henley-front.webp","tile":"/assets/jr-collection/arsenal-red-white-graphic-henley-front.webp","backImage":"/assets/jr-collection/arsenal-red-white-graphic-henley-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-green-white-graphic-henley","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"Green White Graphic Henley","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-green-white-graphic-henley-front.webp","tile":"/assets/jr-collection/arsenal-green-white-graphic-henley-front.webp","backImage":"/assets/jr-collection/arsenal-green-white-graphic-henley-back.webp","backLabel":"Back preview"},{"id":"jr-arsenal-2025-26-champions-claret-polo","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Arsenal","side":"Special","type":"Short Sleeve","subtitle":"2025/26 Champions Claret Polo","category":"Club Kits","badge":"Special","vintage":false,"image":"/assets/jr-collection/arsenal-2025-26-champions-claret-polo-front.webp","tile":"/assets/jr-collection/arsenal-2025-26-champions-claret-polo-front.webp","backImage":"/assets/jr-collection/arsenal-2025-26-champions-claret-polo-back.webp","backLabel":"Back preview"},{"id":"jr-chelsea-2026-27-away-sponsorless-world-champions","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chelsea","side":"Away","type":"Short Sleeve","subtitle":"2026/27 Away Sponsorless World Champions","category":"Club Kits","badge":"Away","vintage":false,"image":"/assets/jr-collection/chelsea-2026-27-away-sponsorless-world-champions-front.webp","tile":"/assets/jr-collection/chelsea-2026-27-away-sponsorless-world-champions-front.webp","backImage":"/assets/jr-collection/chelsea-2026-27-away-sponsorless-world-champions-back.webp","backLabel":"Back reconstruction"},{"id":"jr-chelsea-2026-27-third-sponsorless-world-champions","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chelsea","side":"Third","type":"Short Sleeve","subtitle":"2026/27 Third Sponsorless World Champions","category":"Club Kits","badge":"Third","vintage":false,"image":"/assets/jr-collection/chelsea-2026-27-third-sponsorless-world-champions-front.webp","tile":"/assets/jr-collection/chelsea-2026-27-third-sponsorless-world-champions-front.webp","backImage":"/assets/jr-collection/chelsea-2026-27-third-sponsorless-world-champions-back.webp","backLabel":"Back reconstruction"},{"id":"jr-chelsea-2026-27-home-sponsorless-world-champions","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"club":"Chelsea","side":"Home","type":"Short Sleeve","subtitle":"2026/27 Home Sponsorless World Champions","category":"Club Kits","badge":"Home","vintage":false,"image":"/assets/jr-collection/chelsea-2026-27-home-sponsorless-world-champions-front.webp","tile":"/assets/jr-collection/chelsea-2026-27-home-sponsorless-world-champions-front.webp","backImage":"/assets/jr-collection/chelsea-2026-27-home-sponsorless-world-champions-back.webp","backLabel":"Back reconstruction"},{"id":"psg-home","club":"PSG","subtitle":"White Navy Gold Centre Stripe","category":"Club Kits","type":"Short Sleeve","badge":"Jersey","vintage":false,"price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"side":null,"newPhotos":true,"image":"/assets/stock-studio/paris-saint-germain-white-navy-gold-centre-stripe-front.webp","tile":"/assets/stock-studio/paris-saint-germain-white-navy-gold-centre-stripe-tile.webp","versionNote":"Version to confirm"},{"id":"psg-gold","club":"PSG","subtitle":"2025/26 Black Red Gold Special Edition","category":"Special / Retro","type":"Short Sleeve","badge":"Special","price":25000,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"side":"Special","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/paris-saint-germain-2025-26-black-red-gold-special-edition-front.webp","tile":"/assets/stock-studio/paris-saint-germain-2025-26-black-red-gold-special-edition-tile.webp","versionNote":"Version to confirm"},{"id":"liverpool-home-2026-27","club":"Liverpool","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/liverpool-2026-27-home-front.webp","tile":"/assets/stock-studio/liverpool-2026-27-home-tile.webp","backImage":"/assets/stock-studio/liverpool-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"liverpool-away-2026-27","club":"Liverpool","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/liverpool-2026-27-away-front.webp","tile":"/assets/stock-studio/liverpool-2026-27-away-tile.webp","backImage":"/assets/stock-studio/liverpool-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"man-city-home-2026-27","club":"Man City","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/manchester-city-2026-27-home-front.webp","tile":"/assets/stock-studio/manchester-city-2026-27-home-tile.webp","backImage":"/assets/stock-studio/manchester-city-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"man-city-away-2026-27","club":"Man City","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away Worker Bee","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/manchester-city-2026-27-away-worker-bee-front.webp","tile":"/assets/stock-studio/manchester-city-2026-27-away-worker-bee-tile.webp","backImage":"/assets/stock-studio/manchester-city-2026-27-away-worker-bee-back.webp","backLabel":"Back · studio reconstruction"},{"id":"manchester-united-home-2026-27","club":"Manchester United","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home Kit","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/manchester-united-2026-27-home-kit-front.webp","tile":"/assets/stock-studio/manchester-united-2026-27-home-kit-tile.webp","backImage":"/assets/stock-studio/manchester-united-2026-27-home-kit-back.webp","backLabel":"Back"},{"id":"manchester-united-away-2026-27","club":"Manchester United","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away Royal Blue","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/manchester-united-2026-27-away-royal-blue-front.webp","tile":"/assets/stock-studio/manchester-united-2026-27-away-royal-blue-tile.webp","backImage":"/assets/stock-studio/manchester-united-2026-27-away-royal-blue-back.webp","backLabel":"Back"},{"id":"inter-milan-home-2026-27","club":"Inter Milan","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/inter-milan-2026-27-home-front.webp","tile":"/assets/stock-studio/inter-milan-2026-27-home-tile.webp","backImage":"/assets/stock-studio/inter-milan-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"inter-milan-away-2026-27","club":"Inter Milan","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/inter-milan-2026-27-away-front.webp","tile":"/assets/stock-studio/inter-milan-2026-27-away-tile.webp","backImage":"/assets/stock-studio/inter-milan-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"juventus-home-2026-27","club":"Juventus","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/juventus-2026-27-home-front.webp","tile":"/assets/stock-studio/juventus-2026-27-home-tile.webp","backImage":"/assets/stock-studio/juventus-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"juventus-away-2026-27","club":"Juventus","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away Pink","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/juventus-2026-27-away-pink-front.webp","tile":"/assets/stock-studio/juventus-2026-27-away-pink-tile.webp","backImage":"/assets/stock-studio/juventus-2026-27-away-pink-back.webp","backLabel":"Back · studio reconstruction"},{"id":"napoli-home-2026-27","club":"Napoli","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Centenary Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/napoli-2026-27-centenary-home-front.webp","tile":"/assets/stock-studio/napoli-2026-27-centenary-home-tile.webp","backImage":"/assets/stock-studio/napoli-2026-27-centenary-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"marseille-home-2026-27","club":"Marseille","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/olympique-marseille-2026-27-home-front.webp","tile":"/assets/stock-studio/olympique-marseille-2026-27-home-tile.webp","backImage":"/assets/stock-studio/olympique-marseille-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"eintracht-frankfurt-away-2026-27","club":"Eintracht Frankfurt","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/eintracht-frankfurt-2026-27-away-front.webp","tile":"/assets/stock-studio/eintracht-frankfurt-2026-27-away-tile.webp","backImage":"/assets/stock-studio/eintracht-frankfurt-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"orlando-pirates-away-2026-27","club":"Orlando Pirates","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/orlando-pirates-2026-27-away-front.webp","tile":"/assets/stock-studio/orlando-pirates-2026-27-away-tile.webp","backImage":"/assets/stock-studio/orlando-pirates-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"tottenham-hotspur-home-2026-27","club":"Tottenham Hotspur","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/tottenham-hotspur-2026-27-home-front.webp","tile":"/assets/stock-studio/tottenham-hotspur-2026-27-home-tile.webp","backImage":"/assets/stock-studio/tottenham-hotspur-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"tottenham-hotspur-away-2026-27","club":"Tottenham Hotspur","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/tottenham-hotspur-2026-27-away-front.webp","tile":"/assets/stock-studio/tottenham-hotspur-2026-27-away-tile.webp","backImage":"/assets/stock-studio/tottenham-hotspur-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"newcastle-united-home-2026-27","club":"Newcastle United","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home Sponsorless","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/newcastle-united-2026-27-home-sponsorless-front.webp","tile":"/assets/stock-studio/newcastle-united-2026-27-home-sponsorless-tile.webp","backImage":"/assets/stock-studio/newcastle-united-2026-27-home-sponsorless-back.webp","backLabel":"Back · studio reconstruction"},{"id":"newcastle-united-away-2026-27","club":"Newcastle United","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away Brickwork","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/newcastle-united-2026-27-away-brickwork-front.webp","tile":"/assets/stock-studio/newcastle-united-2026-27-away-brickwork-tile.webp","backImage":"/assets/stock-studio/newcastle-united-2026-27-away-brickwork-back.webp","backLabel":"Back · studio reconstruction"},{"id":"real-betis-home-2026-27","club":"Real Betis","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/real-betis-2026-27-home-front.webp","tile":"/assets/stock-studio/real-betis-2026-27-home-tile.webp","backImage":"/assets/stock-studio/real-betis-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"santos-fc-away-2026-27","club":"Santos FC","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/santos-fc-2026-away-front.webp","tile":"/assets/stock-studio/santos-fc-2026-away-tile.webp","backImage":"/assets/stock-studio/santos-fc-2026-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"rb-leipzig-away-2026-27","club":"RB Leipzig","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away Botanical Garden","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/rb-leipzig-2026-27-away-botanical-garden-front.webp","tile":"/assets/stock-studio/rb-leipzig-2026-27-away-botanical-garden-tile.webp","backImage":"/assets/stock-studio/rb-leipzig-2026-27-away-botanical-garden-back.webp","backLabel":"Back · studio reconstruction"},{"id":"spain-home-2026-27","club":"Spain","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home World Champions","category":"International Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/spain-2026-27-home-world-champions-front.webp","tile":"/assets/stock-studio/spain-2026-27-home-world-champions-tile.webp","backImage":"/assets/stock-studio/spain-2026-27-home-world-champions-back.webp","backLabel":"Back · studio reconstruction"},{"id":"spain-away-2026-27","club":"Spain","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away World Champions Two Stars","category":"International Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/spain-2026-27-away-world-champions-two-stars-front.webp","tile":"/assets/stock-studio/spain-2026-27-away-world-champions-two-stars-tile.webp","backImage":"/assets/stock-studio/spain-2026-27-away-world-champions-two-stars-back.webp","backLabel":"Back · studio reconstruction"},{"id":"england-home-2026-27","club":"England","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026 Home","category":"International Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/england-2026-home-front.webp","tile":"/assets/stock-studio/england-2026-home-tile.webp","backImage":"/assets/stock-studio/england-2026-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"england-away-2026-27","club":"England","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026 Away","category":"International Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/england-2026-away-front.webp","tile":"/assets/stock-studio/england-2026-away-tile.webp","backImage":"/assets/stock-studio/england-2026-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"morocco-home-2026-27","club":"Morocco","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026 Home","category":"International Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/morocco-2026-home-front.webp","tile":"/assets/stock-studio/morocco-2026-home-tile.webp","backImage":"/assets/stock-studio/morocco-2026-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"west-ham-home-2026-27","club":"West Ham","side":"Home","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Home","category":"Club Kits","badge":"Home","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/west-ham-united-2026-27-home-front.webp","tile":"/assets/stock-studio/west-ham-united-2026-27-home-tile.webp","backImage":"/assets/stock-studio/west-ham-united-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"aston-villa-away-2026-27","club":"Aston Villa","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away Black Gold","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/aston-villa-2026-27-away-black-gold-front.webp","tile":"/assets/stock-studio/aston-villa-2026-27-away-black-gold-tile.webp","backImage":"/assets/stock-studio/aston-villa-2026-27-away-black-gold-back.webp","backLabel":"Back · studio reconstruction"},{"id":"real-sociedad-away-2026-27","club":"Real Sociedad","side":"Away","type":"Short Sleeve","vintage":false,"subtitle":"2026/27 Away","category":"Club Kits","badge":"Away","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/real-sociedad-2026-27-away-front.webp","tile":"/assets/stock-studio/real-sociedad-2026-27-away-tile.webp","backImage":"/assets/stock-studio/real-sociedad-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-fc-porto-purple-striped-polo","club":"FC Porto","type":"Short Sleeve","subtitle":"2026/27 Away Claret","category":"Club Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/fc-porto-2026-27-away-claret-front.webp","tile":"/assets/stock-studio/fc-porto-2026-27-away-claret-tile.webp","backImage":"/assets/stock-studio/fc-porto-2026-27-away-claret-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-feyenoord-red-and-white-halves","club":"Feyenoord","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/feyenoord-2026-27-home-front.webp","tile":"/assets/stock-studio/feyenoord-2026-27-home-tile.webp","backImage":"/assets/stock-studio/feyenoord-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-los-angeles-fc-black-and-gold-geometric","club":"Los Angeles FC","type":"Short Sleeve","subtitle":"2026 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/los-angeles-fc-2026-home-front.webp","tile":"/assets/stock-studio/los-angeles-fc-2026-home-tile.webp","backImage":"/assets/stock-studio/los-angeles-fc-2026-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-benfica-red-geometric-v-neck","club":"Benfica","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/benfica-2026-27-home-front.webp","tile":"/assets/stock-studio/benfica-2026-27-home-tile.webp","backImage":"/assets/stock-studio/benfica-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-psg-white-with-red-chest-band","club":"PSG","type":"Short Sleeve","subtitle":"White Red Blue Chest Band","category":"Club Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/paris-saint-germain-white-red-blue-chest-band-front.webp","tile":"/assets/stock-studio/paris-saint-germain-white-red-blue-chest-band-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-leeds-united-white-with-blue-and-yellow-hoops","club":"Leeds United","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/leeds-united-2026-27-home-front.webp","tile":"/assets/stock-studio/leeds-united-2026-27-home-tile.webp","backImage":"/assets/stock-studio/leeds-united-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-liverpool-red-checkerboard","club":"Liverpool","type":"Short Sleeve","subtitle":"2027/28 Home Leak Red Checks","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/liverpool-2027-28-home-leak-red-checks-front.webp","tile":"/assets/stock-studio/liverpool-2027-28-home-leak-red-checks-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-lyon-black-with-multicolour-trim","club":"Lyon","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/olympique-lyonnais-2026-27-third-front.webp","tile":"/assets/stock-studio/olympique-lyonnais-2026-27-third-tile.webp","backImage":"/assets/stock-studio/olympique-lyonnais-2026-27-third-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-everton-white-pinstripe","club":"Everton","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/everton-2026-27-away-front.webp","tile":"/assets/stock-studio/everton-2026-27-away-tile.webp","backImage":"/assets/stock-studio/everton-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-fc-metz-maroon-and-gold-polo","club":"FC Metz","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/fc-metz-2026-27-home-front.webp","tile":"/assets/stock-studio/fc-metz-2026-27-home-tile.webp","backImage":"/assets/stock-studio/fc-metz-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-france-blue-monogram","club":"France","type":"Short Sleeve","subtitle":"Blue Monogram Gold Crest","category":"International Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/france-blue-monogram-gold-crest-front.webp","tile":"/assets/stock-studio/france-blue-monogram-gold-crest-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-spain-burgundy-and-gold","club":"Spain","type":"Short Sleeve","subtitle":"Maroon Heritage Special","category":"Special / Retro","side":"Special","badge":"Special","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/spain-maroon-heritage-special-front.webp","tile":"/assets/stock-studio/spain-maroon-heritage-special-tile.webp","versionNote":"Version to confirm","backImage":"/assets/stock-studio/spain-maroon-heritage-special-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-fc-metz-white-with-teal-collar","club":"FC Metz","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/fc-metz-2026-27-away-front.webp","tile":"/assets/stock-studio/fc-metz-2026-27-away-tile.webp","backImage":"/assets/stock-studio/fc-metz-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-inter-miami-white-geometric-polo","club":"Inter Miami","type":"Short Sleeve","subtitle":"2026 Third Cenit","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/inter-miami-2026-third-cenit-front.webp","tile":"/assets/stock-studio/inter-miami-2026-third-cenit-tile.webp","backImage":"/assets/stock-studio/inter-miami-2026-third-cenit-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-napoli-black-and-gold","club":"Napoli","type":"Short Sleeve","subtitle":"Black Gold MSC","category":"Club Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/napoli-black-gold-msc-front.webp","tile":"/assets/stock-studio/napoli-black-gold-msc-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-lille-white-with-blue-collar","club":"Lille","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/lille-2026-27-away-front.webp","tile":"/assets/stock-studio/lille-2026-27-away-tile.webp","backImage":"/assets/stock-studio/lille-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-santos-fc-black-polo-with-white-piping","club":"Santos FC","type":"Short Sleeve","subtitle":"2026 Third Sponsorless","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/santos-fc-2026-third-sponsorless-front.webp","tile":"/assets/stock-studio/santos-fc-2026-third-sponsorless-tile.webp","backImage":"/assets/stock-studio/santos-fc-2026-third-sponsorless-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-al-ittihad-black-and-gold","club":"Al-Ittihad","type":"Short Sleeve","subtitle":"Black Gold Arabic Script Flow","category":"Club Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/al-ittihad-black-gold-arabic-script-flow-front.webp","tile":"/assets/stock-studio/al-ittihad-black-gold-arabic-script-flow-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-lille-black-with-yellow-crest","club":"Lille","type":"Short Sleeve","subtitle":"2026/27 Fourth Flandres","category":"Club Kits","side":"Fourth","badge":"Fourth","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/lille-2026-27-fourth-flandres-front.webp","tile":"/assets/stock-studio/lille-2026-27-fourth-flandres-tile.webp","backImage":"/assets/stock-studio/lille-2026-27-fourth-flandres-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-nottingham-forest-red-tonal-print","club":"Nottingham Forest","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/nottingham-forest-2026-27-home-front.webp","tile":"/assets/stock-studio/nottingham-forest-2026-27-home-tile.webp","backImage":"/assets/stock-studio/nottingham-forest-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-levante-navy-and-white-striped-polo","club":"Levante","type":"Short Sleeve","subtitle":"2026/27 Away Sponsorless","category":"Club Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/levante-2026-27-away-sponsorless-front.webp","tile":"/assets/stock-studio/levante-2026-27-away-sponsorless-tile.webp","backImage":"/assets/stock-studio/levante-2026-27-away-sponsorless-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-morocco-white-and-gold-patterned","club":"Morocco","type":"Short Sleeve","subtitle":"2026 Away","category":"International Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/morocco-2026-away-front.webp","tile":"/assets/stock-studio/morocco-2026-away-tile.webp","backImage":"/assets/stock-studio/morocco-2026-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-liverpool-green-polo-with-gold-trim","club":"Liverpool","type":"Short Sleeve","subtitle":"Green Gold Polo","category":"Club Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/liverpool-green-gold-polo-front.webp","tile":"/assets/stock-studio/liverpool-green-gold-polo-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-spain-white-and-burgundy-single-star","club":"Spain","type":"Short Sleeve","subtitle":"2026 Away One Star","category":"International Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/spain-2026-away-one-star-front.webp","tile":"/assets/stock-studio/spain-2026-away-one-star-tile.webp","backImage":"/assets/stock-studio/spain-2026-away-one-star-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-england-navy-with-multicolour-sides","club":"England","type":"Short Sleeve","subtitle":"Black Three Lions Blue Crest","category":"International Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/england-black-three-lions-blue-crest-front.webp","tile":"/assets/stock-studio/england-black-three-lions-blue-crest-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-juventus-black-with-gold-crest","club":"Juventus","type":"Short Sleeve","subtitle":"2026/27 Third Flames","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/juventus-2026-27-third-flames-front.webp","tile":"/assets/stock-studio/juventus-2026-27-third-flames-tile.webp","backImage":"/assets/stock-studio/juventus-2026-27-third-flames-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-newcastle-united-lilac-v-neck","club":"Newcastle United","type":"Short Sleeve","subtitle":"2026/27 Third Lilac","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/newcastle-united-2026-27-third-lilac-front.webp","tile":"/assets/stock-studio/newcastle-united-2026-27-third-lilac-tile.webp","backImage":"/assets/stock-studio/newcastle-united-2026-27-third-lilac-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-liverpool-black-and-burgundy-checks","club":"Liverpool","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/liverpool-2026-27-third-front.webp","tile":"/assets/stock-studio/liverpool-2026-27-third-tile.webp","backImage":"/assets/stock-studio/liverpool-2026-27-third-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-liverpool-black-angular-print","club":"Liverpool","type":"Short Sleeve","subtitle":"Black Angular Print","category":"Club Kits","side":null,"badge":"Jersey","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/liverpool-black-angular-print-front.webp","tile":"/assets/stock-studio/liverpool-black-angular-print-tile.webp","versionNote":"Version to confirm"},{"id":"jr-photo-man-city-white-with-blue-centre-stripe","club":"Man City","type":"Short Sleeve","subtitle":"2026/27 Third","category":"Club Kits","side":"Third","badge":"Third","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/manchester-city-2026-27-third-front.webp","tile":"/assets/stock-studio/manchester-city-2026-27-third-tile.webp","backImage":"/assets/stock-studio/manchester-city-2026-27-third-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-fulham-white-with-black-and-red-trim","club":"Fulham","type":"Short Sleeve","subtitle":"2026/27 Home","category":"Club Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/fulham-2026-27-home-front.webp","tile":"/assets/stock-studio/fulham-2026-27-home-tile.webp","backImage":"/assets/stock-studio/fulham-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-france-blue-diagonal-stripe-polo","club":"France","type":"Short Sleeve","subtitle":"2026 Home","category":"International Kits","side":"Home","badge":"Home","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/france-2026-home-front.webp","tile":"/assets/stock-studio/france-2026-home-tile.webp","backImage":"/assets/stock-studio/france-2026-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"jr-photo-tigres-uanl-navy-and-yellow-away","club":"Tigres UANL","type":"Short Sleeve","subtitle":"2026/27 Away","category":"Club Kits","side":"Away","badge":"Away","vintage":false,"price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"newPhotos":true,"image":"/assets/stock-studio/tigres-uanl-2026-27-away-front.webp","tile":"/assets/stock-studio/tigres-uanl-2026-27-away-tile.webp","backImage":"/assets/stock-studio/tigres-uanl-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-afc-bournemouth-2026-27-home","club":"AFC Bournemouth","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/afc-bournemouth-2026-27-home-front.webp","tile":"/assets/stock-studio/afc-bournemouth-2026-27-home-tile.webp","backImage":"/assets/stock-studio/afc-bournemouth-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-afc-bournemouth-2026-27-third","club":"AFC Bournemouth","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/afc-bournemouth-2026-27-third-front.webp","tile":"/assets/stock-studio/afc-bournemouth-2026-27-third-tile.webp","backImage":"/assets/stock-studio/afc-bournemouth-2026-27-third-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-arsenal-burgundy-white-sleeves-zip-neck-o2","club":"Arsenal","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Burgundy White Sleeves Zip Neck O₂","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/arsenal-burgundy-white-sleeves-zip-neck-o2-front.webp","tile":"/assets/stock-studio/arsenal-burgundy-white-sleeves-zip-neck-o2-tile.webp","versionNote":"Version to confirm"},{"id":"studio-arsenal-green-special-edition","club":"Arsenal","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Green Special Edition","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/arsenal-green-special-edition-front.webp","tile":"/assets/stock-studio/arsenal-green-special-edition-tile.webp","versionNote":"Version to confirm","backImage":"/assets/stock-studio/arsenal-green-special-edition-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-arsenal-red-white-brushstroke-collage","club":"Arsenal","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Red White Brushstroke Collage","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/arsenal-red-white-brushstroke-collage-front.webp","tile":"/assets/stock-studio/arsenal-red-white-brushstroke-collage-tile.webp","versionNote":"Version to confirm"},{"id":"studio-arsenal-royal-blue-gold-geometric","club":"Arsenal","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Royal Blue Gold Geometric","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/arsenal-royal-blue-gold-geometric-front.webp","tile":"/assets/stock-studio/arsenal-royal-blue-gold-geometric-tile.webp","versionNote":"Version to confirm"},{"id":"studio-atletico-mineiro-2026-third-orange","club":"Atletico Mineiro","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026 Third Orange","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/atletico-mineiro-2026-third-orange-front.webp","tile":"/assets/stock-studio/atletico-mineiro-2026-third-orange-tile.webp"},{"id":"studio-barcelona-2027-28-home-leak-pinstripe-polo","club":"Barcelona","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2027/28 Home Leak Pinstripe Polo","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/barcelona-2027-28-home-leak-pinstripe-polo-front.webp","tile":"/assets/stock-studio/barcelona-2027-28-home-leak-pinstripe-polo-tile.webp","versionNote":"Version to confirm"},{"id":"studio-barcelona-blue-claret-half-and-half-sponsorless","club":"Barcelona","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Blue Claret Half And Half Sponsorless","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/barcelona-blue-claret-half-and-half-sponsorless-front.webp","tile":"/assets/stock-studio/barcelona-blue-claret-half-and-half-sponsorless-tile.webp","versionNote":"Version to confirm"},{"id":"studio-barcelona-navy-paint-splash-neon-spotify","club":"Barcelona","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Navy Paint Splash Neon Spotify","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/barcelona-navy-paint-splash-neon-spotify-front.webp","tile":"/assets/stock-studio/barcelona-navy-paint-splash-neon-spotify-tile.webp","versionNote":"Version to confirm"},{"id":"studio-chelsea-2026-27-third-usdc","club":"Chelsea","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third USDC","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/chelsea-2026-27-third-usdc-front.webp","tile":"/assets/stock-studio/chelsea-2026-27-third-usdc-tile.webp","backImage":"/assets/stock-studio/chelsea-2026-27-third-usdc-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-club-america-pale-yellow-trefoil-retro","club":"Club America","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Pale Yellow Trefoil Retro","side":"Vintage","badge":"Vintage","category":"Vintage","vintage":true,"newPhotos":true,"image":"/assets/stock-studio/club-america-pale-yellow-trefoil-retro-front.webp","tile":"/assets/stock-studio/club-america-pale-yellow-trefoil-retro-tile.webp","versionNote":"Version to confirm"},{"id":"studio-eintracht-frankfurt-2026-27-home","club":"Eintracht Frankfurt","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/eintracht-frankfurt-2026-27-home-front.webp","tile":"/assets/stock-studio/eintracht-frankfurt-2026-27-home-tile.webp","backImage":"/assets/stock-studio/eintracht-frankfurt-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-england-2026-red-gold-special-edition","club":"England","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026 Red Gold Special Edition","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/england-2026-red-gold-special-edition-front.webp","tile":"/assets/stock-studio/england-2026-red-gold-special-edition-tile.webp","versionNote":"Version to confirm"},{"id":"studio-france-navy-gold-ornamental-sleeves","club":"France","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Navy Gold Ornamental Sleeves","side":null,"badge":"Jersey","category":"International Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/france-navy-gold-ornamental-sleeves-front.webp","tile":"/assets/stock-studio/france-navy-gold-ornamental-sleeves-tile.webp","versionNote":"Version to confirm"},{"id":"studio-france-navy-ornate-diagonal-tricolour","club":"France","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Navy Ornate Diagonal Tricolour","side":null,"badge":"Jersey","category":"International Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/france-navy-ornate-diagonal-tricolour-front.webp","tile":"/assets/stock-studio/france-navy-ornate-diagonal-tricolour-tile.webp","versionNote":"Version to confirm"},{"id":"studio-germany-2026-special-edition-black-gold","club":"Germany","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026 Special Edition Black Gold","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/germany-2026-special-edition-black-gold-front.webp","tile":"/assets/stock-studio/germany-2026-special-edition-black-gold-tile.webp","backImage":"/assets/stock-studio/germany-2026-special-edition-black-gold-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-iraq-2026-away","club":"Iraq","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026 Away","side":"Away","badge":"Away","category":"International Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/iraq-2026-away-front.webp","tile":"/assets/stock-studio/iraq-2026-away-tile.webp","backImage":"/assets/stock-studio/iraq-2026-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-iraq-2026-home","club":"Iraq","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026 Home","side":"Home","badge":"Home","category":"International Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/iraq-2026-home-front.webp","tile":"/assets/stock-studio/iraq-2026-home-tile.webp","backImage":"/assets/stock-studio/iraq-2026-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-italy-white-blue-trefoil-polo","club":"Italy","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"White Blue Trefoil Polo","side":null,"badge":"Jersey","category":"International Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/italy-white-blue-trefoil-polo-front.webp","tile":"/assets/stock-studio/italy-white-blue-trefoil-polo-tile.webp","versionNote":"Version to confirm"},{"id":"studio-levante-2026-27-fourth-valencian-tiles","club":"Levante","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Fourth Valencian Tiles","side":"Fourth","badge":"Fourth","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/levante-2026-27-fourth-valencian-tiles-front.webp","tile":"/assets/stock-studio/levante-2026-27-fourth-valencian-tiles-tile.webp","backImage":"/assets/stock-studio/levante-2026-27-fourth-valencian-tiles-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-levante-2026-27-home-sponsorless","club":"Levante","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home Sponsorless","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/levante-2026-27-home-sponsorless-front.webp","tile":"/assets/stock-studio/levante-2026-27-home-sponsorless-tile.webp","backImage":"/assets/stock-studio/levante-2026-27-home-sponsorless-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-liverpool-black-gold-polo-turkish-airlines","club":"Liverpool","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Black Gold Polo Turkish Airlines","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/liverpool-black-gold-polo-turkish-airlines-front.webp","tile":"/assets/stock-studio/liverpool-black-gold-polo-turkish-airlines-tile.webp","versionNote":"Version to confirm"},{"id":"studio-liverpool-yellow-black-polo-turkish-airlines","club":"Liverpool","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Yellow Black Polo Turkish Airlines","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/liverpool-yellow-black-polo-turkish-airlines-front.webp","tile":"/assets/stock-studio/liverpool-yellow-black-polo-turkish-airlines-tile.webp","versionNote":"Version to confirm"},{"id":"studio-mamelodi-sundowns-yellow-green-ubuntu-botho","club":"Mamelodi Sundowns","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Yellow Green Ubuntu Botho","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/mamelodi-sundowns-yellow-green-ubuntu-botho-front.webp","tile":"/assets/stock-studio/mamelodi-sundowns-yellow-green-ubuntu-botho-tile.webp","versionNote":"Version to confirm"},{"id":"studio-manchester-united-1990s-retro-red-black-vneck","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"1990s Retro Red Black V-Neck","side":"Vintage","badge":"Vintage","category":"Vintage","vintage":true,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-1990s-retro-red-black-vneck-front.webp","tile":"/assets/stock-studio/manchester-united-1990s-retro-red-black-vneck-tile.webp","backImage":"/assets/stock-studio/manchester-united-1990s-retro-red-black-vneck-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-2026-27-stealth-blackout-special","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Stealth Blackout Special","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-2026-27-stealth-blackout-special-front.webp","tile":"/assets/stock-studio/manchester-united-2026-27-stealth-blackout-special-tile.webp","backImage":"/assets/stock-studio/manchester-united-2026-27-stealth-blackout-special-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-2026-27-third-cream","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third Cream","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-2026-27-third-cream-front.webp","tile":"/assets/stock-studio/manchester-united-2026-27-third-cream-tile.webp","backImage":"/assets/stock-studio/manchester-united-2026-27-third-cream-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-2026-27-white-polo","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 White Polo","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-2026-27-white-polo-front.webp","tile":"/assets/stock-studio/manchester-united-2026-27-white-polo-tile.webp","backImage":"/assets/stock-studio/manchester-united-2026-27-white-polo-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-crimson-sharp-special","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Crimson Sharp Special","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-crimson-sharp-special-front.webp","tile":"/assets/stock-studio/manchester-united-crimson-sharp-special-tile.webp"},{"id":"studio-manchester-united-red-white-side-panels-polo-snapdragon","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Red White Side Panels Polo Snapdragon","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-red-white-side-panels-polo-snapdragon-front.webp","tile":"/assets/stock-studio/manchester-united-red-white-side-panels-polo-snapdragon-tile.webp","versionNote":"Version to confirm"},{"id":"studio-manchester-united-retro-black-flame-sharp","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Retro Black Flame Sharp","side":"Vintage","badge":"Vintage","category":"Vintage","vintage":true,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-retro-black-flame-sharp-front.webp","tile":"/assets/stock-studio/manchester-united-retro-black-flame-sharp-tile.webp","backImage":"/assets/stock-studio/manchester-united-retro-black-flame-sharp-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-retro-red-black-gradient-polo","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Retro Red Black Gradient Polo","side":"Vintage","badge":"Vintage","category":"Vintage","vintage":true,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-retro-red-black-gradient-polo-front.webp","tile":"/assets/stock-studio/manchester-united-retro-red-black-gradient-polo-tile.webp","backImage":"/assets/stock-studio/manchester-united-retro-red-black-gradient-polo-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-spiderman-crimson-sharp-special","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Spider-Man Crimson Sharp Special","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-spiderman-crimson-sharp-special-front.webp","tile":"/assets/stock-studio/manchester-united-spiderman-crimson-sharp-special-tile.webp","backImage":"/assets/stock-studio/manchester-united-spiderman-crimson-sharp-special-back.webp","backLabel":"Back"},{"id":"studio-manchester-united-white-red-polo-snapdragon-sleeve-patch","club":"Manchester United","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"White Red Polo Snapdragon Sleeve Patch","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/manchester-united-white-red-polo-snapdragon-sleeve-patch-front.webp","tile":"/assets/stock-studio/manchester-united-white-red-polo-snapdragon-sleeve-patch-tile.webp","versionNote":"Version to confirm"},{"id":"studio-napoli-2026-27-third-tutto-il-rosso-di-napoli","club":"Napoli","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third Tutto Il Rosso Di Napoli","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/napoli-2026-27-third-tutto-il-rosso-di-napoli-front.webp","tile":"/assets/stock-studio/napoli-2026-27-third-tutto-il-rosso-di-napoli-tile.webp","backImage":"/assets/stock-studio/napoli-2026-27-third-tutto-il-rosso-di-napoli-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-orlando-pirates-2026-27-home","club":"Orlando Pirates","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/orlando-pirates-2026-27-home-front.webp","tile":"/assets/stock-studio/orlando-pirates-2026-27-home-tile.webp","backImage":"/assets/stock-studio/orlando-pirates-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-orlando-pirates-2026-27-third-soweto","club":"Orlando Pirates","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third Soweto","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/orlando-pirates-2026-27-third-soweto-front.webp","tile":"/assets/stock-studio/orlando-pirates-2026-27-third-soweto-tile.webp","backImage":"/assets/stock-studio/orlando-pirates-2026-27-third-soweto-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-paris-saint-germain-2026-27-special-edition-paint-splatter-player-version","club":"PSG","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Special Edition Paint Splatter Player Version","side":"Special","badge":"Special","category":"Special / Retro","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/paris-saint-germain-2026-27-special-edition-paint-splatter-player-version-front.webp","tile":"/assets/stock-studio/paris-saint-germain-2026-27-special-edition-paint-splatter-player-version-tile.webp","versionNote":"Version to confirm"},{"id":"studio-paris-saint-germain-black-iridescent-centre-jordan","club":"PSG","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Black Iridescent Centre Jordan","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/paris-saint-germain-black-iridescent-centre-jordan-front.webp","tile":"/assets/stock-studio/paris-saint-germain-black-iridescent-centre-jordan-tile.webp","versionNote":"Version to confirm"},{"id":"studio-paris-saint-germain-red-black-gradient-central-crest-jordan","club":"PSG","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Red Black Gradient Central Crest Jordan","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/paris-saint-germain-red-black-gradient-central-crest-jordan-front.webp","tile":"/assets/stock-studio/paris-saint-germain-red-black-gradient-central-crest-jordan-tile.webp","versionNote":"Version to confirm"},{"id":"studio-portugal-ronaldo-7-multicolour-graphic-polo","club":"Portugal","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Ronaldo 7 Multicolour Graphic Polo","side":null,"badge":"Jersey","category":"International Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/portugal-ronaldo-7-multicolour-graphic-polo-front.webp","tile":"/assets/stock-studio/portugal-ronaldo-7-multicolour-graphic-polo-tile.webp","versionNote":"Version to confirm"},{"id":"studio-rb-leipzig-2026-27-home","club":"RB Leipzig","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/rb-leipzig-2026-27-home-front.webp","tile":"/assets/stock-studio/rb-leipzig-2026-27-home-tile.webp","backImage":"/assets/stock-studio/rb-leipzig-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-raja-club-athletic-2026-27-home-sponsorless","club":"Raja Club Athletic","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home Sponsorless","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/raja-club-athletic-2026-27-home-sponsorless-front.webp","tile":"/assets/stock-studio/raja-club-athletic-2026-27-home-sponsorless-tile.webp"},{"id":"studio-real-madrid-black-gold-shoulder-stripes-polo","club":"Real Madrid","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Black Gold Shoulder Stripes Polo","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/real-madrid-black-gold-shoulder-stripes-polo-front.webp","tile":"/assets/stock-studio/real-madrid-black-gold-shoulder-stripes-polo-tile.webp","versionNote":"Version to confirm"},{"id":"studio-real-madrid-black-white-collar-trefoil","club":"Real Madrid","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Black White Collar Trefoil","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/real-madrid-black-white-collar-trefoil-front.webp","tile":"/assets/stock-studio/real-madrid-black-white-collar-trefoil-tile.webp","versionNote":"Version to confirm"},{"id":"studio-real-madrid-purple-aqua-gradient","club":"Real Madrid","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Purple Aqua Gradient","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/real-madrid-purple-aqua-gradient-front.webp","tile":"/assets/stock-studio/real-madrid-purple-aqua-gradient-tile.webp","versionNote":"Version to confirm"},{"id":"studio-real-madrid-white-gold-shoulder-stripe-trefoil","club":"Real Madrid","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"White Gold Shoulder Stripe Trefoil","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/real-madrid-white-gold-shoulder-stripe-trefoil-front.webp","tile":"/assets/stock-studio/real-madrid-white-gold-shoulder-stripe-trefoil-tile.webp","versionNote":"Version to confirm"},{"id":"studio-team-unconfirmed-gold-black-broad-stripes-white-cuffs","club":"Team Unconfirmed","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"Gold Black Broad Stripes White Cuffs","side":null,"badge":"Jersey","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/team-unconfirmed-gold-black-broad-stripes-white-cuffs-front.webp","tile":"/assets/stock-studio/team-unconfirmed-gold-black-broad-stripes-white-cuffs-tile.webp","versionNote":"Team and version to confirm"},{"id":"studio-tottenham-hotspur-2026-27-third-psychic-purple","club":"Tottenham Hotspur","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third Psychic Purple","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/tottenham-hotspur-2026-27-third-psychic-purple-front.webp","tile":"/assets/stock-studio/tottenham-hotspur-2026-27-third-psychic-purple-tile.webp","backImage":"/assets/stock-studio/tottenham-hotspur-2026-27-third-psychic-purple-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-venezia-2026-27-home","club":"Venezia","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Home","side":"Home","badge":"Home","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/venezia-2026-27-home-front.webp","tile":"/assets/stock-studio/venezia-2026-27-home-tile.webp","backImage":"/assets/stock-studio/venezia-2026-27-home-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-villarreal-2026-27-away","club":"Villarreal","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Away","side":"Away","badge":"Away","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/villarreal-2026-27-away-front.webp","tile":"/assets/stock-studio/villarreal-2026-27-away-tile.webp","backImage":"/assets/stock-studio/villarreal-2026-27-away-back.webp","backLabel":"Back · studio reconstruction"},{"id":"studio-west-ham-united-2026-27-third-bubbles","club":"West Ham","type":"Short Sleeve","price":null,"stock":"check","sizes":{"S":"check","M":"check","L":"check","XL":"check","XXL":"check"},"subtitle":"2026/27 Third Bubbles","side":"Third","badge":"Third","category":"Club Kits","vintage":false,"newPhotos":true,"image":"/assets/stock-studio/west-ham-united-2026-27-third-bubbles-front.webp","tile":"/assets/stock-studio/west-ham-united-2026-27-third-bubbles-tile.webp","backImage":"/assets/stock-studio/west-ham-united-2026-27-third-bubbles-back.webp","backLabel":"Back · studio reconstruction"}],"prices":{"Short Sleeve":25000,"Long Sleeve":32000,"Kids Kit":25000,"Training Kit":35000,"Track Top":40000},"sizes":["S","M","L","XL","XXL"],"collections":[["All","All kits"],["New photos","New photos"],["Dar clubs","Dar clubs"],["Club Kits","Club kits"],["International Kits","National teams"],["Vintage","Vintage"],["Special / Retro","Special editions"],["Kids Kits","Kids"],["Training Kits","Training"]],"aliases":{"Young Africans SC":"Yanga Bebee Kuu","Simba SC":"Mawingu ya Boma","Azam FC":"Wanalambalamba","Tottenham Hotspur":"Spurs","Newcastle United":"Magpies","Bayer Leverkusen":"Werkself","Athletic Club":"Athletic Bilbao","Al Nassr":"Al-Nassr","Santos FC":"Peixe","Tanzania":"Taifa Stars","Nigeria":"Super Eagles","Morocco":"Atlas Lions","Senegal":"Teranga Lions","Egypt":"Pharaohs","Ivory Coast":"Elephants Cote d'Ivoire","Ghana":"Black Stars","Cameroon":"Indomitable Lions","England":"Three Lions","Netherlands":"Holland Oranje","USA":"United States USMNT","Japan":"Samurai Blue","South Korea":"Korea Republic","West Ham":"West Ham United","Al-Ittihad":"Al Ittihad","Lyon":"Olympique Lyonnais","Marseille":"Olympique Marseille","Man City":"Manchester City","PSG":"Paris Saint-Germain"},"phone":"255763760220","kitTypes":[{"key":"All","label":"All Items"},{"key":"Home","label":"Home shirts"},{"key":"Away","label":"Away shirts"},{"key":"Third","label":"Third shirts"},{"key":"Kits & Jerseys","label":"Kits & Jerseys"},{"key":"Long Sleeves","label":"Long Sleeve Shirts"},{"key":"Short Sleeves","label":"Short Sleeve Shirts"},{"key":"Sleeveless","label":"Sleeveless & Tank Tops"},{"key":"Special / Retro","label":"Special editions"},{"key":"Vintage","label":"Vintage"},{"key":"Kids Kits","label":"Kids Full Kits"},{"key":"Training Kits","label":"Training Kits"},{"key":"Track Tops","label":"LS Training / Track Tops"}],"clubs":["AC Milan","Al Nassr","Arsenal","AS Roma","Aston Villa","Atlante FC","Atlético Madrid","Barcelona","Bayer Leverkusen","Bayern Munich","Brighton","Chelsea","Como 1907","Eintracht Frankfurt","Inter Miami","Inter Milan","Juventus","Liverpool","Mamelodi Sundowns","Man City","Manchester United","Marseille","Napoli","Newcastle United","Orlando Pirates","PSG","RB Leipzig","Real Betis","Real Madrid","Real Sociedad","Santos FC","Tottenham Hotspur","Villarreal","West Ham","AS Monaco","Beşiktaş","Chivas Guadalajara","CD Olimpia","Corinthians","FC Porto","Feyenoord","Los Angeles FC","Benfica","Leeds United","Lyon","Everton","FC Metz","Lille","Al-Ittihad","Nottingham Forest","Levante","Fulham","Tigres UANL","AFC Bournemouth","Atletico Mineiro","Club America","Raja Club Athletic","Venezia"],"nations":["Argentina","England","France","Germany","Italy","Morocco","Portugal","Spain","Algeria","Iraq"],"statusLabels":{"in":"In stock","out":"Out of stock","check":"Check availability"},"printing":{"name":5000,"number":5000},"wardrobes":{"Barcelona":["barcelona-home-2026-27","barcelona-away-2026-27","barcelona-green-frost","barcelona-sant-jordi","barcelona-kobe-mamba-gk","barcelona-kobe-lightning","barcelona-home-golf-wang","barcelona-teal-golf-wang","barcelona-cactus-jack","barcelona-olivia-rodrigo","barcelona-blackout-futura","barcelona-kobe-burgundy","barcelona-offwhite-retro"]}};
  const { products, collections, prices, hero, sizes, aliases, statusLabels, phone, clubs, nations, kitTypes } = catalogue;
  const formatPrint = line => [
    line.printName && 'Print name: ' + line.printName,
    line.printNumber && 'Print number: ' + line.printNumber,
  ].filter(Boolean).join(' · ');
  const printPrice = line => (line.printName ? catalogue.printing.name : 0)
    + (line.printNumber ? catalogue.printing.number : 0);
  const byId = new Map(products.map(kit => [kit.id, kit]));
  const whatsApp = message => 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message);
  const search = get('search');
  const team = get('team');
  const type = get('type');
  const availability = get('availability');
  const detail = get('detail-dialog');
  const bagDialog = get('bag-dialog');
  let category = 'All';
  let limit = pageSize;
  let cart = readCart();
  let slide = 0;
  let timer;
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let noticeTimer;

  function readCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(saved) ? saved.filter(line => {
        const kit = byId.get(line?.jerseyId);
        return kit && sizes.includes(line.size) && kit.sizes[line.size] !== 'out'
          && Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 99;
      }).map(line => ({ ...line, ...normalizePrint(line) })) : [];
    } catch {
      return [];
    }
  }

  function normalizePrint(line) {
    return {
      printName: typeof line.printName === 'string' ? line.printName.trim().slice(0, 25) : '',
      printNumber: /^\d{1,2}$/.test(line.printNumber ?? '') ? String(line.printNumber) : '',
    };
  }

  function addLines(lines) {
    const next = cart.map(line => ({ ...line }));
    for (const line of lines) {
      const print = normalizePrint(line);
      const item = next.find(entry => entry.jerseyId === line.jerseyId && entry.size === line.size
        && entry.printName === print.printName && entry.printNumber === print.printNumber);
      if (item?.quantity >= 99) {
        notify('A matching jersey already has 99 in your bag.');
        return false;
      }
      if (item) item.quantity += 1;
      else next.push({ jerseyId: line.jerseyId, size: line.size, quantity: 1, ...print });
    }
    cart = next;
    saveCart();
    return true;
  }

  function saveCart() {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* Storage can be blocked. */ }
    updateBagCount();
  }

  function notify(message, showBag = false) {
    const notice = get('notice');
    get('notice-copy').textContent = message;
    get('view-bag').hidden = !showBag;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, showBag ? 7000 : 3400);
  }

  function showSlide(index) {
    slide = (index + hero.length) % hero.length;
    const item = hero[slide];
    get('hero-tag').textContent = item.tag;
    get('hero-title').textContent = item.title;
    get('hero-text').textContent = item.text;
    get('hero-shop').textContent = item.cta;
    get('hero-shop').href = item.href ?? '#catalogue';
    get('hero-panel').dataset.theme = item.theme ?? '';
    get('hero-image').src = asset(item.img);
    get('hero-image').alt = item.title;
    get('hero-panel').style.setProperty('--hero-image', 'url("' + asset(item.img) + '")');
    dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === slide)));
  }

  function resetTimer() {
    clearInterval(timer);
    if (!paused && !document.hidden) timer = setInterval(() => showSlide(slide + 1), 4000);
  }

  function changeSlide(index) {
    showSlide(index);
    resetTimer();
  }

  function renderPause() {
    get('pause').textContent = paused ? '▶' : 'Ⅱ';
    get('pause').setAttribute('aria-label', paused ? 'Play slideshow' : 'Pause slideshow');
  }

  const dots = hero.map((item, i) => {
    const dot = button('', () => changeSlide(i));
    dot.setAttribute('aria-label', 'Go to slide ' + (i + 1) + ': ' + item.title);
    get('hero-dots').append(dot);
    return dot;
  });
  showSlide(0);
  renderPause();
  if (!wardrobePage) {
    resetTimer();
    document.addEventListener('visibilitychange', resetTimer);
  }
  get('previous').onclick = () => changeSlide(slide - 1);
  get('next').onclick = () => changeSlide(slide + 1);
  get('pause').onclick = () => {
    paused = !paused;
    renderPause();
    resetTimer();
  };

  function addOption(parent, value, label = value) {
    parent.append(new Option(label, value));
  }

  function addTeamGroup(label, names) {
    const group = element('optgroup');
    group.label = label;
    [...new Set(names)].forEach(name => addOption(group, name));
    team.append(group);
  }

  addOption(team, 'All', 'All teams');
  addTeamGroup('Clubs', [...clubs, ...products.map(kit => kit.club).filter(name => !nations.includes(name))].sort());
  addTeamGroup('National teams', [...nations].sort());
  for (const item of kitTypes) addOption(type, item.key, item.key === 'All' ? 'All types' : item.label);
  addOption(availability, 'All', 'All stock statuses');
  for (const [key, label] of Object.entries(statusLabels)) addOption(availability, key, label);

  const collectionButtons = collections.map(([key, label]) => {
    const control = button(label, () => {
      category = key;
      filtersChanged();
    });
    get('collections').append(control);
    return [key, control];
  });

  function matches(kit, key) {
    switch (key) {
      case 'All': return true;
      case 'New photos': return kit.newPhotos === true;
      case 'Home': case 'Away': case 'Third': return kit.side === key;
      case 'Dar clubs': return ['Simba SC', 'Young Africans SC', 'Azam FC'].includes(kit.club);
      case 'Club Kits': return clubs.includes(kit.club) || kit.category === key;
      case 'International Kits': return nations.includes(kit.club) || kit.category === key;
      case 'Vintage': return kit.vintage === true;
      case 'Special / Retro': return kit.category === key && !kit.vintage;
      case 'Training Kits': case 'Training': return ['Training Kit', 'Track Top'].includes(kit.type) || /training/i.test(kit.subtitle);
      case 'Kits & Jerseys': return ['Short Sleeve', 'Long Sleeve', 'Kids Kit'].includes(kit.type);
      case 'Sleeveless': return kit.type === 'Training Kit' && /vest|sleeveless|tank/i.test(kit.subtitle);
      case 'Short Sleeves': return kit.type === 'Short Sleeve';
      case 'Long Sleeves': return kit.type === 'Long Sleeve';
      case 'Kids Kits': return kit.type === 'Kids Kit' || kit.category === key;
      default: return kit.type === key || kit.category === key;
    }
  }

  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function renderCatalogue() {
    const query = normalize(search.value.trim());
    const filtered = products.filter(kit =>
      matches(kit, category) && matches(kit, type.value)
      && (team.value === 'All' || kit.club === team.value)
      && (availability.value === 'All' || kit.stock === availability.value)
      && normalize([kit.club, kit.subtitle, kit.type, kit.category, aliases[kit.club], kit.vintage ? 'vintage retro' : ''].join(' ')).includes(query)
    );
    for (const [key, control] of collectionButtons) control.setAttribute('aria-pressed', String(key === category));
    get('results').textContent = filtered.length + (filtered.length === 1 ? ' kit' : ' kits');
    get('clear').hidden = category === 'All' && team.value === 'All' && type.value === 'All' && availability.value === 'All' && !query;
    get('more').hidden = limit >= filtered.length;
    get('grid').replaceChildren(...filtered.slice(0, limit).map(renderCard));
    if (!filtered.length) get('grid').append(element('p', 'No matching kits. Try another team or clear your filters.', 'muted'));
  }

  function renderCard(kit) {
    const card = get('card-template').content.cloneNode(true);
    const find = selector => card.querySelector(selector);
    const title = kit.club + ' ' + kit.subtitle;
    const imageButton = find('.photo');
    imageButton.setAttribute('aria-label', 'View ' + title);
    imageButton.onclick = () => openKit(kit);
    const imagePath = kit.tile ?? kit.image;
    if (imagePath) {
      const image = photo(imagePath, title);
      image.loading = 'lazy';
      image.decoding = 'async';
      const fallback = find('.fallback');
      fallback.hidden = true;
      image.addEventListener('error', () => { fallback.hidden = false; });
      imageButton.insertBefore(image, find('.badge'));
    }
    find('.badge').textContent = kit.feature ?? (kit.badge === 'Local' ? 'Dar club' : kit.badge === 'New' ? (kit.side ?? 'Club kit') : (kit.badge ?? kit.side));
    find('.kit-type').textContent = kit.type;
    const stock = find('.stock');
    stock.textContent = statusLabels[kit.stock];
    stock.dataset.stock = kit.stock;
    const name = find('.kit-name');
    name.textContent = kit.club;
    name.onclick = () => openKit(kit);
    find('.variant').textContent = kit.subtitle;
    find('.price').textContent = kit.price ? money(kit.price) : 'Ask for price';
    const choose = find('.choose');
    choose.textContent = kit.price ? '＋ Size' : '＋ View';
    choose.setAttribute('aria-label', (kit.price ? 'Choose size for ' : 'View details for ') + title);
    choose.onclick = () => openKit(kit);
    return card;
  }

  function filtersChanged() {
    limit = pageSize;
    renderCatalogue();
  }

  function browse(collection = 'All', selectedTeam = 'All') {
    category = collection;
    team.value = selectedTeam;
    type.value = 'All';
    availability.value = 'All';
    search.value = '';
    filtersChanged();
  }

  if (!wardrobePage) {
    get('shop').onclick = () => browse();
    get('dar').onclick = () => browse('Dar clubs');
  } else {
    get('dar').href = './index.html?collection=dar#catalogue';
  }
  get('hero-shop').onclick = () => {
    if (!hero[slide].href) browse(hero[slide].category, hero[slide].team ?? 'All');
  };
  get('clear').onclick = () => browse();
  get('focus-search').onclick = () => {
    get('catalogue').scrollIntoView();
    search.focus({ preventScroll: true });
  };
  get('toggle-filters').onclick = () => {
    const panel = get('filters');
    panel.hidden = !panel.hidden;
    get('toggle-filters').setAttribute('aria-expanded', String(!panel.hidden));
  };
  get('more').onclick = () => {
    limit += pageSize;
    renderCatalogue();
    const cards = get('grid').querySelectorAll('.photo');
    cards[limit - pageSize]?.focus({ preventScroll: true });
  };
  search.addEventListener('input', filtersChanged);
  for (const field of [team, type, availability]) field.addEventListener('change', filtersChanged);

  get('chat').href = whatsApp('Hello JR Kits! I have a question about your jerseys.');
  for (const trigger of document.querySelectorAll('[data-price]')) trigger.onclick = () => get('price-dialog').showModal();
  for (const [label, cost] of Object.entries({ ...prices, 'Name printing': catalogue.printing.name, 'Number printing (up to two digits)': catalogue.printing.number })) {
    const row = element('div');
    row.append(element('dt', label), element('dd', money(cost)));
    get(Object.hasOwn(prices, label) ? 'price-list' : 'printing-prices').append(row);
  }

  function openKit(kit, entry) {
    let selected = sizes.includes(entry?.size) && kit.sizes[entry.size] !== 'out' ? entry.size : kit.sizes.L !== 'out' ? 'L' : sizes.find(size => kit.sizes[size] !== 'out') ?? 'L';
    get('detail-title').textContent = kit.club + ' · ' + kit.subtitle;
    const body = get('detail-body');
    const columns = element('div', '', 'detail-grid');
    const visual = element('div');
    const information = element('div', '', 'kit-information');
    const front = kit.image ?? kit.tile;
    if (front) {
      const frame = element('div', '', 'gallery-frame');
      const image = photo(front, kit.club + ' ' + kit.subtitle, 'gallery-image');
      image.draggable = false;
      const lens = button('', () => setZoom(!zoomed), 'gallery-lens');
      const stage = button('', () => setZoom(!zoomed), 'gallery-stage');
      let zoomed = false;

      function setZoom(active) {
        zoomed = active;
        frame.classList.toggle('magnified', active);
        for (const control of [lens, stage]) {
          control.setAttribute('aria-label', active ? 'Zoom out' : 'Zoom in');
          control.setAttribute('aria-pressed', String(active));
        }
        lens.textContent = active ? '−' : '+';
        image.style.transformOrigin = '50% 50%';
      }
      function pan(event) {
        if (!zoomed) return;
        const bounds = stage.getBoundingClientRect();
        const percent = value => Math.min(100, Math.max(0, value * 100));
        image.style.transformOrigin = percent((event.clientX - bounds.left) / bounds.width) + '% '
          + percent((event.clientY - bounds.top) / bounds.height) + '%';
      }
      let startPoint;
      let moved = false;
      stage.onpointerdown = event => {
        moved = false;
        startPoint = [event.clientX, event.clientY];
        if (zoomed) stage.setPointerCapture(event.pointerId);
      };
      stage.onpointermove = event => {
        if (startPoint && Math.hypot(event.clientX - startPoint[0], event.clientY - startPoint[1]) > 5) moved = true;
        pan(event);
      };
      stage.onpointerup = stage.onpointercancel = () => { startPoint = null; };
      stage.addEventListener('click', event => {
        if (moved && event.detail) event.stopImmediatePropagation();
        moved = false;
      }, true);
      setZoom(false);
      stage.append(image);
      frame.append(stage, lens);
      visual.append(frame);
      const gallery = [['Front', front], ...(kit.gallery || [])];
      if (kit.backImage) gallery.push([kit.backLabel || 'Back', kit.backImage]);
      if (gallery.length > 1) {
        const thumbs = element('div', '', 'gallery-thumbs');
        const views = gallery.map(([label, path]) => {
          const thumb = button('', () => {
            image.hidden = false;
            image.src = asset(path);
            image.alt = kit.club + ' ' + kit.subtitle + ' · ' + label;
            setZoom(false);
            views.forEach(other => other.setAttribute('aria-pressed', String(other === thumb)));
          });
          thumb.setAttribute('aria-label', 'View ' + label.toLowerCase() + ' photo');
          thumb.setAttribute('aria-pressed', String(label === 'Front'));
          thumb.append(photo(path, '', 'thumb-image'));
          thumbs.append(thumb);
          return thumb;
        });
        visual.append(thumbs);
      }
    } else {
      visual.append(element('p', 'Request a kit photo on WhatsApp.', 'muted'));
    }
    const priceRow = element('div', '', 'kit-price-row');
    const stock = element('span', '', 'kit-stock');
    priceRow.append(element('strong', kit.price ? money(kit.price) : 'Ask for price'), stock);
    information.append(element('span', kit.badge || kit.type, 'kit-tag'), element('h2', kit.club),
      element('p', kit.subtitle, 'kit-edition'));
    if (kit.versionNote) information.append(element('p', kit.versionNote, 'muted'));
    information.append(priceRow, element('strong', 'Choose your size', 'size-label'));
    const buttons = element('div', '', 'sizes');
    const status = element('p', '', 'muted');
    status.setAttribute('role', 'status');
    const printing = element('details', '', 'printing');
    printing.open = Boolean(entry?.printName || entry?.printNumber);
    printing.append(element('summary', 'Custom printing'));
    const nameLabel = element('label', 'Name · +' + money(catalogue.printing.name));
    const printName = element('input');
    printName.maxLength = 25;
    printName.placeholder = 'e.g. YAMAL';
    printName.value = entry?.printName ?? '';
    nameLabel.append(printName);
    const numberLabel = element('label', 'Number (up to two digits) · +' + money(catalogue.printing.number));
    const printNumber = element('input');
    printNumber.inputMode = 'numeric';
    printNumber.maxLength = 2;
    printNumber.placeholder = 'e.g. 10';
    printNumber.value = entry?.printNumber ?? '';
    numberLabel.append(printNumber);
    printNumber.oninput = () => {
      printNumber.value = printNumber.value.replace(/\D/g, '').slice(0, 2);
      updatePrint();
    };
    printName.oninput = updatePrint;
    const estimate = element('p', '', 'printing-total');
    estimate.setAttribute('aria-live', 'polite');
    printing.append(nameLabel, numberLabel, estimate);
    const action = element('div', '', 'detail-order');
    const line = () => ({ jerseyId: kit.id, size: selected, ...normalizePrint({ printName: printName.value, printNumber: printNumber.value }) });
    const sizesButtons = sizes.map(size => {
      const control = button(size, () => { selected = size; updateSelection(); });
      buttons.append(control);
      return control;
    });

    function updatePrint() {
      const extra = printPrice(line());
      estimate.textContent = kit.price ? 'Per jersey: ' + money(kit.price + extra)
        : extra ? 'Printing: ' + money(extra) + ' · Jersey price to confirm' : 'Jersey price to confirm';
    }

    function updateSelection() {
      sizesButtons.forEach((control, i) => control.setAttribute('aria-pressed', String(sizes[i] === selected)));
      stock.textContent = statusLabels[kit.sizes[selected]];
      status.textContent = kit.sizes[selected] === 'check' ? 'JR Kits will confirm size ' + selected + ' on WhatsApp.' : 'Size ' + selected + ' · ' + stock.textContent;
      const add = button(kit.price ? 'Add to bag' : 'Add to bag for quote', () => {
        if (!addLines([line()])) return;
        detail.close();
        notify(kit.club + ' · Size ' + selected + ' added to bag', true);
      }, 'button dark');
      add.disabled = kit.sizes[selected] === 'out';
      const save = button(entry ? 'Save wardrobe jersey' : 'Save to my wardrobe', () => {
        if (wardrobe.pin(line())) detail.close();
        else status.textContent = wardrobe.fullMessage;
      }, 'button');
      action.replaceChildren(add, save);
      if (entry) action.append(button('Remove from wardrobe', () => {
        wardrobe.remove(kit.id);
        detail.close();
      }, 'button'));
      if (kit.sizes[selected] === 'out' || (!kit.price && !kit.wardrobe)) {
        const link = element('a', 'Ask on WhatsApp', 'button');
        link.href = whatsApp('Hello JR Kits! Could you confirm the availability and price of '
          + kit.club + ' · ' + kit.subtitle + ', size ' + selected + '?');
        link.target = '_blank';
        link.rel = 'noopener';
        action.append(link);
      }
    }
    updatePrint();
    updateSelection();
    information.append(buttons, status, printing, action);
    columns.append(visual, information);
    body.replaceChildren(columns);
    detail.showModal();
  }

  function updateBagCount() {
    const count = cart.reduce((sum, line) => sum + line.quantity, 0);
    get('bag-count').textContent = count;
    get('open-bag').setAttribute('aria-label', 'Open bag, ' + count + (count === 1 ? ' item' : ' items'));
  }

  const hasQuote = () => cart.some(line => byId.get(line.jerseyId).price == null);
  function subtotal() {
    return cart.reduce((sum, line) => sum + ((byId.get(line.jerseyId).price ?? 0) + printPrice(line)) * line.quantity, 0);
  }

  function orderMessage() {
    const items = cart.map(line => {
      const kit = byId.get(line.jerseyId);
      const cost = kit.price == null ? 'jersey price to confirm' : money(kit.price);
      const printing = formatPrint(line);
      return [kit.club + ' · ' + kit.subtitle, kit.type + ' · Size ' + line.size + ' · Qty ' + line.quantity + ' · ' + cost,
        printing && printing + ' (' + money(printPrice(line)) + ' per jersey)'].filter(Boolean).join('\n');
    });
    const name = get('customer').value.trim();
    const area = get('area').value.trim();
    return ['Hello JR KITS! I would like to order:', ...items, hasQuote() ? 'Known subtotal (excluding jerseys awaiting a quote): ' + money(subtotal()) : 'Estimated total: ' + money(subtotal()),
      name && 'Name: ' + name, area && 'Dar delivery area: ' + area,
      'Please confirm availability and delivery in Dar es Salaam. Thank you!'].filter(Boolean).join('\n\n');
  }

  function updateCheckout() {
    get('total').textContent = money(subtotal());
    get('total-label').textContent = hasQuote() ? 'Known subtotal · Jersey quotes pending' : 'Order total';
    const message = orderMessage();
    get('whatsapp').href = whatsApp(message);
    get('copy').textContent = 'Copy order message';
    const copyField = get('copy-field');
    if (copyField) copyField.value = message;
  }

  function renderBag() {
    const rows = cart.map(line => {
      const kit = byId.get(line.jerseyId);
      const row = element('div', '', 'bag-item');
      const info = element('div');
      const preview = element('div', '', 'bag-photo');
      if (kit.image || kit.tile) preview.append(photo(kit.image || kit.tile, kit.club + ' ' + kit.subtitle));
      else preview.textContent = 'Photo unavailable';
      info.className = 'bag-info';
      const size = element('p', '', 'bag-size');
      size.append(element('strong', 'Size ' + line.size), '  ·  ' + kit.type);
      info.append(element('strong', kit.club), element('p', kit.subtitle), size);
      if (formatPrint(line)) info.append(element('p', formatPrint(line) + ' · +' + money(printPrice(line)) + ' per jersey'));
      const controls = element('div', '', 'quantity');
      function setQuantity(quantity, selector) {
        const index = cart.indexOf(line);
        if (quantity === 0) cart.splice(index, 1);
        else line.quantity = quantity;
        saveCart();
        renderBag();
        const updated = get('bag-items').children[Math.min(index, cart.length - 1)];
        const focus = updated?.querySelector(selector + ':not(:disabled)') || updated?.querySelector('button');
        (focus || bagDialog.querySelector('button')).focus({preventScroll:true});
      }
      const minus = button('−', () => setQuantity(line.quantity - 1, '.decrease'), 'decrease');
      const plus = button('+', () => setQuantity(line.quantity + 1, '.increase'), 'increase');
      minus.setAttribute('aria-label', 'Decrease quantity of ' + kit.club);
      plus.setAttribute('aria-label', 'Increase quantity of ' + kit.club);
      plus.disabled = line.quantity >= 99;
      controls.append(minus, element('strong', String(line.quantity)), plus);
      const remove = button('', () => setQuantity(0, '.remove-line'), 'remove-line');
      remove.setAttribute('aria-label', 'Remove ' + kit.club + ' ' + kit.subtitle + ' size ' + line.size);
      remove.innerHTML = '<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 9v8m4-8v8"/></svg>';
      const amount = kit.price == null ? 'Price to confirm' : money((kit.price + printPrice(line)) * line.quantity);
      const lineBottom = element('div', '', 'bag-line-bottom');
      lineBottom.append(controls, element('strong', amount, 'line-price'));
      row.append(preview, info, remove, lineBottom);
      return row;
    });
    get('bag-items').replaceChildren(...rows);
    if (!cart.length) get('bag-items').append(get('empty-bag').content.cloneNode(true));
    const count = cart.reduce((sum, line) => sum + line.quantity, 0);
    get('drawer-count').textContent = count;
    get('bag-summary').textContent = count + (count === 1 ? ' kit · ' : ' kits · ') + money(subtotal()) + (hasQuote() ? ' + quote pending' : '');
    get('checkout').hidden = get('delivery').hidden = !cart.length;
    updateCheckout();
  }

  function openBag() {
    get('notice').hidden = true;
    renderBag();
    bagDialog.showModal();
  }
  get('open-bag').onclick = openBag;
  get('view-bag').onclick = openBag;
  for (const field of [get('customer'), get('area')]) field.addEventListener('input', updateCheckout);
  get('copy').onclick = async () => {
    const control = get('copy');
    try {
      await navigator.clipboard.writeText(orderMessage());
      control.textContent = 'Order message copied';
    } catch {
      get('copy-field').focus();
      get('copy-field').select();
    }
  };

  const wardrobe = setupWardrobe({ get, element, button, photo, products, sizes, teamOrder: catalogue.wardrobes.Barcelona, openKit, addLines,
    notify, onBag: openBag, wardrobePage, personal });
  updateBagCount();
  if (!wardrobePage) {
    get('latest-grid').replaceChildren(...catalogue.wardrobes.Barcelona.map(id => byId.get(id)).filter(kit => kit?.feature).map(renderCard));
    if (page.get('collection') === 'dar') browse('Dar clubs');
    else if (page.get('collection') === 'new-photos') browse('New photos');
    else renderCatalogue();
    const linkedKit = byId.get(page.get('kit'));
    if (linkedKit) openKit(linkedKit);
  }
}

start().catch(error => {
  if (wardrobePage) get('rack-status').textContent = 'The wardrobe could not load. Refresh the page to try again.';
  get('results').textContent = 'The catalogue could not load. Refresh the page to try again.';
  console.error(error);
});

})();
