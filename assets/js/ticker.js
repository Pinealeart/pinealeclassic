/**
 * ticker.js — Notizie scorrevoli in fondo alla pagina
 * Legge window.TICKER_NOTIZIE ({ text, url?, label? }) e crea un loop continuo.
 * Si ferma al passaggio del mouse, al tocco, con il focus da tastiera e a scheda nascosta.
 * Con "riduci movimento" attivo resta ferma e si scorre a mano.
 */

(function () {
  "use strict";

  var notizie = window.TICKER_NOTIZIE || [];
  var track = document.getElementById("pc-ticker-track");
  var bar = document.getElementById("pc-ticker-bar");
  if (!notizie.length || !track || !bar) return;

  var VELOCITA = 42; // pixel al secondo
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ════════════════════════════════════════════════════════════════════════
  // COSTRUZIONE
  // ════════════════════════════════════════════════════════════════════════

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m];
    });
  }

  // Con url: link interno (articolo della redazione). Senza url: solo testo (rassegna).
  function itemHtml(n, hidden) {
    var text = n.text || n;
    var tag = n.url ? "a" : "span";
    var attrs = ' class="ticker-item"';
    if (n.url) attrs = ' href="' + escapeHtml(n.url) + '"' + attrs;
    if (hidden) attrs += (n.url ? ' tabindex="-1"' : "") + ' aria-hidden="true"';
    return (
      "<" + tag + attrs + ">" +
      (n.label ? '<span class="ticker-src">' + escapeHtml(n.label) + "</span>" : "") +
      '<span class="ticker-txt">' + escapeHtml(text) + "</span>" +
      "</" + tag + '><span class="ticker-sep" aria-hidden="true"></span>'
    );
  }

  // Seconda copia (nascosta ai lettori di schermo) per il loop continuo
  track.innerHTML =
    notizie.map(function (n) { return itemHtml(n, false); }).join("") +
    (reduced ? "" : notizie.map(function (n) { return itemHtml(n, true); }).join(""));

  if (reduced) {
    bar.classList.add("ticker--static");
    return;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ANIMAZIONE
  // ════════════════════════════════════════════════════════════════════════

  var pos = 0;
  var halfWidth = 0;
  var lastTime = null;
  var holds = { hover: false, focus: false, touch: false, hidden: false };

  function paused() {
    return holds.hover || holds.focus || holds.touch || holds.hidden;
  }

  function measure() {
    halfWidth = track.scrollWidth / 2;
  }

  function step(ts) {
    var dt = lastTime ? (ts - lastTime) / 1000 : 0;
    lastTime = ts;

    if (!paused() && dt > 0 && dt < 0.1 && halfWidth) {
      pos += VELOCITA * dt;
      if (pos >= halfWidth) pos -= halfWidth;
      track.style.transform = "translate3d(-" + pos.toFixed(2) + "px,0,0)";
    }
    requestAnimationFrame(step);
  }

  function hold(key, value) {
    holds[key] = value;
    bar.classList.toggle("is-paused", paused());
    if (!value) lastTime = null;
  }

  bar.addEventListener("mouseenter", function () { hold("hover", true); });
  bar.addEventListener("mouseleave", function () { hold("hover", false); });
  bar.addEventListener("focusin", function () { hold("focus", true); });
  bar.addEventListener("focusout", function () { hold("focus", false); });
  bar.addEventListener("touchstart", function () { hold("touch", true); }, { passive: true });
  bar.addEventListener("touchend", function () { setTimeout(function () { hold("touch", false); }, 1200); }, { passive: true });
  document.addEventListener("visibilitychange", function () { hold("hidden", document.hidden); });

  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () {
    measure();
    window.addEventListener("resize", measure);
    requestAnimationFrame(step);
  });
})();
