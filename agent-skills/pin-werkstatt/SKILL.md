---
name: pin-werkstatt
description: Pin-Vorlagen für die Pin-Werkstatt in Pinfinity erzeugen und Änderungswünsche abarbeiten. Zugriff über den Pinfinity-MCP-Server (Connected Agent, OAuth). Nutzen, wenn Pin-Vorlagen (30 pro Blogartikel) geschrieben, ergänzt oder nach Feedback überarbeitet werden sollen, oder wenn nach offenen Änderungswünschen in der Pin-Werkstatt gefragt wird.
---

# Pin-Werkstatt

Du lieferst Pin-Vorlagen in die Pin-Werkstatt von Pinfinity. Pro Blogartikel gibt
es genau **30 Vorlagen** (Position 1 bis 30). Ein Mensch prüft sie in Pinfinity,
gibt sie frei oder schreibt einen Änderungswunsch. Den Änderungswunsch arbeitest
du ab. Freigeben und Archivieren sind nie deine Aufgabe.

Dieser Skill beschreibt nur den **technischen Ablauf**. Wie eine gute Vorlage
inhaltlich aussieht (Pin-Typen, Keyword-Strategie, Design, Bild-Prompt), steht in
[references/pin-inhalt.md](references/pin-inhalt.md).

## 1. Verbindung

Du arbeitest über den **Pinfinity-MCP-Server** (`/mcp`), nicht mehr über eine
Postgres-Datenbankverbindung. Die Nutzerin verbindet ihren Agenten einmal per
OAuth (Login mit Google in Pinfinity, Consent-Seite), danach bist du ein
**Connected Agent**: Du handelst im Namen genau dieser Nutzerin, siehst genau
ihre Daten und darfst genau das, was sie in der UI darf.

- Kein Datenbankpasswort, keine Umgebungsvariable mehr. Es gibt nichts
  Geheimes auszugeben.
- Ist der MCP-Server nicht verbunden oder fehlen dir die Werkstatt-Tools (siehe
  unten), brich ab und sag dem Menschen, dass die Verbindung oder das Feature
  `pin_werkstatt` fehlt. Rate nichts.
- Die Werkstatt-Tools erscheinen nur, wenn das Konto das Feature `pin_werkstatt`
  hat. Prüfe das zuerst mit `get_profile`.

## 2. Was du darfst

Alles läuft über MCP-Tools unter RLS (deine Mandanten-Isolation). Du brauchst
keine Tabellen- oder Rechteübersicht mehr — jedes Tool erlaubt genau das, was
erlaubt ist, und lehnt alles andere mit einer verständlichen Meldung ab.

**Lesen (immer verfügbar):**

| Tool | Zweck |
|---|---|
| `get_profile` | Konto und aktive Features (prüft `pin_werkstatt`). |
| `list_projects` / `get_project` | Projekte und ihr Kontext (`ai_context`, Zielgruppe, Tonalität, Keywords …). |
| `list_articles` | Artikel eines Projekts, mit `workshop_status`. |
| `get_article` | Ein Artikel inkl. Volltext (`content`) und `workshop_note`. |

**Pin-Werkstatt (nur mit Feature `pin_werkstatt`):**

| Tool | Zweck |
|---|---|
| `list_pin_templates` | Vorlagen eines Artikels, nach Position sortiert. |
| `get_pin_template` | Eine einzelne Vorlage. |
| `create_pin_template` | Neue Vorlage anlegen (immer Status `draft`). |
| `update_pin_template` | Vorlage überarbeiten (nur `draft`/`needs_revision`). |
| `list_pin_template_revisions` | Überarbeitungswünsche einer Vorlage (neueste zuerst). |
| `answer_revision_request` | Einen Überarbeitungswunsch beantworten. |

Du kannst **nichts löschen** und keine Vorlage **freigeben oder archivieren** —
dafür gibt es bewusst kein Tool. Freigeben bleibt eine menschliche Aktion in der
UI. Den `status` setzt du nie selbst auf `approved` oder `archived`.

## 3. Arbeitsablauf

### Schritt A: Orientierung

1. `get_profile` aufrufen und prüfen, dass `pin_werkstatt` aktiv ist. Fehlt es,
   abbrechen und dem Menschen melden.
2. `list_projects` aufrufen und das gewünschte Projekt wählen. Für das Projekt
   `get_project` lesen: `ai_context`, Zielgruppe, Tonalität, Sprache, Keywords.
   Das ist die Grundlage für alle Texte.
3. Mit `list_articles` (Filter `project_id`, `archived` weglassen = nur aktive)
   die Artikel durchsehen. Pins schreibst du **nur** für Artikel mit
   `workshop_status = 'wanted'` — der Mensch hat sie in Pinfinity markiert. Für
   alle anderen Artikel schreibst du **nie** Vorlagen, auch wenn du sie siehst.
   Gibt es keinen Artikel mit `wanted`, gibt es nichts zu tun: melde das und
   erfinde keine Auswahl.
4. Für jeden gewählten Artikel `get_article` lesen: `content` als Textgrundlage
   und `workshop_note`. Ist `workshop_note` gesetzt, ist das ein Hinweis des
   Menschen für genau diesen Artikel (zum Beispiel ein saisonaler Fokus) und hat
   Vorrang vor dem allgemeinen Projektkontext.
5. Mit `list_pin_templates` den Positionsstand des Artikels prüfen: welche der 30
   Positionen schon belegt sind und mit welchem Status.

Arbeite erst die offenen Änderungswünsche ab (Schritt C), dann neue Vorlagen.

### Schritt B: Vorlagen schreiben

1. `references/pin-inhalt.md` lesen und die fehlenden Vorlagen für den Artikel
   entwerfen (Ziel: 30 Positionen belegt).
2. Jede Vorlage vor dem Senden selbst prüfen (Regeln unten).
3. Für jede noch freie Position **eine** `create_pin_template` aufrufen
   (`article_id`, `position`, Inhalt). Die Vorlage wird immer als `draft`
   angelegt.
   - Positionen, die schon `draft` sind und die du überarbeiten willst, änderst
     du mit `update_pin_template` statt sie neu anzulegen.
   - Positionen mit `needs_revision`, `approved` oder `archived` lässt du in
     Ruhe. `needs_revision` wird über Schritt C bearbeitet, nicht über B.
4. Jedes Tool prüft den Write-Contract vorab und meldet einen Verstoß als
   verständlichen Fehler. Ist die Position schon belegt, lehnt `create_pin_template`
   ab — dann `list_pin_templates` neu lesen und entscheiden.

**Regeln, die der Write-Contract erzwingt** (die Tools prüfen das vor dem
Schreiben, die Datenbank erzwingt es zusätzlich):

| Regel |
|---|
| `position` zwischen 1 und 30, pro Artikel eindeutig |
| `main_keyword` und `image_prompt` gesetzt (Pflichtfelder) |
| `overlay` gesetzt und enthält `main_keyword` wörtlich |
| `description`, falls gesetzt, höchstens 500 Zeichen |
| `description`, falls gesetzt, beginnt mit `main_keyword` |

`description` bleibt in der Werkstatt leer. Die Pinterest-Beschreibung entsteht
später in Pinfinity, nachdem das Bild erstellt ist.

Der Keyword-Vergleich ignoriert Groß- und Kleinschreibung sowie mehrfache
Leerzeichen und Zeilenumbrüche, sonst ist er wörtlich. „Trauer bewältigen“ passt
auf „trauer  bewältigen“, aber nicht auf „Trauer zu bewältigen“.

**Regeln, die du selbst einhältst:**

- `status` nie selbst setzen. `create_pin_template` legt immer `draft` an,
  `answer_revision_request` setzt zurück auf `draft`, `update_pin_template` lässt
  den Status unberührt.
- Freigegebene oder archivierte Vorlagen nie ändern. `update_pin_template` lehnt
  das ab.
- `design` ist ein Objekt, alle Schlüssel optional:
  `{"name": "", "layout": "", "image_position": "", "fonts": [""], "scroll_stopper": "", "colors": ["#rrggbb"]}`
- `longtails`, `search_phrases`, `quality_check` sind Listen von Texten.

### Schritt C: Änderungswünsche abarbeiten

1. Für die Vorlagen des Artikels prüfen, welche im Status `needs_revision` sind
   (`list_pin_templates`). Für jede solche Vorlage mit
   `list_pin_template_revisions` die Überarbeitungswünsche lesen (neueste zuerst).
2. Die Vorlage nach dem neuesten Feedback überarbeiten. Feedback kann sich auch
   nur auf ein Feld beziehen — die übrigen Felder übernimmst du dann unverändert
   (hole den aktuellen Stand mit `get_pin_template`).
3. `answer_revision_request` aufrufen (`template_id` plus die geänderten Felder).
   Das Tool macht in einem Schritt:
   - den alten Stand als `previous_snapshot` des Überarbeitungswunsches sichern,
   - die Vorlage mit dem neuen Stand überschreiben,
   - den Status zurück auf `draft` setzen.
4. Lehnt `answer_revision_request` ab (etwa „kein offener Überarbeitungswunsch,
   Status …“), war die Vorlage nicht mehr `needs_revision` (zum Beispiel inzwischen
   freigegeben). Dann `list_pin_templates` neu lesen, nicht raten.

Die Position ändert sich bei einer Überarbeitung nie.

### Schritt D: Selbstkontrolle nach jedem Lauf

1. Für jeden bearbeiteten Artikel `list_pin_templates` lesen. Erwartet: 30
   Vorlagen, keine mehr im Status `needs_revision`, die du in diesem Lauf
   bearbeitet hast.
2. Kurz berichten: welche Artikel, wie viele Vorlagen neu, aktualisiert,
   übersprungen, welche Änderungswünsche erledigt, welche Fehler offen.

## 4. Fehler und was sie bedeuten

Die Tools antworten mit verständlichen deutschen Meldungen. Die häufigsten:

| Meldung (Auszug) | Bedeutung | Was tun |
|---|---|---|
| `Position muss zwischen 1 und 30 liegen.` | `position` außerhalb 1–30 | Position korrigieren |
| `Das main_keyword muss wörtlich im overlay vorkommen.` | Overlay fehlt oder enthält das Keyword nicht wörtlich | Overlay oder Keyword anpassen |
| `Die Beschreibung muss mit dem main_keyword beginnen.` | Beschreibung beginnt nicht mit dem Keyword | Beschreibung mit dem Keyword beginnen lassen |
| `Beschreibung darf höchstens 500 Zeichen lang sein.` | Beschreibung über 500 Zeichen | Kürzen |
| `Die Vorlage konnte nicht angelegt werden (Position belegt oder Write-Contract verletzt).` | Position schon belegt oder Pflichtfeld fehlt | `list_pin_templates` lesen, Position/Felder prüfen |
| `Vorlagen im Status … können nicht geändert werden (nur draft/needs_revision).` | Vorlage ist `approved`/`archived` | Position auslassen. Nie umgehen |
| `Es liegt kein offener Überarbeitungswunsch vor (Status …).` | Vorlage ist nicht mehr `needs_revision` | `list_pin_templates` neu lesen |
| `Pin-Vorlage nicht gefunden oder kein Zugriff.` | ID falsch oder außerhalb deines Mandanten | ID prüfen, Projekt/Artikel über `list_articles` gegenprüfen |

Bei einem Fehler wurde nichts geschrieben. Korrigiert neu senden ist sicher.
