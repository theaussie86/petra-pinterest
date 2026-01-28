export { inngest } from './client'
export { scrapeBlog } from './functions/scrape-blog'
export { scrapeSingle } from './functions/scrape-single'

import { scrapeBlog } from './functions/scrape-blog'
import { scrapeSingle } from './functions/scrape-single'

export const functions = [scrapeBlog, scrapeSingle]
