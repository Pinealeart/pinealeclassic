// «La settimana»: video YouTube senza cookie, caricato solo al clic, e capitoli che seguono il video.
// Niente script esterni: si parla con il lettore YouTube via postMessage (enablejsapi=1).
(() => {
  const box = document.querySelector("[data-sett]");
  if (!box) return;
  const id = box.dataset.yt;
  const frame = box.querySelector("[data-sett-frame]");
  const caps = [...box.querySelectorAll("[data-sett-cap]")];
  const ORIGINE = "https://www.youtube-nocookie.com";
  let iframe = null;

  const invia = (func, args = []) =>
    iframe && iframe.contentWindow.postMessage(JSON.stringify({ event: "command", func, args }), ORIGINE);

  const evidenzia = (t) => {
    let attivo = null;
    for (const c of caps) if (t + 0.25 >= Number(c.dataset.t)) attivo = c;
    for (const c of caps) {
      const si = c === attivo;
      c.classList.toggle("is-on", si);
      if (si) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current");
    }
  };

  let audio = null; // pulsante «Attiva l'audio» (solo con avvio automatico, che i browser consentono solo senza audio)

  const carica = (t, muto = false) => {
    const q = new URLSearchParams({ autoplay: "1", enablejsapi: "1", rel: "0", playsinline: "1", start: String(t), origin: location.origin });
    if (muto) q.set("mute", "1");
    iframe = document.createElement("iframe");
    iframe.src = `${ORIGINE}/embed/${id}?${q}`;
    iframe.title = "Video: La settimana di Pineale Classic";
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    iframe.addEventListener("load", () => {
      // Chiede al lettore di mandare l'avanzamento (infoDelivery)
      iframe.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), ORIGINE);
    });
    frame.replaceChildren(iframe);
    if (muto) {
      audio = document.createElement("button");
      audio.type = "button";
      audio.className = "sett-audio";
      audio.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" fill="currentColor"/></svg>Attiva l’audio';
      audio.addEventListener("click", () => {
        invia("unMute"); invia("setVolume", [100]); invia("playVideo");
        audio.hidden = true;
        if (window.umami) window.umami.track("settimana-audio");
      });
      frame.append(audio);
    }
    evidenzia(t);
    if (window.umami) window.umami.track(muto ? "settimana-auto" : "settimana-play", { da: t });
  };

  window.addEventListener("message", (e) => {
    if (e.origin !== ORIGINE || !iframe || e.source !== iframe.contentWindow) return;
    let d;
    try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
    const t = d && d.info && d.info.currentTime;
    if (typeof t === "number") evidenzia(t);
    // Audio attivato dai controlli di YouTube: il nostro pulsante non serve più
    if (audio && d && d.info && d.info.muted === false) audio.hidden = true;
  });

  // Arrivo da un articolo con #t34: il video parte da quel punto e il capitolo è già evidenziato
  const m = location.hash.match(/^#t(\d+)$/);
  const inizio = m ? Number(m[1]) : 0;
  if (m) {
    const facade = box.querySelector(".sett-facade");
    if (facade) facade.dataset.t = String(inizio);
    evidenzia(inizio);
    const c = caps.find((x) => Number(x.dataset.t) === inizio);
    if (c && !("auto" in box.dataset)) c.scrollIntoView({ block: "center" });
  }

  // Pagina d'approdo (/settimana/): parte subito, senza audio. Non per chi ha chiesto meno movimento.
  if ("auto" in box.dataset && !matchMedia("(prefers-reduced-motion: reduce)").matches) carica(inizio, true);

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-sett-play]");
    if (!b) return;
    const t = Number(b.dataset.t) || 0;
    if (!iframe) carica(t);
    else { invia("seekTo", [t, true]); invia("playVideo"); evidenzia(t); }
    if (b.classList.contains("sett-t")) frame.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
})();
