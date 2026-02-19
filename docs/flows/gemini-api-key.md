# Gemini API Key Management

Store, update, and remove per-project Gemini API keys via Supabase Vault. Keys are required for AI metadata generation.

## Store / Update Key

```mermaid
flowchart TD
    A[Project detail page:<br/>GeminiApiKeyCard] --> B{Key configured?}
    B -->|No| C[Show text field + Save button]
    B -->|Yes| D[Show green 'Configured' indicator]
    D --> E{User action}
    E -->|Replace| F[Switch to text field + Save/Cancel]
    E -->|Remove| G[Confirmation dialog]

    C --> H[User enters API key]
    F --> H
    H --> I[Click Save]
    I --> J[storeGeminiKeyFn server function]
    J --> K[Verify project belongs to tenant]
    K --> L[Service client RPC:<br/>store_gemini_api_key]
    L --> M[Key encrypted in Vault]
    M --> N[Toast: Key saved]
    N --> O[Invalidate key status query]

    G --> P{Confirm?}
    P -->|Yes| Q[deleteGeminiKeyFn]
    Q --> R[Service client RPC:<br/>delete_gemini_api_key]
    R --> S[Key removed from Vault]
    S --> T[Toast: Key removed]
    P -->|No| U[Close dialog]
```

## Key Status Check

The component checks on mount whether a key is configured:

```mermaid
sequenceDiagram
    participant Card as GeminiApiKeyCard
    participant Server as getGeminiKeyStatusFn
    participant Vault as Supabase Vault

    Card->>Server: getGeminiKeyStatusFn({ blog_project_id })
    Server->>Vault: rpc('has_gemini_api_key', blog_project_id)
    Vault-->>Server: boolean
    Server-->>Card: { has_key: true/false }
```

The actual key value is **never returned** to the client. Only the boolean status is exposed.

## UI States

| State | Display |
|-------|---------|
| Loading | Spinner |
| No key | Text field (password type) + Save button |
| Key configured | Green indicator + "Configured" + Replace/Remove buttons |
| Replacing | Text field (autofocus) + Save/Cancel buttons |

## Security

- Keys are encrypted at rest in Supabase Vault
- Only the service role client can read/write Vault secrets
- Server functions verify tenant ownership before any Vault operation
- Keys are named `gemini_api_key_{blog_project_id}` in Vault

## Usage

Once stored, the key is automatically used by:
- [AI Metadata Generation](ai-metadata-generation.md) - `generateMetadataFn` retrieves the key from Vault before calling Gemini
- Bulk metadata generation Edge Function

## Key Files

| File | Purpose |
|------|---------|
| `src/components/projects/gemini-api-key-card.tsx` | UI for key management |
| `src/lib/server/gemini-key.ts` | Server functions: store, delete, check status |
| `src/lib/hooks/use-gemini-key.ts` | TanStack Query hooks: `useGeminiKeyStatus`, `useStoreGeminiKey`, `useDeleteGeminiKey` |
