# Pin-Werkstatt: DB-User für den Agenten einrichten

Anleitung für Menschen. Beschreibt, wie ein externer KI-Agent Zugang zur
Pinfinity-Datenbank bekommt, um Pin-Vorlagen zu schreiben, und wie man diesen
Zugang erweitert, rotiert und wieder entzieht.

- Datenbank-Seite: Migration `supabase/migrations/00029_pin_werkstatt_agent_role.sql`
- Skill für den Agenten: `agent-skills/pin-werkstatt/`
- Rechte-Checks: `supabase/tests/function_privileges.sql`
- Probelauf aller Skill-Abfragen mit Rollback: `supabase/tests/pin_werkstatt_agent_skill.sql`
- Vertrag für Repo-Leser: [`pin-template-write-contract.md`](./pin-template-write-contract.md)

Alle SQL-Befehle unten laufen im Supabase SQL-Editor (Projekt `Pinterest
Management`, Ref `dedacaqstvzxlxpxvxgb`) als `postgres`, außer es steht anders da.

---

## 1. Was die Rolle darf und was nicht

Die Rolle heißt `pin_werkstatt_agent`.

| Tabelle | Rechte |
|---|---|
| `agent_project_access` | nur eigene Zeilen lesen |
| `blog_projects` | lesen |
| `blog_articles` | lesen |
| `pin_templates` | lesen, anlegen, ändern. **Kein** Löschen |
| `pin_template_revisions` | lesen, nur Spalte `previous_snapshot` ändern |
| alles andere (`pins`, `profiles`, `pinterest_connections`, Vault ...) | kein Zugriff |

Zusätzlich:

- **Nur freigegebene Projekte.** Jede Policy prüft `agent_project_access`. Ein
  Projekt ohne Zeile dort ist für den Agenten unsichtbar.
- **Freigegebene und archivierte Vorlagen sind tabu.** Ein Trigger lehnt jede
  Änderung an `approved`/`archived` ab und erlaubt nur die Status `draft` und
  `needs_revision`. Freigeben bleibt eine menschliche Aktion in Pinfinity.
- **`tenant_id` setzt die Datenbank** aus dem Artikel, egal was der Agent sendet.
- **Keine SECURITY-DEFINER-Funktionen.** Der Agent kann weder Gemini-Keys noch
  Pinterest-Tokens abrufen.
- `statement_timeout` = 30 Sekunden pro Abfrage.

**Warum die Rolle RLS nicht umgeht:** Row Level Security wird nur für Superuser,
Rollen mit `BYPASSRLS` und den Eigentümer einer Tabelle übersprungen. Die Rolle
ist `NOBYPASSRLS`, kein Superuser, besitzt keine Tabelle und erbt keine anderen
Rollen (`NOINHERIT`). Anders als der Service-Role-Key, der alle Policies
überspringt, sieht sie also nur, was die Policies `TO pin_werkstatt_agent`
ausdrücklich erlauben.

---

## 2. Login aktivieren und Passwort setzen

Die Migration legt die Rolle ohne Login an, damit kein Passwort im Repo landet.

1. Starkes Passwort erzeugen, nur Buchstaben und Ziffern (dann muss in der URL
   nichts kodiert werden):

   ```bash
   openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40; echo
   ```

2. Login aktivieren. **Bevorzugt mit `psql`**, dort geht das Passwort nur gehasht
   an den Server und landet in keinem Verlauf:

   ```text
   psql "<Verbindungs-URL als postgres>"
   ALTER ROLE pin_werkstatt_agent WITH LOGIN;
   \password pin_werkstatt_agent
   ```

   Alternativ im SQL-Editor (Abfrage danach **nicht** als Snippet speichern):

   ```sql
   ALTER ROLE pin_werkstatt_agent WITH LOGIN PASSWORD '<passwort>';
   ```

3. Prüfen:

   ```sql
   SELECT rolname, rolcanlogin, rolbypassrls, rolconfig
   FROM pg_roles WHERE rolname = 'pin_werkstatt_agent';
   ```

   Erwartet: `rolcanlogin = true`, `rolbypassrls = false`,
   `rolconfig = {statement_timeout=30s}`.

---

## 3. Verbindungs-String (Supabase-Pooler)

Der Agent verbindet sich über den **Supavisor-Pooler**. Die direkte Adresse
`db.dedacaqstvzxlxpxvxgb.supabase.co` ist nur über IPv6 erreichbar und für die
meisten Agenten-Umgebungen ungeeignet.

**Format des Benutzernamens beim Pooler:** `<rolle>.<projekt-ref>`, also
`pin_werkstatt_agent.dedacaqstvzxlxpxvxgb`. Ohne den Projekt-Suffix meldet der
Pooler `Tenant or user not found`.

```text
postgresql://pin_werkstatt_agent.dedacaqstvzxlxpxvxgb:<passwort>@<pooler-host>:5432/postgres?sslmode=require
```

- `<pooler-host>`: im Supabase-Dashboard unter **Connect → Session pooler**
  kopieren. Region ist `eu-west-2`, der Host hat die Form
  `aws-<n>-eu-west-2.pooler.supabase.com`. Die Zahl nicht raten, kopieren.
- Port `5432` = Session-Modus (empfohlen). Port `6543` = Transaktions-Modus,
  funktioniert auch, weil jede Skill-Abfrage eine einzelne Anweisung ist.
- Enthält das Passwort Sonderzeichen, müssen sie URL-kodiert werden. Deshalb
  oben nur Buchstaben und Ziffern.

**Test** vom Rechner des Agenten:

```bash
psql "$PIN_WERKSTATT_DATABASE_URL" -X -c "SELECT current_user, (SELECT count(*) FROM public.agent_project_access) AS projekte;"
```

Erwartet: `pin_werkstatt_agent` und die Zahl der freigegebenen Projekte.

---

## 4. Projekte freigeben und entziehen

Freigeben (hier die zwei Projekte des ersten Agenten):

```sql
INSERT INTO public.agent_project_access (role_name, blog_project_id)
VALUES
  ('pin_werkstatt_agent', '1a479225-fe56-4648-b815-8cbf82476083'),  -- Himmelstränen
  ('pin_werkstatt_agent', 'ca6ada9a-d4f9-4d56-83e6-3e553269be00')   -- Online Heldinnen
ON CONFLICT DO NOTHING;
```

Anzeigen:

```sql
SELECT g.role_name, p.name, g.blog_project_id, g.created_at
FROM public.agent_project_access g
JOIN public.blog_projects p ON p.id = g.blog_project_id
ORDER BY g.role_name, p.name;
```

Entziehen:

```sql
DELETE FROM public.agent_project_access
WHERE role_name = 'pin_werkstatt_agent'
  AND blog_project_id = '<blog_project_id>';
```

Das wirkt ab der nächsten Abfrage des Agenten, die Policies werden bei jeder
Abfrage neu ausgewertet. Bereits geschriebene Vorlagen bleiben erhalten.

---

## 5. Passwort rotieren

1. Neues Passwort erzeugen (Abschnitt 2, Schritt 1).
2. Setzen: in `psql` mit `\password pin_werkstatt_agent`, oder
   `ALTER ROLE pin_werkstatt_agent WITH PASSWORD '<neu>';`.
3. `PIN_WERKSTATT_DATABASE_URL` in jeder Agenten-Umgebung aktualisieren.
4. Offene Sitzungen mit dem alten Passwort beenden (bestehende Verbindungen
   bleiben sonst bestehen, bis sie abbrechen):

   ```sql
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE usename = 'pin_werkstatt_agent';
   ```

5. Verbindungstest aus Abschnitt 3 wiederholen.

**Vorübergehend sperren**, ohne etwas zu löschen:

```sql
ALTER ROLE pin_werkstatt_agent WITH NOLOGIN;
-- danach die Sitzungen beenden wie in Schritt 4
```

Wieder öffnen mit `ALTER ROLE pin_werkstatt_agent WITH LOGIN;`.

---

## 6. Weiteren Agenten mit eigener Rolle anlegen

Jeder Agent bekommt eine **eigene Rolle**. So lässt sich einer sperren, ohne die
anderen zu stören, und `agent_project_access` trennt die Freigaben pro Rolle.

Wichtig: Es reicht nicht, die Rolle anzulegen. Die Policies nennen die Rolle
namentlich (`TO pin_werkstatt_agent`), und der Schutz-Trigger
`pin_templates_guard_agent_writes` prüft `current_user` auf genau diesen Namen.
Eine neue Rolle ohne Anpassung am Trigger dürfte freigegebene Vorlagen ändern.

Deshalb als **neue Migration** (`supabase/migrations/000NN_<name>.sql`), nicht
von Hand, damit Repo und Datenbank gleich bleiben. Beispiel für
`pin_werkstatt_agent_2`:

```sql
-- 1. Rolle, gleiche Eigenschaften wie die erste
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pin_werkstatt_agent_2') THEN
    CREATE ROLE pin_werkstatt_agent_2 NOLOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;
ALTER ROLE pin_werkstatt_agent_2 SET statement_timeout = '30s';

-- 2. Tabellenrechte
GRANT USAGE ON SCHEMA public TO pin_werkstatt_agent_2;
GRANT SELECT ON public.agent_project_access TO pin_werkstatt_agent_2;
GRANT SELECT ON public.blog_projects TO pin_werkstatt_agent_2;
GRANT SELECT ON public.blog_articles TO pin_werkstatt_agent_2;
GRANT SELECT, INSERT, UPDATE ON public.pin_templates TO pin_werkstatt_agent_2;
GRANT SELECT ON public.pin_template_revisions TO pin_werkstatt_agent_2;
GRANT UPDATE (previous_snapshot) ON public.pin_template_revisions TO pin_werkstatt_agent_2;
GRANT EXECUTE ON FUNCTION public.pin_template_normalize(text) TO pin_werkstatt_agent_2;

-- 3. Bestehende Policies um die Rolle erweitern (Scope bleibt current_user)
ALTER POLICY "Agent sees own project grants" ON public.agent_project_access TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent reads granted projects" ON public.blog_projects TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent reads articles of granted projects" ON public.blog_articles TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent reads templates of granted projects" ON public.pin_templates TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent inserts templates for granted projects" ON public.pin_templates TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent updates templates of granted projects" ON public.pin_templates TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent reads revisions of granted projects" ON public.pin_template_revisions TO pin_werkstatt_agent, pin_werkstatt_agent_2;
ALTER POLICY "Agent updates revisions of granted projects" ON public.pin_template_revisions TO pin_werkstatt_agent, pin_werkstatt_agent_2;

-- 4. Schutz-Trigger auf alle Agenten-Rollen ausweiten
CREATE OR REPLACE FUNCTION public.pin_templates_guard_agent_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('pin_werkstatt_agent', 'pin_werkstatt_agent_2') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IN ('approved', 'archived') THEN
    RAISE EXCEPTION 'pin template % is % and must not be changed by the agent', OLD.id, OLD.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status NOT IN ('draft', 'needs_revision') THEN
    RAISE EXCEPTION 'agent may only write status draft or needs_revision, got %', NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
```

Danach:

1. Migration anwenden, Login und Passwort wie in Abschnitt 2 (mit dem neuen
   Rollennamen), Projekte wie in Abschnitt 4 mit `role_name = 'pin_werkstatt_agent_2'`.
2. In `supabase/tests/function_privileges.sql` die Abschnitte für
   `pin_werkstatt_agent` für die neue Rolle kopieren.
3. `function_privileges.sql` ausführen (Abschnitt 9).

---

## 7. Rechte später erweitern

Jede Erweiterung besteht aus **zwei Teilen**, beide in einer Migration:

1. `GRANT` auf die Tabelle (was die Rolle grundsätzlich darf),
2. eine Policy `TO pin_werkstatt_agent`, gescoped über `agent_project_access`
   (welche Zeilen).

Fehlt die Policy, sieht die Rolle trotz `GRANT` keine Zeile, weil RLS aktiv ist.
Fehlt das `GRANT`, kommt `permission denied`.

Beispiel: Der Agent soll die Pins seiner Projekte lesen.

```sql
GRANT SELECT ON public.pins TO pin_werkstatt_agent;

CREATE POLICY "Agent reads pins of granted projects"
  ON public.pins
  FOR SELECT
  TO pin_werkstatt_agent
  USING (
    blog_project_id IN (
      SELECT blog_project_id FROM public.agent_project_access
      WHERE role_name = current_user
    )
  );
```

Und in `function_privileges.sql` die Erwartung anpassen
(`('public.pins', 'SELECT', true)`).

**Regeln:**

- **Niemals `EXECUTE` auf eine `SECURITY DEFINER`-Funktion an die Rolle
  vergeben.** Diese Funktionen laufen mit den Rechten ihres Eigentümers und
  umgehen RLS, damit auch die Projekt-Freigaben. Die Vault-Funktionen würden
  Gemini-Keys und Pinterest-Tokens aller Kunden herausgeben.
- **Neue `SECURITY DEFINER`-Funktionen** immer mit
  `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;` anlegen. Postgres vergibt sonst
  `EXECUTE` an alle Rollen, auch an den Agenten.
- Kein `DELETE` ohne sehr guten Grund. Vorlagen löschen ist eine Entscheidung
  für Menschen.
- Keine Rolle an die Agenten-Rolle vergeben (`GRANT authenticated TO ...`,
  `GRANT service_role TO ...`) und nie `BYPASSRLS`.
- Kommt eine neue Statusregel oder ein neues Pflichtfeld dazu: Skill
  (`agent-skills/pin-werkstatt/`) und `pin_werkstatt_agent_skill.sql` mitziehen.

---

## 8. Zugang komplett entziehen

**Schritt 1, sofort wirksam** (reversibel):

```sql
ALTER ROLE pin_werkstatt_agent WITH NOLOGIN;

SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE usename = 'pin_werkstatt_agent';

DELETE FROM public.agent_project_access
WHERE role_name = 'pin_werkstatt_agent';
```

Ab hier kann der Agent sich nicht mehr anmelden und sähe auch nach einem
versehentlichen Re-Login keine Daten. `PIN_WERKSTATT_DATABASE_URL` in der
Agenten-Umgebung löschen.

**Schritt 2, Rolle entfernen** (endgültig, als Migration, damit ein frisches
Setup die Rolle nicht über `00029` wieder anlegt):

```sql
DELETE FROM public.agent_project_access WHERE role_name = 'pin_werkstatt_agent';

-- Entzieht alle Rechte der Rolle und nimmt sie aus allen Policies. Policies,
-- die nur diese Rolle nennen, werden dabei gelöscht.
DROP OWNED BY pin_werkstatt_agent;

DROP ROLE pin_werkstatt_agent;
```

Danach in derselben Migration oder direkt im Anschluss:

- den Schutz-Trigger nur anpassen, wenn noch andere Agenten-Rollen existieren
  (Abschnitt 6, Schritt 4). Ohne jede Agenten-Rolle kann der Trigger bleiben, er
  lässt dann alle Schreiber durch;
- in `function_privileges.sql` die Checks für `pin_werkstatt_agent` entfernen,
  sonst schlägt `has_table_privilege` mit „role does not exist“ fehl;
- `pin_werkstatt_agent_skill.sql` löschen oder auf die verbleibende Rolle umstellen.

Bereits geschriebene Vorlagen und Änderungswünsche bleiben erhalten.

---

## 9. Nach jeder Änderung prüfen

1. `supabase/tests/function_privileges.sql` im SQL-Editor ausführen. Jede Zeile
   muss `passed = true` zeigen, Fehler stehen oben.
2. Neue Rollen oder neue Rechte dort ergänzen, **bevor** die Änderung live geht.
3. Bei Änderungen an Tabellen, Triggern oder Policies der Werkstatt zusätzlich
   `supabase/tests/pin_werkstatt_agent_skill.sql` ausführen. Erwartet ist eine
   Fehlermeldung, die mit `SKILL-TEST: <n> ok, 0 failed` beginnt. Der Block
   rollt alles zurück, auch die vorübergehende Rollenmitgliedschaft.

---

## 10. Inbetriebnahme (Checkliste)

| # | Schritt | Wer |
|---|---|---|
| 1 | Login aktivieren, Passwort setzen (Abschnitt 2) | Mensch |
| 2 | Himmelstränen und Online Heldinnen freigeben (Abschnitt 4) | Mensch oder Agent mit Admin-Zugang |
| 3 | Pooler-Host aus dem Dashboard kopieren, URL bauen, Verbindung testen (Abschnitt 3) | Mensch |
| 4 | Skill installieren (unten), `PIN_WERKSTATT_DATABASE_URL` in der Agenten-Umgebung hinterlegen | Mensch |
| 5 | `references/pin-inhalt.md` befüllen und Markierung `NOCH NICHT BEFÜLLT` entfernen | Mensch |
| 6 | `function_privileges.sql` ausführen | Mensch |
| 7 | Probelauf (unten) | Agent + Mensch |

**Skill installieren.** Der Ordner `agent-skills/pin-werkstatt/` ist ein
eigenständiger Skill (`SKILL.md` plus `references/`), ohne Bezug zu diesem Repo.

- **Claude Code:** Ordner nach `~/.claude/skills/pin-werkstatt/` kopieren.
- **Cowork / Claude.ai:** Ordner als ZIP packen und unter Skills hochladen.
- **Codex:** Ordner in das Skill-Verzeichnis von Codex kopieren (laut
  Codex-Doku), Umgebungsvariable in der Codex-Umgebung setzen.
- **ChatGPT:** `SKILL.md` und `references/` als Anweisungen/Dateien hinterlegen.
  Braucht einen Postgres-Connector oder ein Werkzeug, das SQL gegen die URL
  ausführen kann.

Die Zugangsdaten stehen nie im Skill, immer nur in der Umgebung.

**Probelauf.**

1. Agent: „Arbeite die Pin-Werkstatt für Himmelstränen ab“. Er wählt einen
   Artikel ohne Vorlagen und schreibt 30 Vorlagen.
2. Mensch: In Pinfinity unter Pin-Werkstatt prüfen, dass 30 Vorlagen für den
   Artikel sichtbar sind. Eine Vorlage freigeben, bei einer anderen einen
   Änderungswunsch schreiben.
3. Agent: erneut starten. Er arbeitet den Änderungswunsch ab.
4. Kontrolle als `postgres`:

   ```sql
   SELECT t.position, t.status, t.title,
          r.feedback, r.previous_snapshot IS NOT NULL AS snapshot_gesetzt
   FROM public.pin_templates t
   LEFT JOIN public.pin_template_revisions r ON r.template_id = t.id
   WHERE t.blog_article_id = '<article_id>'
     AND (t.status <> 'draft' OR r.id IS NOT NULL)
   ORDER BY t.position;
   ```

   Erwartet: die freigegebene Vorlage `approved` und unverändert, die geänderte
   Vorlage wieder `draft` mit `snapshot_gesetzt = true`.
5. `function_privileges.sql` erneut ausführen.
