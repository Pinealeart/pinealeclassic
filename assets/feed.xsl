<?xml version="1.0" encoding="UTF-8"?>
<!-- Veste del feed RSS quando lo si apre nel browser (le app di lettura lo ignorano). -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:media="http://search.yahoo.com/mrss/">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template name="mese">
    <xsl:param name="m"/>
    <xsl:choose>
      <xsl:when test="$m='Jan'">gennaio</xsl:when><xsl:when test="$m='Feb'">febbraio</xsl:when><xsl:when test="$m='Mar'">marzo</xsl:when>
      <xsl:when test="$m='Apr'">aprile</xsl:when><xsl:when test="$m='May'">maggio</xsl:when><xsl:when test="$m='Jun'">giugno</xsl:when>
      <xsl:when test="$m='Jul'">luglio</xsl:when><xsl:when test="$m='Aug'">agosto</xsl:when><xsl:when test="$m='Sep'">settembre</xsl:when>
      <xsl:when test="$m='Oct'">ottobre</xsl:when><xsl:when test="$m='Nov'">novembre</xsl:when><xsl:otherwise>dicembre</xsl:otherwise>
    </xsl:choose>
  </xsl:template>
  <xsl:template match="/">
    <html lang="it">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <meta name="robots" content="noindex"/>
        <title>Feed RSS · <xsl:value-of select="rss/channel/title"/></title>
        <link rel="stylesheet" href="/assets/css/fonts.css"/>
        <style>
          :root { --bg: #fcfaf6; --raise: #f4efe7; --ink: #1a1418; --ink-2: #352e33; --ink-3: #6a6066; --accent: #b4472f; --gold: #7f5e22; --line: rgba(30, 26, 29, 0.10); }
          @media (prefers-color-scheme: dark) { :root { --bg: #14100f; --raise: #1f1917; --ink: #f3eae5; --ink-2: #d9cfca; --ink-3: #a99e99; --accent: #f2a08a; --gold: #e2bd6e; --line: rgba(243, 234, 229, 0.12); } }
          * { box-sizing: border-box; }
          body { margin: 0; background: var(--bg); color: var(--ink-2); font: 300 1rem/1.65 "DM Sans", -apple-system, sans-serif; padding: 0 16px 64px; }
          .pagina { max-width: 720px; margin: 0 auto; }
          .testata { padding: 40px 0 24px; border-bottom: 1px solid var(--line); }
          .marchio { font: 400 1.6rem/1 "Cormorant Garamond", Georgia, serif; color: var(--ink); text-decoration: none; }
          .marchio em { color: var(--gold); }
          h1 { margin: 18px 0 8px; font: 300 clamp(2rem, 6vw, 2.8rem)/1.05 "Cormorant Garamond", Georgia, serif; color: var(--ink); }
          .avviso { margin: 24px 0 8px; padding: 18px 20px; border-radius: 14px; background: var(--raise); }
          .avviso p { margin: 0; }
          .avviso a { color: var(--accent); }
          ol { list-style: none; margin: 24px 0 0; padding: 0; }
          li { padding: 20px 0; border-bottom: 1px solid var(--line); }
          .meta { font: 500 0.68rem/1 "DM Sans", sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); }
          .meta span { color: var(--accent); margin-right: 10px; }
          h2 { margin: 8px 0 6px; font: 400 1.45rem/1.2 "Cormorant Garamond", Georgia, serif; }
          h2 a { color: var(--ink); text-decoration: none; }
          h2 a:hover { color: var(--accent); }
          li p { margin: 0; font-size: 0.95rem; }
        </style>
      </head>
      <body>
        <div class="pagina">
          <header class="testata">
            <a class="marchio" href="/">Pineale <em>Classic</em></a>
            <h1>Feed RSS</h1>
            <div class="avviso"><p>Questa pagina è il feed degli articoli: serve alle app di lettura (Feedly, Inoreader, NetNewsWire…). Copia l'indirizzo che vedi nella barra del browser e incollalo nella tua app, oppure leggi <a href="/rss/">come seguire Pineale Classic con RSS</a>.</p></div>
          </header>
          <ol>
            <xsl:for-each select="rss/channel/item">
              <li>
                <p class="meta">
                  <xsl:if test="category"><span><xsl:value-of select="category"/></span></xsl:if>
                  <xsl:value-of select="number(substring(pubDate, 6, 2))"/><xsl:text> </xsl:text>
                  <xsl:call-template name="mese"><xsl:with-param name="m" select="substring(pubDate, 9, 3)"/></xsl:call-template><xsl:text> </xsl:text>
                  <xsl:value-of select="substring(pubDate, 13, 4)"/>
                </p>
                <h2><a href="{link}"><xsl:value-of select="title"/></a></h2>
                <p><xsl:value-of select="description"/></p>
              </li>
            </xsl:for-each>
          </ol>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
