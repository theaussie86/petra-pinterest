# Project Management Flow

Create, edit (by section), and delete blog projects. Projects are the top-level organizational unit; all articles, pins, and connections belong to a project.

## Create Project

```mermaid
flowchart TD
    A[Dashboard: Click 'New Project'] --> B[ProjectDialog opens<br/>mode: create]
    B --> C[User fills name + blog_url]
    C --> D[Submit]
    D --> E[Zod validation]
    E -->|Invalid| F[Show field errors]
    E -->|Valid| G[useCreateBlogProject mutation]
    G --> H[ensureProfile → get tenant_id]
    H --> I[Supabase INSERT blog_projects]
    I -->|Success| J[Optimistic update: prepend to cache]
    J --> K[Toast: Project created]
    K --> L[Close dialog]
    I -->|Error| M[Rollback optimistic update]
    M --> N[Toast: Create failed]
```

The `ProjectDialog` component detects create mode when no `project` prop is passed. Only `name` and `blog_url` fields are shown for creation.

## Edit Project (Section-Based)

The project detail page organizes fields into 5 editable sections, each opened via `ProjectSectionDialog`:

```mermaid
flowchart TD
    A[Project detail page] --> B{User clicks Edit<br/>on a section}
    B -->|Basic Info| C1[name, blog_url, rss_url,<br/>sitemap_url, description, language]
    B -->|Scraping| C2[scraping_frequency]
    B -->|Brand & Content| C3[brand_voice, blog_niche,<br/>content_type, target_audience, etc.]
    B -->|Visual Style| C4[visual_style, color_palette,<br/>main_motifs, lighting_description, etc.]
    B -->|AI Instructions| C5[text_instructions,<br/>additional_instructions, topic_context]

    C1 --> D[ProjectSectionDialog opens]
    C2 --> D
    C3 --> D
    C4 --> D
    C5 --> D

    D --> E[User edits fields]
    E --> F[Submit]
    F --> G[useUpdateBlogProject mutation]
    G --> H[Supabase UPDATE blog_projects]
    H -->|Success| I[Toast: Project updated]
    I --> J[Invalidate queries, close dialog]
    H -->|Error| K[Toast: Update failed]
```

The `ProjectSectionDialog` is a reusable component that accepts a `FieldConfig[]` array defining which fields to show. Field types: `input`, `textarea`, `frequency-select`. Empty strings are converted to `null` before saving.

## Delete Project

```mermaid
flowchart TD
    A[Project detail: Click Delete] --> B[DeleteDialog opens]
    B --> C[Shows project name<br/>in confirmation message]
    C --> D{User confirms?}
    D -->|No| E[Close dialog]
    D -->|Yes| F[useDeleteBlogProject mutation]
    F --> G[Supabase DELETE blog_projects]
    G -->|Success| H[Toast: Project deleted]
    H --> I[Navigate to /dashboard]
    I --> J[Clear stored project ID]
    G -->|Error| K[Toast: Delete failed]
```

Related data (articles, pins) is cascade-deleted by the database. The `checkProjectRelatedData()` function can query article/pin counts to inform the user before deletion.

## Dashboard View

The dashboard displays all projects as cards with stats:

- **Article count** - from `blog_articles` table
- **Scheduled count** - pins with `scheduled_at` set, not yet published
- **Published count** - pins with published status

Clicking a card navigates to `/projects/$projectId`. Edit/delete icons on cards open the respective dialogs.

## Key Files

| File | Purpose |
|------|---------|
| `src/components/projects/project-dialog.tsx` | Create/edit dialog (mode via `project` prop) |
| `src/components/projects/project-section-dialog.tsx` | Granular section editing with `FieldConfig[]` |
| `src/components/projects/delete-dialog.tsx` | Delete confirmation dialog |
| `src/routes/_authed/projects/$projectId/index.tsx` | Project detail page with 5 editable sections |
| `src/routes/_authed/dashboard.tsx` | Dashboard with project cards |
| `src/components/dashboard/project-card.tsx` | Project card with stats and actions |
| `src/lib/api/blog-projects.ts` | API: `createBlogProject`, `updateBlogProject`, `deleteBlogProject` |
| `src/lib/hooks/use-blog-projects.ts` | TanStack Query hooks with optimistic create |
| `src/types/blog-projects.ts` | `BlogProject`, `BlogProjectInsert`, `BlogProjectUpdate` types |
