/**
 * Sitemap URLs that are never blog articles: legal and utility pages such as
 * Impressum, AGB, Datenschutz, Widerruf, Kontakt, Warenkorb or a newsletter
 * confirmation page.
 *
 * They matter because many sites stamp these pages with the build time as
 * `lastmod`, so the diff treats them as "updated" on every scan. Readability
 * finds no article in them, every attempt fails and each failure ends in an
 * error mail - several per project and day.
 *
 * Deliberately narrow: only the last path segment is matched, and only for
 * paths with at most two segments (`/impressum`, `/de/impressum`). Taxonomy
 * pages (`/tag/...`, `/category/...`, `/produkt-kategorie/...`) stay in, since
 * some pins link to them.
 */
import { normalizeUrl } from './url.ts'

const NON_ARTICLE_SLUG = new RegExp(
  '^(' +
    [
      'impressum',
      'imprint',
      'datenschutz(erklaerung|erklarung|erklärung|hinweise?|-?einstellungen)?',
      'privacy(-policy|-notice)?',
      'agb',
      'terms(-of-service|-of-use|-and-conditions)?',
      'nutzungsbedingungen',
      'widerruf(srecht|sbelehrung|sformular)?',
      'cookie(s|-policy|-richtlinie|-richtlinie-eu|-einstellungen)?',
      'disclaimer',
      'haftungsausschluss',
      'rechtliches',
      'legal(-notice)?',
      'barrierefreiheit(serklaerung)?',
      'accessibility',
      'kontakt',
      'contact',
      'warenkorb',
      'cart',
      'checkout',
      'kasse',
      'mein-konto',
      'my-account',
      'versand(kosten|-und-zahlung|informationen)?',
      'zahlungsarten',
      'newsletter-(bestaetigt|bestaetigung|anmeldung|abmeldung|danke)',
      'danke',
      'thank-you',
    ].join('|') +
    ')$',
  'i',
)

/** True when the URL is a legal or utility page that never holds an article. */
export function isNonArticleUrl(url: string): boolean {
  let path: string
  try {
    path = new URL(normalizeUrl(url)).pathname
  } catch {
    return false
  }
  const segments = path.split('/').filter(Boolean).map((s) => safeDecode(s))
  if (segments.length === 0 || segments.length > 2) return false
  return NON_ARTICLE_SLUG.test(segments[segments.length - 1])
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}
