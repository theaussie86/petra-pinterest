# Pitfalls Research: Pinterest Scheduling Dashboard

**Project:** Petra Pinterest
**Stack:** TanStack Start + Supabase + n8n
**Architecture:** Multi-tenant SaaS
**Researched:** 2026-01-26
**Overall Confidence:** HIGH

## Executive Summary

This research identifies critical pitfalls across five domains: framework (TanStack Start), database (Supabase multi-tenant RLS), UI (calendar/image galleries), integration (n8n webhooks), and migration (Airtable to Supabase). The most severe risks are **multi-tenant data leakage through missing RLS policies** and **Airtable migration complexity with formula/linked record conversion**.

---

## Framework Pitfalls (TanStack Start)

### CRITICAL: Hydration Errors

**What goes wrong:** Server-rendered HTML doesn't match client-side React hydration, causing console errors, UI glitches, or complete app crashes.

**Common causes:**
- Using `Date.now()` or `Intl` (locale/timezone) without server-client synchronization
- Generating random IDs (Math.random, uuid) that differ between server and client
- Responsive-only logic that reads `window.innerWidth` during SSR
- Feature flags or user preferences that differ between environments
- Browser APIs (localStorage, navigator) called during server rendering

**Prevention:**
- Pick a deterministic locale/timezone on the server and use the same on client
- Use cookies as source of truth for user preferences (NOT localStorage during SSR)
- Implement environment detection before calling browser-only APIs
- Use TanStack Start's selective SSR to control which components render server-side
- Implement error boundaries to isolate hydration failures

**Confidence:** HIGH (Official TanStack documentation)

**Sources:**
- [Hydration Errors | TanStack Start React Docs](https://tanstack.com/start/latest/docs/framework/react/guide/hydration-errors)
- [TanStack Start: Catch Bugs Before Your Users Do | Medium](https://ruintheextinct.medium.com/tanstack-start-catch-bugs-before-your-users-do-530e66155ec4)

---

### CRITICAL: Server Functions Insecurity

**What goes wrong:** Exposing secrets (API keys, database credentials) to the client by misunderstanding server-only execution.

**Why it happens:** Common misconception that loaders are server-only — they run on BOTH server and client. Developers put sensitive logic in loaders instead of server functions.

**Consequences:**
- Environment variables exposed to browser
- Database credentials leaked
- API keys visible in client bundle

**Prevention:**
- Use server functions (`createServerFn`) for ALL server-only operations
- Never access `process.env` in loaders
- Add auth middleware to validate session before server function execution
- Validate dynamic user-generated data passed via context (potential security concern)

**Detection:**
- Check browser DevTools Network tab for unexpected API responses
- Review bundle analyzer for environment variable strings
- Test with unauthenticated requests to verify authorization

**Confidence:** HIGH (Official documentation + 2026 security guides)

**Sources:**
- [Code Execution Patterns | TanStack Start React Docs](https://tanstack.com/start/latest/docs/framework/react/guide/code-execution-patterns)
- [How to protect server functions with auth middleware in TanStack Start](https://dev.to/hirotoshioi/how-to-protect-server-functions-with-auth-middleware-in-tanstack-start-opj)
- [Top 5 authentication solutions for secure TanStack Start apps in 2026](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026)

---

### MODERATE: Authentication Integration Complexity

**What goes wrong:** Authentication providers not designed for TanStack Start's architecture fail at server-client boundaries.

**Why it happens:** TanStack Start doesn't prescribe auth, requiring providers to adapt to server functions, type-safe routing, and multiple runtimes (Node, Bun, edge).

**Prevention:**
- Choose auth providers with explicit TanStack Start support (WorkOS, Clerk, Auth.js)
- Verify provider offers cookie/session helpers compatible with server functions
- Ensure session validation works in your target runtime (Node vs. edge)
- Implement proper middleware for route protection

**Session security checklist:**
- Password: 32+ characters minimum
- `secure: true` (HTTPS only in production)
- `sameSite: 'lax'` (CSRF protection)
- `httpOnly: true` (XSS protection)
- Appropriate `maxAge` for your use case

**Confidence:** HIGH (Official docs + 2026 provider guides)

**Sources:**
- [Top 5 authentication solutions for secure TanStack Start apps in 2026](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026)
- [Authentication | TanStack Start React Docs](https://tanstack.com/start/latest/docs/framework/react/guide/authentication)

---

### MODERATE: i18n SEO Disaster

**What goes wrong:** Redirecting based on `Accept-Language` header prevents Google from indexing your default language pages.

**Why it happens:** Googlebot sends `Accept-Language: en`. If you always redirect based on this header, Google only sees your English content.

**Prevention:**
- Only redirect on first visit (set a cookie immediately)
- Never redirect if cookie already exists
- Never redirect if user explicitly navigated to prefixed URL (e.g., `/es/dashboard`)
- Set cookies on root path with `path=/` (not locale-specific paths like `/es`)

**Confidence:** HIGH (Official i18n guide for TanStack Start)

**Sources:**
- [i18n with TanStack Start: A Complete Guide 2026](https://nikuscs.com/blog/13-tanstackstart-i18n/)

---

### MINOR: Learning Curve with Type Safety

**What goes wrong:** Developers unfamiliar with end-to-end type safety struggle with TypeScript configuration.

**Why it happens:** TanStack Start is "the first React framework where end-to-end type safety is actually real — genuinely enforced at compile time."

**Prevention:**
- Invest time in understanding TypeScript generics and inference
- Use TanStack Start's type-safe routing from day one
- Leverage IDE autocomplete to discover API shapes

**Confidence:** MEDIUM (Developer experience reports from 2026)

**Sources:**
- [TanStack in 2026: From Query to Full-Stack - A Developer's Decision Guide](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026)

---

## Database Pitfalls (Supabase Multi-Tenant)

### CRITICAL: Multi-Tenant Data Leakage

**What goes wrong:** One tenant accesses another tenant's data, causing massive data breach.

**Why it happens:**
- Supabase auto-generates REST APIs from PostgreSQL schema
- Row Level Security (RLS) is **opt-in, not default**
- A single missing `WHERE tenant_id = ?` or RLS policy exposes entire database
- The `anon` API key (embedded in client code) becomes "a master key" without RLS

**Real-world impact:**
- CVE-2025-48757 (Lovable vulnerability) affected 170+ apps in 2025
- 13,000 users' data exposed in one leak
- Security researchers demonstrated mass exploitation with simple curl commands

**Prevention:**
1. **Enable RLS on ALL tables in exposed schemas** (no exceptions)
2. **Denormalize `tenant_id` onto every table** (even if normalized design suggests otherwise)
3. **Implement defense-in-depth:**
   - RLS policies (database layer)
   - Application-level checks (server function layer)
   - Explicit `.eq('tenant_id', tenantId)` filters in queries (helps Postgres optimize)
4. **Use Supabase Security Advisor** before production deployment (scans for missing RLS)
5. **Never use `service_role` key in client code** (bypasses RLS entirely)

**RLS Policy Pattern for Multi-Tenant:**
```sql
-- Enable RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT
CREATE POLICY "Users can only see their tenant's posts"
ON posts
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) IS NOT NULL
  AND tenant_id IN (
    SELECT tenant_id
    FROM user_tenants
    WHERE user_id = (SELECT auth.uid())
  )
);

-- Policy for INSERT
CREATE POLICY "Users can only insert into their tenant"
ON posts
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id IN (
    SELECT tenant_id
    FROM user_tenants
    WHERE user_id = (SELECT auth.uid())
  )
);
```

**Detection:**
- Test with user accounts from different tenants
- Try to access other tenant's data by manipulating API calls
- Run Supabase Security Advisor in dashboard
- Monitor logs for unexpected cross-tenant queries

**Confidence:** CRITICAL / HIGH (Official Supabase docs + CVE reports from 2025)

**Sources:**
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Enforcing Row Level Security in Supabase: A Deep Dive into Multi-Tenant Architecture](https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2)
- [Supabase Security Flaw: 170+ Apps Exposed by Missing RLS](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/)
- [Multi-Tenant Applications with RLS on Supabase](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/)

---

### CRITICAL: RLS Policy Gotchas

**What goes wrong:** RLS policies fail silently, causing authorization bugs that appear weeks later.

**Common mistakes:**

#### 1. Not Handling Null from `auth.uid()`
When unauthenticated users access the database, `auth.uid()` returns null, making policies silently fail.

**Bad:**
```sql
USING (auth.uid() = user_id)  -- null = user_id always returns FALSE
```

**Good:**
```sql
USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
```

#### 2. Relying on User-Modifiable Metadata
Never base authorization on `raw_user_meta_data` (users can update it). Use `raw_app_meta_data` (admin-only).

#### 3. Missing SELECT Policies for Updates
UPDATE operations require a corresponding SELECT policy. Without one, updates fail silently.

#### 4. JWT Freshness Issues
"A JWT is not always fresh." User metadata changes don't reflect immediately—JWT must be refreshed first. In multi-tenant scenarios, removing users from teams won't take effect until re-authentication.

#### 5. Cookie Size Limitations
"Some browsers are limited to 4096 bytes for each cookie." Large JWTs with extensive metadata can exceed this, causing authentication failures.

**Prevention:**
- Always check `auth.uid() IS NOT NULL` in policies
- Use `raw_app_meta_data` for authorization claims
- Create matching SELECT and UPDATE/DELETE policies
- Force JWT refresh after tenant membership changes
- Monitor JWT size in cookie-based auth

**Confidence:** HIGH (Official Supabase documentation)

**Sources:**
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [How to Manage Row-Level Security Policies Effectively in Supabase](https://medium.com/@jay.digitalmarketing09/how-to-manage-row-level-security-policies-effectively-in-supabase-98c9dfbc2c01)

---

### MODERATE: RLS Performance Degradation

**What goes wrong:** Queries with RLS policies become 100x slower, causing timeout errors.

**Why it happens:**
- Postgres evaluates RLS functions per-row
- Missing indexes on policy filter columns
- Complex join-based policies cause table scans

**Prevention strategies:**

#### 1. Add Strategic Indexes (99.94% improvement)
```sql
CREATE INDEX idx_posts_tenant_id ON posts(tenant_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
```

#### 2. Wrap Functions in SELECT (94-99% improvement)
```sql
-- Bad (called per-row)
USING (auth.uid() = user_id)

-- Good (cached per-statement)
USING ((SELECT auth.uid()) = user_id)
```

#### 3. Specify Roles Explicitly
```sql
-- Prevents unnecessary evaluation
CREATE POLICY "policy_name"
ON table_name
FOR SELECT
TO authenticated  -- Explicit role
USING (...);
```

#### 4. Minimize Join-Based Policies
```sql
-- Bad (joins source and target tables)
USING (
  team_id IN (
    SELECT t.id FROM teams t
    JOIN team_users tu ON t.id = tu.team_id
    WHERE tu.user_id = auth.uid()
  )
)

-- Good (fetch IDs into array)
USING (
  team_id IN (
    SELECT team_id FROM team_users
    WHERE user_id = (SELECT auth.uid())
  )
)
```

#### 5. Use Security Definer Functions for Complex Logic
Security definer functions bypass RLS and dramatically improve performance for complex authorization checks.

**Confidence:** HIGH (Official Supabase best practices)

**Sources:**
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Best Practices for Supabase | Security, Scaling & Maintainability](https://www.leanware.co/insights/supabase-best-practices)

---

### MODERATE: AI Agent Service Role Bypass

**What goes wrong:** AI coding assistants with `service_role` access bypass RLS through prompt injection.

**Attack vector:** Attackers embed hidden instructions in support tickets. AI agent processes request with god-mode `service_role` key and leaks sensitive data.

**Prevention:**
- Never give AI agents `service_role` access
- Use `authenticated` role with proper RLS policies
- Implement additional application-level checks
- Sanitize user input before AI processing

**Confidence:** MEDIUM (Emerging threat identified in 2025-2026)

**Sources:**
- [Supabase Security Flaw: 170+ Apps Exposed by Missing RLS](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/)

---

### MODERATE: Multi-Tenant Schema Design Mistakes

**What goes wrong:** Choosing the wrong multi-tenant strategy causes scalability or security issues.

**Three approaches:**

#### 1. Shared Schema with tenant_id (Recommended for this project)
**Pros:**
- Simple to implement
- Works well for thousands of tenants
- Cost-effective

**Cons:**
- Risk of data leakage (mitigated with RLS)
- Every query must filter by `tenant_id`

**Best practices:**
- Denormalize `tenant_id` onto every table
- Use RLS to enforce filtering automatically
- Add explicit `.eq('tenant_id', tenantId)` in queries (helps query optimizer)

#### 2. Schema-per-Tenant
**Pros:**
- Strong logical isolation
- Impossible to accidentally query another tenant's data

**Cons:**
- Limited to several thousand tenants
- Complex migrations (must run against all schemas)

#### 3. Database-per-Tenant
**Pros:**
- Physical isolation
- Easiest to scale individual tenants

**Cons:**
- Expensive
- Complex connection pooling

**Recommendation:** Use **shared schema with RLS** for Pinterest scheduling dashboard. Mature pattern, cost-effective, and proven at scale.

**Confidence:** HIGH (PostgreSQL best practices)

**Sources:**
- [Designing Your Postgres Database for Multi-tenancy | Crunchy Data Blog](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)
- [Multitenant Database Designs Strategies with PostgreSQL](https://techtonics.medium.com/multitenant-database-designs-strategies-with-postgresql-55a9e3ec882c)
- [Multi-tenant data isolation with PostgreSQL Row Level Security | AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)

---

## UI Pitfalls (Calendar & Image Gallery)

### CRITICAL: Calendar Performance with Large Datasets

**What goes wrong:** Calendar UI becomes unresponsive and laggy with 1000+ scheduled posts.

**Why it happens:**
- Rendering all events at once overwhelms the DOM
- Complex date calculations per render
- No virtualization for off-screen dates
- Re-rendering entire calendar on every state change

**Real-world examples:**
- FullCalendar GitHub issue: 5000 resources caused UI to freeze
- jqxScheduler reported performance limitations with many appointments

**Prevention strategies:**

#### 1. Use Virtualization
Only render events visible in current viewport. Libraries with built-in virtualization:
- **Bryntum React Calendar** (optimized for large datasets)
- **Syncfusion Scheduler** (virtual scrolling + lazy loading)

#### 2. Leverage React 18+ Concurrent Features
```tsx
import { useTransition } from 'react';

function Calendar() {
  const [isPending, startTransition] = useTransition();

  const handleDateChange = (newDate) => {
    startTransition(() => {
      // Mark non-urgent update
      // React prioritizes user interactions
      setCurrentDate(newDate);
    });
  };
}
```

#### 3. Implement Pagination/Date Range Loading
- Load only current month's events by default
- Lazy-load adjacent months on demand
- Use TanStack Query for caching and background updates

#### 4. Offload Heavy Computations to Web Workers
```tsx
// In Web Worker
self.addEventListener('message', (e) => {
  const { events } = e.data;
  const filtered = events.filter(/* complex logic */);
  self.postMessage(filtered);
});
```

#### 5. Optimize TanStack Query Cache
```tsx
useQuery({
  queryKey: ['posts', tenantId, month],
  queryFn: fetchPostsForMonth,
  staleTime: 5 * 60 * 1000, // 5 minutes
  // Don't refetch on every render
  refetchOnWindowFocus: false,
});
```

**Library recommendations:**
- **dnd-kit** for drag-and-drop (10kb, zero dependencies, high performance)
- **Bryntum** or **Syncfusion** for enterprise-grade calendar performance

**Confidence:** HIGH (Performance benchmarks + 2026 library comparisons)

**Sources:**
- [React FullCalendar vs Big Calendar - Bryntum](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/)
- [How To Render Large Datasets In React without Killing Performance](https://www.syncfusion.com/blogs/post/render-large-datasets-in-react)
- [React Scheduler: Large Datasets and Performance | DayPilot Code](https://code.daypilot.org/88405/react-scheduler-large-datasets-and-performance)
- [Best React scheduler component libraries - LogRocket Blog](https://blog.logrocket.com/best-react-scheduler-component-libraries/)

---

### MODERATE: TanStack Query Cache Invalidation Issues

**What goes wrong:** Stale UI bugs appear weeks later. After mutations, unclear which queries should be invalidated.

**Why it happens:**
- Manual cache invalidation is error-prone
- Forgetting to invalidate related queries
- Over-invalidating causes unnecessary refetches

**Common patterns:**

#### Problem: Handwritten Invalidation
```tsx
// After creating a post, which queries need invalidation?
await createPost(data);
queryClient.invalidateQueries(['posts']); // Lists?
queryClient.invalidateQueries(['post', id]); // Details?
queryClient.invalidateQueries(['calendar']); // Calendar view?
// Easy to miss queries
```

#### Solution 1: Targeted Invalidation
```tsx
// Use query key prefixes
await createPost(data);
queryClient.invalidateQueries({
  queryKey: ['posts'], // Invalidates ALL queries starting with ['posts']
});
```

#### Solution 2: Generated Cache Keys (2026 Best Practice)
```tsx
// Auto-generate cache keys and invalidation
// Recent article suggests this approach to avoid manual errors
const postQueries = {
  all: () => ['posts'] as const,
  lists: () => [...postQueries.all(), 'list'] as const,
  list: (filters) => [...postQueries.lists(), filters] as const,
  details: () => [...postQueries.all(), 'detail'] as const,
  detail: (id) => [...postQueries.details(), id] as const,
};
```

#### Solution 3: Predicate-Based Invalidation
```tsx
queryClient.invalidateQueries({
  predicate: (query) =>
    query.queryKey[0] === 'posts' &&
    query.state.data?.tenantId === currentTenantId,
});
```

**Important behaviors:**
- `invalidateQueries` marks queries as stale (overrides `staleTime`)
- Active queries refetch automatically by default
- Use `refetchType: 'none'` to mark stale without refetching

**Confidence:** HIGH (Official TanStack Query documentation)

**Sources:**
- [Query Invalidation | TanStack Query React Docs](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation)
- [We kept breaking cache invalidation in TanStack Query — so we stopped managing it manually](https://dev.to/ignasave/we-kept-breaking-cache-invalidation-in-tanstack-query-so-we-stopped-managing-it-manually-47k2)

---

### MODERATE: Image Gallery Drag-and-Drop Performance

**What goes wrong:** Dragging images feels janky, with dropped frames and UI lag.

**Why it happens:**
- Heavy library abstractions add overhead
- Re-rendering entire gallery on every drag move
- Large image previews not optimized
- No virtualization for galleries with 50+ images

**Prevention:**

#### 1. Choose Performance-Optimized Libraries (2026)
**Best: dnd-kit**
- 10kb minified, zero dependencies
- Built around React state management and context
- Exposes `useDraggable` and `useDroppable` hooks
- No additional wrapper DOM nodes
- Silky smooth animations

**Acceptable: hello-pangea/dnd** (fork of react-beautiful-dnd)
- Good for kanban-style UIs
- Higher-level abstraction = more overhead
- Use only if you need built-in list animations

**Avoid: HTML5 API directly** (unless very simple use case)
- No dependencies but limited flexibility
- Fine for basic single-file uploads

#### 2. Optimize Image Rendering
```tsx
// Use Supabase image transformations
const thumbnailUrl = supabase.storage
  .from('pins')
  .getPublicUrl(path, {
    transform: {
      width: 200,
      height: 200,
      resize: 'cover',
      quality: 80,
    }
  });
```

#### 3. Implement Virtualization for Large Galleries
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function ImageGallery({ images }) {
  const rowVirtualizer = useVirtualizer({
    count: images.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
  });
  // Only render visible images
}
```

**Confidence:** HIGH (Library benchmarks + 2026 comparisons)

**Sources:**
- [Top 5 Drag-and-Drop Libraries for React in 2026 | Puck](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)
- [New React Drag and Drop Libraries 2026](https://libs.tech/react/drag-and-drop-libraries)
- [10 Best Drag And Drop Components For React (2026 Update)](https://reactscript.com/best-drag-drop/)

---

### MODERATE: Supabase Storage Image Upload Issues

**What goes wrong:**
- Users upload 10MB+ images, hitting upload limits
- Slow upload times frustrate users
- Storage costs skyrocket with unoptimized images
- Image transformations exceed quota on Pro plan

**Prevention:**

#### 1. Client-Side Compression Before Upload
```tsx
import imageCompression from 'browser-image-compression';

async function handleImageUpload(file) {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 2000,
    useWebWorker: true,
  };

  const compressedFile = await imageCompression(file, options);
  await supabase.storage.from('pins').upload(path, compressedFile);
}
```

#### 2. Set Bucket Upload Limits
```sql
-- Prevent excessively large uploads
ALTER TABLE storage.buckets
SET file_size_limit = 5242880; -- 5MB limit
```

#### 3. Use Supabase Image Transformations Wisely
- Auto-converts to WebP for Chrome (smaller file size)
- Resize on-the-fly: `?width=800&height=600`
- Set quality: `?quality=80`
- **Warning:** Image transformations enabled for Pro Plan and above
- Use Smart CDN to reduce transformation costs (higher cache hit rate)

#### 4. Leverage Browser Caching
```tsx
// High cache-control values reduce egress costs
const { data } = supabase.storage
  .from('pins')
  .getPublicUrl(path, {
    download: false,
    transform: { width: 800 },
  });
// Supabase sets appropriate Cache-Control headers
```

#### 5. Monitor Image Transformation Usage
Track usage in Supabase dashboard to avoid unexpected costs.

**Confidence:** HIGH (Official Supabase documentation + real-world case study showing 48% reduction)

**Sources:**
- [Storage Optimizations | Supabase Docs](https://supabase.com/docs/guides/storage/production/scaling)
- [Storage Image Transformations | Supabase Docs](https://supabase.com/docs/guides/storage/serving/image-transformations)
- [Client-side image compression with Supabase Storage](https://mikeesto.com/posts/supabaseimagecompression/)
- [How I Reduced Supabase Storage Image Transformed by 48%?](https://medium.com/@muhaimincs/how-i-reduced-supabase-storage-image-transformed-by-48-8ff0949eaa7)

---

## Integration Pitfalls (n8n + Pinterest API)

### MODERATE: n8n Webhook Reliability Issues

**What goes wrong:**
- Workflows return 500 errors on execution failure
- Missing webhook responses leave client hanging
- Self-hosted instances have configuration issues

**Common problems:**

#### 1. Queue Mode 500 Errors
**Issue:** In queue mode, "Respond to Webhook" node returns 500 when there's an execution error.

**Fix:** January 2026 update addressed this issue. Keep n8n updated to latest version.

#### 2. Webhook Never Executes "Respond to Webhook"
**Behavior:**
- If workflow errors before first "Respond to Webhook" node: returns 500 error
- If workflow finishes without executing "Respond to Webhook": returns 200 with standard message

**Prevention:**
- Always include error handling flows
- Ensure every path leads to a webhook response
- Use try-catch patterns with "Respond to Webhook" in both branches

#### 3. Self-Hosted Configuration
**Critical:** `WEBHOOK_URL` environment variable is the most important config for webhook reliability.

```env
# Self-hosted n8n
WEBHOOK_URL=https://your-domain.com/
N8N_HOST=your-domain.com
N8N_PROTOCOL=https
```

**Best practices:**
- Test webhooks in staging before production
- Implement error handling mechanisms
- Keep n8n instance updated (many bug fixes in January 2026 release)
- Use CIDR matching for IP whitelist (security + reliability)

**Confidence:** HIGH (Official documentation + January 2026 release notes)

**Sources:**
- [n8n Release Notes - January 2026 Latest Updates](https://releasebot.io/updates/n8n)
- [Respond to Webhook | n8n Docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/)
- [Error handling | n8n Docs](https://docs.n8n.io/flow-logic/error-handling/)
- [Fixing n8n Webhook Problems: The Complete Troubleshooting Guide for Self-Hosted Instances](https://blog.tamertemel.net/2025/09/25/fixing-n8n-webhook-problems-the-complete-troubleshooting-guide-for-self-hosted-instances/)
- [Why n8n Webhooks Fail in Production: Fix Them Now](https://prosperasoft.com/blog/automation-tools/n8n/n8n-webhook-failures-production/)

---

### MODERATE: Pinterest API Rate Limiting

**What goes wrong:** Hitting rate limits causes failed post scheduling, angry users, and potential account suspension.

**Pinterest rate limits:**
- **Universal limit:** 100 calls per second per user per app (all endpoints)
- **Trial access:** Daily limits
- **Standard access:** Per-minute limits (varies by category)
  - `ads_analytics`: 300 calls/minute/user
  - `ads_conversions`: 5,000 calls/minute/ad account
- **General limit:** ~1,000 requests per hour (unofficial but widely reported)

**Important:**
- Rate limits shared across all endpoints in same category
- User requests also count against Pinterest's unpublished user limits
- Rate limits subject to change without notice

**Prevention strategies:**

#### 1. Implement Queue System in n8n
```
Queue posts in database →
n8n workflow runs every 5 minutes →
Processes batch with rate limit awareness →
Updates status in database
```

#### 2. Respect Rate Limit Headers
```tsx
// Check rate limit info in Pinterest API responses
const remaining = response.headers['x-ratelimit-remaining'];
const reset = response.headers['x-ratelimit-reset'];

if (remaining < 10) {
  // Pause or queue requests
}
```

#### 3. Distribute Requests Over Time
- Don't schedule all posts at once
- Batch process with delays between calls
- Use exponential backoff on 429 errors

#### 4. Cache Pinterest Data
- Cache board lists, user profiles
- Don't refetch on every page load
- Use TanStack Query with appropriate `staleTime`

#### 5. Monitor Usage
- Log API calls per hour/day
- Alert before hitting limits
- Show users remaining quota

**Confidence:** HIGH (Official Pinterest developer documentation)

**Sources:**
- [rate limits | Pinterest Developers](https://developers.pinterest.com/docs/reference/rate-limits/)
- [Pinterest API 2026: Complete Developer Documentation](https://getlate.dev/blog/pinterest-api)
- [What is the Rate Limit for Pinterest API? Insights & Guidelines](https://medium.com/@jasoon_10023/what-is-the-rate-limit-for-pinterest-api-insights-guidelines-4557cdf870ed)

---

### MODERATE: n8n to TanStack Start Communication

**What goes wrong:**
- Webhook calls from n8n fail authentication
- Payload validation errors
- Timeout issues with long-running workflows
- Network errors in production

**Prevention:**

#### 1. Authentication Strategy
```tsx
// Option A: API Key in Header
// n8n sends: Authorization: Bearer <api_key>
// TanStack Start validates in middleware

// Option B: Webhook Secret
// n8n signs payload with HMAC
// TanStack Start verifies signature
```

#### 2. Payload Validation
```tsx
import { z } from 'zod';

const PinterestWebhookSchema = z.object({
  postId: z.string(),
  status: z.enum(['scheduled', 'published', 'failed']),
  tenantId: z.string(),
  error: z.string().optional(),
});

// In server function
export const handlePinterestWebhook = createServerFn('POST', async (data) => {
  const validated = PinterestWebhookSchema.parse(data);
  // Now type-safe!
});
```

#### 3. Timeout Handling
- Set appropriate timeouts on n8n side
- Implement retry logic for transient failures
- Use async workflows for long-running tasks (respond immediately, process in background)

#### 4. Error Handling
```tsx
// In TanStack Start
export const handleWebhook = createServerFn('POST', async (data) => {
  try {
    await processWebhook(data);
    return { success: true };
  } catch (error) {
    console.error('Webhook processing failed', error);
    // Still return 200 to prevent n8n retries for invalid data
    return { success: false, error: 'Invalid payload' };
  }
});
```

**Confidence:** MEDIUM (Best practices synthesis)

---

## Migration Pitfalls (Airtable to Supabase)

### CRITICAL: Formula Field Conversion

**What goes wrong:** Airtable formula fields don't have direct Supabase equivalents, requiring manual SQL refactoring.

**Why it happens:** Airtable formulas use JavaScript-like syntax. PostgreSQL uses SQL expressions or functions.

**Examples:**

| Airtable Formula | Supabase Equivalent |
|------------------|---------------------|
| `CONCATENATE({First}, " ", {Last})` | `first_name || ' ' || last_name` |
| `IF({Status} = "Done", "✓", "✗")` | `CASE WHEN status = 'Done' THEN '✓' ELSE '✗' END` |
| `DATETIME_FORMAT({Created}, "YYYY-MM-DD")` | `TO_CHAR(created, 'YYYY-MM-DD')` |

**Prevention:**
1. **Audit all formula fields** before migration
2. **Document formula logic** (many formulas encode business rules)
3. **Decide per formula:**
   - Convert to computed column (Postgres generated column)
   - Convert to database view
   - Move to application layer
   - Create PostgreSQL function

**Example migration:**
```sql
-- Airtable formula: CONCATENATE({Title}, " - ", {Date})
-- Becomes Postgres generated column:

ALTER TABLE posts
ADD COLUMN display_name TEXT
GENERATED ALWAYS AS (title || ' - ' || created_at::date) STORED;
```

**Effort:** High for complex formulas. Budget significant time for this.

**Confidence:** HIGH (Multiple migration guides confirm this challenge)

**Sources:**
- [Why Your Startup Should Move from Airtable to Supabase in 2026](https://www.closefuture.io/blogs/airtable-to-supabase-migration-for-startups)
- [Moving from Airtable to Xano or Supabase - who has done it?](https://community.softr.io/t/moving-from-airtable-to-xano-or-supabase-who-has-done-it/10913)

---

### CRITICAL: Linked Records to Foreign Keys

**What goes wrong:** Most ETL tools don't support Airtable linked records (foreign keys), causing data relationship loss.

**Why it happens:**
- Airtable linked records are many-to-many by default
- PostgreSQL foreign keys are different structure
- Mapping requires understanding relationship cardinality

**Example:**
```
Airtable:
- Posts table with "Boards" linked record (many-to-many)

Supabase options:
1. Junction table (if truly many-to-many):
   posts_boards: post_id, board_id

2. Foreign key (if one-to-many):
   posts: board_id references boards(id)
```

**Prevention:**
1. **Map all linked record relationships** before migration
2. **Determine cardinality** (one-to-many vs many-to-many)
3. **Use migration tools that support linked records:**
   - Whalesync (handles linked records)
   - Supabase Airtable Wrapper (Foreign Data Wrappers)
   - Custom script using Airtable API
4. **Test with small dataset** before full migration

**Confidence:** HIGH (Reported as major blocker in community discussions)

**Sources:**
- [Moving from Airtable to Xano or Supabase - who has done it?](https://community.softr.io/t/moving-from-airtable-to-xano-or-supabase-who-has-done-it/10913)
- [Syncing Airtable to a postgreSQL database with an ETL solution](https://community.airtable.com/development-apis-11/syncing-airtable-to-a-postgresql-database-with-an-etl-solution-like-estuary-airrtable-as-a-backend-4794)

---

### MODERATE: Automation Loss During Migration

**What goes wrong:** Airtable automations don't transfer to Supabase, breaking business workflows.

**Why it happens:** Airtable automations are proprietary. Supabase has different automation mechanisms (triggers, functions, webhooks).

**Migration path:**
1. **Document all Airtable automations** (what they do, when they trigger)
2. **Recreate in new stack:**
   - PostgreSQL triggers for database events
   - Supabase Edge Functions for complex logic
   - n8n workflows for external integrations
   - Scheduled jobs for time-based automations

**Example:**
```
Airtable automation: "When post status changes to 'Approved', send to n8n webhook"

Supabase equivalent:
1. PostgreSQL trigger on posts table
2. Calls Supabase Edge Function
3. Edge Function sends to n8n webhook
```

**Confidence:** MEDIUM (Synthesis from migration guides)

**Sources:**
- [Why Your Startup Should Move from Airtable to Supabase in 2026](https://www.closefuture.io/blogs/airtable-to-supabase-migration-for-startups)

---

### MODERATE: Schema Design During Migration

**What goes wrong:** Directly mapping Airtable structure to Supabase creates poor schema design, leading to performance issues.

**Why it happens:** Airtable is flexible/denormalized. Proper relational database design requires normalization and optimization.

**Prevention:**

#### 1. Don't Blindly Copy Schema
- Airtable's structure optimized for no-code flexibility
- Redesign for relational database best practices

#### 2. Normalize Data
```
Airtable: Single table with comma-separated tags

Supabase:
- posts table
- tags table
- posts_tags junction table (many-to-many)
```

#### 3. Add Proper Indexes
```sql
-- Essential for multi-tenant queries
CREATE INDEX idx_posts_tenant_id ON posts(tenant_id);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_scheduled_at ON posts(scheduled_at);
```

#### 4. Use Database Constraints
```sql
ALTER TABLE posts
ADD CONSTRAINT valid_status
CHECK (status IN ('draft', 'scheduled', 'published', 'failed'));
```

**Confidence:** HIGH (PostgreSQL migration best practices)

**Sources:**
- [Why Your Startup Should Move from Airtable to Supabase in 2026](https://www.closefuture.io/blogs/airtable-to-supabase-migration-for-startups)
- [Designing Your Postgres Database for Multi-tenancy](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy)

---

### MODERATE: Query Performance Gotcha (Foreign Data Wrappers)

**What goes wrong:** Using Supabase's Airtable Wrapper for live access causes terrible performance.

**Why it happens:** "No query pushdown support" — all filtering must be done locally. Wrapper fetches ALL data, then filters.

**Example:**
```sql
-- Airtable table with 100,000 records
-- You want latest 100 orders for specific customer

SELECT * FROM airtable_wrapper.orders
WHERE customer_id = '123'
ORDER BY created_at DESC
LIMIT 100;

-- Reality: Fetches all 100,000 records over API,
-- THEN filters locally. Slow and rate-limit prone.
```

**Recommendation:** Use Airtable Wrapper only for one-time migration, NOT production queries.

**Confidence:** HIGH (Official limitation in Supabase docs)

**Sources:**
- [Airtable | Supabase Docs](https://supabase.com/docs/guides/database/extensions/wrappers/airtable)

---

### MODERATE: Technical Complexity Underestimation

**What goes wrong:** Teams underestimate engineering resources needed for migration.

**Why it happens:** "Supabase is the technical heavyweight" — requires SQL knowledge, developer time, ongoing maintenance.

**Reality check:**
- Airtable: No-code, formulas in UI, automations with clicks
- Supabase: SQL schemas, triggers in Postgres, RLS policies, Edge Functions

**Prevention:**
1. **Budget 2-3x expected time** for migration
2. **Hire/train SQL expertise** if team lacks it
3. **Plan phased rollout** (don't big-bang cutover)
4. **Keep Airtable running** during transition (parallel systems)
5. **Use migration tools** (Whalesync, n8n) to reduce custom code

**Migration tool comparison:**

| Tool | Pros | Cons |
|------|------|------|
| **Whalesync** | Handles linked records, two-way sync | Paid service |
| **n8n** | Flexible, self-hosted option | Requires workflow building |
| **Supabase Wrapper** | Built-in, simple setup | Poor performance (no query pushdown) |
| **Custom API script** | Full control | High engineering time |

**Confidence:** HIGH (Consistent theme across migration discussions)

**Sources:**
- [Why Your Startup Should Move from Airtable to Supabase in 2026](https://www.closefuture.io/blogs/airtable-to-supabase-migration-for-startups)
- [Moving from Airtable to Xano or Supabase - who has done it?](https://community.softr.io/t/moving-from-airtable-to-xano-or-supabase-who-has-done-it/10913)
- [Should I switch from Airtable to Supabase when using n8n workflows?](https://community.latenode.com/t/should-i-switch-from-airtable-to-supabase-when-using-n8n-workflows/20358)

---

## Domain-Specific Pitfalls (Pinterest Scheduling)

### MODERATE: Over-Scheduling & Spam Detection

**What goes wrong:** Posting too frequently triggers Pinterest's spam detection, harming account performance or causing suspension.

**Pinterest best practices:**
- Balance automation with genuine engagement
- Follow 80/20 rule (80% curated, 20% self-promotion)
- Don't repost same graphic repeatedly (create variations)
- Maintain consistent posting schedule (not erratic bursts)

**Prevention:**
- Implement daily/weekly post limits per account
- Add variation requirements (can't schedule identical images)
- Show users warning if exceeding recommended frequency
- Space posts throughout day (not all at once)

**Confidence:** HIGH (Multiple Pinterest scheduling guides from 2026)

**Sources:**
- [How to Schedule Pinterest Posts in 2026 for Maximum Traffic](https://www.socialchamp.com/blog/schedule-pinterest-posts/)
- [Free Pinterest Scheduler for Scheduling Pins in 2026](https://planable.io/blog/pinterest-scheduler/)
- [Best Pinterest Scheduler Tools 2026](https://socialrails.com/blog/best-pinterest-scheduler-tools-guide)

---

### MODERATE: Set-and-Forget Mentality

**What goes wrong:** Users schedule posts months in advance, then never check performance metrics or adjust strategy.

**Why it's a problem:**
- Pinterest algorithm changes over time
- Audience preferences shift
- What worked in Q1 may not work in Q4
- Broken links or outdated content hurts brand

**Prevention (product features):**
- **Analytics dashboard** showing post performance
- **Alerts** for underperforming posts
- **Recommendations** based on analytics (best times to post, top-performing boards)
- **Regular prompts** to review scheduled content
- **Broken link checker** before posts go live

**Confidence:** MEDIUM (Pinterest marketing best practices)

**Sources:**
- [How to Schedule Pinterest Posts in 2026 for Maximum Traffic](https://www.socialchamp.com/blog/schedule-pinterest-posts/)
- [Best Pinterest Scheduler Tools 2026](https://socialrails.com/blog/best-pinterest-scheduler-tools-guide)

---

### MINOR: Technical Content Quality Issues

**What goes wrong:** Scheduling broken links, low-resolution images, irrelevant board assignments, hashtag overuse.

**Prevention:**
- **Image quality validation:** Reject images below minimum resolution
- **Link validation:** Check URL responds with 200 before scheduling
- **Board relevance check:** AI-powered suggestion or user confirmation
- **Hashtag limits:** Cap at 3-5 hashtags per pin (Pinterest best practice)

**Confidence:** MEDIUM (Pinterest best practices)

**Sources:**
- [How to Schedule Pinterest Posts in 2026 for Maximum Traffic](https://www.socialchamp.com/blog/schedule-pinterest-posts/)

---

## Prevention Strategies Summary

### Phase 1: Foundation (Highest Priority)

**Prevent data leakage:**
1. Enable RLS on all tables before any production data
2. Implement `tenant_id` on every table
3. Create RLS policies for authenticated role
4. Test with multiple tenant accounts
5. Run Supabase Security Advisor

**Prevent hydration errors:**
1. Use cookies for user preferences (not localStorage)
2. Avoid browser APIs during SSR
3. Implement error boundaries
4. Test SSR/CSR consistency

**Prevent auth issues:**
1. Choose TanStack Start-compatible auth provider
2. Implement middleware for server function protection
3. Use secure cookie configuration
4. Test session management thoroughly

### Phase 2: Performance Optimization

**Prevent calendar performance issues:**
1. Use virtualization library (Bryntum or Syncfusion)
2. Implement date range loading (not all data at once)
3. Leverage React 18 concurrent features
4. Add proper TanStack Query caching

**Prevent RLS performance degradation:**
1. Add indexes on `tenant_id`, `user_id`, `status`, `scheduled_at`
2. Wrap auth functions in SELECT statements
3. Specify roles explicitly in policies
4. Monitor query performance in production

**Prevent image upload issues:**
1. Implement client-side compression before upload
2. Set bucket upload limits
3. Use Supabase image transformations wisely
4. Enable Smart CDN caching

### Phase 3: Integration Reliability

**Prevent n8n webhook failures:**
1. Configure `WEBHOOK_URL` environment variable correctly
2. Implement error handling in all workflow paths
3. Always include "Respond to Webhook" node
4. Keep n8n updated (January 2026+ for bug fixes)

**Prevent Pinterest API rate limiting:**
1. Implement queue system in n8n
2. Respect rate limit headers
3. Distribute requests over time
4. Monitor and alert on usage

**Prevent cache invalidation bugs:**
1. Use generated cache keys (not handwritten)
2. Implement targeted invalidation with query key prefixes
3. Document invalidation strategy per mutation
4. Test cache invalidation in development

### Phase 4: Migration Execution

**Prevent formula conversion issues:**
1. Audit all Airtable formula fields before migration
2. Document business logic in formulas
3. Budget significant time for conversion
4. Test converted formulas with real data

**Prevent linked record loss:**
1. Map all relationships before migration
2. Determine cardinality (one-to-many vs many-to-many)
3. Use tool that supports linked records (Whalesync)
4. Validate relationships after migration

**Prevent automation loss:**
1. Document all Airtable automations
2. Design PostgreSQL trigger equivalents
3. Create n8n workflows for external integrations
4. Test automation logic before cutover

**Prevent schema design issues:**
1. Don't blindly copy Airtable structure
2. Normalize data properly
3. Add proper indexes from day one
4. Use database constraints for data integrity

### Phase 5: Domain-Specific (Pinterest)

**Prevent spam detection:**
1. Implement daily post limits per account
2. Add variation requirements for images
3. Space posts throughout day
4. Show users best practice warnings

**Prevent set-and-forget problems:**
1. Build analytics dashboard showing performance
2. Add alerts for underperforming content
3. Prompt users to review scheduled posts regularly
4. Implement broken link checking

**Prevent content quality issues:**
1. Validate image resolution before scheduling
2. Check URL validity before publishing
3. AI-powered board relevance suggestions
4. Cap hashtags at 3-5 per pin

---

## Research Confidence Assessment

| Area | Confidence | Source Quality |
|------|------------|----------------|
| TanStack Start pitfalls | HIGH | Official docs + 2026 guides |
| Supabase RLS security | CRITICAL | Official docs + CVE reports |
| Multi-tenant design | HIGH | PostgreSQL best practices |
| Calendar performance | HIGH | Benchmarks + library comparisons |
| n8n webhook reliability | HIGH | Official docs + Jan 2026 release notes |
| Pinterest API limits | HIGH | Official Pinterest developer docs |
| Airtable migration | HIGH | Multiple community reports |
| Pinterest best practices | MEDIUM | Marketing guides (not technical) |
| Cache invalidation | HIGH | Official TanStack Query docs |
| Image optimization | HIGH | Official Supabase docs + case study |

---

## Open Questions & Future Research Needs

### Questions Not Fully Resolved:

1. **Supabase Auth with TanStack Start Edge Functions**
   - JWT signing key transition implications unclear
   - Need to verify auth flow in TanStack Start context
   - Research flag for Authentication phase

2. **Calendar Library Final Choice**
   - Bryntum vs. Syncfusion pricing/licensing
   - dnd-kit integration patterns with calendar
   - Research flag for Calendar UI phase

3. **n8n OAuth Flow with Pinterest**
   - How to handle OAuth refresh token rotation
   - User experience for connecting Pinterest accounts
   - Research flag for Pinterest Integration phase

4. **Real-World Multi-Tenant Scale Testing**
   - At what tenant count does shared schema approach break down?
   - Connection pooling strategy for 1000+ tenants
   - Research flag for Scaling phase

5. **Airtable Migration Tool Evaluation**
   - Whalesync pricing vs. custom script cost
   - n8n migration workflow reliability at scale
   - Research flag for Migration Execution phase

---

## Key Takeaways for Roadmap

### Critical Path Items:

1. **Multi-tenant security MUST be phase 1** — No production data before RLS
2. **Calendar performance needs early prototyping** — Library choice affects architecture
3. **Migration complexity is high** — Budget 2-3x expected time
4. **n8n reliability improved in Jan 2026** — Use latest version

### Phase Ordering Recommendations:

```
Phase 1: Foundation + Security
├─ Multi-tenant RLS setup (CRITICAL)
├─ Auth implementation (with TanStack Start patterns)
└─ Basic CRUD with proper RLS testing

Phase 2: Core Scheduling Features
├─ Calendar UI (with performance testing)
├─ Image upload with optimization
└─ TanStack Query cache strategy

Phase 3: Pinterest Integration
├─ n8n webhook infrastructure
├─ Pinterest API integration (via n8n)
└─ Rate limit handling

Phase 4: Migration Tooling
├─ Airtable data extraction
├─ Formula conversion
├─ Linked record mapping
└─ Automation recreation

Phase 5: Polish & Scale
├─ Analytics dashboard
├─ Performance optimization
└─ Domain-specific features (spam prevention, etc.)
```

### Phases Likely Needing Deeper Research:

- **Phase 1 (Auth):** TanStack Start + Supabase Auth integration patterns
- **Phase 2 (Calendar):** Library evaluation and performance testing
- **Phase 3 (Pinterest):** OAuth flow UX and error handling
- **Phase 4 (Migration):** Tool selection and testing with real Airtable data

### Phases Unlikely to Need Additional Research:

- Basic CRUD operations (well-documented patterns)
- Multi-tenant RLS setup (comprehensive docs available)
- Image upload/storage (Supabase docs are thorough)
- n8n webhook basics (official docs + recent updates)

---

## Sources Summary

### Official Documentation (Highest Confidence)
- [TanStack Start Official Docs](https://tanstack.com/start/latest)
- [Supabase Official Docs](https://supabase.com/docs)
- [n8n Official Docs](https://docs.n8n.io/)
- [Pinterest API Developer Docs](https://developers.pinterest.com/docs/api/v5/)

### Security & Best Practices (High Confidence)
- [Supabase Security Flaw: 170+ Apps Exposed by Missing RLS](https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/)
- [Multi-tenant data isolation with PostgreSQL RLS | AWS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Top 5 authentication solutions for secure TanStack Start apps in 2026](https://workos.com/blog/top-authentication-solutions-tanstack-start-2026)

### Performance & Optimization (High Confidence)
- [React FullCalendar vs Big Calendar - Bryntum](https://bryntum.com/blog/react-fullcalendar-vs-big-calendar/)
- [How To Render Large Datasets In React without Killing Performance](https://www.syncfusion.com/blogs/post/render-large-datasets-in-react)
- [Top 5 Drag-and-Drop Libraries for React in 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)

### Migration Guides (Medium-High Confidence)
- [Why Your Startup Should Move from Airtable to Supabase in 2026](https://www.closefuture.io/blogs/airtable-to-supabase-migration-for-startups)
- [Moving from Airtable to Xano or Supabase - who has done it?](https://community.softr.io/t/moving-from-airtable-to-xano-or-supabase-who-has-done-it/10913)

### Domain-Specific (Medium Confidence)
- [How to Schedule Pinterest Posts in 2026 for Maximum Traffic](https://www.socialchamp.com/blog/schedule-pinterest-posts/)
- [Best Pinterest Scheduler Tools 2026](https://socialrails.com/blog/best-pinterest-scheduler-tools-guide)

---

**Research complete.** Ready for roadmap creation with comprehensive pitfall awareness.
