import { setupWardrobe } from './wardrobe.js';

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
  const response = await fetch('./catalog.json');
  if (!response.ok) throw new Error('Catalogue unavailable');
  const catalogue = await response.json();
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
    get('dar').href = './?collection=dar#catalogue';
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
