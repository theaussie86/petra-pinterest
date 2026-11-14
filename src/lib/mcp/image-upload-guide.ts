import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { MAX_BASE64_HINT, SUPPORTED_IMAGE_LIST } from './image-limits'

/** URI of the static image upload guide resource. */
export const IMAGE_UPLOAD_GUIDE_URI = 'pinfinity://guides/bild-upload'

/** Metadata paragraph of the guide while AI metadata is on (default). */
const METADATA_LINE_AI_ON =
  '- Pinfinity generiert dabei nie Metadaten mit Gemini. Die Texte schreibst du selbst. `generate_metadata` nur, wenn die Nutzerin ausdrücklich verlangt, dass Pinfinity die Metadaten mit KI erzeugt, und nie für Pins, deren Metadaten du gerade selbst geschrieben hast.'

/** Metadata paragraph of the guide while the account switched AI metadata off (ADR-0009). */
const METADATA_LINE_AI_OFF =
  '- KI-Metadaten sind für dieses Konto ausgeschaltet. Titel, Beschreibung und Alt-Text schreibst du selbst, eine automatische Generierung gibt es nicht.'

/**
 * The image upload guide for Connected Agents (German, decision tree). One
 * source: served as the MCP resource and by the `get_image_upload_guide` tool,
 * for clients that never read resources (ChatGPT). The metadata paragraph
 * follows the account's AI metadata setting (ADR-0009).
 */
export function imageUploadGuideMarkdown(aiMetadataEnabled = true): string {
  return `# Bilder für Pins hochladen

Bilder jeder Herkunft sind erwünscht: im Chat hochgeladen, in ChatGPT oder einem anderen Tool generiert, unter einer öffentlichen URL oder als lokale Datei.

## Welcher Weg?

1. Bild liegt im ChatGPT-Chat (hochgeladen oder dort erzeugt)
   -> \`create_pin_from_chat_image\`. Das Feld \`image_file\` füllt der Client selbst. Nie eine URL, einen Pfad oder eine ID erfinden.
2. Bild hat eine öffentliche HTTPS-URL
   -> \`create_pin\` mit \`image_url\`.
3. Agent mit Shell und Netz, Bild als lokale Datei
   -> \`request_pin_upload\` (liefert \`upload_url\` und \`upload_path\`), Bild per HTTP PUT mit passendem Content-Type hochladen, dann \`create_pin\` mit \`upload_path\`. Die Upload-URL gilt ca. 2 Stunden, ein \`upload_path\` reicht für genau einen Pin.
4. Agent, der Dateien programmatisch lesen kann, kleines Bild
   -> \`create_pin\` mit \`image_base64\` (auch als data:-URL), ${MAX_BASE64_HINT}. Base64 nie von Hand ausschreiben.

Pro \`create_pin\`-Aufruf genau eine Bildquelle angeben.

## Formate und Größen

- Erlaubt: ${SUPPORTED_IMAGE_LIST}.
- Bis ca. 20 MB pro Bild, per \`image_base64\` ${MAX_BASE64_HINT}.
- Der Bildtyp wird aus dem Inhalt geprüft. Andere Inhalte werden abgelehnt.

## Wenn die Chat-Datei nicht ankommt

Meldet \`create_pin_from_chat_image\`, dass der Client die Datei nicht übergeben hat (z. B. kam nur der Text "chat_upload" an), oder ist der Download-Link abgelaufen:

- Einmal erneut aufrufen, damit der Client einen frischen Link setzt.
- Hat das Bild eine öffentliche HTTPS-URL: \`create_pin\` mit \`image_url\`.
- Agent mit Shell und Netz: \`request_pin_upload\`, PUT, dann \`create_pin\` mit \`upload_path\`.
- Sonst die Nutzerin bitten, das Bild erneut in den Chat zu laden oder den Pin in der Pinfinity-Oberfläche anzulegen.

## Metadaten

- Titel, Beschreibung, Board (\`board_id\` und \`board_name\` aus \`list_boards\`), Alt-Text, Link und KI-Kennzeichnung sind optional.
- Sind Titel, Beschreibung und Board vollständig, wird der Pin planbar (Status \`metadata_created\`), sonst bleibt er \`draft\`. Nachreichen mit \`set_pin_metadata\`.
${aiMetadataEnabled ? METADATA_LINE_AI_ON : METADATA_LINE_AI_OFF}
`
}

/** The guide with the default (AI metadata on) wording. */
export const IMAGE_UPLOAD_GUIDE_MARKDOWN = imageUploadGuideMarkdown(true)

/** Short server instructions: points at the guide and carries the decision tree. */
const SERVER_INSTRUCTIONS_BASE = `Pins mit Bildern jeder Herkunft anlegen. Bildwege (Details: Ressource ${IMAGE_UPLOAD_GUIDE_URI} oder Tool get_image_upload_guide):
- Bild im ChatGPT-Chat (hochgeladen oder erzeugt): create_pin_from_chat_image, image_file füllt der Client, nie selbst eintragen.
- Öffentliche HTTPS-URL: create_pin mit image_url.
- Lokale Datei, Agent mit Shell: request_pin_upload, PUT, dann create_pin mit upload_path. Kleines Bild programmatisch: create_pin mit image_base64.`

const INSTRUCTIONS_METADATA_AI_ON = `Metadaten (Titel, Beschreibung, Alt-Text) schreibst du selbst und trägst sie mit create_pin oder set_pin_metadata ein. generate_metadata (KI-Generierung durch Pinfinity, Gemini) nur auf ausdrücklichen Wunsch der Nutzerin und nie für Pins, deren Metadaten du gerade selbst geschrieben hast.`

const INSTRUCTIONS_METADATA_AI_OFF = `Metadaten schreibst du selbst, eine automatische Generierung gibt es nicht: KI-Metadaten sind für dieses Konto ausgeschaltet. Titel, Beschreibung und Alt-Text trägst du mit create_pin, create_pin_from_chat_image oder set_pin_metadata ein.`

/** Server instructions for an account; the metadata part follows the AI metadata setting (ADR-0009). */
export function serverInstructions(aiMetadataEnabled = true): string {
  return `${SERVER_INSTRUCTIONS_BASE}
${aiMetadataEnabled ? INSTRUCTIONS_METADATA_AI_ON : INSTRUCTIONS_METADATA_AI_OFF}`
}

/** Server instructions with the default (AI metadata on) wording. */
export const SERVER_INSTRUCTIONS = serverInstructions(true)

/** Registers the guide as a static Markdown resource (adds the resources capability). */
export function registerImageUploadGuide(server: McpServer, aiMetadataEnabled = true): void {
  const text = imageUploadGuideMarkdown(aiMetadataEnabled)
  server.registerResource(
    'bild-upload',
    IMAGE_UPLOAD_GUIDE_URI,
    {
      title: 'Leitfaden: Bilder für Pins hochladen',
      description:
        'Welcher Weg für welches Bild: Chat-Bild, öffentliche URL, lokale Datei oder Base64. Mit Formaten, Größen und Fallbacks.',
      mimeType: 'text/markdown',
    },
    (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text }],
    }),
  )
}
