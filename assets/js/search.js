/**
 * search.js — Ricerca client-side con lunr.js
 * - Carica search-index.json
 * - Crea indice lunr
 * - Gestisce input e visualizza risultati
 * - Supporta fuzzy search (~1)
 */

(function () {
  "use strict";

  // ════════════════════════════════════════════════════════════════════════
  // ELEMENTS
  // ════════════════════════════════════════════════════════════════════════

  var searchInput = document.getElementById("pc-search-input");
  var searchResult = document.getElementById("pc-search-results");

  if (!searchInput || !searchResult) {
    return; // Page is not search page
  }

  // ════════════════════════════════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════════════════════════════════

  var idx = null;
  var documents = [];
  var debounceTimer = null;

  // ════════════════════════════════════════════════════════════════════════
  // LOAD INDEX
  // ════════════════════════════════════════════════════════════════════════

  fetch("/search-index.json")
    .then(function (response) {
      if (!response.ok) throw new Error("Failed to fetch search index");
      return response.json();
    })
    .then(function (data) {
      documents = data;

      // Build lunr index
      idx = lunr(function () {
        this.ref("id");
        this.field("title", { boost: 10 });
        this.field("excerpt", { boost: 5 });
        this.field("category", { boost: 3 });
        this.field("body");

        // Add documents to index
        data.forEach(
          function (doc) {
            this.add(doc);
          },
          this
        );
      });
    })
    .catch(function (err) {
      console.warn("Failed to load search index:", err);
      searchResult.innerHTML =
        '<p class="empty">Errore nel caricamento della ricerca.</p>';
    });

  // ════════════════════════════════════════════════════════════════════════
  // SEARCH HANDLER
  // ════════════════════════════════════════════════════════════════════════

  function performSearch(query) {
    if (!idx) return;

    if (!query || query.length < 2) {
      searchResult.innerHTML = "";
      return;
    }

    var results;
    try {
      // Fuzzy search (~1 means up to 1 character difference)
      results = idx.search(query + "~1");
    } catch (e) {
      // Fallback: exact search if fuzzy fails
      try {
        results = idx.search(query);
      } catch (e2) {
        results = [];
      }
    }

    // ────────────────────────────────────────────────────────────────────
    // RENDER RESULTS
    // ────────────────────────────────────────────────────────────────────

    if (!results.length) {
      searchResult.innerHTML =
        '<p class="empty">Nessun risultato per «' +
        escapeHtml(query) +
        "».</p>";
      return;
    }

    var html = '<ol class="press">';

    results.slice(0, 15).forEach(function (result) {
      var doc = documents.find(function (d) {
        return d.id === parseInt(result.ref, 10);
      });

      if (!doc) return;

      html +=
        '<li class="press-item"><a href="' + escapeHtml(doc.url) + '">' +
        '<span class="press-src">' + escapeHtml(doc.category) + "</span>" +
        '<span class="press-title">' + escapeHtml(doc.title) + "</span>" +
        '<span class="search-excerpt">' + escapeHtml(doc.excerpt.substring(0, 160)) +
        (doc.excerpt.length > 160 ? "…" : "") + "</span>" +
        "</a></li>";
    });

    html += "</ol>";
    searchResult.innerHTML = html;
  }

  // ════════════════════════════════════════════════════════════════════════
  // INPUT EVENT WITH DEBOUNCE
  // ════════════════════════════════════════════════════════════════════════

  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    var q = this.value.trim();

    debounceTimer = setTimeout(function () {
      performSearch(q);
    }, 250);
  });

  // ════════════════════════════════════════════════════════════════════════
  // READ QUERY PARAMETER (?q=)
  // ════════════════════════════════════════════════════════════════════════

  var params = new URLSearchParams(window.location.search);
  var qParam = params.get("q");
  if (qParam) {
    searchInput.value = qParam;
    // Wait for index to load
    var checkInterval = setInterval(function () {
      if (idx) {
        clearInterval(checkInterval);
        performSearch(qParam);
      }
    }, 100);
  }

  // ════════════════════════════════════════════════════════════════════════
  // UTILITY: Escape HTML
  // ════════════════════════════════════════════════════════════════════════

  function escapeHtml(text) {
    if (!text) return "";
    var map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, function (m) {
      return map[m];
    });
  }
})();
