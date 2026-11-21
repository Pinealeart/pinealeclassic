/**
 * nav.js — Testata, lettura e statistiche degli spazi pubblicitari
 * - Compatta la testata (mobile) quando si scorre
 * - Barra di avanzamento della lettura negli articoli
 */

(function () {
  "use strict";

  var mast = document.querySelector(".mast");
  var progress = document.querySelector(".progress");
  var ticking = false;

  function update() {
    var y = window.scrollY;
    if (mast) mast.classList.toggle("is-compact", y > 40);
    if (progress) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.setProperty("--p", max > 0 ? Math.min(y / max, 1).toFixed(4) : 0);
    }
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });

  update();

  // Sezione attiva visibile nella riga scorrevole del menu
  var current = document.querySelector('.nav-list a[aria-current="page"]');
  if (current && current.scrollIntoView) current.scrollIntoView({ block: "nearest", inline: "center" });
})();

/**
 * Statistiche pubblicità (Umami): una "visualizzazione" quando almeno metà
 * dello spazio resta visibile per un secondo. I clic sono contati dagli
 * attributi data-umami-event sui link.
 */
(function () {
  "use strict";

  var ads = document.querySelectorAll(".ad[data-spazio]");
  if (!ads.length || !("IntersectionObserver" in window)) return;

  function track(el) {
    if (!window.umami) return setTimeout(function () { track(el); }, 1000);
    window.umami.track("pubblicita-vista", {
      spazio: el.dataset.spazio,
      inserzionista: el.dataset.inserzionista,
    });
  }

  var timers = new WeakMap();
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        timers.set(e.target, setTimeout(function () {
          track(e.target);
          observer.unobserve(e.target);
        }, 1000));
      } else {
        clearTimeout(timers.get(e.target));
      }
    });
  }, { threshold: 0.5 });

  ads.forEach(function (el) { observer.observe(el); });
})();

/**
 * Data del giorno (ora di Roma) nella riga in testa alla pagina.
 * Niente orologio: è una rivista, non un notiziario.
 */
(function () {
  "use strict";

  var dateEl = document.querySelector('[data-clock="date"]');
  if (!dateEl || !window.Intl) return;
  dateEl.textContent = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date());
})();

/**
 * Glossario negli articoli: la definizione si apre al tocco o al clic,
 * si chiude con Esc o toccando altrove. Una sola aperta alla volta.
 */
(function () {
  "use strict";

  var terms = document.querySelectorAll(".gl-term");
  if (!terms.length) return;

  function closeAll(except) {
    terms.forEach(function (t) { if (t !== except) t.setAttribute("aria-expanded", "false"); });
  }
  terms.forEach(function (t) {
    t.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = t.getAttribute("aria-expanded") === "true";
      closeAll(t);
      t.setAttribute("aria-expanded", open ? "false" : "true");
    });
  });
  document.addEventListener("click", function () { closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
})();

/**
 * Agenda: nasconde date ed eventi già passati (il sito è statico,
 * il controllo avviene qui) e limita il riquadro in home ai prossimi N.
 */
(function () {
  "use strict";

  var now = Date.now();
  var past = function (el) { return Date.parse(el.getAttribute("data-ev-end")) < now; };

  document.querySelectorAll(".ev").forEach(function (ev) {
    if (past(ev)) { ev.hidden = true; return; }
    ev.querySelectorAll(".ev-dates li").forEach(function (li) { if (past(li)) li.hidden = true; });
  });

  // Agende brevi (pagine delle serie): via gli eventi passati, e il riquadro se resta vuoto
  document.querySelectorAll(".ev-mini").forEach(function (li) { if (past(li)) li.hidden = true; });
  document.querySelectorAll("[data-ev-mini]").forEach(function (box) {
    if (!box.querySelector(".ev-mini:not([hidden])")) box.hidden = true;
  });

  document.querySelectorAll("[data-ev-limit]").forEach(function (list) {
    var n = parseInt(list.getAttribute("data-ev-limit"), 10);
    var shown = 0;
    list.querySelectorAll(".ev").forEach(function (ev) {
      if (ev.hidden) return;
      if (++shown > n) ev.hidden = true;
    });
    if (!shown) list.closest("section").hidden = true;
  });

  document.querySelectorAll(".ev-month").forEach(function (m) {
    if (!m.querySelector(".ev:not([hidden])")) m.hidden = true;
  });
  var empty = document.querySelector(".ev-empty");
  if (empty && !document.querySelector(".agenda .ev:not([hidden])")) empty.hidden = false;
})();

/**
 * Agenda: filtri per genere e città (si combinano). Compaiono solo con JavaScript attivo;
 * i pulsanti senza appuntamenti futuri vengono nascosti.
 */
(function () {
  "use strict";

  var box = document.querySelector("[data-ev-filters]");
  if (!box) return;
  var items = [].slice.call(document.querySelectorAll(".agenda .ev")).filter(function (ev) { return !ev.hidden; });
  if (items.length < 4) return;
  var state = { genere: "", citta: "" };
  var count = box.querySelector("[data-ev-count]");
  var none = document.querySelector(".ev-none");

  box.querySelectorAll(".chip[data-value]").forEach(function (chip) {
    var key = chip.dataset.filter, val = chip.dataset.value;
    if (val && !items.some(function (ev) { return ev.dataset[key] === val; })) chip.hidden = true;
    chip.addEventListener("click", function () {
      state[key] = val;
      box.querySelectorAll('.chip[data-filter="' + key + '"]').forEach(function (c) {
        c.setAttribute("aria-pressed", c === chip ? "true" : "false");
      });
      apply();
    });
  });

  function apply() {
    var shown = 0;
    items.forEach(function (ev) {
      var ok = (!state.genere || ev.dataset.genere === state.genere) && (!state.citta || ev.dataset.citta === state.citta);
      ev.classList.toggle("is-filtered", !ok);
      if (ok) shown++;
    });
    document.querySelectorAll(".ev-month").forEach(function (m) {
      m.classList.toggle("is-filtered", !m.querySelector(".ev:not([hidden]):not(.is-filtered)"));
    });
    count.textContent = shown + (shown === 1 ? " appuntamento" : " appuntamenti");
    if (none) none.hidden = shown > 0;
  }

  box.hidden = false;
  apply();
})();

/**
 * «Aggiungi al calendario»: crea un file .ics con le date future dell'evento
 * (ora di Roma; due ore di durata indicativa, oppure giornata intera se l'orario non è noto).
 */
(function () {
  "use strict";

  var btns = document.querySelectorAll("[data-ics]");
  if (!btns.length) return;

  function esc(t) { return String(t || "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n"); }
  function stamp(d) { return d.replace(/[-:]/g, ""); }
  function plus2h(d) {
    var h = parseInt(d.slice(11, 13), 10) + 2, day = d.slice(0, 10);
    if (h > 23) h = 23;
    return day + "T" + (h < 10 ? "0" : "") + h + d.slice(13, 16);
  }

  btns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var ev = JSON.parse(btn.dataset.ics);
      var today = new Date().toISOString().slice(0, 10);
      var dates = ev.d.filter(function (d) { return d.slice(0, 10) >= today; });
      if (!dates.length) dates = ev.d;
      var now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
      var lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pineale Classic//Agenda//IT", "CALSCALE:GREGORIAN"];
      dates.forEach(function (d, i) {
        var timed = d.length > 10;
        lines.push("BEGIN:VEVENT",
          "UID:" + stamp(d) + "-" + i + "-" + ev.u.replace(/[^a-z0-9]/gi, "").slice(-40) + "@pinealeclassic.com",
          "DTSTAMP:" + now,
          timed ? "DTSTART;TZID=Europe/Rome:" + stamp(d) + "00" : "DTSTART;VALUE=DATE:" + stamp(d),
          timed ? "DTEND;TZID=Europe/Rome:" + stamp(plus2h(d)) + "00" : "",
          "SUMMARY:" + esc(ev.t),
          "LOCATION:" + esc(ev.l),
          "DESCRIPTION:" + esc((ev.c ? ev.c + "\n\n" : "") + "Pineale Classic: " + ev.u),
          "URL:" + ev.u,
          "END:VEVENT");
      });
      lines.push("END:VCALENDAR");
      var blob = new Blob([lines.filter(Boolean).join("\r\n")], { type: "text/calendar;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = ev.t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) + ".ics";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    });
  });
})();

/**
 * Condividi: menu di sistema dove disponibile, altrimenti copia il link.
 */
(function () {
  "use strict";

  document.querySelectorAll("[data-share]").forEach(function (btn) {
    var label = btn.querySelector("[data-share-label]");
    btn.addEventListener("click", function () {
      var data = { title: btn.dataset.title, url: btn.dataset.url };
      if (navigator.share) {
        navigator.share(data).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(data.url).then(function () {
          label.textContent = "Link copiato";
          setTimeout(function () { label.textContent = "Condividi"; }, 2000);
        });
      }
    });
  });
})();

/**
 * Newsletter (strumento di redazione): inserisce l'introduzione e copia l'email
 * negli appunti, come testo formattato (per l'editor di Kit) o come codice HTML.
 */
(function () {
  "use strict";

  var email = document.getElementById("nl-email");
  var intro = document.getElementById("nl-intro");
  var status = document.querySelector("[data-nl-status]");
  if (!email || !intro) return;

  var target = email.querySelector("[data-nl-intro-target]");
  var placeholder = target.innerHTML;
  intro.addEventListener("input", function () {
    var t = intro.value.trim();
    if (!t) { target.innerHTML = placeholder; return; }
    // Testo sicuro; *titolo* diventa corsivo
    var safe = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    target.innerHTML = safe.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  });

  function say(msg) { status.textContent = msg; setTimeout(function () { status.textContent = ""; }, 2500); }

  document.querySelectorAll("[data-nl-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var html = email.innerHTML.trim();
      if (btn.dataset.nlCopy === "rich" && window.ClipboardItem) {
        navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([email.innerText], { type: "text/plain" }),
        })]).then(function () { say("Copiata: incollala in Kit"); }, function () { say("Copia non riuscita"); });
      } else {
        navigator.clipboard.writeText(html).then(function () { say("Codice HTML copiato"); }, function () { say("Copia non riuscita"); });
      }
    });
  });
})();

/**
 * Barra di vetro (computer): copia il menu e compare quando la testata esce dallo schermo.
 */
(function () {
  "use strict";

  var bar = document.querySelector(".bar");
  var mast = document.querySelector(".mast");
  var list = document.querySelector(".nav-list");
  if (!bar || !mast || !list || !("IntersectionObserver" in window)) return;

  var copy = list.cloneNode(true);
  copy.classList.remove("wrap");
  bar.querySelector(".bar-nav").appendChild(copy);

  new IntersectionObserver(function (entries) {
    var hidden = !entries[0].isIntersecting;
    bar.classList.toggle("is-on", hidden);
    if (hidden) bar.removeAttribute("inert"); else bar.setAttribute("inert", "");
  }, { threshold: 0 }).observe(mast);
})();

/**
 * Luce sul vetro: un riflesso morbido segue il cursore sulle lastre (solo con mouse).
 */
(function () {
  "use strict";

  if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var SEL = ".card-link, .series-card-link, .ev, .scheda, .chapter-link, .latest .cover-brief a, .cover-text, .nl, .index-list, .names";

  // Un solo calcolo per fotogramma: il cursore resta fluido anche sui computer lenti
  var last = null, queued = false;
  function paint() {
    queued = false;
    var e = last, el = e.target.closest && e.target.closest(SEL);
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty("--mx", (e.clientX - r.left) + "px");
    el.style.setProperty("--my", (e.clientY - r.top) + "px");
  }
  document.addEventListener("pointermove", function (e) {
    last = e;
    if (!queued) { queued = true; requestAnimationFrame(paint); }
  }, { passive: true });
})();

/**
 * «Ultimi articoli»: carosello. Frecce, contatore, barra di avanzamento, trascinamento col mouse,
 * tastiera; senza JavaScript resta una striscia scorrevole con il dito o il trackpad.
 *
 * Scorrimento continuo (data-autoplay = pixel al secondo), ad anello: le schede sono duplicate una
 * volta (nascoste ai lettori di schermo) e, quando si arriva alla copia, la posizione torna indietro
 * di un giro esatto, senza che si veda. Una sola regola per chi comanda la posizione:
 *  - scorrimento automatico: aggancio alle schede spento, posizione scritta a ogni fotogramma;
 *  - mouse sopra: si ferma dov'è (niente aggancio, quindi niente scatti);
 *  - il lettore tocca, trascina, usa frecce, rotella o tastiera: comanda lui (aggancio acceso)
 *    e lo scorrimento riparte da solo dopo 5 secondi di quiete;
 *  - fermo fuori dallo schermo, con la scheda del browser nascosta, con «riduci movimento»
 *    e con il pulsante pausa.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var QUIETE = 5000;

  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector(".latest-track");
    if (!track) return;
    var prev = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    var pos = root.querySelector("[data-carousel-pos]");
    var bar = root.querySelector("[data-carousel-bar]");
    var toggle = root.querySelector("[data-carousel-toggle]");
    var items = Array.prototype.slice.call(track.children);
    var count = items.length;
    var total = pos ? (parseInt(pos.getAttribute("data-total"), 10) || count) : count;
    var speed = reduced ? 0 : (parseFloat(root.getAttribute("data-autoplay")) || 0);
    var loop = speed > 0 && count > 1;

    if (loop) {
      items.forEach(function (it) {
        var c = it.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        c.classList.add("is-clone");
        c.querySelectorAll("a, button").forEach(function (el) { el.setAttribute("tabindex", "-1"); });
        c.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
        c.querySelectorAll("img").forEach(function (el) { el.setAttribute("loading", "lazy"); });
        track.appendChild(c);
      });
    }

    // Misure, aggiornate quando cambia la larghezza
    var stepW = 1, loopW = 0;
    function measure() {
      stepW = count > 1 ? (items[1].offsetLeft - items[0].offsetLeft) : track.clientWidth;
      if (stepW <= 0) stepW = track.clientWidth || 1;
      loopW = loop ? (track.children[count].offsetLeft - items[0].offsetLeft) : 0;
    }

    // Scrittura della posizione: sempre istantanea, mai animata dal CSS
    var written = 0;
    function setX(v) {
      track.style.scrollBehavior = "auto";
      track.scrollLeft = v;
      track.style.scrollBehavior = "";
      written = track.scrollLeft;
    }
    // Riporta dentro il primo giro (invisibile: le copie sono identiche)
    function wrap() {
      if (!loop || !loopW) return;
      var x = track.scrollLeft;
      if (x >= loopW - 1) setX(x - loopW);
    }

    // Contatore, barra, frecce
    function update() {
      var x = track.scrollLeft;
      var base = loop && loopW ? ((x % loopW) + loopW) % loopW : x;
      var idx = Math.round(base / stepW) % count;
      if (pos) pos.textContent = Math.min(idx + 1, total);
      if (bar) {
        var p;
        if (loop) p = Math.min(1, (base + stepW) / (stepW * count));
        else {
          var max = track.scrollWidth - track.clientWidth;
          var vis = max > 0 ? track.clientWidth / track.scrollWidth : 1;
          p = max > 0 ? vis + (1 - vis) * (x / max) : 1;
        }
        bar.style.setProperty("--p", Math.max(0.02, p).toFixed(4));
      }
      if (!loop) {
        var m = track.scrollWidth - track.clientWidth;
        if (prev) prev.disabled = x <= 4;
        if (next) next.disabled = x >= m - 4;
        track.classList.toggle("is-scrolled", x > 4);
        track.classList.toggle("is-end", x >= m - 4);
      } else {
        if (prev) prev.disabled = false;
        if (next) next.disabled = false;
      }
    }

    // Stato dello scorrimento automatico
    var hover = false, visible = !("IntersectionObserver" in window), paused = false;
    var idleUntil = 0, dragging = false, raf = null, last = 0, x = 0;

    function rest() {
      idleUntil = Date.now() + QUIETE;
      track.classList.remove("is-auto");
    }
    function frame() {
      raf = requestAnimationFrame(frame);
      var t = performance.now();
      var dt = last ? Math.min(100, t - last) : 0;
      last = t;
      if (paused || hover || dragging || Date.now() < idleUntil) { x = track.scrollLeft; return; }
      if (!loopW) { measure(); if (!loopW) return; }
      if (!track.classList.contains("is-auto")) { track.classList.add("is-auto"); x = track.scrollLeft; }
      x += speed * dt / 1000;
      if (loopW && x >= loopW) x -= loopW;
      if (Math.abs(x - track.scrollLeft) >= 0.5) setX(x);
    }
    function sync() {
      var on = loop && visible && !document.hidden;
      if (on && !raf) { last = 0; x = track.scrollLeft; raf = requestAnimationFrame(frame); }
      if (!on && raf) { cancelAnimationFrame(raf); raf = null; }
      if (toggle) {
        toggle.setAttribute("aria-pressed", paused ? "true" : "false");
        toggle.setAttribute("aria-label", paused ? "Riprendi lo scorrimento" : "Metti in pausa lo scorrimento");
        toggle.classList.toggle("is-paused", paused);
      }
    }

    // Frecce e tastiera: una pagina (o scheda) alla volta, ad anello se c'è lo scorrimento
    function go(dir) {
      rest();
      measure();
      if (loop) {
        if (dir < 0 && track.scrollLeft < stepW * 0.5) setX(track.scrollLeft + loopW);
        if (dir > 0 && track.scrollLeft >= loopW - 1) setX(track.scrollLeft - loopW);
      }
      var per = Math.max(1, Math.floor((track.clientWidth - 40) / stepW));
      var target = Math.round(track.scrollLeft / stepW) * stepW + dir * per * stepW;
      track.scrollTo({ left: target, behavior: reduced ? "auto" : "smooth" });
    }
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    track.addEventListener("keydown", function (e) {
      if (e.target !== track) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });

    // Scorrimento: aggiorna contatore e barra; se non l'ha mosso lo script, è il lettore
    var ticking = false, settle = null;
    track.addEventListener("scroll", function () {
      if (Math.abs(track.scrollLeft - written) > 3) { rest(); written = track.scrollLeft; }
      if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); }
      clearTimeout(settle);
      settle = setTimeout(function () { if (!dragging && !track.classList.contains("is-auto")) { wrap(); update(); } }, 180);
    }, { passive: true });

    // Mouse sopra: fermo dov'è. Tocco e rotella: comanda il lettore.
    // Solo un mouse vero: sui telefoni il tocco simula «mouse sopra» e lascerebbe il carosello in pausa
    root.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") hover = true; });
    root.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hover = false; });
    track.addEventListener("focusin", function () { hover = true; });
    track.addEventListener("focusout", function () { hover = false; });
    track.addEventListener("touchstart", rest, { passive: true });
    track.addEventListener("wheel", function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) rest(); }, { passive: true });

    // Trascinamento con il mouse (il tocco usa lo scorrimento nativo)
    var down = false, moved = false, startX = 0, startLeft = 0, pid = null;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      rest();
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft; pid = e.pointerId;
    });
    track.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) {
        moved = true; dragging = true;
        track.classList.add("is-dragging");
        try { track.setPointerCapture(pid); } catch (err) {}
      }
      if (moved) { track.style.scrollBehavior = "auto"; track.scrollLeft = startLeft - dx; track.style.scrollBehavior = ""; }
    });
    function end() {
      if (!down) return;
      down = false;
      if (!moved) return;
      dragging = false;
      track.classList.remove("is-dragging");
      rest();
      track.scrollTo({ left: Math.round(track.scrollLeft / stepW) * stepW, behavior: reduced ? "auto" : "smooth" });
    }
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    track.addEventListener("lostpointercapture", end);
    track.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);

    // Pausa, visibilità, ridimensionamento
    if (toggle) {
      if (loop) {
        toggle.hidden = false;
        toggle.addEventListener("click", function () {
          paused = !paused;
          if (!paused) { idleUntil = 0; hover = false; }   // «riprendi» riparte subito, anche col mouse sopra
          sync();
        });
      } else toggle.hidden = true;
    }
    document.addEventListener("visibilitychange", sync);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; sync(); }, { threshold: 0.25 }).observe(track);
    }
    // Le misure cambiano con la finestra, con il cambio telefono/computer e quando arrivano le immagini
    var remeasure = function () { measure(); update(); };
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(remeasure);
      ro.observe(track);
      if (items[0]) ro.observe(items[0]);
    } else window.addEventListener("resize", remeasure, { passive: true });
    track.querySelectorAll("img").forEach(function (img) { if (!img.complete) img.addEventListener("load", remeasure, { once: true }); });
    window.addEventListener("load", remeasure);

    measure();
    update();
    sync();
  });
})();

/**
 * Riquadri di vetro: «Dalla tua ultima visita» (novita.njk), invito alla newsletter (newsletter-popup.njk),
 * «Continua a leggere» (leggi-ancora.njk). Un unico gestore, un solo riquadro alla volta.
 *
 * Regole
 *  - Novità: a chi torna, 2,5 s dopo l'arrivo; una volta per visita; si chiude da solo dopo 15 s
 *    (non mentre ci si tiene sopra il mouse o il fuoco). Se il posto è occupato riprova per 20 s.
 *  - Newsletter: negli articoli tra il 60% e l'85% del testo; altrove dopo 35 s e un po' di scorrimento.
 *    Una volta per visita; chiusa, torna alla visita successiva; dopo l'iscrizione mai più.
 *    Non compare se è già visibile il riquadro d'iscrizione nella pagina.
 *  - Continua a leggere: dall'85% dell'articolo, tre proposte non ancora lette (prossima puntata per prima).
 *    Ha la precedenza: fa posto chiudendo novità e newsletter. Sparisce quando arrivano le schede
 *    «Leggi anche» o se si torna su nel testo; chiusa dal lettore, non torna su quell'articolo.
 *  - Mai mentre il lettore scrive in un campo, mai su schermi più bassi di 440 px.
 *
 * Memoria solo nel browser del lettore (nessun dato lascia il dispositivo): articoli letti (oltre il 30%),
 * ultima visita, iscrizione. Funziona anche se la memoria del browser è bloccata (semplicemente non ricorda).
 */
(function () {
  "use strict";

  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  // Pagine di conferma dell'iscrizione: da qui in poi niente più inviti
  if (/^\/newsletter\/(conferma|benvenuto)\//.test(location.pathname)) lset("pc-nlp", "iscritto");

  // Visita: la prima pagina della sessione ricorda quando c'era stata la visita precedente
  if (!sget("pc-sess")) { sset("pc-prev", lget("pc-ultima") || ""); sset("pc-sess", "1"); }
  lset("pc-ultima", String(Date.now()));

  var letti = [];
  try { letti = JSON.parse(lget("pc-letti") || "[]"); if (!Array.isArray(letti)) letti = []; } catch (e) { letti = []; }
  function segnaLetto(u) {
    if (letti.indexOf(u) >= 0) return;
    letti.push(u);
    if (letti.length > 300) letti = letti.slice(-300);
    lset("pc-letti", JSON.stringify(letti));
  }

  /* ── Gestore: un posto solo, animazioni senza corse ─────────────────────────── */
  var USCITA = 650;
  var current = null;
  var pending = [];   // riquadri che aspettano il posto: function () → true se si sono aperti

  // prio: chi ha la precedenza; preempt: può chiudere un riquadro aperto per prenderne il posto
  function make(id, prio, preempt) {
    var el = document.getElementById(id);
    if (!el) return null;
    var p = { el: el, prio: prio, preempt: !!preempt, open: false, token: 0, onClose: null };
    el.querySelectorAll("[data-pop-close], [data-nlp-close]").forEach(function (b) {
      b.addEventListener("click", function () { close(p, true); });
    });
    return p;
  }
  function blocked() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !(current && current.el.contains(a))) return true;
    return window.innerHeight < 440;
  }
  function show(p) {
    if (!p || p.open) return !!(p && p.open);
    if (blocked()) return false;
    if (current && current !== p) {
      if (p.preempt && p.prio > current.prio) close(current, false);
      else return false;
    }
    current = p; p.open = true;
    var t = ++p.token;
    p.el.hidden = false;
    void p.el.offsetWidth;            // fa partire la transizione dallo stato iniziale
    if (t === p.token) p.el.classList.add("is-in");
    return true;
  }
  function close(p, byUser) {
    if (!p || !p.open) return;
    p.open = false;
    var t = ++p.token;
    p.el.classList.remove("is-in");
    if (p.el.contains(document.activeElement)) document.activeElement.blur();
    setTimeout(function () { if (t === p.token) p.el.hidden = true; }, USCITA);
    if (current === p) current = null;
    if (p.onClose) p.onClose(byUser);
    // il posto è libero: chi aspettava riprova
    setTimeout(function () { pending = pending.filter(function (f) { return !f(); }); }, USCITA);
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && current) close(current, true); });

  // Sceglie fino a n voci (niente doppioni, mai la pagina corrente) che passano il filtro
  function choose(box, n, filter, skip) {
    var seen = {}, picked = [];
    box.querySelectorAll(".cnt-item").forEach(function (li) {
      var u = li.getAttribute("data-url");
      if (!u || seen[u] || u === location.pathname || (skip && skip.indexOf(li) >= 0)) return;
      seen[u] = 1;
      if (filter(li, u)) picked.push(li);
    });
    return picked.slice(0, n);
  }
  function render(list) {
    list.forEach(function (li, i) { li.hidden = false; li.classList.toggle("cnt-item--small", i > 0); });
  }

  /* ── Novità dalla tua ultima visita ─────────────────────────────────────────── */
  var nov = make("nov", 1);
  var prevTs = parseInt(sget("pc-prev"), 10);
  if (nov && prevTs && !sget("pc-nov")) {
    var nuovi = choose(nov.el, 12, function (li, u) {
      return parseInt(li.getAttribute("data-ts"), 10) > prevTs && letti.indexOf(u) < 0;
    });
    if (nuovi.length) {
      nov.el.querySelector("[data-nov-n]").textContent = nuovi.length === 1 ? "Un articolo nuovo per te" : nuovi.length + " articoli nuovi per te";
      render(nuovi.slice(0, 3));
      var held = false, auto = null, deadline = Date.now() + 22500;
      ["mouseenter", "focusin"].forEach(function (ev) { nov.el.addEventListener(ev, function () { held = true; }); });
      ["mouseleave", "focusout"].forEach(function (ev) { nov.el.addEventListener(ev, function () { held = false; }); });
      nov.onClose = function () { clearTimeout(auto); };
      var tryNov = function () {
        if (sget("pc-nov") || Date.now() > deadline) return true;   // fatto o scaduto: smette di riprovare
        if (!show(nov)) return false;
        sset("pc-nov", "1");
        auto = setTimeout(function wait() {
          if (held) { auto = setTimeout(wait, 3000); return; }
          close(nov, false);
        }, 15000);
        return true;
      };
      setTimeout(function () { if (!tryNov()) pending.push(tryNov); }, 2500);
    }
  }

  /* ── Invito alla newsletter ─────────────────────────────────────────────────── */
  var nlp = make("nlp", 2);
  var nlpOk = !!nlp && lget("pc-nlp") !== "iscritto" && !sget("pc-nlp-visto");
  if (nlp) {
    var form = nlp.el.querySelector("form");
    if (form) form.addEventListener("submit", function () { lset("pc-nlp", "iscritto"); });
  }
  document.querySelectorAll(".nl form").forEach(function (f) {
    f.addEventListener("submit", function () { lset("pc-nlp", "iscritto"); });
  });
  function inlineVisible() {
    var f = document.querySelector(".nl:not(.nlp)");
    if (!f) return false;
    var r = f.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }
  function tryNlp() {
    if (!nlpOk || inlineVisible()) return false;
    if (!show(nlp)) return false;
    nlpOk = false;
    sset("pc-nlp-visto", "1");
    return true;
  }

  /* ── Lettura dell'articolo e «Continua a leggere» ───────────────────────────── */
  var prose = document.querySelector(".article-body .prose");
  var cnt = prose ? make("cnt", 3, true) : null;
  var related = document.querySelector(".related");
  var CNT_KEY = "pc-cnt:" + location.pathname;
  var cntOk = false, marked = false;
  if (cnt && !sget(CNT_KEY)) {
    var scelti = choose(cnt.el, 3, function (li, u) { return letti.indexOf(u) < 0; });
    if (scelti.length < 3) scelti = scelti.concat(choose(cnt.el, 3 - scelti.length, function () { return true; }, scelti));
    if (scelti.length) {
      render(scelti);
      cntOk = true;
      var head = cnt.el.querySelector(".cnt-head");
      if (head && scelti[0].hasAttribute("data-puntata")) head.textContent = head.getAttribute("data-puntata-label");
      cnt.onClose = function (byUser) { if (byUser) { cntOk = false; sset(CNT_KEY, "1"); } };
    }
  }

  var startedAt = Date.now(), scrolled = false;
  function progress() {
    var r = prose.getBoundingClientRect();
    return r.height ? (window.innerHeight - r.top) / r.height : 0;
  }
  function check() {
    if (prose) {
      var p = progress();
      if (!marked && p > 0.3) { marked = true; segnaLetto(location.pathname); }
      var relVisible = !!related && related.getBoundingClientRect().top < window.innerHeight * 0.85;
      if (cnt && cnt.open && (relVisible || p < 0.7)) close(cnt, false);
      else if (cntOk && !relVisible && p >= 0.85) show(cnt);
      else if (p >= 0.6 && p < 0.85) tryNlp();
    } else if (scrolled && Date.now() - startedAt > 35000) {
      tryNlp();
    }
  }
  // Controllo a intervalli regolari durante lo scorrimento (al massimo ogni 120 ms, con un ultimo
  // controllo a scorrimento finito), più un controllo di sicurezza ogni 1,5 s a pagina visibile:
  // nessun evento perso, anche con salti alle ancore o pagine che cambiano altezza.
  var lastCheck = 0, trailing = null;
  function onScroll() {
    scrolled = true;
    var now = Date.now();
    clearTimeout(trailing);
    if (now - lastCheck >= 120) { lastCheck = now; check(); }
    trailing = setTimeout(function () { lastCheck = Date.now(); check(); }, 140);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  setInterval(function () { if (!document.hidden) check(); }, 1500);
  check();
})();
