/**
 * Realistic article pages for the Readability extraction tests
 * (`supabase/functions/_shared/extract-article.test.ts`, ADR-0008).
 */

const PARAGRAPH_1 =
  'Wer abends nicht abschalten kann, liegt oft stundenlang wach. In diesem Artikel zeige ich dir, welche einfachen Rituale mir geholfen haben, schneller einzuschlafen und morgens wirklich erholt aufzuwachen. Keine teuren Gadgets, nur ein paar Gewohnheiten, die du heute Abend schon ausprobieren kannst.'
const PARAGRAPH_2 =
  'Der wichtigste Hebel ist ein fester Rhythmus. Wenn du jeden Tag zur gleichen Zeit ins Bett gehst und aufstehst, lernt dein Körper, wann er müde werden soll. Das klingt banal, ist aber der Punkt, an dem die meisten scheitern, weil das Wochenende den Rhythmus wieder durcheinanderbringt.'
const PARAGRAPH_3 =
  'Licht spielt eine größere Rolle, als viele denken. Helles, blaues Licht am Abend signalisiert deinem Gehirn, dass noch Tag ist. Dimme deshalb eine Stunde vor dem Schlafengehen das Licht und leg das Handy weg, oder nutze zumindest den Nachtmodus.'

/** WordPress-style post: header nav, sidebar, footer, cookie banner, Yoast JSON-LD and meta date. */
export const WORDPRESS_ARTICLE_WITH_META_DATE = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>5 Abendrituale für besseren Schlaf - Schlafgut Blog</title>
  <meta property="og:title" content="5 Abendrituale für besseren Schlaf - Schlafgut Blog">
  <meta property="article:published_time" content="2025-03-04T08:15:00+00:00">
  <meta property="article:modified_time" content="2025-06-01T10:00:00+00:00">
  <link rel="stylesheet" href="/wp-content/themes/astra/style.css">
  <style>.cookie-banner{position:fixed}</style>
  <script>window.dataLayer = window.dataLayer || [];</script>
</head>
<body class="post-template-default single single-post">
  <div id="cookie-banner" class="cookie-banner cmplz-cookiebanner">
    <p>Wir verwenden Cookies, um unsere Website und unseren Service zu optimieren.</p>
    <button>Alle akzeptieren</button><button>Ablehnen</button>
  </div>
  <header class="site-header">
    <div class="site-branding"><a href="/">Schlafgut Blog</a></div>
    <nav class="main-navigation">
      <ul>
        <li><a href="/">Startseite</a></li>
        <li><a href="/kategorie/schlaf/">Schlaf</a></li>
        <li><a href="/kategorie/entspannung/">Entspannung</a></li>
        <li><a href="/ueber-mich/">Über mich</a></li>
        <li><a href="/kontakt/">Kontakt</a></li>
      </ul>
    </nav>
  </header>
  <div id="content" class="site-content">
    <main id="primary" class="site-main">
      <article id="post-123" class="post-123 post type-post status-publish">
        <header class="entry-header">
          <h1 class="entry-title">5 Abendrituale für besseren Schlaf</h1>
          <div class="entry-meta">Von Petra · 4. März 2025</div>
        </header>
        <div class="entry-content">
          <p>${PARAGRAPH_1}</p>
          <h2>1. Ein fester Rhythmus</h2>
          <p>${PARAGRAPH_2} Mehr dazu im <a href="/schlafrhythmus-finden/">Artikel über den Schlafrhythmus</a>.</p>
          <figure class="wp-block-image"><img src="/wp-content/uploads/schlaf.jpg" alt="Schlafzimmer"><figcaption>Ein ruhiges Schlafzimmer</figcaption></figure>
          <h2>2. Weniger Licht am Abend</h2>
          <p>${PARAGRAPH_3}</p>
          <h3>Was konkret hilft</h3>
          <ul>
            <li><strong>Warmes Licht</strong> ab 20 Uhr</li>
            <li>Handy in einem <em>anderen</em> Raum laden</li>
            <li>Eine Seite in einem Buch lesen</li>
          </ul>
          <ol>
            <li>Licht dimmen</li>
            <li>Tee kochen</li>
          </ol>
        </div>
        <footer class="entry-footer"><span class="cat-links">Kategorie: <a href="/kategorie/schlaf/">Schlaf</a></span></footer>
      </article>
      <section class="related-posts">
        <h2>Das könnte dich auch interessieren</h2>
        <ul><li><a href="/a/">Artikel A</a></li><li><a href="/b/">Artikel B</a></li></ul>
      </section>
    </main>
    <aside id="secondary" class="widget-area sidebar">
      <section class="widget widget_search"><form><input type="search" placeholder="Suchen"><button>Suchen</button></form></section>
      <section class="widget widget_recent_entries">
        <h2 class="widget-title">Neueste Beiträge</h2>
        <ul><li><a href="/x/">Beitrag X</a></li><li><a href="/y/">Beitrag Y</a></li><li><a href="/z/">Beitrag Z</a></li></ul>
      </section>
      <section class="widget widget_newsletter"><h2>Newsletter</h2><p>Trag dich ein und erhalte jede Woche neue Tipps.</p></section>
    </aside>
  </div>
  <footer class="site-footer">
    <p>© 2025 Schlafgut Blog</p>
    <nav><a href="/impressum/">Impressum</a> · <a href="/datenschutz/">Datenschutz</a></nav>
  </footer>
  <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Schlafgut Blog"},{"@type":"Article","headline":"5 Abendrituale für besseren Schlaf","datePublished":"2025-03-04T08:15:00+00:00"}]}</script>
  <script src="/wp-includes/js/jquery.min.js"></script>
</body>
</html>`

/** Same kind of post, but the date only lives in Yoast-style JSON-LD (`@graph`). */
export const ARTICLE_WITH_JSON_LD_DATE_ONLY = `<!DOCTYPE html>
<html lang="de">
<head>
  <title>Tee-Rezepte zum Einschlafen | Schlafgut</title>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"Organization","name":"Schlafgut"},
      {"@type":"BlogPosting","headline":"Tee-Rezepte zum Einschlafen","datePublished":"2024-11-20T06:00:00+01:00","author":{"@type":"Person","name":"Petra"}}
    ]}
  </script>
</head>
<body>
  <nav><a href="/">Home</a> <a href="/blog/">Blog</a></nav>
  <main>
    <article>
      <h1>Tee-Rezepte zum Einschlafen</h1>
      <p>${PARAGRAPH_1}</p>
      <h2>Lavendel und Melisse</h2>
      <p>${PARAGRAPH_2}</p>
      <p>${PARAGRAPH_3}</p>
    </article>
  </main>
  <footer>© Schlafgut</footer>
</body>
</html>`

/** Date only in a `<time datetime>` element. */
export const ARTICLE_WITH_TIME_ELEMENT_ONLY = `<!DOCTYPE html>
<html lang="de">
<head><title>Mittagsschlaf richtig machen</title></head>
<body>
  <article>
    <h1>Mittagsschlaf richtig machen</h1>
    <p class="meta">Veröffentlicht am <time datetime="2023-07-09">9. Juli 2023</time></p>
    <p>${PARAGRAPH_1}</p>
    <p>${PARAGRAPH_2}</p>
    <p>${PARAGRAPH_3}</p>
  </article>
</body>
</html>`

/** A category/listing page: navigation, teasers and links, but no article body. */
export const PAGE_WITHOUT_ARTICLE = `<!DOCTYPE html>
<html lang="de">
<head><title>Kategorie: Schlaf - Schlafgut Blog</title></head>
<body>
  <header><nav><a href="/">Startseite</a> <a href="/kontakt/">Kontakt</a></nav></header>
  <main>
    <h1>Kategorie: Schlaf</h1>
    <ul>
      <li><a href="/a/">Artikel A</a></li>
      <li><a href="/b/">Artikel B</a></li>
      <li><a href="/c/">Artikel C</a></li>
    </ul>
  </main>
  <footer><a href="/impressum/">Impressum</a></footer>
</body>
</html>`
