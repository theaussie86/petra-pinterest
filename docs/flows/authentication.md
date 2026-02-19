# Authentication Flow

Google OAuth login via Supabase Auth with cookie-based session management. All protected routes live under the `_authed/` layout which enforces authentication.

## Login Flow

```mermaid
sequenceDiagram
    actor User
    participant Login as /login
    participant Google as Google OAuth
    participant Callback as /auth/callback
    participant Server as exchangeCodeFn
    participant Supabase as Supabase Auth
    participant Dashboard as /dashboard

    User->>Login: Click "Sign in with Google"
    Login->>Google: signInWithGoogle() via supabase.auth.signInWithOAuth()
    Google->>User: Consent screen
    User->>Google: Grant permissions
    Google->>Callback: Redirect with ?code=...
    Callback->>Server: exchangeCodeFn({ code })
    Server->>Supabase: exchangeCodeForSession(code)
    Supabase-->>Server: Session cookies set via middleware
    Server-->>Callback: { error: null }
    Callback->>Dashboard: redirect({ to: '/dashboard' })
```

## Session Initialization (Every Route Load)

```mermaid
sequenceDiagram
    participant Root as __root.tsx beforeLoad
    participant Server as fetchUser()
    participant Supabase as Supabase Auth
    participant DB as profiles table
    participant Authed as _authed.tsx beforeLoad
    participant Page as Child Route

    Root->>Server: fetchUser()
    Server->>Supabase: auth.getUser() (reads cookies)
    alt Not authenticated
        Supabase-->>Server: null
        Server-->>Root: null
        Root->>Authed: context.user = null
        Authed->>Page: redirect({ to: '/login' })
    else Authenticated
        Supabase-->>Server: user object
        Server->>DB: rpc('ensure_profile_exists')
        DB-->>Server: { tenant_id }
        Server->>DB: SELECT display_name FROM profiles
        DB-->>Server: profile data
        Server-->>Root: AuthUser { id, email, tenant_id, display_name }
        Root->>Authed: context.user = AuthUser
        Authed->>Page: Render with user context
    end
```

## Logout Flow

```mermaid
sequenceDiagram
    actor User
    participant Sidebar as AppSidebar
    participant Server as signOutFn
    participant Supabase as Supabase Auth
    participant Root as / (index)
    participant Login as /login

    User->>Sidebar: Click "Sign out"
    Sidebar->>Server: signOut() -> signOutFn()
    Server->>Supabase: auth.signOut()
    Supabase-->>Server: Cookies cleared
    Server-->>Sidebar: { error: null }
    Sidebar->>Root: navigate({ to: '/' })
    Root->>Login: context.user is null -> redirect to /login
```

## Auth Guard

The `_authed.tsx` layout route protects all child routes. It runs `beforeLoad` on every navigation:

1. Checks `context.user` (set by `__root.tsx`)
2. If `null` -> redirects to `/login`
3. If present -> passes user to child routes via `useRouteContext()`

The layout wraps children in `SidebarProvider` + `AppSidebar` for the authenticated shell.

## Profile Auto-Creation

New users get a profile automatically via two mechanisms:

- **Database trigger:** `on_auth_user_created` fires after Supabase Auth signup, inserting into `profiles` with a new `tenant_id`
- **Fallback RPC:** `ensure_profile_exists()` creates the profile on-demand if the trigger hasn't fired yet (race condition handling)

## Key Files

| File | Purpose |
|------|---------|
| `src/routes/login.tsx` | Login page with Google OAuth button |
| `src/routes/auth.callback.tsx` | OAuth redirect handler, exchanges code for session |
| `src/routes/_authed.tsx` | Auth guard layout, redirects unauthenticated users |
| `src/routes/__root.tsx` | Root layout, runs `fetchUser()` on every navigation |
| `src/routes/index.tsx` | Root redirect (authenticated -> dashboard, else -> login) |
| `src/lib/server/auth.ts` | Server functions: `fetchUser`, `exchangeCodeFn`, `signOutFn` |
| `src/lib/auth.ts` | Client utilities: `signInWithGoogle`, `signOut`, `ensureProfile` |
| `src/components/layout/app-sidebar.tsx` | Sidebar with sign-out action |
