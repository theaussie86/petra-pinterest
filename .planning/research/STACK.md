# Stack Research: Pinterest Scheduling Dashboard

**Project:** Petra Pinterest Scheduler
**Researched:** January 26, 2026
**Focus:** Modern full-stack TypeScript with TanStack Start + Supabase

---

## Core Framework

### TanStack Start (v1.149.4+) with Nitro

**Current Version:** `@tanstack/react-start` v1.149.4 (published 2 hours ago as of research date)

**Why TanStack Start:**
- Client-first philosophy with server capabilities (not server-first with client hydration)
- Built on Vite and TanStack Router with SSR, server functions, and streaming
- Type-safe end-to-end: server functions, loaders, and routing all fully typed
- Uses Nitro as adapter-less deployment layer (works with Vercel, Netlify, Cloudflare, etc.)
- Native React 18+ support with full Suspense integration

**Installation:**
```bash
npm install @tanstack/react-start@latest
```

**Architecture Patterns:**

1. **Server Functions** - Use `createServerFn()` for type-safe RPC calls:
   ```typescript
   import { createServerFn } from '@tanstack/react-start'

   // GET request (default)
   export const getData = createServerFn().handler(async () => {
     return { message: 'Hello from server!' }
   })

   // POST request for mutations
   export const saveData = createServerFn({ method: 'POST' })
     .handler(async () => {
       return { success: true }
     })
   ```

2. **Code Organization Pattern** (for larger apps):
   - `.functions.ts` - createServerFn wrappers (safe to import anywhere)
   - `.server.ts` - server-only helpers (DB queries, internal logic)
   - `.ts` - client-safe code (types, schemas, constants)

3. **Execution Model**:
   - All code is isomorphic by default
   - Route loaders run on BOTH server and client
   - Use `createServerOnlyFn()` for server-exclusive utilities
   - Use `createClientOnlyFn()` for client-exclusive utilities

4. **Data Loading**:
   - Call server functions in route loaders
   - Integrate with TanStack Query for caching
   - Use Suspense for loading states

**Key Best Practices (from production usage):**
- Avoid generalizing code until you've repeated the same pattern multiple times
- Organize code into vertical modules (each page folder contains everything it needs)
- Keep components at the nearest shared space in the hierarchy

**Nitro Integration:**
TanStack Start uses Nitro to be "adapter-less" - deploy to any platform without custom adapters. Nitro uses H3 HTTP framework with lower-level adapters maintained by the Nitro team.

**Sources:**
- [TanStack Start Best Practices 2026](https://www.codewithseb.com/blog/tanstack-ecosystem-complete-guide-2026)
- [Server Functions Documentation](https://tanstack.com/start/latest/docs/framework/react/guide/server-functions)
- [Why TanStack Start is Ditching Adapters](https://tanstack.com/blog/why-tanstack-start-is-ditching-adapters)
- [Production Tips from 8 Months Usage](https://swizec.com/blog/tips-from-8-months-of-tan-stack-router-in-production/)
- [@tanstack/react-start npm](https://www.npmjs.com/package/@tanstack/react-start)

---

## Database & Auth

### Supabase (v2.90.1+)

**Current Version:** `@supabase/supabase-js` v2.90.1 (published 10 days ago)

**Why Supabase:**
- Complete BaaS: Postgres database, auth, real-time, storage, edge functions
- Official TanStack Start integration with examples
- Row-level security for fine-grained access control
- Storage with S3 compatibility and CDN serving (285 cities worldwide)
- Real-time subscriptions built-in

**Installation:**
```bash
npm install @supabase/supabase-js@latest
```

**Environment Variables:**
```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**Integration Pattern with TanStack Start:**

1. **Initialize Client** (utils/supabase.ts):
   ```typescript
   import { createClient } from '@supabase/supabase-js'

   export const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   )
   ```

2. **Use in Server Functions**:
   ```typescript
   import { createServerFn } from '@tanstack/react-start'
   import { supabase } from '~/utils/supabase'

   export const getPins = createServerFn().handler(async () => {
     const { data, error } = await supabase
       .from('pins')
       .select('*')

     if (error) throw error
     return data
   })
   ```

3. **Authentication Pattern**:
   - Use Supabase Auth with cookie-based sessions
   - Store session in HTTP-only cookies
   - Validate sessions server-side in loaders
   - Refresh tokens automatically with Supabase client

**Row-Level Security (RLS) Best Practices:**

CRITICAL - Always implement RLS:

1. **Enable RLS from Day One**:
   ```sql
   ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
   ```

2. **Keep Policies Simple** (complex joins slow queries):
   ```sql
   -- Good: Simple, indexed column
   CREATE POLICY "Users can only see their pins"
   ON pins FOR SELECT
   USING (auth.uid() = user_id);

   -- Add index for performance (100x improvement on large tables)
   CREATE INDEX idx_pins_user_id ON pins(user_id);
   ```

3. **Use Specific Roles**:
   ```sql
   -- Always specify authenticated role
   CREATE POLICY "Authenticated users can insert pins"
   ON pins FOR INSERT
   TO authenticated
   WITH CHECK (auth.uid() = user_id);
   ```

4. **Optimize JWT Claims**:
   - Use `auth.uid()` wrapped in SELECT for caching
   - Store roles in JWT claims to avoid subqueries
   - Never use `user_metadata` in RLS policies (security risk)

5. **Performance Optimization**:
   - Index all columns used in policies
   - Use `SELECT (auth.uid())` to cache function calls
   - Prefer `WHERE team_id IN (SELECT ...)` over reverse patterns

6. **Security Warnings**:
   - NEVER use service_role keys in client code (bypass RLS)
   - Always test policies with different user roles
   - Enable RLS on ALL tables in exposed schemas

**Storage Integration** (for Pinterest images):

1. **Standard Upload Pattern**:
   ```typescript
   export const uploadImage = createServerFn({ method: 'POST' })
     .handler(async ({ file, fileName }) => {
       const { data, error } = await supabase.storage
         .from('pin-images')
         .upload(fileName, file)

       if (error) throw error

       // Get public URL
       const { data: { publicUrl } } = supabase.storage
         .from('pin-images')
         .getPublicUrl(fileName)

       return publicUrl
     })
   ```

2. **Image Optimization**:
   - Use Supabase's built-in image transformation
   - Resize, compress, and transform on-the-fly
   - Served via global CDN (285 cities)

3. **RLS for Storage**:
   ```sql
   -- Only allow users to upload to their folder
   CREATE POLICY "Users can upload to own folder"
   ON storage.objects FOR INSERT
   WITH CHECK (
     bucket_id = 'pin-images' AND
     auth.uid()::text = (storage.foldername(name))[1]
   );
   ```

**Node.js Version Requirement:**
- Node.js 18 EOL on April 30, 2025
- Supabase v2.79.0+ requires Node.js 20+
- If stuck on Node 18, use v2.78.0 (last compatible version)

**Sources:**
- [Supabase TanStack Start Quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/tanstack)
- [TanStack Start Supabase Example](https://tanstack.com/start/latest/docs/framework/react/examples/start-supabase-basic)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [RLS Best Practices 2026](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv)
- [@supabase/supabase-js npm](https://www.npmjs.com/package/@supabase/supabase-js)

---

## UI Components

### shadcn/ui with Tailwind CSS (Already Decided)

**Calendar/Scheduling Components:**

#### 1. Schedule-X (RECOMMENDED for full calendar)

**Current Version:** Latest available on npm

**Why Schedule-X:**
- Modern alternative to fullcalendar and react-big-calendar
- Native shadcn/ui theme integration
- Multiple view modes: day, week, month, year
- Event management built-in
- TypeScript support

**Installation:**
```bash
npm install @schedule-x/react @schedule-x/calendar @schedule-x/theme-shadcn
```

**Setup:**
```typescript
// layout.tsx or _app.tsx
import '@schedule-x/theme-shadcn/dist/index.css'

// globals.css
.sx-react-calendar-wrapper {
  height: 700px;
  width: 100%;
}

// Use in components
import { useCalendarApp } from '@schedule-x/react'
// For Next.js: import { useNextCalendarApp }
```

**Demo:** https://schedule-x-shadcn.vercel.app/

#### 2. React DayPicker (for date pickers)

**Current Version:** v9.13.0 (published ~1 month ago)

**Why React DayPicker:**
- Foundation for shadcn/ui Calendar component
- 6M+ weekly downloads
- Supports date ranges, multiple selections
- WCAG 2.1 AA compliant
- Localization for any language/timezone
- Built-in support for Persian, Buddhist, Hebrew, etc. calendars

**Installation:**
```bash
npm install react-day-picker
# Included with shadcn/ui calendar component:
npx shadcn@latest add calendar
```

**Features:**
- Single date selection
- Range selection (`mode="range"`)
- Month/year dropdowns (`captionLayout="dropdown"`)
- Custom cell sizing
- Week numbers
- Timezone support

#### 3. Alternative: Mina Scheduler

**Features:**
- Built with shadcn/ui and Tailwind
- Day, week, month views
- Framer Motion animations
- Zod validation
- TypeScript support

**Note:** Schedule-X is more mature and has better documentation.

**Sources:**
- [Schedule-X with Shadcn Theme](https://dev.to/tomosterlund/event-calendar-with-shadcn-theme-l8k)
- [Schedule-X GitHub](https://github.com/schedule-x/schedule-x)
- [React DayPicker npm](https://www.npmjs.com/package/react-day-picker)
- [shadcn Calendar Component](https://ui.shadcn.com/docs/components/calendar)
- [Mina Scheduler Demo](https://mina-scheduler.vercel.app/)

### Notifications: Sonner

**Why Sonner:**
- Official shadcn/ui recommendation (old Toast component deprecated)
- Opinionated, modern toast notifications
- Promise-based toasts for async operations
- Multiple types: default, success, info, warning, error
- Smooth animations
- TypeScript + Tailwind

**Installation:**
```bash
npx shadcn@latest add sonner
```

**Usage:**
```typescript
import { toast } from 'sonner'

// Simple
toast('Pin scheduled successfully')

// With description
toast.success('Upload complete', {
  description: 'Your image is ready to pin'
})

// Promise-based
toast.promise(uploadImage(), {
  loading: 'Uploading...',
  success: 'Upload complete!',
  error: 'Upload failed'
})
```

**Sources:**
- [Sonner shadcn Documentation](https://ui.shadcn.com/docs/components/sonner)
- [Top React Notification Libraries 2026](https://knock.app/blog/the-top-notification-libraries-for-react)

---

## State Management

### TanStack Query v5 (v5.90.19+)

**Current Version:** v5.90.19 (published 15 hours ago)

**Why TanStack Query:**
- Server state management with automatic caching
- Background updates and stale-while-revalidate
- Suspense support with `useSuspenseQuery`
- Perfect integration with TanStack Start
- Optimistic updates for mutations
- React 18+ required

**Installation:**
```bash
npm install @tanstack/react-query@latest
npm install @tanstack/react-query-devtools -D
```

**Integration Pattern with TanStack Start:**

```typescript
// app.tsx - Setup QueryClient
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    },
  },
})

// Use in components with server functions
import { useQuery, useMutation } from '@tanstack/react-query'
import { getPins, createPin } from './pins.functions'

function PinsList() {
  const { data: pins, isPending } = useQuery({
    queryKey: ['pins'],
    queryFn: () => getPins()
  })

  const createMutation = useMutation({
    mutationFn: createPin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pins'] })
    }
  })
}
```

**2026 Hybrid Pattern:**
Combine React Server Components for initial SSR data with TanStack Query for client needs (infinite scrolling, optimistic UI, background sync). Reports show 40-70% faster initial loads.

**Key v5 Features:**
- `isPending` replaces `isLoading` (breaking change)
- New `isLoading` = `isPending && isFetching`
- Suspense hooks: `useSuspenseQuery`, `useSuspenseInfiniteQuery`
- `useMutationState` for shared mutation state across components

**Sources:**
- [TanStack Query v5 Overview](https://tanstack.com/query/v5/docs/framework/react/overview)
- [Migrating to v5](https://tanstack.com/query/v5/docs/framework/react/guides/migrating-to-v5)
- [RSC + TanStack Query 2026](https://dev.to/krish_kakadiya_5f0eaf6342/react-server-components-tanstack-query-the-2026-data-fetching-power-duo-you-cant-ignore-21fj)
- [@tanstack/react-query npm](https://www.npmjs.com/package/@tanstack/react-query)

---

## Form Handling

### React Hook Form + Zod (RECOMMENDED)

**Current Versions:**
- `react-hook-form` v7.71.1 (published 5 days ago)
- `zod` v4.3.5 (published 15 days ago)

**Why This Combo:**
- Official shadcn/ui pattern
- Type-safe validation with Zod
- No re-renders on every keystroke (performance)
- WCAG accessible
- Real-time validation
- 14M+ weekly downloads (react-hook-form)

**Installation:**
```bash
npm install react-hook-form zod @hookform/resolvers
npx shadcn@latest add form
```

**Pattern:**

```typescript
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// Define schema
const pinSchema = z.object({
  title: z.string().min(1, 'Title required').max(100),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url('Must be valid URL'),
  scheduledFor: z.date(),
  boardId: z.string().uuid()
})

type PinFormData = z.infer<typeof pinSchema>

// Use in component
function CreatePinForm() {
  const form = useForm<PinFormData>({
    resolver: zodResolver(pinSchema),
    defaultValues: {
      title: '',
      description: '',
    }
  })

  const onSubmit = async (data: PinFormData) => {
    await createPin(data)
  }

  return (
    <Form {...form}>
      {/* shadcn form components */}
    </Form>
  )
}
```

**Zod v4 Highlights:**
- Faster, slimmer, more tree-shakable
- JSON Schema to Zod conversion
- Top-level string format functions (e.g., `z.email()`)
- Supports draft-2020-12, draft-7, draft-4, OpenAPI 3.0

**Alternative: TanStack Form (Formedible)**
- New option for 2025-2026
- Full TypeScript with TanStack Form best practices
- 20+ built-in field types
- Still less mature than React Hook Form

**Recommendation:** Stick with React Hook Form + Zod. It's battle-tested, has excellent shadcn integration, and massive community support.

**Sources:**
- [shadcn Form Component](https://ui.shadcn.com/docs/components/form)
- [React Hook Form with shadcn](https://ui.shadcn.com/docs/forms/react-hook-form)
- [Building React Forms with RHF, Zod, shadcn](https://wasp.sh/blog/2024/11/20/building-react-forms-with-ease-using-react-hook-form-and-zod)
- [react-hook-form npm](https://www.npmjs.com/package/react-hook-form)
- [zod npm](https://www.npmjs.com/package/zod)

---

## File Handling

### Supabase Storage (RECOMMENDED for this stack)

**Why Supabase Storage:**
- Already using Supabase for database/auth
- No additional service needed
- 500GB max file size (increased 10x)
- Global CDN (285 cities)
- Built-in image optimization
- S3-compatible API
- Fine-grained RLS control

**Upload Pattern:**

```typescript
// Server function for upload
export const uploadPinImage = createServerFn({ method: 'POST' })
  .handler(async ({ file, userId }) => {
    const fileName = `${userId}/${Date.now()}-${file.name}`

    const { data, error } = await supabase.storage
      .from('pin-images')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) throw error

    // Get public URL with transformation
    const { data: { publicUrl } } = supabase.storage
      .from('pin-images')
      .getPublicUrl(fileName, {
        transform: {
          width: 800,
          height: 800,
          resize: 'contain'
        }
      })

    return { path: data.path, url: publicUrl }
  })
```

**Client-Side Component:**

```typescript
'use client'

import { useForm } from 'react-hook-form'

function ImageUpload() {
  const uploadMutation = useMutation({
    mutationFn: uploadPinImage
  })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const result = await uploadMutation.mutateAsync({
      file,
      userId: session.user.id
    })

    toast.success('Image uploaded', {
      description: result.url
    })
  }

  return (
    <input
      type="file"
      accept="image/*"
      onChange={handleFileChange}
      disabled={uploadMutation.isPending}
    />
  )
}
```

**Dropzone Integration:**
Supabase provides official Dropzone component for Next.js with drag-and-drop, file type restrictions, previews, and configurable limits.

**Image Optimization Features:**
- Resize on-the-fly
- Compress for web
- Format conversion (WebP, AVIF)
- Smart cropping
- Quality adjustment

**Security Best Practices:**
1. Use RLS policies on storage buckets
2. Validate file types server-side (never trust client)
3. Scan for malware if handling user uploads
4. Set appropriate CORS policies
5. Use signed URLs for private content

**Alternative: UploadThing**

**When to Consider UploadThing:**
- Need specialized upload UI/UX
- Want pre-built components
- Prefer usage-based pricing ($10/month base)

**Why NOT for This Project:**
- Already using Supabase
- Adds another service dependency
- More complex auth flow
- Supabase Storage is sufficient

**Sources:**
- [Supabase Storage Upload Documentation](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [React Image Upload with Supabase](https://www.restack.io/docs/supabase-knowledge-react-image-upload-supabase-example)
- [Supabase Storage Features](https://supabase.com/blog/storage-500gb-uploads-cheaper-egress-pricing)
- [Building React Image Uploader](https://www.owolf.com/blog/building-a-react-image-uploader-with-supabase-storage)
- [UploadThing npm](https://www.npmjs.com/package/uploadthing)

---

## Date/Time Handling

### date-fns (RECOMMENDED)

**Current Version:** v4.1.0 (published ~1 year ago)

**Why date-fns:**
- Tree-shakable (only import what you need)
- Functional approach (immutable)
- TypeScript support
- Better performance with tree-shaking
- 23,815 projects using it
- Works great with React
- Smaller bundle when using multiple methods (3.63 KiB vs dayjs 6.64 KiB)

**Installation:**
```bash
npm install date-fns
```

**Usage:**
```typescript
import { format, addDays, isPast, isFuture } from 'date-fns'

// Format for display
const scheduledDate = format(new Date(), 'PPpp')

// Check if pin is scheduled for future
const canSchedule = isFuture(scheduledDate)

// Add days for scheduling
const nextWeek = addDays(new Date(), 7)
```

**Alternative: Day.js**

**When to Use Day.js:**
- Need Moment.js-like API (migration scenario)
- Want chaining syntax
- Prefer plugin architecture

**Why NOT for This Project:**
- Larger bundle for multiple methods
- date-fns has better tree-shaking
- Functional approach fits React better

**Comparison:**
| Feature | date-fns | Day.js |
|---------|----------|--------|
| Bundle (1 method) | 1.6 KB | 6.64 KB |
| Bundle (multiple) | 3.63 KB | 6.64 KB |
| Tree-shakable | Yes | Limited |
| Weekly downloads | ~35M | ~25M |
| API style | Functional | Chaining |

**Recommendation:** Use date-fns for tree-shaking benefits and functional style that matches React patterns.

**Sources:**
- [date-fns npm](https://www.npmjs.com/package/date-fns)
- [date-fns vs dayjs Comparison](https://www.dhiwise.com/post/date-fns-vs-dayjs-the-battle-of-javascript-date-libraries)
- [shadcn-ui date-fns discussion](https://github.com/shadcn-ui/ui/discussions/4817)

---

## Pinterest API Integration

### Best Practices for Scheduling

**Official API:** https://developers.pinterest.com/docs/api/v5/

**Key Patterns:**

1. **Rate Limit Management:**
   ```typescript
   // Monitor headers
   const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining')
   const rateLimitReset = response.headers.get('X-RateLimit-Reset')

   // Queue and space out requests
   // Retry after waiting on 429 errors
   ```

2. **Scope Permissions:**
   - Only request scopes you need
   - Principle of least privilege
   - Builds user trust

3. **Scheduling Strategy:**
   - Pinterest allows scheduling up to 30 days in advance
   - Native UI: 1 pin at a time, max 10 scheduled
   - Via API: Batch scheduling possible
   - Algorithm notices after 3 weeks of consistent posting

4. **Optimal Timing:**
   - Schedule for evenings and weekends
   - When audience is most active
   - Consistency > timing

5. **Error Handling:**
   ```typescript
   export const schedulePinToAPI = createServerFn({ method: 'POST' })
     .handler(async ({ pinData }) => {
       try {
         const response = await fetch('https://api.pinterest.com/v5/pins', {
           method: 'POST',
           headers: {
             'Authorization': `Bearer ${accessToken}`,
             'Content-Type': 'application/json'
           },
           body: JSON.stringify(pinData)
         })

         if (response.status === 429) {
           const resetTime = response.headers.get('X-RateLimit-Reset')
           // Queue for retry after reset
           throw new Error(`Rate limited until ${resetTime}`)
         }

         if (!response.ok) throw new Error('Pinterest API error')

         return await response.json()
       } catch (error) {
         // Log, retry, or queue for later
         throw error
       }
     })
   ```

**Pinterest-Approved Schedulers (Reference):**
- Tailwind
- Later
- RecurPost
- All use official Pinterest API

**Sources:**
- [Pinterest API Developer Guide 2026](https://getlate.dev/blog/pinterest-api)
- [Schedule Pins via API](https://getlate.dev/blog/schedule-pinterest-pins-via-api)
- [Pinterest Schedulers Best Practices](https://socialbee.com/blog/pinterest-schedulers/)
- [Pinterest API Documentation](https://developers.pinterest.com/docs/api/v5/)

---

## Recommendations Summary

### Install All Core Dependencies

```bash
# Core framework
npm install @tanstack/react-start@latest

# Database & auth
npm install @supabase/supabase-js@latest

# State management
npm install @tanstack/react-query@latest
npm install @tanstack/react-query-devtools -D

# Forms & validation
npm install react-hook-form zod @hookform/resolvers

# Date handling
npm install date-fns

# Calendar/scheduling UI
npm install @schedule-x/react @schedule-x/calendar @schedule-x/theme-shadcn
npm install react-day-picker

# Notifications
npx shadcn@latest add sonner

# Utility
npm install clsx tailwind-merge
```

### Tech Stack at a Glance

| Category | Technology | Version | Why |
|----------|-----------|---------|-----|
| **Framework** | TanStack Start | 1.149.4+ | Type-safe full-stack, Nitro adapter-less |
| **Runtime** | Node.js | 20+ | Required for Supabase v2.79.0+ |
| **Database** | Supabase Postgres | 2.90.1+ | BaaS with auth, storage, real-time |
| **State** | TanStack Query | 5.90.19+ | Server state with caching |
| **Forms** | React Hook Form + Zod | 7.71.1 + 4.3.5 | Type-safe validation |
| **Calendar** | Schedule-X | Latest | shadcn-themed full calendar |
| **Date Picker** | React DayPicker | 9.13.0 | Powers shadcn calendar |
| **Dates** | date-fns | 4.1.0 | Tree-shakable date utils |
| **Toast** | Sonner | Latest | Modern toast notifications |
| **Storage** | Supabase Storage | Included | Image uploads with CDN |

### Architecture Principles

1. **Server Functions First** - Use `createServerFn()` for all data operations
2. **Type Safety End-to-End** - Zod schemas, TypeScript, TanStack type inference
3. **RLS Always On** - Enable row-level security from day one
4. **Client-Side Caching** - TanStack Query for optimal UX
5. **Vertical Organization** - Each feature/page contains everything it needs
6. **Tree-Shaking** - Prefer date-fns over day.js, functional over chaining

### Development Workflow

1. **Local Development:**
   ```bash
   npm run dev  # TanStack Start with Vite HMR
   ```

2. **Environment Setup:**
   ```bash
   # .env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   ```

3. **Deployment (Vercel):**
   - Nitro handles adapter automatically
   - Set environment variables in Vercel dashboard
   - Deploy with `vercel` or git push

### Key Files Structure

```
src/
├── routes/              # TanStack Start routes
│   ├── index.tsx       # Home page
│   └── schedule/
│       ├── index.tsx   # Schedule list
│       └── new.tsx     # New pin form
├── utils/
│   ├── supabase.ts     # Supabase client
│   └── queryClient.ts  # TanStack Query config
├── server/
│   ├── pins.functions.ts    # Server functions for pins
│   └── auth.functions.ts    # Server functions for auth
└── components/
    ├── ui/             # shadcn components
    └── features/       # Feature components
```

### Next Steps

1. Initialize TanStack Start project
2. Set up Supabase project and RLS policies
3. Configure environment variables
4. Install all dependencies
5. Add shadcn components (calendar, form, sonner)
6. Set up TanStack Query provider
7. Implement auth flow with Supabase
8. Create database schema with RLS
9. Build server functions for Pinterest API
10. Implement scheduling UI with Schedule-X

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **TanStack Start** | HIGH | Official docs, active development, clear patterns |
| **Supabase** | HIGH | Official integration, mature platform, extensive docs |
| **TanStack Query** | HIGH | v5 stable, perfect integration with Start |
| **Forms (RHF + Zod)** | HIGH | Standard shadcn pattern, battle-tested |
| **Calendar (Schedule-X)** | MEDIUM | Newer library, but well-documented with shadcn theme |
| **Date Utils (date-fns)** | HIGH | Mature, widely adopted, performance proven |
| **Pinterest API** | HIGH | Official API docs, rate limiting well-documented |

---

## Version Currency Check

All package versions verified against npm on **January 26, 2026**:

- @tanstack/react-start: v1.149.4 (2 hours ago) ✓
- @supabase/supabase-js: v2.90.1 (10 days ago) ✓
- @tanstack/react-query: v5.90.19 (15 hours ago) ✓
- react-hook-form: v7.71.1 (5 days ago) ✓
- zod: v4.3.5 (15 days ago) ✓
- date-fns: v4.1.0 (stable) ✓
- react-day-picker: v9.13.0 (~1 month ago) ✓

All versions are current for 2026 development.
