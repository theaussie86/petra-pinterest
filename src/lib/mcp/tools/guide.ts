import { IMAGE_UPLOAD_GUIDE_MARKDOWN } from '../image-upload-guide'
import { defineTool } from '../tool'

/**
 * `get_image_upload_guide` — the image upload guide as a tool result, for
 * clients that list tools but never read MCP resources (ChatGPT). Same text as
 * the resource `pinfinity://guides/bild-upload`.
 */
export const getImageUploadGuideTool = defineTool({
  name: 'get_image_upload_guide',
  description:
    'Liefert den Leitfaden zum Bild-Upload: welcher Weg für welches Bild (Chat-Bild, öffentliche URL, lokale Datei, Base64), erlaubte Formate und Größen, was tun, wenn die Chat-Datei nicht ankommt. Vor dem ersten Pin mit Bild oder nach einem Bildfehler aufrufen.',
  handler: () => ({ content: [{ type: 'text', text: IMAGE_UPLOAD_GUIDE_MARKDOWN }] }),
})
