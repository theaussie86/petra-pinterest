# Pin Status Flow

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> draft : Pin created (image uploaded)

    draft --> ready_for_generation : User marks ready
    draft --> deleted : User deletes

    ready_for_generation --> generate_metadata : User triggers generation
    ready_for_generation --> draft : User reverts
    ready_for_generation --> deleted : User deletes

    generate_metadata --> generating_metadata : System starts AI call
    generate_metadata --> error : Validation failure

    generating_metadata --> metadata_created : AI returns results
    generating_metadata --> error : AI/network failure

    metadata_created --> generate_metadata : User regenerates (with feedback)
    metadata_created --> ready_to_schedule : User schedules pin
    metadata_created --> deleted : User deletes

    ready_to_schedule --> published : n8n publishes to Pinterest
    ready_to_schedule --> metadata_created : User unschedules
    ready_to_schedule --> deleted : User deletes

    published --> [*]

    error --> draft : User resets (no previous_status)
    error --> ready_for_generation : User resets (previous_status)
    error --> generate_metadata : User retries generation
    error --> deleted : User deletes

    deleted --> [*]
```

## Status Reference

| Status | Display Label (DE) | Color | Managed By | Description |
|---|---|---|---|---|
| `draft` | Entwurf | slate | User | Initial state after pin creation |
| `ready_for_generation` | Bereit fur Generierung | blue | User | Awaiting AI metadata generation |
| `generate_metadata` | Metadaten generieren | violet | User | User has requested generation |
| `generating_metadata` | Metadaten werden generiert | violet | System | AI generation in progress |
| `metadata_created` | Metadaten erstellt | teal | System | AI metadata applied to pin |
| `ready_to_schedule` | Bereit zum Planen | green | User | Scheduled, awaiting publish |
| `published` | Veroffentlicht | emerald | System (n8n) | Live on Pinterest |
| `error` | Fehler | red | System | Failed operation, recoverable |
| `deleted` | Loschen | gray | User | Soft-deleted |

## Notes

- **System-managed statuses** (`generating_metadata`, `published`) cannot be set by users in the UI
- **Error recovery** restores `previous_status` if available, otherwise falls back to `draft`
- **n8n integration** sets `published` after successful Pinterest API publish
