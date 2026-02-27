# Project-Specific AI Context for Pin Metadata Generation

**Date:** 2026-02-27
**Status:** Approved

## Problem

Users need to provide project-specific instructions for AI metadata generation. For example, a nutrition blog may need to avoid health claims due to lack of professional qualifications. This context is project-wide, not per-pin.

## Solution

Add a free-text `ai_context` field to blog projects that gets injected into the Gemini prompt when generating pin metadata (title, description, alt-text).

## Design

### Database

New column in `blog_projects`:

```sql
ALTER TABLE blog_projects ADD COLUMN ai_context TEXT NULL;
```

### TypeScript Types

Update `BlogProject` interface in `src/types/blog-projects.ts`:

```typescript
interface BlogProject {
  // ... existing fields
  ai_context: string | null
}
```

### UI

Add textarea field in project edit dialog (`src/components/projects/project-dialog.tsx`):
- Label: "AI-Kontext" (or "AI Context" in English)
- Placeholder: "z.B. 'Keine Gesundheitsversprechen machen, da keine Qualifikation'"
- Help text explaining the field's purpose

### Prompt Integration

Modify `buildPinterestSeoPrompt()` in `src/lib/gemini/prompts.ts` to accept optional `aiContext` parameter:

```typescript
export function buildPinterestSeoPrompt(
  language?: string | null,
  aiContext?: string | null
): string {
  let prompt = PINTEREST_SEO_PROMPT

  if (language) {
    prompt += `\n\nIMPORTANT: Generate all content in ${sanitizeLanguage(language)}.`
  }

  if (aiContext) {
    prompt += `\n\n## Project-Specific Instructions\n${aiContext}`
  }

  return prompt
}
```

### Integration Points

The `ai_context` must be passed through these code paths:

1. **Synchronous single-pin generation:**
   `src/lib/gemini/client.ts` → `generatePinMetadata()`

2. **Async bulk generation (Edge Function):**
   `supabase/functions/generate-metadata-single/index.ts`

3. **Feedback-based regeneration:**
   `src/lib/server/metadata.ts` → `generateMetadataWithFeedbackFn()`

### Data Flow

```
Project Settings UI
        ↓
blog_projects.ai_context (DB)
        ↓
Pin generation triggered
        ↓
Load project → extract ai_context
        ↓
buildPinterestSeoPrompt(language, ai_context)
        ↓
Gemini API call with enriched prompt
        ↓
Generated metadata respects project context
```

## Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration adding `ai_context` column |
| `src/types/blog-projects.ts` | Add `ai_context` to `BlogProject` interface |
| `src/components/projects/project-dialog.tsx` | Add textarea field for AI context |
| `src/lib/gemini/prompts.ts` | Update `buildPinterestSeoPrompt()` to accept `aiContext` |
| `src/lib/gemini/client.ts` | Pass `aiContext` through to prompt builder |
| `src/lib/server/metadata.ts` | Pass `aiContext` through generation functions |
| `supabase/functions/generate-metadata-single/index.ts` | Load and use project's `ai_context` |
| `supabase/functions/_shared/gemini.ts` | Update shared prompt building if used |

## Verification

1. Create a project with `ai_context` = "Never make health claims"
2. Generate pin metadata for that project
3. Verify generated content respects the instruction
4. Test all 3 generation paths (single, bulk, feedback)
