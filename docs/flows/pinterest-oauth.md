# Pinterest OAuth Flow

Connect or disconnect a Pinterest account per project using OAuth 2.0 with PKCE. Tokens are stored encrypted in Supabase Vault.

## Connect Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as PinterestConnection
    participant Server as initPinterestOAuthFn
    participant DB as oauth_state_mapping
    participant Pinterest as Pinterest OAuth
    participant Callback as /auth/pinterest/callback
    participant Exchange as exchangePinterestCallbackFn
    participant API as Pinterest API
    participant Vault as Supabase Vault

    User->>UI: Click "Connect"
    UI->>Server: initPinterestOAuthFn({ blog_project_id })
    Server->>Server: Generate PKCE (verifier + SHA-256 challenge)
    Server->>Server: Generate state token (CSRF)
    Server->>DB: Store state, code_verifier, project_id (10 min TTL)
    Server-->>UI: { authUrl }
    UI->>Pinterest: window.location.href = authUrl

    Pinterest->>User: Authorization consent screen
    Note right of Pinterest: Scopes: user_accounts:read,<br/>boards:read/write, pins:read/write
    User->>Pinterest: Approve
    Pinterest->>Callback: Redirect with ?code=...&state=...

    Callback->>Exchange: exchangePinterestCallbackFn({ code, state })
    Exchange->>DB: Lookup state, verify not expired
    Exchange->>API: POST /oauth/token (code + code_verifier + Basic Auth)
    API-->>Exchange: { access_token, refresh_token, expires_in: 30d }
    Exchange->>API: GET /user_account
    API-->>Exchange: { pinterest_user_id, username }
    Exchange->>DB: Upsert pinterest_connections
    Exchange->>Vault: rpc('store_pinterest_tokens', access + refresh)
    Exchange->>DB: Update blog_projects.pinterest_connection_id
    Exchange->>DB: Delete state mapping (cleanup)
    Exchange-->>Callback: { success, blog_project_id, username }
    Callback->>UI: Redirect to /projects/$id?pinterest_connected=true
```

## Disconnect Flow

```mermaid
flowchart TD
    A[User clicks Disconnect] --> B[Confirmation dialog]
    B --> C[disconnectPinterestFn]
    C --> D[Set blog_projects.pinterest_connection_id = NULL]
    D --> E{Other projects<br/>use this connection?}
    E -->|Yes| F[Keep connection + tokens]
    E -->|No| G[Delete tokens from Vault]
    G --> H[Delete pinterest_connections row]
    F --> I[Toast: Disconnected]
    H --> I
```

## Connection Status Check

The `PinterestConnection` component checks connection status on mount via `getPinterestConnectionFn()` and displays:

| State | UI |
|-------|----|
| Loading | Spinner |
| Not connected | "Connect" button |
| Connected & active | Green indicator, username, token expiry date, "Disconnect" button |
| Connected & inactive | Error alert, "Reconnect" button, "Disconnect" button |
| OAuth error (from URL param) | Error alert with "Try again" link |

The component also listens for realtime updates on the `pinterest_connections` table to reflect changes immediately.

## Security

- **PKCE S256:** Code verifier (64 bytes) never leaves the server. Challenge (SHA-256 hash) sent to Pinterest.
- **State token:** 32-byte random CSRF token with 10-minute expiration, stored in DB.
- **Token storage:** Access and refresh tokens encrypted in Supabase Vault, never exposed in API responses.
- **Shared connections:** Multiple projects within the same tenant can share one Pinterest account. Tokens are only deleted when the last project disconnects.

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/server/pinterest-oauth.ts` | Server functions: init, exchange, disconnect, get status |
| `src/lib/server/pinterest-api.ts` | Pinterest API wrapper, PKCE helpers, token exchange |
| `src/routes/auth.pinterest.callback.tsx` | Callback route, validates params, triggers exchange |
| `src/components/projects/pinterest-connection.tsx` | Connection UI with connect/disconnect/status display |
| `src/types/pinterest.ts` | Type definitions for connections, tokens, OAuth state |
