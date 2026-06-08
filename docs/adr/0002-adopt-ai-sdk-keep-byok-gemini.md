---
status: accepted
---

# Adopt Vercel AI SDK for all AI calls, keep per-project BYOK Gemini

We replace the direct `@google/genai` SDK with the Vercel AI SDK (v6, `@ai-sdk/google`) as the single abstraction for every AI operation (`generatePinMetadata`, `generatePinMetadataWithFeedback`, `generateArticleFromHtml`). The goal is provider/model-swap readiness, better DX, and consolidation onto the Vercel-standard stack — **not** observability. We keep the existing per-project bring-your-own-key (BYOK) Gemini model: keys stay in Supabase Vault, the `get_gemini_api_key` RPC and the API-key UI are unchanged, so this carries **no DB migration**. Only Google is wired today; a `getModel(apiKey)` resolver isolates the provider so a future swap is a one-line change.

## Considered options

- **Vercel AI Gateway (rejected).** The Vercel default is plain `provider/model` strings through the AI Gateway with one central key. That collides head-on with BYOK: a single key would bill all AI usage to us instead of each project owner, breaking the multi-tenant cost model. BYOK wins; Gateway is out.
- **Multi-provider BYOK now (deferred).** Storing `provider + key` per project and instantiating `@ai-sdk/{google,anthropic,openai}` dynamically would need a Vault-schema + UI + key-resolver change. Deferred — we keep the option open via the AI SDK abstraction without paying for it now.
- **Migrate only the Node path, deprecate the Deno Edge fallback (rejected).** The `isTriggerDevEnabled('metadata')` flag forks metadata/scrape generation: Trigger.dev (Node, `lib/ai`) is primary, Supabase Edge Functions (Deno, `_shared/ai.ts`) are fallback. The fallback is real resilience and stays, so both runtimes migrate. The AI SDK is npm-importable in Deno via `npm:`, and accepting raw `Uint8Array` image parts removes the old `Buffer`-vs-`btoa` divergence that forced the code duplication.

## Consequences

- **API redesigned, not guts-swapped.** The old 8-argument functions become options-object wrappers around `generateObject`. Callers (`src/trigger`, `src/lib/server/metadata.ts`, `server/lib/*-scraper`) and tests change with it.
- **`sanitizeJsonResponse` survives as a safety net.** Gemini historically emits literal control chars inside JSON strings, making metadata flaky. It moves into `generateObject`'s `experimental_repairText` (native parse first, repair only on failure) with a fire-counter, so we can measure whether the AI SDK already fixes the bug and delete it later if so.
- **Tests inject `MockLanguageModelV2`** via an optional `model` param, exercising the real `generateObject` + Zod + repair path rather than mocking the wrapper.
- **Images are fetched by us** (bytes → `Uint8Array` part), not handed to the provider as URLs — preserves reachability of private/signed Supabase storage URLs and keeps the video ffmpeg-keyframe path identical.
- **`lib/gemini/` → `lib/ai/`, `_shared/gemini.ts` → `_shared/ai.ts`** — provider-agnostic naming. The Vault key name stays `gemini` (data, not code).
