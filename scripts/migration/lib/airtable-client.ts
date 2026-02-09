/**
 * Airtable API Client
 * Fetches records from Airtable with pagination and rate limiting
 * Used for Airtable-to-Supabase data migration
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const AIRTABLE_PAT = process.env.AIRTABLE_PAT
const BASE_ID = 'appWR3q78rre27F5q'
const API_URL = `https://api.airtable.com/v0/${BASE_ID}`

// Airtable table IDs
export const TABLES = {
  BLOG_PROJEKTE: 'tblZkW6ektjSmNOMG',
  BLOG_ARTIKEL: 'tblBNlgON5h27AHfn',
  PINS: 'tblW9Qu3B4zzDtr8V',
  BOARDS: 'tblhrv8QYrWYrFpis',
} as const

export interface AirtableRecord {
  id: string
  fields: Record<string, any>
  createdTime: string
}

interface AirtableResponse {
  records: AirtableRecord[]
  offset?: string
}

/**
 * Fetch all records from an Airtable table with pagination and rate limiting
 * @param tableId - Airtable table ID (use TABLES constants)
 * @returns Array of all records from the table
 */
export async function fetchAllRecords(tableId: string): Promise<AirtableRecord[]> {
  if (!AIRTABLE_PAT) {
    throw new Error('AIRTABLE_PAT environment variable is not set')
  }

  const allRecords: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = offset
      ? `${API_URL}/${tableId}?offset=${offset}`
      : `${API_URL}/${tableId}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_PAT}`,
      },
    })

    if (!response.ok) {
      throw new Error(
        `Airtable API error: ${response.status} ${response.statusText}`
      )
    }

    const data: AirtableResponse = await response.json()
    allRecords.push(...data.records)
    offset = data.offset

    // Rate limiting: 100ms delay between requests (Airtable allows 5 req/sec)
    if (offset) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  } while (offset)

  return allRecords
}
