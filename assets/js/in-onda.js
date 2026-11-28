/* «In onda»: canali settimanali service-first (disponibili subito in testa, dirette future con
   timer anti-rumore sbloccate 15 minuti prima del sipario), palco in basso, lettore on-click,
   comandi puliti, guida sincronizzata, schermo intero, calendario .ics e mini-player. */
(function () {
  "use strict";
  var pagina = document.querySelector("[data-onda-pagina]");
  if (!pagina) return;

  var datiEl = document.querySelector("[data-onda-dati]");
  if (!datiEl) return;
  var dati;
  try { dati = JSON.parse(datiEl.textContent); } catch (_) { return; }

  var canali = [];
  (dati.disponibili || []).forEach(function (c) {
    canali.push(Object.assign({}, c, { _origine: "replica" }));
  });
  (dati.dirette || []).forEach(function (c) {
    canali.push(Object.assign({}, c, { _origine: "diretta" }));
  });
  if (!canali.length) return;

  var perId = {};
  canali.forEach(function (c, idx) {
    c._ch = pad2(idx + 1);
    c._idx = idx;
    perId[c.id] = c;
  });

  var MINUTO = 60000;
  var GIORNO = 86400000;
  var FINESTRA_PRE_LIVE_MIN = 15; // Il lettore apre 15 minuti prima dell'inizio per evitare programmi precedenti / rumore
  var YT_ORIGINE = "https://www.youtube-nocookie.com";

  var stage = pagina.querySelector("[data-onda-stage]");
  var schermo = stage.querySelector("[data-onda-schermo]");
  var mini = pagina.querySelector("[data-onda-mini]");
  var av = stage.querySelector("[data-onda-av]");
  var avRiemp = stage.querySelector("[data-onda-av-riemp]");
  var avPomello = stage.querySelector("[data-onda-av-pomello]");
  var avSegni = stage.querySelector("[data-onda-av-segni]");
  var tOra = stage.querySelector("[data-onda-t-ora]");
  var tTot = stage.querySelector("[data-onda-t-tot]");
  var controlli = stage.querySelector("[data-stage-controlli]");
  var statoMsgEl = stage.querySelector("[data-ctrl-stato-msg]");
  var toccaEl = stage.querySelector("[data-onda-tocca]");
  var attesaBox = stage.querySelector("[data-stage-attesa]");
  var btnGuarda = stage.querySelector("[data-onda-guarda]");
  var btnIcs = stage.querySelector("[data-stage-ics]");
  var btnFs = stage.querySelector("[data-onda-fs]");

  var corsiaDisp = pagina.querySelector('[data-onda-corsia="disponibili"]');
  var corsiaArrivo = pagina.querySelector('[data-onda-corsia="in-arrivo"]');
  var rigaDisp = pagina.querySelector('[data-onda-riga="disponibili"]');
  var rigaArrivo = pagina.querySelector('[data-onda-riga="in-arrivo"]');
  var plancia = pagina.querySelector("[data-onda-plancia]");
  var cassetto = pagina.querySelector("[data-onda-cassetto]");
  var cassettoBtn = pagina.querySelector("[data-onda-cassetto-btn]");
  var filtroAttivo = "tutti";

  function toggleCassetto(forza) {
    if (!cassetto || !cassettoBtn || !plancia) return;
    var apri = typeof forza === "boolean" ? forza : cassetto.hidden;
    cassetto.hidden = !apri;
    plancia.classList.toggle("is-aperto", apri);
    cassettoBtn.setAttribute("aria-expanded", String(apri));
    if (apri) {
      cassettoBtn.classList.remove("is-suggerito");
      try { sessionStorage.setItem("pc-onda-cassetto-visto", "1"); } catch (_) {}
    }
  }
  try {
    if (cassettoBtn && sessionStorage.getItem("pc-onda-cassetto-visto") === "1") {
      cassettoBtn.classList.remove("is-suggerito");
    }
  } catch (_) {}

  var S = {
    corrente: null,
    frame: null,
    pronto: false,
    inPausa: true,
    pos: 0,
    dur: 0,
    trascinaAv: false,
    saltoInAttesa: null,
    timerAscolto: 0,
    timerTocca: 0
  };

  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function mmss(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h > 0) return h + ":" + pad2(m) + ":" + pad2(sec);
    return m + ":" + pad2(sec);
  }
  function temaDi(genere) {
    var g = String(genere || "").toLowerCase();
    if (g.indexOf("opera") > -1) return "opera";
    if (g.indexOf("contemporanea") > -1) return "contemporanea";
    if (g.indexOf("sinfonica") > -1 || g.indexOf("concerto") > -1) return "sinfonica";
    return "cameristica";
  }
  function fonteNome(f) {
    return f === "youtube" ? "YouTube" : f === "arte" ? "ARTE Concert" : "RaiPlay";
  }
  function formattaDataLunga(iso, eDiretta) {
    if (!iso) return "";
    if (eDiretta) {
      var d = new Date(iso);
      if (isNaN(d)) return "";
      return d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long" }) +
        ", " + d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    }
    var giornoSolo = String(iso).slice(0, 10).split("-");
    if (giornoSolo.length === 3) {
      var dd = new Date(Date.UTC(+giornoSolo[0], +giornoSolo[1] - 1, +giornoSolo[2], 12, 0, 0));
      var gNum = dd.getUTCDate();
      var prep = (gNum === 1 || gNum === 8 || gNum === 11) ? "all'" : "al ";
      return "Disponibile fino " + prep + dd.toLocaleDateString("it-IT", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
    }
    return "";
  }
  function stripHtml(html) {
    var tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || "";
  }
  function giorniTra(a, b) {
    var da = new Date(a); da.setHours(0, 0, 0, 0);
    var b2 = new Date(b); b2.setHours(0, 0, 0, 0);
    return Math.round((b2 - da) / GIORNO);
  }
  function oraBreve(d) {
    return d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
  }

  /* ── Stato e strategia anti-rumore per ogni canale ──────────────────── */
  function calcolaStato(c, adessoMs) {
    var adesso = adessoMs ? new Date(adessoMs) : new Date();
    var nowMs = adesso.getTime();
    var out = {
      testo: "",
      classe: "",
      riproducibile: false,   // true = Play permesso ora
      bloccatoAttesa: false,  // true = diretta futura (> 15 min prima)
      concluso: false,        // true = scaduto o diretta TV finita
      corsia: "in-arrivo",    // "disponibili" | "in-arrivo"
      priorita: 99,           // ordinamento dentro la corsia
      mancanoMs: 0
    };

    if (c.inizio) {
      var inizio = new Date(c.inizio);
      var startMs = inizio.getTime();
      var aperturaMs = startMs - FINESTRA_PRE_LIVE_MIN * MINUTO;
      var fineMs = startMs + (+c.durata || 120) * MINUTO;
      var direttaTv = !!(c.embed && c.embed.indexOf("/dirette/") > -1);

      if (nowMs < aperturaMs) {
        // Diretta futura: Play bloccato per evitare trasmissioni precedenti / rumore
        var g = giorniTra(adesso, inizio);
        out.testo = g === 0 ? "oggi alle " + oraBreve(inizio) : g === 1 ? "domani · " + oraBreve(inizio) : "tra " + g + " giorni";
        out.classe = g === 0 ? "is-oggi" : "is-attesa";
        out.bloccatoAttesa = true;
        out.corsia = "in-arrivo";
        out.priorita = 10;
        out.mancanoMs = startMs - nowMs;
      } else if (nowMs < startMs) {
        // Finestra pre-live (ultimi 15 minuti): collegabile!
        var minManc = Math.max(1, Math.ceil((startMs - nowMs) / MINUTO));
        out.testo = "apre tra " + minManc + " min";
        out.classe = "is-live";
        out.riproducibile = true;
        out.corsia = "disponibili";
        out.priorita = 1;
        out.mancanoMs = startMs - nowMs;
      } else if (nowMs < fineMs) {
        // In diretta ora
        out.testo = "in diretta ora";
        out.classe = "is-live";
        out.riproducibile = true;
        out.corsia = "disponibili";
        out.priorita = 0;
      } else {
        // Diretta conclusa (TV o streaming): disabilita sempre il lettore per evitare programmi successivi o rumore
        out.testo = "diretta conclusa";
        out.classe = "is-finito";
        out.concluso = true;
        out.corsia = "in-arrivo";
        out.priorita = 50;
      }
    } else if (c.fine) {
      var scad = new Date(c.fine);
      var scadMs = scad.getTime();
      var gg = giorniTra(adesso, scad);
      if (nowMs >= scadMs) {
        out.testo = "non più disponibile";
        out.classe = "is-finito";
        out.concluso = true;
        out.corsia = "in-arrivo";
        out.priorita = 60;
      } else {
        out.riproducibile = true;
        out.corsia = "disponibili";
        out.priorita = 3;
        if (gg <= 0) { out.testo = "ultimo giorno"; out.classe = "is-urgente"; }
        else if (gg <= 10) { out.testo = "scade tra " + gg + (gg === 1 ? " giorno" : " giorni"); out.classe = "is-urgente"; }
        else { out.testo = "disponibile ora"; out.classe = "is-pronto"; }
      }
    }

    if (c.daConfermare && !out.concluso && out.classe !== "is-live") {
      out.testo = "da confermare · " + out.testo;
    }
    return out;
  }

  function formattaTimerBreve(ms) {
    if (ms <= 0) return "";
    var totSec = Math.floor(ms / 1000);
    var g = Math.floor(totSec / 86400);
    var h = Math.floor((totSec % 86400) / 3600);
    var m = Math.floor((totSec % 3600) / 60);
    var s = totSec % 60;
    if (g >= 1) return "−" + g + "g " + pad2(h) + "h";
    return "−" + pad2(h) + ":" + pad2(m) + ":" + pad2(s);
  }

  function scomponiCountdown(ms) {
    var totSec = Math.max(0, Math.floor(ms / 1000));
    return {
      g: pad2(Math.floor(totSec / 86400)),
      o: pad2(Math.floor((totSec % 86400) / 3600)),
      m: pad2(Math.floor((totSec % 3600) / 60)),
      s: pad2(totSec % 60)
    };
  }

  /* ── Riga di stato della scheda: una sola frase chiara, in italiano ─── */
  var MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  function attesaBreve(ms) {
    var min = Math.max(1, Math.ceil(ms / MINUTO));
    if (min < 60) return min + " min";
    var h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + pad2(m) + " min" : "");
  }
  function statoCard(c, st, nowMs) {
    var pre = (c.daConfermare && !st.concluso && st.classe !== "is-live") ? "Da confermare · " : "";
    if (c.inizio) {
      var inizio = new Date(c.inizio);
      if (st.bloccatoAttesa) {
        var g = giorniTra(new Date(nowMs), inizio);
        if (g === 0) return { t: pre + "Oggi · tra " + attesaBreve(st.mancanoMs), k: "is-urgente" };
        if (g === 1) return { t: pre + "Domani alle " + oraBreve(inizio), k: "" };
        return { t: pre + "Tra " + g + " giorni", k: "" };
      }
      if (st.concluso) return { t: "Diretta conclusa", k: "is-finito" };
      if (st.classe === "is-live") return { t: st.mancanoMs > 0 ? "Si apre tra " + attesaBreve(st.mancanoMs) : "In diretta ora", k: "is-live" };
      return { t: pre + "Replica disponibile", k: "" };
    }
    if (st.concluso) return { t: "Non più disponibile", k: "is-finito" };
    var p = String(c.fine || "").slice(0, 10).split("-");
    var gg = giorniTra(new Date(nowMs), new Date(c.fine));
    if (gg <= 0) return { t: pre + "Ultimo giorno", k: "is-urgente" };
    if (gg <= 7) return { t: pre + "Ultimi " + gg + (gg === 1 ? " giorno" : " giorni"), k: "is-urgente" };
    var gNum = +p[2];
    var prep = (gNum === 1 || gNum === 8 || gNum === 11) ? "Fino all'" : "Fino al ";
    return { t: pre + prep + gNum + " " + (MESI_BREVI[+p[1] - 1] || ""), k: "" };
  }

  /* ── Guida TV: etichetta del giorno sul primo canale di ogni giornata ── */
  function marcaGiorni() {
    if (!corsiaArrivo) return;
    var ultimo = null;
    corsiaArrivo.querySelectorAll("[data-onda-card]").forEach(function (card) {
      if (card.hidden) { card.classList.remove("is-nuovo-giorno"); return; }
      var g = card.dataset.giorno || "";
      card.classList.toggle("is-nuovo-giorno", !!g && g !== ultimo);
      ultimo = g;
    });
  }

  /* ── Dissolvenza ai bordi delle corsie (niente tagli netti) ─────────── */
  function aggiornaBordi(corsia) {
    if (!corsia) return;
    var max = corsia.scrollWidth - corsia.clientWidth;
    corsia.classList.toggle("has-prima", corsia.scrollLeft > 4);
    corsia.classList.toggle("has-dopo", corsia.scrollLeft < max - 4);
  }
  [corsiaDisp, corsiaArrivo].forEach(function (corsia) {
    if (!corsia) return;
    corsia.addEventListener("scroll", function () { aggiornaBordi(corsia); }, { passive: true });
  });
  window.addEventListener("resize", function () { aggiornaBordi(corsiaDisp); aggiornaBordi(corsiaArrivo); });

  /* ── Smistamento automatico delle corsie (Disponibili prima) ─────────── */
  var ordineCanaliIds = [];

  function smistaCorsie() {
    var nowMs = Date.now();
    var listaDisp = [];
    var listaArrivo = [];

    canali.forEach(function (c) {
      c._stato = calcolaStato(c, nowMs);
      if (c._stato.corsia === "disponibili") listaDisp.push(c);
      else listaArrivo.push(c);
    });

    listaDisp.sort(function (a, b) {
      if (a._stato.priorita !== b._stato.priorita) return a._stato.priorita - b._stato.priorita;
      var ta = a.inizio ? new Date(a.inizio).getTime() : new Date(a.fine).getTime();
      var tb = b.inizio ? new Date(b.inizio).getTime() : new Date(b.fine).getTime();
      return ta - tb;
    });

    listaArrivo.sort(function (a, b) {
      if (a._stato.priorita !== b._stato.priorita) return a._stato.priorita - b._stato.priorita;
      var ta = a.inizio ? new Date(a.inizio).getTime() : new Date(a.fine).getTime();
      var tb = b.inizio ? new Date(b.inizio).getTime() : new Date(b.fine).getTime();
      return ta - tb;
    });

    var ordinati = listaDisp.concat(listaArrivo);
    ordineCanaliIds = ordinati.map(function (c) { return c.id; });

    ordinati.forEach(function (c, i) {
      c._ch = pad2(i + 1);
      c._idx = i;
      var card = pagina.querySelector('[data-onda-card][data-id="' + c.id + '"]');
      if (!card) return;
      card.dataset.ch = c._ch;
      card.dataset.corsia = c._stato.corsia;
      card.classList.toggle("is-bloccato", !c._stato.riproducibile);
      card.classList.toggle("is-chiuso", c._stato.concluso);
      var numEl = card.querySelector("[data-card-num]");
      if (numEl) numEl.textContent = c._ch;

      var target = c._stato.corsia === "disponibili" ? corsiaDisp : corsiaArrivo;
      if (target && card.parentNode !== target) target.appendChild(card);
      else if (target) target.appendChild(card);
    });

    // Aggiorna contatori (accanto ai titoli delle righe)
    pagina.querySelectorAll("[data-conta-pronti]").forEach(function (el) { el.textContent = String(listaDisp.length); });
    pagina.querySelectorAll("[data-conta-arrivo]").forEach(function (el) { el.textContent = String(listaArrivo.length); });

    applicaFiltro(filtroAttivo);
    aggiornaTimerTutti();
  }

  function aggiornaTimerTutti() {
    var nowMs = Date.now();
    var cambiatoStato = false;

    pagina.querySelectorAll("[data-onda-card]").forEach(function (card) {
      var c = perId[card.dataset.id];
      if (!c) return;
      var st = calcolaStato(c, nowMs);
      if (c._stato && (st.riproducibile !== c._stato.riproducibile || st.corsia !== c._stato.corsia || st.concluso !== c._stato.concluso)) {
        cambiatoStato = true;
      }
      c._stato = st;

      var stEl = card.querySelector("[data-card-stato]");
      if (stEl) {
        var sc = statoCard(c, st, nowMs);
        if (stEl.textContent !== sc.t) stEl.textContent = sc.t;
        stEl.className = "onda-card-stato" + (sc.k ? " " + sc.k : "");
      }
    });

    if (cambiatoStato) {
      smistaCorsie();
      if (S.corrente) {
        var stCorr = calcolaStato(S.corrente, nowMs);
        if ((!stCorr.riproducibile || stCorr.concluso) && S.frame) chiudiLettore();
        aggiornaStatoStage(S.corrente, nowMs);
      }
      return;
    }

    if (S.corrente) {
      var stOra = calcolaStato(S.corrente, nowMs);
      if ((!stOra.riproducibile || stOra.concluso) && S.frame) chiudiLettore();
      aggiornaStatoStage(S.corrente, nowMs);
    }
  }

  /* ── Stato e Sala d'attesa sul Palco ────────────────────────────────── */
  function aggiornaStatoStage(c, nowMs) {
    var st = calcolaStato(c, nowMs);
    var stEl = stage.querySelector("[data-stage-stato]");
    if (stEl) {
      stEl.textContent = st.testo;
      stEl.className = "onda-stato " + st.classe;
    }
    stage.querySelector("[data-stage-ch]").textContent = "CH " + c._ch;
    stage.querySelector("[data-stage-facciata-ch]").textContent = "CANALE " + c._ch;
    stage.classList.toggle("is-bloccato", !st.riproducibile);
    stage.classList.toggle("is-chiuso", st.concluso);

    if (st.bloccatoAttesa) {
      // Diretta futura: mostra countdown, nasconde Play, offre Aggiungi al calendario
      var cd = scomponiCountdown(st.mancanoMs);
      attesaBox.hidden = false;
      attesaBox.querySelector("[data-cd-g]").textContent = cd.g;
      attesaBox.querySelector("[data-cd-o]").textContent = cd.o;
      attesaBox.querySelector("[data-cd-m]").textContent = cd.m;
      attesaBox.querySelector("[data-cd-s]").textContent = cd.s;
      attesaBox.querySelector("[data-stage-attesa-ora]").textContent = formattaDataLunga(c.inizio, true);

      btnGuarda.hidden = true;
      btnIcs.hidden = false;
      btnFs.hidden = true;
      stage.querySelector("[data-stage-facciata-nota]").textContent = notaAccesso(c);
    } else if (st.concluso) {
      attesaBox.hidden = true;
      btnGuarda.hidden = true;
      btnIcs.hidden = true;
      btnFs.hidden = true;
      stage.querySelector("[data-stage-facciata-nota]").textContent = c.inizio
        ? "Questo concerto in diretta si è concluso."
        : "Questo concerto non è più disponibile.";
    } else {
      attesaBox.hidden = true;
      btnGuarda.hidden = false;
      btnIcs.hidden = true;
      btnFs.hidden = false;
      stage.querySelector("[data-stage-guarda-lbl]").textContent = c.inizio
        ? (st.classe === "is-live" ? "Segui in diretta" : "Guarda la replica")
        : "Guarda qui";
      stage.querySelector("[data-stage-facciata-nota]").textContent = notaAccesso(c);
    }

    aggiornaBarraControlli(c, st);
  }

  function aggiornaBarraControlli(c, st) {
    var acceso = !!S.frame;
    var isYT = !!(c && c.video);
    var mostraTrasporto = acceso && isYT && st.riproducibile;

    controlli.querySelectorAll("[data-ctrl-yt]").forEach(function (el) { el.hidden = !mostraTrasporto; });
    controlli.classList.toggle("is-attivo", mostraTrasporto);

    if (mostraTrasporto) {
      statoMsgEl.hidden = true;
    } else {
      statoMsgEl.hidden = false;
      if (st.bloccatoAttesa) {
        statoMsgEl.textContent = "In diretta " + formattaDataLunga(c.inizio, true) + ".";
      } else if (st.concluso) {
        statoMsgEl.textContent = "Trasmissione conclusa.";
      } else if (acceso && !isYT) {
        statoMsgEl.textContent = "Controlli di riproduzione integrati nel lettore qui sopra.";
      } else {
        statoMsgEl.textContent = "Pronto alla visione: premi «" + (c.inizio ? (st.classe === "is-live" ? "Segui in diretta" : "Guarda la replica") : "Guarda qui") + "» nello schermo sopra.";
      }
    }

    var miniPP = mini.querySelector("[data-onda-pp]");
    if (miniPP) miniPP.hidden = !(acceso && isYT);

    pagina.querySelectorAll("[data-onda-card]").forEach(function (card) {
      var attEl = card.querySelector("[data-card-attivo]");
      if (attEl) attEl.textContent = (card.dataset.id === (c && c.id) && acceso) ? "In visione" : "Selezionato";
    });
  }

  function notaAccesso(c) {
    if (c.fonte === "raiplay") return "Richiede l'accesso gratuito con un profilo Rai.";
    return "Visione gratuita e senza registrazione.";
  }

  /* ── Selezione di un canale sul Palco ───────────────────────────────── */
  function popolaGuida(c) {
    var list = stage.querySelector("[data-stage-guida]");
    var conta = stage.querySelector("[data-stage-guida-conta]");
    var g = c.guida || [];
    if (conta) conta.textContent = g.length + (g.length === 1 ? " brano" : " brani");
    if (!list) return;
    list.innerHTML = g.map(function (voce) {
      var hasT = typeof voce.t === "number";
      return "<li" + (hasT ? ' data-t="' + voce.t + '"' : "") + ">" +
        (hasT ? '<button type="button" class="onda-vai" data-onda-vai aria-label="Vai a ' + stripHtml(voce.titolo).replace(/"/g, "&quot;") + '">' + mmss(voce.t) + "</button>" : "") +
        '<p class="onda-g-tit">' + (voce.titolo || "") + "</p>" +
        '<p class="onda-g-nota">' + (voce.nota || "") + "</p>" +
      "</li>";
    }).join("");
  }

  function selezionaCanale(id, opzioni) {
    opzioni = opzioni || {};
    var c = perId[id];
    if (!c) return;
    var st = calcolaStato(c);

    if (S.corrente && S.corrente.id === c.id && !opzioni.forza) {
      if (opzioni.avvia && st.riproducibile) apriLettore();
      if (opzioni.scorri) requestAnimationFrame(scorriAlPalco);
      return;
    }

    chiudiLettore();
    S.corrente = c;

    stage.dataset.id = c.id;
    stage.dataset.fonte = c.fonte;
    stage.querySelector("[data-stage-kicker]").textContent = c.genere + (c.anniversario ? " · " + c.anniversario : "");
    stage.querySelector("[data-stage-autori]").textContent = c.autori || "";
    stage.querySelector("[data-stage-titolo]").innerHTML = c.titolo || "";
    stage.querySelector("[data-stage-interpreti]").innerHTML = c.interpreti || "";
    stage.querySelector("[data-stage-meta]").textContent =
      (c.luogo || "") + " · " + formattaDataLunga(c.inizio || c.fine, !!c.inizio) + " · " + c.durata + " minuti circa";

    var facciata = stage.querySelector("[data-stage-facciata]");
    facciata.className = "onda-facciata onda-facciata--" + temaDi(c.genere);
    var facMedia = stage.querySelector("[data-stage-facciata-media]");
    var facImg = stage.querySelector("[data-stage-facciata-img]");
    if (facMedia && facImg) {
      if (c.immagine) { facImg.src = c.immagine; facMedia.hidden = false; }
      else { facImg.removeAttribute("src"); facMedia.hidden = true; }
    }
    stage.querySelector("[data-stage-marca]").textContent = "~" + c.durata + " min";
    var infoDetails = stage.querySelector("[data-stage-info]");
    if (infoDetails) infoDetails.open = false;
    stage.querySelector("[data-stage-facciata-tit]").textContent = c.autori || "";
    stage.querySelector("[data-stage-facciata-sub]").textContent = stripHtml(c.titolo);

    if (c.video) {
      schermo.dataset.youtube = c.video;
      delete schermo.dataset.embed;
    } else {
      delete schermo.dataset.youtube;
      schermo.dataset.embed = c.embed || "";
    }

    var linkEl = stage.querySelector("[data-stage-link]");
    linkEl.href = c.link || "#";
    linkEl.dataset.umamiEvent = "inonda-" + c.fonte;
    stage.querySelector("[data-stage-link-testo]").textContent = c.linkTesto || "Apri sulla piattaforma";

    stage.querySelector("[data-stage-perche]").innerHTML = c.perche || "";
    var notaEl = stage.querySelector("[data-stage-nota]");
    notaEl.innerHTML = c.nota || "";
    notaEl.hidden = !c.nota;
    var altroEl = stage.querySelector("[data-stage-altro]");
    altroEl.innerHTML = c.altro || "";
    altroEl.hidden = !c.altro;
    var credEl = stage.querySelector("[data-stage-credito]");
    if (credEl) {
      credEl.innerHTML = c.immagineCredito ? "Immagine: " + c.immagineCredito : "";
      credEl.hidden = !c.immagineCredito;
    }

    popolaGuida(c);
    disegnaSegni();
    aggiornaAvanzamento(0, 0);
    aggiornaStatoStage(c);

    pagina.querySelectorAll("[data-onda-card]").forEach(function (card) {
      var attiva = card.dataset.id === c.id;
      card.classList.toggle("is-attiva", attiva);
      var btn = card.querySelector("[data-card-seleziona]");
      if (btn) btn.setAttribute("aria-pressed", String(attiva));
    });

    if (opzioni.aggiornaHash !== false && history.replaceState) {
      history.replaceState(null, "", "#" + c.id);
    }

    if (opzioni.avvia && st.riproducibile) apriLettore();
    if (opzioni.scorri) requestAnimationFrame(scorriAlPalco);
  }

  function scorriAlPalco() {
    stage.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── Lettore: solo su canali riproducibili e al clic ────────────────── */
  function chiudiLettore() {
    clearInterval(S.timerAscolto);
    clearTimeout(S.timerTocca);
    if (S.frame) { S.frame.remove(); S.frame = null; }
    S.pronto = false;
    S.inPausa = true;
    S.pos = 0;
    S.dur = 0;
    S.saltoInAttesa = null;
    schermo.classList.remove("is-acceso", "is-suona");
    stage.classList.remove("is-suona");
    toccaEl.hidden = true;
    aggiornaPlayPausaUI();
    aggiornaAvanzamento(0, 0);
    stage.querySelectorAll("[data-stage-guida] li").forEach(function (li) { li.classList.remove("is-ora"); });
    if (S.corrente) aggiornaBarraControlli(S.corrente, calcolaStato(S.corrente));
    aggiornaMini();
  }

  function apriLettore() {
    var c = S.corrente;
    if (!c) return;
    var st = calcolaStato(c);
    if (!st.riproducibile) return; // Blocco assoluto anti-rumore
    if (S.frame) {
      if (c.video && S.pronto) playPausaYT();
      return;
    }

    var src;
    if (c.video) {
      src = YT_ORIGINE + "/embed/" + encodeURIComponent(c.video) +
        "?autoplay=1&mute=0&rel=0&playsinline=1&enablejsapi=1&hl=it&origin=" + encodeURIComponent(location.origin);
    } else {
      src = c.embed || "";
      if (src.indexOf("arte.tv/embeds/") > -1) {
        src += (src.indexOf("?") > -1 ? "&" : "?") + "autoplay=true&mute=0";
      } else if (src.indexOf("raiplay.it/") > -1) {
        src += (src.indexOf("?") > -1 ? "&" : "?") + "autoplay=true";
      }
    }

    var f = document.createElement("iframe");
    f.title = "Lettore: " + (c.autori || "") + " — " + stripHtml(c.titolo);
    f.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture";
    f.allowFullscreen = true;
    f.referrerPolicy = "strict-origin-when-cross-origin";
    S.frame = f;
    S.pronto = false;
    S.inPausa = true;

    schermo.classList.add("is-acceso");
    schermo.appendChild(f);
    if (c.video) collegaYouTube(f);
    f.src = src;
    aggiornaBarraControlli(c, st);
    if (window.umami) window.umami.track("inonda-play", { id: c.id, fonte: c.fonte });
    aggiornaMini();
  }

  /* ── Comandi YouTube via postMessage ────────────────────────────────── */
  function inviaYT(func, args) {
    if (!S.frame || !S.frame.contentWindow) return;
    try {
      S.frame.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: func, args: args || [], id: 1, channel: "widget" }),
        YT_ORIGINE
      );
    } catch (_) {}
  }

  function playPausaYT() {
    if (!S.corrente || !calcolaStato(S.corrente).riproducibile) return;
    if (!S.frame) { apriLettore(); return; }
    if (!S.pronto) return;
    inviaYT(S.inPausa ? "playVideo" : "pauseVideo");
    S.inPausa = !S.inPausa;
    toccaEl.hidden = true;
    aggiornaPlayPausaUI();
  }

  function vaiA(sec) {
    if (!S.corrente || !calcolaStato(S.corrente).riproducibile) return;
    var d = S.dur || 0;
    sec = Math.max(0, d ? Math.min(sec, d - 1) : sec);
    if (!S.frame) {
      S.saltoInAttesa = sec;
      apriLettore();
      return;
    }
    if (S.pronto) {
      inviaYT("seekTo", [sec, true]);
      if (S.inPausa) inviaYT("playVideo");
      S.pos = sec;
      aggiornaAvanzamento(S.pos, S.dur);
    } else {
      S.saltoInAttesa = sec;
    }
  }

  function collegaYouTube(f) {
    clearInterval(S.timerAscolto);
    f.addEventListener("load", function () {
      var tentativi = 0;
      clearInterval(S.timerAscolto);
      S.timerAscolto = setInterval(function () {
        if (S.pronto || S.frame !== f || ++tentativi > 40) {
          clearInterval(S.timerAscolto);
          return;
        }
        try {
          f.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), YT_ORIGINE);
        } catch (_) {}
      }, 300);
    });
  }

  function aggiornaPlayPausaUI() {
    var suona = !!(S.frame && S.corrente && S.corrente.video && S.pronto && !S.inPausa);
    stage.classList.toggle("is-suona", suona);
    schermo.classList.toggle("is-suona", suona);
    mini.classList.toggle("is-suona", suona);
    pagina.querySelectorAll("[data-onda-pp]").forEach(function (b) {
      b.setAttribute("aria-label", suona ? "Pausa" : "Riproduci");
    });
  }

  function aggiornaAvanzamento(pos, dur) {
    var r = dur > 0 ? Math.min(1, Math.max(0, pos / dur)) : 0;
    if (avRiemp) avRiemp.style.transform = "scaleX(" + r + ")";
    if (avPomello) avPomello.style.left = (r * 100) + "%";
    if (tOra) tOra.textContent = mmss(pos);
    if (tTot) tTot.textContent = dur > 0 ? mmss(dur) : "–:––";
    if (av) {
      av.setAttribute("aria-valuemax", String(Math.round(dur || 0)));
      av.setAttribute("aria-valuenow", String(Math.round(pos || 0)));
    }
  }

  function disegnaSegni() {
    if (!avSegni) return;
    avSegni.replaceChildren();
    if (!S.corrente || !S.dur) return;
    (S.corrente.guida || []).forEach(function (g) {
      if (typeof g.t !== "number" || g.t >= S.dur) return;
      var b = document.createElement("button");
      b.type = "button";
      b.className = "onda-av-segno";
      b.dataset.t = g.t;
      b.style.left = ((g.t / S.dur) * 100) + "%";
      b.setAttribute("aria-label", "Vai a " + mmss(g.t) + ": " + stripHtml(g.titolo));
      b.title = mmss(g.t) + " · " + stripHtml(g.titolo);
      avSegni.appendChild(b);
    });
  }

  window.addEventListener("message", function (e) {
    if (e.origin !== YT_ORIGINE || !S.frame || e.source !== S.frame.contentWindow) return;
    var d;
    try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (_) { return; }
    if (!d) return;

    if (d.event === "onReady") {
      S.pronto = true;
      clearInterval(S.timerAscolto);
      if (S.saltoInAttesa !== null) {
        inviaYT("seekTo", [S.saltoInAttesa, true]);
        S.saltoInAttesa = null;
      }
      inviaYT("unMute");
      inviaYT("setVolume", [100]);
      inviaYT("playVideo");
      var frameRef = S.frame;
      clearTimeout(S.timerTocca);
      S.timerTocca = setTimeout(function () {
        if (S.frame === frameRef && S.inPausa && S.pos < 1) toccaEl.hidden = false;
      }, 2400);
      aggiornaPlayPausaUI();
      return;
    }

    if (d.event === "onStateChange") {
      if (d.info === 1) { S.inPausa = false; toccaEl.hidden = true; }
      else if (d.info === 2 || d.info === 0 || d.info === 5) S.inPausa = true;
      aggiornaPlayPausaUI();
      return;
    }

    if (d.event === "infoDelivery" || d.event === "initialDelivery") {
      var info = d.info || {};
      if (!S.pronto) {
        S.pronto = true;
        if (S.saltoInAttesa !== null) {
          inviaYT("seekTo", [S.saltoInAttesa, true]);
          S.saltoInAttesa = null;
        }
      }
      if (typeof info.duration === "number" && info.duration > 0) {
        var eraZero = !S.dur;
        S.dur = info.duration;
        if (eraZero) disegnaSegni();
      }
      if (typeof info.currentTime === "number" && !S.trascinaAv) {
        S.pos = info.currentTime;
      }
      if (typeof info.playerState === "number") {
        if (info.playerState === 1) { S.inPausa = false; toccaEl.hidden = true; }
        else if (info.playerState === 2 || info.playerState === 0 || info.playerState === 5) S.inPausa = true;
      }
      aggiornaPlayPausaUI();
      aggiornaAvanzamento(S.pos, S.dur);
      sincronizzaGuida(S.pos);
    }
  });

  function sincronizzaGuida(t) {
    var voci = stage.querySelectorAll("[data-stage-guida] li[data-t]");
    if (!voci.length) return;
    var corrente = null;
    voci.forEach(function (li) { if (+li.dataset.t <= t + 0.5) corrente = li; });
    voci.forEach(function (li) { li.classList.toggle("is-ora", li === corrente); });
    if (corrente && sovra) {
      var tutte = Array.prototype.slice.call(stage.querySelectorAll("[data-stage-guida] li"));
      var i = tutte.indexOf(corrente);
      if (i >= 0 && i !== sovra.i) mostraVoce(i);
    }
  }

  /* ── Aggiungi al calendario (.ics) per le dirette future ─────────────── */
  function scaricaIcs(c) {
    if (!c || !c.inizio) return;
    function esc(t) { return String(t || "").replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n"); }
    function toUtcStamp(d) { return new Date(d).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; }
    var start = new Date(c.inizio);
    var end = new Date(start.getTime() + (+c.durata || 120) * MINUTO);
    var url = location.origin + "/in-onda/#" + c.id;
    var titolo = (c.autori ? c.autori + " — " : "") + stripHtml(c.titolo);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Pineale Classic//In onda//IT",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + c.id + "@pinealeclassic.com",
      "DTSTAMP:" + toUtcStamp(Date.now()),
      "DTSTART:" + toUtcStamp(start),
      "DTEND:" + toUtcStamp(end),
      "SUMMARY:" + esc(titolo),
      "LOCATION:" + esc(c.luogo || ""),
      "DESCRIPTION:" + esc(stripHtml(c.interpreti) + "\n\nDiretta gratuita su Pineale Classic: " + url),
      "URL:" + url,
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "in-onda-" + c.id + ".ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    if (window.umami) window.umami.track("inonda-calendario", { id: c.id });
  }

  /* ── Barra di avanzamento interattiva ───────────────────────────────── */
  if (av) {
    var rapporto = function (x) {
      var r = av.getBoundingClientRect();
      return Math.min(1, Math.max(0, (x - r.left) / Math.max(1, r.width)));
    };
    av.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".onda-av-segno")) {
        vaiA(+e.target.closest(".onda-av-segno").dataset.t);
        return;
      }
      if (!S.dur) return;
      e.preventDefault();
      av.setPointerCapture(e.pointerId);
      S.trascinaAv = true;
      var muovi = function (ev) { aggiornaAvanzamento(rapporto(ev.clientX) * S.dur, S.dur); };
      var fine = function (ev) {
        av.removeEventListener("pointermove", muovi);
        av.removeEventListener("pointerup", fine);
        av.removeEventListener("pointercancel", fine);
        S.trascinaAv = false;
        vaiA(rapporto(ev.clientX) * S.dur);
      };
      muovi(e);
      av.addEventListener("pointermove", muovi);
      av.addEventListener("pointerup", fine);
      av.addEventListener("pointercancel", fine);
    });
    av.addEventListener("keydown", function (e) {
      if (!S.dur) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); vaiA(S.pos - 5); }
      else if (e.key === "ArrowRight") { e.preventDefault(); vaiA(S.pos + 5); }
    });
  }

  /* ── Mini-player persistente (direzione freccia dinamica ↑/↓) ──────── */
  var palcoFuori = false;
  function aggiornaMini() {
    var mostra = !!(S.frame && palcoFuori && !sovra);
    if (mostra && S.corrente) {
      mini.querySelector("[data-mini-ch]").textContent = "CH " + S.corrente._ch;
      mini.querySelector("[data-mini-autori]").textContent = S.corrente.autori || "";
      mini.querySelector("[data-mini-titolo]").textContent = stripHtml(S.corrente.titolo);
      var r = schermo.getBoundingClientRect();
      var btnTorna = mini.querySelector("[data-mini-torna]");
      if (btnTorna) btnTorna.textContent = r.top > 0 ? "Torna al lettore ↓" : "Torna al lettore ↑";
    }
    mini.hidden = !mostra;
    requestAnimationFrame(function () { mini.classList.toggle("is-open", mostra); });
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      palcoFuori = !entries[0].isIntersecting;
      aggiornaMini();
    }, { threshold: 0.1 }).observe(schermo);
  }

  /* ── Filtri e corsie tipo Netflix ───────────────────────────────────── */
  function applicaFiltro(chiave) {
    filtroAttivo = chiave;
    pagina.querySelectorAll("[data-onda-filtro]").forEach(function (b) {
      var on = b.dataset.ondaFiltro === chiave;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    });

    var visibili = 0;
    pagina.querySelectorAll("[data-onda-riga]").forEach(function (riga) {
      var rTipo = riga.dataset.ondaRiga;
      var inRiga = 0;
      riga.querySelectorAll("[data-onda-card]").forEach(function (card) {
        var mostra = chiave === "tutti" ||
          (chiave === "disponibili" && rTipo === "disponibili") ||
          (chiave === "in-arrivo" && rTipo === "in-arrivo") ||
          card.dataset.tema === chiave;
        card.hidden = !mostra;
        if (mostra) { inRiga++; visibili++; }
      });
      riga.hidden = inRiga === 0 || (chiave === "disponibili" && rTipo !== "disponibili") || (chiave === "in-arrivo" && rTipo !== "in-arrivo");
    });

    var vuoto = pagina.querySelector("[data-onda-vuoto]");
    if (vuoto) vuoto.hidden = visibili > 0;
    marcaGiorni();
    aggiornaBordi(corsiaDisp);
    aggiornaBordi(corsiaArrivo);
  }

  /* ── Schermo intero con guida in sovrimpressione ────────────────────── */
  var sovra = null;
  var fsEl = function () { return document.fullscreenElement || document.webkitFullscreenElement || null; };
  function vociGuida() { return Array.prototype.slice.call(stage.querySelectorAll("[data-stage-guida] li")); }

  function costruisciSovra() {
    var el = document.createElement("div");
    el.className = "onda-sovra";
    el.innerHTML =
      '<div class="onda-sovra-lastra" data-sovra-lastra>' +
        '<p class="onda-sovra-n"><span>Guida all\'ascolto</span> <b data-sovra-n></b></p>' +
        '<p class="onda-sovra-tit" data-sovra-tit></p>' +
        '<p class="onda-sovra-nota" data-sovra-nota></p>' +
        '<div class="onda-sovra-com">' +
          '<button type="button" data-sovra-prec aria-label="Voce precedente">‹</button>' +
          '<button type="button" data-sovra-succ aria-label="Voce successiva">›</button>' +
          '<button type="button" class="onda-sovra-nascondi" data-sovra-nascondi>Nascondi</button>' +
          '<button type="button" data-sovra-esci aria-label="Esci dallo schermo intero">Esci ×</button>' +
        '</div>' +
      '</div>' +
      '<div class="onda-sovra-mostra" data-sovra-mostra hidden>' +
        '<button type="button" data-sovra-mostra-btn>Guida</button>' +
        '<button type="button" data-sovra-esci aria-label="Esci dallo schermo intero">×</button>' +
      '</div>';
    schermo.appendChild(el);
    return el;
  }

  function mostraVoce(i) {
    if (!sovra) return;
    var v = vociGuida();
    if (!v.length) return;
    i = Math.max(0, Math.min(v.length - 1, i));
    sovra.i = i;
    var li = v[i];
    sovra.el.querySelector("[data-sovra-n]").textContent = (i + 1) + " / " + v.length;
    sovra.el.querySelector("[data-sovra-tit]").innerHTML = li.querySelector(".onda-g-tit").innerHTML;
    sovra.el.querySelector("[data-sovra-nota]").innerHTML = li.querySelector(".onda-g-nota").innerHTML;
    sovra.el.querySelector("[data-sovra-prec]").disabled = i === 0;
    sovra.el.querySelector("[data-sovra-succ]").disabled = i === v.length - 1;
  }

  function nascondiSovra(si) {
    if (!sovra) return;
    sovra.el.querySelector("[data-sovra-lastra]").hidden = si;
    sovra.el.querySelector("[data-sovra-mostra]").hidden = !si;
  }

  function entraFullscreen() {
    if (!S.corrente || !calcolaStato(S.corrente).riproducibile) return;
    if (!S.frame) apriLettore();
    if (sovra) return;
    var el = costruisciSovra();
    var ora = stage.querySelector("[data-stage-guida] li.is-ora");
    sovra = { el: el, i: 0, finto: false };
    mostraVoce(ora ? vociGuida().indexOf(ora) : 0);
    schermo.classList.add("is-fs");
    aggiornaMini();
    var req = schermo.requestFullscreen || schermo.webkitRequestFullscreen;
    var ok = false;
    if (req) {
      try {
        var r = req.call(schermo);
        ok = true;
        if (r && r.catch) r.catch(function () { fintoFullscreen(); });
      } catch (_) { ok = false; }
    }
    if (!ok) fintoFullscreen();
  }

  function fintoFullscreen() {
    if (!sovra) return;
    sovra.finto = true;
    schermo.classList.add("is-fs-finto");
    document.documentElement.classList.add("onda-fs-aperto");
  }

  function esciFullscreen() {
    if (!sovra) return;
    var s = sovra;
    sovra = null;
    s.el.remove();
    schermo.classList.remove("is-fs", "is-fs-finto");
    document.documentElement.classList.remove("onda-fs-aperto");
    if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    aggiornaMini();
    if (btnFs) btnFs.focus({ preventScroll: true });
  }

  function cambioFs() { if (sovra && !sovra.finto && !fsEl()) esciFullscreen(); }
  document.addEventListener("fullscreenchange", cambioFs);
  document.addEventListener("webkitfullscreenchange", cambioFs);

  /* ── Gestione eventi ────────────────────────────────────────────────── */
  pagina.addEventListener("click", function (e) {
    var t = e.target;

    var cal = t.closest("[data-cal-scegli]");
    if (cal) {
      e.preventDefault();
      if (matchMedia("(max-width: 960px)").matches) toggleCassetto(false);
      selezionaCanale(cal.dataset.calScegli, { scorri: true });
      return;
    }

    if (t.closest("[data-onda-cassetto-btn]")) { toggleCassetto(); return; }
    if (t.closest("[data-onda-cassetto-chiudi]")) { toggleCassetto(false); return; }

    var cardPlay = t.closest("[data-card-play]");
    if (cardPlay) {
      e.stopPropagation();
      var cid = cardPlay.dataset.cardPlay;
      var stPlay = perId[cid] ? calcolaStato(perId[cid]) : null;
      selezionaCanale(cid, { scorri: true, avvia: !!(stPlay && stPlay.riproducibile) });
      return;
    }

    var cardSel = t.closest("[data-card-seleziona]");
    if (cardSel) {
      var sid = cardSel.dataset.cardSeleziona;
      var stSel = perId[sid] ? calcolaStato(perId[sid]) : null;
      selezionaCanale(sid, { scorri: true, avvia: !!(stSel && stSel.riproducibile) });
      return;
    }

    var cardLoc = t.closest(".onda-locandina");
    if (cardLoc && !t.closest("button")) {
      var card = cardLoc.closest("[data-onda-card]");
      if (card) {
        var lid = card.dataset.id;
        var stLoc = perId[lid] ? calcolaStato(perId[lid]) : null;
        selezionaCanale(lid, { scorri: true, avvia: !!(stLoc && stLoc.riproducibile) });
      }
      return;
    }

    var filtro = t.closest("[data-onda-filtro]");
    if (filtro) { applicaFiltro(filtro.dataset.ondaFiltro); return; }

    var freccia = t.closest("[data-corsia-dir]");
    if (freccia) {
      var riga = freccia.closest("[data-onda-riga]");
      var corsia = riga && riga.querySelector("[data-onda-corsia]");
      if (corsia) {
        var step = Math.max(280, Math.round(corsia.clientWidth * 0.78));
        corsia.scrollBy({ left: +freccia.dataset.corsiaDir * step, behavior: "smooth" });
      }
      return;
    }

    if (t.closest("[data-onda-guarda]")) { apriLettore(); return; }
    if (t.closest("[data-stage-ics]")) { scaricaIcs(S.corrente); return; }
    if (t.closest("[data-onda-pp]")) { playPausaYT(); return; }
    var salto = t.closest("[data-onda-salto]");
    if (salto) { vaiA(S.pos + (+salto.dataset.ondaSalto)); return; }

    var vai = t.closest("[data-onda-vai]");
    if (vai) {
      var li = vai.closest("li");
      if (li && li.dataset.t) vaiA(+li.dataset.t);
      return;
    }

    if (t.closest("[data-stage-prec]") && ordineCanaliIds.length) {
      var curP = ordineCanaliIds.indexOf(S.corrente.id);
      var prevId = ordineCanaliIds[(curP - 1 + ordineCanaliIds.length) % ordineCanaliIds.length];
      selezionaCanale(prevId);
      return;
    }
    if (t.closest("[data-stage-succ]") && ordineCanaliIds.length) {
      var curN = ordineCanaliIds.indexOf(S.corrente.id);
      var nextId = ordineCanaliIds[(curN + 1) % ordineCanaliIds.length];
      selezionaCanale(nextId);
      return;
    }

    if (t.closest("[data-mini-torna]")) { scorriAlPalco(); return; }
    if (t.closest("[data-mini-chiudi]")) { chiudiLettore(); return; }

    if (t.closest("[data-onda-fs]")) { entraFullscreen(); return; }
    if (sovra) {
      if (t.closest("[data-sovra-prec]")) mostraVoce(sovra.i - 1);
      else if (t.closest("[data-sovra-succ]")) mostraVoce(sovra.i + 1);
      else if (t.closest("[data-sovra-nascondi]")) nascondiSovra(true);
      else if (t.closest("[data-sovra-mostra-btn]")) nascondiSovra(false);
      else if (t.closest("[data-sovra-esci]")) esciFullscreen();
    }
  });

  document.addEventListener("keydown", function (e) {
    var dove = e.target;
    if (dove && (dove.isContentEditable || /^(input|textarea|select)$/i.test(dove.tagName))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    if (sovra) {
      if (e.key === "ArrowRight") mostraVoce(sovra.i + 1);
      else if (e.key === "ArrowLeft") mostraVoce(sovra.i - 1);
      else if (e.key === "Escape" && sovra.finto) esciFullscreen();
      return;
    }

    if (e.key === "Escape" && cassetto && !cassetto.hidden) {
      toggleCassetto(false);
      if (cassettoBtn) cassettoBtn.focus();
      return;
    }

    var k = (e.key || "").toLowerCase();
    if (k === "k" && S.corrente && S.corrente.video && calcolaStato(S.corrente).riproducibile) { e.preventDefault(); playPausaYT(); }
    else if (k === "j" && S.corrente && S.corrente.video && S.frame) { e.preventDefault(); vaiA(S.pos - 15); }
    else if (k === "l" && S.corrente && S.corrente.video && S.frame) { e.preventDefault(); vaiA(S.pos + 15); }
    else if (k === "f" && S.frame) { e.preventDefault(); entraFullscreen(); }
  });

  /* ── Avvio: smista subito, pre-seleziona il primo canale disponibile ──── */
  smistaCorsie();
  setInterval(aggiornaTimerTutti, 1000);

  var hashId = (location.hash || "").replace(/^#/, "");
  var iniziale = (hashId && perId[hashId]) ? hashId : (ordineCanaliIds[0] || canali[0].id);
  selezionaCanale(iniziale, { forza: true, aggiornaHash: false });
})();
