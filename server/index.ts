import { config } from 'dotenv'
config({ path: '.env.local' })

import { app } from './app'

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Scraping server running on http://localhost:${PORT}`)
  console.log(`Inngest endpoint: http://localhost:${PORT}/api/inngest`)
})
