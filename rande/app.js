(() => {
  'use strict';

  const CONFIG = {
    email: 'micek.andrej1@gmail.com',
    // FormSubmit.co: bez registrácie a bez kľúča. Prvé odoslanie pošle na e-mail
    // aktivačný odkaz; až po jeho potvrdení chodia odpovede. Po aktivácii sa dá
    // e-mail v URL nahradiť náhodným reťazcom, ktorý FormSubmit pošle v tom e-maile.
    endpoint: 'https://formsubmit.co/ajax/micek.andrej1@gmail.com',
    storageKey: 'datebloom-v2',
    timeZone: 'Europe/Bratislava',
    totalSteps: 6,
    // o koľko minút dopredu najskôr môže byť rande, ak je vybraný dnešok
    leadMinutes: 60,
    maxDaysAhead: 365,
    dateDurationHours: 2,
  };

  const TIME_GROUPS = [
    { label: 'Obed', from: '11:00', to: '14:00' },
    { label: 'Popoludnie', from: '14:30', to: '17:30' },
    { label: 'Večer', from: '18:00', to: '22:00' },
  ];

  const FOODS = [
    { id: 'pizza', emoji: '🍕', name: 'Pizza' },
    { id: 'sushi', emoji: '🍣', name: 'Sushi' },
    { id: 'burger', emoji: '🍔', name: 'Burger' },
    { id: 'pasta', emoji: '🍝', name: 'Cestoviny' },
    { id: 'tacos', emoji: '🌮', name: 'Tacos' },
    { id: 'ramen', emoji: '🍜', name: 'Ramen' },
    { id: 'steak', emoji: '🥩', name: 'Steak' },
    { id: 'surprise', emoji: '🎲', name: 'Prekvap ma' },
  ];

  const HINTS = [
    'psst… tlačidlo NIE je trochu hanblivé',
    'Ups, ušlo ti. Náhoda? 🙈',
    'Skús to ešte raz… alebo radšej nie 😏',
    'To tlačidlo dnes nepracuje.',
    'ÁNO je hneď tam. To veľké, ružové.',
    'Toto nie je chyba. To je funkcia. 💅',
    'Obdivujem tvoju vytrvalosť. Odpoveď je stále ÁNO.',
    'Ešte chvíľu a ÁNO zaberie celú obrazovku.',
    'Mimochodom, každý pokus počítam. 📈',
  ];
  const HINTS_LOOP = ['Nie je možnosť.', 'Vzdaj to, láska. ❤️', 'Stále nie. Teda… stále áno.', 'Ešte stále to skúšaš? 😄'];
  const NO_LABELS = ['Nie', 'Určite?', 'Naozaj?', 'Hmm…', '🙈', 'Skús znova', 'Nie nie', 'Prečo?', 'Nikdy'];

  // ---------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (min, max) => min + Math.random() * (max - min);
  const pad2 = (n) => String(n).padStart(2, '0');
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayISO = () => toISO(new Date());
  const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fromMinutes = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const daysFromToday = (iso) => Math.round((fromISO(iso) - startOfToday()) / 86400000);

  const fmtLong = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtNoYear = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtDayMonth = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'long' });
  const fmtMonth = new Intl.DateTimeFormat('sk-SK', { month: 'long', year: 'numeric' });
  const fmtWeekday = new Intl.DateTimeFormat('sk-SK', { weekday: 'long' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (iso) => fmtLong.format(fromISO(iso));
  const shortDate = (iso) => { const d = fromISO(iso); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
  const friendlyDate = (iso) => {
    const d = fromISO(iso);
    return d.getFullYear() === new Date().getFullYear() ? fmtNoYear.format(d) : fmtLong.format(d);
  };
  // „dnes“, „zajtra“, „v sobotu“, „vo štvrtok“, alebo „3. októbra“
  const ON_DAY = ['v nedeľu', 'v pondelok', 'v utorok', 'v stredu', 'vo štvrtok', 'v piatok', 'v sobotu'];
  function whenPhrase(iso) {
    const diff = daysFromToday(iso);
    if (diff === 0) return 'dnes';
    if (diff === 1) return 'zajtra';
    if (diff > 1 && diff < 7) return ON_DAY[fromISO(iso).getDay()];
    return fmtDayMonth.format(fromISO(iso));
  }

  function formatDuration(ms) {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ${s % 60} s`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  const TIME_SLOTS = TIME_GROUPS.map((g) => {
    const times = [];
    for (let t = toMinutes(g.from); t <= toMinutes(g.to); t += 30) times.push(fromMinutes(t));
    return { label: g.label, times };
  });
  const ALL_TIMES = TIME_SLOTS.flatMap((g) => g.times);
  const foodById = (id) => FOODS.find((f) => f.id === id);

  // ---------------------------------------------------------------- state
  const defaults = () => ({
    step: 1, date: null, time: null, food: null,
    noAttempts: 0, yesAt: null, thinkMs: null, submitted: false, submittedAt: null, paid: false,
  });

  function load() {
    try {
      if (new URLSearchParams(location.search).has('reset')) {
        localStorage.removeItem(CONFIG.storageKey);
        history.replaceState(null, '', location.pathname);
        return defaults();
      }
      const raw = localStorage.getItem(CONFIG.storageKey);
      return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
    } catch (_) {
      return defaults();
    }
  }
  function save() {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); } catch (_) { /* súkromné okno */ }
  }

  const state = load();
  const openedAt = Date.now();

  // ---------------------------------------------------------------- availability
  function slotOk(dateISO, hhmm) {
    if (!hhmm) return false;
    if (!dateISO || dateISO !== todayISO()) return true;
    return toMinutes(hhmm) >= nowMinutes() + CONFIG.leadMinutes;
  }
  function dayOk(dateISO) {
    const d = fromISO(dateISO);
    const today = startOfToday();
    if (d < today || d > addDays(today, CONFIG.maxDaysAhead)) return false;
    if (dateISO === todayISO()) return ALL_TIMES.some((t) => slotOk(dateISO, t));
    return true;
  }
  const whenOk = () => !!(state.date && dayOk(state.date) && slotOk(state.date, state.time));

  // Odoslané: už len kroky 5–6. Inak sa nedá preskočiť nič, čo ešte nie je vyplnené.
  function clampStep(step) {
    if (state.submitted) return Math.min(6, Math.max(5, step));
    const max = !state.yesAt ? 1 : !whenOk() ? 3 : 4;
    return Math.max(1, Math.min(step, max));
  }

  // ---------------------------------------------------------------- navigation
  const card = $('#card');
  const steps = $$('.step', card);

  function goTo(step, { push = true, focus = true } = {}) {
    step = clampStep(step);
    state.step = step;
    save();

    card.dataset.current = String(step);
    steps.forEach((el) => { el.hidden = Number(el.dataset.step) !== step; });
    $('#stepNum').textContent = step;
    $('#progressFill').style.width = `${(step / CONFIG.totalSteps) * 100}%`;

    render(step);
    if (push) history.pushState({ step }, '');
    else history.replaceState({ step }, '');

    if (focus) {
      const heading = $(`.step[data-step="${step}"] .title, .step[data-step="${step}"] .ag-title`);
      heading && heading.focus({ preventScroll: true });
      if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
    if (step === 1) requestAnimationFrame(() => No.reset());
  }

  window.addEventListener('popstate', (e) => {
    const target = e.state && e.state.step;
    if (target) goTo(target, { push: false });
  });

  card.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    const next = e.target.closest('[data-next]');
    if (back) goTo(state.step - 1);
    if (next && !next.disabled) goTo(state.step + 1);
  });

  function render(step) {
    if (step === 3) renderWhen();
    if (step === 4) renderFoods();
    if (step === 5) renderPickup();
    if (step === 6) renderAgreement();
  }

  // ---------------------------------------------------------------- 1: ÁNO
  const yesBtn = $('#yesBtn');
  yesBtn.addEventListener('click', (e) => {
    if (yesBtn.dataset.busy) return;
    yesBtn.dataset.busy = '1';
    if (!state.yesAt) { state.yesAt = Date.now(); state.thinkMs = state.yesAt - openedAt; }
    save();
    const r = yesBtn.getBoundingClientRect();
    burst(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, 26);
    setTimeout(() => { delete yesBtn.dataset.busy; goTo(2); confetti(); }, reducedMotion ? 0 : 650);
  });

  // ---------------------------------------------------------------- step 1: NIE (neklikateľné)
  const No = (() => {
    const btn = $('#noBtn');
    const slot = $('#noSlot');
    const hint = $('#noHint');
    const title = $('#q1Title');
    const DANGER = 70; // px okolo tlačidla, kde už myš „straší“
    let pos = { x: 0, y: 0 };
    let moved = false;
    let rot = 0;
    let scale = 1;
    let last = 0;

    const origin = () => {
      const c = card.getBoundingClientRect();
      return { x: c.left + card.clientLeft, y: c.top + card.clientTop };
    };
    const localRect = (el) => {
      const o = origin();
      const r = el.getBoundingClientRect();
      return { left: r.left - o.x, top: r.top - o.y, right: r.right - o.x, bottom: r.bottom - o.y };
    };
    const inflate = (r, m) => ({ left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m });
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    function apply(animate) {
      btn.style.transition = animate ? '' : 'none';
      btn.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${rot}deg) scale(${scale})`;
      if (!animate) { void btn.offsetWidth; btn.style.transition = ''; }
    }

    function syncSlot() {
      slot.style.width = `${btn.offsetWidth}px`;
      slot.style.height = `${btn.offsetHeight}px`;
    }

    function reset() {
      if (state.step !== 1) return;
      if (!moved) {
        syncSlot();
        const s = localRect(slot);
        pos = { x: s.left, y: s.top };
        apply(false);
      } else {
        clampIntoCard();
      }
      btn.classList.add('is-placed');
    }

    function clampIntoCard() {
      const padding = 12;
      const maxX = Math.max(padding, card.clientWidth - btn.offsetWidth - padding);
      const maxY = Math.max(padding, card.clientHeight - btn.offsetHeight - padding);
      const x = Math.min(Math.max(pos.x, padding), maxX);
      const y = Math.min(Math.max(pos.y, padding), maxY);
      if (x !== pos.x || y !== pos.y) { pos = { x, y }; apply(true); }
    }

    // Kde tlačidlo NIE bude (cieľová pozícia, nie stred animácie), v súradniciach okna.
    function targetRect() {
      const o = origin();
      const w = btn.offsetWidth, h = btn.offsetHeight;
      const cx = o.x + pos.x + w / 2, cy = o.y + pos.y + h / 2;
      return { left: cx - (w * scale) / 2, right: cx + (w * scale) / 2, top: cy - (h * scale) / 2, bottom: cy + (h * scale) / 2 };
    }
    const distTo = (px, py, r) => Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom));

    // ÁNO rastie, takže ho obchádzame s rezervou na jeho maximálnu veľkosť.
    function yesZone() {
      const r = localRect(yesBtn);
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const w = yesBtn.offsetWidth * 1.4, h = yesBtn.offsetHeight * 1.4;
      return inflate({ left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 }, 14);
    }

    function pickSpot(px, py) {
      const o = origin();
      const cursor = { x: px - o.x, y: py - o.y };
      const W = card.clientWidth, H = card.clientHeight;
      const w = btn.offsetWidth, h = btn.offsetHeight;
      const padding = 14;
      const avoid = [yesZone(), inflate(localRect(title), 6)];
      const yesNow = inflate(localRect(yesBtn), 8);
      const minDist = Math.min(240, Math.max(130, Math.min(W, H) * 0.34));
      // Počas letu nesmie NIE preletieť cez ÁNO, inak by klik „na NIE“ trafil ÁNO.
      const crossesYes = (x, y) => {
        for (let t = 0.1; t < 1.15; t += 0.1) { // 1.1 = prekmit pružinovej animácie
          const lx = pos.x + (x - pos.x) * t, ly = pos.y + (y - pos.y) * t;
          if (overlaps(yesNow, { left: lx, top: ly, right: lx + w, bottom: ly + h })) return true;
        }
        return false;
      };

      const tryPass = (useAvoid) => {
        const good = [];
        let best = null;
        for (let i = 0; i < 80; i++) {
          const x = padding + Math.random() * Math.max(0, W - w - padding * 2);
          const y = padding + Math.random() * Math.max(0, H - h - padding * 2);
          const r = { left: x, top: y, right: x + w, bottom: y + h };
          if (useAvoid && (avoid.some((a) => overlaps(a, r)) || crossesYes(x, y))) continue;
          const d = Math.hypot(x + w / 2 - cursor.x, y + h / 2 - cursor.y);
          const jump = Math.hypot(x - pos.x, y - pos.y);
          if (d >= minDist && jump > 70) good.push({ x, y, d });
          if (!best || d > best.d) best = { x, y, d };
        }
        if (good.length) {
          // radšej kúsok ďalej než na druhý koniec sveta: vyberá z bližšej polovice
          good.sort((a, b) => a.d - b.d);
          const pool = good.slice(0, Math.max(1, Math.ceil(good.length / 2)));
          return pool[Math.floor(Math.random() * pool.length)];
        }
        return best;
      };
      return tryPass(true) || tryPass(false) || { x: padding, y: padding };
    }

    function dodge(px, py) {
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      moved = true;

      state.noAttempts += 1;
      save();

      const n = state.noAttempts;
      scale = Math.max(0.74, 1 - n * 0.025);
      rot = rand(-9, 9);
      card.style.setProperty('--yes-scale', String(Math.min(1.35, 1 + n * 0.035)));

      btn.textContent = NO_LABELS[n % NO_LABELS.length];
      const spot = pickSpot(px, py);
      pos = { x: spot.x, y: spot.y };
      apply(!reducedMotion);

      hint.textContent = n < HINTS.length ? HINTS[n] : HINTS_LOOP[(n - HINTS.length) % HINTS_LOOP.length];
      hint.classList.remove('bump');
      void hint.offsetWidth;
      hint.classList.add('bump');
    }

    // Myš: uhne skôr, než sa k nemu kurzor dostane.
    let lastVisualCheck = 0;
    window.addEventListener('pointermove', (e) => {
      if (state.step !== 1 || e.pointerType === 'touch') return;
      let d = distTo(e.clientX, e.clientY, targetRect());
      const now = performance.now();
      if (now - lastVisualCheck > 40) {
        lastVisualCheck = now;
        d = Math.min(d, distTo(e.clientX, e.clientY, btn.getBoundingClientRect()) + 10);
      }
      if (d < DANGER) dodge(e.clientX, e.clientY);
    }, { passive: true });

    // Prst / pero / čokoľvek, čo sa ho dotkne: uhne a klik sa nikdy nedokončí.
    const fromEvent = (e) => {
      const t = e.touches && e.touches[0];
      if (t) return [t.clientX, t.clientY];
      if (typeof e.clientX === 'number' && (e.clientX || e.clientY)) return [e.clientX, e.clientY];
      const r = btn.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    const block = (e) => { e.preventDefault(); e.stopPropagation(); dodge(...fromEvent(e)); };
    btn.addEventListener('touchstart', block, { passive: false });
    btn.addEventListener('pointerdown', block);
    btn.addEventListener('mousedown', block);
    btn.addEventListener('click', block);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', block);
    btn.addEventListener('focus', () => { btn.blur(); const r = btn.getBoundingClientRect(); dodge(r.left + r.width / 2, r.top + r.height / 2); });
    // Tlačidlo NIE nemá žiadnu akciu. Neexistuje cesta k odmietnutiu.

    new ResizeObserver(() => reset()).observe(card);
    window.addEventListener('resize', reset);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reset);

    return { reset };
  })();

  // ---------------------------------------------------------------- 3: kedy (deň + čas)
  const dateField = $('#dateField');
  const datePop = $('#datePop');
  const timeSelect = $('#timeSelect');
  const whenError = $('#whenError');
  let viewMonth = null; // prvý deň zobrazeného mesiaca

  function showWhenError(msg) {
    whenError.textContent = msg || '';
    whenError.hidden = !msg;
  }

  function renderWhen() {
    const dv = $('#dateValue');
    const hasDate = state.date && dayOk(state.date);
    if (!hasDate) state.date = null;
    dv.textContent = hasDate ? friendlyDate(state.date) : 'vyber deň';
    dv.classList.toggle('is-empty', !hasDate);

    if (state.time && !slotOk(state.date, state.time)) state.time = null;
    let html = `<option value="" disabled ${state.time ? '' : 'selected'}>vyber čas</option>`;
    TIME_SLOTS.forEach((g) => {
      const opts = g.times.filter((t) => slotOk(state.date, t));
      if (!opts.length) return; // dnes už prešlo
      html += `<optgroup label="${g.label}">${opts.map((t) => `<option value="${t}" ${state.time === t ? 'selected' : ''}>${t}</option>`).join('')}</optgroup>`;
    });
    timeSelect.innerHTML = html;
    timeSelect.classList.toggle('is-empty', !state.time);

    $('#next3').disabled = !whenOk();
    save();
  }

  function setPop(open) {
    datePop.hidden = !open;
    dateField.setAttribute('aria-expanded', String(open));
    if (open) {
      const base = state.date ? fromISO(state.date) : startOfToday();
      viewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
      renderQuickDates();
      renderCalendar();
    }
  }
  dateField.addEventListener('click', () => setPop(datePop.hidden));
  document.addEventListener('click', (e) => {
    // e.target môže byť už odpojený (kalendár sa pri listovaní prekreslí)
    if (!datePop.hidden && e.target.isConnected && !e.target.closest('.field-wrap')) setPop(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !datePop.hidden) { setPop(false); dateField.focus(); }
  });

  function quickDateOptions() {
    const today = startOfToday();
    const out = [];
    const push = (d, label) => {
      const iso = toISO(d);
      if (!dayOk(iso) || out.some((o) => o.iso === iso)) return;
      out.push({ iso, label });
    };
    push(today, 'Dnes');
    push(addDays(today, 1), 'Zajtra');
    for (let i = 2; i <= 8 && out.length < 5; i++) {
      const d = addDays(today, i);
      if ([5, 6, 0].includes(d.getDay())) push(d, `${cap(fmtWeekday.format(d))} ${d.getDate()}. ${d.getMonth() + 1}.`);
    }
    return out.slice(0, 5);
  }

  function renderQuickDates() {
    $('#quickDates').innerHTML = quickDateOptions()
      .map((o) => `<button type="button" class="chip" data-date="${o.iso}" aria-pressed="${state.date === o.iso}">${o.label}</button>`)
      .join('');
  }

  function renderCalendar() {
    const today = startOfToday();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = addDays(today, CONFIG.maxDaysAhead);
    const lastMonth = new Date(last.getFullYear(), last.getMonth(), 1);
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7; // pondelok ako prvý
    const tISO = todayISO();

    let html = `
      <div class="cal-head">
        <button class="cal-nav" type="button" data-cal="-1" aria-label="Predchádzajúci mesiac" ${viewMonth <= first ? 'disabled' : ''}>‹</button>
        <div class="cal-title" aria-live="polite">${fmtMonth.format(viewMonth)}</div>
        <button class="cal-nav" type="button" data-cal="1" aria-label="Ďalší mesiac" ${viewMonth >= lastMonth ? 'disabled' : ''}>›</button>
      </div>
      <div class="cal-grid">
        ${['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'].map((d) => `<div class="cal-dow" aria-hidden="true">${d}</div>`).join('')}
        ${'<span></span>'.repeat(lead)}`;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(y, m, day);
      const iso = toISO(d);
      const cls = ['cal-day'];
      if (d.getDay() === 0 || d.getDay() === 6) cls.push('is-weekend');
      if (iso === tISO) cls.push('is-today');
      html += `<button type="button" class="${cls.join(' ')}" data-date="${iso}" aria-pressed="${state.date === iso}" aria-label="${fmtLong.format(d)}" ${dayOk(iso) ? '' : 'disabled'}>${day}</button>`;
    }
    $('#calendar').innerHTML = `${html}</div>`;
  }

  datePop.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal]');
    const day = e.target.closest('[data-date]');
    if (nav && !nav.disabled) {
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + Number(nav.dataset.cal), 1);
      renderCalendar();
    }
    if (day && !day.disabled) pickDate(day.dataset.date);
  });

  function pickDate(iso) {
    if (!dayOk(iso)) return;
    const hadTime = state.time;
    state.date = iso;
    showWhenError('');
    if (hadTime && !slotOk(iso, hadTime)) showWhenError(`Na dnes je ${hadTime} už neskoro. Vyber si neskorší čas.`);
    setPop(false);
    renderWhen();
    const r = dateField.getBoundingClientRect();
    if (!reducedMotion) burst(r.left + r.width / 2, r.top + r.height / 2, 6, ['✨', '💗']);
    if (!state.time) timeSelect.focus({ preventScroll: true });
  }

  timeSelect.addEventListener('change', () => {
    state.time = timeSelect.value || null;
    showWhenError('');
    renderWhen();
  });

  // ---------------------------------------------------------------- 4: jedlo + odoslanie
  const sendBtn = $('#sendBtn');

  function renderFoods() {
    $('#foods').innerHTML = FOODS.map((f) => `
      <button type="button" class="food" role="radio" data-food="${f.id}" aria-checked="${state.food === f.id}">
        <span class="food-emoji" aria-hidden="true">${f.emoji}</span><span>${f.name}</span>
      </button>`).join('');
    sendBtn.disabled = !state.food;
  }

  $('#foods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-food]');
    if (!b) return;
    state.food = b.dataset.food;
    save();
    renderFoods();
    const r = b.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 8, [foodById(state.food).emoji, '💗']);
  });

  function mainFields() {
    const f = foodById(state.food);
    return {
      subject: `💘 Rande potvrdené: ${shortDate(state.date)} o ${state.time}`,
      fields: {
        'Odpoveď': 'ÁNO 💘',
        'Deň': cap(longDate(state.date)),
        'Čas': state.time,
        'Jedlo': `${f.emoji} ${f.name}`,
        'Koľkokrát jej NIE ušlo': String(state.noAttempts),
        'Rozmýšľala': state.thinkMs != null ? formatDuration(state.thinkMs) : '—',
        'Odoslané': new Date().toLocaleString('sk-SK'),
      },
    };
  }

  function mailtoHref({ subject, fields }) {
    const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
    return `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  async function sendMail({ subject, fields }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...fields }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || String(data.success) !== 'true') throw new Error(data.message || `HTTP ${res.status}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const errorText = (err) => (/activat/i.test(String(err && err.message))
    ? 'Odosielanie ešte nie je aktivované: v schránke čaká e-mail od FormSubmit s tlačidlom „Activate Form“.'
    : 'Skontroluj internet a skús to znova.');

  function setSending(btn, on, label) {
    btn.classList.toggle('is-sending', on);
    btn.disabled = on;
    $('.send-label', btn).textContent = label;
  }

  sendBtn.addEventListener('click', async () => {
    if (sendBtn.classList.contains('is-sending') || !state.food) return;
    const errBox = $('#sendError');
    errBox.hidden = true;

    // Stránka mohla zostať otvorená cez noc: termín musí byť stále v budúcnosti.
    if (!whenOk()) {
      goTo(3);
      showWhenError('Tento termín už medzitým prešiel. Vyber prosím nový deň alebo čas.');
      return;
    }

    const msg = mainFields();
    setSending(sendBtn, true, 'posielam…');
    try {
      await sendMail(msg);
      state.submitted = true;
      state.submittedAt = Date.now();
      save();
      goTo(5);
      celebrate();
    } catch (err) {
      console.warn('Odoslanie zlyhalo:', err);
      $('#sendErrorText').textContent = errorText(err);
      $('#mailtoFallback').href = mailtoHref(msg);
      errBox.hidden = false;
    } finally {
      setSending(sendBtn, false, 'toto je ten vibe');
      sendBtn.disabled = !state.food;
    }
  });

  // ---------------------------------------------------------------- 5: prídem po teba
  function renderPickup() {
    $('#pickupTitle').textContent = `som rád, že si nepovedala nie. buď pripravená ${whenPhrase(state.date)} o ${state.time}, prídem po teba 🚗`;
  }

  // ---------------------------------------------------------------- 6: Dohoda o rande™
  const payBtn = $('#payBtn');
  const fmtWeekdayShort = new Intl.DateTimeFormat('sk-SK', { weekday: 'short' });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function eventTimes() {
    const [h, m] = state.time.split(':').map(Number);
    const start = fromISO(state.date);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + CONFIG.dateDurationHours * 3600 * 1000);
    const stamp = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    return { start: stamp(start), end: stamp(end) };
  }
  const eventDetails = () => { const f = foodById(state.food); return `Jedlo: ${f.emoji} ${f.name}\nPrídem po teba 🚗`; };

  function renderAgreement() {
    const d = fromISO(state.date);
    const f = foodById(state.food);
    $('#agWhen').textContent = `${cap(fmtWeekdayShort.format(d))}, ${d.getDate()}. ${d.getMonth() + 1}. · ${state.time}`;
    $('#agFood').textContent = `${f.emoji} ${f.name}`;

    $('#agreement').classList.toggle('is-paid', state.paid);
    $('#payActions').hidden = state.paid;
    $('#afterPay').hidden = !state.paid;

    const { start, end } = eventTimes();
    const params = new URLSearchParams({ action: 'TEMPLATE', text: 'Rande 💘', dates: `${start}/${end}`, details: eventDetails(), ctz: CONFIG.timeZone });
    $('#gcalLink').href = `https://calendar.google.com/calendar/render?${params}`;
  }

  payBtn.addEventListener('click', async () => {
    if (state.paid || payBtn.classList.contains('is-sending')) return;
    setSending(payBtn, true, 'spracúvam platbu…');
    // Hlavná odpoveď už prišla po výbere jedla; toto je len potvrdenie, že podpísala.
    const f = foodById(state.food);
    sendMail({
      subject: `✍️ Dohoda o rande™ podpísaná (${shortDate(state.date)} o ${state.time})`,
      fields: {
        'Stav': 'Zaplatené smiechom a dobrou spoločnosťou 💸',
        'Deň': cap(longDate(state.date)),
        'Čas': state.time,
        'Jedlo': `${f.emoji} ${f.name}`,
      },
    }).catch((e) => console.warn('Potvrdenie podpisu sa neodoslalo:', e));
    await wait(reducedMotion ? 300 : 1400);
    state.paid = true;
    save();
    setSending(payBtn, false, 'Zaplatiť a potvrdiť');
    renderAgreement();
    celebrate();
  });

  $('#icsBtn').addEventListener('click', () => {
    const { start, end } = eventTimes();
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const now = new Date();
    const utc = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DateBloom//SK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${state.date}-${state.time.replace(':', '')}@datebloom`,
      `DTSTAMP:${utc}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${esc('Rande 💘')}`,
      `DESCRIPTION:${esc(eventDetails())}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc('Rande o 2 hodiny 💘')}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rande.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!window.confirm('Naozaj začať odznova? Odpoveď, ktorú si už poslala, zostáva platná.')) return;
    Object.assign(state, defaults());
    save();
    location.replace(location.pathname);
  });

  // ---------------------------------------------------------------- srdiečka a konfety
  function burst(x, y, count, glyphs = ['💗', '💖', '💕', '✨', '❤️']) {
    if (reducedMotion) count = Math.min(count, 6);
    for (let i = 0; i < count; i++) {
      const el = document.createElement('span');
      el.className = 'particle';
      el.textContent = glyphs[i % glyphs.length];
      el.style.fontSize = `${rand(14, 28)}px`;
      document.body.appendChild(el);
      const angle = rand(0, Math.PI * 2);
      const dist = rand(60, 190);
      const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist - 40;
      const anim = el.animate([
        { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(0.4)`, opacity: 1 },
        { transform: `translate(${x + dx}px, ${y + dy}px) translate(-50%, -50%) scale(1) rotate(${rand(-40, 40)}deg)`, opacity: 1, offset: 0.7 },
        { transform: `translate(${x + dx * 1.1}px, ${y + dy + 60}px) translate(-50%, -50%) scale(0.9)`, opacity: 0 },
      ], { duration: rand(900, 1400), easing: 'cubic-bezier(.22,1,.36,1)' });
      anim.onfinish = () => el.remove();
    }
  }

  function rain(n, make) {
    for (let i = 0; i < n; i++) {
      const el = make(i);
      el.classList.add('particle');
      document.body.appendChild(el);
      const x = rand(0, window.innerWidth);
      const drift = rand(-90, 90);
      const anim = el.animate([
        { transform: `translate(${x}px, -30px) rotate(0deg)`, opacity: 0 },
        { opacity: 1, offset: 0.08 },
        { transform: `translate(${x + drift}px, ${window.innerHeight + 40}px) rotate(${rand(-540, 540)}deg)`, opacity: 0.9 },
      ], { duration: rand(2200, 4000), delay: rand(0, 700), easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'backwards' });
      anim.onfinish = () => el.remove();
    }
  }

  // „WAIT YOU ACTUALLY SAID YES??“ → konfety
  function confetti() {
    const colors = ['#ec3a86', '#f7a3c8', '#4a0f2b', '#ffc94d', '#b99cff', '#ffffff'];
    rain(reducedMotion ? 12 : 70, (i) => {
      const el = document.createElement('span');
      el.className = 'confetti';
      el.style.background = colors[i % colors.length];
      el.style.width = `${rand(6, 10)}px`;
      el.style.height = `${rand(9, 15)}px`;
      return el;
    });
  }

  function celebrate() {
    const glyphs = ['💗', '💖', '💕', '❤️', '✨', '🌸'];
    rain(reducedMotion ? 10 : 46, (i) => {
      const el = document.createElement('span');
      el.textContent = glyphs[i % glyphs.length];
      el.style.fontSize = `${rand(16, 34)}px`;
      return el;
    });
  }

  // ---------------------------------------------------------------- štart
  if (state.noAttempts > 0) card.style.setProperty('--yes-scale', String(Math.min(1.35, 1 + state.noAttempts * 0.035)));
  if (!state.submitted && state.date && !dayOk(state.date)) { state.date = null; state.time = null; }
  goTo(state.step || 1, { push: false, focus: false });
})();
