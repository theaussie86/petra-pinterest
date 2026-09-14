---
name: pin-werkstatt
description: Pin-Vorlagen für die Pin-Werkstatt in Pinfinity erzeugen und Änderungswünsche abarbeiten. Direkter Postgres-Zugang als Rolle pin_werkstatt_agent. Nutzen, wenn Pin-Vorlagen (30 pro Blogartikel) geschrieben, ergänzt oder nach Feedback überarbeitet werden sollen, oder wenn nach offenen Änderungswünschen in der Pin-Werkstatt gefragt wird.
---

# Pin-Werkstatt

Du lieferst Pin-Vorlagen in die Pin-Werkstatt von Pinfinity. Pro Blogartikel gibt
es genau **30 Vorlagen** (Position 1 bis 30). Ein Mensch prüft sie in Pinfinity,
gibt sie frei oder schreibt einen Änderungswunsch. Den Änderungswunsch arbeitest
du ab. Freigeben und Archivieren sind nie deine Aufgabe.

Dieser Skill beschreibt nur den **technischen Ablauf**. Wie eine gute Vorlage
inhaltlich aussieht (Pin-Typen, Keyword-Strategie, Design, Bild-Prompt), steht in
[references/pin-inhalt.md](references/pin-inhalt.md). Alle SQL-Abfragen stehen
fertig in [references/sql.md](references/sql.md). Nutze sie wörtlich und ersetze
nur die markierten Platzhalter.

## 1. Verbindung

- Die Verbindung steht in der Umgebungsvariable `PIN_WERKSTATT_DATABASE_URL`
  (Postgres-URL über den Supabase-Pooler, Benutzer `pin_werkstatt_agent.<projekt>`).
- Gib die URL oder das Passwort nie aus, nicht in Logs, nicht in Antworten, nicht
  in Dateien.
- Fehlt die Variable, brich ab und sag dem Menschen, dass der Zugang nicht
  eingerichtet ist. Frag nicht nach dem Passwort im Chat.
- Mit `psql`: SQL in eine temporäre Datei schreiben und ausführen, das vermeidet
  Probleme mit Anführungszeichen in langen Texten:

  ```bash
  psql "$PIN_WERKSTATT_DATABASE_URL" -v ON_ERROR_STOP=1 -X -f /tmp/pin-werkstatt.sql
  ```

  Ohne `psql` geht jeder Postgres-Client oder Postgres-Connector, der diese URL
  verwendet.
- Jede Abfrage darf höchstens 30 Sekunden laufen (`statement_timeout`).

## 2. Was du darfst

| Tabelle | Rechte |
|---|---|
| `agent_project_access` | lesen (deine Projekt-Freigaben) |
| `blog_projects` | lesen |
| `blog_articles` | lesen |
| `pin_templates` | lesen, anlegen, ändern, **nicht löschen** |
| `pin_template_revisions` | lesen, nur `previous_snapshot` ändern |

Du siehst nur Projekte, die für dich freigegeben sind. Alles andere ist für dich
unsichtbar oder wird abgelehnt. Das ist gewollt, kein Fehler.

## 3. Arbeitsablauf

### Schritt A: Orientierung

1. Freigegebene Projekte abfragen (`sql.md` → **A1**).
2. Für das gewählte Projekt den Projektkontext lesen (**A2**): `ai_context`,
   Zielgruppe, Tonalität, Sprache, Keywords. Das ist die Grundlage für alle Texte.
3. Artikel finden, die noch keine 30 Vorlagen haben (**A3**). Archivierte Artikel
   sind bereits ausgeschlossen.
4. Vor dem Schreiben den Positionsstand des Artikels prüfen (**A4**) und den
   Artikeltext lesen (**A5**).

Arbeite erst die offenen Änderungswünsche ab (Schritt C), dann neue Vorlagen.

### Schritt B: Vorlagen schreiben

1. `references/pin-inhalt.md` lesen und 30 Vorlagen für den Artikel entwerfen.
2. Jede Vorlage vor dem Senden selbst prüfen (Regeln unten).
3. Alle Vorlagen eines Artikels **in einer Anweisung** senden (**B1**). Die
   Anweisung ist atomar: verletzt eine Vorlage eine Regel, wird keine geschrieben.
4. Ergebnis von B1 lesen:
   - `inserted` + `updated` + Anzahl `skipped_positions` = `sent`.
   - `skipped_positions` sind Positionen, die schon `needs_revision`, `approved`
     oder `archived` sind. Die bleiben unverändert. Das ist korrekt.

**Regeln, die die Datenbank erzwingt:**

| Regel | Constraint bei Verstoß |
|---|---|
| `position` zwischen 1 und 30, pro Artikel eindeutig | `pin_templates_position_range` |
| `main_keyword` und `image_prompt` gesetzt | `not-null constraint` |
| `overlay` gesetzt und enthält `main_keyword` wörtlich | `pin_templates_keyword_in_overlay` |
| `description` höchstens 500 Zeichen | `pin_templates_description_max_length` |
| `description` beginnt mit `main_keyword` | `pin_templates_description_starts_with_keyword` |

Der Keyword-Vergleich ignoriert Groß- und Kleinschreibung sowie mehrfache
Leerzeichen und Zeilenumbrüche, sonst ist er wörtlich. „Trauer bewältigen“ passt
auf „trauer  bewältigen“, aber nicht auf „Trauer zu bewältigen“.

**Regeln, die du selbst einhältst:**

- `status` ist immer `draft`. Nie `approved` oder `archived` schreiben.
- `tenant_id` nie setzen. Die Datenbank leitet ihn aus dem Artikel ab.
- Freigegebene oder archivierte Vorlagen nie ändern. B1 lässt sie automatisch aus.
- Nichts löschen. Du kannst es auch nicht.
- `design` ist JSON, alle Schlüssel optional:
  `{"name": "", "layout": "", "image_position": "", "fonts": [""], "scroll_stopper": "", "colors": ["#rrggbb"]}`
- `longtails`, `search_phrases`, `quality_check` sind Listen von Texten.

### Schritt C: Änderungswünsche abarbeiten

1. Offene Änderungswünsche abfragen (**C1**). Du bekommst pro Vorlage das neueste
   Feedback, die älteren Wünsche als Verlauf und den aktuellen Stand der Vorlage.
2. Die Vorlage nach dem Feedback überarbeiten. Offen sind das neueste Feedback und
   alle Einträge im Verlauf, die **neuer** sind als der jüngste Eintrag mit
   `has_snapshot = true`. Ältere Einträge sind schon erledigt und nur Kontext.
   Feedback kann sich auch nur auf ein Feld beziehen, die übrigen Felder
   übernimmst du dann unverändert.
3. Überarbeitung senden (**C2**). Die Anweisung macht in einem Schritt:
   - alten Stand in `previous_snapshot` des neuesten Änderungswunsches sichern,
   - Vorlage mit dem neuen Stand überschreiben,
   - Status zurück auf `draft`.
4. Ergebnis von C2 muss `snapshot_written = 1` und `template_updated = 1` sein.
   Bei `0, 0` war die Vorlage nicht mehr `needs_revision` (zum Beispiel inzwischen
   freigegeben) oder die IDs stimmen nicht. Dann C1 neu abfragen, nicht raten.

Sende in C2 immer die **vollständige** Vorlage. Fehlende Felder werden leer.
Die Position ändert sich bei einer Überarbeitung nie.

### Schritt D: Selbstkontrolle nach jedem Lauf

1. Vollständigkeit prüfen (**D1**) für alle Artikel, die du in diesem Lauf
   bearbeitet hast. Erwartet: `template_count = 30`.
2. Projektweit prüfen (**D2**): Artikel mit angefangenen, aber unvollständigen
   Vorlagen. Erwartet: leeres Ergebnis.
3. Offene Änderungswünsche erneut zählen (**C1**). Erwartet: keine, die du in
   diesem Lauf bearbeitet hast.
4. Kurz berichten: welche Artikel, wie viele Vorlagen neu, aktualisiert,
   übersprungen, welche Änderungswünsche erledigt, welche Fehler offen.

## 4. Fehler und was sie bedeuten

| Fehlermeldung (Auszug) | Bedeutung | Was tun |
|---|---|---|
| `violates check constraint "pin_templates_keyword_in_overlay"` | Overlay fehlt oder enthält das Keyword nicht wörtlich | Overlay oder Keyword anpassen, ganze Anweisung neu senden. Die Zeile steht in `DETAIL: Failing row contains (...)` |
| `violates check constraint "pin_templates_description_starts_with_keyword"` | Beschreibung beginnt nicht mit dem Keyword | Beschreibung mit dem Keyword beginnen lassen |
| `violates check constraint "pin_templates_description_max_length"` | Beschreibung über 500 Zeichen | Kürzen |
| `violates check constraint "pin_templates_position_range"` | Position außerhalb 1 bis 30 | Positionen korrigieren |
| `null value in column "main_keyword"` oder `"image_prompt"` | Pflichtfeld fehlt | Feld füllen |
| `new row violates row-level security policy` (seltener `null value in column "tenant_id"`) | Artikel existiert nicht oder liegt außerhalb deiner Freigaben | Artikel-ID mit A3 prüfen. Nicht selbst `tenant_id` setzen. Stimmt die ID, dem Menschen melden, dass das Projekt nicht freigegeben ist |
| `must not be changed by the agent` | Vorlage ist `approved` oder `archived` | Position auslassen. Nie umgehen |
| `agent may only write status draft or needs_revision` | Du hast einen falschen Status gesendet | `draft` senden |
| `permission denied for table ...` | Operation ist für dich nicht erlaubt (etwa Löschen, fremde Tabelle, Feedback ändern) | Nicht umgehen. Ablauf prüfen |
| `ON CONFLICT DO UPDATE command cannot affect row a second time` | Position doppelt in deinen Daten | Doppelte Positionen in der Eingabe entfernen |
| `canceling statement due to statement timeout` | Abfrage länger als 30 Sekunden | Weniger auf einmal senden, zum Beispiel einen Artikel pro Anweisung |
| `password authentication failed` / `Tenant or user not found` | Zugangsdaten falsch oder Login deaktiviert | Abbrechen und dem Menschen melden. Nicht wiederholt probieren |
| `invalid input syntax for type json` | JSON der Vorlagen kaputt | JSON prüfen, Dollar-Quoting beachten (siehe `sql.md`) |

Bei einem Fehler wurde nichts aus dieser Anweisung geschrieben. Einfach korrigiert
neu senden ist sicher, weil B1 und C2 idempotent sind.
