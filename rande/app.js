(() => {
  'use strict';

  const CONFIG = {
    email: 'micek.andrej1@gmail.com',
    // FormSubmit.co: bez registrácie a bez kľúča. Prvé odoslanie pošle na e-mail
    // aktivačný odkaz; až po jeho potvrdení chodia odpovede. Po aktivácii sa dá
    // e-mail v URL nahradiť náhodným reťazcom, ktorý FormSubmit pošle v tom e-maile.
    endpoint: 'https://formsubmit.co/ajax/micek.andrej1@gmail.com',
    storageKey: 'datebloom-v1',
    timeZone: 'Europe/Bratislava',
    totalSteps: 6,
    // o koľko minút dopredu najskôr môže byť rande, ak je vybraný dnešok
    leadMinutes: 60,
    maxDaysAhead: 365,
    dateDurationHours: 2,
  };

  const SLOT_GROUPS = [
    { label: 'Obed', times: ['11:30', '12:00', '12:30', '13:00'] },
    { label: 'Popoludnie', times: ['15:00', '16:00', '17:00'] },
    { label: 'Večer', times: ['18:00', '18:30', '19:00', '19:30', '20:00', '20:30'] },
  ];

  const FOODS = [
    { id: 'italian', emoji: '🍝', name: 'Talianska', desc: 'pizza, cestoviny' },
    { id: 'sushi', emoji: '🍣', name: 'Sushi', desc: 'japonská klasika' },
    { id: 'burger', emoji: '🍔', name: 'Burger', desc: 'poctivý a šťavnatý' },
    { id: 'steak', emoji: '🥩', name: 'Steak', desc: 'na veľký hlad' },
    { id: 'asian', emoji: '🍜', name: 'Ázijská', desc: 'ramen, pad thai' },
    { id: 'mexican', emoji: '🌮', name: 'Mexická', desc: 'tacos, burrito' },
    { id: 'indian', emoji: '🍛', name: 'Indická', desc: 'kari, naan' },
    { id: 'healthy', emoji: '🥗', name: 'Niečo ľahké', desc: 'šaláty, bowl' },
    { id: 'slovak', emoji: '🥟', name: 'Domáca', desc: 'halušky, rezeň' },
    { id: 'surprise', emoji: '🎲', name: 'Prekvap ma', desc: 'nechám to na teba' },
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

  const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const todayISO = () => toISO(new Date());
  const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  const fmtLong = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtNoYear = new Intl.DateTimeFormat('sk-SK', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtMonth = new Intl.DateTimeFormat('sk-SK', { month: 'long', year: 'numeric' });
  const fmtWeekday = new Intl.DateTimeFormat('sk-SK', { weekday: 'long' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const longDate = (iso) => fmtLong.format(fromISO(iso));
  const shortDate = (iso) => { const d = fromISO(iso); return `${d.getDate()}. ${d.getMonth() + 1}.`; };

  function formatDuration(ms) {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ${s % 60} s`;
    return `${Math.floor(m / 60)} h ${m % 60} min`;
  }

  // ---------------------------------------------------------------- state
  const defaults = () => ({
    step: 1, date: null, time: null, timeCustom: false, food: null, note: '',
    noAttempts: 0, yesAt: null, submitted: false, submittedAt: null,
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
    if (!dateISO || !hhmm) return false;
    if (dateISO !== todayISO()) return true;
    return toMinutes(hhmm) >= nowMinutes() + CONFIG.leadMinutes;
  }
  const allSlots = () => SLOT_GROUPS.flatMap((g) => g.times);
  function dayOk(dateISO) {
    const d = fromISO(dateISO);
    const today = startOfToday();
    if (d < today || d > addDays(today, CONFIG.maxDaysAhead)) return false;
    if (dateISO === todayISO()) return allSlots().some((t) => slotOk(dateISO, t));
    return true;
  }

  function maxReachable() {
    if (state.submitted) return 6;
    if (!state.yesAt) return 1;
    if (!state.date || !dayOk(state.date)) return 2;
    if (!state.time || !slotOk(state.date, state.time)) return 3;
    if (!state.food) return 4;
    return 5;
  }

  // ---------------------------------------------------------------- navigation
  const card = $('#card');
  const steps = $$('.step', card);

  function goTo(step, { push = true, focus = true } = {}) {
    step = Math.max(1, Math.min(step, maxReachable()));
    if (state.submitted) step = 6;
    state.step = step;
    save();

    card.dataset.current = String(step);
    steps.forEach((el) => { el.hidden = Number(el.dataset.step) !== step; el.classList.toggle('is-active', !el.hidden); });
    $('#stepNum').textContent = step;
    $('#progressFill').style.width = `${(step / CONFIG.totalSteps) * 100}%`;

    render(step);
    if (push) history.pushState({ step }, '');

    if (focus) {
      const heading = $(`.step[data-step="${step}"] .title`);
      heading && heading.focus({ preventScroll: true });
      if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
    if (step === 1) requestAnimationFrame(() => No.reset());
  }

  window.addEventListener('popstate', (e) => {
    const target = e.state && e.state.step;
    if (state.submitted) { history.pushState({ step: 6 }, ''); return; }
    if (target) goTo(target, { push: false });
  });

  card.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    const next = e.target.closest('[data-next]');
    const edit = e.target.closest('[data-goto]');
    if (back) goTo(state.step - 1);
    if (next && !next.disabled) goTo(state.step + 1);
    if (edit) goTo(Number(edit.dataset.goto));
  });

  function render(step) {
    if (step === 2) renderDates();
    if (step === 3) renderTimes();
    if (step === 4) renderFoods();
    if (step === 5) renderSummary();
    if (step === 6) renderDone();
  }

  // ---------------------------------------------------------------- step 1: ÁNO
  const yesBtn = $('#yesBtn');
  yesBtn.addEventListener('click', (e) => {
    if (yesBtn.dataset.busy) return;
    yesBtn.dataset.busy = '1';
    if (!state.yesAt) { state.yesAt = Date.now(); state.thinkMs = state.yesAt - openedAt; }
    save();
    const r = yesBtn.getBoundingClientRect();
    burst(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2, 26);
    setTimeout(() => { delete yesBtn.dataset.busy; goTo(2); }, reducedMotion ? 0 : 650);
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

  // ---------------------------------------------------------------- step 2: deň
  let viewMonth = null; // Date: prvý deň zobrazeného mesiaca

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
      const dow = d.getDay();
      if (dow === 5 || dow === 6 || dow === 0) push(d, `${cap(fmtWeekday.format(d))} ${d.getDate()}. ${d.getMonth() + 1}.`);
    }
    return out.slice(0, 5);
  }

  function renderDates() {
    const quick = $('#quickDates');
    quick.innerHTML = '';
    quickDateOptions().forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = o.label;
      b.setAttribute('aria-pressed', String(state.date === o.iso));
      b.addEventListener('click', () => pickDate(o.iso));
      quick.appendChild(b);
    });

    if (!viewMonth) {
      const base = state.date ? fromISO(state.date) : startOfToday();
      viewMonth = new Date(base.getFullYear(), base.getMonth(), 1);
    }
    renderCalendar();

    $('#pickedDate').textContent = state.date && dayOk(state.date) ? `${longDate(state.date)} ✓` : '';
    $('#next2').disabled = !(state.date && dayOk(state.date));
  }

  function renderCalendar() {
    const cal = $('#calendar');
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
      const ok = dayOk(iso);
      const cls = ['cal-day'];
      if (d.getDay() === 0 || d.getDay() === 6) cls.push('is-weekend');
      if (iso === tISO) cls.push('is-today');
      html += `<button type="button" class="${cls.join(' ')}" data-date="${iso}" aria-pressed="${state.date === iso}" aria-label="${fmtLong.format(d)}" ${ok ? '' : 'disabled'}>${day}</button>`;
    }
    html += '</div>';
    cal.innerHTML = html;
  }

  $('#calendar').addEventListener('click', (e) => {
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
    state.date = iso;
    if (state.time && !slotOk(iso, state.time)) { state.time = null; state.timeCustom = false; }
    save();
    const d = fromISO(iso);
    viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    renderDates();
    sparkleAt($('#pickedDate'));
  }

  // ---------------------------------------------------------------- step 3: čas
  function renderTimes() {
    $('#timeLead').textContent = `${cap(fmtNoYear.format(fromISO(state.date)))}. Vyber si čas.`;
    const wrap = $('#slots');
    wrap.innerHTML = '';
    SLOT_GROUPS.forEach((g) => {
      const available = g.times.filter((t) => slotOk(state.date, t));
      if (!available.length) return; // dnes už prešlo
      const group = document.createElement('div');
      group.className = 'slot-group';
      group.innerHTML = `<p class="slot-group-label">${g.label}</p><div class="chips"></div>`;
      const chips = $('.chips', group);
      g.times.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = t;
        const ok = slotOk(state.date, t);
        b.disabled = !ok;
        b.setAttribute('aria-pressed', String(!state.timeCustom && state.time === t));
        b.addEventListener('click', () => pickTime(t, false));
        chips.appendChild(b);
      });
      wrap.appendChild(group);
    });

    const toggle = $('#customToggle');
    const input = $('#customInput');
    toggle.setAttribute('aria-pressed', String(state.timeCustom));
    input.hidden = !state.timeCustom;
    if (state.timeCustom && state.time) input.value = state.time;
    $('#timeError').hidden = true;
    $('#next3').disabled = !(state.time && slotOk(state.date, state.time));
  }

  function pickTime(t, custom) {
    const err = $('#timeError');
    if (!slotOk(state.date, t)) {
      err.textContent = `Na dnes je to už neskoro. Vyber čas aspoň o ${CONFIG.leadMinutes} minút neskôr.`;
      err.hidden = false;
      state.time = null;
      save();
      $('#next3').disabled = true;
      return;
    }
    state.time = t;
    state.timeCustom = custom;
    save();
    renderTimes();
  }

  $('#customToggle').addEventListener('click', () => {
    const input = $('#customInput');
    state.timeCustom = true;
    state.time = null;
    save();
    renderTimes();
    input.hidden = false;
    input.focus();
    if (typeof input.showPicker === 'function') { try { input.showPicker(); } catch (_) { /* nie všade povolené */ } }
  });
  $('#customInput').addEventListener('change', (e) => { if (e.target.value) pickTime(e.target.value, true); });

  // ---------------------------------------------------------------- step 4: jedlo
  function renderFoods() {
    const grid = $('#foods');
    grid.innerHTML = '';
    FOODS.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'food';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(state.food === f.id));
      b.innerHTML = `<span class="food-emoji" aria-hidden="true">${f.emoji}</span><span class="food-name">${f.name}</span><span class="food-desc">${f.desc}</span>`;
      b.addEventListener('click', () => {
        state.food = f.id;
        save();
        renderFoods();
        const r = b.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 8, [f.emoji, '💗']);
      });
      grid.appendChild(b);
    });
    $('#next4').disabled = !state.food;
  }
  const foodById = (id) => FOODS.find((f) => f.id === id);

  // ---------------------------------------------------------------- step 5: zhrnutie + odoslanie
  function summaryItems(withEdit) {
    const f = foodById(state.food);
    const rows = [
      { icon: '📅', label: 'Deň', value: longDate(state.date), step: 2 },
      { icon: '🕖', label: 'Čas', value: state.time, step: 3 },
      { icon: f.emoji, label: 'Jedlo', value: f.name, step: 4 },
    ];
    if (!withEdit && state.note) rows.push({ icon: '💌', label: 'Odkaz', value: state.note });
    return rows.map((r) => `
      <li>
        <span class="sum-icon" aria-hidden="true">${r.icon}</span>
        <span class="sum-body"><span class="sum-label">${r.label}</span><span class="sum-value">${escapeHtml(r.value)}</span></span>
        ${withEdit ? `<button class="sum-edit" type="button" data-goto="${r.step}">Zmeniť</button>` : ''}
      </li>`).join('');
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const note = $('#note');
  note.addEventListener('input', () => { state.note = note.value.slice(0, 500); save(); });

  function renderSummary() {
    $('#summary').innerHTML = summaryItems(true);
    note.value = state.note || '';
    $('#sendError').hidden = true;
  }

  function buildMessage() {
    const f = foodById(state.food);
    const think = state.thinkMs ? formatDuration(state.thinkMs) : '—';
    const subject = `💘 Rande potvrdené: ${shortDate(state.date)} o ${state.time}`;
    const fields = {
      'Odpoveď': 'ÁNO 💘',
      'Deň': cap(longDate(state.date)),
      'Čas': state.time,
      'Jedlo': `${f.emoji} ${f.name} (${f.desc})`,
      'Odkaz': state.note ? state.note : '—',
      'Koľkokrát jej NIE ušlo': String(state.noAttempts),
      'Rozmýšľala': think,
      'Odoslané': new Date().toLocaleString('sk-SK'),
    };
    return { subject, fields };
  }

  function mailtoHref() {
    const { subject, fields } = buildMessage();
    const body = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
    return `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const sendBtn = $('#sendBtn');
  sendBtn.addEventListener('click', async () => {
    if (sendBtn.classList.contains('is-sending')) return;
    const errBox = $('#sendError');
    errBox.hidden = true;

    // Stránka mohla zostať otvorená cez noc: termín musí byť stále v budúcnosti.
    if (!state.date || !dayOk(state.date) || !slotOk(state.date, state.time)) {
      $('#sendErrorText').textContent = 'Tento termín už medzitým prešiel. Vyber prosím nový deň alebo čas.';
      $('#mailtoFallback').parentElement.hidden = true;
      errBox.hidden = false;
      return;
    }
    $('#mailtoFallback').parentElement.hidden = false;

    const { subject, fields } = buildMessage();
    sendBtn.classList.add('is-sending');
    sendBtn.disabled = true;
    $('.send-label', sendBtn).textContent = 'Posielam…';

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

      state.submitted = true;
      state.submittedAt = Date.now();
      save();
      goTo(6);
      celebrate();
    } catch (err) {
      console.warn('Odoslanie zlyhalo:', err);
      $('#sendErrorText').textContent = /activat/i.test(String(err && err.message))
        ? 'Odosielanie ešte nie je aktivované: v schránke čaká e-mail od FormSubmit s tlačidlom „Activate Form“.'
        : 'Skontroluj internet a skús to znova.';
      $('#mailtoFallback').href = mailtoHref();
      errBox.hidden = false;
    } finally {
      clearTimeout(timer);
      sendBtn.classList.remove('is-sending');
      sendBtn.disabled = false;
      $('.send-label', sendBtn).textContent = 'Potvrdiť rande';
    }
  });

  // ---------------------------------------------------------------- step 6: hotovo
  function eventTimes() {
    const [h, m] = state.time.split(':').map(Number);
    const start = fromISO(state.date);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + CONFIG.dateDurationHours * 3600 * 1000);
    const stamp = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
    return { start: stamp(start), end: stamp(end) };
  }
  function eventDetails() {
    const f = foodById(state.food);
    return `Jedlo: ${f.emoji} ${f.name}${state.note ? `\nOdkaz: ${state.note}` : ''}`;
  }

  function renderDone() {
    $('#doneSummary').innerHTML = summaryItems(false);
    const { start, end } = eventTimes();
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: 'Rande 💘',
      dates: `${start}/${end}`,
      details: eventDetails(),
      ctz: CONFIG.timeZone,
    });
    $('#gcalLink').href = `https://calendar.google.com/calendar/render?${params}`;
  }

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
    viewMonth = null;
    card.style.removeProperty('--yes-scale');
    location.replace(location.pathname);
  });

  // ---------------------------------------------------------------- srdiečka
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

  function celebrate() {
    const n = reducedMotion ? 10 : 46;
    const glyphs = ['💗', '💖', '💕', '❤️', '✨', '🌸'];
    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      el.className = 'particle';
      el.textContent = glyphs[i % glyphs.length];
      el.style.fontSize = `${rand(16, 34)}px`;
      document.body.appendChild(el);
      const x = rand(0, window.innerWidth);
      const drift = rand(-80, 80);
      const anim = el.animate([
        { transform: `translate(${x}px, -40px) rotate(0deg)`, opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { transform: `translate(${x + drift}px, ${window.innerHeight + 40}px) rotate(${rand(-180, 180)}deg)`, opacity: 0.9 },
      ], { duration: rand(2400, 4200), delay: rand(0, 900), easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'backwards' });
      anim.onfinish = () => el.remove();
    }
  }

  function sparkleAt(el) {
    if (!el || reducedMotion) return;
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 6, ['✨', '💗']);
  }

  // ---------------------------------------------------------------- štart
  if (!state.submitted && state.date && !dayOk(state.date)) { state.date = null; state.time = null; }
  if (state.noAttempts > 0) card.style.setProperty('--yes-scale', String(Math.min(1.35, 1 + state.noAttempts * 0.035)));
  const startStep = state.submitted ? 6 : Math.min(state.step || 1, maxReachable());
  history.replaceState({ step: startStep }, '');
  goTo(startStep, { push: false, focus: false });
})();
