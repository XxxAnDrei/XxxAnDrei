  /* ==========================================================
     POHYB
     Jedna funkcia, tri profily: initMotion(profil, reduced).
       "calm"  - ambulancia: dôvera sa číta ako pokoj
       "sharp" - barbershop: presný rez
       "soft"  - štúdio: plynulá elegancia
     Bez GSAP zostáva stránka celá čitateľná, v CSS sa nič neparkuje
     na opacity:0. Admin panela (#admin) sa odtiaľto nedotýkame.
     ========================================================== */

  function initMotion(profile, reduced) {
    var doc = document;
    var root = doc.documentElement;
    var g = window.gsap;
    var ST = window.ScrollTrigger;
    var site = doc.getElementById("site");
    var i;
    if (!site) return;

    /* --- profil: argument vyhráva, inak sa odvodí od prevádzky --- */
    var BY_TENANT = { klinika: "calm", barber: "sharp", salon: "soft" };
    if (profile !== "calm" && profile !== "sharp" && profile !== "soft") {
      profile = BY_TENANT[root.getAttribute("data-tenant")] || "calm";
    }

    /* --- upratanie po predchádzajúcom behu (sekcie sa prekresľujú) --- */
    var prev = initMotion.state;
    if (prev) {
      if (prev.ctx && prev.ctx.revert) prev.ctx.revert();
      for (i = prev.undo.length - 1; i >= 0; i--) {
        try { prev.undo[i](); } catch (err) {}
      }
    }
    if (ST) {
      var live = ST.getAll();
      for (i = live.length - 1; i >= 0; i--) {
        if (live[i].vars && typeof live[i].vars.id === "string" && live[i].vars.id.indexOf("tm-") === 0) live[i].kill(true);
      }
    }
    var state = { undo: [], ctx: null };
    initMotion.state = state;

    function undo(fn) { state.undo.push(fn); }
    function on(el, type, fn) {
      el.addEventListener(type, fn, false);
      undo(function () { el.removeEventListener(type, fn, false); });
    }
    function keep(el) {
      var html = el.innerHTML;
      var back = function () { el.innerHTML = html; };
      undo(back);
      return back;
    }
    function q(sel) { return site.querySelector(sel); }
    function qa(sel) {
      var out = [], list = site.querySelectorAll(sel), k;
      for (k = 0; k < list.length; k++) out.push(list[k]);
      return out;
    }

    root.setAttribute("data-motion", reduced ? "off" : profile);
    undo(function () { root.removeAttribute("data-motion"); });

    if (!g || typeof g.timeline !== "function") return;
    if (ST && g.registerPlugin) g.registerPlugin(ST);

    /* --- hlavička: zmena stavu, nie animácia, takže beží aj pri
           prefers-reduced-motion. Žiadny scroll listener. --- */
    var hero = q(".hero"), bar = q(".topbar");
    if (bar && hero && ST) {
      ST.create({
        id: "tm-bar",
        trigger: hero,
        start: "bottom top+=64",
        end: "max",
        onToggle: function (self) {
          if (self.isActive) bar.classList.add("is-stuck");
          else bar.classList.remove("is-stuck");
        }
      });
      undo(function () { bar.classList.remove("is-stuck"); });
    }

    if (reduced) return;

    /* --- profilové konštanty --------------------------------- */
    var CFG = {
      calm: {
        e: "power2.out", e2: "power2.out", d: .7, y: 12, s: .085,
        hairD: .7, hairE: "power2.out", faqD: .42,
        cntD: 1, cntE: "power2.out", cntFrom: .55,
        winY: 16, winS: 1, winD: .8, headY: 10, headD: .68
      },
      sharp: {
        e: "expo.out", e2: "power4.out", d: .44, y: 16, s: .045,
        hairD: .5, hairE: "expo.out", faqD: .34,
        cntD: .55, cntE: "expo.out", cntFrom: 0,
        winY: 20, winS: 1, winD: .5, headY: 14, headD: .45
      },
      soft: {
        e: "expo.out", e2: "power3.out", d: .9, y: 18, s: .07,
        hairD: 1, hairE: "power3.out", faqD: .5,
        cntD: 1.2, cntE: "expo.out", cntFrom: 0,
        winY: 26, winS: .97, winD: 1, headY: 16, headD: .85
      }
    };
    var C = CFG[profile];
    var stId = 0;

    /* --- ručné delenie textu, žiadny SplitText ---------------- */
    function splitWords(el) {
      var kids = [], n = el.childNodes, frag = doc.createDocumentFragment(),
          words = [], cur = null, k, j, parts;
      for (k = 0; k < n.length; k++) kids.push(n[k]);
      function push(node) {
        if (!cur) {
          cur = doc.createElement("span");
          cur.className = "m-word";
          frag.appendChild(cur);
          words.push(cur);
        }
        cur.appendChild(node);
      }
      for (k = 0; k < kids.length; k++) {
        if (kids[k].nodeType === 3) {
          parts = kids[k].nodeValue.split(/(\s+)/);
          for (j = 0; j < parts.length; j++) {
            if (parts[j] === "") continue;
            if (/^\s+$/.test(parts[j])) {
              frag.appendChild(doc.createTextNode(parts[j]));
              cur = null;                       /* medzera ukončí slovo */
            } else {
              push(doc.createTextNode(parts[j]));
            }
          }
        } else if (kids[k].nodeType === 1) {
          push(kids[k]);                        /* <b> ostáva vnútri slova */
        }
      }
      el.innerHTML = "";
      el.appendChild(frag);
      return words;
    }

    function splitLines(el) {
      var words = splitWords(el), groups = [], cur = null, top = null,
          lines = [], k, span, first, stop, node, next;
      /* tolerancia podľa výšky slova, nie pevných pixelov */
      var tol = words.length ? Math.max(4, words[0].offsetHeight * .45) : 4;
      for (k = 0; k < words.length; k++) {
        if (top === null || Math.abs(words[k].offsetTop - top) > tol) {
          cur = [];
          groups.push(cur);
          top = words[k].offsetTop;
        }
        cur.push(words[k]);
      }
      for (k = 0; k < groups.length; k++) {
        span = doc.createElement("span");
        span.className = "m-line";
        first = groups[k][0];
        stop = (k + 1 < groups.length) ? groups[k + 1][0] : null;
        el.insertBefore(span, first);
        node = span.nextSibling;
        while (node && node !== stop) {
          next = node.nextSibling;
          span.appendChild(node);
          node = next;
        }
        lines.push(span);
      }
      return lines;
    }

    function splitChars(el) {
      var kids = [], n = el.childNodes, frag = doc.createDocumentFragment(),
          chars = [], k, j, txt, sp;
      for (k = 0; k < n.length; k++) kids.push(n[k]);
      for (k = 0; k < kids.length; k++) {
        if (kids[k].nodeType === 3) {
          txt = kids[k].nodeValue;
          for (j = 0; j < txt.length; j++) {
            if (txt.charAt(j) === " ") { frag.appendChild(doc.createTextNode(" ")); continue; }
            sp = doc.createElement("span");
            sp.className = "m-char";
            sp.appendChild(doc.createTextNode(txt.charAt(j)));
            frag.appendChild(sp);
            chars.push(sp);
          }
        } else {
          frag.appendChild(kids[k]);
        }
      }
      el.innerHTML = "";
      el.appendChild(frag);
      return chars;
    }

    /* --- riadky sa merajú až keď sú fonty na mieste ----------- */
    function whenFontsReady(cb) {
      var done = false, id;
      function go() { if (done) return; done = true; cb(); }
      if (!doc.fonts || !doc.fonts.ready || typeof doc.fonts.ready.then !== "function" || doc.fonts.status === "loaded") {
        go();
        return;
      }
      doc.fonts.ready.then(go);
      id = setTimeout(go, 260);                 /* strop, nech sa hero nezasekne */
      undo(function () { clearTimeout(id); });
    }

    /* --- jeden vstup pre všetky "raz a dosť" odhalenia -------- */
    function reveal(nodes, trigger, vars) {
      if (!ST || !nodes || !nodes.length) return null;
      stId++;
      vars.scrollTrigger = { id: "tm-r" + stId, trigger: trigger || nodes[0], start: "top 86%", once: true };
      return g.from(nodes, vars);
    }

    /* gsap.context() bez argumentu vracia undefined; kontext vznikne
       až s funkciou. Ak by aj to zlyhalo, ideme bez kontextu ďalej. */
    var ctx = null;
    if (typeof g.context === "function") {
      try { ctx = g.context(function () {}); } catch (err2) { ctx = null; }
    }
    if (!ctx || typeof ctx.add !== "function") {
      ctx = { add: function (fn) { fn(); }, revert: function () {} };
    }
    state.ctx = ctx;
    ctx.add(build);

    /* =========================================================
       Choreografia
       ========================================================= */
    function build() {

      /* ---------- 1. Hero ---------- */
      var h1 = q(".hero h1"), sub = q(".hero__sub"), cta = q(".hero__cta"),
          heroWin = hero ? hero.querySelector(".window") : null;

      if (h1) {
        g.set(h1, { autoAlpha: 0 });            /* skryje sa až za behu, nikdy v CSS */
        undo(function () { g.set(h1, { clearProps: "opacity,visibility" }); });
      }

      whenFontsReady(function () {
        if (initMotion.state !== state) return; /* medzitým prišiel nový beh */
        ctx.add(function () {
          var tl = g.timeline({ defaults: { ease: C.e } });
          var back, pieces;

          if (h1) {
            back = keep(h1);
            if (profile === "soft") {
              /* slovo po slove, mäkký nábeh */
              pieces = splitWords(h1);
              g.set(h1, { autoAlpha: 1 });
              if (pieces.length) {
                tl.from(pieces, {
                  y: 22, autoAlpha: 0, duration: .95, stagger: .045, ease: "expo.out",
                  onComplete: back
                }, 0);
              } else { back(); }
            } else if (profile === "sharp") {
              /* clip-path stierka po riadkoch: čistý rez */
              pieces = splitLines(h1);
              g.set(h1, { autoAlpha: 1 });
              if (pieces.length) {
                tl.fromTo(pieces,
                  { clipPath: "inset(-0.25em 100% -0.25em 0%)", x: -12 },
                  { clipPath: "inset(-0.25em 0% -0.25em 0%)", x: 0, duration: .5, stagger: .075, ease: "expo.out", onComplete: back },
                  0);
              } else { back(); }
            } else {
              /* pokoj: riadky sa len usadia */
              pieces = splitLines(h1);
              g.set(h1, { autoAlpha: 1 });
              if (pieces.length) {
                tl.from(pieces, {
                  y: 12, autoAlpha: 0, duration: .75, stagger: .1, ease: "power2.out",
                  onComplete: back
                }, 0);
              } else { back(); }
            }
          }
          if (sub) tl.from(sub, { y: C.y * .8, autoAlpha: 0, duration: C.d }, profile === "calm" ? .18 : .12);
          /* .hero__cta ide ako celok: transform tlačidla ostáva voľný pre magnet */
          if (cta) tl.from(cta, { y: C.y * .8, autoAlpha: 0, duration: C.d }, profile === "calm" ? .28 : .2);
          if (heroWin) {
            tl.from(heroWin, {
              y: C.winY, scale: C.winS, autoAlpha: 0, duration: C.winD,
              ease: C.e2, transformOrigin: "50% 40%"
            }, profile === "sharp" ? .14 : .24);
          }
        });
      });

      /* ---------- 2. Nadpisy sekcií ---------- */
      var heads = qa(".h-sec"), hi;
      for (hi = 0; hi < heads.length; hi++) {
        if (profile === "sharp") reveal([heads[hi]], heads[hi], { x: -12, autoAlpha: 0, duration: C.headD, ease: C.e });
        else reveal([heads[hi]], heads[hi], { y: C.headY, autoAlpha: 0, duration: C.headD, ease: C.e });
      }

      /* ---------- 3. Pozorovania: riadky + vlások ---------- */
      var obs = qa(".obs p");
      if (obs.length && ST) {
        var obsTl = g.timeline({
          scrollTrigger: { id: "tm-obs", trigger: obs[0].parentNode, start: "top 84%", once: true }
        });
        obsTl.from(obs, {
          y: C.y * .9, autoAlpha: 0, duration: C.d, stagger: C.s, ease: C.e, clearProps: "transform"
        }, 0);
        /* --hair riadi scaleX na ::before, takže sa kreslí zľava doprava */
        obsTl.fromTo(obs, { "--hair": 0 }, { "--hair": 1, duration: C.hairD, stagger: C.s, ease: C.hairE }, .04);
        undo(function () {
          for (var k = 0; k < obs.length; k++) obs[k].style.removeProperty("--hair");
        });
      }

      /* ---------- 4. Schodisko argumentov ---------- */
      var args = qa(".arg");
      if (args.length) {
        if (profile === "sharp") {
          reveal(args, args[0].parentNode, { x: -12, autoAlpha: 0, duration: C.d, stagger: .07, ease: C.e });
        } else if (profile === "soft") {
          reveal(args, args[0].parentNode, { y: C.y, scale: .98, autoAlpha: 0, duration: C.d, stagger: .1, ease: C.e, transformOrigin: "0% 50%" });
        } else {
          reveal(args, args[0].parentNode, { y: C.y, autoAlpha: 0, duration: C.d, stagger: .12, ease: C.e });
        }
      }

      /* ---------- 5. Citát a akcentované slová ---------- */
      var quote = q(".quote p"), qSpan = q(".quote p span");
      if (quote && ST) {
        var qTl = g.timeline({ scrollTrigger: { id: "tm-quote", trigger: quote, start: "top 82%", once: true } });
        qTl.from(quote, { y: C.y, autoAlpha: 0, duration: C.d, ease: C.e }, 0);
        if (qSpan) {
          if (profile === "sharp") {
            var backQ = keep(qSpan), qw = splitWords(qSpan);
            if (qw.length) qTl.from(qw, { x: -14, skewX: 5, autoAlpha: 0, duration: .42, stagger: .05, ease: "expo.out", onComplete: backQ }, .18);
            else backQ();
          } else if (profile === "soft") {
            /* pomalý prejazd svetla po slovách */
            var backC = keep(qSpan), qc = splitChars(qSpan);
            if (qc.length) qTl.fromTo(qc, { opacity: .25 }, { opacity: 1, duration: .55, stagger: .022, ease: "power1.inOut", onComplete: backC }, .3);
            else backC();
          } else {
            qTl.fromTo(qSpan, { opacity: .4 }, { opacity: 1, duration: .8, ease: "power2.out", clearProps: "opacity" }, .3);
          }
        }
      }

      /* ---------- 6. Čo to vie / čo to nevie ---------- */
      var facts = qa(".facts p"), nots = qa(".nots p");
      if (facts.length) reveal(facts, facts[0].parentNode, { y: C.y * .8, autoAlpha: 0, duration: C.d, stagger: C.s, ease: C.e, clearProps: "transform" });
      if (nots.length) reveal(nots, nots[0].parentNode, { y: C.y * .7, autoAlpha: 0, duration: C.d, stagger: C.s, ease: C.e });

      /* ---------- 7. Cena: číslo sa naráta ---------- */
      var pn = q(".price__n");
      if (pn && ST) {
        var node = null, kids = pn.childNodes, ki;
        for (ki = 0; ki < kids.length; ki++) {
          if (kids[ki].nodeType === 3 && /\d/.test(kids[ki].nodeValue)) { node = kids[ki]; break; }
        }
        if (node) {
          var stored = pn.getAttribute("data-motion-n");
          var target = parseInt(stored !== null ? stored : node.nodeValue.replace(/\D/g, ""), 10);
          if (!isNaN(target)) {
            pn.setAttribute("data-motion-n", String(target));
            undo(function () { node.nodeValue = String(target); });
            var from = Math.round(target * C.cntFrom);
            var box = { v: from };
            /* text sa prepíše až v onEnter, bez scrollu ostane cena celá */
            ST.create({
              id: "tm-price", trigger: pn, start: "top 88%", once: true,
              onEnter: function () {
                g.fromTo(box, { v: from }, {
                  v: target, duration: C.cntD, ease: C.cntE,
                  onUpdate: function () { node.nodeValue = String(Math.round(box.v)); },
                  onComplete: function () { node.nodeValue = String(target); }
                });
                if (profile !== "calm") {
                  g.from(pn, {
                    y: profile === "soft" ? 14 : 10,
                    scale: profile === "soft" ? .97 : 1,
                    autoAlpha: 0, duration: C.d, ease: C.e, transformOrigin: "0% 100%"
                  });
                }
              }
            });
          }
        }
      }

      /* ---------- 8. Okná ukážky ---------- */
      var wins = qa(".window"), wi;
      for (wi = 0; wi < wins.length; wi++) {
        if (hero && hero.contains(wins[wi])) continue;   /* hero okno rieši intro */
        reveal([wins[wi]], wins[wi], {
          y: C.winY, scale: C.winS, autoAlpha: 0, duration: C.winD, ease: C.e2, transformOrigin: "50% 30%"
        });
      }

      /* ---------- 9. Záverečná výzva ---------- */
      var end = q(".end");
      if (end) {
        var endKids = [], ei;
        for (ei = 0; ei < end.children.length; ei++) endKids.push(end.children[ei]);
        reveal(endKids, end, { y: C.y * .8, autoAlpha: 0, duration: C.d, stagger: C.s, ease: C.e });
      }

      /* ---------- 10. Otázky: plynulé otvorenie ---------- */
      var faq = q(".faq");
      if (faq) {
        on(faq, "click", function (ev) {
          var sum = ev.target && ev.target.closest ? ev.target.closest("summary") : null;
          if (!sum || !faq.contains(sum)) return;
          var det = sum.parentNode, panel = sum.nextElementSibling;
          if (!det || det.tagName !== "DETAILS" || !panel) return;
          ev.preventDefault();
          if (det.tmAnim) det.tmAnim.kill();

          var opening = !det.open || det.tmClosing === true;
          var cur = parseFloat(panel.style.height);
          if (isNaN(cur)) cur = det.open ? panel.offsetHeight : 0;

          if (opening) {
            det.tmClosing = false;
            det.open = true;
            det.tmAnim = g.timeline({
              onComplete: function () {
                g.set(panel, { clearProps: "height,overflow,opacity" });
                if (ST) ST.refresh();
              }
            });
            det.tmAnim.fromTo(panel,
              { height: cur, overflow: "hidden", opacity: cur > 0 ? 1 : 0 },
              { height: panel.scrollHeight, opacity: 1, duration: C.faqD, ease: C.e2 });
          } else {
            det.tmClosing = true;
            det.tmAnim = g.timeline({
              onComplete: function () {
                det.tmClosing = false;
                det.open = false;
                g.set(panel, { clearProps: "height,overflow,opacity" });
                if (ST) ST.refresh();
              }
            });
            det.tmAnim.fromTo(panel,
              { height: cur, overflow: "hidden" },
              { height: 0, opacity: 0, duration: C.faqD * .85, ease: "power2.in" });
          }
        });
        undo(function () {
          var ds = faq.querySelectorAll("details"), k;
          for (k = 0; k < ds.length; k++) {
            if (ds[k].tmAnim) ds[k].tmAnim.kill();
            ds[k].tmAnim = null;
            if (ds[k].tmClosing) ds[k].open = false;   /* prerušené zatváranie sa dokončí */
            ds[k].tmClosing = false;
            g.set(ds[k].querySelectorAll("p"), { clearProps: "height,overflow,opacity" });
          }
        });
      }

      /* ---------- 11. Len "sharp": magnet a zotrvačnosť ---------- */
      if (profile === "sharp" && typeof g.quickTo === "function") {
        var fine = !!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches);
        var mag = q("#heroAdmin") || q(".hero__cta .btn--primary");
        if (mag && fine) {
          var mx = g.quickTo(mag, "x", { duration: .45, ease: "power3" });
          var my = g.quickTo(mag, "y", { duration: .45, ease: "power3" });
          on(mag, "pointermove", function (ev) {
            var r = mag.getBoundingClientRect();
            mx((ev.clientX - (r.left + r.width / 2)) * .3);
            my((ev.clientY - (r.top + r.height / 2)) * .4);
          });
          on(mag, "pointerleave", function () { mx(0); my(0); });
          on(mag, "blur", function () { mx(0); my(0); });
        }

        /* jediný prvok reagujúci na rýchlosť scrollu */
        var demoSec = q("#ukazka"), demoWin = demoSec ? demoSec.querySelector(".window") : null;
        if (demoWin && ST) {
          var setSkew = g.quickTo(demoWin, "skewY", { duration: .5, ease: "power3" });
          var idleT = null;
          ST.create({
            id: "tm-vel", trigger: demoSec, start: "top bottom", end: "bottom top",
            onUpdate: function (self) {
              var v = self.getVelocity() / 340;
              if (v > 1.6) v = 1.6;
              if (v < -1.6) v = -1.6;
              setSkew(v);
              clearTimeout(idleT);
              idleT = setTimeout(function () { setSkew(0); }, 90);
            },
            onLeave: function () { setSkew(0); },
            onLeaveBack: function () { setSkew(0); }
          });
          undo(function () { clearTimeout(idleT); });
        }
      }

      /* layout sa po odhaleniach a po FAQ mení, triggery treba premerať */
      if (ST) ST.refresh();
    }
  }
