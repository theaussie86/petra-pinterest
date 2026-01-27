---
status: diagnosed
trigger: "Creating a blog project fails with an error toast after clicking Create in the dialog"
created: 2026-01-27T00:00:00Z
updated: 2026-01-27T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - createBlogProject() fails because profile lookup throws when user profile doesn't exist (PGRST116 from .single() on zero rows). Dashboard loads fine because getBlogProjects() returns empty array without evaluating the RLS subquery against profiles.
test: Traced full data flow from form submit through mutation to Supabase API
expecting: Confirmed the failure point is the profiles table query in createBlogProject()
next_action: Report diagnosis

## Symptoms

expected: Blog project is created successfully when user fills form and clicks Create
actual: Error toast appears saying "Failed to create project"
errors: Error toast from onError callback in useCreateBlogProject mutation hook
reproduction: Open create dialog, enter name and blog URL, click Create
started: Since the create functionality was implemented

## Eliminated

- hypothesis: Form validation (Zod schema) rejects the data
  evidence: The error toast "Failed to create project" comes from the mutation onError callback (line 66 of use-blog-projects.ts), NOT from form validation. If Zod validation failed, inline errors would show, not a toast. The Zod schema validates correctly for {name, blog_url} input.
  timestamp: 2026-01-27

- hypothesis: TypeScript compilation error or build issue
  evidence: tsc --noEmit passes cleanly, vite build succeeds. No compile-time errors.
  timestamp: 2026-01-27

- hypothesis: blog_projects table doesn't exist (migration not applied)
  evidence: Queried blog_projects unauthenticated via Supabase client - returns empty array (no error). Table exists and is accessible.
  timestamp: 2026-01-27

- hypothesis: Supabase client not initialized properly with sb_publishable_ key format
  evidence: createClient() succeeds, auth and from() methods available. The sb_publishable_ format is the new Supabase API key format (replaces JWT-based anon key) and is a documented drop-in replacement. supabase-js v2.93.1 supports it.
  timestamp: 2026-01-27

- hypothesis: Form data shape mismatch with BlogProjectInsert type
  evidence: Form sends {name, blog_url} in create mode (lines 111-114 of project-dialog.tsx). BlogProjectInsert requires only name and blog_url (Pick<BlogProject, 'name' | 'blog_url'>). API function spreads project and adds tenant_id. Insert object {name, blog_url, tenant_id} matches all NOT NULL columns without defaults. Other columns (id, rss_url, scraping_frequency, description, created_at, updated_at) all have defaults or are nullable.
  timestamp: 2026-01-27

- hypothesis: Zod v4 / @hookform/resolvers v5 incompatibility causes runtime failure
  evidence: Even if zodResolver had issues, it would prevent form submission (validation step), not cause an API error. The toast comes from mutation onError, meaning validation passed and mutateAsync was called.
  timestamp: 2026-01-27

- hypothesis: Optimistic update in onMutate interferes with the API call
  evidence: onMutate only modifies the query cache (adds a temp entry). It runs BEFORE mutationFn and does not affect the Supabase API call. onError properly rolls back. No interference.
  timestamp: 2026-01-27

## Evidence

- timestamp: 2026-01-27
  checked: createBlogProject() function in src/lib/api/blog-projects.ts
  found: Function performs 3 sequential async steps: (1) supabase.auth.getUser(), (2) profiles query for tenant_id with .single(), (3) blog_projects insert with .select().single(). Any step can throw.
  implication: Need to identify which of the 3 steps fails.

- timestamp: 2026-01-27
  checked: _authed route guard in src/routes/_authed.tsx
  found: Route guard calls getAuthUser() (which uses supabase.auth.getUser()) and getUser() (which queries profiles with fallback). If user reaches dashboard, auth is valid.
  implication: Step 1 (auth.getUser()) in createBlogProject should succeed since user is authenticated.

- timestamp: 2026-01-27
  checked: getUser() function in src/lib/auth.ts (lines 63-94)
  found: CRITICAL - getUser() has explicit fallback for missing profiles (lines 78-86): if profileError or no profile, returns {id, email, tenant_id: '', display_name: fallback}. Comment says "race condition with trigger". This means the app is DESIGNED to work even when profile doesn't exist.
  implication: User can reach dashboard with no profile. Dashboard loads with empty project list. But createBlogProject() does NOT have this fallback - it throws on missing profile.

- timestamp: 2026-01-27
  checked: getBlogProjects() function in src/lib/api/blog-projects.ts
  found: Simply does supabase.from('blog_projects').select('*').order(...). No explicit profile lookup. The RLS USING clause (tenant_id IN subquery) only evaluates PER ROW. If there are ZERO rows in blog_projects, the clause is NEVER evaluated.
  implication: Dashboard loads successfully showing "no projects" even if user's profile doesn't exist. The RLS subquery against profiles is never executed on an empty result set.

- timestamp: 2026-01-27
  checked: profiles table auto-create trigger in 00001_initial_schema.sql
  found: handle_new_user() trigger fires AFTER INSERT ON auth.users. It's SECURITY DEFINER. It inserts a profile with gen_random_uuid() tenant_id.
  implication: Profile SHOULD exist for all users who signed up AFTER the migration was applied. If migration was applied after user signup, no profile row exists for that user.

- timestamp: 2026-01-27
  checked: createBlogProject profile query (lines 32-38 of blog-projects.ts)
  found: Uses .select('tenant_id').eq('id', user.id).single(). With .single(), if zero rows match, Supabase returns PGRST116 error ("Results contain 0 rows"). This error is caught by `if (profileError) throw profileError`.
  implication: If user has no profile, createBlogProject throws PGRST116. This error propagates to the mutation's onError, which displays "Failed to create project" toast.

- timestamp: 2026-01-27
  checked: Unauthenticated Supabase queries
  found: blog_projects SELECT returns [] (empty, no error). profiles SELECT returns [] (empty, no error). blog_projects INSERT returns 42501 RLS violation. This confirms both tables exist and RLS is active.
  implication: Tables are properly created and RLS is enforced.

- timestamp: 2026-01-27
  checked: RLS policies on blog_projects (00002_blog_projects.sql)
  found: INSERT policy uses WITH CHECK (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid())). This subquery runs against profiles which has its own RLS. Both policies should work together correctly when auth.uid() is set and profile exists.
  implication: Even if profile exists, the INSERT RLS subquery references profiles with RLS. This is standard PostgreSQL behavior and should work, but adds a dependency on profiles table being accessible.

## Resolution

root_cause: The createBlogProject() API function (src/lib/api/blog-projects.ts:32-38) queries the profiles table with .single() to get the user's tenant_id. If the user's profile row doesn't exist in the profiles table, .single() returns a PGRST116 error ("Results contain 0 rows"), which is thrown and caught by the mutation's onError callback, displaying "Failed to create project" toast.

The profile can be missing when: (a) the 00001_initial_schema.sql migration was applied after the user signed up (so the auto-create trigger never fired for that user), or (b) the trigger failed silently during signup.

The dashboard loads successfully despite the missing profile because getBlogProjects() returns an empty array - the RLS subquery against profiles is never evaluated when there are zero rows in blog_projects. The getUser() auth function (src/lib/auth.ts:78-86) also masks this problem by returning fallback values (tenant_id: '') when the profile doesn't exist.

This creates a situation where the user appears fully logged in and can see the dashboard, but any write operation that requires tenant_id (like creating a project) fails.

fix:
verification:
files_changed: []
