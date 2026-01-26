# Architecture Research: Pinterest Scheduling Dashboard

**Project:** Petra Pinterest
**Stack:** TanStack Start + Nitro + Supabase + n8n
**Researched:** 2026-01-26
**Confidence:** MEDIUM (verified patterns from official docs, some areas need validation)

## Executive Summary

This Pinterest scheduling dashboard requires careful coordination between client UI, serverless functions, multi-tenant database architecture, external n8n workflows, and background processing—all within Vercel's serverless constraints. The architecture must balance immediate user feedback with deferred background work, maintain strict data isolation per tenant, and handle Pinterest API operations through n8n webhooks.

**Key architectural decisions:**
1. **Multi-tenant RLS** enforces data isolation at the database level
2. **n8n webhook communication** uses bidirectional patterns (trigger + callback)
3. **Background jobs** must work around Vercel's 10-60 second limits
4. **File organization** follows TanStack Start conventions with server functions
5. **Real-time updates** use Supabase Broadcast for status changes

---

## 1. Data Model

### Core Tables

```sql
-- Users table (managed by Supabase Auth)
-- auth.users provides: id, email, created_at, etc.

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT gen_random_uuid(),
  display_name TEXT,
  pinterest_connected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts (scheduled Pinterest pins)
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  alt_text TEXT,
  link TEXT,

  -- Pinterest metadata
  board_id TEXT,
  board_name TEXT,

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, publishing, published, failed

  -- Media
  image_url TEXT,
  image_path TEXT, -- Supabase Storage path

  -- AI generation tracking
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_metadata JSONB,

  -- n8n workflow tracking
  n8n_execution_id TEXT,
  n8n_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes for performance
  INDEX idx_posts_tenant_id (tenant_id),
  INDEX idx_posts_user_id (user_id),
  INDEX idx_posts_scheduled_at (scheduled_at),
  INDEX idx_posts_status (status)
);

-- Scraping jobs (blog post imports)
CREATE TABLE scraping_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source
  source_url TEXT NOT NULL,
  source_type TEXT DEFAULT 'blog', -- blog, rss, custom

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  progress INTEGER DEFAULT 0, -- 0-100

  -- Results
  posts_created INTEGER DEFAULT 0,
  error_message TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_scraping_jobs_tenant_id (tenant_id),
  INDEX idx_scraping_jobs_status (status)
);

-- AI generation queue
CREATE TABLE ai_generation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,

  -- Generation config
  generation_type TEXT NOT NULL, -- title, description, alt_text, all
  context JSONB, -- original blog content, image analysis, etc.

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER DEFAULT 0,
  error_message TEXT,

  -- Rate limiting
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_ai_queue_tenant_id (tenant_id),
  INDEX idx_ai_queue_status_scheduled (status, scheduled_for)
);

-- Pinterest boards (cached from Pinterest API)
CREATE TABLE pinterest_boards (
  id TEXT PRIMARY KEY, -- Pinterest board ID
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  privacy TEXT, -- public, protected, secret

  -- Caching
  cached_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_boards_tenant_id (tenant_id)
);
```

### Relationships

```
profiles (1) ──< (many) posts
profiles (1) ──< (many) scraping_jobs
posts (1) ──< (many) ai_generation_queue
profiles (1) ──< (many) pinterest_boards
```

### Design Rationale

**tenant_id on every table:** Required for RLS policies. Even though user_id provides isolation, tenant_id enables future team/organization features where multiple users share data.

**Separate status tracking:** Posts have `status`, scraping jobs have `status`, AI queue has `status`—each represents different lifecycle states.

**n8n_execution_id:** Enables bidirectional communication—when n8n calls back, we can match the response to the original post.

**JSONB fields:** `ai_metadata` and `context` store flexible data without schema migrations.

---

## 2. Multi-Tenancy with Row-Level Security

### Pattern: Shared Tables + RLS

**Architecture choice:** Use shared tables with `tenant_id` column, not schema-per-tenant. This provides sufficient isolation for B2C SaaS while keeping database management simple.

### Tenant ID Assignment

On user signup:
```sql
-- Trigger function to auto-create profile with tenant_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, tenant_id)
  VALUES (NEW.id, gen_random_uuid());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### RLS Policies

**Enable RLS on all tables:**
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE pinterest_boards ENABLE ROW LEVEL SECURITY;
```

**Policy pattern (example for posts table):**
```sql
-- SELECT: Users can only see their own tenant's posts
CREATE POLICY "Users can view own tenant posts"
  ON posts FOR SELECT
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- INSERT: Users can only insert posts for their tenant
CREATE POLICY "Users can create posts"
  ON posts FOR INSERT
  WITH CHECK (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- UPDATE: Users can only update their own posts
CREATE POLICY "Users can update own posts"
  ON posts FOR UPDATE
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- DELETE: Users can only delete their own posts
CREATE POLICY "Users can delete own posts"
  ON posts FOR DELETE
  USING (
    tenant_id = (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );
```

### Performance Optimization

**Critical indexes:**
```sql
-- Index tenant_id on every table
CREATE INDEX idx_posts_tenant_id ON posts(tenant_id);
CREATE INDEX idx_scraping_jobs_tenant_id ON scraping_jobs(tenant_id);
CREATE INDEX idx_ai_queue_tenant_id ON ai_generation_queue(tenant_id);
```

**Query optimization:** Always include `WHERE` clauses in application queries to reduce RLS overhead:
```typescript
// Good: Explicit filter + RLS
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('tenant_id', tenantId) // Explicit filter
  .eq('status', 'scheduled');

// Works but slower: RLS does all filtering
const { data } = await supabase
  .from('posts')
  .select('*')
  .eq('status', 'scheduled'); // RLS adds tenant_id filter
```

### Defense in Depth

**Application-level checks:** Even with RLS, validate tenant_id in server functions:
```typescript
// In server function
export const updatePost = createServerFn()
  .validator(/* ... */)
  .handler(async ({ data }) => {
    const user = await getUser(); // From auth
    const profile = await getProfile(user.id);

    // Defense in depth: check tenant_id
    if (data.tenant_id !== profile.tenant_id) {
      throw new Error('Unauthorized');
    }

    // RLS will also enforce this, but application checks first
    await supabase.from('posts').update(data).eq('id', data.id);
  });
```

**Source:** [Multi-Tenant Applications with RLS on Supabase](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/)

---

## 3. External Integration: n8n Communication Patterns

### Architecture Decision: Bidirectional Webhooks

n8n handles Pinterest API publishing. The app triggers n8n workflows and receives status updates back.

### Pattern 1: Trigger n8n Workflow (App → n8n)

**When:** User schedules a post, scheduled time arrives, or manual publish triggered.

**Flow:**
```
App Server Function → POST to n8n webhook → n8n workflow starts
```

**Implementation:**
```typescript
// In server function: src/server/publishPost.ts
export const publishPost = createServerFn()
  .validator(/* post ID */)
  .handler(async ({ postId }) => {
    const post = await getPost(postId);

    // Call n8n webhook
    const n8nResponse = await fetch(process.env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: post.id,
        title: post.title,
        description: post.description,
        imageUrl: post.image_url,
        boardId: post.board_id,
        callbackUrl: `${process.env.APP_URL}/api/n8n/callback`, // For status updates
      }),
    });

    const { executionId } = await n8nResponse.json();

    // Store execution ID for tracking
    await supabase
      .from('posts')
      .update({
        status: 'publishing',
        n8n_execution_id: executionId,
      })
      .eq('id', postId);

    return { success: true, executionId };
  });
```

**n8n webhook response mode:** Use "When Last Node Finishes" or "Using 'Respond to Webhook' Node" to get execution ID immediately.

### Pattern 2: n8n Callback (n8n → App)

**When:** n8n workflow completes (success or failure).

**Flow:**
```
n8n workflow completes → POST to app callback URL → app updates post status
```

**Implementation:**
```typescript
// API route: src/routes/api/n8n/callback.ts
export const POST = createAPIFileRoute('/api/n8n/callback')({
  handler: async ({ request }) => {
    const body = await request.json();

    const { postId, status, executionId, error, publishedUrl } = body;

    // Verify execution ID matches (security)
    const post = await supabase
      .from('posts')
      .select('n8n_execution_id')
      .eq('id', postId)
      .single();

    if (post.n8n_execution_id !== executionId) {
      return Response.json({ error: 'Invalid execution ID' }, { status: 403 });
    }

    // Update post status
    await supabase
      .from('posts')
      .update({
        status: status === 'success' ? 'published' : 'failed',
        published_at: status === 'success' ? new Date().toISOString() : null,
        n8n_error: error || null,
      })
      .eq('id', postId);

    // Broadcast update to connected clients (real-time)
    await supabase.channel(`post:${postId}`).send({
      type: 'broadcast',
      event: 'status_change',
      payload: { postId, status },
    });

    return Response.json({ success: true });
  },
});
```

**Security considerations:**
- Validate execution ID to prevent spoofing
- Consider HMAC signature for webhook authentication
- Use HTTPS only

**Source:** [n8n Webhook Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)

### Pattern 3: Polling for Status (Fallback)

If callback fails (network issue, webhook misconfiguration), implement polling:

```typescript
// Vercel Cron: Check posts stuck in "publishing" status
// .vercel/cron.json or API route
export const GET = createAPIFileRoute('/api/cron/check-publishing')({
  handler: async () => {
    const stuckPosts = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'publishing')
      .lt('updated_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // 5 min old

    // Query n8n API for execution status
    for (const post of stuckPosts.data || []) {
      const n8nStatus = await fetch(
        `${process.env.N8N_API_URL}/executions/${post.n8n_execution_id}`,
        { headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY } }
      );

      // Update based on n8n response
      // ...
    }

    return Response.json({ checked: stuckPosts.data?.length });
  },
});
```

---

## 4. Background Processing: Vercel Serverless Constraints

### The Constraint

Vercel serverless functions have strict limits:
- **Hobby/Pro:** 10-60 second timeout
- **No persistent processes:** Functions shut down after response
- **No disk persistence:** Ephemeral filesystem

**Source:** [Vercel Backend Limitations](https://northflank.com/blog/vercel-backend-limitations)

### Strategy 1: Break Jobs into Steps

For blog scraping and AI generation, break long-running tasks into individually retried steps.

#### Blog Scraping Architecture

```typescript
// Step 1: Create scraping job (fast)
export const startScraping = createServerFn()
  .validator(/* url */)
  .handler(async ({ url }) => {
    const job = await supabase
      .from('scraping_jobs')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        source_url: url,
        status: 'pending',
      })
      .select()
      .single();

    // Trigger step 2 (can be async)
    await fetch(`${process.env.APP_URL}/api/jobs/scrape-execute`, {
      method: 'POST',
      body: JSON.stringify({ jobId: job.data.id }),
    });

    return job.data;
  });

// Step 2: Execute scraping (under 60s)
export const POST = createAPIFileRoute('/api/jobs/scrape-execute')({
  handler: async ({ request }) => {
    const { jobId } = await request.json();

    // Fetch blog HTML (fast, < 5s)
    const html = await fetch(url).then(r => r.text());

    // Parse posts (fast, < 5s)
    const posts = await parseBlogPosts(html); // Cheerio parsing

    // Create post records (fast, < 5s)
    for (const post of posts) {
      const created = await supabase.from('posts').insert({
        tenant_id: tenantId,
        title: post.title,
        description: post.excerpt,
        link: post.url,
        status: 'draft',
        image_url: post.imageUrl,
      }).select().single();

      // Queue AI generation for each post (async)
      await supabase.from('ai_generation_queue').insert({
        tenant_id: tenantId,
        post_id: created.data.id,
        generation_type: 'all',
        context: { original: post.content },
      });
    }

    // Update job status
    await supabase
      .from('scraping_jobs')
      .update({
        status: 'completed',
        posts_created: posts.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return Response.json({ success: true });
  },
});
```

**Key insight:** Each step completes in under 60s. Scraping → parsing → database writes happen sequentially, but AI generation is queued separately.

### Strategy 2: Use Vercel Cron for AI Queue Processing

AI generation runs periodically, processing queue in batches.

```typescript
// Vercel Cron: /api/cron/process-ai-queue
// Runs every 5 minutes
export const GET = createAPIFileRoute('/api/cron/process-ai-queue')({
  handler: async () => {
    // Get pending items (limit to stay under timeout)
    const items = await supabase
      .from('ai_generation_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .limit(10); // Process 10 at a time

    for (const item of items.data || []) {
      try {
        // Mark as processing
        await supabase
          .from('ai_generation_queue')
          .update({ status: 'processing' })
          .eq('id', item.id);

        // Call OpenAI (5-10s per request)
        const generated = await generateMetadata(item.context);

        // Update post
        await supabase
          .from('posts')
          .update({
            title: generated.title || undefined,
            description: generated.description || undefined,
            alt_text: generated.altText || undefined,
            ai_generated: true,
            ai_metadata: generated.raw,
          })
          .eq('id', item.post_id);

        // Mark complete
        await supabase
          .from('ai_generation_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
          })
          .eq('id', item.id);

      } catch (error) {
        // Mark failed, increment attempts
        await supabase
          .from('ai_generation_queue')
          .update({
            status: 'failed',
            attempts: item.attempts + 1,
            error_message: error.message,
            // Exponential backoff
            scheduled_for: new Date(Date.now() + Math.pow(2, item.attempts) * 60000).toISOString(),
          })
          .eq('id', item.id);
      }
    }

    return Response.json({ processed: items.data?.length });
  },
});
```

**Cron configuration:** `.vercel/cron.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/process-ai-queue",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/check-publishing",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### Strategy 3: Fluid Compute with waitUntil

For short background tasks (< 1 min), use Vercel's `waitUntil`:

```typescript
import { waitUntil } from '@vercel/functions';

export const POST = createAPIFileRoute('/api/posts/create')({
  handler: async ({ request }) => {
    const post = await createPost(/* ... */);

    // Return immediately to user
    const response = Response.json({ post });

    // Continue work after response sent (up to 1 min)
    waitUntil((async () => {
      // Download image from URL
      const imageBuffer = await fetch(post.image_url).then(r => r.arrayBuffer());

      // Upload to Supabase Storage
      const { data } = await supabase.storage
        .from('post-images')
        .upload(`${tenantId}/${post.id}.jpg`, imageBuffer);

      // Update post with storage path
      await supabase
        .from('posts')
        .update({ image_path: data.path })
        .eq('id', post.id);
    })());

    return response;
  },
});
```

**Source:** [Vercel Long-Running Background Functions](https://www.inngest.com/blog/vercel-long-running-background-functions)

### Strategy 4: External Queue Service (Future)

For complex workflows, consider external services:
- **Inngest:** Orchestrates multi-step functions, handles retries
- **AWS SQS + Lambda:** Full control, more complex setup
- **Trigger.dev:** Developer-friendly background jobs

**Current recommendation:** Start with Strategies 1-3. Add external queue only if hitting Vercel limits.

---

## 5. Project Structure: TanStack Start + Nitro

### File Organization

```
petra-pinterest/
├── .planning/                    # Project planning docs
├── .vercel/
│   └── cron.json                 # Vercel Cron jobs
├── src/
│   ├── routes/                   # File-based routing
│   │   ├── __root.tsx            # Root layout
│   │   ├── index.tsx             # Home page
│   │   ├── dashboard/
│   │   │   ├── index.tsx         # Dashboard home
│   │   │   ├── calendar.tsx      # Calendar view
│   │   │   ├── posts.tsx         # Post list
│   │   │   └── scraping.tsx      # Scraping UI
│   │   └── api/                  # Server routes (API endpoints)
│   │       ├── posts/
│   │       │   ├── create.ts     # POST /api/posts/create
│   │       │   └── update.ts     # POST /api/posts/update
│   │       ├── n8n/
│   │       │   └── callback.ts   # POST /api/n8n/callback
│   │       ├── jobs/
│   │       │   ├── scrape-execute.ts
│   │       │   └── ai-generate.ts
│   │       └── cron/
│   │           ├── process-ai-queue.ts
│   │           └── check-publishing.ts
│   ├── components/               # React components
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── calendar/
│   │   │   ├── CalendarView.tsx
│   │   │   └── DraggablePost.tsx
│   │   ├── posts/
│   │   │   ├── PostCard.tsx
│   │   │   └── PostForm.tsx
│   │   └── scraping/
│   │       └── ScrapingStatus.tsx
│   ├── lib/                      # Utilities and configs
│   │   ├── supabase.ts           # Supabase client
│   │   ├── n8n.ts                # n8n API helpers
│   │   ├── openai.ts             # OpenAI client
│   │   ├── scraper.ts            # Blog scraping logic
│   │   └── utils.ts              # General utilities
│   ├── server/                   # Server functions
│   │   ├── posts.ts              # Post CRUD server functions
│   │   ├── scraping.ts           # Scraping server functions
│   │   ├── ai.ts                 # AI generation server functions
│   │   └── auth.ts               # Auth helpers
│   ├── types/                    # TypeScript types
│   │   ├── database.ts           # Supabase generated types
│   │   └── index.ts              # Application types
│   ├── router.tsx                # Router configuration
│   └── client.tsx                # Client entry point
├── public/                       # Static assets
├── supabase/
│   ├── migrations/               # Database migrations
│   └── seed.sql                  # Seed data
├── package.json
├── tsconfig.json
├── vite.config.ts                # Vite + Nitro config
└── vercel.json                   # Vercel deployment config
```

### Key File Patterns

**Server Functions** (`src/server/*.ts`):
```typescript
// src/server/posts.ts
import { createServerFn } from '@tanstack/start';

export const getPosts = createServerFn()
  .handler(async () => {
    const user = await getUser();
    const profile = await getProfile(user.id);

    const { data } = await supabase
      .from('posts')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('scheduled_at', { ascending: true });

    return data;
  });

export const createPost = createServerFn()
  .validator(/* zod schema */)
  .handler(async ({ data }) => {
    // ...
  });
```

**API Routes** (`src/routes/api/*.ts`):
```typescript
// src/routes/api/posts/create.ts
import { createAPIFileRoute } from '@tanstack/start';

export const POST = createAPIFileRoute('/api/posts/create')({
  handler: async ({ request }) => {
    const body = await request.json();
    // Handle request
    return Response.json({ success: true });
  },
});
```

**Page Routes** (`src/routes/*.tsx`):
```typescript
// src/routes/dashboard/calendar.tsx
import { createFileRoute } from '@tanstack/start';
import { getPosts } from '~/server/posts';

export const Route = createFileRoute('/dashboard/calendar')({
  loader: async () => {
    const posts = await getPosts();
    return { posts };
  },
  component: CalendarPage,
});

function CalendarPage() {
  const { posts } = Route.useLoaderData();
  return <CalendarView posts={posts} />;
}
```

**Source:** [TanStack Start Project Structure](https://blog.logrocket.com/full-stack-app-with-tanstack-start/)

### Nitro Configuration

As of 2026, TanStack Start is not coupled with Nitro by default. Nitro is used for building deployment artifacts but not runtime in development.

**vite.config.ts:**
```typescript
import { defineConfig } from 'vite';
import { TanStackStartVite } from '@tanstack/start/vite';
import nitroVitePlugin from '@nitropack/vite';

export default defineConfig({
  plugins: [
    TanStackStartVite(),
    nitroVitePlugin(), // Optional: for Nitro deployment artifacts
  ],
});
```

**Source:** [TanStack Start Nitro Status](https://github.com/TanStack/router/discussions/2863)

---

## 6. Real-Time Updates: Supabase Broadcast

### Use Case

When post status changes (e.g., from "publishing" to "published"), update the UI immediately without polling.

### Implementation: Broadcast Pattern

**Why Broadcast over Postgres Changes:** Broadcast scales better and doesn't require RLS policy evaluation for every connected user.

#### Backend: Send Broadcast

```typescript
// In n8n callback handler
await supabase.channel(`tenant:${tenantId}`).send({
  type: 'broadcast',
  event: 'post_status_change',
  payload: {
    postId,
    status: 'published',
    publishedAt: new Date().toISOString(),
  },
});
```

#### Frontend: Subscribe to Broadcast

```typescript
// In CalendarView.tsx or PostList.tsx
import { useEffect } from 'react';
import { supabase } from '~/lib/supabase';
import { useTenantId } from '~/hooks/useTenantId';

export function CalendarView({ posts }) {
  const tenantId = useTenantId();
  const [localPosts, setLocalPosts] = useState(posts);

  useEffect(() => {
    const channel = supabase.channel(`tenant:${tenantId}`, {
      config: { private: true }, // Requires auth
    });

    channel
      .on('broadcast', { event: 'post_status_change' }, (payload) => {
        // Update local state
        setLocalPosts(prev =>
          prev.map(p =>
            p.id === payload.postId
              ? { ...p, status: payload.status, publishedAt: payload.publishedAt }
              : p
          )
        );
      })
      .subscribe();

    // Cleanup
    return () => {
      channel.unsubscribe();
    };
  }, [tenantId]);

  return <Calendar posts={localPosts} />;
}
```

#### RLS Policy for Broadcast

```sql
-- Allow authenticated users to receive broadcasts
CREATE POLICY "Users can receive tenant broadcasts"
  ON realtime.messages FOR SELECT
  USING (
    -- Check that channel name matches user's tenant
    (SELECT tenant_id::text FROM profiles WHERE id = auth.uid())
    = split_part(channel, ':', 2)
  );
```

**Source:** [Supabase Realtime Subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

### When to Use Real-Time

| Use Case | Use Real-Time? | Method |
|----------|---------------|--------|
| Post status change (publishing → published) | YES | Broadcast |
| AI generation progress | MAYBE | Broadcast or polling |
| Calendar drag-and-drop (immediate save) | NO | Optimistic UI |
| New post created by user | NO | Refetch on action |
| Scraping job progress | MAYBE | Broadcast or polling |

**General rule:** Use real-time for server-initiated updates. For user-initiated actions, optimistic UI is faster.

---

## 7. File Upload: Supabase Storage

### Architecture

Supabase Storage stores images in S3-compatible storage with metadata in Postgres. RLS policies enforce access control.

### Upload Pattern

```typescript
// In post creation server function
export const uploadPostImage = createServerFn()
  .validator(/* file data */)
  .handler(async ({ file, postId }) => {
    const user = await getUser();
    const profile = await getProfile(user.id);

    // Upload to storage bucket
    const filePath = `${profile.tenant_id}/${postId}/${file.name}`;

    const { data, error } = await supabase.storage
      .from('post-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('post-images')
      .getPublicUrl(filePath);

    // Update post record
    await supabase
      .from('posts')
      .update({
        image_path: filePath,
        image_url: publicUrl,
      })
      .eq('id', postId);

    return { publicUrl, filePath };
  });
```

### Storage Bucket Configuration

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true);

-- RLS policy: Users can upload to their tenant folder
CREATE POLICY "Users can upload to tenant folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- RLS policy: Users can read their tenant's images
CREATE POLICY "Users can read tenant images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );
```

**Source:** [Supabase Storage Architecture](https://supabase.com/docs/guides/storage)

---

## 8. Build Order: Component Dependencies

### Phase 1: Foundation (Week 1)
**No blockers**

1. Database schema + migrations
2. RLS policies
3. Supabase client setup
4. Auth flow (login/signup)
5. Project file structure

**Deliverable:** User can sign up, log in, see empty dashboard.

---

### Phase 2: Core CRUD (Week 2)
**Depends on:** Phase 1

1. Post model + server functions (CRUD)
2. Post form UI
3. Post list view
4. Basic validation

**Deliverable:** User can manually create, edit, delete posts.

---

### Phase 3: Calendar UI (Week 2-3)
**Depends on:** Phase 2 (needs posts)

1. Calendar component (react-big-calendar or similar)
2. Drag-and-drop logic
3. Date/time picker integration
4. Optimistic UI updates

**Deliverable:** User can schedule posts on calendar via drag-and-drop.

---

### Phase 4: n8n Integration (Week 3)
**Depends on:** Phase 2 (needs posts)

1. n8n webhook trigger endpoint
2. n8n callback handler
3. Post status state machine
4. Error handling + retry logic
5. n8n workflow setup (external)

**Deliverable:** User can publish posts to Pinterest via n8n.

---

### Phase 5: Blog Scraping (Week 4)
**Depends on:** Phase 2 (creates posts)

1. Scraping job model
2. Blog parser (Cheerio)
3. Job status UI
4. Scraping API route
5. Error handling

**Deliverable:** User can import blog posts as drafts.

---

### Phase 6: AI Metadata Generation (Week 5)
**Depends on:** Phase 2 (modifies posts)

1. OpenAI integration
2. AI generation queue model
3. Vercel Cron job for queue processing
4. Prompt engineering
5. UI for regenerating metadata

**Deliverable:** AI auto-generates titles, descriptions, alt text.

---

### Phase 7: Real-Time Updates (Week 5-6)
**Depends on:** Phase 4 (post status changes)

1. Supabase Realtime setup
2. Broadcast channel implementation
3. Frontend subscription logic
4. RLS policies for broadcasts

**Deliverable:** UI updates in real-time when posts publish.

---

### Phase 8: File Upload (Week 6)
**Can be parallel with other phases**

1. Supabase Storage bucket setup
2. Storage RLS policies
3. File upload UI component
4. Server function for upload
5. Image preview

**Deliverable:** User can upload custom images for posts.

---

### Phase 9: Polish (Week 7+)

1. Error boundaries
2. Loading states
3. Empty states
4. Toast notifications
5. Mobile responsiveness
6. Analytics

**Deliverable:** Production-ready UI/UX.

---

## 9. Critical Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Multi-tenancy** | Shared tables + RLS | Simpler than schema-per-tenant, sufficient isolation |
| **n8n communication** | Bidirectional webhooks | App triggers, n8n callbacks with status |
| **Background jobs** | Vercel Cron + queue tables | Works within serverless constraints, no external service |
| **AI processing** | Queue + Cron (5 min interval) | Rate limiting, handles retries, stays under timeout |
| **Scraping** | Synchronous (< 60s) | Blog HTML fetch + parse is fast enough |
| **Real-time** | Supabase Broadcast | Better scaling than Postgres Changes |
| **File storage** | Supabase Storage | Integrated with auth, RLS policies, S3-compatible |
| **Project structure** | TanStack Start conventions | Server functions + API routes + file routing |

---

## 10. Open Questions & Risks

### Open Questions

1. **Pinterest board sync:** How often to refresh board list from Pinterest? Cache TTL?
2. **Bulk operations:** How to handle bulk scheduling (e.g., 50 posts at once)?
3. **Rate limiting:** OpenAI API rate limits—how many concurrent AI generations?
4. **Image optimization:** Should images be resized/optimized before upload?
5. **Timezone handling:** Store scheduled times in UTC, display in user's timezone?

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Vercel timeout for scraping large blogs | MEDIUM | HIGH | Limit scraping to X posts, paginate |
| OpenAI API rate limits | HIGH | MEDIUM | Queue with exponential backoff |
| n8n webhook reliability | MEDIUM | HIGH | Implement polling fallback |
| RLS performance with large datasets | LOW | MEDIUM | Add indexes, monitor query times |
| Supabase Realtime cost | LOW | MEDIUM | Monitor usage, optimize subscriptions |

---

## 11. Technology Versions (2026)

| Technology | Version | Notes |
|------------|---------|-------|
| TanStack Start | Latest (1.x) | Not coupled with Nitro by default |
| Nitro | 3.x | Used for build artifacts only |
| Supabase JS Client | 2.x | Realtime + Storage + Auth |
| Node.js | 20.x LTS | Vercel default |
| TypeScript | 5.x | Latest |
| React | 19.x | TanStack Start requirement |
| Cheerio | 1.x | Blog scraping |
| OpenAI SDK | 4.x | AI generation |

---

## Sources

**HIGH confidence (official docs):**
- [Supabase RLS Multi-Tenancy](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/)
- [Supabase Realtime Subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- [Supabase Storage](https://supabase.com/docs/guides/storage)
- [n8n Webhook Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- [TanStack Start Documentation](https://tanstack.com/start/latest/docs/framework/react/guide/routing)

**MEDIUM confidence (recent articles, verified patterns):**
- [TanStack Start Full-Stack Guide](https://blog.logrocket.com/full-stack-app-with-tanstack-start/)
- [Vercel Backend Limitations](https://northflank.com/blog/vercel-backend-limitations)
- [Vercel Long-Running Background Functions](https://www.inngest.com/blog/vercel-long-running-background-functions)
- [Node.js Web Scraping Patterns](https://www.zenrows.com/blog/javascript-nodejs-web-scraping-libraries)
- [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits)

**LOW confidence (needs validation):**
- Pinterest API scheduling behavior (not documented in search results)
- TanStack Start production deployment patterns (limited real-world examples)
