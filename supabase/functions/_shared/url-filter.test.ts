import { isNonArticleUrl } from './url-filter.ts'

describe('isNonArticleUrl()', () => {
  it.each([
    'https://himmelstraenen.de/impressum',
    'https://himmelstraenen.de/datenschutz/',
    'https://frauenpowervital.de/privacy-policy',
    'https://onlineheldinnen.de/agb',
    'https://onlineheldinnen.de/widerruf',
    'https://shop.example/widerrufsbelehrung',
    'https://himmelstraenen.de/newsletter-bestaetigt',
    'https://shop.example/warenkorb',
    'https://shop.example/mein-konto/',
    'https://shop.example/cookie-richtlinie-eu',
    'https://blog.example/kontakt',
    'https://blog.example/de/impressum',
    'https://blog.example/Impressum',
    'https://blog.example/datenschutzerkl%C3%A4rung',
  ])('skips the legal or utility page %s', (url) => {
    expect(isNonArticleUrl(url)).toBe(true)
  })

  it.each([
    'https://himmelstraenen.de/badesalz-selber-machen',
    'https://onlineheldinnen.de/ki-avatar-instagram',
    // Article slugs that merely contain a legal word
    'https://blog.example/newsletter-tipps-fuer-anfaenger',
    'https://blog.example/datenschutz-fuer-blogger-erklaert',
    'https://blog.example/kontakt-zu-lesern-aufbauen',
    // Taxonomy and product pages stay in: some pins link to them
    'https://himmelstraenen.de/tag/geschenkideen',
    'https://frauenpowervital.de/category/gesunde-ernaehrung',
    'https://herzundseelensteine.de/produkt-kategorie/geschenke-fuer',
    'https://shop.example/products/kerze',
    // Deeper paths are never treated as legal pages
    'https://blog.example/2024/05/impressum',
    // Root and unparsable input
    'https://blog.example/',
    'not a url',
  ])('keeps %s', (url) => {
    expect(isNonArticleUrl(url)).toBe(false)
  })
})
