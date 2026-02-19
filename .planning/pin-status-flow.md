# Pin Status Flow

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> draft : Pin created (image uploaded)

    draft --> generate_metadata : User triggers generation
    draft --> deleted : User deletes

    generate_metadata --> generating_metadata : System starts AI call
    generate_metadata --> error : Validation failure

    generating_metadata --> metadata_created : AI returns results
    generating_metadata --> error : AI/network failure

    metadata_created --> generate_metadata : User regenerates (with feedback)
    metadata_created --> published : Auto-publish (scheduled_at <= now) or manual publish
    metadata_created --> deleted : User deletes

    published --> [*]

    error --> draft : User resets (no previous_status)
    error --> generate_metadata : User retries generation
    error --> deleted : User deletes

    deleted --> [*]
```

## Status Reference

| Status | Display Label (DE) | Color | Managed By | Description |
|---|---|---|---|---|
| `draft` | Entwurf | slate | User | Initial state after pin creation |
| `generate_metadata` | Metadaten generieren | violet | User | User has requested generation |
| `generating_metadata` | Metadaten werden generiert | violet | System | AI generation in progress |
| `metadata_created` | Metadaten erstellt | teal | System | AI metadata applied to pin |
| `published` | Veroffentlicht | emerald | System | Live on Pinterest |
| `error` | Fehler | red | System | Failed operation, recoverable |
| `deleted` | Loschen | gray | User | Soft-deleted |

## Notes

- **System-managed statuses** (`generating_metadata`, `published`) cannot be set by users in the UI
- **Error recovery** restores `previous_status` if available, otherwise falls back to `draft`
- **Auto-publishing** is triggered by pg_cron every 10 minutes (7-23 UTC) for pins with `metadata_created` status and `scheduled_at <= NOW()`
- **Manual publishing** is also available via the UI publish button
