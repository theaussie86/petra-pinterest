export { inngest } from './client'
export { scrapeBlog } from './functions/scrape-blog'
export { scrapeSingle } from './functions/scrape-single'
export { generateMetadataBulk } from './functions/generate-metadata'
export { refreshPinterestTokens } from './functions/refresh-pinterest-tokens'

import { scrapeBlog } from './functions/scrape-blog'
import { scrapeSingle } from './functions/scrape-single'
import { generateMetadataBulk } from './functions/generate-metadata'
import { refreshPinterestTokens } from './functions/refresh-pinterest-tokens'

export const functions = [
  scrapeBlog,
  scrapeSingle,
  generateMetadataBulk,
  refreshPinterestTokens,
]
