import { SUPPORTED_IMAGE_TYPES } from '@/lib/api/pins'

/** Roughly 20 MB — the upper bound on an image the pin tools accept. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/**
 * The inline `image_base64` input of `create_pin`. The MCP transport caps a
 * request at 4 MiB (Vercel at 4.5 MB), so base64 (≈ +33 %) fits images up to
 * roughly 3 MB.
 */
export const MAX_BASE64_HINT = 'bis ca. 3 MB'

/** The supported image types as a list for tool and guide texts. */
export const SUPPORTED_IMAGE_LIST = SUPPORTED_IMAGE_TYPES.join(', ')
