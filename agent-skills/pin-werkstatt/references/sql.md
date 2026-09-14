# SQL-Abfragen der Pin-Werkstatt

Alle Abfragen laufen als `pin_werkstatt_agent`. Du siehst automatisch nur deine
freigegebenen Projekte, einen Projektfilter brauchst du nur zur Auswahl.

**Platzhalter** stehen in spitzen Klammern, zum Beispiel `<article_id>`. Ersetze
sie inklusive der Klammern, die Anführungszeichen drumherum bleiben.

**Lange Texte und JSON** stehen in Dollar-Quoting: `$vorlagen$ ... $vorlagen$`.
Für SQL musst du darin nichts escapen, auch keine Apostrophe. Die Zeichenfolge
`$vorlagen$` darf im Inhalt nicht vorkommen. Der Inhalt selbst muss aber
**gültiges JSON** sein: `"` als `\"`, `\` als `\\`, Zeilenumbruch als `\n`.
Am sichersten erzeugst du das JSON mit einem JSON-Serializer statt von Hand.

---

## A1: Freigegebene Projekte

```sql
SELECT p.id AS project_id, p.name, p.blog_url, p.language
FROM public.agent_project_access g
JOIN public.blog_projects p ON p.id = g.blog_project_id
ORDER BY p.name;
```

## A2: Projektkontext

```sql
SELECT name, blog_url, language, blog_niche, ai_context,
       target_audience, brand_voice, value_proposition, general_keywords,
       topic_context, content_type, text_instructions, additional_instructions,
       visual_style, visual_audience, main_motifs, color_palette,
       style_options, lighting_description
FROM public.blog_projects
WHERE id = '<project_id>';
```

## A3: Artikel ohne vollständige 30 Vorlagen

Neueste zuerst, archivierte Artikel ausgelassen.

```sql
SELECT a.id AS article_id, a.title, a.url, a.published_at,
       count(t.id) AS template_count
FROM public.blog_articles a
LEFT JOIN public.pin_templates t ON t.blog_article_id = a.id
WHERE a.blog_project_id = '<project_id>'
  AND a.archived_at IS NULL
GROUP BY a.id
HAVING count(t.id) < 30
ORDER BY a.published_at DESC NULLS LAST
LIMIT 20;
```

## A4: Positionsstand eines Artikels

`status` leer = Position noch frei. `approved`, `archived` und `needs_revision`
überschreibt B1 nicht.

```sql
SELECT gs.position, t.status, t.main_keyword, t.pin_type
FROM generate_series(1, 30) AS gs(position)
LEFT JOIN public.pin_templates t
  ON t.blog_article_id = '<article_id>' AND t.position = gs.position
ORDER BY gs.position;
```

## A5: Artikel lesen

```sql
SELECT id AS article_id, title, url, published_at, content
FROM public.blog_articles
WHERE id = '<article_id>';
```

---

## B1: Vorlagen eines Artikels schreiben (Upsert)

- Legt fehlende Positionen neu an, aktualisiert Positionen mit Status `draft`.
- Lässt Positionen mit `needs_revision`, `approved` und `archived` unverändert
  und meldet sie in `skipped_positions`.
- Status ist immer `draft`, `tenant_id` wird nicht gesetzt.
- `inserted` kommt aus `xmax = 0`: eine Postgres-Eigenheit, die bei einem Upsert
  neu angelegte von aktualisierten Zeilen unterscheidet.

Das JSON ist eine Liste von Vorlagen. Jede Vorlage hat diese Schlüssel
(`position`, `main_keyword`, `overlay`, `image_prompt` sind Pflicht):

```json
[
  {
    "position": 1,
    "pin_type": "Checkliste",
    "title": "…",
    "description": "<beginnt mit main_keyword, max. 500 Zeichen>",
    "board_name_raw": "…",
    "overlay": "Zeile 1 mit main_keyword\nZeile 2",
    "main_keyword": "…",
    "longtails": ["…", "…"],
    "search_phrases": ["…"],
    "quality_check": ["…"],
    "search_intent": "…",
    "image_idea": "…",
    "image_prompt": "…",
    "design": {"name": "…", "layout": "…", "image_position": "…", "fonts": ["…"], "scroll_stopper": "…", "colors": ["#1a1a1a"]},
    "season": null
  }
]
```

```sql
WITH input AS (
  SELECT *
  FROM jsonb_to_recordset($vorlagen$<JSON-LISTE DER VORLAGEN>$vorlagen$::jsonb) AS x(
    position int, pin_type text, title text, description text,
    board_name_raw text, overlay text, main_keyword text,
    longtails text[], search_phrases text[], quality_check text[],
    search_intent text, image_idea text, image_prompt text,
    design jsonb, season text
  )
),
written AS (
  INSERT INTO public.pin_templates (
    blog_article_id, position, status, pin_type, title, description,
    board_name_raw, overlay, main_keyword, longtails, search_phrases,
    quality_check, search_intent, image_idea, image_prompt, design, season
  )
  SELECT '<article_id>'::uuid, position, 'draft', pin_type, title, description,
         board_name_raw, overlay, main_keyword, longtails, search_phrases,
         quality_check, search_intent, image_idea, image_prompt, design, season
  FROM input
  ON CONFLICT (blog_article_id, position) DO UPDATE SET
    pin_type       = EXCLUDED.pin_type,
    title          = EXCLUDED.title,
    description    = EXCLUDED.description,
    board_name_raw = EXCLUDED.board_name_raw,
    overlay        = EXCLUDED.overlay,
    main_keyword   = EXCLUDED.main_keyword,
    longtails      = EXCLUDED.longtails,
    search_phrases = EXCLUDED.search_phrases,
    quality_check  = EXCLUDED.quality_check,
    search_intent  = EXCLUDED.search_intent,
    image_idea     = EXCLUDED.image_idea,
    image_prompt   = EXCLUDED.image_prompt,
    design         = EXCLUDED.design,
    season         = EXCLUDED.season,
    status         = 'draft'
  WHERE public.pin_templates.status = 'draft'
  RETURNING position, (xmax = 0) AS inserted
)
SELECT
  (SELECT count(*) FROM input)                     AS sent,
  (SELECT count(*) FROM written WHERE inserted)     AS inserted,
  (SELECT count(*) FROM written WHERE NOT inserted) AS updated,
  (SELECT coalesce(array_agg(i.position ORDER BY i.position), '{}')
     FROM input i
    WHERE i.position NOT IN (SELECT w.position FROM written w)) AS skipped_positions;
```

---

## C1: Offene Änderungswünsche

Pro Vorlage: neuestes Feedback (`revision_id` brauchst du für C2), Verlauf der
letzten Wünsche und der aktuelle Stand der Vorlage als JSON.

```sql
SELECT t.id AS template_id,
       t.blog_article_id AS article_id,
       a.title AS article_title,
       t.position,
       latest.id AS revision_id,
       latest.feedback,
       latest.created_at AS requested_at,
       (SELECT jsonb_agg(jsonb_build_object(
                 'feedback', r.feedback,
                 'created_at', r.created_at,
                 'has_snapshot', r.previous_snapshot IS NOT NULL)
               ORDER BY r.created_at DESC)
          FROM public.pin_template_revisions r
         WHERE r.template_id = t.id) AS history,
       to_jsonb(t) - ARRAY['id', 'tenant_id', 'blog_article_id', 'status',
                           'created_at', 'updated_at'] AS current_template
FROM public.pin_templates t
JOIN public.blog_articles a ON a.id = t.blog_article_id
JOIN LATERAL (
  SELECT r.id, r.feedback, r.created_at
  FROM public.pin_template_revisions r
  WHERE r.template_id = t.id
  ORDER BY r.created_at DESC
  LIMIT 1
) latest ON true
WHERE t.status = 'needs_revision'
ORDER BY latest.created_at;
```

## C2: Überarbeitung speichern (Snapshot + zurück auf `draft`)

Eine Anweisung, alles oder nichts:

1. schreibt den alten Stand der Vorlage in `previous_snapshot` von `<revision_id>`,
2. überschreibt die Vorlage mit dem neuen Stand,
3. setzt den Status auf `draft`.

Das JSON ist **eine** vollständige Vorlage, gleiche Schlüssel wie in B1. Nimm
`current_template` aus C1 als Ausgangspunkt. Ein mitgeschicktes `position` wird
ignoriert, die Position ändert sich nie.

```sql
WITH neu AS (
  SELECT *
  FROM jsonb_to_record($vorlage$<JSON DER ÜBERARBEITETEN VORLAGE>$vorlage$::jsonb) AS x(
    pin_type text, title text, description text,
    board_name_raw text, overlay text, main_keyword text,
    longtails text[], search_phrases text[], quality_check text[],
    search_intent text, image_idea text, image_prompt text,
    design jsonb, season text
  )
),
alt AS (
  SELECT t.id,
         to_jsonb(t) - ARRAY['id', 'tenant_id', 'blog_article_id', 'status',
                             'created_at', 'updated_at'] AS snapshot
  FROM public.pin_templates t
  WHERE t.id = '<template_id>'
    AND t.status = 'needs_revision'
),
snap AS (
  UPDATE public.pin_template_revisions r
  SET previous_snapshot = alt.snapshot
  FROM alt
  WHERE r.id = '<revision_id>'
    AND r.template_id = alt.id
  RETURNING r.id
),
upd AS (
  UPDATE public.pin_templates t
  SET pin_type       = neu.pin_type,
      title          = neu.title,
      description    = neu.description,
      board_name_raw = neu.board_name_raw,
      overlay        = neu.overlay,
      main_keyword   = neu.main_keyword,
      longtails      = neu.longtails,
      search_phrases = neu.search_phrases,
      quality_check  = neu.quality_check,
      search_intent  = neu.search_intent,
      image_idea     = neu.image_idea,
      image_prompt   = neu.image_prompt,
      design         = neu.design,
      season         = neu.season,
      status         = 'draft'
  FROM neu, snap
  WHERE t.id = '<template_id>'
    AND t.status = 'needs_revision'
  RETURNING t.id
)
SELECT (SELECT count(*) FROM snap) AS snapshot_written,
       (SELECT count(*) FROM upd)  AS template_updated;
```

Erwartet: `snapshot_written = 1`, `template_updated = 1`.

---

## D1: Vollständigkeit der bearbeiteten Artikel

```sql
SELECT a.id AS article_id, a.title,
       count(t.id) AS template_count,
       count(t.id) FILTER (WHERE t.status = 'draft')          AS draft,
       count(t.id) FILTER (WHERE t.status = 'needs_revision') AS needs_revision,
       count(t.id) FILTER (WHERE t.status = 'approved')       AS approved,
       count(t.id) FILTER (WHERE t.status = 'archived')       AS archived
FROM public.blog_articles a
LEFT JOIN public.pin_templates t ON t.blog_article_id = a.id
WHERE a.id IN ('<article_id_1>', '<article_id_2>')
GROUP BY a.id, a.title
ORDER BY a.title;
```

Erwartet: `template_count = 30` in jeder Zeile.

## D2: Angefangene, unvollständige Artikel (alle Freigaben)

```sql
SELECT a.blog_project_id AS project_id, a.id AS article_id, a.title,
       count(t.id) AS template_count
FROM public.pin_templates t
JOIN public.blog_articles a ON a.id = t.blog_article_id
GROUP BY a.blog_project_id, a.id, a.title
HAVING count(t.id) <> 30
ORDER BY template_count;
```

Erwartet: leeres Ergebnis.
