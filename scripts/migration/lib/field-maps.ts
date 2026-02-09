/**
 * Field Mapping Constants
 * Maps Airtable field names and values to Supabase schema
 */

/**
 * Article status mapping: Airtable German -> Supabase
 * Most Airtable statuses map to active (not archived) state.
 * Archived status is determined by archived_at timestamp, not status field.
 */
export const ARTICLE_STATUS_MAP: Record<string, string | null> = {
  'Content gescannt': null, // active (no archived_at)
  'Blogartikel abrufen': null, // active (in-progress scrape state)
  Neu: null, // active (newly discovered)
  Fehler: null, // active but with error (store error in separate handling)
}

/**
 * Pin status mapping: Airtable German -> Supabase English
 * Maps from German workflow statuses in Airtable to English status enum in Supabase.
 * Includes both with and without umlauts to handle data inconsistencies.
 */
export const PIN_STATUS_MAP: Record<string, string> = {
  Entwurf: 'entwurf',
  'Bereit fur Generierung': 'bereit_fuer_generierung', // without umlaut
  'Bereit für Generierung': 'bereit_fuer_generierung', // with umlaut
  'Pin generieren': 'entwurf', // removed status, fallback to draft
  'Pin wird generiert': 'entwurf', // removed status, fallback to draft
  'Pin generiert': 'entwurf', // removed status, fallback to draft
  'Metadaten generieren': 'metadaten_generieren',
  'Metadaten werden generiert': 'metadaten_werden_generiert',
  'Metadaten erstellt': 'metadaten_erstellt',
  'Bereit zum Planen/Veröffentlichen': 'bereit_zum_planen',
  Veröffentlicht: 'veroeffentlicht',
  Fehler: 'fehler',
  Löschen: 'loeschen', // with umlaut
  Loschen: 'loeschen', // without umlaut
}

/**
 * Blog project branding field mapping: Airtable field name -> Supabase column
 * Maps German field names from Airtable to English column names in Supabase.
 * Includes variants with and without umlauts to handle data inconsistencies.
 */
export const PROJECT_BRANDING_MAP: Record<string, string> = {
  Zielgruppe: 'target_audience',
  'Tonalitat / Markenstimme': 'brand_voice', // without umlaut
  'Tonalität / Markenstimme': 'brand_voice', // with umlaut
  'Visueller Stil / Bildsprache': 'visual_style',
  'Allgemeine Keywords / Nische': 'general_keywords',
  Sprache: 'language',
  Wertversprechen: 'value_proposition',
  'Stil Optionen': 'style_options',
  'Content Typ': 'content_type',
  'Hauptmotive Beispiele': 'main_motifs',
  'Farbpalette Beschreibung': 'color_palette',
  'Spezielle Text Anweisungen': 'text_instructions',
  'Blog Nische': 'blog_niche',
  'Zusatzliche Anweisungen': 'additional_instructions', // without umlaut
  'Zusätzliche Anweisungen': 'additional_instructions', // with umlaut
  'Themen Kontext': 'topic_context',
  'Visuelle Zielgruppe': 'visual_audience',
  'Licht Beschreibung': 'lighting_description',
}
