-- Pin-Werkstatt Agent Skill: SQL Probelauf mit Rollback
-- Runs every query of agent-skills/pin-werkstatt/references/sql.md as the role
-- pin_werkstatt_agent against the real schema, plus the rejection paths the
-- skill documents. Nothing is kept: the block always ends with RAISE EXCEPTION,
-- which rolls back the temporary role membership, project grant and templates.
-- Created: 2026-09-14 (issue #83, epic #74)
--
-- Run in the Supabase SQL editor (as postgres). The expected output is an
-- ERROR whose message starts with "SKILL-TEST: <n> ok, 0 failed" followed by
-- one line per check. Any "FAIL" line means the skill and the DB disagree.
--
-- Keep the query texts below in sync with references/sql.md. Placeholders are
-- written as __JSON__ / __ARTICLE__ / ... and substituted before EXECUTE, so
-- the dollar-quoting of the skill is exercised as written.
--
-- Works without login on the role: postgres gets a temporary, non-inheriting
-- SET membership inside this transaction.

DO $test$
DECLARE
  v_project uuid;
  v_article uuid;
  v_foreign uuid;
  v_tenant uuid;
  v_grants bigint;
  v_json jsonb;
  v_one jsonb;
  v_t1 uuid;
  v_t2 uuid;
  v_rev uuid;
  v_n bigint;
  v_txt text;
  v_row record;
  v_ok int := 0;
  v_fail int := 0;
  v_log text := '';
  v_state text;
  v_msg text;

  q_a1 text := $q$
SELECT p.id AS project_id, p.name, p.blog_url, p.language
FROM public.agent_project_access g
JOIN public.blog_projects p ON p.id = g.blog_project_id
ORDER BY p.name
$q$;

  q_a2 text := $q$
SELECT name, blog_url, language, blog_niche, ai_context,
       target_audience, brand_voice, value_proposition, general_keywords,
       topic_context, content_type, text_instructions, additional_instructions,
       visual_style, visual_audience, main_motifs, color_palette,
       style_options, lighting_description
FROM public.blog_projects
WHERE id = '__PROJECT__'
$q$;

  q_a3 text := $q$
SELECT a.id AS article_id, a.title, a.url, a.published_at,
       count(t.id) AS template_count
FROM public.blog_articles a
LEFT JOIN public.pin_templates t ON t.blog_article_id = a.id
WHERE a.blog_project_id = '__PROJECT__'
  AND a.archived_at IS NULL
GROUP BY a.id
HAVING count(t.id) < 30
ORDER BY a.published_at DESC NULLS LAST
LIMIT 20
$q$;

  q_a4 text := $q$
SELECT gs.position, t.status, t.main_keyword, t.pin_type
FROM generate_series(1, 30) AS gs(position)
LEFT JOIN public.pin_templates t
  ON t.blog_article_id = '__ARTICLE__' AND t.position = gs.position
ORDER BY gs.position
$q$;

  q_a5 text := $q$
SELECT id AS article_id, title, url, published_at, content
FROM public.blog_articles
WHERE id = '__ARTICLE__'
$q$;

  q_b1 text := $q$
WITH input AS (
  SELECT *
  FROM jsonb_to_recordset($vorlagen$__JSON__$vorlagen$::jsonb) AS x(
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
  SELECT '__ARTICLE__'::uuid, position, 'draft', pin_type, title, description,
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
    WHERE i.position NOT IN (SELECT w.position FROM written w)) AS skipped_positions
$q$;

  q_c1 text := $q$
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
ORDER BY latest.created_at
$q$;

  q_c2 text := $q$
WITH neu AS (
  SELECT *
  FROM jsonb_to_record($vorlage$__JSON__$vorlage$::jsonb) AS x(
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
  WHERE t.id = '__TEMPLATE__'
    AND t.status = 'needs_revision'
),
snap AS (
  UPDATE public.pin_template_revisions r
  SET previous_snapshot = alt.snapshot
  FROM alt
  WHERE r.id = '__REVISION__'
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
  WHERE t.id = '__TEMPLATE__'
    AND t.status = 'needs_revision'
  RETURNING t.id
)
SELECT (SELECT count(*) FROM snap) AS snapshot_written,
       (SELECT count(*) FROM upd)  AS template_updated
$q$;

  q_d1 text := $q$
SELECT a.id AS article_id, a.title,
       count(t.id) AS template_count,
       count(t.id) FILTER (WHERE t.status = 'draft')          AS draft,
       count(t.id) FILTER (WHERE t.status = 'needs_revision') AS needs_revision,
       count(t.id) FILTER (WHERE t.status = 'approved')       AS approved,
       count(t.id) FILTER (WHERE t.status = 'archived')       AS archived
FROM public.blog_articles a
LEFT JOIN public.pin_templates t ON t.blog_article_id = a.id
WHERE a.id IN ('__ARTICLE__')
GROUP BY a.id, a.title
ORDER BY a.title
$q$;

  q_d2 text := $q$
SELECT a.blog_project_id AS project_id, a.id AS article_id, a.title,
       count(t.id) AS template_count
FROM public.pin_templates t
JOIN public.blog_articles a ON a.id = t.blog_article_id
GROUP BY a.blog_project_id, a.id, a.title
HAVING count(t.id) <> 30
ORDER BY template_count
$q$;

BEGIN
  -- ==========================================================================
  -- SETUP (as postgres)
  -- ==========================================================================
  -- Prefer an article of an already granted project, else any active article
  -- without templates; the project is granted temporarily if needed.
  SELECT a.id, a.blog_project_id, a.tenant_id INTO v_article, v_project, v_tenant
  FROM public.blog_articles a
  WHERE a.archived_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.pin_templates t WHERE t.blog_article_id = a.id)
  ORDER BY (a.blog_project_id IN (SELECT blog_project_id FROM public.agent_project_access
                                  WHERE role_name = 'pin_werkstatt_agent')) DESC,
           a.published_at DESC NULLS LAST
  LIMIT 1;

  IF v_article IS NULL THEN
    RAISE EXCEPTION 'SKILL-TEST: no active article without templates to test with';
  END IF;

  GRANT pin_werkstatt_agent TO postgres WITH INHERIT FALSE, SET TRUE;

  INSERT INTO public.agent_project_access (role_name, blog_project_id)
  VALUES ('pin_werkstatt_agent', v_project)
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_grants FROM public.agent_project_access
  WHERE role_name = 'pin_werkstatt_agent';

  SELECT a.id INTO v_foreign FROM public.blog_articles a
  WHERE a.blog_project_id NOT IN (SELECT blog_project_id FROM public.agent_project_access
                                  WHERE role_name = 'pin_werkstatt_agent')
  LIMIT 1;

  v_json := (
    SELECT jsonb_agg(jsonb_build_object(
      'position', gs,
      'pin_type', 'Skill-Test',
      'title', 'Skill-Test ' || gs,
      'description', 'Trauer bewältigen: Testbeschreibung ' || gs,
      'board_name_raw', 'Test-Pinnwand',
      'overlay', E'Trauer  Bewältigen\nZeile ' || gs,
      'main_keyword', 'Trauer bewältigen',
      'longtails', jsonb_build_array('longtail a', 'longtail b'),
      'search_phrases', jsonb_build_array('suchphrase'),
      'quality_check', jsonb_build_array('ok'),
      'search_intent', 'informational',
      'image_idea', 'Idee',
      'image_prompt', 'Prompt mit $ Dollar, '' Apostroph und \ Backslash ' || gs,
      'design', jsonb_build_object('name', 'Klar', 'fonts', jsonb_build_array('Inter'),
                                   'colors', jsonb_build_array('#ffffff')),
      'season', NULL
    ) ORDER BY gs)
    FROM generate_series(1, 30) gs
  );

  SET LOCAL ROLE pin_werkstatt_agent;

  -- ==========================================================================
  -- A: ORIENTATION
  -- ==========================================================================
  EXECUTE 'SELECT count(*) FROM (' || q_a1 || ') q' INTO v_n;
  IF v_n = v_grants THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   A1 sees ' || v_n || ' granted project(s)';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL A1 expected ' || v_grants || ', got ' || v_n; END IF;

  SELECT count(*) INTO v_n FROM public.blog_projects;
  IF v_n = v_grants THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   RLS: blog_projects limited to grants';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL RLS: blog_projects shows ' || v_n; END IF;

  EXECUTE 'SELECT count(*) FROM (' || replace(q_a2, '__PROJECT__', v_project::text) || ') q' INTO v_n;
  IF v_n = 1 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   A2 project context';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL A2 rows ' || v_n; END IF;

  EXECUTE 'SELECT count(*) FROM (' || replace(q_a3, '__PROJECT__', v_project::text)
          || ') q WHERE template_count < 30' INTO v_n;
  IF v_n >= 1 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   A3 articles without 30 templates: ' || v_n;
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL A3 returned no article'; END IF;

  EXECUTE 'SELECT count(*) FILTER (WHERE status IS NULL) FROM (' || replace(q_a4, '__ARTICLE__', v_article::text) || ') q' INTO v_n;
  IF v_n = 30 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   A4 30 free positions';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL A4 free positions ' || v_n; END IF;

  EXECUTE 'SELECT count(*) FROM (' || replace(q_a5, '__ARTICLE__', v_article::text) || ') q' INTO v_n;
  IF v_n = 1 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   A5 article readable';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL A5 rows ' || v_n; END IF;

  -- ==========================================================================
  -- B: UPSERT
  -- ==========================================================================
  EXECUTE replace(replace(q_b1, '__JSON__', v_json::text), '__ARTICLE__', v_article::text) INTO v_row;
  IF v_row.sent = 30 AND v_row.inserted = 30 AND v_row.updated = 0 AND cardinality(v_row.skipped_positions) = 0 THEN
    v_ok := v_ok + 1; v_log := v_log || E'\nok   B1 first run inserts 30';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL B1 first run ' || row_to_json(v_row)::text; END IF;

  SELECT count(*) INTO v_n FROM public.pin_templates
  WHERE blog_article_id = v_article AND tenant_id = v_tenant AND status = 'draft'
    AND longtails = ARRAY['longtail a', 'longtail b'] AND design->'fonts' = '["Inter"]'
    AND starts_with(image_prompt, 'Prompt mit $ Dollar, '' Apostroph und \ Backslash ');
  IF v_n = 30 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   B1 tenant_id derived, arrays/json/quoting intact';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL B1 stored rows as expected: ' || v_n; END IF;

  EXECUTE replace(replace(q_b1, '__JSON__', v_json::text), '__ARTICLE__', v_article::text) INTO v_row;
  IF v_row.inserted = 0 AND v_row.updated = 30 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   B1 re-run updates 30, no duplicates';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL B1 re-run ' || row_to_json(v_row)::text; END IF;

  EXECUTE 'SELECT template_count FROM (' || replace(q_d1, '__ARTICLE__', v_article::text) || ') q' INTO v_n;
  IF v_n = 30 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   D1 template_count 30';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL D1 template_count ' || v_n; END IF;

  -- Simulate the reviewer in the UI (as postgres): approve 1, archive 3,
  -- request a revision on 2.
  RESET ROLE;
  UPDATE public.pin_templates SET status = 'approved' WHERE blog_article_id = v_article AND position = 1 RETURNING id INTO v_t1;
  UPDATE public.pin_templates SET status = 'archived' WHERE blog_article_id = v_article AND position = 3;
  UPDATE public.pin_templates SET status = 'needs_revision' WHERE blog_article_id = v_article AND position = 2 RETURNING id INTO v_t2;
  INSERT INTO public.pin_template_revisions (tenant_id, template_id, feedback, created_at)
  VALUES (v_tenant, v_t2, 'Älterer Wunsch', now() - interval '1 hour');
  INSERT INTO public.pin_template_revisions (tenant_id, template_id, feedback)
  VALUES (v_tenant, v_t2, 'Titel knackiger') RETURNING id INTO v_rev;
  SET LOCAL ROLE pin_werkstatt_agent;

  EXECUTE replace(replace(q_b1, '__JSON__', v_json::text), '__ARTICLE__', v_article::text) INTO v_row;
  IF v_row.updated = 27 AND v_row.skipped_positions = ARRAY[1, 2, 3] THEN
    v_ok := v_ok + 1; v_log := v_log || E'\nok   B1 skips approved/needs_revision/archived (1,2,3)';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL B1 skip ' || row_to_json(v_row)::text; END IF;

  SELECT status INTO v_txt FROM public.pin_templates WHERE id = v_t1;
  IF v_txt = 'approved' THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   approved template untouched';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL approved template now ' || v_txt; END IF;

  -- ==========================================================================
  -- C: REVISIONS
  -- ==========================================================================
  EXECUTE 'SELECT revision_id, feedback, jsonb_array_length(history) AS hist, current_template FROM ('
          || q_c1 || ') q WHERE template_id = $1' INTO v_row USING v_t2;
  IF v_row.revision_id = v_rev AND v_row.feedback = 'Titel knackiger' AND v_row.hist = 2
     AND v_row.current_template ? 'position' AND NOT v_row.current_template ? 'tenant_id' THEN
    v_ok := v_ok + 1; v_log := v_log || E'\nok   C1 newest feedback, history, current_template';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL C1 ' || coalesce(row_to_json(v_row)::text, 'no row'); END IF;

  v_one := (v_row.current_template - 'position') || jsonb_build_object('title', 'Skill-Test überarbeitet');

  EXECUTE replace(replace(replace(q_c2, '__JSON__', v_one::text), '__TEMPLATE__', v_t2::text), '__REVISION__', v_rev::text) INTO v_row;
  IF v_row.snapshot_written = 1 AND v_row.template_updated = 1 THEN
    v_ok := v_ok + 1; v_log := v_log || E'\nok   C2 snapshot + rework';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL C2 ' || row_to_json(v_row)::text; END IF;

  SELECT t.status || '|' || t.title || '|' || coalesce(r.previous_snapshot->>'title', 'NULL')
  INTO v_txt
  FROM public.pin_templates t JOIN public.pin_template_revisions r ON r.template_id = t.id AND r.id = v_rev
  WHERE t.id = v_t2;
  IF v_txt = 'draft|Skill-Test überarbeitet|Skill-Test 2' THEN
    v_ok := v_ok + 1; v_log := v_log || E'\nok   C2 status draft, new title, snapshot holds old title';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL C2 state ' || coalesce(v_txt, 'NULL'); END IF;

  EXECUTE replace(replace(replace(q_c2, '__JSON__', v_one::text), '__TEMPLATE__', v_t2::text), '__REVISION__', v_rev::text) INTO v_row;
  IF v_row.snapshot_written = 0 AND v_row.template_updated = 0 THEN
    v_ok := v_ok + 1; v_log := v_log || E'\nok   C2 re-run is a no-op';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL C2 re-run ' || row_to_json(v_row)::text; END IF;

  EXECUTE 'SELECT count(*) FROM (' || q_c1 || ') q WHERE template_id = $1' INTO v_n USING v_t2;
  IF v_n = 0 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   C1 no longer lists the reworked template';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL C1 still lists it'; END IF;

  EXECUTE 'SELECT count(*) FROM (' || q_d2 || ') q WHERE article_id = $1' INTO v_n USING v_article;
  IF v_n = 0 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   D2 test article complete';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL D2 lists test article'; END IF;

  -- ==========================================================================
  -- REJECTIONS (each in its own subtransaction)
  -- ==========================================================================
  -- expected: SQLSTATE and a fragment of the message documented in SKILL.md
  FOR v_row IN
    SELECT * FROM (VALUES
      ('overlay without keyword', '23514', 'pin_templates_keyword_in_overlay',
       replace(replace(q_b1, '__JSON__', jsonb_set(v_json, '{3,overlay}', '"ohne"')::text), '__ARTICLE__', v_article::text)),
      ('description not starting with keyword', '23514', 'pin_templates_description_starts_with_keyword',
       replace(replace(q_b1, '__JSON__', jsonb_set(v_json, '{3,description}', '"Anders"')::text), '__ARTICLE__', v_article::text)),
      ('description over 500 chars', '23514', 'pin_templates_description_max_length',
       replace(replace(q_b1, '__JSON__', jsonb_set(v_json, '{3,description}', to_jsonb('Trauer bewältigen ' || repeat('x', 490)))::text), '__ARTICLE__', v_article::text)),
      ('position 31', '23514', 'pin_templates_position_range',
       replace(replace(q_b1, '__JSON__', jsonb_set(v_json, '{3,position}', '31')::text), '__ARTICLE__', v_article::text)),
      ('main_keyword missing', '23502', 'main_keyword',
       replace(replace(q_b1, '__JSON__', jsonb_set(v_json, '{3,main_keyword}', 'null')::text), '__ARTICLE__', v_article::text)),
      ('duplicate position in input', '21000', 'ON CONFLICT DO UPDATE command cannot affect row a second time',
       replace(replace(q_b1, '__JSON__', (v_json || jsonb_build_array(v_json->4))::text), '__ARTICLE__', v_article::text)),
      ('broken JSON', '22P02', 'invalid input syntax for type json',
       replace(replace(q_b1, '__JSON__', '[{"position": 4,'), '__ARTICLE__', v_article::text)),
      ('update approved template', '42501', 'must not be changed by the agent',
       format('UPDATE public.pin_templates SET title = %L WHERE id = %L', 'x', v_t1)),
      ('write status approved', '42501', 'agent may only write status draft or needs_revision',
       format('UPDATE public.pin_templates SET status = %L WHERE blog_article_id = %L AND position = 4', 'approved', v_article)),
      ('delete template', '42501', 'permission denied for table pin_templates',
       format('DELETE FROM public.pin_templates WHERE blog_article_id = %L', v_article)),
      ('change feedback', '42501', 'permission denied for table pin_template_revisions',
       format('UPDATE public.pin_template_revisions SET feedback = %L WHERE id = %L', 'x', v_rev)),
      ('insert revision', '42501', 'permission denied for table pin_template_revisions',
       format('INSERT INTO public.pin_template_revisions (tenant_id, template_id, feedback) VALUES (%L, %L, %L)', v_tenant, v_t2, 'x')),
      ('read pins', '42501', 'permission denied for table pins',
       'SELECT count(*) FROM public.pins'),
      ('read profiles', '42501', 'permission denied for table profiles',
       'SELECT count(*) FROM public.profiles'),
      ('vault function', '42501', 'permission denied for function',
       format('SELECT public.get_gemini_api_key(%L)', v_project))
    ) AS t(label, want_state, want_msg, stmt)
  LOOP
    BEGIN
      EXECUTE v_row.stmt;
      v_fail := v_fail + 1; v_log := v_log || E'\nFAIL reject ' || v_row.label || ': no error';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      IF v_state = v_row.want_state AND strpos(v_msg, v_row.want_msg) > 0 THEN
        v_ok := v_ok + 1; v_log := v_log || E'\nok   reject ' || v_row.label || ' [' || v_state || ']';
      ELSE
        v_fail := v_fail + 1; v_log := v_log || E'\nFAIL reject ' || v_row.label || ': [' || v_state || '] ' || v_msg;
      END IF;
    END;
  END LOOP;

  -- Article outside the grants: RLS rejects (or the derived tenant_id is NULL).
  IF v_foreign IS NOT NULL THEN
    BEGIN
      EXECUTE replace(replace(q_b1, '__JSON__', v_json::text), '__ARTICLE__', v_foreign::text);
      v_fail := v_fail + 1; v_log := v_log || E'\nFAIL reject foreign article: no error';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
      IF v_state IN ('42501', '23502') THEN
        v_ok := v_ok + 1; v_log := v_log || E'\nok   reject foreign article [' || v_state || '] ' || v_msg;
      ELSE
        v_fail := v_fail + 1; v_log := v_log || E'\nFAIL reject foreign article: [' || v_state || '] ' || v_msg;
      END IF;
    END;

    EXECUTE 'SELECT count(*) FROM (' || replace(q_a5, '__ARTICLE__', v_foreign::text) || ') q' INTO v_n;
    IF v_n = 0 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   RLS: foreign article invisible';
    ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL RLS: foreign article visible'; END IF;
  END IF;

  -- Explicit tenant_id is overridden by the trigger.
  UPDATE public.pin_templates SET tenant_id = gen_random_uuid()
  WHERE blog_article_id = v_article AND position = 4;
  SELECT count(*) INTO v_n FROM public.pin_templates
  WHERE blog_article_id = v_article AND position = 4 AND tenant_id = v_tenant;
  IF v_n = 1 THEN v_ok := v_ok + 1; v_log := v_log || E'\nok   tenant_id set by agent is overridden';
  ELSE v_fail := v_fail + 1; v_log := v_log || E'\nFAIL tenant_id override'; END IF;

  RAISE EXCEPTION 'SKILL-TEST: % ok, % failed (article %, rolled back)%', v_ok, v_fail, v_article, v_log;
END
$test$;
