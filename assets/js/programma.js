// «Programma di sala» — il lettore.
//
// Spotify: lettore incorporato semplice (nessuno script esterno). Il lettore accetta comandi via postMessage
// ({command: "toggle" | "pause" | "resume" | "seek", timestamp}) e manda gli eventi «ready», «playback_started»,
// «playback_update» ({isPaused, isBuffering, position, duration} in millisecondi). Su questo costruiamo i nostri
// comandi: play/pausa, barra di avanzamento con salto, rimandi ai minuti senza ricaricare, ascolto continuo,
// riconoscimento dell'anteprima di 30 secondi.
// Apple Music: lettore incorporato senza interfaccia pubblica; si usano i suoi comandi.
//
// Il lettore si trascina, si riduce, mostra la scheda del brano e il programma, ricorda dove si era rimasti,
// e resta in ascolto mentre si leggono altre pagine del sito (finestra di lettura sopra il programma).
(() => {
  // Dentro la finestra di lettura il programma non deve aprire un secondo lettore
  if (window.top !== window && window.top.__pcProgramma) return;

  const box = document.querySelector("[data-prog]");
  if (!box) return;
  window.__pcProgramma = true;

  const dock = box.querySelector("[data-prog-dock]");
  const riprendiBox = box.querySelector("[data-prog-riprendi]");
  const $ = (sel, el = dock) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const brani = $$(".prog-brano", box);
  document.body.append(dock, riprendiBox); // fuori dal contenuto: deve stare sopra la finestra di lettura

  const slot = $("[data-prog-slot]");
  const ora = $("[data-prog-ora]");
  const nDock = $("[data-prog-dock-n]");
  const stato = $("[data-prog-stato]");
  const presa = $("[data-prog-presa]");
  const btnRiduci = $("[data-prog-riduci]");
  const btnProgramma = $("[data-prog-programma]");
  const btnInfo = $("[data-prog-info]");
  const btnElenco = $("[data-prog-elenco]");
  const btnContinuo = $("[data-prog-continuo]");
  const pannello = $("[data-prog-info-pannello]");
  const errore = $("[data-prog-errore]");
  const av = $("[data-prog-av]");
  const avRiemp = $("[data-prog-av-riemp]");
  const avPomello = $("[data-prog-av-pomello]");
  const avSegni = $("[data-prog-av-segni]");
  const tOra = $("[data-prog-t-ora]");
  const tTot = $("[data-prog-t-tot]");
  const indice = $$(".prog-indice a");
  const annuncio = $("[data-prog-annuncio]");
  const seguire = $("[data-prog-seguire]");
  const fine = $("[data-prog-fine]");
  const accesso = $("[data-prog-accesso]");
  const accessoTxt = $("[data-prog-accesso-txt]");
  const accessoCom = $("[data-prog-accesso-com]");
  const accessoAlt = $("[data-prog-accesso-alt]");
  // Safari blocca i cookie dei siti incorporati: il lettore di Spotify qui non vede l'accesso e resta in anteprima
  const SAFARI = /^((?!chrome|chromium|android|crios|fxios|edg|opr).)*safari/i.test(navigator.userAgent);
  const btnAppleTutto = $("[data-prog-apple-tutto]");
  const plApple = dock.dataset.plApple ? dock.dataset.plApple.replace("https://music.apple.com", "https://embed.music.apple.com") : "";
  const plSpotify = dock.dataset.plSpotify || "";
  // Link a un brano: la nostra playlist con il brano evidenziato (il parametro ?context= sui link ai brani non porta alla playlist)
  const linkSpotify = (id) => plSpotify ? `https://open.spotify.com/playlist/${plSpotify}${id ? `?highlight=${encodeURIComponent(`spotify:track:${id}`)}` : ""}`
    : id ? `https://open.spotify.com/track/${id}` : "https://open.spotify.com/";
  const slug = dock.dataset.programma;
  const scelta = $("[data-prog-scegli]");

  // La sequenza della playlist: un elemento per ogni traccia (le opere in più parti ne hanno una per parte),
  // nello stesso ordine della playlist su Spotify.
  const sequenza = [];
  for (const li of brani) {
    const parti = $$("[data-parte]", li);
    if (parti.length) for (const p of parti) sequenza.push({ li, parte: p, id: p.dataset.spotify });
    else sequenza.push({ li, parte: null, id: li.dataset.spotify });
  }
  const perId = new Map(sequenza.map((x, i) => [x.id, i]));
  const ultimoIdx = sequenza.length - 1;
  const indiceDi = (li, parte) => {
    const i = sequenza.findIndex((x) => x.li === li && (!parte || x.parte === parte || (x.parte && x.parte.dataset.spotify === parte.dataset.spotify)));
    return Math.max(0, i);
  };
  // Lettore Spotify = la nostra playlist (quando esiste): i brani si susseguono da soli, e i link portano alla playlist.
  // Il lettore non ha un comando «vai alla traccia N»: si avanza saltando alla fine del brano (fino a MAX_SALTI tracce);
  // per i brani più lontani si chiede di toccarli nell'elenco di Spotify, che è nel lettore.
  // Chi sente solo le anteprime (senza accesso, o su Safari) ha da Spotify un limite di circa tre cambi di traccia
  // nella playlist, poi compare il suo invito «Get Spotify»: per loro i salti usano il lettore del singolo brano (soloTracce).
  const modoPl = () => S.fonte === "spotify" && !!plSpotify && !S.soloTracce;
  const MAX_SALTI = 3;

  // YouTube: le pubblicazioni ufficiali delle stesse incisioni («Provided to YouTube»), ascolto intero e gratuito.
  // Il lettore riceve tutta la sequenza come playlist e si comanda via postMessage (playVideoAt, seekTo, pause…).
  const YT_ORIGINE = "https://www.youtube-nocookie.com";
  const ytIds = sequenza.map((x) => (x.parte ? x.parte.dataset.youtube : x.li.dataset.youtube) || "");
  const haYT = ytIds.every(Boolean);
  const ALTO_YT = 200; // YouTube chiede un lettore visibile di almeno 200×200
  const ALTO_PL = 152;
  const altoScelta = () => (innerHeight < 720 ? 300 : 380);

  const mem = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const track = (ev, dati) => { if (window.umami) window.umami.track(ev, dati); };
  const autoreDi = (li) => li.querySelector(".prog-autore").firstChild.textContent.trim();
  const operaDi = (li) => li.querySelector(".prog-opera").textContent.trim();

  /* ── Stato ─────────────────────────────────────────────────────────── */
  const S = {
    // servizio predefinito: YouTube (ascolto intero e gratuito); Spotify o Apple Music restano se scelti e salvati
    fonte: ["spotify", "apple", "youtube"].includes(mem.get("pc-fonte")) ? mem.get("pc-fonte") : "youtube",
    continuo: mem.get("pc-continuo") !== false,
    appleTutto: !!plApple && mem.get("pc-apple-tutto") === true,
    // con YouTube il video sta in un quadrato di 200×200 accanto ai comandi (è la copertina del disco); a richiesta, grande
    videoGrande: mem.get("pc-video-grande") === true,
    dopoAccesso: false,
    li: null, parte: null, t0: 0,
    frame: null, pronto: false, inPausa: true, inCarica: false,
    pos: 0, dur: 0, ultimaPos: 0, finito: false,
    anteprima: null, timerPronto: 0, seekDopoAvvio: 0, trascinaAv: false,
    tipo: "", idx: -1, uri: "", meta: null, saltoDa: "", finale: false, soloTracce: false,
  };
  const titoloPagina = document.title;
  let lettura = null;

  /* ── Interfaccia ───────────────────────────────────────────────────── */
  // avviso «Tocca ▶ per ascoltare» quando il browser non lascia partire il brano da solo
  function tocca(si) {
    if (dock.classList.contains("is-tocca") === si) return;
    dock.classList.toggle("is-tocca", si);
    const t = $("[data-prog-tocca]");
    if (t) t.hidden = !si;
    if (si) { annuncio.textContent = "Il browser non ha avviato il brano: tocca Riproduci per ascoltare."; track("programma-tocca-play"); }
  }
  const segnaFonte = () => {
    for (const b of $$("[data-prog-fonte]")) b.setAttribute("aria-pressed", String(b.dataset.progFonte === S.fonte));
    box.classList.toggle("is-apple", S.fonte === "apple");
    dock.classList.toggle("is-apple", S.fonte === "apple");
    dock.classList.toggle("is-youtube", S.fonte === "youtube");
    dock.classList.toggle("is-copertina", !S.videoGrande);
    const bv = $("[data-prog-video]");
    if (bv) {
      bv.setAttribute("aria-pressed", String(S.videoGrande));
      bv.setAttribute("aria-label", S.videoGrande ? "Video piccolo" : "Video grande");
      bv.title = S.videoGrande ? "Video piccolo (V)" : "Video grande (V)";
    }
    if (typeof aggiornaBanda === "function") aggiornaBanda();
    if (typeof applicaRiquadro === "function") requestAnimationFrame(applicaRiquadro);
  };
  if (!haYT) for (const b of $$('[data-prog-fonte="youtube"]')) b.remove();
  if (!haYT && S.fonte === "youtube") S.fonte = "spotify";
  if (SAFARI) {
    const inv = $(".prog-invito .is-anteprima");
    inv.innerHTML = 'Anteprima di 30 secondi: su Safari il lettore di Spotify inserito nei siti suona solo anteprime. Per l\'ascolto completo <button type="button" class="prog-invito-btn" data-prog-passa-apple>passa ad Apple Music</button> o <a href="#" data-prog-apri-spotify target="_blank" rel="noopener">apri il brano nell\'app Spotify</a>.';
  }
  const segnaContinuo = () => {
    btnContinuo.setAttribute("aria-pressed", String(S.continuo));
    if (btnAppleTutto) btnAppleTutto.setAttribute("aria-pressed", String(S.appleTutto));
  };
  segnaFonte(); segnaContinuo();

  const aggiornaStato = () => {
    const suona = !!S.li && S.pronto && !S.inPausa;
    if (suona || !S.li) tocca(false);
    dock.classList.toggle("is-suona", suona);
    dock.classList.toggle("is-carica", !!S.li && S.inCarica);
    dock.classList.toggle("is-anteprima", S.anteprima === true);
    dock.classList.toggle("is-intero", S.anteprima === false);
    for (const b of $$("[data-prog-pp]")) b.setAttribute("aria-label", suona ? "Pausa" : "Riproduci");
    for (const li of brani) li.classList.toggle("is-suona", li === S.li && suona);
    // anche nell'elenco del pannello (▶ / ⏸ sulla riga del brano in ascolto)
    for (const r of pannello.querySelectorAll(".prog-elenco > li")) r.classList.toggle("is-suona", r.classList.contains("is-on") && suona);
    if (suona && typeof proponiScheda === "function") proponiScheda();
    if (S.li && typeof segnaNuovoBrano === "function") segnaNuovoBrano(); // a ogni brano nuovo, anche prima che suoni
    stato.textContent = !S.li ? "" : S.fonte === "apple" ? "Apple Music" : S.tipo === "yt" ? "YouTube · intero" : S.anteprima === true ? "Anteprima" : S.anteprima === false ? "Brano intero" : "";
    if (!lettura) document.title = suona ? `♪ ${autoreDi(S.li)} · ${titoloPagina}` : titoloPagina;
  };
  const disegnaAv = () => {
    const d = S.dur / 1000, p = Math.min(S.pos / 1000, d || Infinity);
    const r = d ? p / d : 0;
    avRiemp.style.transform = `scaleX(${r})`;
    avPomello.style.left = `${r * 100}%`;
    tOra.textContent = mmss(p);
    tTot.textContent = d ? mmss(d) : "–:––";
    av.setAttribute("aria-valuemax", String(Math.round(d)));
    av.setAttribute("aria-valuenow", String(Math.round(p)));
    av.setAttribute("aria-valuetext", `${mmss(p)} di ${d ? mmss(d) : "?"}`);
    if (S.li) S.li.style.setProperty("--avanz", r);
  };
  // Segni sulla barra: i minuti indicati in «Cosa ascoltare»
  const disegnaSegni = () => {
    avSegni.replaceChildren();
    if (!S.li || S.parte || S.anteprima || !S.dur) return;
    for (const m of $$(".prog-testi [data-min]", S.li)) {
      const t = +m.dataset.min;
      if (t * 1000 >= S.dur) continue;
      const s = document.createElement("button");
      s.type = "button"; s.className = "prog-av-segno"; s.dataset.min = t;
      s.style.left = `${(t * 1000 / S.dur) * 100}%`;
      s.setAttribute("aria-label", `Vai a ${mmss(t)}`); s.title = mmss(t);
      avSegni.append(s);
    }
  };

  /* ── Comandi verso Spotify ─────────────────────────────────────────── */
  const invia = (comando) => {
    if (!S.frame || S.fonte !== "spotify") return false;
    try { S.frame.contentWindow.postMessage(comando, "https://open.spotify.com"); return true; } catch { return false; }
  };
  const playPausa = () => {
    if (!S.li || (modoPl() && S.tipo !== "pl") || (S.fonte === "youtube" && S.tipo !== "yt")) { const li = S.li || brani[0]; return void ascolta(li, 0, S.parte || li.querySelector("[data-parte]")); }
    if (S.tipo === "yt") {
      if (!S.pronto) return;
      if (S.finale) return void ricomincia();
      inviaYT(S.inPausa ? "playVideo" : "pauseVideo");
      S.inPausa = !S.inPausa; aggiornaStato();
      return;
    }
    if (S.fonte !== "spotify" || !S.pronto) return;
    if (S.finale) return void ricomincia();
    if (S.finito && !modoPl()) { S.inPausa = true; vaiA(0); fine.hidden = true; return; } // brano finito: Play lo fa ripartire
    invia({ command: S.inPausa ? "resume" : "pause" });
    track("programma-pp", { azione: S.inPausa ? "play" : "pausa" });
  };
  const vaiA = (t) => {
    if (S.tipo === "yt") {
      if (!S.pronto) return false;
      const d = S.dur / 1000;
      t = Math.max(0, d ? Math.min(t, d - 1) : t);
      inviaYT("seekTo", [t, true]);
      if (S.inPausa) inviaYT("playVideo");
      S.pos = t * 1000; disegnaAv();
      return true;
    }
    if (S.fonte !== "spotify" || !S.pronto) return false;
    const d = S.dur / 1000;
    t = Math.max(0, d ? Math.min(t, d - 1) : t);
    invia({ command: "seek", timestamp: Math.floor(t) });
    if (S.inPausa) invia({ command: "resume" });
    S.pos = t * 1000; S.ultimaPos = S.pos; S.finito = false; disegnaAv();
    return true;
  };

  window.addEventListener("message", (e) => {
    if (e.origin !== "https://open.spotify.com" || !S.frame || e.source !== S.frame.contentWindow) return;
    let m = e.data;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch { return; } }
    if (!m || !m.type) return;
    if (m.type === "ready") {
      S.pronto = true; clearTimeout(S.timerPronto); errore.hidden = true;
      if (S.tipo === "pl") {
        // partenza immediata (anche per un brano lontano: dal primo aggiornamento si capisce se è anteprima o brano intero)
        invia({ command: "resume" });
      } else {
        invia({ command: "resume" }); // partenza immediata: l'utente ha appena scelto il brano
        if (S.t0) S.seekDopoAvvio = S.t0;
      }
      aggiornaStato();
    } else if (m.type === "playback_update" && m.payload) {
      const p = m.payload;
      // quale traccia della playlist sta suonando
      if (S.tipo === "pl" && p.playingURI && p.playingURI !== S.uri) {
        const id = p.playingURI.split(":").pop();
        const i = perId.has(id) ? perId.get(id) : S.uri ? Math.min(S.idx + 1, ultimoIdx) : 0;
        const primo = !S.uri;
        S.uri = p.playingURI;
        cambiaBrano(i, primo);
      }
      S.inPausa = !!p.isPaused || S.finito || S.finale; // a fine brano Spotify continua a dire «in riproduzione»
      if (S.tipo === "pl" && !S.finale) S.inPausa = !!p.isPaused;
      S.inCarica = !!p.isBuffering;
      if (p.duration) {
        S.dur = p.duration;
        const ant = p.duration <= 30500;
        if (S.anteprima !== ant) { S.anteprima = ant; disegnaSegni(); }
        if (S.tipo === "pl" && ant && !S.soloTracce) {
          S.soloTracce = true;
          // anteprima e brano lontano: lo si apre nel lettore del singolo brano (niente limite di salti)
          if (S.meta && S.meta.k !== S.idx) {
            const x = sequenza[S.meta.k], t = S.meta.t;
            S.meta = null; chiudiScelta();
            return void ascolta(x.li, t, x.parte);
          }
        }
        if (S.tipo === "pl" && !ant && S.meta && S.meta.attesa) {
          // brano intero e brano lontano: si ferma la prima traccia e si indica quale toccare nell'elenco
          S.meta.attesa = false;
          invia({ command: "pause" }); invia({ command: "seek", timestamp: 0 });
          mostraScelta();
        }
        if (S.dopoAccesso) {
          S.dopoAccesso = false;
          if (ant) {
            mostraAlternative();
          } else {
            annuncio.textContent = "Accesso riuscito: ascolti i brani per intero.";
            dock.classList.add("is-festa"); setTimeout(() => dock.classList.remove("is-festa"), 1600);
          }
        }
      }
      if (!S.trascinaAv) S.pos = p.position || 0;
      // salto chiesto prima che la riproduzione partisse (rimando a un minuto, ripresa)
      if (S.seekDopoAvvio && S.dur && !S.inCarica) {
        const t = S.seekDopoAvvio; S.seekDopoAvvio = 0;
        if (!S.anteprima && Math.abs(S.pos / 1000 - t) > 2) vaiA(t);
      }
      // verso il brano scelto: arrivati, si va al minuto chiesto; prima, si salta alla fine della traccia
      const saltando = S.tipo === "pl" && S.meta && S.idx !== S.meta.k;
      if (S.tipo === "pl" && S.meta && S.dur) {
        if (S.idx === S.meta.k) {
          if (!S.inCarica && S.pos < S.dur - 1500) {
            const t = S.meta.t;
            S.meta = null; chiudiScelta();
            if (t && !S.anteprima && Math.abs(S.pos / 1000 - t) > 2) vaiA(t);
            if (!lettura) S.li.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else if (S.idx < S.meta.k && (S.meta.forza || S.meta.k - S.idx <= MAX_SALTI) && !p.isPaused && S.saltoDa !== S.uri && S.pos < S.dur - 1500) {
          S.saltoDa = S.uri;
          invia({ command: "seek", timestamp: Math.floor(S.dur / 1000) });
        }
      }
      // fine del brano: Spotify manda la posizione uguale alla durata e poi tace (oppure si ferma o torna all'inizio)
      if (!saltando && S.dur && !S.finito && (S.pos >= S.dur - 350 || (S.ultimaPos > S.dur - 1600 && (S.inPausa || S.pos < S.ultimaPos - 1000)))) {
        branoFinito();
      }
      if (S.pos > 0) S.ultimaPos = S.pos;
      S.ultimoAgg = Date.now();
      aggiornaStato(); disegnaAv(); salvaRipresa(); segnaSeguire();
    } else if (m.type === "playback_started") {
      S.finito = false;
    }
  });

  // Riserva: se gli aggiornamenti si fermano vicino alla fine mentre il brano suonava, il brano è finito
  setInterval(() => {
    if (!S.li || S.fonte !== "spotify" || !S.pronto || S.finito || S.inPausa || !S.dur || !S.ultimoAgg) return;
    if (S.tipo === "pl" && S.meta && S.idx !== S.meta.k) return;
    if (Date.now() - S.ultimoAgg > 2600 && S.ultimaPos > S.dur - 2600) branoFinito();
  }, 1000);

  /* ── La playlist nel lettore ───────────────────────────────────────── */
  // Aggiorna l'interfaccia sul brano in ascolto (scheda accesa, titolo, numero, pannello)
  const segnaBrano = (li, parte) => {
    if (S.li && S.li !== li) S.li.classList.remove("is-on", "is-suona");
    for (const p of $$("[data-parte].is-on")) p.classList.remove("is-on");
    S.li = li; S.parte = parte;
    li.classList.add("is-on");
    li.classList.remove("is-cercato");
    if (parte) for (const p of $$(`[data-parte][data-spotify="${parte.dataset.spotify}"]`)) p.classList.add("is-on");
    for (const a of indice) a.classList.toggle("is-on", a.getAttribute("href") === `#${li.id}`);
    ora.textContent = `${autoreDi(li)} — ${operaDi(li)}${parte ? ` · ${parte.textContent.trim()}` : ""}`;
    ora.title = ora.textContent;
    annuncio.textContent = `In ascolto: ${ora.textContent}`;
    seguire.hidden = true;
    if (!S.finale) fine.hidden = true;
    nDock.textContent = `${li.dataset.n} di ${brani.length}`;
    $("[data-prog-prec]").disabled = S.idx <= 0;
    $("[data-prog-succ]").disabled = S.idx >= ultimoIdx;
    avSegni.replaceChildren(); segniPer = -1;
    disegnaAv(); aggiornaStato();
    if (!pannello.hidden) riempiPannello();
  };
  // Spotify è passato a un'altra traccia (da solo, per un nostro salto o perché l'ascoltatore l'ha toccata nell'elenco)
  function cambiaBrano(i, primo) {
    const prima = S.idx;
    const naturale = !primo && (S.finito || (S.dur && S.ultimaPos > S.dur - 3000)); // la traccia precedente era finita
    S.idx = i;
    Object.assign(S, { dur: 0, ultimaPos: 0, finito: false, ultimoAgg: 0, saltoDa: "" });
    const x = sequenza[i];
    segnaBrano(x.li, x.parte);
    if (!primo && S.meta && !S.meta.forza && !S.meta.attesa && i !== S.meta.k && !(i < S.meta.k && S.meta.k - i <= MAX_SALTI)) {
      S.meta = null; chiudiScelta(); // ha scelto un altro brano: si segue la sua scelta
    }
    if (naturale && !S.meta) {
      if (prima === ultimoIdx) return void finale(); // la playlist è ricominciata da capo
      if (!S.continuo) { invia({ command: "pause" }); S.inPausa = true; aggiornaStato(); }
    }
    if (!S.meta) salvaRipresa(true);
  }
  function branoFinito() {
    S.finito = true;
    if (S.tipo !== "pl") return void fineBrano();
    if (S.idx === ultimoIdx) finale(); // le altre tracce: la playlist passa da sola alla successiva
  }
  function finale() {
    S.finale = true; S.inPausa = true;
    invia({ command: "pause" });
    mem.del(`pc-ripresa-${slug}`);
    seguire.hidden = true; fine.hidden = false;
    annuncio.textContent = "Fine del programma.";
    aggiornaStato();
  }
  function ricomincia() {
    S.finale = false; fine.hidden = true;
    S.soloTracce = false; // da capo si torna sempre alla playlist: suona di seguito senza salti
    if (S.fonte === "youtube") vaiAlBranoYT(0, 0);
    else if (modoPl()) { caricaPlaylist({ k: 0, t: 0 }); apri(); }
    else { const li = brani[0]; ascolta(li, 0, li.querySelector("[data-parte]")); }
    if (!lettura) brani[0].scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function caricaPlaylist(meta) {
    clearTimeout(S.timerPronto);
    Object.assign(S, { tipo: "pl", ultimoAgg: 0, t0: 0, pronto: false, inPausa: true, inCarica: true, pos: 0, dur: 0, ultimaPos: 0,
      finito: false, finale: false, anteprima: null, seekDopoAvvio: 0, idx: 0, uri: "", meta: meta || null, saltoDa: "" });
    const f = document.createElement("iframe");
    f.loading = "eager";
    f.src = `https://open.spotify.com/embed/playlist/${plSpotify}?utm_source=generator&theme=0`;
    f.title = "Lettore Spotify: la playlist del programma";
    f.height = String(ALTO_PL);
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    S.timerPronto = setTimeout(() => { if (!S.pronto) { errore.hidden = false; S.inCarica = false; aggiornaStato(); } }, 10000);
    dock.classList.remove("is-tutto");
    errore.hidden = true; fine.hidden = true;
    S.frame = f;
    slot.replaceChildren(f);
    segnaBrano(sequenza[0].li, sequenza[0].parte);
    chiudiScelta();
    if (S.meta && !S.meta.forza && S.meta.k > MAX_SALTI) S.meta.attesa = true; // si decide al primo aggiornamento
  }
  // Brano lontano: lo si indica e si apre l'elenco di Spotify, dove basta toccarlo
  function mostraScelta() {
    if (!S.meta) return;
    const x = sequenza[S.meta.k];
    for (const li of brani) li.classList.toggle("is-cercato", li === x.li && li !== S.li);
    scelta.querySelector("[data-prog-scegli-n]").textContent = String(S.meta.k + 1);
    scelta.querySelector("[data-prog-scegli-tit]").textContent = `${autoreDi(x.li)} — ${operaDi(x.li)}${x.parte ? ` · ${x.parte.textContent.trim()}` : ""}`;
    if (inBarra()) esciBarra();
    scelta.hidden = false;
    dock.classList.add("is-scelta");
    if (dock.classList.contains("is-mini")) riduci(false);
    pannelloApri(null);
    if (S.frame && S.tipo === "pl") S.frame.height = String(altoScelta());
    annuncio.textContent = `Tocca il numero ${S.meta.k + 1} nell'elenco di Spotify: ${scelta.querySelector("[data-prog-scegli-tit]").textContent}`;
    requestAnimationFrame(tieniDentro);
  }
  function chiudiScelta() {
    if (!scelta.hidden) for (const li of brani) li.classList.remove("is-cercato");
    scelta.hidden = true;
    dock.classList.remove("is-scelta");
    if (S.frame && S.tipo === "pl") S.frame.height = String(ALTO_PL);
    requestAnimationFrame(tieniDentro);
  }
  // Porta la playlist alla traccia k (dal secondo t)
  const vaiAlBrano = (k, t = 0) => {
    apri(); nascondiRiprendi();
    if (S.finale) { S.finale = false; fine.hidden = true; }
    track("programma-ascolta", { fonte: "spotify", brano: sequenza[k].li.id, da: t });
    if (!S.frame || S.tipo !== "pl") return void caricaPlaylist({ k, t });
    if (!S.pronto || S.anteprima === null) { S.meta = { k, t, attesa: k > MAX_SALTI }; return void chiudiScelta(); }
    if (k === S.idx) {
      S.meta = null; chiudiScelta();
      if (t && !S.anteprima) vaiA(t);
      else if (S.inPausa) invia({ command: "resume" });
      return;
    }
    if (k > S.idx && k - S.idx <= MAX_SALTI) {
      S.meta = { k, t }; S.saltoDa = ""; chiudiScelta();
      if (S.inPausa) invia({ command: "resume" }); // i salti partono dagli aggiornamenti di Spotify, a lettore in moto
      return;
    }
    if (k <= MAX_SALTI) return void caricaPlaylist({ k, t }); // all'indietro, vicino all'inizio: si ricarica e si avanza
    S.meta = { k, t };
    mostraScelta();
  };

  /* ── YouTube ───────────────────────────────────────────────────────── */
  // posizione nella playlist di YouTube del brano k (dall'elenco che YouTube riporta; di norma coincide)
  const posYT = (k) => { const i = S.ytLista ? S.ytLista.indexOf(ytIds[k]) : -1; return i >= 0 ? i : k; };
  function inviaYT(func, args = []) {
    if (S.tipo !== "yt" || !S.frame) return;
    try { S.frame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args, id: 1, channel: "widget" }), YT_ORIGINE); } catch {}
  }
  let ascoltoYT = 0;
  function caricaYT(k, t = 0) {
    clearTimeout(S.timerPronto); clearInterval(ascoltoYT);
    Object.assign(S, { tipo: "yt", ultimoAgg: 0, t0: 0, pronto: false, inPausa: true, inCarica: true, pos: t * 1000, dur: 0, ultimaPos: 0,
      finito: false, finale: false, anteprima: false, seekDopoAvvio: 0, idx: k, uri: "", meta: null, ytVerso: { k, t }, fermaYT: false, ytLista: null });
    const f = document.createElement("iframe");
    f.loading = "eager";
    // la sequenza intera come playlist (con i comandi attivi YouTube usa solo l'elenco del parametro),
    // fatta cominciare dal brano scelto: così parte da sola con l'avvio automatico di YouTube, senza un comando
    // successivo (che alcuni browser bloccano). I brani si riconoscono dal video, non dalla posizione.
    const giro = ytIds.slice(k).concat(ytIds.slice(0, k));
    f.src = `${YT_ORIGINE}/embed/${giro[0]}?enablejsapi=1&playlist=${giro.join(",")}&autoplay=1${t ? `&start=${Math.floor(t)}` : ""}&rel=0&controls=0&playsinline=1&iv_load_policy=3&hl=it&origin=${encodeURIComponent(location.origin)}`;
    f.title = "Lettore YouTube: il programma";
    f.height = String(ALTO_YT);
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.addEventListener("load", () => {
      let n = 0;
      clearInterval(ascoltoYT);
      ascoltoYT = setInterval(() => {
        if (S.pronto || S.frame !== f || ++n > 60) return clearInterval(ascoltoYT);
        try { f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGINE); } catch {}
      }, 250);
    });
    S.timerPronto = setTimeout(() => { if (!S.pronto) { errore.hidden = false; S.inCarica = false; aggiornaStato(); } }, 12000);
    dock.classList.remove("is-tutto");
    errore.hidden = true; fine.hidden = true;
    chiudiScelta();
    S.frame = f;
    slot.replaceChildren(f);
    segnaBrano(sequenza[k].li, sequenza[k].parte);
  }
  function cambiaBranoYT(i) {
    S.idx = i;
    Object.assign(S, { dur: 0, ultimaPos: 0, finito: false });
    segnaBrano(sequenza[i].li, sequenza[i].parte);
    if (S.fermaYT) { S.fermaYT = false; inviaYT("pauseVideo"); S.inPausa = true; aggiornaStato(); }
    salvaRipresa(true);
  }
  function statoYT(s) {
    // -1 non avviato, 0 finito, 1 in riproduzione, 2 in pausa, 3 caricamento, 5 pronto
    S.inCarica = s === 3;
    if (s === 1) { S.inPausa = false; S.finito = false; }
    else if (s === 2 || s === 5 || s === -1) S.inPausa = true;
    else if (s === 0 && !S.finito) {
      S.finito = true;
      if (S.idx === ultimoIdx) finale();
      else if (!S.continuo) S.fermaYT = true; // YouTube passa da solo al successivo: lo si ferma appena parte
    }
  }
  window.addEventListener("message", (e) => {
    if (e.origin !== YT_ORIGINE || S.tipo !== "yt" || !S.frame || e.source !== S.frame.contentWindow) return;
    let m = e.data;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch { return; } }
    if (!m || !m.event) return;
    if (m.event === "onReady") {
      S.pronto = true; clearTimeout(S.timerPronto); clearInterval(ascoltoYT); errore.hidden = true;
      inviaYT("playVideo"); // il primo video della playlist è già il brano scelto
      aggiornaStato();
      // Safari (e i browser che chiedono un tocco) bloccano l'avvio automatico: se dopo un paio di secondi
      // il brano è ancora fermo all'inizio, il ▶ pulsa e accanto compare «Tocca ▶ per ascoltare»
      const fr = S.frame;
      clearTimeout(S.timerTocca);
      S.timerTocca = setTimeout(() => { if (S.frame === fr && S.tipo === "yt" && S.inPausa && !S.inCarica && S.pos < 800) tocca(true); }, 2500);
      return;
    }
    if (m.event === "onStateChange") { statoYT(m.info); aggiornaStato(); return; }
    if (m.event !== "infoDelivery" && m.event !== "initialDelivery") return;
    const i = m.info || {};
    if (Array.isArray(i.playlist) && i.playlist.length) S.ytLista = i.playlist;
    // quale brano: dall'identificativo del video in riproduzione
    const vid = i.videoData && i.videoData.video_id;
    let qui = vid ? ytIds.indexOf(vid) : -1;
    if (qui < 0 && typeof i.playlistIndex === "number" && S.ytLista) qui = ytIds.indexOf(S.ytLista[i.playlistIndex]);
    if (qui >= 0 && qui !== S.idx && S.pronto && !(S.ytVerso && qui !== S.ytVerso.k)) cambiaBranoYT(qui);
    if (typeof i.duration === "number" && i.duration > 0) S.dur = i.duration * 1000;
    if (typeof i.currentTime === "number" && !S.trascinaAv) S.pos = i.currentTime * 1000;
    if (typeof i.playerState === "number") statoYT(i.playerState);
    // arrivati al brano chiesto: si va al minuto indicato
    if (S.ytVerso && S.idx === S.ytVerso.k && i.playerState === 1 && S.dur) {
      const t = S.ytVerso.t; S.ytVerso = null;
      if (t > 2 && Math.abs(S.pos / 1000 - t) > 2) vaiA(t);
    }
    if (S.pos > 0) S.ultimaPos = S.pos;
    aggiornaStato(); disegnaAv(); disegnaSegniSeServe(); salvaRipresa(); segnaSeguire();
  });
  let segniPer = -1;
  function disegnaSegniSeServe() { if (S.dur && segniPer !== S.idx) { segniPer = S.idx; disegnaSegni(); } }
  const vaiAlBranoYT = (k, t = 0) => {
    apri(); nascondiRiprendi();
    if (S.finale) { S.finale = false; fine.hidden = true; }
    track("programma-ascolta", { fonte: "youtube", brano: sequenza[k].li.id, da: t });
    if (S.tipo !== "yt" || !S.frame || !S.pronto) return void caricaYT(k, t);
    if (k === S.idx) { if (t) vaiA(t); else if (S.inPausa) { inviaYT("playVideo"); } return; }
    S.ytVerso = { k, t };
    segniPer = -1;
    inviaYT("playVideoAt", [posYT(k)]);
  };

  /* ── Caricamento di un brano ───────────────────────────────────────── */
  const ascolta = (li, t = 0, parte = null) => {
    if (!li) return;
    if (S.fonte === "youtube") return void vaiAlBranoYT(indiceDi(li, parte), t);
    // stesso brano già pronto e rimando a un minuto: si salta senza ricaricare
    if (li === S.li && (parte === S.parte || !parte) && S.fonte === "spotify" && S.pronto && t && !S.anteprima && !(S.tipo === "pl" && S.meta)) {
      vaiA(t); apri(); return;
    }
    if (modoPl()) return void vaiAlBrano(indiceDi(li, parte), t);
    const ids = parte ? parte.dataset : li.dataset;
    const src = S.fonte === "apple" ? ids.apple : ids.spotify;
    if (!src) return;

    if (S.li) S.li.classList.remove("is-on", "is-suona");
    for (const p of $$("[data-parte].is-on")) p.classList.remove("is-on");
    Object.assign(S, { ultimoAgg: 0, li, parte, t0: t, pronto: false, inPausa: true, inCarica: true, pos: t * 1000, dur: 0, ultimaPos: 0, finito: false, anteprima: null, seekDopoAvvio: 0,
      tipo: S.fonte === "apple" ? "apple" : "track", idx: indiceDi(li, parte), uri: "", meta: null, finale: false });
    chiudiScelta();
    li.classList.add("is-on");
    li.classList.remove("is-cercato");
    if (parte) for (const p of $$(`[data-parte][data-spotify="${parte.dataset.spotify}"]`)) p.classList.add("is-on");
    for (const a of indice) a.classList.toggle("is-on", a.getAttribute("href") === `#${li.id}`);

    ora.textContent = `${autoreDi(li)} — ${operaDi(li)}${parte ? ` · ${parte.textContent.trim()}` : ""}`;
    annuncio.textContent = `In ascolto: ${ora.textContent}`;
    fine.hidden = true; seguire.hidden = true;
    ora.title = ora.textContent;
    nDock.textContent = `${li.dataset.n} di ${brani.length}`;
    const i = brani.indexOf(li);
    $("[data-prog-prec]").disabled = i === 0 && !(parte && parte.parentElement.previousElementSibling);
    $("[data-prog-succ]").disabled = i === brani.length - 1 && !(parte && parte.parentElement.nextElementSibling);

    const f = document.createElement("iframe");
    f.loading = "eager";
    clearTimeout(S.timerPronto);
    const tutto = S.fonte === "apple" && S.appleTutto && plApple;
    dock.classList.toggle("is-tutto", !!tutto);
    if (tutto) ora.textContent = "Il programma intero, su Apple Music";
    if (S.fonte === "apple") {
      f.src = tutto ? plApple : src;
      f.title = "Lettore Apple Music";
      f.height = tutto ? "450" : "175";
      f.allow = "autoplay *; encrypted-media *";
      f.setAttribute("sandbox", "allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation");
      S.inCarica = false;
    } else {
      f.src = `https://open.spotify.com/embed/track/${src}?utm_source=generator&theme=0${t ? `&t=${t}` : ""}`;
      f.title = "Lettore Spotify";
      f.height = "80";
      f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      S.timerPronto = setTimeout(() => { if (!S.pronto) { errore.hidden = false; S.inCarica = false; aggiornaStato(); } }, 10000);
    }
    errore.hidden = true;
    S.frame = f;
    slot.replaceChildren(f);
    avSegni.replaceChildren();
    disegnaAv(); aggiornaStato(); apri();
    if (!pannello.hidden) riempiPannello();
    nascondiRiprendi();
    salvaRipresa(true);
    track("programma-ascolta", { fonte: S.fonte, brano: li.id, da: t });
  };

  /* ── Successivo, precedente, fine del brano ────────────────────────── */
  const prossimo = () => {
    if (!S.li) return null;
    if (S.parte) {
      const v = S.parte.parentElement.nextElementSibling;
      if (v) return { li: S.li, parte: v.querySelector("[data-parte]") };
    }
    const li = brani[brani.indexOf(S.li) + 1];
    return li ? { li, parte: li.querySelector("[data-parte]") } : null;
  };
  function segnaSeguire() {
    const resta = S.dur - S.pos;
    const nx = S.continuo && (S.fonte === "spotify" || S.tipo === "yt") && S.pronto && !S.inPausa && S.dur && resta < 12000 && resta > 0 ? prossimo() : null;
    if (!nx) { seguire.hidden = true; return; }
    seguire.querySelector("strong").textContent = `${autoreDi(nx.li)} — ${nx.parte && nx.li === S.li ? nx.parte.textContent.trim() : operaDi(nx.li)}`;
    seguire.hidden = false;
  }
  const passo = (dir) => {
    if (!S.li) { const li = brani[0]; return void ascolta(li, 0, li.querySelector("[data-parte]")); }
    // indietro dopo i primi 4 secondi: si torna all'inizio del brano, come nei lettori di musica
    if (dir < 0 && S.pos > 4000 && vaiA(0)) return;
    if (S.tipo === "yt") {
      const k = (S.ytVerso ? S.ytVerso.k : S.idx) + dir;
      if (k >= 0 && k <= ultimoIdx) vaiAlBranoYT(k, 0);
      return;
    }
    if (modoPl() && S.tipo === "pl") {
      const base = S.meta ? S.meta.k : S.idx; // più pressioni di fila: si conta dal brano già chiesto
      const k = base + dir;
      if (k >= 0 && k <= ultimoIdx) vaiAlBrano(k, 0);
      return;
    }
    if (S.parte) {
      const vicino = dir > 0 ? S.parte.parentElement.nextElementSibling : S.parte.parentElement.previousElementSibling;
      if (vicino) return void ascolta(S.li, 0, vicino.querySelector("[data-parte]"));
    }
    const i = brani.indexOf(S.li) + dir;
    if (i < 0 || i >= brani.length) return;
    const li = brani[i];
    const parti = li.querySelectorAll("[data-parte]");
    ascolta(li, 0, parti.length ? parti[dir > 0 ? 0 : parti.length - 1] : null);
    if (!lettura) li.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const fineBrano = () => {
    S.inPausa = true; aggiornaStato();
    const ultimo = brani.indexOf(S.li) === brani.length - 1 && !(S.parte && S.parte.parentElement.nextElementSibling);
    if (ultimo) { mem.del(`pc-ripresa-${slug}`); seguire.hidden = true; fine.hidden = false; annuncio.textContent = "Fine del programma."; return; }
    if (S.continuo) setTimeout(() => passo(1), 700);
  };

  /* ── Apertura, riduzione, chiusura ─────────────────────────────────── */
  function apri() {
    if (!dock.hidden) return;
    dock.hidden = false;
    posizionaSalvata();
    requestAnimationFrame(() => requestAnimationFrame(() => dock.classList.add("is-open")));
    box.classList.add("has-dock");
    document.documentElement.classList.add("pc-ascolto");
    // il lettore si apre con il programma in vista (la scheda del brano è nella linguetta accanto)
    suggVisto = true;
    setTimeout(() => { if (!dock.hidden && S.li && pannello.hidden && !inBarra() && accesso.hidden && scelta.hidden) pannelloApri("elenco"); }, 450);
  }
  function riduci(si) {
    if (si) pannelloApri(null);
    dock.classList.toggle("is-mini", si);
    btnRiduci.setAttribute("aria-expanded", String(!si));
    btnRiduci.setAttribute("aria-label", si ? "Ingrandisci il lettore" : "Riduci il lettore");
    requestAnimationFrame(tieniDentro);
  }
  const chiudi = () => {
    barra(false);
    pannelloApri(null);
    invia({ command: "pause" }); inviaYT("pauseVideo"); clearInterval(ascoltoYT);
    dock.classList.remove("is-open");
    box.classList.remove("has-dock");
    document.documentElement.classList.remove("pc-ascolto");
    if (S.li) S.li.classList.remove("is-on", "is-suona");
    for (const p of $$("[data-parte].is-on")) p.classList.remove("is-on");
    for (const a of indice) a.classList.remove("is-on");
    clearTimeout(S.timerPronto);
    chiudiScelta();
    Object.assign(S, { li: null, parte: null, frame: null, pronto: false, inPausa: true, anteprima: null, tipo: "", idx: -1, uri: "", meta: null, finale: false });
    chiudiLettura();
    aggiornaStato();
    setTimeout(() => { if (!S.li) { dock.hidden = true; slot.replaceChildren(); } }, 380);
  };

  /* ── «Come si ascolta»: la spiegazione delle tre fonti, a richiesta ── */
  const comeBtn = $("[data-prog-come]");
  const comeTesto = $("[data-prog-come-testo]");
  function comeSiAscolta(si) {
    if (!comeBtn) return;
    comeBtn.setAttribute("aria-expanded", String(si));
    if (si) { comeTesto.hidden = false; requestAnimationFrame(() => comeTesto.classList.add("is-open")); track("programma-come-si-ascolta"); }
    else { comeTesto.classList.remove("is-open"); setTimeout(() => { if (!comeTesto.classList.contains("is-open")) comeTesto.hidden = true; }, 250); }
  }
  // si chiude toccando altrove nel lettore o con Esc
  dock.addEventListener("click", (e) => { if (comeTesto && !comeTesto.hidden && !e.composedPath().some((x) => x === comeTesto || x === comeBtn)) comeSiAscolta(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && comeTesto && !comeTesto.hidden) comeSiAscolta(false); }, true);

  /* ── Invito a leggere la scheda, e segnale sul pulsante a ogni brano nuovo ── */
  const sugg = $("[data-prog-sugg]");
  const btnScheda = $("[data-prog-info]");
  let suggTimer = 0, suggVisto = false;
  function nascondiSugg(definitivo) {
    clearTimeout(suggTimer); suggTimer = 0;
    if (!sugg.hidden) { sugg.classList.remove("is-open"); setTimeout(() => { if (!sugg.classList.contains("is-open")) sugg.hidden = true; }, 300); }
    if (definitivo) { suggVisto = true; mem.set("pc-invito-scheda", 9); }
  }
  function proponiScheda() {
    if (suggVisto || suggTimer || (mem.get("pc-invito-scheda") || 0) >= 2) return; // una sola attesa per volta
    suggTimer = setTimeout(() => {
      suggTimer = 0;
      if (!S.li || S.inPausa || !pannello.hidden || inBarra() || dock.classList.contains("is-mini") || !accesso.hidden || !scelta.hidden) return; // riprova al prossimo «suona»
      suggVisto = true;
      mem.set("pc-invito-scheda", (mem.get("pc-invito-scheda") || 0) + 1);
      sugg.querySelector("[data-prog-sugg-tit]").textContent = `${autoreDi(S.li)}, ${operaDi(S.li)}`;
      sugg.hidden = false;
      // la punta del fumetto indica il pulsante «Scheda»
      const rb = btnScheda.getBoundingClientRect(), rs = sugg.getBoundingClientRect();
      sugg.style.setProperty("--punta", `${Math.max(16, Math.min(rs.width - 30, rs.right - (rb.left + rb.width / 2) - 7))}px`);
      requestAnimationFrame(() => requestAnimationFrame(() => sugg.classList.add("is-open")));
      setTimeout(() => { if (sugg.classList.contains("is-open")) nascondiSugg(false); }, 16000);
    }, 5000);
  }
  let ultimoSegnato = null, guidaNuova = false;
  // puntino corallo sulla linguetta «Guida» e sul pulsante del lettore: a ogni brano nuovo pulsa di nuovo, resta finché non si apre la guida
  function segnaGuida() {
    for (const el of [pannello.querySelector('[data-prog-tab="info"]'), btnScheda]) {
      if (!el) continue;
      el.classList.remove("has-puntino");
      if (guidaNuova) { void el.offsetWidth; el.classList.add("has-puntino"); }
    }
  }
  const segnaNuovoBrano = () => {
    if (!S.li || S.li === ultimoSegnato) return;
    ultimoSegnato = S.li;
    guidaNuova = pannelloTipo !== "info";
    segnaGuida();
    btnScheda.classList.remove("is-nuovo"); void btnScheda.offsetWidth; btnScheda.classList.add("is-nuovo");
  };

  /* ── Barra d'ascolto: un clic fuori dal lettore lo riduce a una barra sotto la testata ── */
  const barraSito = document.querySelector(".bar"); // barra di vetro che compare scorrendo (computer)
  const testata = document.querySelector(".mast");
  const cimaBarra = () => {
    let y = 0;
    if (barraSito && barraSito.classList.contains("is-on")) y = barraSito.getBoundingClientRect().bottom;
    else if (testata && getComputedStyle(testata).position === "sticky") { const r = testata.getBoundingClientRect(); if (r.top <= 1) y = r.bottom; }
    return Math.max(0, Math.round(y));
  };
  let rafCima = 0;
  const aggiornaCima = () => { cancelAnimationFrame(rafCima); rafCima = requestAnimationFrame(() => { dock.style.setProperty("--pc-cima", `${cimaBarra()}px`); applicaRiquadro(); }); };
  if (barraSito) barraSito.addEventListener("transitionend", () => { if (dock.classList.contains("is-barra")) aggiornaCima(); if (typeof posizionaPannello === "function") posizionaPannello(); });
  const inBarra = () => dock.classList.contains("is-barra");
  function barra(si) {
    if (si === inBarra()) return;
    if (si && pannelloTipo) pannelloApri(null);
    if (si) { nascondiSugg(false); comeSiAscolta(false); setTimeout(aggiornaCima, 120); setTimeout(aggiornaCima, 500); } // dopo la chiusura del foglio la testata torna al suo posto
    if (si) { pannelloApri(null); aggiornaCima(); addEventListener("scroll", aggiornaCima, { passive: true }); addEventListener("resize", aggiornaCima); }
    else { removeEventListener("scroll", aggiornaCima); removeEventListener("resize", aggiornaCima); }
    dock.classList.toggle("is-barra", si);
    document.documentElement.classList.toggle("pc-barra", si);
    aggiornaBanda();
    btnRiduci.setAttribute("aria-label", si ? "Apri il lettore" : dock.classList.contains("is-mini") ? "Ingrandisci il lettore" : "Riduci il lettore");
    btnRiduci.setAttribute("aria-expanded", String(!si && !dock.classList.contains("is-mini")));
    requestAnimationFrame(si ? applicaRiquadro : tieniDentro);
    if (!si) applicaRiquadro(); // fuori dalla barra il riquadro torna nel lettore
  }
  const esciBarra = () => { barra(false); riduci(false); };

  // Il riquadro del video (YouTube, Apple Music) sotto la barra: si sposta dove si vuole, afferrandolo dal bordo
  let posRq = mem.get("pc-riquadro-pos"); // {fx, fy}: frazioni dello spazio libero; null = in alto a destra
  // sul telefono, con YouTube o Apple Music, la barra diventa una fascia in cima allo schermo con il video dentro
  function aggiornaBanda() {
    document.documentElement.classList.toggle("pc-banda", dock.classList.contains("is-barra") && matchMedia("(max-width: 720px)").matches && (S.fonte === "youtube" || S.fonte === "apple"));
  }
  const conRiquadro = () => inBarra() && (S.fonte === "youtube" || S.fonte === "apple") && !document.documentElement.classList.contains("pc-banda");
  const tickerSu = () => { const t = document.querySelector(".ticker"); return t ? t.getBoundingClientRect().height : 0; };
  // la barra scende al suo posto con un'animazione: si usa la posizione finale (--pc-cima), non quella del momento
  const cimaDock = () => { const c = parseFloat(dock.style.getPropertyValue("--pc-cima")); return inBarra() && !isNaN(c) ? c : dock.getBoundingClientRect().top; };
  const spazioRq = (r) => {
    const minY = cimaDock() + dock.offsetHeight + 8;
    return { minY, maxY: Math.max(minY, innerHeight - tickerSu() - r.height - 8), maxX: Math.max(8, innerWidth - r.width - 8) };
  };
  function applicaRiquadro() {
    const qui = posRq || (conRiquadro() && matchMedia("(max-width: 720px)").matches ? { fx: 1, fy: 1 } : null);
    if (!conRiquadro() || !qui) { slot.style.left = slot.style.top = slot.style.right = ""; return; }
    const r = slot.getBoundingClientRect(), z = spazioRq(r);
    const x = 8 + qui.fx * (z.maxX - 8), y = z.minY + qui.fy * (z.maxY - z.minY);
    Object.assign(slot.style, { left: `${Math.round(x)}px`, right: "auto", top: `${Math.round(y - cimaDock())}px` });
  }
  slot.addEventListener("pointerdown", (e) => {
    if (!conRiquadro() || e.button !== 0 || e.target !== slot) return; // solo il bordo: dentro c'è il lettore
    e.preventDefault();
    slot.setPointerCapture(e.pointerId);
    const r0 = slot.getBoundingClientRect();
    const dx = e.clientX - r0.left, dy = e.clientY - r0.top;
    document.documentElement.classList.add("pc-trascina");
    slot.classList.add("is-trascinato");
    const muovi = (ev) => {
      const r = slot.getBoundingClientRect(), z = spazioRq(r);
      const x = Math.min(Math.max(8, ev.clientX - dx), z.maxX);
      const y = Math.min(Math.max(z.minY, ev.clientY - dy), z.maxY);
      posRq = { fx: (x - 8) / Math.max(1, z.maxX - 8), fy: (y - z.minY) / Math.max(1, z.maxY - z.minY) };
      applicaRiquadro();
    };
    const fine = () => {
      slot.removeEventListener("pointermove", muovi);
      slot.removeEventListener("pointerup", fine);
      slot.removeEventListener("pointercancel", fine);
      document.documentElement.classList.remove("pc-trascina");
      slot.classList.remove("is-trascinato");
      if (!posRq) return;
      for (const k of ["fx", "fy"]) { if (posRq[k] < 0.05) posRq[k] = 0; if (posRq[k] > 0.95) posRq[k] = 1; } // aggancio ai bordi
      applicaRiquadro();
      mem.set("pc-riquadro-pos", posRq);
    };
    slot.addEventListener("pointermove", muovi);
    slot.addEventListener("pointerup", fine);
    slot.addEventListener("pointercancel", fine);
  });
  slot.addEventListener("dblclick", (e) => { if (conRiquadro() && e.target === slot) { posRq = null; mem.del("pc-riquadro-pos"); applicaRiquadro(); } });
  addEventListener("resize", () => { aggiornaBanda(); applicaRiquadro(); });
  // la misura del riquadro arriva un istante dopo il passaggio alla barra: si riposiziona quando cambia
  if ("ResizeObserver" in window) new ResizeObserver(() => { if (conRiquadro()) applicaRiquadro(); }).observe(slot);
  // gli elementi che comandano il lettore non lo riducono
  const COMANDA = "[data-prog-play], [data-vai], [data-min], [data-parte], [data-prog-inizia], [data-prog-fonte], [data-prog-riprendi], [data-prog-ricomincia], .prog-av-segno";
  const fuoriDalLettore = (e) => {
    if (dock.hidden || !dock.classList.contains("is-open") || inBarra()) return;
    // il percorso del clic si guarda com'era al momento del clic: un pulsante del pannello che si è appena
    // ridisegnato (linguette Scheda/Programma) non è più nella pagina, ma il clic era dentro il lettore
    const percorso = e.composedPath ? e.composedPath() : [];
    if (percorso.includes(dock) || percorso.includes(pannello) || (e.target && e.target.isConnected === false)) return;
    if (e.target && e.target.closest && (dock.contains(e.target) || e.target.closest(COMANDA))) return;
    if (!accesso.hidden || !scelta.hidden) return; // c'è qualcosa da fare nel lettore
    barra(true);
  };
  document.addEventListener("click", fuoriDalLettore);

  /* ── Pannello: scheda del brano o elenco del programma ─────────────── */
  let pannelloTipo = null;
  function posizionaPannello() {
    if (pannello.hidden) return;
    const r = dock.getBoundingClientRect();
    const sotto = r.top < innerHeight * 0.42;
    dock.classList.toggle("info-sotto", sotto);
    // sopra il lettore non si va sotto la barra del sito (testata fissa o barra di vetro)
    const spazio = sotto ? innerHeight - r.bottom - 16 : r.top - 16 - cimaBarra();
    pannello.style.maxHeight = `${Math.max(200, Math.min(spazio, 660))}px`;
  }
  // Testata del pannello: si passa dalla scheda al programma senza chiudere, e si chiude con ×
  const testaPannello = () => {
    const t = document.createElement("div");
    t.className = "prog-pann-testa";
    t.innerHTML = `<div class="prog-pann-tab" role="tablist" aria-label="Pannello del lettore">
      <button type="button" role="tab" data-prog-tab="elenco" aria-selected="${pannelloTipo === "elenco"}"><span class="lungo">Il </span>programma</button>
      <button type="button" role="tab" data-prog-tab="info" aria-selected="${pannelloTipo === "info"}"${guidaNuova && pannelloTipo !== "info" ? ' class="has-puntino"' : ""}>Guida<span class="lungo"> all'ascolto</span></button></div>
      <button type="button" class="prog-pann-chiudi" data-prog-pann-chiudi aria-label="Chiudi il pannello">×</button>`;
    return t;
  };
  function riempiPannello() {
    if (pannelloTipo === "elenco") {
      const h = document.createElement("p");
      h.className = "prog-elenco-testa";
      h.textContent = "Il programma";
      const ol = document.createElement("ol");
      ol.className = "prog-elenco";
      for (const li of brani) {
        const r = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button"; b.dataset.vai = li.dataset.n;
        if (li === S.li) { r.className = "is-on"; b.setAttribute("aria-current", "true"); }
        if (li === S.li && !S.inPausa) r.classList.add("is-suona");
        b.innerHTML = `<span class="n">${li.dataset.n}</span><span class="a">${li.querySelector(".prog-anno").textContent}</span><span class="t"><small>${autoreDi(li)}</small>${li.querySelector(".prog-opera").innerHTML}</span><span class="d">${li.dataset.durata}</span><span class="pl" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14"><path class="pl-play" d="M8 5v14l11-7z"/><path class="pl-pausa" d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg></span>`;
        const suona = li === S.li && !S.inPausa;
        b.setAttribute("aria-label", `${suona ? "Pausa" : "Ascolta"}: ${li.dataset.n}, ${autoreDi(li)}, ${li.querySelector(".prog-opera").textContent}`);
        r.append(b); ol.append(r);
      }
      const coda = document.createElement("p");
      coda.className = "prog-elenco-coda";
      coda.innerHTML = (plSpotify ? `<a href="https://open.spotify.com/playlist/${plSpotify}" target="_blank" rel="noopener">Salva la playlist su Spotify ↗</a>` : "") +
        (dock.dataset.plApple ? `<a href="${dock.dataset.plApple}" target="_blank" rel="noopener">Salva la playlist su Apple Music ↗</a>` : "");
      h.hidden = true; // il titolo è nella linguetta
      pannello.replaceChildren(testaPannello(), ol, ...(coda.innerHTML ? [coda] : []));
      const qui = ol.querySelector("li.is-on");
      if (qui) requestAnimationFrame(() => qui.scrollIntoView({ block: "nearest" }));
    } else {
      if (!S.li) return;
      const c = S.li.querySelector(".prog-scheda").cloneNode(true);
      for (const x of c.querySelectorAll(".prog-play, .prog-link")) x.remove();
      for (const x of c.querySelectorAll("[id]")) x.removeAttribute("id");
      const det = c.querySelector("details"); if (det) det.open = true;
      c.className = "prog-info-corpo";
      const cond = document.createElement("button");
      cond.type = "button"; cond.className = "prog-condividi"; cond.dataset.progCondividi = "";
      cond.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Condividi questo brano</span>';
      c.append(cond);
      pannello.replaceChildren(testaPannello(), c);
    }
    pannello.scrollTop = 0;
  }
  const telefono = () => matchMedia("(max-width: 720px)").matches;
  const postoPannello = document.createComment("pannello");
  pannello.before(postoPannello);
  function foglio(si) {
    if (si && pannello.parentNode !== document.body) { document.body.append(pannello); pannello.classList.add("is-foglio"); }
    if (!si && pannello.parentNode === document.body) { postoPannello.after(pannello); pannello.classList.remove("is-foglio"); }
    document.documentElement.classList.toggle("pc-foglio", si);
  }
  // fuori dal lettore, i clic del foglio passano comunque ai comandi del lettore
  pannello.addEventListener("click", (e) => { if (!dock.contains(pannello)) comandi(e); });
  function pannelloApri(tipo) {
    if (tipo === "info") { guidaNuova = false; segnaGuida(); }
    if (tipo) nascondiSugg(tipo === "info");
    pannelloTipo = tipo;
    foglio(!!tipo && telefono());
    pannello.hidden = !tipo;
    btnInfo.setAttribute("aria-expanded", String(tipo === "info"));
    btnElenco.setAttribute("aria-expanded", String(tipo === "elenco"));
    dock.classList.toggle("has-info", !!tipo);
    if (tipo) {
      if (inBarra()) barra(false);
      if (dock.classList.contains("is-mini")) riduci(false);
      riempiPannello(); posizionaPannello();
    }
  }
  // Foglio o lastra si decide all'apertura; ridimensionando si cambia solo con un margine (720 / 760 px),
  // così la barra di scorrimento che sparisce col foglio non lo fa scattare avanti e indietro
  addEventListener("resize", () => {
    if (!pannello.hidden) {
      const ora = pannello.classList.contains("is-foglio");
      if (ora && innerWidth > 760) foglio(false);
      else if (!ora && innerWidth <= 720) foglio(true);
    }
    posizionaPannello();
  });

  /* ── Trascinamento del lettore (dalla testata), con aggancio ai bordi ── */
  let pos = null; // {fx, fy}: frazioni dello spazio libero, così la posizione vale su ogni schermo; null = predefinita
  function applica() {
    if (!pos) { Object.assign(dock.style, { left: "", top: "", bottom: "", right: "" }); dock.classList.remove("is-libero"); return; }
    const r = dock.getBoundingClientRect();
    const x = 10 + pos.fx * Math.max(0, innerWidth - r.width - 20);
    const y = 10 + pos.fy * Math.max(0, innerHeight - r.height - 20);
    dock.classList.add("is-libero");
    Object.assign(dock.style, { left: `${x}px`, top: `${y}px`, bottom: "auto", right: "auto" });
  }
  function tieniDentro() { if (pos) applica(); posizionaPannello(); }
  function posizionaSalvata() { pos = mem.get("pc-dock-pos2"); applica(); }
  presa.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button") || e.button !== 0) return;
    if (inBarra()) return; // nella barra niente trascinamento: il tocco (click) riapre il lettore
    e.preventDefault(); // niente selezione di testo
    const r0 = dock.getBoundingClientRect();
    const dx = e.clientX - r0.left, dy = e.clientY - r0.top;
    let mosso = false;
    presa.setPointerCapture(e.pointerId);
    document.documentElement.classList.add("pc-trascina");
    const muovi = (ev) => {
      if (!mosso && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
      mosso = true;
      dock.classList.add("is-trascinato");
      const r = dock.getBoundingClientRect();
      const x = Math.min(Math.max(10, ev.clientX - dx), innerWidth - r.width - 10);
      const y = Math.min(Math.max(10, ev.clientY - dy), innerHeight - r.height - 10);
      pos = { fx: (x - 10) / Math.max(1, innerWidth - r.width - 20), fy: (y - 10) / Math.max(1, innerHeight - r.height - 20) };
      applica(); posizionaPannello();
    };
    const fine = () => {
      presa.removeEventListener("pointermove", muovi);
      presa.removeEventListener("pointerup", fine);
      presa.removeEventListener("pointercancel", fine);
      document.documentElement.classList.remove("pc-trascina");
      dock.classList.remove("is-trascinato");
      if (window.getSelection) getSelection().removeAllRanges();
      if (!mosso) return;
      for (const k of ["fx", "fy"]) { if (pos[k] < 0.06) pos[k] = 0; if (pos[k] > 0.94) pos[k] = 1; } // aggancio ai bordi
      applica(); posizionaPannello();
      mem.set("pc-dock-pos2", pos);
    };
    presa.addEventListener("pointermove", muovi);
    presa.addEventListener("pointerup", fine);
    presa.addEventListener("pointercancel", fine);
  });
  presa.addEventListener("click", (e) => { if (inBarra() && !e.target.closest("button")) esciBarra(); });
  presa.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    pos = null; mem.del("pc-dock-pos2"); applica(); posizionaPannello();
  });
  addEventListener("resize", tieniDentro);

  /* ── Barra di avanzamento: clic, trascinamento, tastiera ───────────── */
  const rapporto = (x) => { const r = av.getBoundingClientRect(); return Math.min(1, Math.max(0, (x - r.left) / r.width)); };
  av.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".prog-av-segno")) return;
    if ((S.fonte !== "spotify" && S.tipo !== "yt") || !S.pronto || !S.dur) return;
    e.preventDefault();
    av.setPointerCapture(e.pointerId);
    S.trascinaAv = true;
    dock.classList.add("is-scorre");
    const muovi = (ev) => { S.pos = rapporto(ev.clientX) * S.dur; disegnaAv(); };
    const fine = (ev) => {
      av.removeEventListener("pointermove", muovi);
      av.removeEventListener("pointerup", fine);
      av.removeEventListener("pointercancel", fine);
      S.trascinaAv = false;
      dock.classList.remove("is-scorre");
      vaiA(rapporto(ev.clientX) * S.dur / 1000);
    };
    muovi(e);
    av.addEventListener("pointermove", muovi);
    av.addEventListener("pointerup", fine);
    av.addEventListener("pointercancel", fine);
  });
  av.addEventListener("keydown", (e) => {
    const p = S.pos / 1000;
    const salti = { ArrowLeft: -5, ArrowRight: 5, PageDown: -30, PageUp: 30 };
    if (e.key in salti) { e.preventDefault(); vaiA(p + salti[e.key]); }
    else if (e.key === "Home") { e.preventDefault(); vaiA(0); }
    else if (e.key === "End") { e.preventDefault(); vaiA(S.dur / 1000 - 2); }
  });

  /* ── Finestra di lettura: le altre pagine del sito sopra il programma ── */
  const urlProgramma = location.href.split("#")[0];
  const stessoSito = (a) => a && a.href && a.origin === location.origin && (!a.target || a.target === "_self") && !a.hasAttribute("download") &&
    !/\.(xml|pdf|json|jpe?g|png|webp|svg|mp3|mp4|txt)$/i.test(a.pathname);
  const apriLettura = (url) => {
    if (!lettura) {
      lettura = document.createElement("iframe");
      lettura.className = "prog-lettura";
      lettura.title = "Pagina del sito";
      lettura.addEventListener("load", () => {
        let w;
        try { w = lettura.contentWindow; if (!/^https?:/.test(w.location.href)) return; } catch { return; }
        // tornati alla pagina del programma dentro la finestra: si chiude e si resta qui
        if (w.location.pathname === new URL(urlProgramma).pathname) { chiudiLettura(true); return; }
        history.replaceState({ pcLettura: true }, "", w.location.href);
        document.title = w.document.title;
        // link esterni dentro la finestra: nuova scheda; scorciatoie del lettore anche da lì
        w.document.addEventListener("click", (e) => {
          const a = e.target.closest && e.target.closest("a[href]");
          if (a && a.origin !== location.origin && a.target !== "_blank") { e.preventDefault(); window.open(a.href, "_blank", "noopener"); }
        });
        w.document.addEventListener("keydown", scorciatoie);
        // un clic nella pagina che si sta leggendo riduce il lettore alla barra
        w.document.addEventListener("click", () => { if (!dock.hidden && dock.classList.contains("is-open") && accesso.hidden && scelta.hidden) barra(true); });
        w.document.documentElement.classList.add("pc-ascolto");
      });
      document.body.append(lettura);
      document.documentElement.classList.add("pc-in-lettura");
      history.pushState({ pcLettura: true }, "", url);
      btnProgramma.hidden = false;
      riduci(true);
    }
    lettura.src = url;
  };
  function chiudiLettura(daDentro = false) {
    if (!lettura) return;
    lettura.remove();
    lettura = null;
    document.documentElement.classList.remove("pc-in-lettura");
    btnProgramma.hidden = true;
    if (history.state && history.state.pcLettura) {
      if (daDentro) history.replaceState(null, "", urlProgramma); else history.back();
    }
    aggiornaStato();
  }
  addEventListener("popstate", () => {
    if (lettura && !(history.state && history.state.pcLettura)) {
      lettura.remove(); lettura = null;
      document.documentElement.classList.remove("pc-in-lettura");
      btnProgramma.hidden = true;
      aggiornaStato();
    }
  });
  // Mentre il lettore è aperto, i link interni aprono la finestra di lettura
  document.addEventListener("click", (e) => {
    if (dock.hidden || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!stessoSito(a) || dock.contains(a)) return;
    const u = new URL(a.href);
    if (u.pathname === location.pathname && u.hash) return; // ancore nella stessa pagina
    e.preventDefault();
    apriLettura(a.href);
  });

  /* ── Accesso a Spotify in una piccola finestra sopra la pagina ─────── */
  let finestra = null, sorveglia = 0;
  const URL_ACCESSO = "https://accounts.spotify.com/it/login?continue=" + encodeURIComponent("https://open.spotify.com/");
  const apriFinestra = () => {
    const w = 480, h = 720;
    const x = Math.round((window.screenX || 0) + Math.max(0, (window.outerWidth - w) / 2));
    const y = Math.round((window.screenY || 0) + Math.max(0, (window.outerHeight - h) / 2));
    finestra = window.open(URL_ACCESSO, "pc-spotify-accesso", `popup=yes,width=${w},height=${h},left=${x},top=${y}`);
    if (!finestra) { window.open(URL_ACCESSO, "_blank"); attesaAccesso = true; return false; } // finestre bloccate: nuova scheda
    try { finestra.focus(); } catch {}
    clearInterval(sorveglia);
    sorveglia = setInterval(() => { if (finestra && finestra.closed) accessoFatto(); }, 600);
    return true;
  };
  const chiudiAccesso = () => { accesso.hidden = true; accesso.classList.remove("is-verifica", "is-attesa"); clearInterval(sorveglia); };
  // Accesso fatto ma il lettore resta in anteprima: si spiega perché e si offrono le strade per l'ascolto completo
  function mostraAlternative() {
    accessoTxt.textContent = SAFARI
      ? "Safari non permette al lettore di Spotify inserito nel sito di usare il tuo accesso: qui senti solo anteprime. Per l'ascolto completo passa ad Apple Music, che su Safari funziona, oppure apri il brano nell'app Spotify."
      : "Il lettore mostra ancora l'anteprima. Se hai completato l'accesso, il browser potrebbe bloccare i cookie di Spotify nei siti: passa ad Apple Music oppure apri il brano nell'app Spotify.";
    const ids = S.parte ? S.parte.dataset : S.li ? S.li.dataset : {};
    $("[data-prog-apri-spotify]").href = linkSpotify(ids.spotify);
    accesso.querySelector(".prog-accesso-tit").textContent = "Per l'ascolto completo";
    accessoCom.hidden = true; accessoAlt.hidden = false;
    if (inBarra()) esciBarra();
    accesso.classList.add("is-verifica"); accesso.hidden = false;
    if (dock.classList.contains("is-mini")) riduci(false);
  }
  function accessoFatto() {
    clearInterval(sorveglia);
    try { if (finestra && !finestra.closed) finestra.close(); } catch {}
    finestra = null;
    chiudiAccesso();
    S.dopoAccesso = true;
    ricarica();
    track("programma-accesso-fatto");
  }
  const avviaAccesso = () => {
    if (inBarra()) barra(false);
    if (dock.classList.contains("is-mini")) riduci(false);
    accessoTxt.textContent = "Nella finestra di Spotify entra con il tuo account (se sei già collegato vedrai Spotify aperto). Poi premi «Ho fatto l'accesso»: chiudo io la finestra e aggiorno il lettore.";
    accesso.classList.remove("is-verifica", "is-attesa");
    accessoCom.hidden = false; accessoAlt.hidden = true;
    accesso.querySelector(".prog-accesso-tit").textContent = "Accedi a Spotify";
    accesso.hidden = false;
    apriFinestra();
  };

  /* ── Ricarica (per leggere l'accesso appena fatto) ─────────────────── */
  let attesaAccesso = false;
  const ricarica = () => {
    if (!S.li) return;
    S.soloTracce = false; // dopo un accesso si riprova con la playlist
    // la playlist si ricarica dall'inizio: si torna al brano e al punto di prima, saltando anche se è lontano
    if (S.tipo === "pl") return void caricaPlaylist({ k: S.meta ? S.meta.k : S.idx, t: S.meta ? S.meta.t : Math.floor(S.pos / 1000), forza: true });
    ascolta(S.li, Math.floor(S.pos / 1000) || S.t0, S.parte);
  };
  const alRitorno = () => {
    if (!attesaAccesso || document.visibilityState !== "visible") return;
    attesaAccesso = false;
    setTimeout(ricarica, 400);
  };
  document.addEventListener("visibilitychange", alRitorno);
  addEventListener("focus", alRitorno);
  addEventListener("focus", () => { if (finestra && !finestra.closed && !accesso.hidden) accesso.classList.add("is-attesa"); });

  /* ── Riprendi l'ascolto ────────────────────────────────────────────── */
  let ultimoSalvataggio = 0;
  function salvaRipresa(subito) {
    if (!S.li || S.fonte === "apple" || (S.tipo === "pl" && S.meta)) return;
    const adesso = Date.now();
    if (!subito && adesso - ultimoSalvataggio < 4000) return;
    ultimoSalvataggio = adesso;
    const parti = S.parte ? $$("[data-parte]", S.li) : [];
    mem.set(`pc-ripresa-${slug}`, { n: +S.li.dataset.n, parte: parti.indexOf(S.parte), t: Math.floor(S.pos / 1000), quando: adesso });
  }
  function nascondiRiprendi() {
    if (riprendiBox.hidden) return;
    riprendiBox.classList.remove("is-open");
    setTimeout(() => (riprendiBox.hidden = true), 300);
  }
  const r0 = mem.get(`pc-ripresa-${slug}`);
  if (r0 && Date.now() - r0.quando < 21 * 864e5 && brani[r0.n - 1] && (r0.n > 1 || r0.t > 20)) {
    const li = brani[r0.n - 1];
    const parte = r0.parte >= 0 ? $$("[data-parte]", li)[r0.parte] : null;
    riprendiBox.querySelector("[data-prog-riprendi-testo]").textContent =
      `${autoreDi(li)} — ${operaDi(li)}${parte ? ` · ${parte.textContent.trim()}` : ""}${r0.t ? `, da ${mmss(r0.t)}` : ""}`;
    riprendiBox.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => riprendiBox.classList.add("is-open")));
    riprendiBox.querySelector("[data-prog-riprendi-si]").addEventListener("click", () => {
      if (S.fonte === "apple") { S.fonte = haYT ? "youtube" : "spotify"; segnaFonte(); }
      ascolta(li, r0.t, parte);
      li.scrollIntoView({ behavior: "smooth", block: "center" });
      track("programma-riprendi");
    });
    riprendiBox.querySelector("[data-prog-riprendi-no]").addEventListener("click", () => { nascondiRiprendi(); mem.del(`pc-ripresa-${slug}`); });
  }

  /* ── Condividi un brano ────────────────────────────────────────────── */
  const condividi = async (btn) => {
    if (!S.li) return;
    const url = `${urlProgramma}#${S.li.id}`;
    const titolo = `${autoreDi(S.li)} — ${operaDi(S.li)} · Programma di sala, Pineale Classic`;
    const testo = btn.querySelector("span");
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: titolo, url }); return; }
      await navigator.clipboard.writeText(url);
      testo.textContent = "Link copiato"; btn.classList.add("is-fatto");
      setTimeout(() => { testo.textContent = "Condividi questo brano"; btn.classList.remove("is-fatto"); }, 2000);
      track("programma-condividi");
    } catch {}
  };

  /* ── Comandi (pagina e lettore) ────────────────────────────────────── */
  const comandi = (e) => {
    const t = e.target;
    const f = t.closest("[data-prog-fonte]");
    if (f) {
      if (S.fonte === f.dataset.progFonte) return;
      S.fonte = f.dataset.progFonte;
      mem.set("pc-fonte", S.fonte);
      segnaFonte();
      if (S.li && !dock.hidden) ascolta(S.li, 0, S.parte);
      return;
    }
    if (t.closest("[data-prog-accedi]")) { e.preventDefault(); avviaAccesso(); return; }
    if (t.closest("[data-prog-accesso-fatto]")) return void accessoFatto();
    if (t.closest("[data-prog-passa-apple]")) { chiudiAccesso(); S.fonte = "apple"; mem.set("pc-fonte", S.fonte); segnaFonte(); if (S.li) ascolta(S.li, 0, S.parte); return; }
    if (t.closest("[data-prog-apri-spotify]")) {
      const ids = S.parte ? S.parte.dataset : S.li ? S.li.dataset : {};
      t.closest("[data-prog-apri-spotify]").href = linkSpotify(ids.spotify);
      pannelloApri(null); invia({ command: "pause" }); return;
    }
    if (t.closest("[data-prog-accesso-riapri]")) { apriFinestra(); return; }
    if (t.closest("[data-prog-accesso-annulla]")) { try { if (finestra) finestra.close(); } catch {} return void chiudiAccesso(); }
    if (t.closest("[data-prog-ricomincia]")) return void ricomincia();
    if (t.closest("[data-prog-scegli-no]")) { S.meta = null; return void chiudiScelta(); }
    if (t.closest("[data-prog-apple-tutto]")) { S.appleTutto = !S.appleTutto; mem.set("pc-apple-tutto", S.appleTutto); segnaContinuo(); if (S.li) ascolta(S.li, 0, S.parte); return; }
    if (t.closest("[data-prog-condividi]")) return void condividi(t.closest("[data-prog-condividi]"));
    if (t.closest("[data-prog-ricarica]")) return void ricarica();
    if (t.closest("[data-prog-pp]")) return void playPausa();
    if (t.closest("[data-prog-video]")) { S.videoGrande = !S.videoGrande; mem.set("pc-video-grande", S.videoGrande); segnaFonte(); requestAnimationFrame(tieniDentro); return; }
    if (t.closest("[data-prog-continuo]")) { S.continuo = !S.continuo; mem.set("pc-continuo", S.continuo); segnaContinuo(); return; }
    if (t.closest("[data-prog-info]")) { nascondiSugg(true); return void pannelloApri(pannelloTipo === "info" ? null : "info"); }
    if (t.closest("[data-prog-tab]")) return void pannelloApri(t.closest("[data-prog-tab]").dataset.progTab);
    if (t.closest("[data-prog-pann-chiudi]")) return void pannelloApri(null);
    if (t.closest("[data-prog-come]")) return void comeSiAscolta(!comeBtn.getAttribute("aria-expanded").includes("true"));
    if (t.closest("[data-prog-sugg-si]")) { nascondiSugg(true); track("programma-invito-scheda"); return void pannelloApri("info"); }
    if (t.closest("[data-prog-sugg-no]")) return void nascondiSugg(true);
    if (t.closest("[data-prog-elenco]")) return void pannelloApri(pannelloTipo === "elenco" ? null : "elenco");
    if (t.closest("[data-prog-chiudi]")) return void chiudi();
    if (t.closest("[data-prog-riduci]")) return void (inBarra() ? esciBarra() : telefono() ? barra(true) : riduci(!dock.classList.contains("is-mini")));
    if (t.closest("[data-prog-programma]")) { chiudiLettura(); riduci(false); return; }
    if (t.closest("[data-prog-prec]")) return void passo(-1);
    if (t.closest("[data-prog-succ]")) return void passo(1);
    const vai = t.closest("[data-vai]");
    if (vai) {
      const li = brani[+vai.dataset.vai - 1];
      // sul brano in ascolto il tasto dell'elenco fa da play/pausa (come quello della scheda)
      if (vai.closest(".prog-elenco") && li === S.li && S.fonte !== "apple" && S.pronto) { playPausa(); if (!pannello.hidden) riempiPannello(); return; }
      ascolta(li, 0, li.querySelector("[data-parte]")); if (!lettura) li.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    if (t.closest("[data-prog-inizia]")) {
      const li = brani[0];
      ascolta(li, 0, li.querySelector("[data-parte]"));
      li.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const segno = t.closest(".prog-av-segno");
    if (segno) return void vaiA(+segno.dataset.min);
    const li = t.closest(".prog-brano") || (t.closest(".prog-info") ? S.li : null);
    if (!li) return;
    if (t.closest("[data-prog-play]")) {
      // sullo stesso brano il pulsante della scheda fa da play/pausa
      if (li === S.li && S.fonte !== "apple" && S.pronto) return void playPausa();
      return void ascolta(li, 0, li.querySelector("[data-parte]"));
    }
    const pt = t.closest("[data-parte]");
    if (pt) {
      const vero = $$("[data-parte]", li).find((x) => x.dataset.spotify === pt.dataset.spotify) || pt;
      return void ascolta(li, 0, vero);
    }
    const m = t.closest("[data-min]");
    if (m) {
      if (S.fonte === "apple") { S.fonte = haYT ? "youtube" : "spotify"; segnaFonte(); }
      ascolta(li, +m.dataset.min, li === S.li ? S.parte : null);
    }
  };
  box.addEventListener("click", comandi);
  dock.addEventListener("click", comandi);

  /* ── Scorciatoie da tastiera (quando il lettore è aperto) ──────────── */
  function scorciatoie(e) {
    if (dock.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const dove = e.target;
    if (dove && (dove.isContentEditable || /^(input|textarea|select)$/i.test(dove.tagName))) return;
    const k = (e.key || "").toLowerCase();
    if (k === "escape") {
      if (!pannello.hidden) pannelloApri(null); else if (!inBarra()) barra(true);
      return;
    }
    if (k === "k") { e.preventDefault(); playPausa(); }
    else if (k === "n") passo(1);
    else if (k === "p") passo(-1);
    else if (k === "j") vaiA(S.pos / 1000 - 10);
    else if (k === "l") pannelloApri(pannelloTipo === "elenco" ? null : "elenco");
    else if (k === "i") pannelloApri(pannelloTipo === "info" ? null : "info");
    else if (k === "v" && S.fonte === "youtube") { S.videoGrande = !S.videoGrande; mem.set("pc-video-grande", S.videoGrande); segnaFonte(); requestAnimationFrame(tieniDentro); }
    else if (k === "m") { if (inBarra()) esciBarra(); else barra(true); }
  }
  document.addEventListener("keydown", scorciatoie);

  /* ── Rimando diretto a un brano: /programma-di-sala/#brano-4 ───────── */
  const daHash = /^#brano-(\d+)$/.exec(location.hash);
  if (daHash && brani[+daHash[1] - 1]) brani[+daHash[1] - 1].classList.add("is-cercato");

  /* ── Le schede compaiono con una leggera salita (non per chi chiede meno movimento) ── */
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    box.classList.add("js-rivela");
    const io = new IntersectionObserver((voci) => {
      for (const v of voci) if (v.isIntersecting) { v.target.classList.add("is-visto"); io.unobserve(v.target); }
    }, { rootMargin: "0px 0px -8% 0px" });
    for (const b of brani) io.observe(b);
  }
})();
