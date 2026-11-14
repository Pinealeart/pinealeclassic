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
    target.textContent = t;
    if (!t) target.innerHTML = placeholder;
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
 * «Ultimi articoli»: carosello. Frecce, contatore, barra di avanzamento,
 * trascinamento col mouse (senza aprire l'articolo per sbaglio), tastiera.
 * Senza JavaScript resta una striscia scorrevole con il dito o il trackpad.
 */
(function () {
  "use strict";

  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector(".latest-track");
    var prev = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    var pos = root.querySelector("[data-carousel-pos]");
    var bar = root.querySelector("[data-carousel-bar]");
    if (!track) return;
    var items = Array.prototype.slice.call(track.children);
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function step() {
      var first = items[0], second = items[1];
      if (!first) return track.clientWidth;
      var w = second ? second.offsetLeft - first.offsetLeft : first.offsetWidth;
      // Avanza di tante schede quante ne entrano intere (almeno una)
      return Math.max(1, Math.floor((track.clientWidth - 40) / w)) * w;
    }

    function go(dir) {
      track.scrollBy({ left: dir * step(), behavior: reduced ? "auto" : "smooth" });
    }

    var ticking = false;
    function update() {
      ticking = false;
      var max = track.scrollWidth - track.clientWidth;
      var x = track.scrollLeft;
      var atStart = x <= 4, atEnd = x >= max - 4;
      if (prev) prev.disabled = atStart;
      if (next) next.disabled = atEnd;
      track.classList.toggle("is-scrolled", !atStart);
      track.classList.toggle("is-end", atEnd);
      if (bar) {
        var visible = max > 0 ? track.clientWidth / track.scrollWidth : 1;
        var p = max > 0 ? visible + (1 - visible) * (x / max) : 1;
        bar.style.setProperty("--p", Math.min(1, p).toFixed(4));
      }
      if (pos) {
        // Prima scheda (articolo) ben visibile a sinistra
        var left = track.getBoundingClientRect().left + 30, n = 1;
        for (var i = 0; i < items.length; i++) {
          if (items[i].getBoundingClientRect().right > left) { n = i + 1; break; }
        }
        var total = parseInt(pos.getAttribute("data-total"), 10) || n;
        pos.textContent = Math.min(n, total);
      }
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    track.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // Tastiera: frecce sulla striscia (quando ha il focus)
    track.addEventListener("keydown", function (e) {
      if (e.target !== track) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") { e.preventDefault(); track.scrollTo({ left: 0, behavior: reduced ? "auto" : "smooth" }); }
      else if (e.key === "End") { e.preventDefault(); track.scrollTo({ left: track.scrollWidth, behavior: reduced ? "auto" : "smooth" }); }
    });

    // Trascinamento con il mouse (il tocco usa lo scorrimento nativo)
    var down = false, moved = false, startX = 0, startLeft = 0, pid = null;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft; pid = e.pointerId;
    });
    track.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        track.classList.add("is-dragging");
        try { track.setPointerCapture(pid); } catch (err) {}
      }
      if (moved) track.scrollLeft = startLeft - dx;
    });
    function end() {
      if (!down) return;
      down = false;
      if (!moved) return;
      track.classList.remove("is-dragging");
      // Aggancio alla scheda più vicina dopo il rilascio
      var w = items[1] ? items[1].offsetLeft - items[0].offsetLeft : 1;
      track.scrollTo({ left: Math.round(track.scrollLeft / w) * w, behavior: reduced ? "auto" : "smooth" });
    }
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    track.addEventListener("lostpointercapture", end);
    // Dopo un trascinamento il clic non apre l'articolo
    track.addEventListener("click", function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);

    update();
  });
})();
