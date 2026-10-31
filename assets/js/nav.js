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
 * Data e ora correnti a Roma nella riga in testa alla pagina.
 * Si aggiorna allo scoccare di ogni minuto.
 */
(function () {
  "use strict";

  var dateEl = document.querySelector('[data-clock="date"]');
  var timeEl = document.querySelector('[data-clock="time"]');
  if (!dateEl || !timeEl || !window.Intl) return;

  var zone = { timeZone: "Europe/Rome" };
  var fDate = new Intl.DateTimeFormat("it-IT", Object.assign({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, zone));
  var fTime = new Intl.DateTimeFormat("it-IT", Object.assign({ hour: "2-digit", minute: "2-digit" }, zone));
  var fIso = function (d) { return d.toISOString(); };

  function tick() {
    var now = new Date();
    dateEl.textContent = fDate.format(now);
    timeEl.textContent = fTime.format(now);
    timeEl.setAttribute("datetime", fIso(now));
    setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  }

  tick();
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
