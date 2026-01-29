# Phase 5: AI Metadata & Publishing - Research

**Researched:** 2026-01-29
**Domain:** AI-powered metadata generation (OpenAI Chat Completions with vision), scheduling UX (date/time pickers), async workflow orchestration (Inngest)
**Confidence:** HIGH

## Summary

Phase 5 implements AI-powered pin metadata generation and scheduling infrastructure. The research validates three core technical domains: (1) OpenAI's multimodal Chat Completions API for generating SEO-optimized Pinterest metadata from article content and pin images, (2) shadcn/ui date/time pickers built on react-day-picker for scheduling interface, and (3) Inngest's step-based workflow pattern for bulk metadata generation with fault-tolerant error handling.

The standard stack leverages existing project infrastructure: OpenAI Node.js SDK for AI integration, TanStack Start server functions (`createServerFn`) for authenticated API calls, Inngest for durable background jobs (already used in Phase 3 blog scraping), and shadcn/ui components for consistent UI patterns. Pinterest SEO research confirms metadata best practices: titles under 100 characters leading with outcome/keywords, descriptions optimized for the first 50-character preview with call-to-action, and alt text as a ranking factor in Pinterest's 2026 algorithm.

The key technical challenge is multimodal vision input — passing both article text and pin images to GPT-4o for context-aware metadata generation. The OpenAI Node SDK supports this via content arrays with `type: "text"` and `type: "image_url"` objects in chat messages. Generation history storage enables regeneration with feedback, creating a refinement loop: user provides feedback text → new generation incorporates feedback → system keeps last 3 generations for comparison.

**Primary recommendation:** Use OpenAI GPT-4o via the Node.js SDK with vision-enabled multimodal inputs, build on the established Inngest pattern from Phase 3 for bulk operations, and implement shadcn/ui date/time pickers with preset quick-pick times for intuitive scheduling UX.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| openai | 6.1.0+ | OpenAI API client | Official OpenAI Node.js SDK, supports vision via Chat Completions, TypeScript-first, v6+ has stable multimodal API |
| inngest | 3.49.3 (installed) | Background job orchestration | Already used in Phase 3 for blog scraping, durable execution with step-level retries, event-driven architecture |
| react-day-picker | 9.x | Calendar component | Powers shadcn/ui date picker, controlled mode for React state, date-fns integration, TypeScript support |
| date-fns | 4.x+ | Date manipulation | Used by react-day-picker, modern ESM-first replacement for moment.js, tree-shakeable |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.3.6 (installed) | Schema validation | Validate server function inputs, OpenAI response structure parsing |
| @supabase/supabase-js | 2.49.0 (installed) | Database access | Read article content, store metadata, update pin status |
| @tanstack/react-start | 1.157.16 (installed) | Server functions | Authenticated API calls via `createServerFn`, cookie-based auth |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenAI Chat Completions | Anthropic Claude 3.5 Sonnet with vision | Claude has excellent vision capabilities, but OpenAI has better Pinterest-optimized prompt ecosystem and existing n8n workflow uses OpenAI |
| Inngest | BullMQ + Redis | BullMQ offers more control but requires Redis infrastructure; Inngest provides cloud orchestration with zero infrastructure setup |
| react-day-picker | react-datepicker | react-datepicker is popular but react-day-picker is what shadcn/ui uses, maintaining component consistency |

**Installation:**
```bash
npm install openai date-fns
# inngest, zod, @supabase/supabase-js, @tanstack/react-start already installed
# react-day-picker installed via shadcn calendar component
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── api/
│   │   └── metadata.ts           # Client-side API calls to server functions
│   ├── server/
│   │   └── metadata.ts           # Server functions (createServerFn) for AI generation
│   └── openai/
│       ├── client.ts             # OpenAI client singleton
│       └── prompts.ts            # System prompts for Pinterest SEO metadata
├── components/
│   ├── pins/
│   │   ├── GenerateMetadataButton.tsx        # Single pin generation trigger
│   │   ├── MetadataHistoryDialog.tsx         # Browse/compare previous generations
│   │   ├── RegenerateWithFeedbackDialog.tsx  # Feedback input for refinement
│   │   └── SchedulePinSection.tsx            # Date/time picker + bulk scheduling
│   └── ui/
│       ├── calendar.tsx          # shadcn/ui calendar (react-day-picker wrapper)
│       └── time-picker.tsx       # Custom time input with presets
server/
├── inngest/
│   ├── functions/
│   │   ├── generate-metadata.ts  # Bulk metadata generation pipeline
│   │   └── generate-single.ts    # Single pin metadata generation
│   └── index.ts                  # Register new functions
supabase/
└── migrations/
    └── 00006_metadata_generation.sql  # alt_text column, generation history table
```

### Pattern 1: OpenAI Vision Multimodal Input
**What:** Pass both article text and pin image to GPT-4o for context-aware metadata generation
**When to use:** Generating title, description, and alt_text for a pin
**Example:**
```typescript
// Source: https://platform.openai.com/docs/guides/images-vision
// Verified via Context7 /openai/openai-node

import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function generatePinMetadata(
  articleTitle: string,
  articleContent: string,
  pinImageUrl: string
): Promise<{ title: string; description: string; alt_text: string }> {
  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: PINTEREST_SEO_SYSTEM_PROMPT, // Imported from prompts.ts
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Article Title: ${articleTitle}\n\nArticle Content: ${articleContent.slice(0, 4000)}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: pinImageUrl,
            },
          },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.7,
  })

  const response = completion.choices[0].message.content
  // Parse structured JSON response (title, description, alt_text)
  return JSON.parse(response)
}
```

### Pattern 2: Inngest Bulk Metadata Generation Pipeline
**What:** Process multiple pins sequentially with fault-tolerant step execution
**When to use:** User selects multiple pins and triggers "Generate Metadata" bulk action
**Example:**
```typescript
// Source: https://www.inngest.com/docs/features/inngest-functions/steps-workflows
// Based on existing Phase 3 scrape-blog.ts pattern

import { inngest } from '../client'
import { createClient } from '@supabase/supabase-js'
import { generatePinMetadata } from '../../lib/openai/client'

export const generateMetadataBulk = inngest.createFunction(
  { id: 'generate-metadata-bulk' },
  { event: 'pin/metadata.bulk-requested' },
  async ({ event, step }) => {
    const { pin_ids, tenant_id } = event.data

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const results = []

    // Process each pin sequentially with independent retry per pin
    for (const pin_id of pin_ids) {
      const result = await step.run(`generate-metadata-${pin_id}`, async () => {
        // 1. Fetch pin + article data
        const { data: pin } = await supabase
          .from('pins')
          .select('*, blog_articles(*)')
          .eq('id', pin_id)
          .single()

        if (!pin) throw new Error(`Pin ${pin_id} not found`)

        // 2. Generate metadata via OpenAI
        const pinImageUrl = getPinImageUrl(pin.image_path)
        const metadata = await generatePinMetadata(
          pin.blog_articles.title,
          pin.blog_articles.content,
          pinImageUrl
        )

        // 3. Store generation in history table
        await supabase.from('pin_metadata_generations').insert({
          pin_id,
          tenant_id,
          title: metadata.title,
          description: metadata.description,
          alt_text: metadata.alt_text,
          feedback: null, // First generation has no feedback
        })

        // 4. Update pin with generated values
        await supabase
          .from('pins')
          .update({
            title: metadata.title,
            description: metadata.description,
            alt_text: metadata.alt_text,
            status: 'metadaten_erstellt',
          })
          .eq('id', pin_id)

        return { pin_id, success: true }
      })

      results.push(result)
    }

    return {
      success: true,
      pins_processed: results.length,
      pins_succeeded: results.filter((r) => r.success).length,
    }
  }
)
```

### Pattern 3: Server Function with Cookie-Based Auth
**What:** TanStack Start server function for authenticated OpenAI API calls
**When to use:** Single pin metadata generation (synchronous user action)
**Example:**
```typescript
// Source: https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
// Based on existing src/lib/server/scraping.ts pattern

import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from './supabase'
import { generatePinMetadata } from '../openai/client'

export const generateMetadataSingleFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { pin_id: string; feedback?: string }) => data)
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Not authenticated')

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (!profile) throw new Error('Profile not found')

    // Fetch pin + article
    const { data: pin } = await supabase
      .from('pins')
      .select('*, blog_articles(*)')
      .eq('id', data.pin_id)
      .single()

    if (!pin) throw new Error('Pin not found')

    // Generate metadata
    const pinImageUrl = getPinImageUrl(pin.image_path)
    const systemPrompt = data.feedback
      ? `${PINTEREST_SEO_SYSTEM_PROMPT}\n\nUser feedback: ${data.feedback}`
      : PINTEREST_SEO_SYSTEM_PROMPT

    const metadata = await generatePinMetadata(
      pin.blog_articles.title,
      pin.blog_articles.content,
      pinImageUrl,
      systemPrompt
    )

    // Store generation in history
    await supabase.from('pin_metadata_generations').insert({
      pin_id: data.pin_id,
      tenant_id: profile.tenant_id,
      title: metadata.title,
      description: metadata.description,
      alt_text: metadata.alt_text,
      feedback: data.feedback || null,
    })

    // Update pin
    await supabase
      .from('pins')
      .update({
        title: metadata.title,
        description: metadata.description,
        alt_text: metadata.alt_text,
        status: 'metadaten_erstellt',
      })
      .eq('id', data.pin_id)

    return { success: true, metadata }
  })
```

### Pattern 4: shadcn/ui Date/Time Picker with Presets
**What:** Combined date picker (react-day-picker) + time input with preset quick-pick slots
**When to use:** Scheduling a pin to a specific date and time
**Example:**
```typescript
// Source: https://ui.shadcn.com/docs/components/date-picker
// Combined with custom time picker pattern

import { useState } from 'react'
import { format } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { CalendarIcon } from 'lucide-react'

const PRESET_TIMES = [
  { label: '6:00 AM', value: '06:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:00 PM', value: '12:00' },
  { label: '3:00 PM', value: '15:00' },
  { label: '6:00 PM', value: '18:00' },
  { label: '9:00 PM', value: '21:00' },
]

function SchedulePinSection({ pinId }: { pinId: string }) {
  const [date, setDate] = useState<Date>()
  const [time, setTime] = useState<string>('')

  const handleSchedule = async () => {
    if (!date || !time) return
    const [hours, minutes] = time.split(':')
    const scheduledAt = new Date(date)
    scheduledAt.setHours(parseInt(hours), parseInt(minutes))

    await updatePin({
      id: pinId,
      scheduled_at: scheduledAt.toISOString(),
      status: 'bereit_zum_planen',
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label>Schedule Date</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <CalendarIcon />
              {date ? format(date, 'PPP') : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={date} onSelect={setDate} />
          </PopoverContent>
        </Popover>
      </div>

      <div>
        <label>Schedule Time</label>
        <div className="flex gap-2">
          {PRESET_TIMES.map((preset) => (
            <Button
              key={preset.value}
              variant={time === preset.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTime(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="border rounded px-2"
          />
        </div>
      </div>

      <Button onClick={handleSchedule} disabled={!date || !time}>
        Schedule Pin
      </Button>
    </div>
  )
}
```

### Anti-Patterns to Avoid
- **Calling OpenAI API from client-side code:** Exposes API keys to browser. Always use server functions (`createServerFn`) or Inngest functions for OpenAI calls.
- **Storing full article content in metadata generation history:** Content is large and redundant. Store only generated metadata + feedback text in `pin_metadata_generations` table.
- **Synchronous bulk metadata generation:** Blocks user while processing multiple pins. Use Inngest for bulk operations to provide responsive UX.
- **Omitting max_tokens in OpenAI calls:** GPT-4o defaults can truncate metadata unexpectedly. Explicitly set `max_tokens: 500` for controlled output length.
- **Using native Date objects for scheduling without timezone handling:** Leads to timezone bugs. Store `scheduled_at` as ISO 8601 string (UTC) in database, convert to local time only for display.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Date picker UI | Custom calendar grid with date selection logic | shadcn/ui date-picker (react-day-picker) | Handles accessibility, keyboard navigation, locale support, edge cases (leap years, month boundaries). Building from scratch underestimates complexity. |
| OpenAI API retry logic | Manual retry with setTimeout and counters | OpenAI SDK built-in retries + Inngest step retries | OpenAI SDK handles transient network errors, rate limits (429), and server errors (5xx) automatically. Inngest adds durable retry for long-running failures. |
| Multimodal prompt construction | String concatenation for text + image URLs | OpenAI Chat Completions content array | Content arrays handle type safety, proper message structure, and future extensibility (audio, video). Manual construction is error-prone. |
| Conversation history storage | Custom database schema for message threading | Use simpler approach: store only last 3 generations with feedback | OpenAI's Conversations API (for Responses API) handles full conversation state, but Phase 5 only needs regeneration history, not full conversation. Avoid over-engineering. |

**Key insight:** AI infrastructure (retry logic, prompt engineering, multimodal inputs) has subtle edge cases that official SDKs handle. Dates and time zones are notoriously complex — react-day-picker and date-fns have solved these problems at scale. Reinventing these wheels wastes time and introduces bugs.

## Common Pitfalls

### Pitfall 1: Vision Token Cost Underestimation
**What goes wrong:** Multimodal requests with images consume significantly more tokens than text-only requests, leading to unexpectedly high API costs.
**Why it happens:** GPT-4o charges $2.50 per million input tokens. High-resolution images (pin images are typically 1000x1500px) can consume 200-400 tokens per image. Bulk generation of 100 pins = 20,000-40,000 input tokens + article content tokens.
**How to avoid:**
- Use `detail: "low"` in image_url objects for faster, cheaper processing when high detail isn't needed
- Limit article content to first 4000 characters (approximately 1000 tokens) instead of sending entire article
- Monitor usage via OpenAI dashboard and set billing alerts
**Warning signs:** OpenAI API bills increasing faster than expected, slow response times for vision requests

**Source:** [OpenAI Pricing](https://openai.com/api/pricing/), [GPT-4o Pricing Guide](https://pricepertoken.com/pricing-page/model/openai-gpt-4o)

### Pitfall 2: Inngest Step Idempotency Violations
**What goes wrong:** Steps that insert new database records on each retry create duplicate metadata generations when Inngest retries after transient failures.
**Why it happens:** Inngest automatically retries failed steps (network timeouts, rate limits). Non-idempotent operations (INSERT without unique constraint) execute multiple times.
**How to avoid:**
- Use UPSERT with unique constraints instead of INSERT
- For metadata generation history: include (pin_id, created_at) unique constraint, or use client-side `ulid()` for deterministic IDs
- Check if record exists before inserting in retry-prone steps
**Warning signs:** Duplicate rows in `pin_metadata_generations` table, same metadata generated multiple times for one pin

**Source:** [Inngest Error Handling](https://www.inngest.com/docs/guides/error-handling)

### Pitfall 3: Pinterest SEO Prompt Drift
**What goes wrong:** AI-generated metadata doesn't follow Pinterest SEO best practices (title too long, missing keywords in first 50 chars of description, no call-to-action).
**Why it happens:** Generic system prompts don't encode Pinterest-specific constraints. GPT-4o defaults to generic social media metadata.
**How to avoid:**
- System prompt MUST specify: "Title under 100 characters, description first 50 characters optimized for preview, include clear call-to-action"
- Include keyword extraction from article title/content: "Identify top 3 keywords and ensure they appear in title and description"
- Use Zod schema validation on OpenAI response to enforce character limits before storing
**Warning signs:** Titles exceeding 100 chars, descriptions without CTAs, low Pinterest engagement after publishing

**Source:** [Pinterest SEO 2026 Guide](https://www.outfy.com/blog/pinterest-seo/), [Optimize Pinterest Descriptions 2025](https://www.tailwindapp.com/blog/optimize-pinterest-pin-descriptions-titles-in-2025-a-practical-testable-framework)

### Pitfall 4: Scheduling Without Prerequisite Validation
**What goes wrong:** Users schedule pins without generated metadata, leading to incomplete pins being published by n8n workflow.
**Why it happens:** UI doesn't enforce that `title` and `description` must be filled before enabling scheduling controls.
**How to avoid:**
- Disable date/time picker until `pin.title` and `pin.description` are non-null
- Show inline error: "Generate metadata before scheduling"
- Backend validation in `updatePin` API: reject `scheduled_at` updates if metadata is missing
**Warning signs:** Pins in "Bereit zum Planen" status with null title/description, n8n workflow errors

### Pitfall 5: Regeneration Overwrites Without History
**What goes wrong:** User regenerates metadata, previous generation is lost, no way to revert to better previous version.
**Why it happens:** Naive implementation updates `pins` table directly without storing history.
**How to avoid:**
- ALWAYS insert into `pin_metadata_generations` before updating `pins` table
- Keep last 3 generations per pin (delete older than 3rd most recent on insert)
- UI shows history with "Use this version" button to restore previous generation
**Warning signs:** Users complain about losing good metadata after regeneration

## Code Examples

Verified patterns from official sources:

### Pinterest SEO System Prompt
```typescript
// Based on: https://www.tailwindapp.com/blog/optimize-pinterest-pin-descriptions-titles-in-2025-a-practical-testable-framework
// Pinterest SEO best practices for 2026

export const PINTEREST_SEO_SYSTEM_PROMPT = `You are a Pinterest SEO expert generating optimized pin metadata.

**Title Requirements:**
- Maximum 100 characters (strict limit)
- Lead with the main benefit/outcome, not brand name
- Include 1-2 relevant keywords naturally
- Example: "Easy Vegan Chocolate Cake Recipe (30 Minutes)" not "My Vegan Cake Recipe"

**Description Requirements:**
- First 50 characters are critical (preview text) — make them compelling
- Total length: 220-232 characters (optimal range)
- Include a clear call-to-action ("Learn more!", "Get the recipe!", "Try this!")
- Use relevant long-tail keywords (e.g., "SEO tools for small businesses" not just "SEO tools")
- Be scannable — short sentences, active voice

**Alt Text Requirements:**
- Describe the image literally for accessibility
- Include 1-2 keywords naturally
- 125 characters maximum
- Example: "Chocolate cake slice on white plate with fork, topped with fresh berries"

**Output Format:**
Return ONLY valid JSON with this exact structure:
{
  "title": "Your optimized title here",
  "description": "Your optimized description with CTA here",
  "alt_text": "Your image description here"
}

Do not include any text outside the JSON object.`
```

### Metadata Generation with Feedback Refinement
```typescript
// Source: https://platform.openai.com/docs/guides/conversation-state
// Feedback-based regeneration pattern

async function generateWithFeedback(
  pin_id: string,
  feedback: string
): Promise<void> {
  // 1. Fetch previous generation
  const { data: previousGen } = await supabase
    .from('pin_metadata_generations')
    .select('*')
    .eq('pin_id', pin_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // 2. Fetch pin + article data
  const { data: pin } = await supabase
    .from('pins')
    .select('*, blog_articles(*)')
    .eq('id', pin_id)
    .single()

  // 3. Build conversation with feedback
  const messages = [
    {
      role: 'system',
      content: PINTEREST_SEO_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Article Title: ${pin.blog_articles.title}\n\nArticle Content: ${pin.blog_articles.content.slice(0, 4000)}`,
        },
        {
          type: 'image_url',
          image_url: {
            url: getPinImageUrl(pin.image_path),
          },
        },
      ],
    },
    {
      role: 'assistant',
      content: JSON.stringify({
        title: previousGen.title,
        description: previousGen.description,
        alt_text: previousGen.alt_text,
      }),
    },
    {
      role: 'user',
      content: `Please regenerate the metadata with this feedback: ${feedback}`,
    },
  ]

  // 4. Generate new metadata
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 500,
    temperature: 0.7,
  })

  const newMetadata = JSON.parse(completion.choices[0].message.content)

  // 5. Store in history
  await supabase.from('pin_metadata_generations').insert({
    pin_id,
    tenant_id: pin.tenant_id,
    title: newMetadata.title,
    description: newMetadata.description,
    alt_text: newMetadata.alt_text,
    feedback,
  })

  // 6. Update pin
  await supabase
    .from('pins')
    .update({
      title: newMetadata.title,
      description: newMetadata.description,
      alt_text: newMetadata.alt_text,
    })
    .eq('id', pin_id)
}
```

### Bulk Scheduling with Date Spreading
```typescript
// User picks start date + interval (e.g., one pin every 2 days at 9 AM)

async function schedulePinsBulk(
  pin_ids: string[],
  startDate: Date,
  intervalDays: number,
  time: string // "09:00"
): Promise<void> {
  const [hours, minutes] = time.split(':').map(Number)

  for (let i = 0; i < pin_ids.length; i++) {
    const scheduledDate = new Date(startDate)
    scheduledDate.setDate(scheduledDate.getDate() + i * intervalDays)
    scheduledDate.setHours(hours, minutes, 0, 0)

    await supabase
      .from('pins')
      .update({
        scheduled_at: scheduledDate.toISOString(),
        status: 'bereit_zum_planen',
      })
      .eq('id', pin_ids[i])
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenAI Completions API (text-only) | Chat Completions API with vision (multimodal) | 2023-2024 | Vision-enabled models (GPT-4o, GPT-4.1) analyze pin images alongside article text for context-aware metadata generation |
| Manual conversation history management | OpenAI Responses API (stateful) | Mid-2025 | Simplifies multi-turn refinement, but Phase 5 uses simpler feedback pattern (store last 3 generations) |
| react-datepicker | react-day-picker v9 (controlled mode) | 2024 | v9 introduced controlled `selected` + `onSelect` props, breaking from v7/v8 uncontrolled pattern; shadcn/ui adopted v9 |
| Moment.js | date-fns | 2020-2023 | date-fns is ESM-first, tree-shakeable, actively maintained; moment.js is deprecated |

**Deprecated/outdated:**
- **OpenAI Completions API:** Replaced by Chat Completions for all use cases (Completions API lacks multimodal support, less flexible than messages array)
- **react-day-picker v7/v8 uncontrolled mode:** v9 requires explicit state management via `selected`/`onSelect` props
- **OpenAI `detail: "high"` for all images:** 2026 default is `detail: "auto"` which intelligently chooses resolution; explicitly setting `"high"` increases cost without benefit for most use cases

## Open Questions

Things that couldn't be fully resolved:

1. **Exact n8n OpenAI prompt for Pinterest metadata**
   - What we know: User mentioned "replicate existing n8n prompt" for Pinterest SEO in CONTEXT.md
   - What's unclear: Don't have access to actual n8n workflow to inspect prompt
   - Recommendation: During implementation, ask user to share n8n OpenAI node prompt text, or start with Pinterest SEO system prompt from this research and refine based on user feedback

2. **Generation history table retention policy**
   - What we know: Keep last 3 generations per pin (per CONTEXT.md)
   - What's unclear: Should old generations be hard-deleted or soft-deleted (archived_at pattern)?
   - Recommendation: Hard delete (DELETE SQL) on 4th generation insert to keep table size small; generations aren't business-critical data

3. **Error recovery "Reset to previous state" button scope**
   - What we know: Button returns pin to "the state before the error occurred, not always back to Entwurf" (CONTEXT.md)
   - What's unclear: How to track "previous state"? Store `previous_status` column updated on every status change?
   - Recommendation: Add `previous_status` column to `pins` table, update via database trigger on status change, "Reset" button sets `status = previous_status` and clears `error_message`

4. **Multimodal vision detail level for pin images**
   - What we know: GPT-4o supports `detail: "low" | "auto" | "high"` for image_url objects
   - What's unclear: Pinterest pin images (typically 1000x1500px) are mid-resolution — is "auto" sufficient or should we force "high" for better metadata quality?
   - Recommendation: Start with `detail: "auto"` (cost-efficient), A/B test with "high" if metadata quality is insufficient; "auto" intelligently chooses based on image complexity

## Sources

### Primary (HIGH confidence)
- **/openai/openai-node** (Context7) - Chat Completions API, multimodal vision inputs, code examples
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions) - createServerFn patterns
- [shadcn/ui Date Picker](https://ui.shadcn.com/docs/components/date-picker) - React Hook Form integration, installation
- [Inngest Steps & Workflows](https://www.inngest.com/docs/features/inngest-functions/steps-workflows) - Sequential processing, step-level retries
- [Inngest Error Handling](https://www.inngest.com/docs/guides/error-handling) - Idempotency, failure handling

### Secondary (MEDIUM confidence)
- [Pinterest SEO 2026 Guide](https://www.outfy.com/blog/pinterest-seo/) - Title/description best practices, 2026 algorithm updates
- [Optimize Pinterest Pin Descriptions 2025](https://www.tailwindapp.com/blog/optimize-pinterest-pin-descriptions-titles-in-2025-a-practical-testable-framework) - Character limits, CTA strategies
- [OpenAI Pricing](https://openai.com/api/pricing/) - GPT-4o vision token costs
- [React DayPicker](https://daypicker.dev/) - date-fns integration, TypeScript examples
- [OpenAI Conversation State](https://platform.openai.com/docs/guides/conversation-state) - Conversations API (for context, not directly used)

### Tertiary (LOW confidence)
- [Web search: OpenAI vision chat completions TypeScript examples](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/gpt-v-quickstart) - Confirmed content array pattern with `type: "text"` and `type: "image_url"`
- [Web search: React time picker components](https://mui.com/x/react-date-pickers/time-picker/) - Alternative libraries (not used, native HTML time input chosen for simplicity)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - OpenAI Node SDK, Inngest, shadcn/ui date picker all verified via official docs and Context7
- Architecture: HIGH - Multimodal vision pattern verified in OpenAI docs, Inngest pattern matches existing Phase 3 implementation
- Pitfalls: MEDIUM - Pinterest SEO pitfalls based on web sources (authoritative but not official Pinterest docs), vision token costs verified via OpenAI pricing page

**Research date:** 2026-01-29
**Valid until:** 2026-03-01 (30 days — stable domain, OpenAI API rarely changes patterns within 30 days)
